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

/**
 * Baseline configuration shapes for templates that have a notion of sites,
 * locales, and URL prefixes. These are opt-in helpers, not enforced contracts —
 * `BaseConfig<App>` is generic over the template's `App` shape, so a template
 * with a different shopper model (e.g. B2B, OMS-only) can define its own types
 * and ignore the ones below.
 *
 * For richer runtime shapes used by the site context middleware (with
 * cookie-based detection, site/locale aliases, etc.) see
 * `@salesforce/storefront-next-runtime/site-context`.
 */

export type Locale = {
    id: string;
    preferredCurrency: string;
};

export type Site = {
    cookies?: {
        domain?: string;
    };
    defaultCurrency: string;
    defaultLocale: string;
    domain?: string;
    id: string;
    name?: string;
    alias?: string;
    supportedCurrencies: string[];
    supportedLocales: Array<Locale>;
};

/**
 * Build-time SEO route settings keyed directly by Commerce site ID.
 *
 * These values mirror Business Manager URL settings. They affect the compiled
 * React Router manifest and therefore require a rebuild and deployment when
 * changed.
 */
export type SeoRoutesConfig = Record<
    string,
    {
        product: {
            /** Static path segment without leading or trailing slashes. */
            prefix: string;
        };
        category: {
            /** Static path segment without leading or trailing slashes. */
            prefix: string;
            /** Determines whether the category path ends in an ID or is entirely slug-based. */
            mode: 'id-suffix' | 'slug-path';
        };
        /** Optional BM-mirrored prefix for standalone content URLs. */
        content?: {
            /** Static path segment without leading or trailing slashes. */
            prefix: string;
        };
    }
>;

export type Url = {
    /**
     * URL path prefix using React Router param syntax — interpolated by the
     * template's URL builder. Templates with site/locale routing typically use
     * something like `'/:siteId/:localeId'`; templates without routing params
     * can omit this field.
     */
    prefix?: string;
    /**
     * Query parameters to append to URLs, using `:param` syntax — interpolated
     * by the template's URL builder. Pair shape with `prefix` above.
     */
    search?: string;

    excludeRoutes?: string[];

    /** Per-site SEO routes compiled into the React Router manifest at build time. */
    seoRoutes?: SeoRoutesConfig;
};
