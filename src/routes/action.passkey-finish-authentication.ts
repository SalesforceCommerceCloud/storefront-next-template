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
import type { Route } from './+types/action.passkey-finish-authentication';
import type { ShopperLogin } from '@/scapi';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createApiClients } from '@/lib/api-clients.server';
import { finishPasskeyAuthentication, getAuth, updateAuth } from '@/middlewares/auth.server';
import { calculateBasket, getBasketCurrency, mergeBasket } from '@/lib/api/basket.server';
import { captureGuestWishlistSnapshot, mergeWishlist } from '@/lib/api/wishlist.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { extractErrorMessage } from '@/lib/auth/error-handler';
import { getLogger } from '@/lib/logger.server';
import { getCustomerProfileForCheckout } from '@/lib/api/customer.server';

/** Response shape returned by the passkey-finish-authentication action. */
export type PasskeyFinishAuthenticationResponse = {
    success: boolean;
    error?: ActionError;
    message?: string;
    tokenResponse?: ShopperLogin.schemas['TokenResponse'];
    /** `'success'` when items merged with no failures, `'partial'` when some items failed, otherwise omitted. */
    wishlistMerge?: 'success' | 'partial';
};

/**
 * Server action to finish WebAuthn passkey authentication (login).
 * Receives the assertion from navigator.credentials.get() as JSON (not formData).
 * Anonymous/guest endpoint — no auth gate. Merge sequence mirrors
 * action.verify-passwordless-otp.ts: guest wishlist snapshot, token swap, basket merge +
 * recalculation, basket-email reconciliation, wishlist merge.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<PasskeyFinishAuthenticationResponse>>> {
    const logger = getLogger(context);

    if (!getConfig(context).features?.passkey?.enabled) {
        throw new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Method not allowed' }),
            },
            { status: 405 }
        );
    }

    try {
        const body = (await request.json()) as { credential?: Record<string, unknown> };
        const { credential } = body;

        if (!credential) {
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'credential is required' }),
                },
                { status: 400 }
            );
        }

        const clients = createApiClients(context);

        // Snapshot the guest wishlist BEFORE the SLAS swap; the registered token can't authorize a read against the guest customerId.
        const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

        const tokenResponse = await finishPasskeyAuthentication(context, { credential });

        // Update auth with token response. userType, customerId, usid, and the refresh-token
        // expiry cap all derive from the access-token JWT inside updateAuth — no follow-up
        // call is needed.
        updateAuth(context, tokenResponse);

        let mergedBasket: Awaited<ReturnType<typeof mergeBasket>> | undefined;
        try {
            mergedBasket = await mergeBasket(context);
        } catch (error) {
            logger.error('PasskeyFinishAuthentication: basket merge failed', { error });
        }

        if (mergedBasket) {
            updateBasketResource(context, mergedBasket);
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
                logger.info('PasskeyFinishAuthentication: basket recalculated after auth swap', {
                    basketId: recalculatedBasket.basketId,
                    itemCount: recalculatedBasket.productItems?.length ?? 0,
                    orderTotal: recalculatedBasket.orderTotal,
                });
            } else {
                logger.warn('PasskeyFinishAuthentication: no basket found after auth swap');
            }
        } catch (error) {
            logger.error('PasskeyFinishAuthentication: basket recalculation after authentication failed', { error });
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
            logger.error('PasskeyFinishAuthentication: basket email reconciliation failed', { error });
        }

        let wishlistMerge: 'success' | 'partial' | undefined;
        if (guestWishlistSnapshot) {
            try {
                const merge = await mergeWishlist(context, guestWishlistSnapshot);
                if (merge.merged > 0 || merge.failed > 0) {
                    wishlistMerge = merge.failed > 0 ? 'partial' : 'success';
                }
            } catch (error) {
                logger.error('PasskeyFinishAuthentication: wishlist merge failed', { error });
            }
        }

        logger.info('PasskeyFinishAuthentication: succeeded');
        return data({
            success: true,
            message: 'Login successful',
            tokenResponse,
            ...(wishlistMerge ? { wishlistMerge } : {}),
        });
    } catch (error: unknown) {
        logger.error('PasskeyFinishAuthentication: failed', { error });
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
