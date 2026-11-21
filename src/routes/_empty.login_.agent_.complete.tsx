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
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/_empty.login_.agent_.complete';
import { loadTrustedAgentCompletion } from '@/lib/auth/trusted-agent/flow.server';

export const meta: Route.MetaFunction = () => [
    { title: 'Agent authorization' },
    { name: 'robots', content: 'noindex, nofollow' },
];
export const loader = ({ request, context }: Route.LoaderArgs) => loadTrustedAgentCompletion(request, context);

export default function AgentComplete({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation('login');
    useEffect(() => {
        if (window.opener) {
            try {
                window.opener.postMessage(
                    { type: 'TAOB_AUTH_COMPLETE', correlation: loaderData.correlation, status: loaderData.status },
                    window.location.origin
                );
                window.close();
            } catch {
                /* The visible Continue link preserves the full-page path. */
            }
        }
    }, [loaderData.correlation, loaderData.status]);
    return (
        <div className="mx-auto max-w-lg px-4 py-12">
            <h1 className="text-2xl font-semibold">{t('trustedAgent.title')}</h1>
            <p className="my-4">
                {t(loaderData.status === 'success' ? 'trustedAgent.complete' : 'trustedAgent.failed')}
            </p>
            <a className="underline" href={loaderData.destination}>
                {t('trustedAgent.continue')}
            </a>
        </div>
    );
}
