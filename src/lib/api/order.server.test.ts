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
import type { ShopperCustomers, ShopperOrders, ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { fetchOrderWithProducts, transformOrderForList, fetchCustomerOrders } from './order.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

describe('fetchOrderWithProducts', () => {
    const mockGetOrder = vi.fn();
    const mockGetProducts = vi.fn();
    const mockClients = {
        shopperOrders: { getOrder: mockGetOrder },
        shopperProducts: { getProducts: mockGetProducts },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue(mockClients as never);
    });

    test('returns orderDataPromise and orderPromise', () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const context = createTestContext({ currency: 'USD' });
        const result = fetchOrderWithProducts(context, 'ORD-1');

        expect(result).toHaveProperty('orderDataPromise');
        expect(result).toHaveProperty('orderPromise');
        expect(result.orderDataPromise).toBeInstanceOf(Promise);
        expect(result.orderPromise).toBeInstanceOf(Promise);
    });

    test('calls createApiClients and getOrder with orderNo', () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-123',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const context = createTestContext({ currency: 'EUR' });
        fetchOrderWithProducts(context, 'ORD-123');

        expect(createApiClients).toHaveBeenCalledWith(context);
        expect(mockGetOrder).toHaveBeenCalledWith({
            params: {
                path: { orderNo: 'ORD-123' },
                query: { expand: ['oms', 'oms_shipments'] },
            },
        });
    });

    test('requests OMS tracking enrichment via expand: oms, oms_shipments', () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-OMS',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        fetchOrderWithProducts(createTestContext({ currency: 'USD' }), 'ORD-OMS');

        const callArg = mockGetOrder.mock.calls[0][0];
        expect(callArg.params.query.expand).toEqual(['oms', 'oms_shipments']);
    });

    test('order still loads when omsData is absent (ECOM path not regressed)', async () => {
        // A non-SOM org disregards the expand tokens → order comes back with no
        // omsData; the fetch must still resolve the order normally.
        const ecomOnlyOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-ECOM',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: ecomOnlyOrder });

        const { orderPromise } = fetchOrderWithProducts(createTestContext({ currency: 'USD' }), 'ORD-ECOM');
        const order = await orderPromise;
        expect(order.orderNo).toBe('ORD-ECOM');
        expect(order.omsData).toBeUndefined();
    });

    test('orderPromise resolves to order data', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const context = createTestContext({ currency: 'USD' });
        const { orderPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const order = await orderPromise;
        expect(order).toEqual(mockOrder);
        expect(order.orderNo).toBe('ORD-1');
    });

    test('orderDataPromise resolves to order and productsById', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const data = await orderDataPromise;
        expect(data.order).toEqual(mockOrder);
        expect(data.productsById).toEqual({});
    });

    test('calls getProducts with product IDs from order and currency from context', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [
                { productId: 'prod-1', itemId: 'item-1' },
                { productId: 'prod-2', itemId: 'item-2' },
            ],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const mockProducts = {
            data: {
                data: [
                    { id: 'prod-1', name: 'Product 1' } as ShopperProducts.schemas['Product'],
                    { id: 'prod-2', name: 'Product 2' } as ShopperProducts.schemas['Product'],
                ],
            },
        };
        mockGetProducts.mockResolvedValue(mockProducts);

        const context = createTestContext({ currency: 'GBP' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const data = await orderDataPromise;

        expect(mockGetProducts).toHaveBeenCalledWith({
            params: {
                query: {
                    ids: ['prod-1', 'prod-2'],
                    expand: ['images', 'variations'],
                    currency: 'GBP',
                },
            },
        });
        expect(data.productsById).toEqual({
            'prod-1': { id: 'prod-1', name: 'Product 1' },
            'prod-2': { id: 'prod-2', name: 'Product 2' },
        });
    });

    test('deduplicates product IDs and skips empty productItems', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [
                { productId: 'prod-1', itemId: 'item-1' },
                { productId: 'prod-1', itemId: 'item-2' },
                { productId: '', itemId: 'item-3' },
            ],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });
        mockGetProducts.mockResolvedValue({
            data: { data: [{ id: 'prod-1', name: 'Product 1' } as ShopperProducts.schemas['Product']] },
        });

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        await orderDataPromise;

        expect(mockGetProducts).toHaveBeenCalledWith({
            params: {
                query: {
                    ids: ['prod-1'],
                    expand: ['images', 'variations'],
                    currency: 'USD',
                },
            },
        });
    });

    test('returns empty productsById when getProducts throws', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [{ productId: 'prod-1', itemId: 'item-1' }],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });
        mockGetProducts.mockRejectedValue(new Error('API error'));

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const data = await orderDataPromise;

        expect(data.order).toEqual(mockOrder);
        expect(data.productsById).toEqual({});
    });

    test('orderDataPromise rejects when getOrder rejects', async () => {
        mockGetOrder.mockRejectedValue(new Error('Order not found'));

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-999');

        await expect(orderDataPromise).rejects.toThrow('Order not found');
    });

    test('handles order with undefined productItems', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const data = await orderDataPromise;

        expect(data.productsById).toEqual({});
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    test('handles getProducts returning undefined data', async () => {
        const mockOrder: ShopperOrders.schemas['Order'] = {
            orderNo: 'ORD-1',
            productItems: [{ productId: 'prod-1', itemId: 'item-1' }],
        } as ShopperOrders.schemas['Order'];
        mockGetOrder.mockResolvedValue({ data: mockOrder });
        mockGetProducts.mockResolvedValue({ data: {} });

        const context = createTestContext({ currency: 'USD' });
        const { orderDataPromise } = fetchOrderWithProducts(context, 'ORD-1');

        const data = await orderDataPromise;

        expect(data.productsById).toEqual({});
    });
});

describe('transformOrderForList', () => {
    test('transforms SCAPI order to display format without product images', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-123',
            creationDate: '2024-09-14T10:30:00Z',
            status: 'new',
            orderTotal: 100.5,
            currency: 'USD',
            productItems: [
                { productId: 'prod-1', quantity: 2, itemId: 'item-1' },
                { productId: 'prod-2', quantity: 3, itemId: 'item-2' },
            ],
        } as ShopperCustomers.schemas['Order'];

        const result = transformOrderForList(scapiOrder);

        expect(result).toEqual({
            orderNo: 'ORD-123',
            orderDate: '2024-09-14T10:30:00Z',
            status: 'new',
            total: 100.5,
            currency: 'USD',
            itemCount: 2,
            productItems: [
                { productId: 'prod-1', quantity: 2, imageUrl: undefined, imageAlt: 'Product Image' },
                { productId: 'prod-2', quantity: 3, imageUrl: undefined, imageAlt: 'Product Image' },
            ],
            pickupLocation: undefined,
        });
    });

    test('uses OMS status (omsData.status) when ECOM status is absent', () => {
        const scapiOrder = {
            orderNo: 'ORD-OMS',
            creationDate: '2024-09-14T10:30:00Z',
            // no top-level `status` → must fall back to omsData.status
            omsData: { status: 'shipped' },
            orderTotal: 50,
            currency: 'USD',
            productItems: [],
        } as unknown as ShopperCustomers.schemas['Order'];

        expect(transformOrderForList(scapiOrder).status).toBe('shipped');
    });

    test('prefers ECOM status over OMS status when both are present', () => {
        const scapiOrder = {
            orderNo: 'ORD-BOTH',
            status: 'new',
            omsData: { status: 'shipped' },
            productItems: [],
        } as unknown as ShopperCustomers.schemas['Order'];

        // Badge precedence is ECOM-first (the OMS-preferred rule is the shipment-list
        // mapper's, not the badge's) — so the ECOM status wins when both are present.
        expect(transformOrderForList(scapiOrder).status).toBe('new');
    });

    test('defaults status to "created" when neither ECOM nor OMS status is present', () => {
        const scapiOrder = {
            orderNo: 'ORD-NONE',
            productItems: [],
        } as unknown as ShopperCustomers.schemas['Order'];

        expect(transformOrderForList(scapiOrder).status).toBe('created');
    });

    test('treats a blank OMS status as unset (does not surface "") → falls to the default', () => {
        const scapiOrder = {
            orderNo: 'ORD-BLANK',
            // OMS can send status: '' to mean "unset"; it must NOT propagate as a status
            omsData: { status: '' },
            productItems: [],
        } as unknown as ShopperCustomers.schemas['Order'];

        expect(transformOrderForList(scapiOrder).status).toBe('created');
    });

    test('populates imageUrl and imageAlt when productsById is provided', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-123',
            productItems: [
                { productId: 'prod-1', quantity: 1, itemId: 'item-1' },
                { productId: 'prod-2', quantity: 1, itemId: 'item-2' },
            ],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            'prod-1': {
                id: 'prod-1',
                name: 'Product 1',
                imageGroups: [
                    { viewType: 'small', images: [{ link: 'https://example.com/prod1.jpg', alt: 'Product 1 image' }] },
                ],
            } as ShopperProducts.schemas['Product'],
            'prod-2': {
                id: 'prod-2',
                name: 'Product 2',
                imageGroups: [
                    { viewType: 'large', images: [{ link: 'https://example.com/prod2-large.jpg', alt: 'Large' }] },
                ],
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]).toMatchObject({
            productId: 'prod-1',
            imageUrl: 'https://example.com/prod1.jpg',
            imageAlt: 'Product 1 image',
        });
        // prod-2 has only 'large' viewType, no 'small' — imageUrl is undefined but imageAlt falls back to product name
        expect(result.productItems?.[1]).toMatchObject({
            productId: 'prod-2',
            imageUrl: undefined,
            imageAlt: 'Product 2',
        });
    });

    test('sets productName from catalog product when present, else SCAPI line productName', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-N',
            productItems: [
                {
                    productId: 'p1',
                    quantity: 1,
                    itemId: 'i1',
                    productName: 'Line title ignored when catalog exists',
                },
                { productId: 'p2', quantity: 1, itemId: 'i2', productName: 'Line only name' },
                { productId: 'p-missing', quantity: 1, itemId: 'i3', productName: 'Fallback from line' },
            ],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            p1: {
                id: 'p1',
                name: 'Catalog wins',
                imageGroups: [],
            } as ShopperProducts.schemas['Product'],
            p2: {
                id: 'p2',
                name: 'Catalog two',
                imageGroups: [],
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]?.productName).toBe('Catalog wins');
        expect(result.productItems?.[1]?.productName).toBe('Catalog two');
        expect(result.productItems?.[2]?.productName).toBe('Fallback from line');
    });

    test('handles missing optional fields', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {} as ShopperCustomers.schemas['Order'];

        const result = transformOrderForList(scapiOrder);

        expect(result).toEqual({
            orderNo: '',
            orderDate: '',
            status: 'created',
            total: 0,
            currency: undefined,
            itemCount: 0,
            productItems: undefined,
            pickupLocation: undefined,
        });
    });

    test('handles empty product items array', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-789',
            productItems: [],
        } as ShopperCustomers.schemas['Order'];

        const result = transformOrderForList(scapiOrder);

        expect(result.itemCount).toBe(0);
        expect(result.productItems).toEqual([]);
    });

    test('defaults quantity to 1 when undefined', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ productId: 'prod-1', itemId: 'item-1' }],
        } as ShopperCustomers.schemas['Order'];

        const result = transformOrderForList(scapiOrder);

        expect(result.productItems?.[0]?.quantity).toBe(1);
    });

    test('defaults productId to empty string when undefined', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ itemId: 'item-1', quantity: 1 }],
        } as ShopperCustomers.schemas['Order'];

        const result = transformOrderForList(scapiOrder);

        expect(result.productItems?.[0]?.productId).toBe('');
    });

    test('uses product name as alt fallback when image alt is missing', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ productId: 'prod-1', quantity: 1, itemId: 'item-1' }],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            'prod-1': {
                id: 'prod-1',
                name: 'Nice Shirt',
                imageGroups: [{ viewType: 'small', images: [{ link: 'https://example.com/img.jpg' }] }],
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]?.imageAlt).toBe('Nice Shirt');
    });

    test('returns undefined image when product has no imageGroups', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ productId: 'prod-1', quantity: 1, itemId: 'item-1' }],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            'prod-1': {
                id: 'prod-1',
                name: 'Product',
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]?.imageUrl).toBeUndefined();
    });

    test('returns undefined image when small group has no images', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ productId: 'prod-1', quantity: 1, itemId: 'item-1' }],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            'prod-1': {
                id: 'prod-1',
                name: 'Product',
                imageGroups: [{ viewType: 'small', images: [] }],
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]?.imageUrl).toBeUndefined();
    });

    test('uses "Product Image" as alt fallback when both image alt and product name are missing', () => {
        const scapiOrder: ShopperCustomers.schemas['Order'] = {
            orderNo: 'ORD-100',
            productItems: [{ productId: 'prod-1', quantity: 1, itemId: 'item-1' }],
        } as ShopperCustomers.schemas['Order'];

        const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
            'prod-1': {
                id: 'prod-1',
                imageGroups: [{ viewType: 'small', images: [{ link: 'https://example.com/img.jpg' }] }],
            } as ShopperProducts.schemas['Product'],
        };

        const result = transformOrderForList(scapiOrder, productsById);

        expect(result.productItems?.[0]?.imageAlt).toBe('Product Image');
        expect(result.productItems?.[0]?.imageUrl).toBe('https://example.com/img.jpg');
    });
});

describe('fetchCustomerOrders', () => {
    const mockGetCustomerOrders = vi.fn();
    const mockGetProducts = vi.fn();
    const mockClients = {
        shopperCustomers: { getCustomerOrders: mockGetCustomerOrders },
        shopperProducts: { getProducts: mockGetProducts },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue(mockClients as never);
    });

    test('calls getCustomerOrders with customerId in path and default pagination', async () => {
        mockGetCustomerOrders.mockResolvedValue({ data: { data: [], total: 0, offset: 0, limit: 10 } });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(mockGetCustomerOrders).toHaveBeenCalledWith({
            params: {
                path: { customerId: 'customer-123' },
                query: {
                    offset: 0,
                    limit: 10,
                    expand: 'oms',
                },
            },
        });
        expect(result).toEqual({ orders: [], total: 0, offset: 0, limit: 10 });
    });

    test('calls getCustomerOrders with custom pagination options', async () => {
        mockGetCustomerOrders.mockResolvedValue({ data: { data: [], total: 0, offset: 10, limit: 25 } });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-456', {
            offset: 10,
            limit: 25,
        });

        expect(mockGetCustomerOrders).toHaveBeenCalledWith({
            params: {
                path: { customerId: 'customer-456' },
                query: {
                    offset: 10,
                    limit: 25,
                    expand: 'oms',
                },
            },
        });
        expect(result.offset).toBe(10);
        expect(result.limit).toBe(25);
    });

    test('requests OMS status enrichment via expand: oms (scalar, not an array)', async () => {
        mockGetCustomerOrders.mockResolvedValue({ data: { data: [], total: 0, offset: 0, limit: 10 } });

        await fetchCustomerOrders(createTestContext({ currency: 'USD' }), 'customer-1');

        const callArg = mockGetCustomerOrders.mock.calls[0][0];
        expect(callArg.params.query.expand).toBe('oms');
    });

    test('fetches product images and enriches orders', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: {
                data: [
                    {
                        orderNo: 'ORD-1',
                        creationDate: '2024-09-14T10:30:00Z',
                        status: 'new',
                        orderTotal: 100,
                        currency: 'USD',
                        productItems: [{ productId: 'prod-1', quantity: 2, itemId: 'item-1' }],
                    },
                ],
                total: 1,
                offset: 0,
                limit: 10,
            },
        });
        mockGetProducts.mockResolvedValue({
            data: {
                data: [
                    {
                        id: 'prod-1',
                        name: 'Product 1',
                        imageGroups: [
                            {
                                viewType: 'small',
                                images: [{ link: 'https://example.com/prod1.jpg', alt: 'Product 1' }],
                            },
                        ],
                    },
                ],
            },
        });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(mockGetProducts).toHaveBeenCalledWith({
            params: {
                query: {
                    ids: ['prod-1'],
                    expand: ['images'],
                    currency: 'USD',
                },
            },
        });
        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].productItems?.[0]).toMatchObject({
            productId: 'prod-1',
            imageUrl: 'https://example.com/prod1.jpg',
            imageAlt: 'Product 1',
        });
    });

    test('deduplicates product IDs across multiple orders', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: {
                data: [
                    {
                        orderNo: 'ORD-1',
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                    {
                        orderNo: 'ORD-2',
                        productItems: [
                            { productId: 'prod-1', quantity: 1 },
                            { productId: 'prod-2', quantity: 1 },
                        ],
                    },
                ],
                total: 2,
                offset: 0,
                limit: 10,
            },
        });
        mockGetProducts.mockResolvedValue({ data: { data: [] } });

        const context = createTestContext({ currency: 'USD' });
        await fetchCustomerOrders(context, 'customer-123');

        expect(mockGetProducts).toHaveBeenCalledWith({
            params: {
                query: {
                    ids: ['prod-1', 'prod-2'],
                    expand: ['images'],
                    currency: 'USD',
                },
            },
        });
    });

    test('skips getProducts when orders have no product items', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: { data: [{ orderNo: 'ORD-1', productItems: [] }], total: 1, offset: 0, limit: 10 },
        });

        const context = createTestContext({ currency: 'USD' });
        await fetchCustomerOrders(context, 'customer-123');

        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    test('returns orders without images when getProducts fails', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: {
                data: [
                    {
                        orderNo: 'ORD-1',
                        status: 'new',
                        orderTotal: 100,
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                ],
                total: 1,
                offset: 0,
                limit: 10,
            },
        });
        mockGetProducts.mockRejectedValue(new Error('Products API error'));

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].orderNo).toBe('ORD-1');
        expect(result.orders[0].productItems?.[0]?.imageUrl).toBeUndefined();
    });

    test('returns empty result when no orders', async () => {
        mockGetCustomerOrders.mockResolvedValue({ data: { data: [], total: 0, offset: 0, limit: 10 } });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result).toEqual({ orders: [], total: 0, offset: 0, limit: 10 });
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    test('returns empty result when data is undefined', async () => {
        mockGetCustomerOrders.mockResolvedValue({ data: {} });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result.orders).toEqual([]);
        expect(result.total).toBe(0);
    });

    test('returns empty result when getCustomerOrders fails', async () => {
        mockGetCustomerOrders.mockRejectedValue(new Error('API error'));

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result).toEqual({ orders: [], total: 0, offset: 0, limit: 10 });
    });

    test('handles orders with undefined productItems', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: { data: [{ orderNo: 'ORD-1' }], total: 1, offset: 0, limit: 10 },
        });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].productItems).toBeUndefined();
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    test('handles getProducts returning undefined data', async () => {
        mockGetCustomerOrders.mockResolvedValue({
            data: {
                data: [
                    {
                        orderNo: 'ORD-1',
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                ],
                total: 1,
                offset: 0,
                limit: 10,
            },
        });
        mockGetProducts.mockResolvedValue({ data: {} });

        const context = createTestContext({ currency: 'USD' });
        const result = await fetchCustomerOrders(context, 'customer-123');

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].productItems?.[0]?.imageUrl).toBeUndefined();
    });
});
