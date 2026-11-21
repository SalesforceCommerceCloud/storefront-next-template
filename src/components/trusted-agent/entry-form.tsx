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
import { useEffect, useRef, useState, type FormEvent } from 'react';
// oxlint-disable-next-line no-restricted-imports -- The agent entry route is exempt from auth-context binding; its sealed form nonce is the freshness check.
import { Form } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/components/link';
import { routes } from '@/route-paths';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { buildConversationStorageKeys } from '@/components/cimulate/cimulate-conversation';

export type AgentEntryFormProps = {
    loginId: string;
    nonce: string;
    action: string;
    mode: 'start' | 'renew';
    pending: boolean;
    failed: boolean;
    returnUrl: string;
    error?: 'invalid_login';
    canEnd?: boolean;
};

export default function AgentEntryForm({
    loginId,
    nonce,
    action,
    mode,
    pending,
    failed,
    returnUrl,
    error,
    canEnd = false,
}: AgentEntryFormProps) {
    const { t } = useTranslation('login');
    const config = useConfig();
    const popup = useRef<Window | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [popupFailed, setPopupFailed] = useState(false);
    useEffect(() => {
        const onComplete = (event: MessageEvent) => {
            if (
                event.origin !== window.location.origin ||
                event.source !== popup.current ||
                event.data?.type !== 'TAOB_AUTH_COMPLETE' ||
                event.data?.correlation !== nonce
            )
                return;
            popup.current?.close();
            popup.current = null;
            if (event.data.status === 'success') window.location.assign(returnUrl);
            else {
                setPopupFailed(true);
                setSubmitting(false);
            }
        };
        window.addEventListener('message', onComplete);
        return () => window.removeEventListener('message', onComplete);
    }, [nonce, returnUrl]);
    useEffect(() => {
        if (!submitting || !popup.current) return;
        const timer = window.setInterval(() => {
            if (popup.current?.closed) {
                popup.current = null;
                setSubmitting(false);
                setPopupFailed(true);
            }
        }, 500);
        return () => window.clearInterval(timer);
    }, [submitting]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        if (submitting) {
            event.preventDefault();
            return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'renew') {
            const agent = resolveShopperAgentConfig(config);
            if (agent?.salesforceOrgId && agent.esDeveloperName) {
                const keys = buildConversationStorageKeys(agent.salesforceOrgId, agent.esDeveloperName);
                for (const store of [() => window.localStorage, () => window.sessionStorage]) {
                    try {
                        for (const key of Object.values(keys)) store().removeItem(key);
                    } catch {
                        /* Storage can be unavailable in private browsers. */
                    }
                }
            }
        }
        const wantsPopup = submitter instanceof HTMLButtonElement && submitter.value !== 'end';
        const form = event.currentTarget;
        const popupInput = form.elements.namedItem('popup');
        if (wantsPopup) popup.current = window.open('about:blank', `taob-${nonce}`, 'popup,width=800,height=800');
        const usesPopup = wantsPopup && Boolean(popup.current);
        if (popupInput instanceof HTMLInputElement) popupInput.value = usesPopup ? 'true' : 'false';
        form.target = usesPopup ? `taob-${nonce}` : '_self';
        // Disabling the buttons inside the submit event drops the submitter's `intent` from the form data.
        window.setTimeout(() => setSubmitting(true), 0);
    };

    return (
        <div className="mx-auto max-w-lg px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>
                        <h1 className="text-2xl font-semibold">{t('trustedAgent.title')}</h1>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-6 text-muted-foreground">
                        {t(
                            pending
                                ? 'trustedAgent.pending'
                                : mode === 'renew'
                                  ? 'trustedAgent.recovery'
                                  : 'trustedAgent.description'
                        )}
                    </p>
                    {(failed || popupFailed || error) && (
                        <p role="alert" className="mb-4 text-destructive">
                            {t(error ? 'trustedAgent.invalidLogin' : 'trustedAgent.failed')}
                        </p>
                    )}
                    <Form method="post" action={action} reloadDocument onSubmit={onSubmit} className="space-y-4">
                        <input type="hidden" name="nonce" value={nonce} />
                        <input type="hidden" name="popup" defaultValue="false" />
                        <div className="space-y-2">
                            <label htmlFor="agent-login-id" className="text-sm font-medium">
                                {t('trustedAgent.loginLabel')}
                            </label>
                            <Input
                                id="agent-login-id"
                                name="loginId"
                                defaultValue={loginId}
                                type="text"
                                placeholder={t('trustedAgent.loginPlaceholder')}
                                className="read-only:cursor-not-allowed read-only:bg-muted"
                                aria-describedby={mode === 'renew' ? 'agent-login-id-hint' : undefined}
                                autoComplete="off"
                                maxLength={512}
                                required={!pending}
                                readOnly={mode === 'renew' || pending}
                            />
                            {mode === 'renew' && (
                                <p id="agent-login-id-hint" className="text-sm text-muted-foreground">
                                    {t('trustedAgent.renewHint')}
                                </p>
                            )}
                        </div>
                        {!pending && (
                            <Button className="w-full" type="submit" name="intent" value={mode} disabled={submitting}>
                                {t(submitting ? 'trustedAgent.authorizing' : 'trustedAgent.continue')}
                            </Button>
                        )}
                        {(canEnd || pending || mode === 'renew') && (
                            <Button
                                variant="outline"
                                className="w-full"
                                type="submit"
                                name="intent"
                                value="end"
                                formNoValidate>
                                {t('trustedAgent.end')}
                            </Button>
                        )}
                    </Form>
                    {popupFailed && (
                        <Link to={routes.agentLogin} reloadDocument className="mt-4 block underline">
                            {t('trustedAgent.continue')}
                        </Link>
                    )}
                    {mode === 'renew' && (
                        <Link
                            to={`${routes.agentLogin}?mode=switch`}
                            className="mt-4 block text-sm underline"
                            reloadDocument>
                            {t('trustedAgent.switch')}
                        </Link>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
