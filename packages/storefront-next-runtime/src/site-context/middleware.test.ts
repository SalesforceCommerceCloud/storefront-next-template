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
import type { PreviewOptions } from './index';

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
                { id: 'en-MX', alias: 'en', preferredCurrency: 'MXN' },
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
    let actualCreateSiteContextCookie: typeof import('./cookies').createSiteContextCookie;

    beforeAll(async () => {
        const configs = await vi.importActual<typeof import('./configs')>('./configs');
        const cookies = await vi.importActual<typeof import('./cookies')>('./cookies');
        defaultSiteDetection = configs.DEFAULT_SITE_DETECTION;
        defaultLocaleDetection = configs.DEFAULT_LOCALE_DETECTION;
        requestToLocaleMap = cookies.requestToLocaleMap;
        actualCreateSiteContextCookie = cookies.createSiteContextCookie;
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

    async function run(config: SiteConfig, request: Request, options?: PreviewOptions) {
        const { createSiteContextMiddleware, siteContext: ctx } = await getMiddleware();
        const middleware = createSiteContextMiddleware(config, options);
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

    it("uses the selected site's default locale when the path locale is invalid", async () => {
        const request = new Request('https://example.com/mx/default/page');

        const { context: ctx } = await run(DEFAULT_CONFIG, request);

        expect(ctx.site.id).toBe('site-mx');
        expect(ctx.locale.id).toBe('es-MX');
        expect(requestToLocaleMap.get(request)).toBe('es-MX');
        expect(cookieSerialize).toHaveBeenCalledWith('site-mx', 'site_id');
        expect(cookieSerialize).toHaveBeenCalledWith('es-MX', 'lng');
    });

    it.each([
        'EDIT',
        'PREVIEW',
    ] as const)('applies cross-site cookie policy for %s without leaking it to a later shopper request', async (mode) => {
        const { createSiteContextMiddleware } = await getMiddleware();
        const cookies = await import('./cookies');
        const cookieOptions = {
            path: '/store',
            domain: '.example.com',
            httpOnly: true,
            maxAge: 300,
            sameSite: 'lax' as const,
            secure: false,
        };
        const config: SiteConfig = { ...DEFAULT_CONFIG, cookieOptions };
        const middleware = createSiteContextMiddleware(config);

        const invoke = async (search: string) => {
            const request = new Request(`https://example.com/us/en-US/${search}`);
            return middleware(
                { request, context, params: {}, pattern: '', url: new URL(request.url) } as Parameters<
                    MiddlewareFunction<Response>
                >[0],
                next as MiddlewareNext
            );
        };

        await invoke(`?mode=${mode}`);

        expect(vi.mocked(cookies.createSiteContextCookie).mock.calls.slice(-2)).toEqual([
            ['site_id', { ...cookieOptions, sameSite: 'none', secure: true, partitioned: true }],
            ['lng', { ...cookieOptions, sameSite: 'none', secure: true, partitioned: true }],
        ]);
        expect(vi.mocked(cookies.createCurrencyCookie).mock.calls.at(-1)).toEqual([
            'currency',
            { ...cookieOptions, sameSite: 'none', secure: true, partitioned: true, httpOnly: false },
        ]);
        expect(cookieOptions).toEqual({
            path: '/store',
            domain: '.example.com',
            httpOnly: true,
            maxAge: 300,
            sameSite: 'lax',
            secure: false,
        });

        await invoke('');
        expect(vi.mocked(cookies.createSiteContextCookie).mock.calls.slice(-2)).toEqual([
            ['site_id', cookieOptions],
            ['lng', cookieOptions],
        ]);
        expect(vi.mocked(cookies.createCurrencyCookie).mock.calls.at(-1)).toEqual([
            'currency',
            { ...cookieOptions, httpOnly: false },
        ]);
    });

    describe('initial Page Designer site handoff', () => {
        const previewOptions: PreviewOptions = {
            urlConfig: { prefix: '/:siteId/:localeId', search: '?lng=:localeId' },
        };

        it.each([
            ['mode is missing', '?__siteId=mx', previewOptions],
            ['mode is invalid', '?__siteId=mx&mode=VIEW', { urlConfig: { search: '?mode=VIEW' } }],
            ['__siteId is empty', '?__siteId=&mode=EDIT', previewOptions],
            ['preview options are omitted', '?__siteId=mx&mode=EDIT', undefined],
        ] as const)('uses normal root detection when %s', async (_caseName, search, options) => {
            const request = new Request(`https://example.com/${search}`);

            const { response, context: ctx } = await run(DEFAULT_CONFIG, request, options);

            expect(next).toHaveBeenCalledOnce();
            expect(ctx.site.id).toBe('site-us');
            expect(ctx.locale.id).toBe('en-US');
            expect(response.status).toBe(200);
            expect(response.headers.get('Location')).toBeNull();
        });

        describe('site and default-locale selection', () => {
            it.each([
                'EDIT',
                'PREVIEW',
            ] as const)('uses the selected site default instead of path or cookie locale during %s handoff', async (mode) => {
                const cookies = await import('./cookies');
                const siteContextCookie = vi.mocked(cookies.createSiteContextCookie);
                const originalImplementation = siteContextCookie.getMockImplementation();
                siteContextCookie.mockImplementation(actualCreateSiteContextCookie);
                try {
                    const siteCookie = cookies.createSiteContextCookie(defaultSiteDetection.lookupCookie);
                    const localeCookie = cookies.createSiteContextCookie(defaultLocaleDetection.lookupCookie);
                    const cookieHeader = [await siteCookie.serialize('site-us'), await localeCookie.serialize('en-MX')]
                        .map((cookie) => cookie.split(';', 1)[0])
                        .join('; ');
                    expect(await localeCookie.parse(cookieHeader)).toBe('en-MX');
                    const request = new Request(`https://example.com/us/en-US?__siteId=mx&mode=${mode}`, {
                        headers: { Cookie: cookieHeader },
                    });

                    const { response, context: ctx } = await run(DEFAULT_CONFIG, request, previewOptions);

                    expect(next).not.toHaveBeenCalled();
                    expect(ctx.site.id).toBe('site-mx');
                    expect(ctx.locale.id).toBe('es-MX');
                    expect(response.headers.get('Location')).toBe(`/mx/es-MX/?mode=${mode}&lng=es-MX`);
                } finally {
                    if (originalImplementation) {
                        siteContextCookie.mockImplementation(originalImplementation);
                    }
                }
            });

            it('uses configured default site and locale for unknown __siteId', async () => {
                const request = new Request('https://example.com/mx/en-MX/?__siteId=unknown&mode=EDIT');

                const { response, context: ctx } = await run(DEFAULT_CONFIG, request, previewOptions);

                expect(next).not.toHaveBeenCalled();
                expect(ctx.site.id).toBe('site-us');
                expect(ctx.locale.id).toBe('en-US');
                expect(response.status).toBe(302);
                expect(response.headers.get('Location')).toBe('/us/en-US/?mode=EDIT&lng=en-US');
            });

            it('uses normal detection for an unknown __siteId when the configured default site is invalid', async () => {
                const request = new Request('https://example.com/mx/en-MX/?__siteId=unknown&mode=EDIT');

                const { response, context: ctx } = await run(
                    { ...DEFAULT_CONFIG, defaultSiteId: 'nonexistent' },
                    request,
                    previewOptions
                );

                expect(next).toHaveBeenCalledOnce();
                expect(ctx.site.id).toBe('site-mx');
                expect(ctx.locale.id).toBe('en-MX');
                expect(response.status).toBe(200);
                expect(response.headers.get('Location')).toBeNull();
            });

            it('resolves the selected site default locale when configured as an alias', async () => {
                const config: SiteConfig = {
                    ...DEFAULT_CONFIG,
                    sites: DEFAULT_CONFIG.sites.map((site) =>
                        site.id === 'site-mx' ? { ...site, defaultLocale: 'en' } : site
                    ),
                };
                const request = new Request('https://example.com/?__siteId=mx&mode=EDIT');

                const { response, context: ctx } = await run(config, request, previewOptions);

                expect(next).not.toHaveBeenCalled();
                expect(ctx.site.id).toBe('site-mx');
                expect(ctx.locale.id).toBe('en-MX');
                expect(response.status).toBe(302);
                expect(response.headers.get('Location')).toBe('/mx/en/?mode=EDIT&lng=en');
            });

            it('uses normal root detection when the selected site has an invalid default locale', async () => {
                const config: SiteConfig = {
                    ...DEFAULT_CONFIG,
                    sites: DEFAULT_CONFIG.sites.map((site) =>
                        site.id === 'site-mx' ? { ...site, defaultLocale: 'fr-FR' } : site
                    ),
                };
                const request = new Request('https://example.com/?__siteId=mx&mode=EDIT');

                const { response, context: ctx } = await run(config, request, previewOptions);

                expect(next).toHaveBeenCalledOnce();
                expect(ctx.site.id).toBe('site-us');
                expect(ctx.locale.id).toBe('en-US');
                expect(response.status).toBe(200);
                expect(response.headers.get('Location')).toBeNull();
            });
        });

        describe('redirecting', () => {
            it('redirects a root request to the configured site/default-locale URL and sets cookies', async () => {
                const request = new Request(
                    'https://example.com/?__siteId=site-mx&mode=EDIT&pdToken=testToken&__customerGroup=vip&unrelated=drop&pageId=home&componentId=hero&cid=campaign'
                );

                const { response, context: ctx } = await run(DEFAULT_CONFIG, request, previewOptions);

                expect(next).not.toHaveBeenCalled();
                expect(ctx.site.id).toBe('site-mx');
                expect(ctx.locale.id).toBe('es-MX');
                expect(ctx.currency).toBe('MXN');
                expect(response.status).toBe(302);
                expect(response.headers.get('Location')).toBe('/mx/es-MX/?mode=EDIT&pdToken=testToken&lng=es-MX');
                expect(response.headers.getSetCookie()).toHaveLength(3);
            });

            it('composes the homepage with the application base path', async () => {
                const request = new Request(
                    'https://example.com/unrelated/category/path?__siteId=mx&mode=EDIT&pageId=home&componentId=hero'
                );

                const { response, context: ctx } = await run(DEFAULT_CONFIG, request, {
                    ...previewOptions,
                    basePath: '/store',
                });

                expect(next).not.toHaveBeenCalled();
                expect(ctx.site.id).toBe('site-mx');
                expect(ctx.locale.id).toBe('es-MX');
                expect(response.status).toBe(302);
                expect(response.headers.get('Location')).toBe('/store/mx/es-MX/?mode=EDIT&lng=es-MX');

                const prefixOnly = new Request('https://example.com/shop/?__siteId=mx&mode=EDIT');
                const { response: mounted } = await run(DEFAULT_CONFIG, prefixOnly, {
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    basePath: '/shop',
                });

                expect(mounted.headers.get('Location')).toBe('/shop/mx/es-MX/?mode=EDIT');
            });

            it('redirects the root using the configured locale query without a path prefix', async () => {
                const request = new Request('https://example.com/?__siteId=mx&mode=EDIT');

                const { response, context: ctx } = await run(DEFAULT_CONFIG, request, {
                    urlConfig: { search: '?lng=:localeId' },
                });

                expect(ctx.site.id).toBe('site-mx');
                expect(ctx.locale.id).toBe('es-MX');
                expect(response.headers.get('Location')).toBe('/?mode=EDIT&lng=es-MX');
            });

            it.each([
                ['PREVIEW', 'EDIT'],
                ['EDIT', 'PREVIEW'],
            ] as const)('uses the first %s mode and pdToken when the handoff repeats them', async (first, second) => {
                const request = new Request(
                    `https://example.com/?mode=${first}&mode=${second}&pdToken=first&pdToken=second&__siteId=mx`
                );

                const { response } = await run(DEFAULT_CONFIG, request, previewOptions);

                expect(response.headers.get('Location')).toBe(`/mx/es-MX/?mode=${first}&pdToken=first&lng=es-MX`);
            });
        });

        describe('after initial site handoff', () => {
            it('replays the query-only site/default-locale URL and honors a later locale query', async () => {
                const cookies = await import('./cookies');
                const siteContextCookie = vi.mocked(cookies.createSiteContextCookie);
                const originalImplementation = siteContextCookie.getMockImplementation();
                siteContextCookie.mockImplementation(actualCreateSiteContextCookie);
                try {
                    const queryOnly: Pick<SiteConfig, 'siteDetectionConfig' | 'localeDetectionConfig'> = {
                        siteDetectionConfig: {
                            order: ['querystring', 'cookie', 'path', 'header'],
                            lookupQuerystring: 'site',
                        },
                        localeDetectionConfig: {
                            order: ['querystring', 'cookie', 'path', 'header'],
                            lookupQuerystring: 'lng',
                        },
                    };
                    const queryPreviewOptions = { urlConfig: { search: '?site=:siteId&lng=:localeId' } };
                    const request = new Request('https://example.com/?__siteId=mx&mode=EDIT&pdToken=tok');

                    const { response } = await run({ ...DEFAULT_CONFIG, ...queryOnly }, request, queryPreviewOptions);

                    expect(response.headers.get('Location')).toBe('/?mode=EDIT&pdToken=tok&site=mx&lng=es-MX');

                    next.mockClear();
                    const replaySiteCookie = cookies.createSiteContextCookie(defaultSiteDetection.lookupCookie);
                    const replayLocaleCookie = cookies.createSiteContextCookie(defaultLocaleDetection.lookupCookie);
                    const replayCookieHeader = [
                        await replaySiteCookie.serialize('site-mx'),
                        await replayLocaleCookie.serialize('en-MX'),
                    ]
                        .map((cookie) => cookie.split(';', 1)[0])
                        .join('; ');
                    expect(await replayLocaleCookie.parse(replayCookieHeader)).toBe('en-MX');
                    const location = response.headers.get('Location');
                    if (!location) throw new Error('Expected redirect Location header');
                    const replay = new Request(`https://example.com${location}`, {
                        headers: { Cookie: replayCookieHeader },
                    });
                    const { context: ctx } = await run(
                        { ...DEFAULT_CONFIG, ...queryOnly },
                        replay,
                        queryPreviewOptions
                    );

                    expect(next).toHaveBeenCalledOnce();
                    expect(ctx.site.id).toBe('site-mx');
                    expect(ctx.locale.id).toBe('es-MX');

                    next.mockClear();
                    const switchedSiteCookie = cookies.createSiteContextCookie(defaultSiteDetection.lookupCookie);
                    const switchedLocaleCookie = cookies.createSiteContextCookie(defaultLocaleDetection.lookupCookie);
                    const switchedCookieHeader = [
                        await switchedSiteCookie.serialize('site-mx'),
                        await switchedLocaleCookie.serialize('es-MX'),
                    ]
                        .map((cookie) => cookie.split(';', 1)[0])
                        .join('; ');
                    expect(await switchedLocaleCookie.parse(switchedCookieHeader)).toBe('es-MX');
                    const switched = new Request('https://example.com/?mode=EDIT&pdToken=tok&site=mx&lng=en', {
                        headers: { Cookie: switchedCookieHeader },
                    });
                    const { context: switchedCtx } = await run(
                        { ...DEFAULT_CONFIG, ...queryOnly },
                        switched,
                        queryPreviewOptions
                    );
                    expect(switchedCtx.site.id).toBe('site-mx');
                    expect(switchedCtx.locale.id).toBe('en-MX');
                    expect(requestToLocaleMap.get(switched)).toBe('en-MX');
                } finally {
                    if (originalImplementation) {
                        siteContextCookie.mockImplementation(originalImplementation);
                    }
                }
            });

            it('hands off a base-path-only request and persists its selected site and locale in cookies', async () => {
                const noPathDetection: Pick<SiteConfig, 'siteDetectionConfig' | 'localeDetectionConfig'> = {
                    siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
                    localeDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
                };
                const request = new Request('https://example.com/shop/?__siteId=mx&mode=EDIT&pdToken=token&drop=me');

                const { response, context: initialContext } = await run(
                    { ...DEFAULT_CONFIG, ...noPathDetection },
                    request,
                    {
                        urlConfig: {},
                        basePath: '/shop',
                    }
                );

                expect(initialContext.site.id).toBe('site-mx');
                expect(initialContext.locale.id).toBe('es-MX');
                expect(response.status).toBe(302);
                expect(response.headers.get('Location')).toBe('/shop/?mode=EDIT&pdToken=token');
                expect(response.headers.getSetCookie()).toEqual(
                    expect.arrayContaining(['site_id=site-mx; Path=/', 'lng=es-MX; Path=/'])
                );
            });
        });

        describe('reserved search config', () => {
            it.each([
                ['mode', '?mode=VIEW'],
                ['pdToken', '?pdToken=configured'],
                ['__siteId', '?__siteId=:siteId'],
            ])('rejects URL search config that replaces reserved %s', async (key, search) => {
                const request = new Request('https://example.com/?__siteId=mx&mode=PREVIEW&pdToken=tok');

                await expect(
                    run(DEFAULT_CONFIG, request, {
                        urlConfig: key === '__siteId' ? { prefix: '/:siteId', search } : { search },
                    })
                ).rejects.toThrow(key === '__siteId' ? '__siteId' : 'mode and pdToken are reserved');
            });
        });
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
            defaultLocale: 'en-US',
            sites: DEFAULT_CONFIG.sites.map((site) =>
                site.id === 'site-us' ? { ...site, defaultLocale: 'fr-FR' } : site
            ),
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
