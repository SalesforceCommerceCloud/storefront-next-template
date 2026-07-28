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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { action } from './action.cart-bundle-add';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { ShopperProducts } from '@/scapi';

vi.mock('@/middlewares/basket.server');
// Hoist dependencies for use in vi.mock (avoids async imports which fail on Windows)
const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

vi.mock('@/lib/api-clients.server');
vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: () => ({ t: (key: string) => key }),
}));
// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/lib/basket-utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/extensions/bopis/lib/basket-utils')>();
    return {
        ...actual,
        syncShipmentWithDeliveryOptionChange: vi.fn((_context, basket) => Promise.resolve(basket)),
    };
});
vi.mock('@/extensions/bopis/lib/api/shipment.server', () => ({
    findOrCreatePickupShipment: vi.fn(() => Promise.resolve({ shipmentId: 'pickup-shipment-1' })),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS
vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
    };
});
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

import { createFormDataRequest } from '@/test-utils/request-helpers';
import { createActionArgs, expectStatus } from '@/lib/test-utils';
import { resourceRoutes } from '@/route-paths';

describe('action.cart-bundle-add', () => {
    const mockBasket = {
        basketId: 'test-basket-123',
        productItems: [],
    };

    const mockUpdatedBasket = {
        basketId: 'test-basket-123',
        productItems: [
            {
                productId: 'bundle-123',
                quantity: 1,
                bundledProductItems: [
                    { itemId: 'item-1', productId: 'standard-product-1', quantity: 1 },
                    { itemId: 'item-2', productId: 'variant-product-1', quantity: 2 },
                ],
            },
        ],
    };

    const mockConfig = {
        commerce: {
            api: {
                organizationId: 'test-org',
                siteId: 'test-site',
            },
        },
    };

    const mockClients = {
        shopperBasketsV2: {
            addItemToBasket: vi.fn(),
            updateItemsInBasket: vi.fn(),
            getBasket: vi.fn(),
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: mockBasket, snapshot: null } as any);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
        vi.mocked(createApiClients).mockReturnValue(mockClients as any);
        vi.mocked(getConfig).mockReturnValue(mockConfig as any);
    });

    describe('action', () => {
        test('adds bundle with standard products to cart', async () => {
            const bundleItem = { productId: 'bundle-123', quantity: 1 };
            const childSelections = [
                {
                    product: { id: 'standard-product-1' } as ShopperProducts.schemas['Product'],
                    quantity: 1,
                },
                {
                    product: { id: 'standard-product-2' } as ShopperProducts.schemas['Product'],
                    quantity: 1,
                },
            ];

            mockClients.shopperBasketsV2.addItemToBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.updateItemsInBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.getBasket.mockResolvedValue({ data: mockUpdatedBasket });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.cartBundleAdd}`, 'POST', {
                bundleItem: JSON.stringify(bundleItem),
                childSelections: JSON.stringify(childSelections),
            });

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expect(result.data.success).toBe(true);
            expect(mockClients.shopperBasketsV2.addItemToBasket).toHaveBeenCalled();
        });

        test('adds bundle with variant products to cart', async () => {
            const bundleItem = { productId: 'bundle-123', quantity: 1 };
            const childSelections = [
                {
                    product: { id: 'master-product-1' } as ShopperProducts.schemas['Product'],
                    variant: { productId: 'variant-123' } as ShopperProducts.schemas['Variant'],
                    quantity: 1,
                },
                {
                    product: { id: 'master-product-2' } as ShopperProducts.schemas['Product'],
                    variant: { productId: 'variant-456' } as ShopperProducts.schemas['Variant'],
                    quantity: 2,
                },
            ];

            mockClients.shopperBasketsV2.addItemToBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.updateItemsInBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.getBasket.mockResolvedValue({ data: mockUpdatedBasket });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.cartBundleAdd}`, 'POST', {
                bundleItem: JSON.stringify(bundleItem),
                childSelections: JSON.stringify(childSelections),
            });

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expect(result.data.success).toBe(true);
        });

        test('adds bundle with mix of standard and variant products', async () => {
            const bundleItem = { productId: 'bundle-123', quantity: 2 };
            const childSelections = [
                {
                    product: { id: 'standard-product-1' } as ShopperProducts.schemas['Product'],
                    quantity: 1,
                },
                {
                    product: { id: 'master-product-1' } as ShopperProducts.schemas['Product'],
                    variant: { productId: 'variant-123' } as ShopperProducts.schemas['Variant'],
                    quantity: 2,
                },
            ];

            mockClients.shopperBasketsV2.addItemToBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.updateItemsInBasket.mockResolvedValue({ data: mockUpdatedBasket });
            mockClients.shopperBasketsV2.getBasket.mockResolvedValue({ data: mockUpdatedBasket });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.cartBundleAdd}`, 'POST', {
                bundleItem: JSON.stringify(bundleItem),
                childSelections: JSON.stringify(childSelections),
            });

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expect(result.data.success).toBe(true);
            // The server action extracts productId and quantity from ProductSelectionValues
            expect(mockClients.shopperBasketsV2.addItemToBasket).toHaveBeenCalledWith({
                params: {
                    path: { basketId: 'test-basket-123' },
                },
                body: [
                    {
                        productId: 'bundle-123',
                        quantity: 2,
                        shipmentId: 'me',
                        bundledProductItems: [
                            { productId: 'standard-product-1', quantity: 1 },
                            { productId: 'variant-123', quantity: 2 },
                        ],
                    },
                ],
            });
        });

        test('returns error when bundle data is missing', async () => {
            const request = createFormDataRequest(`http://localhost${resourceRoutes.cartBundleAdd}`, 'POST', {});

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expect(result.data.success).toBe(false);
            expect(result.data.error).toBeDefined();
        });

        test('returns error for non-POST requests', async () => {
            const request = new Request(`http://localhost${resourceRoutes.cartBundleAdd}`, {
                method: 'GET',
            });

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expectStatus(result, 405);
            expect(result.data.success).toBe(false);
            expect(result.data.error).toBeDefined();
            expect(result.data.error?.code).toBe('METHOD_NOT_ALLOWED');
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        test('rejects pickup bundle from a different store than existing pickup items (BOPIS)', async () => {
            const basketWithPickup = {
                basketId: 'test-basket-123',
                productItems: [{ itemId: 'item-existing', productId: 'p-existing', shipmentId: 's-1', quantity: 1 }],
                shipments: [{ shipmentId: 's-1', c_fromStoreId: 'store-A' }],
            };
            vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickup, snapshot: null } as any);

            const bundleItem = {
                productId: 'bundle-123',
                quantity: 1,
                inventoryId: 'inv-B',
                storeId: 'store-B',
            };
            const childSelections = [
                {
                    product: { id: 'standard-product-1' } as ShopperProducts.schemas['Product'],
                    quantity: 1,
                },
            ];

            const request = createFormDataRequest(`http://localhost${resourceRoutes.cartBundleAdd}`, 'POST', {
                bundleItem: JSON.stringify(bundleItem),
                childSelections: JSON.stringify(childSelections),
            });

            const result = await action(
                createActionArgs(request, {} as any, { pattern: resourceRoutes.cartBundleAdd })
            );

            expectStatus(result, 409);
            expect(result.data.success).toBe(false);
            expect(result.data.error?.code).toBe('CONFLICT');
            expect(mockClients.shopperBasketsV2.addItemToBasket).not.toHaveBeenCalled();
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });
});
