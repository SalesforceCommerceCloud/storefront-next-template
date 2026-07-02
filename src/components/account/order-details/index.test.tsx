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
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { OrderDetails } from './index';

vi.mock('@/targets/ui-target', () => ({ UITarget: () => null }));
vi.mock('@/extensions/ratings-reviews/components/target/order-line-review-target', () => ({
    default: () => null,
}));
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperOrders, ShopperProducts } from '@/scapi';

const mockSite = mockSiteObject;

const { t } = getTranslation();

const defaultOrder: ShopperOrders.schemas['Order'] = {
    orderNo: 'INO001',
    status: 'new',
    orderTotal: 71.38,
    productSubTotal: 61.99,
    productTotal: 61.99,
    productItems: [
        {
            itemId: '0066d7441cdaf6f93a64ca7a74',
            productId: '701643108633M',
            productName: 'First Product',
            quantity: 1,
            basePrice: 61.99,
            price: 61.99,
            priceAfterItemDiscount: 61.99,
            shipmentId: 'me',
        },
    ],
    shipments: [
        {
            shipmentId: 'me',
            shipmentNo: '00002503',
            trackingNumber: '1234567890',
            shippingAddress: {
                address1: '2030 Market street 8th st',
                city: 'Seattle',
                countryCode: 'US',
                firstName: 'John',
                fullName: 'John Snow',
                lastName: 'Snow',
                postalCode: '98121',
                stateCode: 'WA',
            },
            shippingMethod: { id: '001', name: 'Ground', price: 5.99 },
        },
    ],
};

const defaultProductsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
    '701643108633M': {
        id: '701643108633M',
        name: 'First Product',
        imageGroups: [{ viewType: 'small', images: [{ link: '', alt: 'First Product' }] }],
        variationAttributes: [],
        variationValues: {},
    } as ShopperProducts.schemas['Product'],
};

/** Wraps OrderDetails with required router + config + currency context. */
function OrderDetailsWithProviders({ order = defaultOrder }: { order?: ShopperOrders.schemas['Order'] }) {
    return (
        <MemoryRouter>
            <ConfigWrapper>
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <OrderDetails order={order} productsById={defaultProductsById} />
                </SiteProvider>
            </ConfigWrapper>
        </MemoryRouter>
    );
}

describe('OrderDetails', () => {
    const renderOrderDetails = (order = defaultOrder) => render(<OrderDetailsWithProviders order={order} />);

    test('renders order details section', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('account:orders.orderDetailsPageTitle'));
        expect(document.querySelector('[data-section="order-details"]')).toBeInTheDocument();
    });

    test('renders page title and order number', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('account:orders.orderDetailsPageTitle'));
        expect(screen.getByText('INO001')).toBeInTheDocument();
    });

    test('renders translated badge for mapped status and raw fallback for unknown status', () => {
        const { unmount: unmountNew } = renderOrderDetails({
            ...defaultOrder,
            status: 'new',
        });
        expect(screen.getByText(t('account:orders.status.new'))).toBeInTheDocument();
        unmountNew();

        const { unmount: unmountShipped } = renderOrderDetails({
            ...defaultOrder,
            status: 'shipped' as ShopperOrders.schemas['Order']['status'],
        });
        expect(screen.getByText('Shipped')).toBeInTheDocument();
        unmountShipped();

        const { unmount: unmountDelivered } = renderOrderDetails({
            ...defaultOrder,
            status: 'delivered' as ShopperOrders.schemas['Order']['status'],
        });
        expect(screen.getByText('Delivered')).toBeInTheDocument();
        unmountDelivered();
    });

    test('renders translated SCAPI order status badge when status maps via getOrderStatusConfig', () => {
        renderOrderDetails({
            ...defaultOrder,
            status: 'cancelled',
        } as ShopperOrders.schemas['Order']);
        expect(screen.getByText(t('account:orders.status.cancelled'))).toBeInTheDocument();
        expect(screen.getByTestId('order-status-icon')).toBeInTheDocument();
    });

    test('order-status badge prefers OMS status when ECOM status is absent (consistent with the order-history list)', () => {
        // No top-level status → must fall back to omsData.status, so the detail-page
        // badge can't disagree with the OMS-preferred history-list badge for the same order.
        const order = {
            ...defaultOrder,
            status: undefined,
            omsData: { status: 'cancelled' },
        } as unknown as ShopperOrders.schemas['Order'];
        renderOrderDetails(order);
        expect(screen.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.cancelled'));
    });

    test('order-status badge prefers ECOM status over OMS status when both are present', () => {
        // Two different mapped statuses so the assertion proves which one wins:
        // the badge is ECOM-first (matching the order-history list), so the
        // ECOM status wins over OMS. (OMS-preferred is the shipment-list mapper's rule,
        // not the badge's.)
        const order = {
            ...defaultOrder,
            status: 'new',
            omsData: { status: 'cancelled' },
        } as unknown as ShopperOrders.schemas['Order'];
        renderOrderDetails(order);
        expect(screen.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        expect(screen.getByTestId('order-status-badge')).not.toHaveTextContent(t('account:orders.status.cancelled'));
    });

    test('order-status badge is hidden when a blank OMS status is the only value (not surfaced as empty)', () => {
        const order = {
            ...defaultOrder,
            status: undefined,
            // blank OMS status must NOT propagate as a status → no badge
            omsData: { status: '' },
        } as unknown as ShopperOrders.schemas['Order'];
        renderOrderDetails(order);
        expect(screen.queryByTestId('order-status-badge')).not.toBeInTheDocument();
    });

    test('renders Items Ordered heading', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 2, name: t('account:orders.itemsOrdered') })).toBeInTheDocument();
    });

    test('renders Order Summary heading', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(t('account:orders.orderSummary'));
    });

    test('renders OrderSummary with subtotal and order total from order', () => {
        renderOrderDetails();
        expect(screen.getByTestId('sf-order-summary')).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.subtotal'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.total'))).toBeInTheDocument();
        expect(screen.getByText(/71\.38/)).toBeInTheDocument();
    });

    test('renders Shipment 1 header', () => {
        renderOrderDetails();
        const shipmentLabel = t('account:orders.shipmentNumber', { n: '1' });
        expect(screen.getByText(shipmentLabel)).toBeInTheDocument();
    });

    test('renders product name from order items', () => {
        renderOrderDetails();
        expect(screen.getByText('First Product')).toBeInTheDocument();
    });

    test('renders multiple products in a single shipment grouped under Shipment 1', () => {
        const firstItem = defaultOrder.productItems?.[0];
        if (!firstItem) throw new Error('mock order has no product items');
        const secondItem = {
            itemId: 'item-2',
            productId: 'prod-2',
            productName: 'Second Product',
            quantity: 2,
            basePrice: 29.99,
            price: 29.99,
            priceAfterItemDiscount: 29.99,
            shipmentId: 'me',
        };
        const orderWithMultipleItems = {
            ...defaultOrder,
            productItems: [firstItem, secondItem],
        };
        renderOrderDetails(orderWithMultipleItems);
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '1' }))).toBeInTheDocument();
        expect(screen.getByText('First Product')).toBeInTheDocument();
        expect(screen.getByText('Second Product')).toBeInTheDocument();
        // ProductPrice shows the price on screen (visible) and again in a hidden span for screen readers (sr-only), so the first item’s price appears twice in the DOM
        expect(screen.getAllByText('£61.99')).toHaveLength(2);
        expect(screen.getAllByText('£29.99')).toHaveLength(1);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    test('renders multiple shipments with items grouped by shipment', () => {
        const orderWithMultipleShipments = {
            orderNo: 'INV002',
            status: 'new',
            shipments: [
                {
                    shipmentId: 'ship-a',
                    shipmentNo: '00002501',
                    shippingAddress: {
                        firstName: 'Alice',
                        lastName: 'Smith',
                        fullName: 'Alice Smith',
                    },
                },
                {
                    shipmentId: 'ship-b',
                    shipmentNo: '00002502',
                    shippingAddress: {
                        firstName: 'Bob',
                        lastName: 'Jones',
                        fullName: 'Bob Jones',
                    },
                },
            ],
            productItems: [
                {
                    itemId: 'item-a1',
                    productId: 'prod-a',
                    productName: 'Product for Alice',
                    quantity: 1,
                    priceAfterItemDiscount: 10,
                    shipmentId: 'ship-a',
                },
                {
                    itemId: 'item-b1',
                    productId: 'prod-b',
                    productName: 'Product for Bob',
                    quantity: 1,
                    priceAfterItemDiscount: 20,
                    shipmentId: 'ship-b',
                },
            ],
        };
        renderOrderDetails(orderWithMultipleShipments as ShopperOrders.schemas['Order']);
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '1' }))).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '2' }))).toBeInTheDocument();
        expect(screen.getAllByText(/Alice Smith/)).toHaveLength(1); // shipping address card
        expect(screen.getAllByText(/Bob Jones/)).toHaveLength(1); // shipping address card
        expect(screen.getByText('Product for Alice')).toBeInTheDocument();
        expect(screen.getByText('Product for Bob')).toBeInTheDocument();
        const listItems = screen.getAllByRole('listitem');
        const aliceItem = listItems.find((li) => li.textContent?.includes('Product for Alice'));
        const bobItem = listItems.find((li) => li.textContent?.includes('Product for Bob'));
        expect(aliceItem).toBeDefined();
        expect(bobItem).toBeDefined();
        expect(aliceItem).not.toHaveTextContent('Product for Bob');
        expect(bobItem).not.toHaveTextContent('Product for Alice');
    });

    test('renders tracking number and shipping address per shipment when present', () => {
        renderOrderDetails();
        expect(screen.getByText(t('account:orders.trackingNumber'))).toBeInTheDocument();
        expect(screen.getByText('1234567890')).toBeInTheDocument();
        expect(document.querySelector('[data-card="tracking-number"]')).toBeInTheDocument();

        expect(screen.getByText(t('account:orders.shippingAddress'))).toBeInTheDocument();
        expect(document.querySelector('[data-card="shipping-address"]')).toBeInTheDocument();
        expect(screen.getAllByText(/John Snow/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/2030 Market street 8th st/)).toBeInTheDocument();
        expect(screen.getByText(/98121,\s*Seattle,\s*WA/)).toBeInTheDocument();
        expect(screen.getByText('Ground')).toBeInTheDocument();
    });

    test('omits tracking card when trackingNumber is null; omits shipping address card when shippingAddress is missing', () => {
        const orderWithoutTrackingOrAddress = {
            ...defaultOrder,
            shipments: [
                {
                    ...defaultOrder.shipments?.[0],
                    trackingNumber: null,
                    shippingAddress: null,
                    shippingMethod: null,
                },
            ],
        };
        renderOrderDetails(orderWithoutTrackingOrAddress as unknown as ShopperOrders.schemas['Order']);
        expect(screen.queryByText('1234567890')).not.toBeInTheDocument();
        expect(screen.queryByText(t('account:orders.shippingAddress'))).not.toBeInTheDocument();
    });

    test('renders Payment Method section with single card (cardType and last digits)', () => {
        const orderWithPayment = {
            ...defaultOrder,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pay-1',
                    paymentCard: { cardType: 'Visa', numberLastDigits: '5678' },
                },
            ],
        };
        renderOrderDetails(orderWithPayment as ShopperOrders.schemas['Order']);
        expect(screen.getByText(t('account:orders.paymentMethod'))).toBeInTheDocument();
        expect(document.querySelector('[data-card="payment-method"]')).toBeInTheDocument();
        const expectedLabel = t('account:orders.paymentMethodEndingIn', {
            cardType: 'Visa',
            lastDigits: '5678',
        });
        expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });

    test('renders Payment Method section with multiple payment methods', () => {
        const orderWithMultiplePayments = {
            ...defaultOrder,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pay-1',
                    paymentCard: { cardType: 'Visa', numberLastDigits: '1234' },
                },
                {
                    paymentInstrumentId: 'pay-2',
                    paymentCard: { cardType: 'Mastercard', numberLastDigits: '9999' },
                },
            ],
        };
        renderOrderDetails(orderWithMultiplePayments as ShopperOrders.schemas['Order']);
        expect(screen.getByText(t('account:orders.paymentMethod'))).toBeInTheDocument();
        const visaLabel = t('account:orders.paymentMethodEndingIn', {
            cardType: 'Visa',
            lastDigits: '1234',
        });
        const mcLabel = t('account:orders.paymentMethodEndingIn', {
            cardType: 'Mastercard',
            lastDigits: '9999',
        });
        expect(screen.getByText(visaLabel)).toBeInTheDocument();
        expect(screen.getByText(mcLabel)).toBeInTheDocument();
    });

    test('does not show Payment Method section when instrument has no card details', () => {
        const orderWithMethodIdOnly = {
            ...defaultOrder,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pay-1',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {},
                },
            ],
        };
        renderOrderDetails(orderWithMethodIdOnly as ShopperOrders.schemas['Order']);
        expect(screen.queryByText(t('account:orders.paymentMethod'))).not.toBeInTheDocument();
        expect(document.querySelector('[data-card="payment-method"]')).not.toBeInTheDocument();
    });

    test('does not show Payment Method section when order has no payment instruments', () => {
        renderOrderDetails();
        expect(screen.queryByText(t('account:orders.paymentMethod'))).not.toBeInTheDocument();
        expect(document.querySelector('[data-card="payment-method"]')).not.toBeInTheDocument();
    });

    test('does not show Payment Method section when paymentInstruments is empty array', () => {
        renderOrderDetails({ ...defaultOrder, paymentInstruments: [] } as ShopperOrders.schemas['Order']);
        expect(screen.queryByText(t('account:orders.paymentMethod'))).not.toBeInTheDocument();
    });
});
