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
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';

import { NativeSelect } from '@/components/ui/native-select';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { resourceRoutes, routes } from '@/route-paths';

export default function SiteSwitcher(): ReactElement {
    const id = useId();
    const { t } = useTranslation('sitePicker');
    const fetcher = useFetcher();
    const config = useConfig();
    const { site } = useSite();
    const sites = config.commerce.sites;

    const handleSiteChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const siteId = e.target.value;

        const formData = new FormData();
        formData.append('type', 'site');
        formData.append('payload', JSON.stringify({ siteId }));

        // Set the cookie server-side, then do a full page reload so all
        // server-rendered content (loaders, Suspense boundaries, i18n) re-runs
        // with the new site.
        await fetcher.submit(formData, {
            method: 'POST',
            action: resourceRoutes.setSiteContext,
        });
        // go back to home page bc not all pages are guaranteed the same for all sites.
        window.location.href = routes.home;
    };

    return (
        <div className="*:not-first:mt-2">
            <NativeSelect
                id={id}
                onChange={(e) => void handleSiteChange(e)}
                aria-label={t('ariaLabel')}
                value={site?.id ?? ''}>
                {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                        {t(`sites.${s.id}`, { defaultValue: s.id })}
                    </option>
                ))}
            </NativeSelect>
        </div>
    );
}
