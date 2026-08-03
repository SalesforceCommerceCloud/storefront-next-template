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
import {
    type ComponentType,
    type ChangeEvent,
    type FocusEvent,
    type ReactElement,
    useMemo,
    useState,
    useCallback,
    useRef,
    useEffect,
} from 'react';
import { Form as RouterForm, useLocation, useResolvedPath } from 'react-router';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { Link } from '@/components/link';
import { routes, resourceRoutes } from '@/route-paths';
import { Input } from '@/components/ui/input';
import { FormSubmitButton } from '@/components/buttons/form-submit-button';
import { useTranslation } from 'react-i18next';
import { getLoginModeHref } from './get-login-mode-href';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { getBrowserTurnstileSiteKey, getTurnstileMode, isTurnstileEnabled } from '@/lib/turnstile/utils';
import { checkTurnstileSessionVerified } from '@/lib/turnstile/check-session';

interface PasswordlessLoginFormProps {
    error?: string;
    isPasswordlessEnabled: boolean;
    redirectPath?: string;
    /**
     * Machine-readable code from the last action response. `NOT_AUTHORIZED` signals a
     * server-side Turnstile rejection so the form can reset the widget and display a
     * generic verification message. See README-TURNSTILE.md for the WI-10 pattern.
     */
    actionErrorCode?: string;
    /**
     * Form component to render. Defaults to react-router's `Form`. Pass `fetcher.Form`
     * from the LoginModal so submit state is observable via the parent's fetcher.
     */
    Form?: ComponentType<React.ComponentProps<typeof RouterForm>>;
    /**
     * When true, submits `skipDocumentRedirect` so the login action uses a client-side
     * `redirect` instead of `redirectDocument` even with passkeys enabled. Required when
     * rendered inside the LoginModal — see StandardLoginForm for the full rationale.
     */
    skipDocumentRedirect?: boolean;
}

export default function PasswordlessLoginForm({
    error,
    isPasswordlessEnabled,
    redirectPath,
    actionErrorCode,
    Form = RouterForm,
    skipDocumentRedirect = false,
}: PasswordlessLoginFormProps): ReactElement {
    const location = useLocation();
    const { t } = useTranslation('login');
    const config = useConfig();

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileBypassed, setTurnstileBypassed] = useState(false);
    // True when BFF reports the httpOnly cc-tv cookie already matches this email.
    const [turnstileSessionVerified, setTurnstileSessionVerified] = useState(false);
    const [turnstileSessionChecking, setTurnstileSessionChecking] = useState(false);
    const sessionVerifiedEmailRef = useRef<string | null>(null);
    const turnstileResetRef = useRef<(() => void) | null>(null);
    // Generic copy — never mention Turnstile/bot/captcha to avoid leaking detection signals.
    const [verificationError, setVerificationError] = useState<string | null>(null);
    // True after the widget exhausts its 3-retry cap. Email focus remounts a fresh widget.
    const [turnstileRetryExhausted, setTurnstileRetryExhausted] = useState(false);
    const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
    // Cap auto-resets after consecutive server-side rejections so a misconfigured key or a
    // blocked client doesn't loop forever. After MAX retries the widget stays put and the
    // shopper must re-focus email (or refresh) to try again.
    const verificationFailureCountRef = useRef(0);
    const MAX_VERIFICATION_RETRIES = 3;
    // Deferred mount: widget initializes on email blur (not on page load / focus),
    // unless the session cookie already covers this email.
    const [showTurnstile, setShowTurnstile] = useState(false);

    const turnstileEnabled = isTurnstileEnabled(config);
    const turnstileMode = getTurnstileMode(config);
    const turnstileSiteKey = useMemo(() => {
        if (!turnstileEnabled) return null;
        return getBrowserTurnstileSiteKey(config);
    }, [config, turnstileEnabled]);

    const turnstileSessionPath = useResolvedPath(resourceRoutes.turnstileSession).pathname;

    // Submit is gated when Turnstile is enabled and a fresh token hasn't arrived yet.
    // Session-verified (cc-tv match) and CDN bypass both unblock without a token.
    const turnstilePending = !!(
        turnstileEnabled &&
        turnstileSiteKey &&
        (turnstileSessionChecking || (!turnstileToken && !turnstileBypassed && !turnstileSessionVerified))
    );

    const handleTurnstileSuccess = useCallback((token: string) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileError = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    // CDN / infrastructure failure — the widget could not load, so unblock the form.
    // The server's enforceTurnstile will fail-open when no token is present and there is
    // no cc-tv cookie. Copy must stay generic (no "Turnstile" or "captcha" references).
    const handleTurnstileBypass = useCallback(() => {
        setTurnstileBypassed(true);
    }, []);

    // Widget-side retry exhaustion (3 consecutive non-infrastructure errors). The widget
    // could not produce a token — surface the same generic message that server-side
    // rejection shows so the shopper isn't silently stuck. We do not auto-reset here
    // because the widget already exhausted its own retry cap; email focus remounts it.
    const handleTurnstileRetryExhausted = useCallback(() => {
        setTurnstileRetryExhausted(true);
        setVerificationError(t('verificationFailed'));
    }, [t]);

    // Server-side Turnstile rejection (403 NOT_AUTHORIZED) handling.
    // When the server rejects the token the form shows a generic retry message, resets
    // the widget so a fresh token can be generated, and caps auto-retries so a
    // misconfigured key cannot loop forever. Clears when the shopper re-focuses email.
    useEffect(() => {
        if (actionErrorCode !== 'NOT_AUTHORIZED') return;

        verificationFailureCountRef.current += 1;
        setVerificationError(t('verificationFailed'));

        if (verificationFailureCountRef.current < MAX_VERIFICATION_RETRIES) {
            setTurnstileToken(null);
            turnstileResetRef.current?.();
        } else {
            // Cap reached — treat like widget exhaustion so email focus can remount.
            setTurnstileRetryExhausted(true);
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentionally reacts only to actionErrorCode changes
    }, [actionErrorCode]);

    // Focus does not mount the widget (first show is email blur). Focus still clears
    // verification errors and remounts after retry exhaustion so the shopper can recover.
    const handleEmailFocus = useCallback(() => {
        if (verificationError) {
            setVerificationError(null);
        }
        // After retry exhaustion, remount a fresh widget so the shopper can recover
        // without a full page refresh.
        if (turnstileRetryExhausted) {
            setTurnstileRetryExhausted(false);
            setTurnstileToken(null);
            setTurnstileBypassed(false);
            verificationFailureCountRef.current = 0;
            setTurnstileWidgetKey((k) => k + 1);
        }
    }, [verificationError, turnstileRetryExhausted]);

    const handleEmailBlur = useCallback(
        (e: FocusEvent<HTMLInputElement>) => {
            const raw = (e.target.value ?? '').trim();
            if (!raw) return;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return;
            const normalized = raw.toLowerCase();

            if (!turnstileEnabled) return;

            if (turnstileSessionVerified && sessionVerifiedEmailRef.current === normalized) {
                return;
            }

            if (sessionVerifiedEmailRef.current && sessionVerifiedEmailRef.current !== normalized) {
                setTurnstileSessionVerified(false);
                sessionVerifiedEmailRef.current = null;
            }

            void (async () => {
                setTurnstileSessionChecking(true);
                const verified = await checkTurnstileSessionVerified(turnstileSessionPath, raw);
                const current =
                    (document.getElementById('email') as HTMLInputElement | null)?.value.trim().toLowerCase() ?? '';
                if (current !== normalized) {
                    setTurnstileSessionChecking(false);
                    return;
                }
                setTurnstileSessionChecking(false);

                if (verified) {
                    setTurnstileSessionVerified(true);
                    sessionVerifiedEmailRef.current = normalized;
                    setShowTurnstile(false);
                    setTurnstileToken(null);
                    return;
                }

                setTurnstileSessionVerified(false);
                sessionVerifiedEmailRef.current = null;
                if (!showTurnstile) {
                    setShowTurnstile(true);
                }
            })();
        },
        [turnstileEnabled, showTurnstile, turnstileSessionPath, turnstileSessionVerified]
    );

    const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const next = (e.target.value ?? '').trim().toLowerCase();
        if (sessionVerifiedEmailRef.current && next !== sessionVerifiedEmailRef.current) {
            setTurnstileSessionVerified(false);
            sessionVerifiedEmailRef.current = null;
        }
    }, []);

    const passwordModeHref = useMemo(() => {
        return getLoginModeHref(location.search, 'password');
    }, [location.search]);
    // Submit to the site/locale-prefixed login route so this form works whether rendered
    // standalone at /login or inside a modal on another page (e.g. checkout).
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const loginActionPath = buildUrl({
        to: '/login',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });

    // When verificationError is set it supersedes the generic action error (which would be
    // the forbidden message from the server) to keep the copy user-friendly and consistent.
    const displayedError = verificationError ?? error;

    return (
        <Form method="post" action={loginActionPath} className="space-y-6">
            {displayedError && (
                <div
                    role="alert"
                    className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-ui">
                    {displayedError}
                </div>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                    {t('emailLabel')}
                </label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username webauthn"
                    required
                    className="mt-1"
                    placeholder={t('emailPlaceholder')}
                    onFocus={handleEmailFocus}
                    onBlur={handleEmailBlur}
                    onChange={handleEmailChange}
                />
            </div>

            {turnstileEnabled && turnstileSiteKey && showTurnstile && !turnstileSessionVerified && (
                <TurnstileWidget
                    key={turnstileWidgetKey}
                    siteKey={turnstileSiteKey}
                    onSuccess={handleTurnstileSuccess}
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                    onBypass={handleTurnstileBypass}
                    onRetryExhausted={handleTurnstileRetryExhausted}
                    enabled={turnstileEnabled}
                    mode={turnstileMode}
                    resetRef={turnstileResetRef}
                />
            )}

            {/* Hidden input to track login mode */}
            <input type="hidden" name="loginMode" value="passwordless" />

            {skipDocumentRedirect && <input type="hidden" name="skipDocumentRedirect" value="true" />}

            {/* Hidden input to pass redirect URL */}
            {redirectPath && <input type="hidden" name="redirectPath" value={redirectPath} />}

            {turnstileToken && <input type="hidden" name="turnstileToken" value={turnstileToken} />}

            <FormSubmitButton
                defaultText={t('sendLoginLink')}
                submittingText={t('sendingLoginLink')}
                disabled={turnstilePending}
            />

            {/* Toggle to password login if enabled */}
            {isPasswordlessEnabled && (
                <div className="text-center">
                    <Link to={passwordModeHref} className="text-primary hover:text-primary/80 text-sm">
                        {t('loginWithPassword')}
                    </Link>
                </div>
            )}

            <div className="text-center">
                <Link to={routes.forgotPassword} className="text-sm text-primary hover:text-primary/80">
                    {t('forgotPassword')}
                </Link>
            </div>
        </Form>
    );
}
