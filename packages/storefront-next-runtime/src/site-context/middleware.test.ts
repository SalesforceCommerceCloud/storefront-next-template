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

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import type { DetectionConfig, SiteConfig, SiteContext } from './types';

const cookieSerialize = vi.fn((value: string, name: string) => Promise.resolve(`${name}=${value}; Path=/`));

vi.mock('./cookies', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./cookies')>();
    const mockCookie = (name: string) => ({
        name,
        serialize: (value: string) => cookieSerialize(value, name),
        parse: vi.fn(),
    });
    return {
        ...actual,
        createSiteContextCookie: vi.fn(mockCookie),
        createCurrencyCookie: vi.fn(mockCookie),
    };
});

// This is here so the middleware module is loaded after the config and cookie mocks
// thereby allowing the module to access the mock cookie serializers
async function getMiddleware() {
    const { createSiteContextMiddleware, siteContext, getSiteContextCookies } = await import('./middleware');
    return { createSiteContextMiddleware, siteContext, getSiteContextCookies };
}

const DEFAULT_CONFIG: SiteConfig = {
    sites: [
        {
            id: 'site-us',
            name: 'US',
            alias: 'us',
            defaultLocale: 'en-US',
            supportedLocales: [
                { id: 'en-US', preferredCurrency: 'USD' },
                { id: 'es-US', preferredCurrency: 'USD' },
            ],
            supportedCurrencies: ['USD'],
            defaultCurrency: 'USD',
        },
        {
            id: 'site-mx',
            name: 'Mexico',
            alias: 'mx',
            defaultLocale: 'es-MX',
            supportedLocales: [
                { id: 'es-MX', preferredCurrency: 'MXN' },
                { id: 'en-MX', preferredCurrency: 'MXN' },
            ],
            supportedCurrencies: ['MXN'],
            defaultCurrency: 'MXN',
        },
    ],
    defaultSiteId: 'site-us',
    defaultLocale: 'en-US',
};

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

describe('createSiteContextMiddleware', () => {
    let context: RouterContextProvider;
    let next: ReturnType<typeof vi.fn>;
    let defaultSiteDetection: Required<DetectionConfig>;
    let defaultLocaleDetection: Required<DetectionConfig>;
    let requestToLocaleMap: WeakMap<Request, string>;

    beforeAll(async () => {
        const configs = await vi.importActual<typeof import('./configs')>('./configs');
        const cookies = await vi.importActual<typeof import('./cookies')>('./cookies');
        defaultSiteDetection = configs.DEFAULT_SITE_DETECTION;
        defaultLocaleDetection = configs.DEFAULT_LOCALE_DETECTION;
        requestToLocaleMap = cookies.requestToLocaleMap;
    });

    beforeEach(() => {
        const store = new Map<unknown, unknown>();
        context = {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;
        next = vi.fn().mockResolvedValue(new Response('ok'));
        cookieSerialize.mockClear();
    });

    async function run(config: SiteConfig, request: Request) {
        const { createSiteContextMiddleware, siteContext: ctx } = await getMiddleware();
        const middleware = createSiteContextMiddleware(config);
        const response = (await middleware(
            { request, context, params: {}, pattern: '', url: new URL(request.url) } as Parameters<
                MiddlewareFunction<Response>
            >[0],
            next as MiddlewareNext
        )) as Response;
        return { response, context: context.get(ctx) as SiteContext };
    }

    function configWithCaches(
        siteCaches: Array<'cookie'> | readonly [],
        localeCaches: Array<'cookie'> | readonly []
    ): SiteConfig {
        return {
            ...DEFAULT_CONFIG,
            siteDetectionConfig: { ...defaultSiteDetection, caches: [...siteCaches] },
            localeDetectionConfig: { ...defaultLocaleDetection, caches: [...localeCaches] },
        };
    }

    it('resolves site and locale from path, sets context, serializes cookies, and returns response from next', async () => {
        const nextResponse = new Response('body', { status: 201 });
        next.mockResolvedValue(nextResponse);

        const request = new Request('https://example.com/mx/es-MX/page');
        const { response, context: ctx } = await run(DEFAULT_CONFIG, request);

        expect(next).toHaveBeenCalledOnce();
        expect(ctx.site.id).toBe('site-mx');
        expect(ctx.locale.id).toBe('es-MX');
        expect(ctx.currency).toBe('MXN');
        expect(ctx.siteCookie).toBeDefined();
        expect(ctx.localeCookie).toBeDefined();
        expect(ctx.currencyCookie).toBeDefined();
        expect(requestToLocaleMap.get(request)).toBe('es-MX');
        expect(response).toBe(nextResponse);
        expect(response.status).toBe(201);
        expect(await response.text()).toBe('body');
        expect(cookieSerialize).toHaveBeenCalledWith('site-mx', 'site_id');
        expect(cookieSerialize).toHaveBeenCalledWith('es-MX', 'lng');
    });

    it('uses default site and locale when path has no segments and serializes cookies', async () => {
        const request = new Request('https://example.com/');
        const { context: ctx } = await run(DEFAULT_CONFIG, request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
        expect(cookieSerialize).toHaveBeenCalledWith('site-us', 'site_id');
        expect(cookieSerialize).toHaveBeenCalledWith('en-US', 'lng');
    });

    it('resolves site from header when siteDetectionConfig.lookupHeader is provided', async () => {
        const siteDetectionConfig: DetectionConfig = {
            order: ['path', 'querystring', 'header', 'cookie'],
            lookupHeader: 'X-Custom-Site',
        };
        const request = new Request('https://example.com/', { headers: { 'X-Custom-Site': 'site-us' } });
        const { context: ctx } = await run({ ...DEFAULT_CONFIG, siteDetectionConfig }, request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
    });

    it('does not serialize site/locale cookies when caches is empty, but still sets currency cookie', async () => {
        const request = new Request('https://example.com/us/en-US/');
        const { context: ctx } = await run(configWithCaches([], []), request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(ctx.currency).toBe('USD');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
        // Currency cookie is always set (no caches config for currency)
        expect(cookieSerialize).toHaveBeenCalledWith('USD', 'currency');
        expect(cookieSerialize).toHaveBeenCalledTimes(1);
    });

    it('serializes site and currency cookies when only site caches include cookie', async () => {
        const request = new Request('https://example.com/us/en-US/');
        const { context: ctx } = await run(configWithCaches(['cookie'], []), request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
        expect(cookieSerialize).toHaveBeenCalledWith('site-us', 'site_id');
        expect(cookieSerialize).toHaveBeenCalledWith('USD', 'currency');
        expect(cookieSerialize).toHaveBeenCalledTimes(2);
    });

    it('serializes locale and currency cookies when only locale caches include cookie', async () => {
        const request = new Request('https://example.com/us/en-US/');
        const { context: ctx } = await run(configWithCaches([], ['cookie']), request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
        expect(cookieSerialize).toHaveBeenCalledWith('en-US', 'lng');
        expect(cookieSerialize).toHaveBeenCalledWith('USD', 'currency');
        expect(cookieSerialize).toHaveBeenCalledTimes(2);
    });

    it('uses custom cookie names when configured', async () => {
        const customConfig: SiteConfig = {
            ...DEFAULT_CONFIG,
            siteDetectionConfig: {
                ...defaultSiteDetection,
                lookupCookie: 'custom_site',
            },
            localeDetectionConfig: {
                ...defaultLocaleDetection,
                lookupCookie: 'custom_locale',
            },
        };
        const request = new Request('https://example.com/us/en-US/');
        const { context: ctx } = await run(customConfig, request);
        expect(ctx.site.id).toBe('site-us');
        expect(ctx.locale.id).toBe('en-US');
        expect(requestToLocaleMap.get(request)).toBe('en-US');
        expect(cookieSerialize).toHaveBeenCalledWith('site-us', 'custom_site');
        expect(cookieSerialize).toHaveBeenCalledWith('en-US', 'custom_locale');
    });

    it('provides cookies through getSiteContextCookies helper', async () => {
        const { createSiteContextMiddleware, getSiteContextCookies } = await getMiddleware();
        const middleware = createSiteContextMiddleware(DEFAULT_CONFIG);
        const request = new Request('https://example.com/us/en-US/');

        await middleware(
            { request, context, params: {}, pattern: '', url: new URL(request.url) } as Parameters<
                MiddlewareFunction<Response>
            >[0],
            next as MiddlewareNext
        );

        const cookies = getSiteContextCookies(context);
        expect(cookies).toBeDefined();
        expect(cookies?.siteCookie).toBeDefined();
        expect(cookies?.localeCookie).toBeDefined();
        expect(cookies?.currencyCookie).toBeDefined();
    });

    it('throws when no valid site and does not call next', async () => {
        const { createSiteContextMiddleware } = await getMiddleware();
        const middleware = createSiteContextMiddleware({
            ...DEFAULT_CONFIG,
            defaultSiteId: 'nonexistent',
        });
        const request = new Request('https://example.com/');

        await expect(
            middleware(
                { request, context, params: {}, pattern: '', url: new URL(request.url) } as Parameters<
                    MiddlewareFunction<Response>
                >[0],
                next as MiddlewareNext
            )
        ).rejects.toThrow('Default site nonexistent not found');
        expect(next).not.toHaveBeenCalled();
    });

    it('throws when no valid locale and does not call next', async () => {
        const { createSiteContextMiddleware } = await getMiddleware();
        const middleware = createSiteContextMiddleware({
            ...DEFAULT_CONFIG,
            defaultLocale: 'fr-FR',
        });
        const request = new Request('https://example.com/');

        await expect(
            middleware(
                { request, context, params: {}, pattern: '', url: new URL(request.url) } as Parameters<
                    MiddlewareFunction<Response>
                >[0],
                next as MiddlewareNext
            )
        ).rejects.toThrow('Default locale fr-FR not found in the list of supported locales for site site-us');
        expect(next).not.toHaveBeenCalled();
    });

    describe('cookie sync (stale cookie handling)', () => {
        let mockCreateSiteContextCookie: ReturnType<typeof vi.fn>;
        let mockCreateCurrencyCookie: ReturnType<typeof vi.fn>;

        beforeAll(async () => {
            const cookies = await import('./cookies');
            mockCreateSiteContextCookie = cookies.createSiteContextCookie as ReturnType<typeof vi.fn>;
            mockCreateCurrencyCookie = cookies.createCurrencyCookie as ReturnType<typeof vi.fn>;
        });

        afterEach(() => {
            const defaultMock = (name: string) => ({
                name,
                serialize: (value: string) => cookieSerialize(value, name),
                parse: vi.fn(),
            });
            mockCreateSiteContextCookie.mockImplementation(defaultMock);
            mockCreateCurrencyCookie.mockImplementation(defaultMock);
        });

        function withExistingCookies(siteId: string, localeId: string, currency?: string) {
            mockCreateSiteContextCookie.mockImplementation((name: string) => ({
                name,
                serialize: (value: string) => cookieSerialize(value, name),
                parse: vi.fn().mockResolvedValue(name === defaultSiteDetection.lookupCookie ? siteId : localeId),
            }));
            if (currency) {
                mockCreateCurrencyCookie.mockImplementation((name: string) => ({
                    name,
                    serialize: (value: string) => cookieSerialize(value, name),
                    parse: vi.fn().mockResolvedValue(currency),
                }));
            }
        }

        it('updates cookies when resolved site/locale differ from existing cookie values', async () => {
            // Cookie says site-mx/es-MX, but URL path resolves to site-us/en-US
            withExistingCookies('site-mx', 'es-MX');

            const request = new Request('https://example.com/us/en-US/page');
            const { response, context: ctx } = await run(configWithCaches(['cookie'], ['cookie']), request);

            expect(ctx.site.id).toBe('site-us');
            expect(ctx.locale.id).toBe('en-US');
            expect(cookieSerialize).toHaveBeenCalledWith('site-us', 'site_id');
            expect(cookieSerialize).toHaveBeenCalledWith('en-US', 'lng');
            expect(cookieSerialize).toHaveBeenCalledWith('USD', 'currency');
            expect(response.headers.getSetCookie()).toHaveLength(3);
        });

        it('does not set cookies when resolved values match existing cookies', async () => {
            // Cookie already matches what the URL resolves to
            withExistingCookies('site-us', 'en-US', 'USD');

            const request = new Request('https://example.com/us/en-US/page');
            const { response, context: ctx } = await run(configWithCaches(['cookie'], ['cookie']), request);

            expect(ctx.site.id).toBe('site-us');
            expect(ctx.locale.id).toBe('en-US');
            expect(cookieSerialize).not.toHaveBeenCalled();
            expect(response.headers.getSetCookie?.() ?? []).toHaveLength(0);
        });
    });

    describe('cookie domain', () => {
        let mockCreateSiteContextCookie: ReturnType<typeof vi.fn>;
        let mockCreateCurrencyCookie: ReturnType<typeof vi.fn>;
        // Captures the options argument that the default cookieSerialize mock drops.
        const serializeSpy = vi.fn((value: string, _name: string, _options?: unknown) =>
            Promise.resolve(`set=${value}`)
        );

        beforeAll(async () => {
            const cookies = await import('./cookies');
            mockCreateSiteContextCookie = cookies.createSiteContextCookie as ReturnType<typeof vi.fn>;
            mockCreateCurrencyCookie = cookies.createCurrencyCookie as ReturnType<typeof vi.fn>;
        });

        beforeEach(() => {
            serializeSpy.mockClear();
            const capturingMock = (name: string) => ({
                name,
                serialize: (value: string, options?: unknown) => serializeSpy(value, name, options),
                parse: vi.fn(),
            });
            mockCreateSiteContextCookie.mockImplementation(capturingMock);
            mockCreateCurrencyCookie.mockImplementation(capturingMock);
        });

        afterEach(() => {
            const defaultMock = (name: string) => ({
                name,
                serialize: (value: string) => cookieSerialize(value, name),
                parse: vi.fn(),
            });
            mockCreateSiteContextCookie.mockImplementation(defaultMock);
            mockCreateCurrencyCookie.mockImplementation(defaultMock);
        });

        it('applies the global cookieOptions.domain to all site-context cookies', async () => {
            const config: SiteConfig = { ...DEFAULT_CONFIG, cookieOptions: { domain: '.example.com' } };
            await run(config, new Request('https://example.com/us/en-US/'));

            expect(serializeSpy).toHaveBeenCalledWith('site-us', 'site_id', { path: '/', domain: '.example.com' });
            expect(serializeSpy).toHaveBeenCalledWith('en-US', 'lng', { path: '/', domain: '.example.com' });
            expect(serializeSpy).toHaveBeenCalledWith('USD', 'currency', { domain: '.example.com' });
        });

        it('per-site cookies.domain overrides the global cookieOptions.domain', async () => {
            const config: SiteConfig = {
                ...DEFAULT_CONFIG,
                cookieOptions: { domain: '.global.com' },
                sites: DEFAULT_CONFIG.sites.map((s) =>
                    s.id === 'site-us' ? { ...s, cookies: { domain: '.us-specific.com' } } : s
                ),
            };
            await run(config, new Request('https://example.com/us/en-US/'));

            expect(serializeSpy).toHaveBeenCalledWith('site-us', 'site_id', { path: '/', domain: '.us-specific.com' });
            expect(serializeSpy).toHaveBeenCalledWith('en-US', 'lng', { path: '/', domain: '.us-specific.com' });
            expect(serializeSpy).toHaveBeenCalledWith('USD', 'currency', { domain: '.us-specific.com' });
        });

        it('emits no domain when neither per-site nor global domain is set (host-only)', async () => {
            await run(DEFAULT_CONFIG, new Request('https://example.com/us/en-US/'));

            expect(serializeSpy).toHaveBeenCalledWith('site-us', 'site_id', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('en-US', 'lng', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('USD', 'currency', {});
        });

        it('falls back to host-only when the configured domain is malformed (browser-rejected)', async () => {
            // A wildcard is one of the values isValidCookieDomain rejects; a browser would drop the
            // cookie rather than accept it as a Domain attribute. We must not emit it.
            const config: SiteConfig = { ...DEFAULT_CONFIG, cookieOptions: { domain: '*.example.com' } };
            await run(config, new Request('https://example.com/us/en-US/'));

            // Same shape as the host-only (unset) case above: no `domain` key on any cookie.
            expect(serializeSpy).toHaveBeenCalledWith('site-us', 'site_id', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('en-US', 'lng', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('USD', 'currency', {});
        });

        it('falls back to host-only when the configured domain is an empty string', async () => {
            // `isValidCookieDomain('')` is `true`, so the host-only fallback for a blank domain
            // depends on the `cookieDomain &&` guard in the middleware, not on the validator. Pin
            // that guard: a future simplification to `isValidCookieDomain(domain) ? {...} : {}` must
            // not silently emit an empty `Domain=` for a blank config (reachable via
            // `PUBLIC__app__cookies__domain=`).
            const config: SiteConfig = { ...DEFAULT_CONFIG, cookieOptions: { domain: '' } };
            await run(config, new Request('https://example.com/us/en-US/'));

            expect(serializeSpy).toHaveBeenCalledWith('site-us', 'site_id', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('en-US', 'lng', { path: '/' });
            expect(serializeSpy).toHaveBeenCalledWith('USD', 'currency', {});
        });
    });
});
