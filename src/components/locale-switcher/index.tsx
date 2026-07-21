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
import { useFetcher, useLocation } from 'react-router';

import { NativeSelect } from '@/components/ui/native-select';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrl, resolvePrefix, stripPathPrefix, useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { resourceRoutes } from '@/route-paths';

export default function LocaleSwitcher(): ReactElement {
    const id = useId();
    const { t, i18n } = useTranslation('localeSwitcher');
    const fetcher = useFetcher();
    const config = useConfig();
    const { site } = useSite();

    // Show only languages the app has translations for AND the current site supports.
    // This ensures each site's locale-switcher only shows relevant options.
    const siteLocaleIds = new Set(site.supportedLocales.map((l) => l.id));
    const supportedLngs = config.i18n.supportedLngs.filter((lng) => siteLocaleIds.has(lng));

    const location = useLocation();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();

    const handleLocaleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLocale = e.target.value;
        const newLocaleRef = config.localeAliasMap?.[newLocale] ?? newLocale;

        // Strip the current prefix (e.g. /global/en-GB) to get the bare path,
        // then rebuild with the new locale to avoid double-prefixing.
        const currentPrefix = config.url?.prefix
            ? resolvePrefix({ prefix: config.url.prefix, params: { siteId: siteRef, localeId: localeRef } })
            : '';
        const barePath = stripPathPrefix({ pathname: location.pathname, prefix: currentPrefix }) || '/';

        const pathname = buildUrl({
            to: barePath,
            urlConfig: config.url,
            params: { siteId: siteRef, localeId: newLocaleRef },
        });

        const formData = new FormData();
        formData.append('type', 'locale');
        formData.append('payload', JSON.stringify({ locale: newLocale, pathname }));

        // Update i18next client-side so the selector reflects the new value immediately
        await i18n.changeLanguage(newLocale);

        // Set the cookie server-side, then do a full page reload so all
        // server-rendered content (loaders, Suspense boundaries, i18n) re-runs
        // with the new locale.
        await fetcher.submit(formData, {
            method: 'POST',
            action: resourceRoutes.setSiteContext,
        });
        window.location.href = pathname;
    };

    // WCAG 3.2.2 On Input: fold the context-change advice into the accessible name so it is read
    // on focus, before the shopper changes the value. Kept on aria-label (not a separate
    // aria-describedby span) so it adds no server-rendered DOM to every page.
    const label = `${t('ariaLabel')}. ${t('changesContextHint', {
        defaultValue: 'Selecting a language reloads the page in that language.',
    })}`;

    return (
        <div className="*:not-first:mt-2">
            <NativeSelect id={id} onChange={(e) => void handleLocaleChange(e)} aria-label={label} value={i18n.language}>
                {supportedLngs.map((locale) => {
                    return (
                        <option key={locale} value={locale}>
                            {t(`locales.${locale}`, { defaultValue: locale })}
                        </option>
                    );
                })}
            </NativeSelect>
        </div>
    );
}
