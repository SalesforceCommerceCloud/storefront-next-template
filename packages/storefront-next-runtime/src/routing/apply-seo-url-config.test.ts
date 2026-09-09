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
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { describe, expect, it } from 'vitest';
import type { SeoRoutesConfig } from '../config/types';
import { applySeoUrlConfig } from './apply-seo-url-config';

const PRODUCT_ROUTE_ID = 'routes/_app.product.$productId';
const CATEGORY_ROUTE_ID = 'routes/_app.category.$categoryId';
const WRAPPER_FILE = 'app-wrapper.tsx';

function route(overrides: Partial<RouteConfigEntry> & { id: string; file: string }): RouteConfigEntry {
    return { ...overrides } as RouteConfigEntry;
}

function createRoutes(): RouteConfigEntry[] {
    return [
        route({
            id: 'routes/_app',
            file: 'routes/_app.tsx',
            children: [
                route({
                    id: PRODUCT_ROUTE_ID,
                    file: 'routes/_app.product.$productId.tsx',
                    path: 'product/:productId',
                }),
                route({
                    id: CATEGORY_ROUTE_ID,
                    file: 'routes/_app.category.$categoryId.tsx',
                    path: 'category/:categoryId',
                }),
                route({ id: 'routes/_app.cart', file: 'routes/_app.cart.tsx', path: 'cart' }),
                route({
                    id: 'routes/_app.account',
                    file: 'routes/_app.account.tsx',
                    path: 'account',
                    children: [
                        route({
                            id: 'routes/_app.account.orders',
                            file: 'routes/_app.account.orders.tsx',
                            path: 'orders',
                        }),
                    ],
                }),
            ],
        }),
        route({ id: 'routes/action.cart', file: 'routes/action.cart.ts', path: 'action/cart' }),
        route({ id: 'routes/resource.health', file: 'routes/resource.health.ts', path: 'resource/health' }),
    ];
}

function createConfig(): SeoRoutesConfig {
    return {
        RefArchGlobal: {
            product: { prefix: 'p' },
            category: { prefix: 'c', mode: 'id-suffix' },
        },
        RefArch: {
            product: { prefix: 'product' },
            category: { prefix: 'category', mode: 'slug-path' },
        },
    };
}

function transform(routes: RouteConfigEntry[], config: SeoRoutesConfig | undefined): RouteConfigEntry[] {
    return applySeoUrlConfig({
        routes,
        config,
        routeIds: { product: PRODUCT_ROUTE_ID, category: CATEGORY_ROUTE_ID },
        wrapperFile: WRAPPER_FILE,
    });
}

function findRoute(routes: RouteConfigEntry[], id: string): RouteConfigEntry | undefined {
    for (const entry of routes) {
        if (entry.id === id) return entry;
        const match = entry.children ? findRoute(entry.children, id) : undefined;
        if (match) return match;
    }
    return undefined;
}

describe('applySeoUrlConfig', () => {
    it('returns the original routes when SEO route configuration is absent', () => {
        const routes = createRoutes();

        expect(transform(routes, undefined)).toBe(routes);
    });

    it('registers the deduplicated product and category alias union under stable route IDs', () => {
        const result = transform(createRoutes(), createConfig());

        const product = findRoute(result, PRODUCT_ROUTE_ID);
        const category = findRoute(result, CATEGORY_ROUTE_ID);

        expect(product).toMatchObject({
            id: PRODUCT_ROUTE_ID,
            file: 'routes/_app.product.$productId.tsx',
            path: undefined,
        });
        expect(product?.children).toEqual([
            {
                id: `${PRODUCT_ROUTE_ID}--seo-alias--p`,
                file: WRAPPER_FILE,
                path: 'p/*',
            },
            {
                id: `${PRODUCT_ROUTE_ID}--seo-alias--product`,
                file: WRAPPER_FILE,
                path: 'product/*',
            },
        ]);
        expect(category).toMatchObject({
            id: CATEGORY_ROUTE_ID,
            file: 'routes/_app.category.$categoryId.tsx',
            path: undefined,
        });
        expect(category?.children?.map(({ path }) => path)).toEqual(['c/*', 'category/*']);
    });

    it('deduplicates same-resource aliases case-insensitively', () => {
        const config: SeoRoutesConfig = {
            SiteA: {
                product: { prefix: 'P' },
                category: { prefix: 'c', mode: 'id-suffix' },
            },
            SiteB: {
                product: { prefix: 'p' },
                category: { prefix: 'C', mode: 'slug-path' },
            },
        };

        const result = transform(createRoutes(), config);

        expect(findRoute(result, PRODUCT_ROUTE_ID)?.children).toHaveLength(1);
        expect(findRoute(result, CATEGORY_ROUTE_ID)?.children).toHaveLength(1);
    });

    it('does not mutate the discovered route tree', () => {
        const routes = createRoutes();
        const original = structuredClone(routes);

        transform(routes, createConfig());

        expect(routes).toEqual(original);
    });

    it.each(['', '/p', 'p/', 'p/q', ':p', '*', '.', '..', 'prøduct'])('rejects invalid prefix %j', (prefix) => {
        const config = createConfig();
        config.RefArchGlobal.product.prefix = prefix;

        expect(() => transform(createRoutes(), config)).toThrow(/invalid SEO route prefix/i);
    });

    it.each(['action', 'resource'])('rejects reserved prefix %j', (prefix) => {
        const config = createConfig();
        config.RefArchGlobal.product.prefix = prefix;

        expect(() => transform(createRoutes(), config)).toThrow(/reserved SEO route prefix/i);
    });

    it('rejects unsupported category modes at runtime', () => {
        const config = createConfig();
        config.RefArchGlobal.category.mode = 'unsupported' as 'id-suffix';

        expect(() => transform(createRoutes(), config)).toThrow(/unsupported category mode/);
    });

    it('rejects empty site configuration', () => {
        expect(() => transform(createRoutes(), {})).toThrow(/at least one site/);
    });

    it('rejects aliases used by more than one resource type', () => {
        const config = createConfig();
        config.RefArchGlobal.category.prefix = 'P';

        expect(() => transform(createRoutes(), config)).toThrow(/used by both product and category/);
    });

    it('includes the optional content prefix in cross-resource collision validation', () => {
        const config = createConfig();
        config.RefArchGlobal.content = { prefix: 'p' };

        expect(() => transform(createRoutes(), config)).toThrow(/used by both product and content/);
    });

    it.each(['cart', 'account'])('rejects prefix %j when it collides with an existing route branch', (prefix) => {
        const config = createConfig();
        config.RefArchGlobal.product.prefix = prefix;

        expect(() => transform(createRoutes(), config)).toThrow(/collides with existing route/);
    });

    it('allows the configured alias to match the original target route prefix', () => {
        const config: SeoRoutesConfig = {
            RefArchGlobal: {
                product: { prefix: 'product' },
                category: { prefix: 'category', mode: 'id-suffix' },
            },
        };

        expect(() => transform(createRoutes(), config)).not.toThrow();
    });

    it('rejects a missing canonical route ID', () => {
        expect(() =>
            applySeoUrlConfig({
                routes: createRoutes(),
                config: createConfig(),
                routeIds: { product: 'routes/missing-product', category: CATEGORY_ROUTE_ID },
                wrapperFile: WRAPPER_FILE,
            })
        ).toThrow(/route ID "routes\/missing-product" was not found/);
    });

    it('rejects duplicate canonical route IDs', () => {
        const routes = createRoutes();
        routes.push(route({ id: PRODUCT_ROUTE_ID, file: 'routes/duplicate-product.tsx', path: 'duplicate-product' }));

        expect(() => transform(routes, createConfig())).toThrow(/route ID .* was found more than once/);
    });

    it('rejects canonical routes that already have children', () => {
        const routes = createRoutes();
        const product = findRoute(routes, PRODUCT_ROUTE_ID);
        if (!product) throw new Error('Product route fixture is missing');
        product.children = [route({ id: 'routes/product-child', file: 'routes/product-child.tsx', path: 'child' })];

        expect(() => transform(routes, createConfig())).toThrow(/must be a leaf route/);
    });
});
