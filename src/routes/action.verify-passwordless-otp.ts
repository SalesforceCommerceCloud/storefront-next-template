/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { Route } from './+types/action.verify-passwordless-otp';
import type { ShopperLogin } from '@/scapi';
import { data } from 'react-router';
import { createApiClients } from '@/lib/api-clients.server';
import { getAuth, updateAuth } from '@/middlewares/auth.server';
import { calculateBasket, getBasketCurrency, mergeBasket } from '@/lib/api/basket.server';
import { captureGuestWishlistSnapshot, mergeWishlist } from '@/lib/api/wishlist.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { trackingConsentToBoolean } from '@/types/tracking-consent';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { extractErrorMessage } from '@/lib/auth/error-handler';
import { getLogger } from '@/lib/logger.server';
import { getCustomerProfileForCheckout } from '@/lib/api/customer.server';

/** Response shape returned by the verify-passwordless-otp action. */
export type VerifyPasswordlessOtpResponse = {
    success: boolean;
    error?: ActionError;
    message?: string;
    tokenResponse?: ShopperLogin.schemas['TokenResponse'];
    /** `'success'` when items merged with no failures, `'partial'` when some items failed, otherwise omitted. */
    wishlistMerge?: 'success' | 'partial';
};

/**
 * Server action to verify OTP code and authenticate the user
 * This is called when the user submits the OTP code from the modal
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<VerifyPasswordlessOtpResponse>>> {
    const logger = getLogger(context);

    try {
        const formData = await request.formData();
        const otpCode = formData.get('otpCode')?.toString();
        const email = formData.get('email')?.toString();
        const isRegistration = formData.get('isRegistration') === 'true';

        if (!otpCode) {
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'OTP code is required' }),
                },
                { status: 400 }
            );
        }

        if (!email) {
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'Email is required' }),
                },
                { status: 400 }
            );
        }

        const clients = createApiClients(context);
        const session = getAuth(context);

        // Snapshot the guest wishlist BEFORE the SLAS swap; the registered token can't authorize a read against the guest customerId.
        const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

        let dnt: boolean | undefined;
        if (isTrackingConsentEnabled(context) && session.trackingConsent) {
            dnt = trackingConsentToBoolean(session.trackingConsent);
        }

        const tokenResponse = await clients.auth.passwordless.exchangeToken({
            pwdlessLoginToken: otpCode,
            ...(dnt !== undefined && { dnt }),
        });

        // Update auth with token response. userType, customerId, usid, and the refresh-token
        // expiry cap all derive from the access-token JWT inside updateAuth — no follow-up
        // call is needed.
        updateAuth(context, tokenResponse);

        // For registrations, mergeBasket is not needed — SLAS creates the account under the same
        // guest usid, so the basket is already owned by the new registered customer.
        if (!isRegistration) {
            let mergedBasket: Awaited<ReturnType<typeof mergeBasket>> | undefined;
            try {
                mergedBasket = await mergeBasket(context);
            } catch (error) {
                logger.error('VerifyPasswordlessOtp: basket merge failed', { error });
            }

            if (mergedBasket) {
                updateBasketResource(context, mergedBasket);
            }
        }

        // Fetch and recalculate basket to apply registered-user promotions and update totals.
        // Even if mergeBasket returned undefined, we fetch here because the guest basket
        // was transferred to the registered user and we need to retrieve it.
        try {
            const { current } = await getBasket(context);
            if (current?.basketId) {
                const currency = getBasketCurrency(context, current);
                const recalculatedBasket = await calculateBasket(context, current.basketId, currency);
                updateBasketResource(context, recalculatedBasket);
                logger.info('VerifyPasswordlessOtp: basket recalculated after auth swap', {
                    basketId: recalculatedBasket.basketId,
                    itemCount: recalculatedBasket.productItems?.length ?? 0,
                    orderTotal: recalculatedBasket.orderTotal,
                });
            } else {
                logger.warn('VerifyPasswordlessOtp: no basket found after auth swap');
            }
        } catch (error) {
            logger.error('VerifyPasswordlessOtp: basket recalculation after authentication failed', { error });
        }

        // Guest may have entered a different email at contact-info before signing in.
        // transferBasket keeps the guest email; reconcile so the order shows the signed-in customer's email.
        try {
            const authSession = getAuth(context);
            const customerId = authSession.customerId;
            if (customerId) {
                const customerProfile = await getCustomerProfileForCheckout(context, customerId);
                const customerEmail =
                    customerProfile?.customer?.email ||
                    (customerProfile?.customer?.login?.includes('@') ? customerProfile.customer.login : undefined);
                const { current: currentBasket } = await getBasket(context);
                const basketEmail = currentBasket?.customerInfo?.email;
                const basketId = currentBasket?.basketId;
                if (
                    basketId &&
                    customerEmail &&
                    basketEmail &&
                    basketEmail.toLowerCase() !== customerEmail.toLowerCase()
                ) {
                    const { data: reconciledBasket } = await clients.shopperBasketsV2.updateCustomerForBasket({
                        params: { path: { basketId } },
                        body: { email: customerEmail },
                    });
                    updateBasketResource(context, reconciledBasket);
                }
            }
        } catch (error) {
            logger.error('VerifyPasswordlessOtp: basket email reconciliation failed', { error });
        }

        let wishlistMerge: 'success' | 'partial' | undefined;
        if (guestWishlistSnapshot) {
            try {
                const merge = await mergeWishlist(context, guestWishlistSnapshot);
                if (merge.merged > 0 || merge.failed > 0) {
                    wishlistMerge = merge.failed > 0 ? 'partial' : 'success';
                }
            } catch (error) {
                logger.error('VerifyPasswordlessOtp: wishlist merge failed', { error });
            }
        }

        logger.info('VerifyPasswordlessOtp: succeeded');
        return data({
            success: true,
            message: 'Login successful',
            tokenResponse,
            ...(wishlistMerge ? { wishlistMerge } : {}),
        });
    } catch (error: unknown) {
        logger.error('VerifyPasswordlessOtp: failed', { error });
        const errorMessage = extractErrorMessage(error);
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.OPERATION_FAILED, message: errorMessage }),
            },
            { status: 500 }
        );
    }
}
