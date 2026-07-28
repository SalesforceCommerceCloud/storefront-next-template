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
import { type ComponentType, type ReactElement, useMemo, useRef } from 'react';
import { Form as RouterForm, useLocation } from 'react-router';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { Link } from '@/components/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormSubmitButton } from '@/components/buttons/form-submit-button';
import { useTranslation } from 'react-i18next';
import { getLoginModeHref } from './get-login-mode-href';
import { routes } from '@/route-paths';

interface StandardLoginFormProps {
    error?: string;
    isPasswordlessEnabled: boolean;
    returnUrl?: string | null;
    action?: string | null;
    actionParams?: string | null;
    onCheckoutAsGuest?: () => void;
    initialEmail?: string;
    /**
     * Form component to render. Defaults to react-router's `Form` (route-level navigation
     * submit). Pass `fetcher.Form` from the LoginModal so submit state is observable via
     * the parent's fetcher (used to close the modal on success).
     */
    Form?: ComponentType<React.ComponentProps<typeof RouterForm>>;
    /**
     * When true, submits `skipDocumentRedirect` so the login action uses a client-side
     * `redirect` instead of `redirectDocument` even with passkeys enabled. Required when
     * rendered inside the LoginModal: the modal detects success by observing its fetcher
     * return to idle (login-modal.tsx), which a full-page `redirectDocument` navigation
     * would prevent — the modal unmounts and `onSuccess` never fires (e.g. the checkout
     * step never advances). The modal opens no passkey picker itself, so there is nothing
     * for the document reload to dismiss.
     */
    skipDocumentRedirect?: boolean;
}

export default function StandardLoginForm({
    error,
    isPasswordlessEnabled,
    returnUrl,
    action,
    actionParams,
    onCheckoutAsGuest,
    initialEmail,
    Form = RouterForm,
    skipDocumentRedirect = false,
}: StandardLoginFormProps): ReactElement {
    const formRef = useRef<HTMLFormElement>(null);
    const location = useLocation();
    const { t } = useTranslation('login');
    // Submit to the site/locale-prefixed login route so this form works whether rendered
    // standalone at /login or inside a modal on another page (e.g. checkout).
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const loginActionPath = buildUrl({
        to: '/login',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });
    const passwordlessModeHref = useMemo(() => {
        return getLoginModeHref(location.search, 'passwordless');
    }, [location.search]);

    return (
        <Form method="post" action={loginActionPath} className="space-y-6" ref={formRef}>
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
                    defaultValue={initialEmail}
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    {t('passwordLabel')}
                </label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="mt-1"
                    placeholder={t('passwordPlaceholder')}
                />
            </div>

            <input type="hidden" name="loginMode" value="password" />
            {skipDocumentRedirect ? <input type="hidden" name="skipDocumentRedirect" value="true" /> : null}
            {returnUrl ? <input type="hidden" name="returnUrl" value={returnUrl} /> : null}
            {action ? <input type="hidden" name="action" value={action} /> : null}
            {actionParams ? <input type="hidden" name="actionParams" value={actionParams} /> : null}

            {onCheckoutAsGuest ? (
                <Button type="button" variant="outline" className="w-full" onClick={onCheckoutAsGuest}>
                    {t('checkoutAsGuest')}
                </Button>
            ) : null}

            <FormSubmitButton defaultText={t('signIn')} submittingText={t('signingIn')} />
            {isPasswordlessEnabled && (
                <div className="text-center">
                    <Link to={passwordlessModeHref} className="text-primary hover:text-primary/80 text-sm">
                        {t('loginWithoutPassword')}
                    </Link>
                </div>
            )}

            <div className="text-center space-y-2">
                <Link to={routes.forgotPassword} className="block text-sm text-primary hover:text-primary/80">
                    {t('forgotPassword')}
                </Link>
                <p className="text-sm text-muted-foreground">
                    {t('noAccountQuestion')}
                    <Link to={routes.signup} className="font-medium text-primary hover:underline">
                        {t('signUp')}
                    </Link>
                </p>
            </div>
        </Form>
    );
}
