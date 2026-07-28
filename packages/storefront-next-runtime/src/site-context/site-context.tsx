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
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import type { Locale, Site } from './types';

/**
 * The value provided by {@link SiteProvider} and returned by {@link useSite}.
 */
export type SiteContextValue = {
    /**
     * The resolved site configuration object for the current request.
     * Contains the site's supported locales, supported currencies, and default values.
     */
    site: Site;

    /**
     * The full locale object from the site's `supportedLocales` list for the current request.
     * Contains structured locale metadata: `id` (e.g. `"en-GB"`), optional `alias` (e.g. `"en"`),
     * and optional `preferredCurrency`.
     *
     */
    locale: Locale;

    /**
     * The current i18next language string (e.g. `"en-GB"`, `"fr-FR"`).
     * This is the value returned by `i18next.language` and drives which translation
     * namespace is active. Passed as a prop because the SDK has no react-i18next dependency.
     *
     * @see {@link SiteContextValue.locale} for the full locale object from site config.
     */
    language: string;

    /**
     * The active currency code for the current session (e.g. `"USD"`, `"GBP"`).
     * Resolved from the locale's `preferredCurrency`, a currency cookie, or the site's
     * `defaultCurrency`.
     */
    currency: string;
};

const SiteContext = createContext<SiteContextValue | undefined>(undefined);

/**
 * Provides the current site context (site, locale, language, currency) to the component tree.
 *
 * Mounted in the template's root.tsx with the resolved values from the
 * loader/middleware. The SDK has no react-i18next dependency, so `language`
 * is passed as a prop from the template.
 */
export function SiteProvider({ site, locale, language, currency, children }: PropsWithChildren<SiteContextValue>) {
    const value = useMemo(() => ({ site, locale, language, currency }), [site, locale, language, currency]);
    return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/**
 * React hook to get the current site context.
 * Returns `{ site, locale, language, currency }`.
 * @throws If called outside of a SiteProvider
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useSite(): SiteContextValue {
    const value = useContext(SiteContext);
    if (!value) {
        throw new Error('useSite must be used within a SiteProvider');
    }
    return value;
}
