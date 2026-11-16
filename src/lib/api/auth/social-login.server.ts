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
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { getAuth, updateAuth } from '@/middlewares/auth.server';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { getErrorMessage, isAbsoluteURL } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { createApiClients } from '@/lib/api-clients.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrlFromContext } from '@/lib/url.server';
import { mergeBasket } from '@/lib/api/basket.server';
import {
    appendWishlistMergeFlag,
    captureGuestWishlistSnapshot,
    mergeWishlist,
    type WishlistMergeResult,
} from '@/lib/api/wishlist.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { trackingConsentToBoolean } from '@/types/tracking-consent';
import { getLogger } from '@/lib/logger.server';
import { completeRegisteredLogin } from '@/lib/api/auth/complete-registered-login.server';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { commerceContextRecoveryResponse } from '@/lib/auth/commerce-context-recovery.server';
import { routes } from '@/route-paths';

export interface AuthorizeIDPParams {
    hint: string;
    redirectURI?: string;
    usid?: string;
    redirectPath?: string;
}

export interface LoginIDPUserParams {
    code: string;
    redirectURI: string;
    usid?: string;
}

export const authorizeIDP = async (
    context: ActionFunctionArgs['context'],
    parameters: AuthorizeIDPParams
): Promise<{
    success: boolean;
    error?: string;
    redirectUrl?: string;
}> => {
    const logger = getLogger(context);
    logger.debug('SocialLogin: authorizing IDP');

    if (!parameters.redirectURI) {
        logger.error('SocialLogin: redirectURI is required for authorization');
        return { success: false, error: 'redirectURI is required for social login authorization' };
    }

    try {
        const session = getAuth(context);
        const clients = createApiClients(context);

        const redirectUri = parameters.redirectURI;
        const usid = parameters.usid || session.usid;

        const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
            hint: parameters.hint || '',
            redirectUri,
            ...(usid && { usid }),
        });

        // Store the code verifier in the session for later use
        updateAuth(context, (current) => ({
            ...current,
            codeVerifier,
        }));

        logger.info('SocialLogin: authorization URL generated', { hint: parameters.hint });
        return {
            success: true,
            redirectUrl: url,
        };
    } catch (error) {
        logger.error('SocialLogin: authorization failed', { error });
        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
};

export const loginIDPUser = async (
    context: ActionFunctionArgs['context'],
    parameters: LoginIDPUserParams
): Promise<{
    success: boolean;
    error?: string;
}> => {
    const { t } = getTranslation(context);
    const logger = getLogger(context);
    logger.debug('SocialLogin: IDP login starting');

    try {
        const session = getAuth(context);
        const clients = createApiClients(context);
        const codeVerifier = session.codeVerifier;
        const code = parameters.code;
        const usid = parameters.usid || session.usid;

        if (!codeVerifier) {
            logger.error('SocialLogin: code verifier missing from session');
            throw new Error(t('errors:codeVerifierMissing'));
        }

        // Get tracking consent from auth context (populated from cookies by middleware)
        // This ensures existing tracking preference from guest session propagates to registered user session
        // Only process tracking consent if the feature is enabled in config
        // SessionData.trackingConsent uses the TrackingConsent enum, convert to boolean for SLAS API
        let dnt: boolean | undefined;
        if (isTrackingConsentEnabled(context)) {
            try {
                const authData = getAuth(context);
                if (authData.trackingConsent) {
                    dnt = trackingConsentToBoolean(authData.trackingConsent);
                }
            } catch (error) {
                logger.warn('SocialLogin: failed to get tracking consent from auth context', { error });
                // If getAuth fails (e.g., middleware not initialized), dnt remains undefined
            }
        }

        // SDK automatically extracts dwsid from Set-Cookie header
        await completeRegisteredLogin(context, () =>
            clients.auth.social.exchangeCode({
                code,
                codeVerifier,
                redirectUri: parameters.redirectURI,
                ...(usid && { usid: String(usid) }),
                ...(dnt !== undefined && { dnt }),
            })
        );

        logger.info('SocialLogin: IDP login succeeded');
        return {
            success: true,
        };
    } catch (error) {
        if (error instanceof CommerceContextError) throw error;
        logger.error('SocialLogin: code exchange failed', { error });
        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
};

export async function handleSocialLoginLanding({ request, context }: LoaderFunctionArgs): Promise<Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);

    try {
        const config = getConfig(context);
        const url = new URL(request.url);

        // SLAS may send different parameter names than direct OAuth
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const usid = url.searchParams.get('usid');
        const redirectUrl = url.searchParams.get('redirectUrl');

        // Handle error from social provider
        if (error) {
            logger.error('SocialLogin: provider returned error', { error });
            const errorMessage = t('socialCallback:socialError');
            return redirect(`${routes.login}?error=${encodeURIComponent(errorMessage)}`);
        }

        // Handle successful authorization with code
        if (code) {
            const callbackUri = config.features.socialLogin.callbackUri;
            const redirectURI = isAbsoluteURL(callbackUri)
                ? callbackUri
                : `${getAppOrigin(context)}${buildUrlFromContext(callbackUri, context)}`;

            // Snapshot the guest wishlist BEFORE the SLAS swap; the registered token can't authorize a read against the guest customerId.
            const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

            const result = await loginIDPUser(context, {
                code,
                usid: usid || undefined,
                redirectURI,
            });

            if (result.success) {
                logger.info('SocialLogin: login succeeded');
                // Login successful - merge basket on server before redirecting
                try {
                    await mergeBasket(context);
                } catch (err) {
                    if (err instanceof CommerceContextError) throw err;
                    logger.error('SocialLogin: basket merge failed', { error: err });
                }

                let wishlistMergeResult: WishlistMergeResult | null = null;
                if (guestWishlistSnapshot) {
                    try {
                        wishlistMergeResult = await mergeWishlist(context, guestWishlistSnapshot);
                    } catch (err) {
                        logger.error('SocialLogin: wishlist merge failed', { error: err });
                    }
                }

                // Redirect to redirectURL if provided, otherwise redirect to home
                const redirectTo = redirectUrl ? decodeURIComponent(redirectUrl) : '/';
                if (wishlistMergeResult) {
                    const { url: finalUrl, setCookie } = appendWishlistMergeFlag(
                        context,
                        redirectTo,
                        wishlistMergeResult
                    );
                    return redirect(finalUrl, { headers: { 'Set-Cookie': setCookie } });
                }
                return redirect(redirectTo);
            } else {
                logger.error('SocialLogin: login failed', { error: result.error });
                const errorMessage = t('errors:genericTryAgain');
                return redirect(`${routes.login}?error=${encodeURIComponent(errorMessage)}`);
            }
        } else {
            logger.error('SocialLogin: missing authorization code');
            const errorMessage = t('errors:genericTryAgain');
            return redirect(`${routes.login}?error=${encodeURIComponent(errorMessage)}`);
        }
    } catch (error) {
        // oxlint-disable-next-line typescript/only-throw-error -- A document callback must render the router error boundary.
        if (error instanceof CommerceContextError) throw commerceContextRecoveryResponse(error, context);
        logger.error('SocialLogin: landing handler failed', { error });
        const errorMessage = t('errors:genericTryAgain');
        return redirect(`${routes.login}?error=${encodeURIComponent(errorMessage)}`);
    }
}
