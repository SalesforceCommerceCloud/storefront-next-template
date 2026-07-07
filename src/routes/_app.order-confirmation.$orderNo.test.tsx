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
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { ApiError, type ShopperOrders, type ShopperStores } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import OrderConfirmationPage, { loader, ErrorBoundary } from './_app.order-confirmation.$orderNo';

const { t } = getTranslation();

// --- Server-side mocks (these cannot run in jsdom) ---

vi.mock('@/lib/api/order.server', () => ({
    fetchOrderWithProducts: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

vi.mock('@/providers/basket', () => ({
    useBasketReset: () => vi.fn(),
}));

vi.mock('@/middlewares/basket.server', () => ({
    destroyBasket: vi.fn(),
}));

vi.mock('@/lib/api/customer.server', () => ({
    isRegisteredCustomer: vi.fn(() => false),
}));

vi.mock('@/lib/login-preferences.server', () => ({
    getLoginPreferences: vi.fn(() => Promise.resolve({ emailVerificationEnabled: false })),
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/lib/api/stores.server', () => ({
    fetchStoresForOrder: vi.fn(),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

import { fetchOrderWithProducts } from '@/lib/api/order.server';
import { destroyBasket } from '@/middlewares/basket.server';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { fetchStoresForOrder } from '@/extensions/bopis/lib/api/stores.server';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// --- Test data ---

const baseOrder: ShopperOrders.schemas['Order'] = {
    orderNo: 'TEST-ORDER-12345',
    status: 'new',
    orderTotal: 150.0,
    productTotal: 100.0,
    productSubTotal: 100.0,
    shippingTotal: 10.0,
    taxTotal: 8.5,
    currency: 'USD',
    customerInfo: {
        email: 'test@example.com',
        firstName: 'John',
    },
    billingAddress: {
        fullName: 'John Doe',
        firstName: 'John',
        address1: '123 Main St',
        city: 'San Francisco',
        stateCode: 'CA',
        postalCode: '94105',
        countryCode: 'US',
    },
    shipments: [
        {
            shipmentId: 'shipment-123',
            shippingAddress: {
                fullName: 'John Doe',
                address1: '123 Main St',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105',
                countryCode: 'US',
            },
            shippingMethod: { id: 'standard', name: 'Standard Shipping' },
        },
    ],
    paymentInstruments: [
        {
            paymentCard: { cardType: 'Visa', numberLastDigits: '1234' },
        },
    ],
    productItems: [
        {
            itemId: 'item1',
            productId: 'product1',
            productName: 'Checked Silk Tie',
            quantity: 1,
            basePrice: 50.0,
            price: 50.0,
            priceAfterItemDiscount: 50.0,
            priceAfterOrderDiscount: 50.0,
        },
    ],
};

// @sfdc-extension-block-start SFDC_EXT_BOPIS
const mockStore: ShopperStores.schemas['Store'] = {
    id: 'store-123',
    name: 'Test Store',
    address1: '456 Store Ave',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94105',
    phone: '555-1234',
    email: 'store@example.com',
};

const mockStoresByStoreId = new Map<string, ShopperStores.schemas['Store']>([['store-123', mockStore]]);
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// --- Helpers ---

function renderRoute(order: ShopperOrders.schemas['Order']) {
    const Stub = createRoutesStub([
        {
            path: '/order-confirmation/:orderNo',
            Component: OrderConfirmationPage,
            loader: () => ({
                orderData: Promise.resolve({
                    order,
                    productsById: {},
                    storesByStoreId: new Map(),
                }),
                showPostOrderRegistration: false,
            }),
        },
    ]);

    return render(
        <AllProvidersWrapper>
            <Stub initialEntries={[`/order-confirmation/${order.orderNo}`]} />
        </AllProvidersWrapper>
    );
}

// --- Tests ---

describe('Order Confirmation Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loader', () => {
        test('returns a promise for order data', async () => {
            const orderPromise = Promise.resolve(baseOrder);
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: orderPromise.then((order) => ({ order, productsById: {} })),
                orderPromise,
            });

            // @sfdc-extension-line SFDC_EXT_BOPIS
            vi.mocked(fetchStoresForOrder).mockResolvedValue(new Map());

            const mockContext = { get: vi.fn(() => undefined) };
            const result = await loader({ context: mockContext, params: { orderNo: 'TEST-ORDER-12345' } } as any);

            expect(result.orderData).toBeInstanceOf(Promise);

            const resolved = await result.orderData;
            expect(resolved).toHaveProperty('order');
            expect(resolved).toHaveProperty('productsById');
        });

        test('calls fetchOrderWithProducts with context and orderNo', async () => {
            const orderPromise = Promise.resolve(baseOrder);
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: orderPromise.then((order) => ({ order, productsById: {} })),
                orderPromise,
            });

            // @sfdc-extension-line SFDC_EXT_BOPIS
            vi.mocked(fetchStoresForOrder).mockResolvedValue(new Map());

            const mockContext = { get: vi.fn(() => undefined) };
            await loader({ context: mockContext, params: { orderNo: 'TEST-ORDER-12345' } } as any);

            expect(vi.mocked(fetchOrderWithProducts)).toHaveBeenCalledWith(mockContext, 'TEST-ORDER-12345');
        });

        test('tears down basket once the order is confirmed (idempotent safety net)', async () => {
            const orderPromise = Promise.resolve(baseOrder);
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: orderPromise.then((order) => ({ order, productsById: {} })),
                orderPromise,
            });
            // @sfdc-extension-line SFDC_EXT_BOPIS
            vi.mocked(fetchStoresForOrder).mockResolvedValue(new Map());

            const mockContext = { get: vi.fn(() => undefined) };
            await loader({ context: mockContext, params: { orderNo: 'TEST-ORDER-12345' } } as any);

            await waitFor(() => {
                expect(vi.mocked(destroyBasket)).toHaveBeenCalledWith(mockContext);
            });
        });

        test('does not tear down basket when the order lookup fails', async () => {
            // Defer the rejection to a microtask so .catch handlers attach before it
            // surfaces - direct Promise.reject() would fire as unhandled between
            // construction and the next line.
            const orderPromise = new Promise<typeof baseOrder>((_, reject) => {
                queueMicrotask(() => reject(new Error('order not found')));
            });
            const orderDataPromise = orderPromise.then((order) => ({ order, productsById: {} }));
            orderPromise.catch(() => undefined);
            orderDataPromise.catch(() => undefined);
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise,
                orderPromise,
            });
            // @sfdc-extension-line SFDC_EXT_BOPIS
            vi.mocked(fetchStoresForOrder).mockResolvedValue(new Map());

            const mockContext = { get: vi.fn(() => undefined) };
            const result = await loader({ context: mockContext, params: { orderNo: 'INVALID' } } as any);
            // Loader's combinedPromise also rejects; in production <Await> handles it,
            // here we attach an explicit catch so the test runner doesn't see it as
            // unhandled.
            result.orderData.catch(() => undefined);

            // Drive the rejection through the loader's .catch so the assertion runs after
            // the loader has had its chance to react. Awaiting the promise itself is the
            // observable signal we want, not an opaque microtask count.
            await orderPromise.catch(() => undefined);

            expect(vi.mocked(destroyBasket)).not.toHaveBeenCalled();
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        test('fetches stores for BOPIS orders', async () => {
            const orderPromise = Promise.resolve(baseOrder);
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: orderPromise.then((order) => ({ order, productsById: {} })),
                orderPromise,
            });

            vi.mocked(fetchStoresForOrder).mockResolvedValue(mockStoresByStoreId);

            const mockContext = { get: vi.fn(() => undefined) };
            const result = await loader({ context: mockContext, params: { orderNo: 'TEST-ORDER-12345' } } as any);

            const resolved = await result.orderData;
            expect(resolved).toHaveProperty('storesByStoreId');
            expect(vi.mocked(fetchStoresForOrder)).toHaveBeenCalled();
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    describe('ErrorBoundary', () => {
        const createApiError = (status: number) =>
            new ApiError({
                status,
                statusText: 'Test',
                headers: new Headers(),
                body: { type: '', title: '', detail: '' },
                rawBody: '{}',
                url: 'https://api.example.com/orders/INVALID',
                method: 'GET',
            });

        test('renders order-not-found messaging when getOrder throws ApiError(404)', () => {
            const Stub = createRoutesStub([
                {
                    path: '/order-confirmation/:orderNo',
                    Component: () => {
                        throw createApiError(404);
                    },
                    ErrorBoundary,
                },
            ]);

            render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/order-confirmation/INVALID']} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(t('checkout:confirmation.orderNotFound'))).toBeInTheDocument();
            expect(screen.getByText(t('checkout:confirmation.orderNotFoundDescription'))).toBeInTheDocument();
            expect(screen.getByText(t('checkout:confirmation.actions.continueShopping'))).toBeInTheDocument();
        });

        test('renders order-placed-but-details-unavailable messaging on 5xx, with the orderNo surfaced', () => {
            const Stub = createRoutesStub([
                {
                    path: '/order-confirmation/:orderNo',
                    Component: () => {
                        throw createApiError(500);
                    },
                    ErrorBoundary,
                },
            ]);

            render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/order-confirmation/ORD-9001']} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(t('checkout:confirmation.orderPlacedDetailsUnavailable'))).toBeInTheDocument();
            expect(
                screen.getByText(t('checkout:confirmation.orderPlacedDetailsUnavailableDescription'))
            ).toBeInTheDocument();
            // Surface the orderNo so the shopper / support can reconcile.
            expect(screen.getByText(/ORD-9001/)).toBeInTheDocument();
        });

        test('renders order-placed-but-details-unavailable messaging on non-ApiError throws (network/timeout)', () => {
            const Stub = createRoutesStub([
                {
                    path: '/order-confirmation/:orderNo',
                    Component: () => {
                        throw new Error('boom');
                    },
                    ErrorBoundary,
                },
            ]);

            render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/order-confirmation/ORD-9001']} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(t('checkout:confirmation.orderPlacedDetailsUnavailable'))).toBeInTheDocument();
        });
    });

    describe('rendering', () => {
        test('displays order number and customer info', async () => {
            renderRoute(baseOrder);

            await waitFor(() => {
                expect(screen.getByTestId('order-number')).toHaveTextContent('TEST-ORDER-12345');
            });
        });

        test('displays shipping address and method', async () => {
            renderRoute(baseOrder);

            await waitFor(() => {
                expect(screen.getByText('123 Main St')).toBeInTheDocument();
                expect(screen.getByText('Standard Shipping')).toBeInTheDocument();
            });
        });

        test('displays product item name and discounted price', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Checked Silk Tie',
                        quantity: 1,
                        basePrice: 19.19,
                        price: 19.19,
                        priceAfterItemDiscount: 4.59,
                        priceAfterOrderDiscount: 4.59,
                        priceAdjustments: [{ priceAdjustmentId: 'pa1', itemText: '$10 Off Ties', price: -14.6 }],
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                expect(screen.getByText('Checked Silk Tie')).toBeInTheDocument();
            });
        });

        test('displays payment card info', async () => {
            renderRoute(baseOrder);

            await waitFor(() => {
                expect(screen.getByText('Visa')).toBeInTheDocument();
            });
        });
    });

    describe('promotions display', () => {
        test('includes item-level price adjustments in promotions total', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                productTotal: 4.59,
                productSubTotal: 4.59,
                orderTotal: 10.58,
                taxTotal: 0.5,
                shippingTotal: 5.99,
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Checked Silk Tie',
                        quantity: 1,
                        basePrice: 19.19,
                        price: 19.19,
                        priceAfterItemDiscount: 4.59,
                        priceAfterOrderDiscount: 4.59,
                        priceAdjustments: [{ priceAdjustmentId: 'pa1', itemText: '$10 Off Ties', price: -14.6 }],
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                const promotionsLabel = screen.getByText(t('checkout:confirmation.totals.promotions'));
                const promotionsRow = promotionsLabel.closest('div');
                const promotionsValue = promotionsRow?.querySelector('span:last-child');
                expect(promotionsValue?.textContent).not.toContain('0.00');
            });
        });

        test('sums both order-level and item-level adjustments', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                productTotal: 30.0,
                orderTotal: 50.0,
                taxTotal: 5.0,
                shippingTotal: 10.0,
                orderPriceAdjustments: [{ priceAdjustmentId: 'opa1', itemText: '10% Off Order', price: -5.0 }],
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Tie',
                        quantity: 1,
                        basePrice: 50.0,
                        price: 50.0,
                        priceAfterItemDiscount: 40.0,
                        priceAdjustments: [{ priceAdjustmentId: 'pa1', itemText: '$10 Off Ties', price: -10.0 }],
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                const promotionsLabel = screen.getByText(t('checkout:confirmation.totals.promotions'));
                const promotionsRow = promotionsLabel.closest('div');
                const promotionsValue = promotionsRow?.querySelector('span:last-child');
                // -5 + -10 = -15, should not be 0
                expect(promotionsValue?.textContent).not.toContain('0.00');
            });
        });

        test('shows zero promotions when no adjustments exist', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                orderPriceAdjustments: undefined,
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Belt',
                        quantity: 1,
                        basePrice: 50.0,
                        price: 50.0,
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                const promotionsLabel = screen.getByText(t('checkout:confirmation.totals.promotions'));
                const promotionsRow = promotionsLabel.closest('div');
                const promotionsValue = promotionsRow?.querySelector('span:last-child');
                expect(promotionsValue?.textContent).toContain('0.00');
            });
        });

        test('applies green styling to non-zero promotions', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Tie',
                        quantity: 1,
                        basePrice: 50.0,
                        price: 50.0,
                        priceAfterItemDiscount: 40.0,
                        priceAdjustments: [{ priceAdjustmentId: 'pa1', itemText: 'Sale', price: -10.0 }],
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                const promotionsLabel = screen.getByText(t('checkout:confirmation.totals.promotions'));
                const promotionsRow = promotionsLabel.closest('div');
                const promotionsValue = promotionsRow?.querySelector('span:last-child');
                expect(promotionsValue).toHaveClass('text-success');
            });
        });

        test('shows original price with strikethrough when item has discount', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                productItems: [
                    {
                        itemId: 'item1',
                        productId: 'product1',
                        productName: 'Checked Silk Tie',
                        quantity: 1,
                        basePrice: 19.19,
                        price: 19.19,
                        priceAfterItemDiscount: 4.59,
                        priceAfterOrderDiscount: 4.59,
                        priceAdjustments: [{ priceAdjustmentId: 'pa1', itemText: '$10 Off Ties', price: -14.6 }],
                    },
                ],
            };

            renderRoute(order);

            await waitFor(() => {
                const strikethroughEl = document.querySelector('.line-through');
                expect(strikethroughEl).toBeInTheDocument();
            });
        });
    });

    describe('delivery window', () => {
        const baseShipment: NonNullable<ShopperOrders.schemas['Order']['shipments']>[number] = {
            shipmentId: 'shipment-123',
            shippingAddress: baseOrder.shipments?.[0]?.shippingAddress,
            shippingMethod: { id: 'standard', name: 'Standard Shipping' },
        };

        test('shows formatted delivery window when shipment has c_ custom attributes', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                shipments: [
                    {
                        ...baseShipment,
                        ...({
                            c_deliveryWindowStartAt: '2026-04-30T12:00:00Z',
                            c_deliveryWindowEndAt: '2026-05-07T12:00:00Z',
                        } as Record<string, unknown>),
                    },
                ],
            };
            renderRoute(order);

            await waitFor(() => {
                expect(screen.getByText(/30.*Apr.*2026|Apr 30.*2026/)).toBeInTheDocument();
            });
        });

        test('falls back to shippingMethod description when no deliveryWindow', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                shipments: [
                    {
                        ...baseShipment,
                        shippingMethod: { id: 'standard', name: 'Standard Shipping', description: '5-7 business days' },
                    },
                ],
            };
            renderRoute(order);

            await waitFor(() => {
                expect(screen.getByText('5-7 business days')).toBeInTheDocument();
            });
        });

        test('shows placeholder when no deliveryWindow and no description', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                shipments: [baseShipment],
            };
            renderRoute(order);

            await waitFor(() => {
                expect(
                    screen.getByText(t('checkout:confirmation.summaryLabels.estimatedDatePlaceholder'))
                ).toBeInTheDocument();
            });
        });
    });

    describe('totals row', () => {
        test('displays subtotal, shipping, tax, and total', async () => {
            renderRoute(baseOrder);

            await waitFor(() => {
                expect(screen.getByText(t('checkout:confirmation.totals.subtotal'))).toBeInTheDocument();
                expect(screen.getByText(t('checkout:confirmation.totals.shipping'))).toBeInTheDocument();
                expect(screen.getByText(t('checkout:confirmation.totals.tax'))).toBeInTheDocument();
                expect(screen.getByText(t('checkout:confirmation.totals.total'))).toBeInTheDocument();
            });
        });

        test('shows free shipping label when shipping is zero', async () => {
            const order: ShopperOrders.schemas['Order'] = {
                ...baseOrder,
                shippingTotal: 0,
            };

            renderRoute(order);

            await waitFor(() => {
                expect(screen.getByText(t('checkout:confirmation.summaryLabels.freeShipping'))).toBeInTheDocument();
            });
        });
    });
});
