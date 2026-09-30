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
import { type RouteConfigEntry } from '@react-router/dev/routes';
import { mergeRoutes } from './merge-routes';

describe('mergeRoutes', () => {
    const extensionIdPrefix = 'extensions/test-extension/';

    describe('simple child route addition', () => {
        it('should add a child route to an existing parent route', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [],
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app.order-confirmation.$orderNo`,
                    file: 'routes/_app.order-confirmation.$orderNo.tsx',
                    path: 'order-confirmation/:orderNo',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [
                        {
                            id: 'routes/_app.order-confirmation.$orderNo',
                            file: 'routes/_app.order-confirmation.$orderNo.tsx',
                            path: 'order-confirmation/:orderNo',
                        },
                    ],
                },
            ]);
        });
    });

    describe('routes with optional segments', () => {
        it('should add a route with optional site segment at root level', () => {
            const routes: RouteConfigEntry[] = [];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search.results.$page`,
                    file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                    path: ':site?/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site)._app.$lang.search.results.$page',
                    file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                    path: ':site?/:lang/search/results/:page',
                },
            ]);
        });

        it('should add nested routes with optional site segment', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parent before child
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang`,
                    file: 'routes/($site)._app.$lang.tsx',
                    path: ':site?/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search`,
                    file: 'routes/($site)._app.$lang.search.tsx',
                    path: ':site?/:lang/search',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            // The search route should be nested under the lang route
            // Expected behavior: path should be clipped to "search"
            expect(routes).toEqual([
                {
                    id: 'routes/($site)._app.$lang',
                    file: 'routes/($site)._app.$lang.tsx',
                    path: ':site?/:lang',
                    children: [
                        {
                            id: 'routes/($site)._app.$lang.search',
                            file: 'routes/($site)._app.$lang.search.tsx',
                            path: 'search',
                        },
                    ],
                },
            ]);
        });

        it('should build nested route tree with optional site segment', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parents before children (deepest parent first)
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site)._app`,
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang`,
                    file: 'routes/($site)._app.$lang.tsx',
                    path: ':site?/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search`,
                    file: 'routes/($site)._app.$lang.search.tsx',
                    path: ':site?/:lang/search',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site)._app',
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                    children: [
                        {
                            id: 'routes/($site)._app.$lang',
                            file: 'routes/($site)._app.$lang.tsx',
                            path: ':lang',
                            children: [
                                {
                                    id: 'routes/($site)._app.$lang.search',
                                    file: 'routes/($site)._app.$lang.search.tsx',
                                    path: 'search',
                                },
                            ],
                        },
                    ],
                },
            ]);
        });

        it('should build deep nested route tree with optional site segment', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parents before children (deepest parent first)
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site)._app`,
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang`,
                    file: 'routes/($site)._app.$lang.tsx',
                    path: ':site?/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search`,
                    file: 'routes/($site)._app.$lang.search.tsx',
                    path: ':site?/:lang/search',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search.results.$page`,
                    file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                    path: ':site?/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site)._app',
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                    children: [
                        {
                            id: 'routes/($site)._app.$lang',
                            file: 'routes/($site)._app.$lang.tsx',
                            path: ':lang',
                            children: [
                                {
                                    id: 'routes/($site)._app.$lang.search',
                                    file: 'routes/($site)._app.$lang.search.tsx',
                                    path: 'search',
                                    children: [
                                        {
                                            id: 'routes/($site)._app.$lang.search.results.$page',
                                            file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                                            path: 'results/:page',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ]);
        });

        it('should handle missing intermediate route in nested structure', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parents before children (note: search route is missing, so results.$page goes directly under $lang)
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site)._app`,
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang`,
                    file: 'routes/($site)._app.$lang.tsx',
                    path: ':site?/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site)._app.$lang.search.results.$page`,
                    file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                    path: ':site?/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            // The results.$page route should be nested under $lang, with path clipped
            expect(routes).toEqual([
                {
                    id: 'routes/($site)._app',
                    file: 'routes/($site)._app.tsx',
                    path: ':site?',
                    children: [
                        {
                            id: 'routes/($site)._app.$lang',
                            file: 'routes/($site)._app.$lang.tsx',
                            path: ':lang',
                            children: [
                                {
                                    id: 'routes/($site)._app.$lang.search.results.$page',
                                    file: 'routes/($site)._app.$lang.search.results.$page.tsx',
                                    path: 'search/results/:page',
                                },
                            ],
                        },
                    ],
                },
            ]);
        });
    });

    describe('routes with app segment', () => {
        it('should handle routes with app segment in path', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parents before children
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site).app`,
                    file: 'routes/($site).app.tsx',
                    path: ':site?/app',
                },
                {
                    id: `${extensionIdPrefix}routes/($site).app.$lang`,
                    file: 'routes/($site).app.$lang.tsx',
                    path: ':site?/app/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site).app.$lang.search.results.$page`,
                    file: 'routes/($site).app.$lang.search.results.$page.tsx',
                    path: ':site?/app/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site).app',
                    file: 'routes/($site).app.tsx',
                    path: ':site?/app',
                    children: [
                        {
                            id: 'routes/($site).app.$lang',
                            file: 'routes/($site).app.$lang.tsx',
                            path: ':lang',
                            children: [
                                {
                                    id: 'routes/($site).app.$lang.search.results.$page',
                                    file: 'routes/($site).app.$lang.search.results.$page.tsx',
                                    path: 'search/results/:page',
                                },
                            ],
                        },
                    ],
                },
            ]);
        });

        it('should handle routes with app segment missing intermediate routes', () => {
            const routes: RouteConfigEntry[] = [];

            // Process parent before child
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site).app.$lang`,
                    file: 'routes/($site).app.$lang.tsx',
                    path: ':site?/app/:lang',
                },
                {
                    id: `${extensionIdPrefix}routes/($site).app.$lang.search.results.$page`,
                    file: 'routes/($site).app.$lang.search.results.$page.tsx',
                    path: ':site?/app/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site).app.$lang',
                    file: 'routes/($site).app.$lang.tsx',
                    path: ':site?/app/:lang',
                    children: [
                        {
                            id: 'routes/($site).app.$lang.search.results.$page',
                            file: 'routes/($site).app.$lang.search.results.$page.tsx',
                            path: 'search/results/:page',
                        },
                    ],
                },
            ]);
        });

        it('should handle single route with app segment', () => {
            const routes: RouteConfigEntry[] = [];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/($site).app.$lang.search.results.$page`,
                    file: 'routes/($site).app.$lang.search.results.$page.tsx',
                    path: ':site?/app/:lang/search/results/:page',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/($site).app.$lang.search.results.$page',
                    file: 'routes/($site).app.$lang.search.results.$page.tsx',
                    path: ':site?/app/:lang/search/results/:page',
                },
            ]);
        });
    });

    describe('route replacement', () => {
        it('should replace an existing route when IDs match exactly', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [],
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app`,
                    file: 'routes/_app.extension.tsx',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.extension.tsx',
                    children: [],
                },
            ]);
        });
    });

    describe('routes without IDs', () => {
        it('should add routes without IDs directly to routes array', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    file: 'routes/custom-route.tsx',
                    path: 'custom',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    file: 'routes/custom-route.tsx',
                    path: 'custom',
                },
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ]);
        });
    });

    describe('complex scenarios', () => {
        it('should handle merging multiple extension routes into existing route tree', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [
                        {
                            id: 'routes/_app.c.$',
                            file: 'routes/_app.c.$.tsx',
                            path: 'category/:categoryId',
                        },
                    ],
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app.order-confirmation.$orderNo`,
                    file: 'routes/_app.order-confirmation.$orderNo.tsx',
                    path: 'order-confirmation/:orderNo',
                },
                {
                    id: `${extensionIdPrefix}routes/_app.account`,
                    file: 'routes/_app.account.tsx',
                    path: 'account',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [
                        {
                            id: 'routes/_app.account',
                            file: 'routes/_app.account.tsx',
                            path: 'account',
                        },
                        {
                            id: 'routes/_app.order-confirmation.$orderNo',
                            file: 'routes/_app.order-confirmation.$orderNo.tsx',
                            path: 'order-confirmation/:orderNo',
                        },
                        {
                            id: 'routes/_app.c.$',
                            file: 'routes/_app.c.$.tsx',
                            path: 'category/:categoryId',
                        },
                    ],
                },
            ]);
        });

        it('should handle pathless parent routes correctly', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [],
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app.search`,
                    file: 'routes/_app.search.tsx',
                    path: 'search',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [
                        {
                            id: 'routes/_app.search',
                            file: 'routes/_app.search.tsx',
                            path: 'search',
                        },
                    ],
                },
            ]);
        });

        it('should clip parent path correctly when adding nested routes', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    path: '',
                    children: [],
                },
            ];

            // Process parent before child
            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app.account`,
                    file: 'routes/_app.account.tsx',
                    path: 'account',
                },
                {
                    id: `${extensionIdPrefix}routes/_app.account.orders`,
                    file: 'routes/_app.account.orders.tsx',
                    path: 'account/orders',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    path: '',
                    children: [
                        {
                            id: 'routes/_app.account',
                            file: 'routes/_app.account.tsx',
                            path: 'account',
                            children: [
                                {
                                    id: 'routes/_app.account.orders',
                                    file: 'routes/_app.account.orders.tsx',
                                    path: 'orders',
                                },
                            ],
                        },
                    ],
                },
            ]);
        });
    });

    describe('edge cases', () => {
        it('should handle empty routes array', () => {
            const routes: RouteConfigEntry[] = [];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app`,
                    file: 'routes/_app.tsx',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ]);
        });

        it('should handle empty extension routes array', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ]);
        });

        it('should handle routes with undefined path', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [],
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_app.custom`,
                    file: 'routes/_app.custom.tsx',
                    path: undefined,
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                    children: [
                        {
                            id: 'routes/_app.custom',
                            file: 'routes/_app.custom.tsx',
                            path: undefined,
                        },
                    ],
                },
            ]);
        });

        it('should handle extension routes that do not match any existing route', () => {
            const routes: RouteConfigEntry[] = [
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ];

            const extensionRoutes: RouteConfigEntry[] = [
                {
                    id: `${extensionIdPrefix}routes/_other`,
                    file: 'routes/_other.tsx',
                    path: 'other',
                },
            ];

            mergeRoutes(routes, extensionRoutes, extensionIdPrefix);

            expect(routes).toEqual([
                {
                    id: 'routes/_other',
                    file: 'routes/_other.tsx',
                    path: 'other',
                },
                {
                    id: 'routes/_app',
                    file: 'routes/_app.tsx',
                },
            ]);
        });
    });
});
