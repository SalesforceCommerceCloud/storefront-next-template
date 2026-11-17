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
import {
    type MiddlewareFunction,
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    redirect,
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
} from 'react-router';
import {
    createSiteContextMiddleware,
    type SiteConfig,
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    createSiteSettings,
    resolveLocaleDetectionConfig,
    resolveSiteContext,
    resolveSiteDetectionConfig,
    serializeContextCookies,
    siteContext,
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
} from '@salesforce/storefront-next-runtime/site-context';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { isAuthRecoveryRequest, resolveAuthRecoveryDestination } from '@/lib/auth/auth-recovery.server';
import { getBasePath } from '@/lib/utils';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { createRecoveryErrorResponse } from '@/lib/auth/recovery-error.server';

/**
 * Creates and returns the site context middleware configured with the app's site, locale, and currency settings.
 * This middleware resolves the current site, locale, and currency from the request and stores them in context.
 *
 * Must run BEFORE i18next middleware.
 */
export const siteContextMiddleware: MiddlewareFunction<Response> = async (args, next) => {
    const logger = getLogger(args.context);
    const config = getConfig(args.context);
    const sites = config.commerce.sites;

    logger.debug('SiteContext: middleware starting', {
        siteCount: sites.length,
        defaultSiteId: config.defaultSiteId,
    });

    if (!sites.length) {
        logger.error('SiteContext: no sites configured');
        throw new Error('No sites found.');
    }
    const defaultSiteId = config.defaultSiteId;
    const siteAliasMap = config.siteAliasMap;
    const localeAliasMap = config.localeAliasMap;
    const defaultSite = sites.find((site) => site.id === defaultSiteId);
    if (!defaultSite?.defaultLocale) {
        logger.error('SiteContext: default site missing defaultLocale', { defaultSiteId });
        throw new Error(`Site "${config.defaultSiteId}" must have a defaultLocale configured. `);
    }

    // The cookie Domain is governed solely by app.cookies.domain (global default) plus the
    // per-site commerce.sites[].cookies.domain (applied in the SDK at serialize time), so every
    // storefront cookie shares one resolved domain. cookieOptions supplies only the OTHER
    // site-context cookie attributes (httpOnly, sameSite, maxAge, ...) — any domain placed there
    // is dropped to prevent it diverging from the auth cookies. Unset → host-only scoping.
    const cookieAttrs = { ...config.siteContext?.cookieOptions };
    delete cookieAttrs.domain;
    const cookieOptions = config.cookies?.domain ? { ...cookieAttrs, domain: config.cookies.domain } : cookieAttrs;

    // Transform app config into site context config format
    const siteContextConfig: SiteConfig = {
        sites: sites.map((site) => ({
            ...site,
            alias: siteAliasMap?.[site.id],
            name: site.id,
            supportedLocales: site.supportedLocales.map((locale) => ({
                ...locale,
                alias: localeAliasMap?.[locale.id],
            })),
        })),
        defaultSiteId,
        defaultLocale: defaultSite.defaultLocale,
        siteDetectionConfig: config.siteDetectionConfig,
        localeDetectionConfig: config.localeDetectionConfig,
        currencyCookieName: config.siteContext?.currencyCookieName,
        cookieOptions,
    };

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    const recoveryRequest = isAuthRecoveryRequest(args.request);
    const query = new URL(args.request.url).searchParams;
    const siteDetection = resolveSiteDetectionConfig(config.siteDetectionConfig);
    const localeDetection = resolveLocaleDetectionConfig(config.localeDetectionConfig);
    const siteKey = siteDetection.lookupQuerystring;
    const localeKey = localeDetection.lookupQuerystring;
    const reject = (status: 400 | 409 = 400): never => {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error
        throw createRecoveryErrorResponse(args.request, config, status);
    };
    if (recoveryRequest) {
        if (!siteKey || !localeKey || siteKey === localeKey || siteKey === 'returnTo' || localeKey === 'returnTo')
            reject();
        validateRecoveryQuery(new URL(args.request.url), [siteKey, localeKey], reject);
        // Old direct GETs without explicit context retain normal detection. A partial
        // or invalid pair must not fall back to stale cookies before site-scoped auth.
        if (query.has(siteKey) || query.has(localeKey)) {
            const siteRef = query.get(siteKey);
            const localeRef = query.get(localeKey);
            const matchingSites = siteContextConfig.sites.filter(
                (candidate) => candidate.id === siteRef || candidate.alias === siteRef
            );
            const site = matchingSites[0];
            const matchingLocales = site?.supportedLocales.filter(
                (candidate) => candidate.id === localeRef || candidate.alias === localeRef
            );
            const locale = matchingLocales?.[0];
            if (!siteRef || !localeRef || query.getAll(siteKey).length !== 1 || query.getAll(localeKey).length !== 1) {
                reject();
            }
            if (matchingSites.length > 1 || (matchingLocales?.length ?? 0) > 1) reject();
            const globallyKnownLocale = siteContextConfig.sites.some((candidate) =>
                candidate.supportedLocales.some((value) => value.id === localeRef || value.alias === localeRef)
            );
            if (!site || !globallyKnownLocale) {
                return redirect(new URL(`${getBasePath()}/`, args.request.url).href, {
                    status: 303,
                    headers: { 'Cache-Control': 'no-store' },
                });
            }
            if (!locale) reject();
            siteContextConfig.siteDetectionConfig = { ...config.siteDetectionConfig, order: ['querystring'] };
            siteContextConfig.localeDetectionConfig = { ...config.localeDetectionConfig, order: ['querystring'] };
        }
    }
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    // Preview handoff redirects need the URL shape the storefront actually serves.
    const middleware = createSiteContextMiddleware(siteContextConfig, {
        urlConfig: config.url,
        basePath: getBasePath(),
    });
    return middleware(args, async () => {
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        if (recoveryRequest) {
            const current = args.context.get(siteContext);
            if (!current) throw new Error('Site context was not resolved');
            const { site, locale } = current;
            let resolved: ReturnType<typeof resolveAuthRecoveryDestination>;
            try {
                resolved = resolveAuthRecoveryDestination(query.get('returnTo') ?? '/', args.request.url);
            } catch (error) {
                if (error instanceof Response && error.status === 400) reject();
                throw error;
            }
            const { destination, params: prefixParams } = resolved;
            const target = new URL(destination, args.request.url);
            validateRecoveryQuery(target, [siteKey, localeKey], reject);
            for (const [key, pathKey, expected, values] of [
                [siteKey, 'siteId', site.id, siteContextConfig.sites],
                [localeKey, 'localeId', locale.id, site.supportedLocales],
            ] as const) {
                const refs = [
                    ...target.searchParams.getAll(key),
                    ...(prefixParams?.[pathKey] ? [prefixParams[pathKey]] : []),
                ];
                if (target.searchParams.getAll(key).length > 1) reject();
                for (const ref of refs) {
                    const matches = values.filter((value) => value.id === ref || value.alias === ref);
                    if (matches.length !== 1 || matches[0].id !== expected) reject();
                }
            }
            // Project only cookies the configured policy will publish, preserving every
            // unrelated cookie/header. Resolve the ordinary destination before auth runs.
            const contextCookies = (
                await serializeContextCookies(args.request, new Response(), createSiteSettings(siteContextConfig), {
                    site,
                    locale,
                    currency: current.currency,
                })
            ).filter((value) =>
                [current.siteCookie.name, current.localeCookie.name].some((name) => value.startsWith(`${name}=`))
            );
            const headers = new Headers(args.request.headers);
            headers.set('Cookie', projectRecoveryCookies(args.request, contextCookies));
            const restored = await resolveSiteContext(
                new Request(target, { headers }),
                createSiteSettings({
                    ...siteContextConfig,
                    siteDetectionConfig: config.siteDetectionConfig,
                    localeDetectionConfig: config.localeDetectionConfig,
                })
            );
            if (restored.site.id !== site.id || restored.locale.id !== locale.id) reject(409);
        }
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
        return next();
    });
};

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
/** Validate configured identity fields before URLSearchParams' forgiving decoder loses malformed input. */
function validateRecoveryQuery(url: URL, keys: string[], reject: () => never) {
    for (const field of url.search.slice(1).split('&')) {
        const separator = field.indexOf('=');
        const rawKey = separator < 0 ? field : field.slice(0, separator);
        if (!keys.includes(new URLSearchParams(`${rawKey}=`).keys().next().value ?? '')) continue;
        // A malformed escape decodes to null and is rejected below (fail closed).
        let value: string | null;
        try {
            value = decodeURIComponent((separator < 0 ? '' : field.slice(separator + 1)).replace(/\+/g, ' '));
        } catch {
            value = null;
        }
        if (
            !value ||
            value.includes('/') ||
            value.includes('\\') ||
            [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
        ) {
            reject();
        }
    }
}

/** Overlay the context cookies recovery will write onto the request's Cookie header (first duplicate wins).
 * Browser cookie-acceptance rules (domain, prefix, Secure, SameSite) are deliberately not emulated.
 */
export function projectRecoveryCookies(request: Request, writes: string[]): string {
    const cookies = new Map<string, string>();
    for (const part of (request.headers.get('Cookie') ?? '').split(';').map((value) => value.trim())) {
        if (!part.includes('=')) continue;
        const name = part.slice(0, part.indexOf('='));
        if (name && !cookies.has(name)) cookies.set(name, part);
    }
    for (const write of writes) {
        const pair = write.split(';')[0].trim();
        cookies.set(pair.slice(0, pair.indexOf('=')), pair);
    }
    return [...cookies.values()].join('; ');
}
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
