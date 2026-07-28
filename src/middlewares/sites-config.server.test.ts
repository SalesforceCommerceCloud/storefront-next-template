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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual<typeof import('@salesforce/storefront-next-runtime/config')>(
        '@salesforce/storefront-next-runtime/config'
    );
    return { ...actual, getConfig: vi.fn() };
});
vi.mock('@salesforce/storefront-next-runtime/data-store', () => ({ getSitesFromDataStoreLazy: vi.fn() }));
// A single shared logger instance so tests can assert on the warn the fallback emits.
const logger = vi.hoisted(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));

import { sitesConfigMiddleware } from './sites-config.server';
import { appConfigContext, clientAppConfigContext, getConfig } from '@salesforce/storefront-next-runtime/config';
import { getSitesFromDataStoreLazy, type DalSite } from '@salesforce/storefront-next-runtime/data-store';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const STATIC_SITE = {
    id: 'RefArch',
    defaultLocale: 'en-US',
    defaultCurrency: 'USD',
    supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],
    supportedCurrencies: ['USD'],
};

// Shares STATIC_SITE's id (= the configured defaultSiteId) but differs in locale
// and currency, so "DAL replaced static" stays observable while the applied set
// still contains the default site — the invariant siteContextMiddleware enforces.
const DAL_SITE: DalSite = {
    id: 'RefArch',
    defaultLocale: 'de-DE',
    defaultCurrency: 'EUR',
    supportedLocales: [{ id: 'de-DE', preferredCurrency: 'EUR' }],
    supportedCurrencies: ['EUR'],
};

/**
 * Map-backed RouterContextProvider stub. Seeds both config contexts with the
 * static app config so the middleware can read and (when it applies DAL sites)
 * overwrite them, and exposes the raw map so a test can assert what was set.
 */
function makeContext() {
    const store = new Map<unknown, unknown>();
    const appConfig = { commerce: { sites: [STATIC_SITE], sitesFromDal: true }, defaultSiteId: 'RefArch' };
    const clientConfig = { commerce: { sites: [STATIC_SITE], sitesFromDal: true } };
    store.set(appConfigContext, appConfig);
    store.set(clientAppConfigContext, clientConfig);
    const context = {
        get: (key: unknown) => store.get(key),
        set: (key: unknown, value: unknown) => store.set(key, value),
    } as unknown as RouterContextProvider;
    return { context, store, appConfig, clientConfig };
}

async function run(context: RouterContextProvider) {
    const next = vi.fn().mockResolvedValue(new Response('ok')) as unknown as MiddlewareNext;
    await sitesConfigMiddleware(
        {
            request: new Request('https://example.com/'),
            url: new URL('https://example.com/'),
            context,
            params: {},
            pattern: '',
        } as Parameters<MiddlewareFunction<Response>>[0],
        next
    );
    return next;
}

function configWith(sitesFromDal: boolean) {
    return { commerce: { sites: [STATIC_SITE], sitesFromDal }, defaultSiteId: 'RefArch' } as never;
}

describe('sitesConfigMiddleware', () => {
    beforeEach(() => {
        vi.mocked(getSitesFromDataStoreLazy).mockReset();
        logger.warn.mockReset();
    });

    it('is a no-op when the flag is off (touches neither config context)', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(false));
        const { context, appConfig, clientConfig } = makeContext();

        const next = await run(context);

        expect(next).toHaveBeenCalledOnce();
        expect(getSitesFromDataStoreLazy).not.toHaveBeenCalled();
        // The exact original objects survive — no clone, no rewrite.
        expect(context.get(appConfigContext)).toBe(appConfig);
        expect(context.get(clientAppConfigContext)).toBe(clientConfig);
    });

    it('rewrites BOTH config contexts when the flag is on and DAL sites are present', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([DAL_SITE]);
        const { context } = makeContext();

        await run(context);

        const nextApp = context.get(appConfigContext) as { commerce: { sites: unknown[] } };
        const nextClient = context.get(clientAppConfigContext) as { commerce: { sites: unknown[] } };
        // Both contexts carry the DAL site now — asserting each independently is the point:
        // a stale clientAppConfigContext is the silent divergence root.tsx's suppressHydrationWarning hides.
        expect(nextApp.commerce.sites).toEqual([DAL_SITE]);
        expect(nextClient.commerce.sites).toEqual([DAL_SITE]);
    });

    it('clones rather than mutates the shared config singletons', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([DAL_SITE]);
        const { context, appConfig, clientConfig } = makeContext();

        await run(context);

        // The originals must be untouched — mutating them would leak across requests.
        expect(appConfig.commerce.sites).toEqual([STATIC_SITE]);
        expect(clientConfig.commerce.sites).toEqual([STATIC_SITE]);
        expect(context.get(appConfigContext)).not.toBe(appConfig);
        expect(context.get(clientAppConfigContext)).not.toBe(clientConfig);
    });

    it('falls back to static config when the DAL entry is missing (getter returns null)', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue(null);
        const { context, appConfig, clientConfig } = makeContext();

        const next = await run(context);

        expect(next).toHaveBeenCalledOnce();
        expect(context.get(appConfigContext)).toBe(appConfig);
        expect(context.get(clientAppConfigContext)).toBe(clientConfig);
    });

    it('does not carry DAL alias or name into the config (routing identity stays config-owned)', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([
            { ...DAL_SITE, alias: 'us', name: 'United States' } as DalSite,
        ]);
        const { context } = makeContext();

        await run(context);

        // siteContextMiddleware rebuilds each resolved site's `alias` from siteAliasMap and its
        // `name` from `id`, so a per-site alias/name on the DAL payload would be overwritten before
        // routing reads it. Carrying them here would be dead — the DAL owns which sites exist plus
        // their locale/currency data; config owns URL aliasing.
        const nextApp = context.get(appConfigContext) as {
            commerce: { sites: Array<{ alias?: string; name?: string }> };
        };
        expect(nextApp.commerce.sites[0].alias).toBeUndefined();
        expect(nextApp.commerce.sites[0].name).toBeUndefined();
    });

    it('drops a DAL site whose defaultCurrency is null; empties to a static fallback', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([{ ...DAL_SITE, defaultCurrency: null }]);
        const { context, appConfig } = makeContext();

        const next = await run(context);

        // Only site was unusable → no usable sites → static config stands.
        expect(next).toHaveBeenCalledOnce();
        expect(context.get(appConfigContext)).toBe(appConfig);
    });

    it('falls back to static when the DAL default site is missing defaultLocale', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        // Present default site (id matches defaultSiteId) but no defaultLocale — applying it
        // would make siteContextMiddleware throw on every request. Drop it, so no usable
        // sites remain and the static config stands.
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([{ ...DAL_SITE, defaultLocale: '' } as DalSite]);
        const { context, appConfig, clientConfig } = makeContext();

        const next = await run(context);

        expect(next).toHaveBeenCalledOnce();
        expect(context.get(appConfigContext)).toBe(appConfig);
        expect(context.get(clientAppConfigContext)).toBe(clientConfig);
    });

    it('drops a DAL site with empty supportedLocales or supportedCurrencies', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([
            { ...DAL_SITE, id: 'RefArch', supportedCurrencies: [] },
            { ...DAL_SITE, id: 'NoLocales', supportedLocales: [] },
        ]);
        const { context, appConfig } = makeContext();

        const next = await run(context);

        // Both usable-looking sites lack a supported set → no usable sites → static stands.
        expect(next).toHaveBeenCalledOnce();
        expect(context.get(appConfigContext)).toBe(appConfig);
    });

    it('keeps static config and warns with the drift when DAL sites omit the configured defaultSiteId', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        // Usable DAL sites, but none has id === defaultSiteId ('RefArch') — applying them
        // would make siteContextMiddleware throw on every request, so fall back to static.
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([{ ...DAL_SITE, id: 'SomeOtherSite' }]);
        const { context, appConfig, clientConfig } = makeContext();

        const next = await run(context);

        expect(next).toHaveBeenCalledOnce();
        expect(context.get(appConfigContext)).toBe(appConfig);
        expect(context.get(clientAppConfigContext)).toBe(clientConfig);
        // The warn must carry the missing default and the DAL IDs actually present, so the
        // drift is actionable in monitoring rather than a silent revert to static.
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('defaultSiteId'), {
            defaultSiteId: 'RefArch',
            availableDalSiteIds: ['SomeOtherSite'],
        });
    });

    it('preserves a DAL cookies.domain but drops a null-domain cookies object', async () => {
        vi.mocked(getConfig).mockReturnValue(configWith(true));
        vi.mocked(getSitesFromDataStoreLazy).mockResolvedValue([
            { ...DAL_SITE, id: 'RefArch', cookies: { domain: '.example.com' } },
            { ...DAL_SITE, id: 'NullDomain', cookies: { domain: null } },
        ]);
        const { context } = makeContext();

        await run(context);

        const sites = (
            context.get(appConfigContext) as { commerce: { sites: Array<{ id: string; cookies?: unknown }> } }
        ).commerce.sites;
        expect(sites.find((s) => s.id === 'RefArch')?.cookies).toEqual({ domain: '.example.com' });
        expect(sites.find((s) => s.id === 'NullDomain')?.cookies).toBeUndefined();
    });
});
