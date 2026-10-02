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
import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
    EMPTY_CART_FULFILLMENT_STATE,
    getCartFulfillmentSnapshot,
    getDefaultLocation,
    writeCartFulfillmentState,
} from '@/lib/fulfillment-location';
import { ProductAvailabilitySummary } from './availability-summary';
import { LocationSelector } from './location-selector';
import { FulfillmentGroups } from './fulfillment-groups';

// Two products that exist in data/simplified_city_management.json (variant ids resolve to the master).
const PRODUCT_A = 'DU-893268-34';
const PRODUCT_B = 'DU-893259-36';

beforeEach(() => {
    window.localStorage.clear();
    writeCartFulfillmentState(EMPTY_CART_FULFILLMENT_STATE);
});

describe('ProductAvailabilitySummary (PLP)', () => {
    test('shows city, stock, postal code, distance and lead time', () => {
        const location = getDefaultLocation('DU-893268');
        render(<ProductAvailabilitySummary productId="DU-893268" />);

        const summary = screen.getByTestId('fulfillment-availability');
        expect(summary).toHaveTextContent(location?.city ?? '');
        expect(summary).toHaveTextContent(String(location?.stockLevel));
        expect(summary).toHaveTextContent(location?.postalCode ?? '');
        expect(summary).toHaveTextContent(`${location?.distance} km`);
        expect(summary).toHaveTextContent(new RegExp(`${location?.leadTime} days?`));
    });

    test('renders nothing for a product without fulfillment data', () => {
        render(<ProductAvailabilitySummary productId="UNKNOWN" />);
        expect(screen.queryByTestId('fulfillment-availability')).not.toBeInTheDocument();
    });
});

describe('LocationSelector (PDP)', () => {
    test('renders one selected radio for the default location', () => {
        const location = getDefaultLocation('DU-893268');
        render(<LocationSelector productId="DU-893268" />);

        const radio = screen.getByRole('radio', { name: new RegExp(location?.city ?? '') });
        expect(radio).toBeChecked();
    });

    test('renders nothing for a product without fulfillment data', () => {
        render(<LocationSelector productId="UNKNOWN" />);
        expect(screen.queryByTestId('fulfillment-location-selector')).not.toBeInTheDocument();
    });
});

describe('FulfillmentGroups (cart / checkout)', () => {
    const basket = {
        basketId: 'b1',
        productItems: [
            { itemId: '1', productId: PRODUCT_A, productName: 'Pullover A', quantity: 2 },
            { itemId: '2', productId: PRODUCT_B, productName: 'Pullover B', quantity: 1 },
            { itemId: '3', productId: 'UNKNOWN', productName: 'Not mapped', quantity: 1 },
        ],
    };

    test('groups items by city and skips products without fulfillment data', () => {
        render(<FulfillmentGroups basket={basket} variant="cart" />);

        expect(screen.getByText('Pullover A')).toBeInTheDocument();
        expect(screen.getByText('Pullover B')).toBeInTheDocument();
        expect(screen.queryByText('Not mapped')).not.toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(1);
    });

    test('checkout variant labels numbered delivery groups', () => {
        render(<FulfillmentGroups basket={basket} variant="checkout" />);
        expect(screen.getByTestId('fulfillment-groups-checkout')).toHaveTextContent('Delivery group 1');
    });

    test('persists the fulfillment JSON and drops removed products when the basket changes', async () => {
        const { rerender } = render(<FulfillmentGroups basket={basket} />);
        await waitFor(() =>
            expect(getCartFulfillmentSnapshot().cartItems.map((i) => i.productId)).toEqual([PRODUCT_A, PRODUCT_B])
        );
        expect(getCartFulfillmentSnapshot().cartItems[0].quantity).toBe(2);

        rerender(
            <FulfillmentGroups basket={{ ...basket, productItems: [{ ...basket.productItems[0], quantity: 5 }] }} />
        );
        await waitFor(() => expect(getCartFulfillmentSnapshot().cartItems).toHaveLength(1));
        expect(getCartFulfillmentSnapshot().cartItems[0]).toMatchObject({ productId: PRODUCT_A, quantity: 5 });
    });

    test('does not touch stored data while the basket has not loaded', () => {
        render(<FulfillmentGroups basket={basket} />);
        const before = getCartFulfillmentSnapshot();
        render(<FulfillmentGroups basket={undefined} />);
        expect(getCartFulfillmentSnapshot()).toBe(before);
    });

    test('renders nothing for an empty basket', () => {
        render(<FulfillmentGroups basket={{ basketId: 'b2', productItems: [] }} />);
        expect(screen.queryByTestId('fulfillment-groups-cart')).not.toBeInTheDocument();
    });
});

describe('cart delivery cards', () => {
    test('title names the city and postal code; line info shows stock, distance and lead time', async () => {
        const { CartGroupTitle, CartLineFulfillmentInfo } = await import('./cart-group-title');
        const location = getDefaultLocation('DU-893268');
        const fulfillment = {
            locationId: location?.fulfillmentLocationId ?? '',
            city: location?.city ?? '',
            postalCode: location?.postalCode ?? '',
            stockLevel: 3,
            distance: 8,
            distanceUnit: 'KM' as const,
            leadTime: 2,
            leadTimeUnit: 'DAYS' as const,
        };
        const item = { productId: 'P', productName: 'P', sku: 'P', quantity: 5, fulfillment };

        render(
            <>
                <CartGroupTitle
                    group={{
                        locationId: fulfillment.locationId,
                        city: fulfillment.city,
                        postalCode: fulfillment.postalCode,
                        items: [item],
                    }}
                    itemCount={1}
                    totalCount={2}
                />
                <CartLineFulfillmentInfo item={item} />
            </>
        );

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
            `Delivery from ${fulfillment.city} - 1 out of 2 items`
        );
        const info = screen.getByTestId('fulfillment-line-info');
        expect(info).toHaveTextContent('Stock: 3');
        expect(info).toHaveTextContent('8 km');
        expect(info).toHaveTextContent('2 days');
        expect(screen.getByRole('alert')).toHaveTextContent(`Only 3 available in ${fulfillment.city}`);
    });
});
