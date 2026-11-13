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
import { type MiddlewareFunction } from 'react-router';
import { createSiteContextMiddleware, type SiteConfig } from '@salesforce/storefront-next-runtime/site-context';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { getBasePath } from '@/lib/utils';

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

    // Create and invoke the site context middleware.
    // Wrap next() so we can intercept after site/locale resolution but BEFORE downstream
    // loaders/rendering execute — this avoids wasted rendering when we redirect.
    const middleware = createSiteContextMiddleware(siteContextConfig, {
        urlConfig: config.url,
        basePath: getBasePath(),
    });
    return middleware(args, next);
};
