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
import { type ComponentType, type ReactElement, useMemo, useState, useCallback } from 'react';
import { Form as RouterForm, useLocation } from 'react-router';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { Link } from '@/components/link';
import { routes } from '@/route-paths';
import { Input } from '@/components/ui/input';
import { FormSubmitButton } from '@/components/buttons/form-submit-button';
import { useTranslation } from 'react-i18next';
import { getLoginModeHref } from './get-login-mode-href';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { getTurnstileSiteKey, getTurnstileMode, isTurnstileEnabled } from '@/lib/turnstile/utils';

interface PasswordlessLoginFormProps {
    error?: string;
    isPasswordlessEnabled: boolean;
    redirectPath?: string;
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
    Form = RouterForm,
    skipDocumentRedirect = false,
}: PasswordlessLoginFormProps): ReactElement {
    const location = useLocation();
    const { t } = useTranslation('login');
    const config = useConfig();

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

    const turnstileEnabled = config ? isTurnstileEnabled(config) : false;
    const turnstileMode = config ? getTurnstileMode(config) : 'managed';
    const turnstileSiteKey = useMemo(() => {
        if (!config || !turnstileEnabled) return null;
        // Get base URL from window location (client-side)
        if (typeof window !== 'undefined') {
            const baseUrl = `${window.location.protocol}//${window.location.host}`;
            return getTurnstileSiteKey(config, baseUrl);
        }
        return null;
    }, [config, turnstileEnabled]);

    const handleTurnstileSuccess = useCallback((token: string) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileError = useCallback(() => {
        // Widget no longer calls this (graceful degradation), but keep for API compatibility
        setTurnstileToken(null);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken(null);
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

    return (
        <Form method="post" action={loginActionPath} className="space-y-6">
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-ui">
                    {error}
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
                />
            </div>

            {turnstileEnabled && turnstileSiteKey && (
                <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    onSuccess={handleTurnstileSuccess}
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                    enabled={turnstileEnabled}
                    mode={turnstileMode}
                />
            )}

            {/* Hidden input to track login mode */}
            <input type="hidden" name="loginMode" value="passwordless" />

            {skipDocumentRedirect && <input type="hidden" name="skipDocumentRedirect" value="true" />}

            {/* Hidden input to pass redirect URL */}
            {redirectPath && <input type="hidden" name="redirectPath" value={redirectPath} />}

            {turnstileToken && <input type="hidden" name="turnstileToken" value={turnstileToken} />}

            <FormSubmitButton defaultText={t('sendLoginLink')} submittingText={t('sendingLoginLink')} />

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
