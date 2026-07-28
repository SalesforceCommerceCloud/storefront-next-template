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

import type { MiddlewareFunction } from 'react-router';
import { appConfigContext, clientAppConfigContext, getConfig } from '@salesforce/storefront-next-runtime/config';
import { getSitesFromDataStoreLazy, type DalSite } from '@salesforce/storefront-next-runtime/data-store';
import type { Site } from '@salesforce/storefront-next-runtime/site-context';
import type { ClientAppConfig } from '@/lib/app-config-client';
import type { AppConfig } from '@/types/config';
import { getLogger } from '@/lib/logger.server';

/**
 * Narrow the DAL payload to the static {@link Site} shape the config expects,
 * dropping any site the config consumers can't safely resolve.
 *
 * `DalSite` is cast from the data-store envelope, not validated, so a site can
 * arrive missing fields the config `Site` type guarantees. A site is dropped when
 * it lacks a usable `defaultCurrency`, `defaultLocale`, `supportedLocales`, or
 * `supportedCurrencies`: feeding an empty/absent value into the config surfaces
 * downstream as a broken currency/locale fallback, and a default site with no
 * `defaultLocale` makes `siteContextMiddleware` throw on every request.
 *
 * Each field is copied by name rather than spread so only deliberately mapped
 * fields reach routing config — a field DAL adds later stays out until it's
 * mapped here. Routing identity stays config-owned: `siteContextMiddleware`
 * rebuilds each resolved site's `alias` from `siteAliasMap` (keyed by `id`) and
 * its `name` from `id`, so a per-site `alias`/`name` on the DAL payload would be
 * overwritten before routing ever reads it — they're intentionally not mapped.
 * `cookies.domain` is carried because the SDK reads it directly off the site at
 * cookie-serialize time, bypassing that rebuild.
 */
function toStaticSites(dalSites: DalSite[]): Site[] {
    const sites: Site[] = [];
    for (const dalSite of dalSites) {
        if (
            !dalSite.defaultCurrency ||
            !dalSite.defaultLocale ||
            !dalSite.supportedLocales?.length ||
            !dalSite.supportedCurrencies?.length
        ) {
            continue;
        }
        sites.push({
            id: dalSite.id,
            defaultLocale: dalSite.defaultLocale,
            defaultCurrency: dalSite.defaultCurrency,
            supportedLocales: dalSite.supportedLocales,
            supportedCurrencies: dalSite.supportedCurrencies,
            ...(dalSite.cookies?.domain != null ? { cookies: { domain: dalSite.cookies.domain } } : {}),
        });
    }
    return sites;
}

/**
 * Replaces the static `commerce.sites` with DAL-sourced sites when the
 * `commerce.sitesFromDal` flag is on and the DAL entry is present. Runs after
 * `appConfigMiddlewareServer` (which populates both config contexts) and before
 * `siteContextMiddleware` (which reads `commerce.sites` via `getConfig`).
 *
 * The rewrite must touch BOTH `appConfigContext` (server routing, read by
 * `getConfig(context)`) and `clientAppConfigContext` (serialized into
 * `window.__APP_CONFIG__`). Rewriting only the server context leaves the client
 * config stale — a divergence the `suppressHydrationWarning` on the config script
 * in `root.tsx` hides, so it never surfaces as a hydration warning. Both contexts
 * are cloned rather than mutated: their values are shared module singletons, so an
 * in-place edit would leak across requests.
 *
 * No-op when the flag is off, the DAL entry is missing/unavailable/empty, the
 * payload yields no usable sites, or the usable sites omit the configured
 * `defaultSiteId` — the static config stands. "Unavailable" here means the DAL
 * getter resolved to `null`, which is the default graceful-degradation mode; an
 * operator who sets `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` opts into
 * fail-fast, and this middleware propagates that throw rather than falling back.
 */
export const sitesConfigMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
    const config = getConfig(context);
    if (!config.commerce.sitesFromDal) {
        return next();
    }

    const logger = getLogger(context);
    const dalSites = await getSitesFromDataStoreLazy(context);
    if (!dalSites) {
        logger.debug('SitesConfig: DAL sites unavailable, keeping static config');
        return next();
    }

    const sites = toStaticSites(dalSites);
    if (!sites.length) {
        logger.debug('SitesConfig: DAL entry yielded no usable sites, keeping static config');
        return next();
    }

    // siteContextMiddleware resolves the default site by `id` and throws when it's absent, so a
    // DAL set that omits the configured default would brick every request. Falling back to the
    // static config is the reconciliation: appConfigMiddlewareServer already validated that
    // defaultSiteId exists in the static sites, so the fallback is provably safe, whereas throwing
    // here would take every site down over one missing default. The warn carries the drift so it
    // surfaces in monitoring.
    if (!sites.some((site) => site.id === config.defaultSiteId)) {
        logger.warn('SitesConfig: DAL sites omit the configured defaultSiteId, keeping static config', {
            defaultSiteId: config.defaultSiteId,
            availableDalSiteIds: sites.map((site) => site.id),
        });
        return next();
    }

    logger.debug('SitesConfig: applying DAL sites', { siteCount: sites.length });

    const appConfig = context.get(appConfigContext) as AppConfig;
    context.set(appConfigContext, { ...appConfig, commerce: { ...appConfig.commerce, sites } });

    const clientConfig = context.get(clientAppConfigContext) as ClientAppConfig;
    context.set(clientAppConfigContext, { ...clientConfig, commerce: { ...clientConfig.commerce, sites } });

    return next();
};
