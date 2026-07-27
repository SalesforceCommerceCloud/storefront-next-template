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
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { type DataStrategyResult, RouterContextProvider } from 'react-router';
import legacyRoutesMiddleware from '@/middlewares/legacy-routes.client';
import { matchesRoutePattern, findLegacyRoute } from '@/middlewares/legacy-routes';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig } from '@/types/config';
import { getSiteRef, mockAltSiteObject, mockSiteObject } from '@/test-utils/config';

describe('legacyRoutesMiddleware', () => {
    let mockContext: RouterContextProvider;
    let mockNext: ReturnType<typeof vi.fn<() => Promise<Record<string, DataStrategyResult>>>>;

    beforeEach(() => {
        mockContext = new RouterContextProvider();
        mockNext = vi.fn<() => Promise<Record<string, DataStrategyResult>>>().mockResolvedValue({});

        // Mock context.get to return config
        vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
            if (contextKey === appConfigContext) {
                return {
                    hybrid: {
                        enabled: true,
                        legacyRoutes: ['/checkout', '/account', '/s/'],
                    },
                } as unknown as AppConfig;
            }
            return undefined;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('server-side behavior', () => {
        test('should skip middleware on server-side (window undefined)', async () => {
            // Simulate server-side by stubbing window as undefined
            vi.stubGlobal('window', undefined);

            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });
    });

    describe('client-side behavior with hybrid disabled', () => {
        beforeEach(() => {
            // Mock window for client-side
            vi.stubGlobal('window', {} as Window & typeof globalThis);

            // Override config to disable hybrid
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: false,
                            legacyRoutes: ['/checkout'],
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test('should skip when hybrid mode is disabled', async () => {
            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });
    });

    describe('client-side behavior with no legacy routes', () => {
        beforeEach(() => {
            vi.stubGlobal('window', {} as Window & typeof globalThis);

            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            legacyRoutes: [],
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test('should skip when legacyRoutes is empty', async () => {
            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('should skip when legacyRoutes is undefined', async () => {
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            // legacyRoutes is undefined
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });

            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });
    });

    describe('client-side legacy route matching', () => {
        beforeEach(() => {
            // Mock window for client-side - simple object that allows property access
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);
        });

        test('should trigger redirect path when path matches legacy route exactly', () => {
            const request = new Request('https://example.com/checkout');

            // Don't await — the middleware returns a never-resolving promise on redirect paths
            // (keeps React Router suspended while the browser navigates away)
            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // window.location.href is set synchronously before the promise
            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/checkout');
        });

        test('should not redirect when path does not exactly match', async () => {
            const request = new Request('https://example.com/checkout/payment');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // Should continue normal navigation since /checkout/payment !== /checkout
            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('should trigger redirect path and preserve existing query params', () => {
            const request = new Request('https://example.com/checkout?step=2&item=abc');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            // Query string is preserved verbatim — no extra params are injected.
            expect(window.location.href).toBe('https://example.com/checkout?step=2&item=abc');
        });

        test('should trigger redirect path and preserve hash fragment', () => {
            const request = new Request('https://example.com/checkout#payment');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/checkout#payment');
        });

        test('should continue normal navigation when path does not match', async () => {
            const request = new Request('https://example.com/product/123');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('should only match exact paths configured in legacyRoutes', async () => {
            // /s/ is in legacyRoutes, but a full legacy path like /s/<siteId>/en_US/Cart-Show is not
            const request = new Request(`https://example.com/s/${mockAltSiteObject.id}/en_US/Cart-Show`);

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // Should continue normal navigation since it's not an exact match
            expect(mockNext).toHaveBeenCalledOnce();
        });
    });

    describe('no internal params leak to the legacy backend', () => {
        beforeEach(() => {
            // Mock window for client-side
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);
        });

        test('does not append a redirected=1 (or any) loop-guard param to the redirect URL', () => {
            // The redirect target is handed to the legacy backend (SFRA/SiteGenesis), whose SEO
            // URL rules 404 on unexpected query params. The middleware must not inject any param of
            // its own — no loop guard is needed because RR does not run client middleware on the
            // resulting full-document load (see the middleware's header comment).
            const request = new Request('https://example.com/checkout');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(window.location.href).toBe('https://example.com/checkout');
            expect(window.location.href).not.toContain('redirected');
        });

        test('passes an incoming redirected=1 through untouched (no special-casing)', () => {
            // If some upstream actually sends , we neither strip nor act on it — it is
            // just an ordinary query param now. (Guards against re-introducing loop-guard behavior.)
            const request = new Request('https://example.com/checkout');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/checkout');
        });
    });

    describe('data/resource endpoints are never routed to legacy', () => {
        beforeEach(() => {
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);

            // Config that reproduces the original bug: '/' is a legacy route AND a two-segment
            // url.prefix whose segments are both wildcards. Without the guard, stripPathPrefix
            // reduces '/resource/basket-products' → '/' and the fetcher load bounces to legacy.
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: { enabled: true, legacyRoutes: ['/', '/checkout'] },
                        url: { prefix: '/:siteId/:localeId' },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test.each([
            '/resource/basket-products',
            '/resource/recommendations',
            '/action/cart-item-update',
            '/global/en-GB/cart.data',
            '/mobify/proxy/api/foo',
            '/assets/index-abc123.js',
            '/favicon.ico',
            '/assets/logo.svg',
        ])('does not redirect infrastructure path %s to legacy', async (path) => {
            const request = new Request(`https://example.com${path}`);

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // Must fall through to React Router, NOT trigger a full-page legacy navigation.
            expect(mockNext).toHaveBeenCalledOnce();
            expect(window.location.href).toBe('');
        });

        test('still redirects a real legacy page navigation that strips to "/"', () => {
            // Sanity: the guard is scoped to data/resource endpoints only — a genuine prefixed
            // home navigation (/global/en-GB) still strips to '/' and routes to legacy.
            const request = new Request('https://example.com/global/en-GB');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/');
        });

        test.each([
            '/action-figures',
            '/assets-guide',
            '/resourceful',
        ])('does NOT skip legacy route %s that merely starts with an infra word', (path) => {
            // The skip-list boundary is `^/(resource|action|mobify|assets)(/|$)` — a route whose
            // name only starts with an infra word (no '/' boundary) must still route to legacy.
            // Locks the boundary against a careless regex edit (e.g. dropping the `(/|$)`).
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: { enabled: true, legacyRoutes: [path] },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
            const request = new Request(`https://example.com${path}`);

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe(`https://example.com${path}`);
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            // Mock window for client-side
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);
        });

        test('should handle config with null hybrid property', async () => {
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: null,
                    } as unknown as AppConfig;
                }
                return undefined;
            });

            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('should handle missing config gracefully', async () => {
            vi.spyOn(mockContext, 'get').mockReturnValue(undefined);

            const request = new Request('https://example.com/checkout');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('should use exact matching, not prefix matching', async () => {
            // /account is a legacy route, but /accounts is not (exact matching)
            const request = new Request('https://example.com/accounts/profile');

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // Should continue normal navigation since /accounts/profile !== /account
            expect(mockNext).toHaveBeenCalledOnce();
        });
    });

    describe('matchesRoutePattern', () => {
        test('should match exact routes', () => {
            expect(matchesRoutePattern('/checkout', '/checkout')).toBe(true);
            expect(matchesRoutePattern('/account/orders', '/account/orders')).toBe(true);
            expect(matchesRoutePattern('/checkout', '/account')).toBe(false);
            expect(matchesRoutePattern('/checkout/payment', '/checkout')).toBe(false);
        });

        test('should match single parameter routes', () => {
            expect(matchesRoutePattern('/product/123', '/product/:id')).toBe(true);
            expect(matchesRoutePattern('/product/abc-xyz', '/product/:id')).toBe(true);
            expect(matchesRoutePattern('/user/john-doe', '/user/:username')).toBe(true);
            // Should not match different base paths
            expect(matchesRoutePattern('/products/123', '/product/:id')).toBe(false);
            // Should not match with extra or missing segments
            expect(matchesRoutePattern('/product/123/details', '/product/:id')).toBe(false);
            expect(matchesRoutePattern('/product', '/product/:id')).toBe(false);
        });

        test('should match multiple parameter routes', () => {
            expect(matchesRoutePattern('/category/shoes/item/123', '/category/:cat/item/:id')).toBe(true);
            expect(matchesRoutePattern('/store/NYC/product/abc', '/store/:location/product/:id')).toBe(true);
            expect(matchesRoutePattern('/checkout/step/1', '/checkout/step/:id')).toBe(true);
            // Should not match with wrong segments
            expect(matchesRoutePattern('/category/shoes', '/category/:cat/item/:id')).toBe(false);
            expect(matchesRoutePattern('/category/shoes/item/123/view', '/category/:cat/item/:id')).toBe(false);
        });

        test('should handle special cases', () => {
            // Special regex characters in paths
            expect(matchesRoutePattern('/path.with.dots/123', '/path.with.dots/:id')).toBe(true);
            expect(matchesRoutePattern('/pathXwithXdots/123', '/path.with.dots/:id')).toBe(false);
            // Parameters should not match slashes
            expect(matchesRoutePattern('/product/123/456', '/product/:id')).toBe(false);
        });

        test('should match trailing wildcard patterns across any depth', () => {
            // Single segment, multi-segment, and empty tail all match
            expect(matchesRoutePattern('/categoryLv1/shoes', '/categoryLv1/*')).toBe(true);
            expect(matchesRoutePattern('/categoryLv1/shoes/running', '/categoryLv1/*')).toBe(true);
            expect(matchesRoutePattern('/categoryLv1/', '/categoryLv1/*')).toBe(true);
            // Different base path should not match
            expect(matchesRoutePattern('/categoryLv2/shoes', '/categoryLv1/*')).toBe(false);
            // Parent path without the trailing slash does not match the '/categoryLv1/*' form
            expect(matchesRoutePattern('/categoryLv1', '/categoryLv1/*')).toBe(false);
        });

        test('should match a wildcard combined with a named param', () => {
            // Named param stays single-segment; wildcard absorbs the rest
            expect(matchesRoutePattern('/category/shoes/details/blue', '/category/:cat/*')).toBe(true);
            expect(matchesRoutePattern('/category/shoes/', '/category/:cat/*')).toBe(true);
        });

        test('should match a root wildcard against any path', () => {
            expect(matchesRoutePattern('/anything', '*')).toBe(true);
            expect(matchesRoutePattern('/a/b/c', '*')).toBe(true);
        });

        test('should match wildcards in the middle of a pattern', () => {
            // '*' is not restricted to a trailing splat — it matches any content (including '/') anywhere
            expect(matchesRoutePattern('/api/v1/data', '/api/*/data')).toBe(true);
            expect(matchesRoutePattern('/api/v1/v2/data', '/api/*/data')).toBe(true);
            expect(matchesRoutePattern('/api/data', '/api/*/data')).toBe(false);
            // Combine prefix + suffix around a non-trailing '*'
            expect(matchesRoutePattern('/files/photo-thumb', '/files/*-thumb')).toBe(true);
            expect(matchesRoutePattern('/files/photo-full', '/files/*-thumb')).toBe(false);
        });
    });

    describe('findLegacyRoute', () => {
        test('returns the matched entry for a bare-string route (no suffix)', () => {
            const match = findLegacyRoute('/checkout', ['/cart', '/checkout']);
            expect(match).toEqual({ pattern: '/checkout' });
            expect(match?.suffix).toBeUndefined();
        });

        test('returns the matched entry with its suffix for an object route', () => {
            const routes = ['/cart', { pattern: '/product/:id', suffix: '.html' }];
            expect(findLegacyRoute('/product/123', routes)).toEqual({ pattern: '/product/:id', suffix: '.html' });
        });

        test('returns undefined when nothing matches', () => {
            expect(
                findLegacyRoute('/category/shoes', ['/cart', { pattern: '/product/:id', suffix: '.html' }])
            ).toBeUndefined();
        });

        test('returns the first matching entry when multiple patterns match', () => {
            const routes = [{ pattern: '/product/:id', suffix: '.html' }, '/product/*'];
            expect(findLegacyRoute('/product/123', routes)).toEqual({ pattern: '/product/:id', suffix: '.html' });
        });

        test('does not apply a bare string route as a suffixed one', () => {
            // A plain string keeps clean-path behavior — no suffix leaks in.
            expect(findLegacyRoute('/cart', ['/cart'])?.suffix).toBeUndefined();
        });

        describe('trailing-slash tolerance', () => {
            test('matches an exact pattern when the pathname has a trailing slash', () => {
                // SFRA/SG and CDN rewrites are inconsistent about trailing slashes; '/login/' must
                // still match a '/login' legacy route so both forms route to the same backend.
                expect(findLegacyRoute('/login/', ['/login'])).toEqual({ pattern: '/login' });
                expect(findLegacyRoute('/login', ['/login'])).toEqual({ pattern: '/login' });
            });

            test('matches a :param pattern with a trailing slash', () => {
                expect(findLegacyRoute('/product/123/', [{ pattern: '/product/:id', suffix: '.html' }])).toEqual({
                    pattern: '/product/:id',
                    suffix: '.html',
                });
            });

            test('does not treat bare root differently (no empty-string candidate)', () => {
                expect(findLegacyRoute('/', ['/'])).toEqual({ pattern: '/' });
            });

            test('preserves splat semantics: bare parent still does not match /parent/*', () => {
                // The documented behavior — '/categoryLv1/*' does NOT match bare '/categoryLv1' —
                // must be unaffected by trailing-slash tolerance.
                expect(findLegacyRoute('/categoryLv1', ['/categoryLv1/*'])).toBeUndefined();
                expect(findLegacyRoute('/categoryLv1/', ['/categoryLv1/*'])).toEqual({ pattern: '/categoryLv1/*' });
            });

            test('does not match an unrelated route just because of slash trimming', () => {
                expect(findLegacyRoute('/accounts/', ['/account'])).toBeUndefined();
            });
        });
    });

    describe('client-side redirect with per-route suffix', () => {
        beforeEach(() => {
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);

            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            legacyRoutes: [
                                '/cart',
                                { pattern: '/product/:id', suffix: '.html' },
                                { pattern: '/categoryLv1/*', suffix: '.html' },
                            ],
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test('appends the suffix to the redirect path for a suffixed route', () => {
            const request = new Request('https://example.com/product/552437');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/product/552437.html');
        });

        test('appends the suffix before the query string and preserves all params', () => {
            const request = new Request(
                'https://example.com/product/552437?Quantity=1&uuid=83f650ea79f62ea4950d45ad08&source=cart'
            );

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            // .html lands on the path, not after the query string; original params survive.
            expect(window.location.href).toBe(
                'https://example.com/product/552437.html?Quantity=1&uuid=83f650ea79f62ea4950d45ad08&source=cart'
            );
        });

        test('appends the suffix before the hash fragment', () => {
            const request = new Request('https://example.com/product/552437#reviews');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(window.location.href).toBe('https://example.com/product/552437.html#reviews');
        });

        test('does not double-append when the path already ends with the suffix', () => {
            const request = new Request('https://example.com/product/552437.html');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(window.location.href).toBe('https://example.com/product/552437.html');
        });

        test('does not append a suffix to a clean-path legacy route', () => {
            const request = new Request('https://example.com/cart');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            // /cart has no suffix — must stay clean, not become /cart.html
            expect(window.location.href).toBe('https://example.com/cart');
        });

        test('appends the suffix to the full splat tail for a wildcard route', () => {
            // A '/categoryLv1/*' entry with a suffix appends to the entire matched tail, so the
            // legacy backend receives e.g. /categoryLv1/shoes/running.html
            const request = new Request('https://example.com/categoryLv1/shoes/running');

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/categoryLv1/shoes/running.html');
        });
    });

    describe('multisite prefix stripping', () => {
        beforeEach(() => {
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);

            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            legacyRoutes: ['/checkout', '/account/orders', '/product/:id'],
                        },
                        url: {
                            prefix: '/:siteId/:localeId',
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test('should redirect when multisite-prefixed URL matches a bare legacy route', () => {
            const siteRef = getSiteRef();
            const locale = mockSiteObject.defaultLocale;
            const request = new Request(`https://example.com/${siteRef}/${locale}/checkout`);

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            // Navigation target must be the stripped pathname so the legacy backend (or local
            // hybrid proxy) can apply its own prefix without doubling up on storefront-next's.
            expect(window.location.href).toBe('https://example.com/checkout');
        });

        test('should redirect for parameterized legacy routes with multisite prefix', () => {
            const siteRef = getSiteRef();
            const locale = mockSiteObject.defaultLocale;
            const request = new Request(`https://example.com/${siteRef}/${locale}/product/123`);

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/product/123');
        });

        test('should preserve query params and hash when stripping prefix', () => {
            const siteRef = getSiteRef();
            const locale = mockSiteObject.defaultLocale;
            const request = new Request(`https://example.com/${siteRef}/${locale}/checkout?step=2&item=abc#payment`);

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/checkout?step=2&item=abc#payment');
        });

        test('should not redirect for non-legacy multisite routes', async () => {
            const request = new Request(
                `https://example.com/${getSiteRef()}/${mockSiteObject.defaultLocale}/category/womens`
            );

            await legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('strips the site/locale prefix and then appends the suffix on the stripped path', () => {
            // The production hybrid scenario: a multisite-prefixed PDP URL hitting a suffixed
            // legacy route. The prefix is stripped first, then '.html' is appended to the bare
            // path — so the legacy backend receives /product/123.html with no doubled prefix.
            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            legacyRoutes: [{ pattern: '/product/:id', suffix: '.html' }],
                        },
                        url: { prefix: '/:siteId/:localeId' },
                    } as unknown as AppConfig;
                }
                return undefined;
            });

            const siteRef = getSiteRef();
            const locale = mockSiteObject.defaultLocale;
            const request = new Request(`https://example.com/${siteRef}/${locale}/product/123?source=cart`);

            void legacyRoutesMiddleware(
                { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                mockNext
            );

            expect(mockNext).not.toHaveBeenCalled();
            expect(window.location.href).toBe('https://example.com/product/123.html?source=cart');
        });
    });

    describe('client-side parameterized route matching', () => {
        beforeEach(() => {
            vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);

            vi.spyOn(mockContext, 'get').mockImplementation((contextKey: any) => {
                if (contextKey === appConfigContext) {
                    return {
                        hybrid: {
                            enabled: true,
                            legacyRoutes: [
                                '/checkout',
                                '/product/:id',
                                '/category/:cat/item/:id',
                                '/user/:username/profile',
                            ],
                        },
                    } as unknown as AppConfig;
                }
                return undefined;
            });
        });

        test('should trigger redirects for parameterized routes', () => {
            const testCases = [
                'https://example.com/product/123', // Single parameter
                'https://example.com/category/electronics/item/abc-123', // Multiple parameters
                'https://example.com/user/john-doe/profile', // Mixed route
                'https://example.com/checkout', // Exact match alongside parameterized
                'https://example.com/product/123?color=blue&size=large', // With query params
                'https://example.com/product/123#reviews', // With hash
                'https://example.com/product/abc-123_xyz', // Hyphens and underscores
            ];

            for (const url of testCases) {
                // Reset window.location.href before each iteration
                (window as any).location.href = '';
                const request = new Request(url);
                void legacyRoutesMiddleware(
                    { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                    mockNext
                );
                expect(mockNext).not.toHaveBeenCalled();
                // A full-page redirect was triggered (href set), with no injected loop-guard param.
                expect(window.location.href).not.toBe('');
                expect(window.location.href).not.toContain('redirected');
                mockNext.mockClear();
            }
        });

        test('should continue normal navigation when routes do not match', async () => {
            const testCases = [
                'https://example.com/product/123/details', // Extra segments
                'https://example.com/category/shoes', // Missing segments
                'https://example.com/products/123', // Different base path
            ];

            for (const url of testCases) {
                const request = new Request(url);
                await legacyRoutesMiddleware(
                    { request, context: mockContext, params: {}, pattern: '', url: new URL(request.url) },
                    mockNext
                );
                expect(mockNext).toHaveBeenCalledOnce();
                mockNext.mockClear();
            }
        });
    });
});
