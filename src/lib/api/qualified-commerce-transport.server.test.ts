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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { authStorageContext } from '@/middlewares/auth.utils';
import type { RouterContextProvider } from 'react-router';

afterEach(() => vi.unstubAllGlobals());

// HTTP responses are test doubles. These assertions cover the real SDK's final request policy,
// not native tenant qualification, cache hit rates or response latency.
describe.each([
    { label: 'Shopper Context disabled', enabled: false, storeSelectionEnabled: false },
    { label: 'Shopper Context without stores', enabled: true, storeSelectionEnabled: false },
    { label: 'Shopper Context with stores', enabled: true, storeSelectionEnabled: true },
])('qualified SCAPI transport: $label', ({ enabled, storeSelectionEnabled }) => {
    it.each([
        'guest',
        'registered',
    ] as const)('preserves %s priced reads and reviewed metadata optimization', async (userType) => {
        const config = getConfig(createTestContext());
        const context = createTestContext({
            locale: 'en-GB',
            currency: 'GBP',
            authSession: { userType, accessToken: `${userType}-opaque-test-token` },
            appConfig: {
                ...config,
                commerce: {
                    ...config.commerce,
                    api: {
                        ...config.commerce.api,
                        organizationId: 'test-org',
                        clientId: 'test-client',
                        shortCode: 'test123',
                    },
                },
                features: {
                    ...config.features,
                    shopperContext: { ...config.features.shopperContext, enabled, storeSelectionEnabled },
                },
            },
        });
        (context as RouterContextProvider).set(
            authStorageContext,
            new Map([
                ['accessToken', `${userType}-opaque-test-token`],
                ['userType', userType],
            ]) as never
        );
        const requests: Request[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((request: Request) => {
                requests.push(request);
                return Promise.resolve(
                    new Response(JSON.stringify({ id: 'sku', price: 16, data: [], hits: [] }), {
                        headers: { 'Content-Type': 'application/json' },
                    })
                );
            })
        );
        const clients = createApiClients(context);
        const cases = [
            {
                name: 'product with native default expansions',
                personalized: null,
                read: () =>
                    clients.shopperProducts.getProduct({
                        params: { path: { id: 'sku-default' }, query: { currency: 'GBP' } },
                    }),
            },
            {
                name: 'product with prices and promotions',
                personalized: null,
                read: () =>
                    clients.shopperProducts.getProduct({
                        params: {
                            path: { id: 'sku-priced' },
                            query: { currency: 'GBP', expand: ['prices', 'promotions'] },
                        },
                    }),
            },
            {
                name: 'bulk products with prices and promotions',
                personalized: null,
                read: () =>
                    clients.shopperProducts.getProducts({
                        params: { query: { ids: ['sku-priced'], currency: 'GBP', expand: ['prices', 'promotions'] } },
                    }),
            },
            {
                name: 'search with native default expansions',
                personalized: null,
                read: () =>
                    clients.shopperSearch.productSearch({ params: { query: { q: 'default', currency: 'GBP' } } }),
            },
            {
                name: 'search with prices and promotions',
                personalized: null,
                read: () =>
                    clients.shopperSearch.productSearch({
                        params: { query: { q: 'apples', currency: 'GBP', expand: ['prices', 'promotions'] } },
                    }),
            },
            {
                name: 'product image metadata',
                personalized: 'none',
                read: () =>
                    clients.shopperProducts.getProduct({
                        params: { path: { id: 'sku-image' }, query: { expand: ['images'] } },
                    }),
            },
            {
                name: 'availability with explicit trusted inventory ID',
                personalized: 'none',
                read: () =>
                    clients.shopperProducts.getProduct({
                        params: {
                            path: { id: 'sku-inventory' },
                            query: { expand: ['availability'], inventoryIds: ['trusted-inventory'] },
                        },
                    }),
            },
            {
                name: 'promotion metadata for native-awarded IDs',
                personalized: 'none',
                read: () =>
                    clients.shopperPromotions.getPromotions({
                        params: { query: { ids: ['individual', 'group', 'all-store'] } },
                    }),
            },
            {
                name: 'existing basket read',
                personalized: null,
                read: () => clients.shopperBasketsV2.getBasket({ params: { path: { basketId: 'basket' } } }),
            },
        ];
        for (const testCase of cases) {
            const previousCount = requests.length;
            await testCase.read();
            expect(requests, testCase.name).toHaveLength(previousCount + 1);
            const request = requests.at(-1);
            if (!request) throw new Error(`No outbound request for ${testCase.name}`);
            const url = new URL(request.url);
            expect(request.headers.get('Authorization'), testCase.name).toBe(`Bearer ${userType}-opaque-test-token`);
            expect(url.searchParams.get('personalized'), testCase.name).toBe(testCase.personalized);
            expect(url.searchParams.get('locale'), testCase.name).toBe('en-GB');
            expect(url.searchParams.has('siteId'), testCase.name).toBe(true);
            if (testCase.name === 'availability with explicit trusted inventory ID') {
                expect(url.searchParams.get('inventoryIds')).toBe('trusted-inventory');
            }
        }
    });
});
