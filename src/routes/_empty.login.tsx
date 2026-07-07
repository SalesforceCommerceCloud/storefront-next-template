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
import { type ReactElement, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from '@/hooks/use-navigate';
import { redirect, useActionData } from 'react-router';
import type { Route } from './+types/_empty.login';
import { Link } from '@/components/link';
import { Card } from '@/components/ui/card';
import { routes } from '@/route-paths';
import { SeoMeta } from '@/components/seo-meta';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import { useTranslation } from 'react-i18next';
import StandardLoginForm from '@/components/login/standard-login-form';
import PasswordlessLoginForm from '@/components/login/passwordless-login-form';
import OtpModal from '@/components/login/otp-modal';
import { LoginGuestWishlistBanner } from '@/components/login/login-guest-wishlist-banner';
import { SocialLoginButtons } from '@/components/buttons/social-login-buttons';
import { isAbsoluteURL, getSafeReturnUrl } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { getConfig, useConfig } from '@salesforce/storefront-next-runtime/config';
import { getLoginPreferences } from '@/lib/login-preferences.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { updateBasketResource } from '@/middlewares/basket.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { getTurnstileSiteKey, getTurnstileMode, isTurnstileEnabled } from '@/lib/turnstile/utils';

// services
import {
    getAuth,
    authorizePasswordless,
    getPasswordLessAccessToken,
    updateAuth as updateAuthServer,
} from '@/middlewares/auth.server';
import { loginRegisteredUser } from '@/lib/api/auth/standard-login.server';
import { authorizeIDP } from '@/lib/api/auth/social-login.server';
import { mergeBasket } from '@/lib/api/basket.server';
import { getCustomer } from '@/lib/api/customer.server';
import { createApiClients } from '@/lib/api-clients.server';
import {
    appendWishlistMergeFlag,
    captureGuestWishlistSnapshot,
    mergeWishlist,
    type WishlistMergeResult,
} from '@/lib/api/wishlist.server';
import { getPasswordlessErrorMessageKey, extractErrorMessage } from '@/lib/auth/error-handler';
import { getLogger } from '@/lib/logger.server';
import { enforceTurnstile } from '@/lib/turnstile/enforce.server';

type LoginActionResponse = {
    success: boolean;
    error?: string;
    showOTPForm?: boolean;
    email?: string;
};

type LoginLoaderData = {
    error?: string;
    passwordlessSent?: boolean;
    email?: string;
    mode: string;
    isPasswordlessLoginEnabled: boolean;
    isSocialLoginEnabled: boolean;
    returnUrl?: string | null;
    action?: string | null;
    actionParams?: string | null;
    showOTPForm?: boolean;
    otpLength?: number;
    pageUrl: string;
    /** Number of items in the guest wishlist (0 if guest has none, no list, or SCAPI failed). */
    guestWishlistCount: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
    const logger = getLogger(context);
    const session = getAuth(context);
    const url = new URL(request.url);
    const pageUrl = buildCanonicalUrl(url.origin, url.pathname, url.search);
    const returnUrl = getSafeReturnUrl(url.searchParams.get('returnUrl'));

    // If user is already logged in as registered user, redirect to returnUrl or home
    const { accessToken, accessTokenExpiry, userType, customerId } = session;
    if (
        accessToken &&
        typeof accessTokenExpiry === 'number' &&
        accessTokenExpiry >= Date.now() &&
        userType === 'registered' &&
        customerId
    ) {
        logger.debug('Login: already authenticated, redirecting');
        return redirect(buildUrlFromContext(returnUrl || routes.home, context));
    }

    const passwordlessSent = url.searchParams.get('passwordless') === 'sent';
    const email = url.searchParams.get('email');

    const tokenFromUrl = url.searchParams.get('token');
    const legacyOtpCode = url.searchParams.get('otpCode');
    const token = tokenFromUrl ?? legacyOtpCode;
    const pendingAction = url.searchParams.get('action');
    const actionParams = url.searchParams.get('actionParams');
    const error = url.searchParams.get('error');

    const config = getConfig(context);
    // To enable passwordless login, the "Enable Email Verification" site preference under "Storefront Login Preferences" must be enabled.
    const { emailVerificationEnabled } = await getLoginPreferences(context);
    const isPasswordlessLoginEnabled = Boolean(emailVerificationEnabled);
    const isSocialLoginEnabled = Boolean(config.features.socialLogin?.enabled);
    // Ignore `?mode` when passwordless is disabled - force standard password login so the
    // passwordless form (and its Turnstile widget) cannot render for a flow that's turned off.
    const mode = isPasswordlessLoginEnabled ? url.searchParams.get('mode') || 'passwordless' : 'password';
    // Ignore `?otp=true` when passwordless is disabled - suppresses the OTP modal and its
    // Turnstile widget when the email-verification site permission is off.
    const showOTPForm = isPasswordlessLoginEnabled && url.searchParams.get('otp') === 'true';

    // Auto-verify OTP token if both email and token are provided in URL
    if (email && token) {
        // Snapshot the guest wishlist BEFORE the SLAS swap; the registered token can't authorize a read against the guest customerId.
        const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

        try {
            const tokenResponse = await getPasswordLessAccessToken(context, token);

            // Update session with auth data. userType, customerId, usid, and the refresh-token
            // expiry cap all derive from the access-token JWT inside updateAuth — no follow-up
            // call is needed.
            updateAuthServer(context, tokenResponse);

            // Merge guest basket with registered user basket
            try {
                await mergeBasket(context);
            } catch (basketError) {
                logger.error('Login: basket merge failed during passwordless login', { error: basketError });
            }

            let wishlistMergeResult: WishlistMergeResult | null = null;
            if (guestWishlistSnapshot) {
                try {
                    wishlistMergeResult = await mergeWishlist(context, guestWishlistSnapshot);
                } catch (wishlistError) {
                    logger.error('Login: wishlist merge failed during passwordless login', { error: wishlistError });
                }
            }

            logger.info('Login: passwordless verification succeeded');
            const target = buildUrlFromContext(returnUrl || routes.home, context);
            if (wishlistMergeResult) {
                const { url: redirectUrl, setCookie } = appendWishlistMergeFlag(context, target, wishlistMergeResult);
                return redirect(redirectUrl, { headers: { 'Set-Cookie': setCookie } });
            }
            return redirect(target);
        } catch (verifyError) {
            // Auto-verification failed - show error with OTP form
            logger.warn('Login: passwordless auto-verification failed');
            const errorMessage = extractErrorMessage(verifyError);
            const errorKey = getPasswordlessErrorMessageKey(errorMessage);
            const { t } = getTranslation(context);

            return {
                error: t(errorKey),
                showOTPForm: isPasswordlessLoginEnabled,
                email,
                mode,
                isPasswordlessLoginEnabled,
                isSocialLoginEnabled,
                returnUrl,
                action: pendingAction,
                actionParams,
                otpLength: config.auth.otpLength,
                pageUrl,
                guestWishlistCount: guestWishlistSnapshot?.items.length ?? 0,
            };
        }
    }

    // Drives the guest-saved-items banner above the form. Helper gates on guest userType
    // and swallows SCAPI errors — a missing snapshot must not block sign-in.
    const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);

    const { t } = getTranslation(context);
    const resolvedError = error === 'session_expired' ? t('errors:api.unauthorized') : error;

    return {
        error: resolvedError,
        passwordlessSent,
        showOTPForm,
        email,
        mode,
        isPasswordlessLoginEnabled,
        isSocialLoginEnabled,
        returnUrl,
        action: pendingAction,
        actionParams,
        otpLength: config.auth.otpLength,
        pageUrl,
        guestWishlistCount: guestWishlistSnapshot?.items.length ?? 0,
    };
}

/**
 * Server action for authentication. Login is handled server-side for security (httpOnly cookies,
 * PKCE code verifier storage) and integration with SLAS.
 *
 * Returns `LoginActionResponse | Response` because the action has two distinct outcomes:
 * - `Response` (redirect) — successful login or social IDP authorization. React Router intercepts
 *   the redirect before it reaches the component, so `useActionData()` never sees it.
 * - `LoginActionResponse` — errors or intermediate states (e.g., OTP form). This data is
 *   serialized and delivered to the component via `useActionData()` for rendering.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<LoginActionResponse | Response> {
    const logger = getLogger(context);
    const config = getConfig(context);
    const { t } = getTranslation(context);
    const genericError = t('errors:genericTryAgain');

    try {
        const formData = await request.formData();

        const email = formData.get('email')?.toString();
        const password = formData.get('password')?.toString();
        const loginMode = formData.get('loginMode')?.toString();
        const provider = formData.get('provider')?.toString();
        const redirectPath = formData.get('redirectPath')?.toString();
        const skipUsid = formData.get('skipUsid') === 'true';
        const isSocialLoginEnabled = Boolean(config.features.socialLogin?.enabled);

        if (loginMode === 'social') {
            // Social login flow
            if (!provider || !isSocialLoginEnabled) {
                return { success: false, error: genericError };
            }
            const socialCallback = config.features.socialLogin.callbackUri;
            const socialLoginRedirectURI = isAbsoluteURL(socialCallback)
                ? socialCallback
                : `${getAppOrigin(context)}${buildUrlFromContext(socialCallback, context)}`;
            const finalRedirectURI = redirectPath
                ? `${socialLoginRedirectURI}?redirectUrl=${redirectPath}`
                : socialLoginRedirectURI;
            const result = await authorizeIDP(context, {
                hint: provider,
                redirectURI: finalRedirectURI,
            });
            if (result.success && result.redirectUrl) {
                logger.info('Login: social redirect initiated', { provider });
                return redirect(result.redirectUrl);
            }
            logger.warn('Login: social authorization failed', { provider });
            return { success: false, error: genericError };
        } else if (loginMode === 'passwordless') {
            // Passwordless login flow
            if (!email) {
                return { success: false, error: genericError };
            }

            const turnstileToken = formData.get('turnstileToken')?.toString();
            const allowed = await enforceTurnstile({
                request,
                config,
                turnstileToken,
                logger,
                actionName: 'login-passwordless',
                email,
            });
            if (!allowed) {
                return { success: false, error: t('errors:api.forbidden') };
            }

            // Build redirectPath from returnUrl, action, and actionParams for passwordless flow
            const url = new URL(request.url);
            const returnUrl = getSafeReturnUrl(url.searchParams.get('returnUrl'));
            const pendingAction = url.searchParams.get('action');
            const actionParams = url.searchParams.get('actionParams');

            // Construct redirectPath with all params encoded
            let finalRedirectPath = redirectPath || returnUrl || routes.home;
            if (returnUrl && (pendingAction || actionParams)) {
                const redirectParams = new URLSearchParams();
                if (pendingAction) {
                    redirectParams.set('action', pendingAction);
                }
                if (actionParams) {
                    redirectParams.set('actionParams', actionParams);
                }
                const queryString = redirectParams.toString();
                finalRedirectPath = queryString ? `${returnUrl}?${queryString}` : returnUrl;
            }

            try {
                await authorizePasswordless(context, { userid: email, redirectPath: finalRedirectPath });
                logger.info('Login: passwordless code sent');
                // Passwordless authorization sent - redirect to login page with OTP form
                const params = new URLSearchParams();
                params.set('otp', 'true');
                params.set('email', email);
                if (returnUrl) {
                    params.set('returnUrl', returnUrl);
                }
                if (pendingAction) {
                    params.set('action', pendingAction);
                }
                if (actionParams) {
                    params.set('actionParams', actionParams);
                }
                return { success: true, showOTPForm: true, email };
            } catch (error) {
                const errorMessage = extractErrorMessage(error);
                const errorKey = getPasswordlessErrorMessageKey(errorMessage);

                return { success: false, error: t(errorKey) };
            }
        } else {
            // Standard password login flow (default case - handles 'password' mode or undefined/null)
            if (!email || !password) {
                return { success: false, error: genericError };
            }
            // Snapshot the guest wishlist BEFORE the SLAS swap; the registered token can't authorize a read against the guest customerId.
            const guestWishlistSnapshot = await captureGuestWishlistSnapshot(context);
            const result = await loginRegisteredUser(context, { email, password }, { skipUsid });
            if (!result.success) {
                logger.warn('Login: standard login failed');
                return { success: false, error: genericError };
            }

            logger.info('Login: standard login succeeded');
            // Login successful - merge basket on server before redirecting
            let mergedBasket: Awaited<ReturnType<typeof mergeBasket>> | undefined;
            try {
                mergedBasket = await mergeBasket(context);
                if (mergedBasket) {
                    updateBasketResource(context, mergedBasket);
                }
            } catch (error) {
                logger.error('Login: basket merge failed', { error });
            }

            // Guest may have entered a different email at checkout contact-info before signing in.
            // transferBasket keeps the guest email; reconcile so the order shows the signed-in customer's email.
            // Skipped when no active basket exists (login is used outside checkout too).
            if (mergedBasket?.basketId) {
                try {
                    const auth = getAuth(context);
                    if (auth.customerId) {
                        const customer = await getCustomer(context, auth.customerId);
                        const customerEmail =
                            customer.email || (customer.login?.includes('@') ? customer.login : undefined);
                        const basketEmail = mergedBasket.customerInfo?.email;
                        if (customerEmail && basketEmail && basketEmail.toLowerCase() !== customerEmail.toLowerCase()) {
                            const clients = createApiClients(context);
                            const { data: reconciledBasket } = await clients.shopperBasketsV2.updateCustomerForBasket({
                                params: { path: { basketId: mergedBasket.basketId } },
                                body: { email: customerEmail },
                            });
                            updateBasketResource(context, reconciledBasket);
                        }
                    }
                } catch (reconcileError) {
                    logger.error('Login: basket email reconciliation failed', { error: reconcileError });
                }
            }

            let wishlistMergeResult: WishlistMergeResult | null = null;
            if (guestWishlistSnapshot) {
                try {
                    wishlistMergeResult = await mergeWishlist(context, guestWishlistSnapshot);
                } catch (wishlistError) {
                    logger.error('Login: wishlist merge failed', { error: wishlistError });
                }
            }

            // Helper to prepare redirect with wishlist merge cookie
            const prepareRedirect = (target: string) => {
                if (wishlistMergeResult) {
                    const { url, setCookie } = appendWishlistMergeFlag(context, target, wishlistMergeResult);
                    return redirect(url, { headers: { 'Set-Cookie': setCookie } });
                }
                return redirect(target);
            };

            // Login successful - redirect to returnUrl if provided, otherwise home
            // Try to get returnUrl from formData first (in case it was submitted as hidden input)
            // Otherwise fall back to URL query params
            const returnUrlFromForm = formData.get('returnUrl')?.toString()?.trim();
            const returnUrlFromUrl = new URL(request.url).searchParams.get('returnUrl');
            const returnUrl = getSafeReturnUrl(returnUrlFromForm || returnUrlFromUrl);

            // Get action and actionParams to preserve in redirect URL
            const actionFromForm = formData.get('action')?.toString();
            const actionParamsFromForm = formData.get('actionParams')?.toString();
            const actionFromUrl = new URL(request.url).searchParams.get('action');
            const actionParamsFromUrl = new URL(request.url).searchParams.get('actionParams');
            const pendingAction = actionFromForm || actionFromUrl;
            const actionParams = actionParamsFromForm || actionParamsFromUrl;

            // Redirect to returnUrl (with preserved action params) or home.
            // `returnUrl` is guaranteed relative by `getSafeReturnUrl` above, so we mutate
            // its query string in place rather than constructing a `URL` object — that
            // keeps the redirect target relative end-to-end and removes any temptation
            // for a future refactor to forward an absolute URL past the open-redirect
            // guard.
            if (returnUrl) {
                if (pendingAction || actionParams) {
                    const [pathAndQuery, fragment] = returnUrl.split('#');
                    const [pathname, existingQuery] = pathAndQuery.split('?');
                    const params = new URLSearchParams(existingQuery);
                    if (pendingAction) params.set('action', pendingAction);
                    if (actionParams) params.set('actionParams', actionParams);
                    const queryString = params.toString();
                    const target = pathname + (queryString ? `?${queryString}` : '') + (fragment ? `#${fragment}` : '');
                    return prepareRedirect(buildUrlFromContext(target, context));
                }
                return prepareRedirect(buildUrlFromContext(returnUrl, context));
            }

            return prepareRedirect(buildUrlFromContext(routes.home, context));
        }
    } catch {
        return { success: false, error: genericError };
    }
}

export default function Login({ loaderData }: { loaderData: LoginLoaderData }): ReactElement {
    const { t } = useTranslation('login');
    const actionData = useActionData<typeof action>();
    const navigate = useNavigate();
    const config = useConfig();

    const {
        error: loaderError,
        passwordlessSent,
        email,
        mode,
        isPasswordlessLoginEnabled,
        isSocialLoginEnabled,
        returnUrl,
        action: pendingActionName,
        actionParams,
        showOTPForm,
        otpLength,
        pageUrl,
        guestWishlistCount,
    } = loaderData;

    const [resendTurnstileToken, setResendTurnstileToken] = useState<string | null>(null);
    const resendTurnstileResetRef = useRef<(() => void) | null>(null);

    const turnstileEnabled = config ? isTurnstileEnabled(config) : false;
    const turnstileMode = config ? getTurnstileMode(config) : 'managed';
    const turnstileSiteKey = useMemo(() => {
        if (!config || !turnstileEnabled) return null;
        if (typeof window !== 'undefined') {
            const baseUrl = `${window.location.protocol}//${window.location.host}`;
            return getTurnstileSiteKey(config, baseUrl);
        }
        return null;
    }, [config, turnstileEnabled]);

    const handleResendTurnstileSuccess = useCallback((token: string) => {
        setResendTurnstileToken(token);
    }, []);
    const handleResendTurnstileError = useCallback(() => {
        setResendTurnstileToken(null);
    }, []);
    const handleResendTurnstileExpire = useCallback(() => {
        setResendTurnstileToken(null);
    }, []);
    // Prefer actionData error (from form submission) over loaderData error (from URL params)
    const error = actionData?.error || loaderError || undefined;

    // Check if we should show OTP form from actionData (after email submission) or loaderData (from URL)
    const shouldShowOTPForm = actionData?.showOTPForm || showOTPForm;
    const showOTPModal = Boolean(shouldShowOTPForm);
    const otpEmail = actionData?.email || email;

    // Show passwordless success state
    if (passwordlessSent && email) {
        return (
            <div
                data-section="auth"
                className="min-h-screen flex items-center justify-center bg-background py-12 section-container">
                <div className="max-w-md w-full space-y-8">
                    <Card className="p-8">
                        <div className="text-center space-y-4">
                            <h2 className="text-2xl font-semibold">{t('checkEmailTitle')}</h2>
                            <p className="text-sm text-muted-foreground">{t('checkEmailDescription', { email })}</p>
                            <Link
                                to={routes.login}
                                className="inline-flex items-center text-sm text-primary hover:text-primary/80">
                                {t('backToLogin')}
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    // Decide which form to render based on mode
    const renderForm = () => {
        if (mode === 'passwordless') {
            return (
                <PasswordlessLoginForm
                    error={error}
                    isPasswordlessEnabled={isPasswordlessLoginEnabled}
                    redirectPath={returnUrl || undefined}
                />
            );
        }
        return (
            <StandardLoginForm
                error={error}
                isPasswordlessEnabled={isPasswordlessLoginEnabled}
                returnUrl={returnUrl}
                action={pendingActionName}
                actionParams={actionParams}
            />
        );
    };

    return (
        <>
            <SeoMeta
                title={t('meta.title', { defaultValue: 'Sign In' })}
                description={t('meta.description', {
                    defaultValue: 'Sign in to your account to view orders, manage your wishlist, and more.',
                })}
                openGraph={{ type: 'website', url: pageUrl }}
            />
            <div
                data-section="auth"
                className="min-h-screen flex items-center justify-center bg-background py-12 section-container">
                <div className="max-w-md w-full space-y-8">
                    <div>
                        <h2 className="mt-6 text-center text-3xl font-bold text-foreground">{t('title')}</h2>
                        <p className="mt-2 text-center text-sm text-muted-foreground">{t('subtitle')}</p>
                    </div>

                    <LoginGuestWishlistBanner count={guestWishlistCount} />

                    <Card className="p-8">
                        {renderForm()}
                        {isSocialLoginEnabled ? <SocialLoginButtons /> : null}
                    </Card>
                </div>
            </div>

            {/* Turnstile widget for OTP resend — hidden, generates tokens for the resend fetch */}
            {showOTPModal && turnstileEnabled && turnstileSiteKey && (
                <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    onSuccess={handleResendTurnstileSuccess}
                    onError={handleResendTurnstileError}
                    onExpire={handleResendTurnstileExpire}
                    enabled={turnstileEnabled}
                    mode={turnstileMode}
                    resetRef={resendTurnstileResetRef}
                />
            )}

            {/* OTP Modal - appears over the login page */}
            <OtpModal
                isOpen={showOTPModal}
                otpLength={otpLength}
                initialError={loaderError}
                onClose={() => {
                    // Navigate back to login without OTP modal
                    const url = new URL(window.location.href);
                    url.searchParams.delete('otp');
                    url.searchParams.delete('error');
                    url.searchParams.delete('token');
                    url.searchParams.delete('email');
                    window.history.replaceState({}, '', url.toString());
                    window.location.reload();
                }}
                email={otpEmail || ''}
                onSuccess={(_tokenResponse, meta) => {
                    // Redirect to return URL or home after successful login.
                    // Forward the wishlist merge flag so the destination route can render a toast.
                    const target = returnUrl || routes.home;
                    if (meta?.wishlistMerge) {
                        const separator = target.includes('?') ? '&' : '?';
                        void navigate(`${target}${separator}wishlistMerge=${meta.wishlistMerge}`);
                    } else {
                        void navigate(target);
                    }
                }}
                onResendCode={async () => {
                    const formData = new FormData();
                    formData.append('email', otpEmail || '');
                    formData.append('loginMode', 'passwordless');
                    if (returnUrl) {
                        formData.append('redirectPath', returnUrl);
                    }
                    if (resendTurnstileToken) {
                        formData.append('turnstileToken', resendTurnstileToken);
                    }
                    await fetch(window.location.pathname, {
                        method: 'POST',
                        body: formData,
                    });
                    if (turnstileEnabled) {
                        setResendTurnstileToken(null);
                        resendTurnstileResetRef.current?.();
                    }
                }}
            />
        </>
    );
}
