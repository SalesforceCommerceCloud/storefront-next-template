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

import { createContext, type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { isValidCookieDomain } from '../cookie-domain';
import { getSiteFromIdOrAlias, resolveSite } from './site-detection';
import type { SiteConfig, SiteContext, SiteSettings, Site, Locale, PreviewOptions } from './types';
import { DEFAULT_SITE_DETECTION, DEFAULT_LOCALE_DETECTION, DEFAULT_CURRENCY_COOKIE_NAME } from './configs';
import { createSiteContextCookie, createCurrencyCookie, requestToLocaleMap } from './cookies';
import { getLocaleFromIdOrAlias, resolveLocale } from './locale-detection';
import { resolveCurrency } from './currency-detection';
import { buildUrl, parseSearchConfig } from './build-url';
import { isDesignModeActive, isPreviewModeActive } from '../design/modeDetection.js';

const PREVIEW_SITE_PARAM = '__siteId';
const PREVIEW_MODE_PARAM = 'mode';
const PREVIEW_TOKEN_PARAM = 'pdToken';

export const siteContext = createContext<SiteContext | null>(null);

/**
 * Resolved site context result from {@link resolveSiteContext}.
 */
export type ResolvedSiteContext = {
    site: Site;
    locale: Locale;
    currency: string;
};

/**
 * Resolve site, locale, and currency from a request in one call.
 *
 * This is the recommended public entry point for site-context resolution.
 * It encapsulates the required resolution order (site → locale → currency)
 * so consumers don't need to manage the dependency chain manually.
 *
 * The individual resolvers (`resolveSite`, `resolveLocale`, `resolveCurrency`)
 * are available as advanced utilities for cases that need fine-grained control.
 *
 * @param request - Incoming HTTP request
 * @param settings - Fully resolved site settings (with detection config and cookies)
 * @returns Resolved site, locale, and currency
 *
 * @example
 * ```typescript
 * const { site, locale, currency } = await resolveSiteContext(request, settings);
 * ```
 */
export async function resolveSiteContext(request: Request, settings: SiteSettings): Promise<ResolvedSiteContext> {
    const site = await resolveSite(request, settings);
    const locale = await resolveLocale(request, settings, site);
    const currency = await resolveCurrency(request, settings.currencyCookie, site, locale);
    return { site, locale, currency };
}

type MiddlewareArgs = { request: Request; context: Readonly<RouterContextProvider> };

/**
 * Helper function to get site context cookies from router context.
 * Useful in server actions and loaders that need to read/set cookies.
 *
 * @param context - Router context provider
 * @returns Object with siteCookie and localeCookie instances, or null if context not set
 *
 * @example
 * ```typescript
 * export const action: ActionFunction = async ({ request, context }) => {
 *     const cookies = getSiteContextCookies(context);
 *     if (cookies) {
 *         const cookieHeader = await cookies.localeCookie.serialize(locale);
 *         // ... use cookieHeader
 *     }
 * };
 * ```
 */
export function getSiteContextCookies(context: Readonly<RouterContextProvider>) {
    const siteCtx = context.get(siteContext);
    if (!siteCtx) return null;
    return {
        siteCookie: siteCtx.siteCookie,
        localeCookie: siteCtx.localeCookie,
        currencyCookie: siteCtx.currencyCookie,
    };
}

/**
 * Helper function to determine if cookies should be set based on:
 * 1. Whether caching is enabled for each cookie type
 * 2. Whether the resolved value differs from the existing cookie
 * 3. Whether cookies were already set by actions/loaders in the response
 *
 * @param request - Incoming request
 * @param response - Response from next()
 * @param settings - Site context settings with cookie instances and detection config
 * @param site - Resolved site for this request
 * @param locale - Resolved locale for this request
 * @param currency - Resolved currency for this request
 * @returns Object with shouldSetSiteCookie, shouldSetLocaleCookie, and shouldSetCurrencyCookie booleans
 */
async function shouldSetCookies(
    request: Request,
    response: Response,
    settings: SiteSettings,
    site: Site,
    locale: Locale,
    currency: string
): Promise<{ shouldSetSiteCookie: boolean; shouldSetLocaleCookie: boolean; shouldSetCurrencyCookie: boolean }> {
    const cacheSite = settings.siteDetectionConfig.caches?.includes('cookie');
    const cacheLocale = settings.localeDetectionConfig.caches?.includes('cookie');

    // Check if cookies were already set by actions/loaders in the response.
    // If they were, we don't want to override them.
    const responseSetCookies = response.headers.getSetCookie?.() || [];
    const isSettingSiteCookieInResponse = responseSetCookies.some((cookie) =>
        cookie.startsWith(`${settings.siteCookie.name}=`)
    );
    const isSettingLocaleCookieInResponse = responseSetCookies.some((cookie) =>
        cookie.startsWith(`${settings.localeCookie.name}=`)
    );
    const isSettingCurrencyCookieInResponse = responseSetCookies.some((cookie) =>
        cookie.startsWith(`${settings.currencyCookie.name}=`)
    );

    const requestCookieHeader = request.headers.get('Cookie');
    const [existingSiteCookie, existingLocaleCookie, existingCurrencyCookie] = await Promise.all([
        settings.siteCookie.parse(requestCookieHeader),
        settings.localeCookie.parse(requestCookieHeader),
        settings.currencyCookie.parse(requestCookieHeader),
    ]);

    // Set cookie if: doesn't exist yet OR resolved value differs from existing.
    // Skip if an action/loader already set it in the response.
    return {
        shouldSetSiteCookie: cacheSite && !isSettingSiteCookieInResponse && existingSiteCookie !== site.id,
        shouldSetLocaleCookie: cacheLocale && !isSettingLocaleCookieInResponse && existingLocaleCookie !== locale.id,
        shouldSetCurrencyCookie: !isSettingCurrencyCookieInResponse && existingCurrencyCookie !== currency,
    };
}

/**
 * Creates a site context middleware that resolves the current site from
 * the request (path, cookie, header, query, or default) and stores the
 * result in the router context.
 *
 * Does not import or read from app config context; the consumer supplies config.
 */
export function createSiteContextMiddleware(
    config: SiteConfig,
    previewOptions?: PreviewOptions
): MiddlewareFunction<Response> {
    // Merge config with defaults so every detection option has a value
    const siteDetectionConfig: SiteSettings['siteDetectionConfig'] = {
        ...DEFAULT_SITE_DETECTION,
        ...config.siteDetectionConfig,
    };
    const localeDetectionConfig: SiteSettings['localeDetectionConfig'] = {
        ...DEFAULT_LOCALE_DETECTION,
        ...config.localeDetectionConfig,
    };

    const siteContextMiddleware: MiddlewareFunction<Response> = async (
        { request, context }: MiddlewareArgs,
        next: () => Promise<Response>
    ): Promise<Response> => {
        // Preview runs inside the Page Designer iframe, so its site-context cookies
        // need cross-site attributes. Create cookie instances per request so preview
        // policy cannot leak through this middleware's shared configuration.
        const isPageDesignerRequest = isPreviewModeActive(request) || isDesignModeActive(request);
        const cookieOptions = isPageDesignerRequest
            ? { ...config.cookieOptions, sameSite: 'none' as const, secure: true, partitioned: true }
            : config.cookieOptions;
        const siteCookie = createSiteContextCookie(siteDetectionConfig.lookupCookie, cookieOptions);
        const localeCookie = createSiteContextCookie(localeDetectionConfig.lookupCookie, cookieOptions);
        // Currency is JS-readable so the client can restore the selected currency under a
        // cached app shell. Scoped to this cookie only — site/locale stay httpOnly.
        const currencyCookie = createCurrencyCookie(config.currencyCookieName ?? DEFAULT_CURRENCY_COOKIE_NAME, {
            ...cookieOptions,
            httpOnly: false,
        });
        const settings: SiteSettings = {
            ...config,
            siteDetectionConfig,
            localeDetectionConfig,
            siteCookie,
            localeCookie,
            currencyCookie,
        };

        const selected = resolvePreviewSiteLocale(request, settings, previewOptions);
        const { site, locale, currency } = selected
            ? {
                  ...selected,
                  currency: await resolveCurrency(request, settings.currencyCookie, selected.site, selected.locale),
              }
            : await resolveSiteContext(request, settings);

        // Store full Site, Locale, Currency, and Cookie objects in context
        context.set(siteContext, {
            site,
            locale,
            currency,
            siteCookie: settings.siteCookie,
            localeCookie: settings.localeCookie,
            currencyCookie: settings.currencyCookie,
        });

        // Store locale in a WeakMap so i18next's findLocale can access it
        // This is necessary because findLocale only receives Request and cannot access the router context
        requestToLocaleMap.set(request, locale.id);

        const previewRedirect =
            selected && previewOptions && createPreviewRedirect(request, previewOptions, site, locale);
        const response = previewRedirect ?? (await next());

        // Determine if cookies should be set.
        // Actions that change currency (or site/locale) set their cookies directly on the response;
        // shouldSetCookies detects those Set-Cookie headers and skips to avoid overriding.
        const { shouldSetSiteCookie, shouldSetLocaleCookie, shouldSetCurrencyCookie } = await shouldSetCookies(
            request,
            response,
            settings,
            site,
            locale,
            currency
        );

        // Early return if no cookies need to be set
        if (!shouldSetSiteCookie && !shouldSetLocaleCookie && !shouldSetCurrencyCookie) {
            return response;
        }

        // Per-site cookie domain (commerce.sites[].cookies.domain) takes precedence over the
        // global default carried in cookieOptions.domain. Resolved at serialize time because the
        // cookie instances are created before the request's site is known. serialize() merges
        // these options over the cookie's baked-in options, so this overrides only the domain.
        // Unset → no Domain attribute (host-only scoping). A misconfigured value (wildcard/
        // separator/whitespace) also falls back to host-only rather than emit a malformed,
        // browser-rejected Set-Cookie; the template's resolveCookieDomain logs that misconfig.
        const cookieDomain = site.cookies?.domain || settings.cookieOptions?.domain;
        const domainOpt = cookieDomain && isValidCookieDomain(cookieDomain) ? { domain: cookieDomain } : {};

        const [siteSetCookie, localeSetCookie, currencySetCookie] = await Promise.all([
            shouldSetSiteCookie
                ? settings.siteCookie.serialize(site.id, { path: '/', ...domainOpt })
                : Promise.resolve(null),
            shouldSetLocaleCookie
                ? settings.localeCookie.serialize(locale.id, { path: '/', ...domainOpt })
                : Promise.resolve(null),
            shouldSetCurrencyCookie
                ? settings.currencyCookie.serialize(currency, { ...domainOpt })
                : Promise.resolve(null),
        ]);

        if (siteSetCookie) response.headers.append('Set-Cookie', siteSetCookie);
        if (localeSetCookie) response.headers.append('Set-Cookie', localeSetCookie);
        if (currencySetCookie) response.headers.append('Set-Cookie', currencySetCookie);

        return response;
    };

    return siteContextMiddleware;
}

function resolvePreviewSiteLocale(
    request: Request,
    settings: SiteSettings,
    previewOptions?: PreviewOptions
): Pick<ResolvedSiteContext, 'site' | 'locale'> | null {
    if (request.method !== 'GET' || !previewOptions || !(isPreviewModeActive(request) || isDesignModeActive(request))) {
        return null;
    }

    const url = new URL(request.url);
    const siteId = url.searchParams.get(PREVIEW_SITE_PARAM);
    if (!siteId) return null;

    const site =
        getSiteFromIdOrAlias(siteId, settings.sites) ?? getSiteFromIdOrAlias(settings.defaultSiteId, settings.sites);
    if (!site) return null;

    // Preview should always load the site's configured default locale.
    const locale = getLocaleFromIdOrAlias(site.defaultLocale, site.supportedLocales);
    return locale ? { site, locale } : null;
}

function createPreviewRedirect(
    request: Request,
    previewOptions: PreviewOptions,
    site: Site,
    locale: Locale
): Response | null {
    if (previewOptions.urlConfig?.search) {
        const searchConfig = parseSearchConfig(previewOptions.urlConfig.search);
        if (PREVIEW_SITE_PARAM in searchConfig) {
            throw new Error(`${PREVIEW_SITE_PARAM} is reserved for the initial storefront preview handoff.`);
        }
        // buildUrl sets configured search after the allowlist, so these keys would
        // replace the incoming preview activation.
        if (PREVIEW_MODE_PARAM in searchConfig || PREVIEW_TOKEN_PARAM in searchConfig) {
            throw new Error(
                `${PREVIEW_MODE_PARAM} and ${PREVIEW_TOKEN_PARAM} are reserved for storefront preview and cannot be configured in previewOptions.urlConfig.search.`
            );
        }
    }

    const requestUrl = new URL(request.url);
    // Initial handoff only. Keep mode and pdToken; drop other query params.
    const allowed = new URLSearchParams();
    const mode = requestUrl.searchParams.get(PREVIEW_MODE_PARAM);
    const pdToken = requestUrl.searchParams.get(PREVIEW_TOKEN_PARAM);
    if (mode) allowed.set(PREVIEW_MODE_PARAM, mode);
    if (pdToken) allowed.set(PREVIEW_TOKEN_PARAM, pdToken);
    const target = buildUrl({
        to: `/${allowed.size ? `?${allowed.toString()}` : ''}`,
        urlConfig: previewOptions.urlConfig,
        params: { siteId: site.alias ?? site.id, localeId: locale.alias ?? locale.id },
    });
    const basePath = !previewOptions.basePath || previewOptions.basePath === '/' ? '' : previewOptions.basePath;
    return new Response(null, { status: 302, headers: { Location: `${basePath}${target}` } });
}
