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
import { describe, expect, it } from 'vitest';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import {
    applyUrlConfig,
    cloneRootIndexRoutes,
    partitionRoutes,
    normalizeRoutePaths,
    createPrefixWrapper,
} from './apply-url-config';

// Helpers to build test route entries
function route(overrides: Partial<RouteConfigEntry> & { id: string; file: string }): RouteConfigEntry {
    return { ...overrides } as RouteConfigEntry;
}

function layoutRoute(id: string, file: string, children: RouteConfigEntry[]): RouteConfigEntry {
    return { id, file, children } as RouteConfigEntry;
}

function indexRoute(id: string, file: string): RouteConfigEntry {
    return { id, file, index: true } as RouteConfigEntry;
}

const WRAPPER_FILE = 'app-wrapper.tsx';

describe('cloneRootIndexRoutes', () => {
    it('should duplicate a top-level index route', () => {
        const routes = [indexRoute('routes/_index', 'routes/_index.tsx')];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('routes/_index--root-duplicate');
        expect(result[0].index).toBe(true);
        expect(result[0].file).toBe('routes/_index.tsx');
    });

    it('should duplicate an index route nested inside a pathless layout', () => {
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [
                indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                route({ id: 'routes/_app.cart', file: 'routes/_app.cart.tsx', path: '/cart' }),
            ]),
        ];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('routes/_app--root-duplicate');
        expect(result[0].file).toBe('routes/_app.tsx');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children?.[0].id).toBe('routes/_app._index--root-duplicate');
        expect(result[0].children?.[0].index).toBe(true);
    });

    it('should return empty array when no index routes exist', () => {
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [
                route({ id: 'routes/_app.about', file: 'routes/_app.about.tsx', path: '/about' }),
            ]),
        ];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(0);
    });

    it('should skip routes with a path (non-pathless layouts)', () => {
        const routes = [
            {
                id: 'routes/dashboard',
                file: 'routes/dashboard.tsx',
                path: '/dashboard',
                children: [indexRoute('routes/dashboard._index', 'routes/dashboard._index.tsx')],
            } as RouteConfigEntry,
        ];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(0);
    });

    it('should handle multiple pathless layouts — only those with index children', () => {
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
            layoutRoute('routes/_empty', 'routes/_empty.tsx', [
                route({ id: 'routes/_empty.login', file: 'routes/_empty.login.tsx', path: '/login' }),
            ]),
        ];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('routes/_app--root-duplicate');
    });

    it('should handle pathless layout with no children', () => {
        const routes = [layoutRoute('routes/_app', 'routes/_app.tsx', [])];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(0);
    });

    it('should not treat an index route with its own path as the site root', () => {
        // e.g. `_app.order-lookup._index` is `index: true` with `path: 'order-lookup'` —
        // it's the index of /order-lookup, not the homepage, and must not be duplicated at /.
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [
                route({
                    id: 'routes/_app.order-lookup._index',
                    file: 'routes/_app.order-lookup._index.tsx',
                    path: 'order-lookup',
                    index: true,
                }),
                indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
            ]),
        ];

        const result = cloneRootIndexRoutes(routes);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('routes/_app--root-duplicate');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children?.[0].id).toBe('routes/_app._index--root-duplicate');
    });
});

describe('partitionRoutes', () => {
    it('should separate excluded routes from included routes', () => {
        const routes = [
            route({ id: 'routes/_app', file: 'routes/_app.tsx' }),
            route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            route({ id: 'routes/resource.stores', file: 'routes/resource.stores.ts', path: '/resource/stores' }),
        ];

        const result = partitionRoutes(routes, ['/action/**', '/resource/**']);

        expect(result.includedRoutes).toHaveLength(1);
        expect(result.includedRoutes[0].id).toBe('routes/_app');
        expect(result.excludedRoutes).toHaveLength(2);
        expect(result.excludedRoutes.map((r) => r.id)).toEqual(['routes/action.cart', 'routes/resource.stores']);
    });

    it('should return all routes when no patterns match', () => {
        const routes = [
            route({ id: 'routes/_app', file: 'routes/_app.tsx' }),
            route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' }),
        ];

        const result = partitionRoutes(routes, ['/api/**']);

        expect(result.includedRoutes).toHaveLength(2);
        expect(result.excludedRoutes).toHaveLength(0);
    });

    it('should exclude all routes when all match', () => {
        const routes = [
            route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            route({ id: 'routes/action.login', file: 'routes/action.login.tsx', path: '/action/login' }),
        ];

        const result = partitionRoutes(routes, ['/action/**']);

        expect(result.includedRoutes).toHaveLength(0);
        expect(result.excludedRoutes).toHaveLength(2);
    });

    it('should handle empty routes array', () => {
        const result = partitionRoutes([], ['/action/**']);

        expect(result.includedRoutes).toHaveLength(0);
        expect(result.excludedRoutes).toHaveLength(0);
    });

    it('should handle empty exclude patterns', () => {
        const routes = [
            route({ id: 'routes/_app', file: 'routes/_app.tsx' }),
            route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
        ];

        const result = partitionRoutes(routes, []);

        expect(result.includedRoutes).toHaveLength(2);
        expect(result.excludedRoutes).toHaveLength(0);
    });
});

describe('normalizeRoutePaths', () => {
    it('should strip leading / from route paths', () => {
        const routes = [
            route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' }),
            route({ id: 'routes/cart', file: 'routes/cart.tsx', path: '/cart' }),
        ];

        const result = normalizeRoutePaths(routes);

        expect(result[0].path).toBe('about');
        expect(result[1].path).toBe('cart');
    });

    it('should handle paths with leading /', () => {
        const routes = [route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' })];

        const result = normalizeRoutePaths(routes);

        expect(result[0].path).toBe('about');
    });

    it('should preserve undefined paths (pathless layouts)', () => {
        const routes = [route({ id: 'routes/_app', file: 'routes/_app.tsx' })];

        const result = normalizeRoutePaths(routes);

        expect(result[0].path).toBeUndefined();
    });

    it('should preserve index routes with no path', () => {
        const routes = [indexRoute('routes/_index', 'routes/_index.tsx')];

        const result = normalizeRoutePaths(routes);

        expect(result[0].path).toBeUndefined();
        expect(result[0].index).toBe(true);
    });

    it('should not mutate the original routes', () => {
        const routes = [route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' })];

        normalizeRoutePaths(routes);

        expect(routes[0].path).toBe('/about');
    });

    it('should handle empty routes array', () => {
        const result = normalizeRoutePaths([]);

        expect(result).toHaveLength(0);
    });
});

describe('createPrefixWrapper', () => {
    it('should create a wrapper route with the given prefix and children', () => {
        const children = [route({ id: 'routes/_app', file: 'routes/_app.tsx' })];

        const result = createPrefixWrapper('/:siteId/:localeId', children, WRAPPER_FILE);

        expect(result.id).toBe('site-context-wrapper');
        expect(result.file).toBe(WRAPPER_FILE);
        expect(result.path).toBe(':siteId/:localeId');
        expect(result.children).toBe(children);
    });

    it('should strip leading / from prefix', () => {
        const result = createPrefixWrapper('/:siteId', [], WRAPPER_FILE);

        expect(result.path).toBe(':siteId');
    });

    it('should handle empty children array', () => {
        const result = createPrefixWrapper('/:siteId', [], WRAPPER_FILE);

        expect(result.children).toHaveLength(0);
    });
});

describe('applyUrlConfig', () => {
    it('should throw when prefix is empty', () => {
        expect(() => applyUrlConfig({ routes: [], urlConfig: { prefix: '' }, wrapperFile: WRAPPER_FILE })).toThrow(
            'urlConfig.prefix must start with a leading slash ("/"). Received: ""'
        );
    });

    it('should throw when prefix is undefined', () => {
        expect(() => applyUrlConfig({ routes: [], urlConfig: {} as any, wrapperFile: WRAPPER_FILE })).toThrow(
            'urlConfig.prefix must start with a leading slash ("/"). Received: "undefined"'
        );
    });

    it('should return routes unchanged when prefix is "/"', () => {
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];

        const result = applyUrlConfig({ routes, urlConfig: { prefix: '/' }, wrapperFile: WRAPPER_FILE });

        expect(result).toBe(routes);
    });

    it('should return routes unchanged when urlConfig is undefined', () => {
        const routes = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];

        const result = applyUrlConfig({ routes, urlConfig: undefined, wrapperFile: WRAPPER_FILE });

        expect(result).toBe(routes);
    });

    it('should throw an error when prefix does not start with "/"', () => {
        expect(() =>
            applyUrlConfig({
                routes: [],
                urlConfig: { prefix: ':siteId' },
                wrapperFile: WRAPPER_FILE,
            })
        ).toThrow('urlConfig.prefix must start with a leading slash ("/"). Received: ":siteId"');
    });

    it('should handle empty routes array', () => {
        const result = applyUrlConfig({
            routes: [],
            urlConfig: { prefix: '/:siteId' },
            wrapperFile: WRAPPER_FILE,
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('site-context-wrapper');
        expect(result[0].children).toHaveLength(0);
    });

    describe('prefix wrapping', () => {
        it('should wrap all routes under the prefix', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                ]),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId/:localeId' },
                wrapperFile: WRAPPER_FILE,
            });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper).toBeDefined();
            expect(wrapper?.file).toBe(WRAPPER_FILE);
            expect(wrapper?.path).toBe(':siteId/:localeId');
            expect(wrapper?.children).toHaveLength(1);
            expect(wrapper?.children?.[0].id).toBe('routes/_app');
        });

        it('should strip leading / from prefix', () => {
            const routes = [indexRoute('routes/_index', 'routes/_index.tsx')];

            const result = applyUrlConfig({ routes, urlConfig: { prefix: '/:siteId' }, wrapperFile: WRAPPER_FILE });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.path).toBe(':siteId');
        });

        it('should strip leading / from child route paths', () => {
            const routes = [route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' })];

            const result = applyUrlConfig({ routes, urlConfig: { prefix: '/:siteId' }, wrapperFile: WRAPPER_FILE });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.children?.[0].path).toBe('about');
        });

        it('should strip leading / from child route paths that have one', () => {
            const routes = [route({ id: 'routes/about', file: 'routes/about.tsx', path: '/about' })];

            const result = applyUrlConfig({ routes, urlConfig: { prefix: '/:siteId' }, wrapperFile: WRAPPER_FILE });

            const wrapper = result[0];
            expect(wrapper.children?.[0].path).toBe('about');
        });
    });

    describe('route exclusion', () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
            route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            route({ id: 'routes/resource.stores', file: 'routes/resource.stores.ts', path: '/resource/stores' }),
        ];

        it('should exclude action and resource routes by default', () => {
            const result = applyUrlConfig({
                routes: baseRoutes,
                urlConfig: { prefix: '/:siteId' },
                wrapperFile: WRAPPER_FILE,
            });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.children).toHaveLength(1);
            expect(wrapper?.children?.[0].id).toBe('routes/_app');

            // Excluded routes at root level
            expect(result.find((r) => r.id === 'routes/action.cart')).toBeDefined();
            expect(result.find((r) => r.id === 'routes/resource.stores')).toBeDefined();
        });

        it('should use custom excludeRoutes and override defaults', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', []),
                route({ id: 'routes/api.health', file: 'routes/api.health.ts', path: '/api/health' }),
                route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId', excludeRoutes: ['/api/**'] },
                wrapperFile: WRAPPER_FILE,
            });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            const wrappedIds = wrapper?.children?.map((r) => r.id);

            // action/cart is NOT excluded because custom patterns override defaults
            expect(wrappedIds).toContain('routes/_app');
            expect(wrappedIds).toContain('routes/action.cart');

            // api/health is excluded
            expect(result.find((r) => r.id === 'routes/api.health')).toBeDefined();
            expect(wrappedIds).not.toContain('routes/api.health');
        });

        it('should exclude exact path matches', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', []),
                route({ id: 'routes/healthcheck', file: 'routes/healthcheck.ts', path: '/healthcheck' }),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId', excludeRoutes: ['/healthcheck'] },
                wrapperFile: WRAPPER_FILE,
            });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.children).toHaveLength(1);
            expect(result.find((r) => r.id === 'routes/healthcheck')).toBeDefined();
        });

        it('should wrap all routes when excludeRoutes is empty', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', []),
                route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId', excludeRoutes: [] },
                wrapperFile: WRAPPER_FILE,
            });

            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.children).toHaveLength(2);
            expect(result).toHaveLength(1); // only the wrapper, no excluded routes
        });
    });

    describe('root route duplication', () => {
        it('should duplicate index route inside pathless layout at root', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                    route({ id: 'routes/_app.cart', file: 'routes/_app.cart.tsx', path: '/cart' }),
                ]),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId/:localeId' },
                wrapperFile: WRAPPER_FILE,
            });

            const rootLayout = result.find((r) => r.id === 'routes/_app--root-duplicate');
            expect(rootLayout).toBeDefined();
            expect(rootLayout?.file).toBe('routes/_app.tsx');
            expect(rootLayout?.children).toHaveLength(1);
            expect(rootLayout?.children?.[0].id).toBe('routes/_app._index--root-duplicate');
        });

        it('should place root duplicates before the wrapper', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                ]),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId' },
                wrapperFile: WRAPPER_FILE,
            });

            expect(result[0].id).toBe('routes/_app--root-duplicate');
            expect(result[1].id).toBe('site-context-wrapper');
        });

        it('should only duplicate from non-excluded routes', () => {
            const routes = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                ]),
                route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: { prefix: '/:siteId' },
                wrapperFile: WRAPPER_FILE,
            });

            // Root duplicate exists for _app, action route stays at root
            expect(result.find((r) => r.id === 'routes/_app--root-duplicate')).toBeDefined();
            expect(result.find((r) => r.id === 'routes/action.cart')).toBeDefined();
            expect(result.find((r) => r.id === 'routes/action.cart--root-duplicate')).toBeUndefined();
        });
    });

    describe('full route hierarchy', () => {
        it('should produce the expected route tree', () => {
            const routes: RouteConfigEntry[] = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                    route({
                        id: 'routes/_app.product.$productId',
                        file: 'routes/_app.product.$productId.tsx',
                        path: '/product/:productId',
                    }),
                ]),
                layoutRoute('routes/_empty', 'routes/_empty.tsx', [
                    route({ id: 'routes/_empty.login', file: 'routes/_empty.login.tsx', path: '/login' }),
                ]),
                route({ id: 'routes/action.cart', file: 'routes/action.cart.tsx', path: '/action/cart' }),
                route({ id: 'routes/resource.stores', file: 'routes/resource.stores.ts', path: '/resource/stores' }),
            ];

            const result = applyUrlConfig({
                routes,
                urlConfig: {
                    prefix: '/:siteId/:localeId',
                    excludeRoutes: ['/resource/**', '/action/**'],
                },
                wrapperFile: WRAPPER_FILE,
            });

            // Root duplicate for homepage
            expect(result[0].id).toBe('routes/_app--root-duplicate');
            expect(result[0].children).toHaveLength(1);
            expect(result[0].children?.[0].id).toBe('routes/_app._index--root-duplicate');

            // Wrapper with all non-excluded routes
            const wrapper = result.find((r) => r.id === 'site-context-wrapper');
            expect(wrapper?.path).toBe(':siteId/:localeId');
            expect(wrapper?.children).toHaveLength(2); // _app and _empty

            // Excluded routes at root
            expect(result.find((r) => r.id === 'routes/action.cart')).toBeDefined();
            expect(result.find((r) => r.id === 'routes/resource.stores')).toBeDefined();

            // Total: root-duplicate + wrapper + 2 excluded = 4
            expect(result).toHaveLength(4);
        });
    });
});
