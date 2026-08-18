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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { GuestOrderDetails, type GuestOrderDetailsProps } from './guest-order-details';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

function renderGuestOrderDetails(props: GuestOrderDetailsProps) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigWrapper>
                        <SiteProvider
                            site={mockSiteObject}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
                            <GuestOrderDetails {...props} />
                        </SiteProvider>
                    </ConfigWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
}

function productFixture(
    id: string,
    name: string,
    imageGroups: ShopperProducts.schemas['Product']['imageGroups'] = []
): ShopperProducts.schemas['Product'] {
    return {
        id,
        name,
        imageGroups,
        variationAttributes: [],
        variationValues: {},
    } as ShopperProducts.schemas['Product'];
}

describe('GuestOrderDetails', () => {
    it('renders order number', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.getByTestId('order-number')).toHaveTextContent('GLO12345');
    });

    it('does not render order number when absent', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderTotal: 100,
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.queryByTestId('order-number')).not.toBeInTheDocument();
    });

    it('renders order status badge when status is present', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            status: 'completed',
            orderTotal: 100,
        };

        renderGuestOrderDetails({ order, productsById: {} });

        const badge = screen.getByTestId('order-status-badge');
        expect(badge).toBeInTheDocument();
    });

    it('does not render items section when productItems is empty', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
            productItems: [],
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.queryByText(/items ordered/i)).not.toBeInTheDocument();
    });

    it('renders items section when productItems is present', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'Test Product',
                    quantity: 1,
                    priceAfterItemDiscount: 50,
                    shipmentId: 'ship-1',
                },
            ],
            shipments: [
                {
                    shipmentId: 'ship-1',
                },
            ],
        };

        const productsById = {
            'prod-1': productFixture('prod-1', 'Test Product'),
        };

        renderGuestOrderDetails({ order, productsById });

        expect(screen.getByText(/items ordered/i)).toBeInTheDocument();
        expect(screen.getByText('Test Product')).toBeInTheDocument();
    });

    it('does not render shipping address when absent', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'Test Product',
                    quantity: 1,
                    priceAfterItemDiscount: 50,
                    shipmentId: 'ship-1',
                },
            ],
            shipments: [
                {
                    shipmentId: 'ship-1',
                    // no shippingAddress
                },
            ],
        };

        const productsById = {
            'prod-1': productFixture('prod-1', 'Test Product'),
        };

        renderGuestOrderDetails({ order, productsById });

        expect(screen.queryByText(/shipping address/i)).not.toBeInTheDocument();
    });

    it('renders shipping address when present', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'Test Product',
                    quantity: 1,
                    priceAfterItemDiscount: 50,
                    shipmentId: 'ship-1',
                },
            ],
            shipments: [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        fullName: 'John Doe',
                        address1: '123 Main St',
                        city: 'Seattle',
                        stateCode: 'WA',
                        postalCode: '98101',
                        countryCode: 'US',
                    },
                },
            ],
        };

        const productsById = {
            'prod-1': productFixture('prod-1', 'Test Product'),
        };

        renderGuestOrderDetails({ order, productsById });

        expect(screen.getByRole('heading', { level: 4, name: /shipping address/i })).toBeInTheDocument();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: /shipment 1/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 4, name: 'Test Product' })).toBeInTheDocument();
    });

    it('does not render payment method when absent', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.queryByText(/payment method/i)).not.toBeInTheDocument();
    });

    it('renders payment method when present', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pay-1',
                    paymentCard: {
                        cardType: 'Visa',
                        numberLastDigits: '4242',
                    },
                },
            ],
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.getByText(/payment method/i)).toBeInTheDocument();
        expect(screen.getByText(/visa/i)).toBeInTheDocument();
        expect(screen.getByText(/4242/i)).toBeInTheDocument();
    });

    it('renders order summary for all order variants', () => {
        const order: Partial<ShopperOrders.schemas['Order']> = {
            orderNo: 'GLO12345',
            orderTotal: 100,
        };

        renderGuestOrderDetails({ order, productsById: {} });

        expect(screen.getByText(/order summary/i)).toBeInTheDocument();
    });
});
