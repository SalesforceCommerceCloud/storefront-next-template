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

import type { Cookie } from 'react-router';
import type { DetectionMethod, Locale, SiteSettings, Site } from './types';
import { readCookieFromRequest, lookupFromPath } from './utils';

/**
 * Read locale from cookie.
 */
export async function readLocaleFromCookie(request: Request, cookie: Cookie): Promise<string | null> {
    return readCookieFromRequest(request, cookie);
}

/**
 * Get locale object using the locale id or alias.
 * 1. Check localeIdOrAlias against each locale's alias; if matched, return that locale.
 * 2. Else check against each locale's id; if matched, return that locale.
 * 3. If no match, return null (caller should use defaultLocale).
 *
 * @param localeIdentifier - The locale id or alias to get the locale from. Null is allowed because this may come from
 * extrenal sources such as cookies, headers, or query parameters.
 * @param locales - The list of locales to search through.
 * @returns The locale object if found, otherwise null.
 */
function getLocaleFromIdOrAlias(localeIdentifier: string | undefined | null, locales: Locale[]): Locale | null {
    if (!localeIdentifier) return null;
    return locales.find((locale) => locale.alias === localeIdentifier || locale.id === localeIdentifier) ?? null;
}

/**
 * Resolve locale using the configured detection order.
 * Returns the first valid locale from the first source that yields a valid value.
 */
export async function resolveLocale(request: Request, settings: SiteSettings, site: Site): Promise<Locale> {
    const { localeDetectionConfig, localeCookie } = settings;
    const { defaultLocale, supportedLocales } = site;

    let locale: Locale | null = null;
    const requestUrl = new URL(request.url);

    // When a base path is configured (e.g., '/shop'), we need to skip its path segments.
    // React Router handles the base path internally for hooks like useParams or useLocation,
    // but it does not strip it from request.url. The offset is calculated dynamically from
    // the number of segments in the base path as future-proof in case we support multi-segment
    // base paths in the future.
    const basePathOffset = process.env.MRT_ENV_BASE_PATH
        ? process.env.MRT_ENV_BASE_PATH.split('/').filter(Boolean).length
        : 0;

    const resolvers: Record<DetectionMethod, () => Promise<string | null>> = {
        path: () =>
            Promise.resolve(
                lookupFromPath(requestUrl.pathname, localeDetectionConfig.lookupFromPathIndex + basePathOffset)
            ),
        querystring: () => Promise.resolve(requestUrl.searchParams.get(localeDetectionConfig.lookupQuerystring)),
        header: () => Promise.resolve(request.headers.get(localeDetectionConfig.lookupHeader)),
        cookie: async () => readLocaleFromCookie(request, localeCookie),
    };

    for (const method of localeDetectionConfig.order) {
        const localeIdOrAlias = await resolvers[method]?.();
        const resolvedLocale = getLocaleFromIdOrAlias(localeIdOrAlias, supportedLocales);
        if (resolvedLocale) return resolvedLocale;
    }

    // If no locale was found, use the default locale
    if (!locale) {
        locale = getLocaleFromIdOrAlias(defaultLocale, supportedLocales);
    }

    // If default locale is invalid, throw an error
    if (!locale) {
        throw new Error(
            `Default locale ${defaultLocale} not found in the list of supported locales for site ${site.id}.`
        );
    }

    return locale;
}
