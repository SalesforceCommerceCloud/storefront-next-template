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
import type { Route } from './+types/action.initiate-checkout-registration';
import { data } from 'react-router';
import { createApiClients } from '@/lib/api-clients.server';
import { getAuth } from '@/middlewares/auth.server';
import { getLocale } from '@salesforce/storefront-next-runtime/i18n';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { trackingConsentToBoolean } from '@/types/tracking-consent';
import { getBasket } from '@/middlewares/basket.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { extractErrorMessage } from '@/lib/auth/error-handler';
import { ApiError } from '@/scapi';
import { getLogger } from '@/lib/logger.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { enforceTurnstile, resolveVerificationMode } from '@/lib/turnstile/enforce.server';
import { createCookie, getCookieConfig, getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import { COOKIE_TURNSTILE_VERIFIED, TURNSTILE_VERIFIED_MAX_AGE } from '@/lib/turnstile/constants';

/** Response shape returned by the initiate-checkout-registration action. */
export type InitiateRegistrationResponse = {
    success: boolean;
    error?: ActionError;
    email?: string;
    unavailable?: boolean;
};

/**
 * Server action to initiate passwordless registration during checkout
 * This triggers the OTP email to be sent for account creation with email verification
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<InitiateRegistrationResponse>>> {
    const logger = getLogger(context);
    const locale = getLocale(context);

    logger.debug('InitiateCheckoutRegistration: starting');

    if (request.method !== 'POST') {
        return data(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.METHOD_NOT_ALLOWED,
                    message: `Expected POST, got ${request.method}`,
                }),
            },
            { status: 405 }
        );
    }

    const tvCookie = createCookie<string>(
        COOKIE_TURNSTILE_VERIFIED,
        getCookieConfig({ httpOnly: true, maxAge: TURNSTILE_VERIFIED_MAX_AGE }, context),
        context
    );
    let shouldSetCookie = false;
    // HMAC-bound cookie value from a fresh siteverify call. Null when the request was
    // already short-circuited by a valid cookie or when HMAC derivation was unavailable.
    // Falls back to '1' in respondWithCookie so the attestation is always recorded.
    let freshCookieValue: string | null = null;

    /**
     * Attach the cc-tv cookie to every response that originated from a
     * freshly-verified Turnstile pass on this request, regardless of whether
     * the downstream SCAPI call succeeded. The cookie attests "this client
     * cleared the Turnstile gate" - nothing more. Conditioning it on SCAPI
     * outcome would force a fresh challenge on legitimate shoppers for events
     * (typed unrecognized email, transient SLAS blip) that have nothing to do
     * with bot detection.
     *
     * shouldSetCookie is true only when enforceTurnstile performed a fresh
     * siteverify call and returned a non-null cookieValue. When the request
     * was already covered by a valid HMAC-bound cookie, enforceTurnstile
     * short-circuits and returns cookieValue: null - nothing new to record.
     */
    const respondWithCookie = async <T>(body: T, init?: ResponseInit): Promise<ReturnType<typeof data<T>>> => {
        if (!shouldSetCookie) return data(body, init);
        const setCookieHeader = await tvCookie.serialize(freshCookieValue ?? '1');
        const existingHeaders = init?.headers;
        const mergedHeaders =
            existingHeaders instanceof Headers
                ? Object.fromEntries(existingHeaders.entries())
                : { ...((existingHeaders as Record<string, string> | undefined) ?? {}) };
        mergedHeaders['Set-Cookie'] = setCookieHeader;
        return data(body, { ...init, headers: mergedHeaders });
    };

    try {
        const formData = await request.formData();
        const email = formData.get('email')?.toString();
        const turnstileToken = formData.get('turnstileToken')?.toString();

        const appConfig = getConfig(context);

        const turnstileVerificationEnabled =
            appConfig.security?.turnstile?.enabled && resolveVerificationMode(appConfig) !== 'disabled';

        if (turnstileVerificationEnabled) {
            // Always consult enforceTurnstile. The short-circuit logic lives inside it:
            // when an HMAC-bound cookie is present and matches the current email + site,
            // enforceTurnstile returns { allowed: true, cookieValue: null } immediately.
            // Doing the pre-check here would bypass the HMAC binding and allow a cookie
            // issued for one email to short-circuit requests for a different email.
            const { allowed, cookieValue } = await enforceTurnstile({
                request,
                config: appConfig,
                turnstileToken,
                logger,
                actionName: 'initiate-checkout-registration',
                email,
                turnstileCookieName: getCookieNameWithSiteId(COOKIE_TURNSTILE_VERIFIED, context),
            });
            if (!allowed) {
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.NOT_AUTHORIZED,
                            message: 'Turnstile verification failed',
                        }),
                    },
                    { status: 403 }
                );
            }
            // cookieValue is non-null only when enforceTurnstile ran a fresh siteverify.
            // On cookie short-circuit it returns null - no new cookie to write.
            freshCookieValue = cookieValue;
            shouldSetCookie = cookieValue !== null;
        }

        if (!email) {
            logger.debug('InitiateCheckoutRegistration: no email in form, checking basket');
            // Try to get email from basket
            const basketResource = await getBasket(context);
            const basketEmail = basketResource.current?.customerInfo?.email;

            if (!basketEmail) {
                logger.warn('InitiateCheckoutRegistration: email not found in form or basket');
                return respondWithCookie(
                    {
                        success: false,
                        error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'Email is required' }),
                    },
                    { status: 400 }
                );
            }

            // Extract customer info from basket for registration
            // firstName/lastName are stored in shipping address, not customerInfo
            const shippingAddress = basketResource.current?.shipments?.[0]?.shippingAddress;
            const firstName = shippingAddress?.firstName;
            const lastName = shippingAddress?.lastName;

            // Validate required fields before creating API clients or sending OTP
            if (!firstName || !lastName) {
                logger.warn('InitiateCheckoutRegistration: customer name missing', {
                    hasFirstName: !!firstName,
                    hasLastName: !!lastName,
                });
                return respondWithCookie(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.REQUIRED_FIELD,
                            message: 'First name and last name are required for account creation',
                        }),
                    },
                    { status: 400 }
                );
            }

            const session = getAuth(context);
            const clients = createApiClients(context);

            const requestBody: Record<string, string> = {
                user_id: basketEmail,
                mode: 'otp',
            };

            // Add customer info if available
            if (firstName) requestBody.first_name = firstName;
            if (lastName) requestBody.last_name = lastName;
            if (basketEmail) requestBody.email = basketEmail;

            let dnt: boolean | undefined;
            if (isTrackingConsentEnabled(context) && session.trackingConsent) {
                dnt = trackingConsentToBoolean(session.trackingConsent);
            }

            logger.debug('InitiateCheckoutRegistration: authorizing passwordless with basket email', {
                hasEmail: Boolean(basketEmail),
                hasUsid: !!session.usid,
                dnt,
            });

            await clients.auth.passwordless.authorize({
                userId: basketEmail,
                mode: 'email',
                ...(locale && { locale }),
                usid: session.usid ? String(session.usid) : undefined,
                registerCustomer: true,
                firstName,
                lastName,
                email: basketEmail,
                ...(dnt !== undefined && { dnt }),
            });

            logger.info('InitiateCheckoutRegistration: succeeded with basket email');

            return respondWithCookie({ success: true, email: basketEmail });
        }

        logger.debug('InitiateCheckoutRegistration: email provided in form');

        // Email was provided in form data - get customer info from basket
        const basketResource = await getBasket(context);

        // firstName/lastName are stored in shipping address, not customerInfo
        const shippingAddress = basketResource.current?.shipments?.[0]?.shippingAddress;
        const firstName = shippingAddress?.firstName;
        const lastName = shippingAddress?.lastName;

        // Validate required fields
        if (!firstName || !lastName) {
            logger.warn('InitiateCheckoutRegistration: customer name missing', {
                hasFirstName: !!firstName,
                hasLastName: !!lastName,
            });
            return respondWithCookie(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'First name and last name are required for account creation',
                    }),
                },
                { status: 400 }
            );
        }

        const session = getAuth(context);
        const clients = createApiClients(context);

        let dnt: boolean | undefined;
        if (isTrackingConsentEnabled(context) && session.trackingConsent) {
            dnt = trackingConsentToBoolean(session.trackingConsent);
        }

        logger.debug('InitiateCheckoutRegistration: authorizing passwordless with form email', {
            hasEmail: Boolean(email),
            hasUsid: !!session.usid,
            dnt,
        });

        await clients.auth.passwordless.authorize({
            userId: email,
            mode: 'email',
            ...(locale && { locale }),
            usid: session.usid ? String(session.usid) : undefined,
            registerCustomer: true,
            firstName,
            lastName,
            email,
            ...(dnt !== undefined && { dnt }),
        });

        logger.info('InitiateCheckoutRegistration: succeeded with form email');

        return respondWithCookie({ success: true, email });
    } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
            const errorMessage = extractErrorMessage(error);
            if (/email not verified/i.test(errorMessage)) {
                logger.info('InitiateCheckoutRegistration: email not verified, feature unavailable');
                return respondWithCookie({ success: false, unavailable: true });
            }

            logger.error('InitiateCheckoutRegistration: bad request', { error: errorMessage });
            return respondWithCookie(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.OPERATION_FAILED, message: errorMessage }),
                },
                { status: 400 }
            );
        }

        logger.error('InitiateCheckoutRegistration: failed', { error });
        const errorMessage = extractErrorMessage(error);
        return respondWithCookie(
            {
                success: false,
                error: createActionError({ code: ErrorCode.OPERATION_FAILED, message: errorMessage }),
            },
            { status: 500 }
        );
    }
}
