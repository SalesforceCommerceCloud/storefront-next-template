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
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/form';
import { Link } from '@/components/link';
import { routes } from '@/route-paths';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { useTrustedAgent } from '@/hooks/use-trusted-agent';
import { observeAuthFailures, clearAuthRecovery } from '@/lib/auth/recovery';

export function AuthFailureObserver({ version }: { version?: string }) {
    useEffect(() => {
        clearAuthRecovery();
        return observeAuthFailures(version);
    }, [version]);
    return null;
}

export type AgentBannerProps = {
    customerId?: string;
    loginId?: string;
    agentId?: string;
    status?: 'active' | 'reauth-required';
    entryUrl: string;
    endUrl: string;
    contextChanged?: boolean;
};
export function AgentBannerView({
    customerId,
    loginId,
    agentId,
    status,
    entryUrl,
    endUrl,
    contextChanged = false,
}: AgentBannerProps) {
    const { t } = useTranslation('login');
    const bannerRef = useRef<HTMLElement>(null);

    // The sticky header offsets itself by this height so the two never overlap.
    useEffect(() => {
        const el = bannerRef.current;
        if (!el) return;
        const root = document.documentElement;
        const publishHeight = () => root.style.setProperty('--agent-banner-height', `${el.offsetHeight}px`);
        publishHeight();
        const observer = new ResizeObserver(publishHeight);
        observer.observe(el);
        return () => {
            observer.disconnect();
            root.style.removeProperty('--agent-banner-height');
        };
    }, []);

    return (
        <aside
            ref={bannerRef}
            aria-label={t('trustedAgent.bannerLabel')}
            className="sticky top-0 z-[60] border-b border-warning-border bg-warning-bg px-4 py-3 text-foreground [@media(max-height:400px)]:static">
            <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-semibold [overflow-wrap:anywhere]">
                        {contextChanged
                            ? t('trustedAgent.contextChanged')
                            : loginId
                              ? t('trustedAgent.assistingWithLogin', { loginId, customerId })
                              : t('trustedAgent.assisting', { customerId })}
                    </p>
                    {agentId && <p className="text-sm">{t('trustedAgent.agent', { agentId })}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    {status === 'reauth-required' || contextChanged ? (
                        <a href={entryUrl} className="font-medium underline">
                            {t('trustedAgent.continue')}
                        </a>
                    ) : (
                        <Link reloadDocument to={`${routes.agentLogin}?mode=switch`} className="underline">
                            {t('trustedAgent.switch')}
                        </Link>
                    )}
                    <Form method="post" action={endUrl} reloadDocument>
                        <Button type="submit" variant="outline">
                            {t('trustedAgent.end')}
                        </Button>
                    </Form>
                </div>
            </div>
        </aside>
    );
}

export default function TrustedAgentBanner() {
    const agent = useTrustedAgent();
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const params = { siteId: siteRef, localeId: localeRef };
    if (!agent.isAgent && !agent.recovery) return null;
    return (
        <AgentBannerView
            customerId={agent.customerId}
            loginId={agent.loginId}
            agentId={agent.agentId}
            status={agent.status}
            contextChanged={Boolean(agent.recovery && agent.recovery.code === 'AUTH_CONTEXT_CHANGED')}
            entryUrl={agent.recovery?.url ?? buildUrl({ to: routes.agentLogin, urlConfig: config.url, params })}
            endUrl={buildUrl({ to: routes.logout, urlConfig: config.url, params })}
        />
    );
}

export function AuthRecoveryView({ destination }: { destination: string }) {
    const { t } = useTranslation('routeError');
    return (
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-lg px-4 py-12">
            <h1 className="text-2xl font-semibold">{t('authRecoveryTitle')}</h1>
            <p className="my-4">{t('authRecoveryMessage')}</p>
            <a href={destination} className="underline">
                {t('authRecoveryContinue')}
            </a>
        </main>
    );
}
