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
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

// Components
import CartTitle from './cart-title';

describe('CartTitle', () => {
    const mockBasket = {
        basketId: 'test-basket-id',
        productItems: [
            { itemId: 'item-1', quantity: 2 },
            { itemId: 'item-2', quantity: 1 },
            { itemId: 'item-3', quantity: 3 },
        ],
    };

    test('renders correct heading for zero items', () => {
        const emptyBasket = { ...mockBasket, productItems: [] };
        render(<CartTitle basket={emptyBasket} deliveryCount={0} />);

        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 0, count: 0 }))).toBeInTheDocument();
    });

    test('renders correct heading for one item', () => {
        const singleItemBasket = { ...mockBasket, productItems: [{ itemId: 'item-1', quantity: 1 }] };
        render(<CartTitle basket={singleItemBasket} deliveryCount={1} />);

        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 1, count: 1 }))).toBeInTheDocument();
    });

    test('renders correct heading for multiple items', () => {
        render(<CartTitle basket={mockBasket} deliveryCount={3} />);

        // mockBasket quantities (2 + 1 + 3) sum to 6, not the 3 distinct line items.
        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 3, count: 6 }))).toBeInTheDocument();
    });

    test('handles basket with undefined productItems', () => {
        const basketWithoutItems = { basketId: 'test-basket-id' };
        render(<CartTitle basket={basketWithoutItems as { basketId: string }} deliveryCount={0} />);

        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 0, count: 0 }))).toBeInTheDocument();
    });

    test('handles basket with null productItems', () => {
        const basketWithNullItems = { basketId: 'test-basket-id', productItems: undefined };
        render(<CartTitle basket={basketWithNullItems} deliveryCount={0} />);

        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 0, count: 0 }))).toBeInTheDocument();
    });

    test('renders with correct heading level', () => {
        render(<CartTitle basket={mockBasket} deliveryCount={3} />);

        const heading = screen.getByRole('heading', { level: 2 });
        expect(heading).toBeInTheDocument();
    });

    test('renders delivery count different from total count', () => {
        render(<CartTitle basket={mockBasket} deliveryCount={2} />);

        expect(screen.getByText(t('cart:delivery.heading', { deliveryCount: 2, count: 6 }))).toBeInTheDocument();
    });

    test('renders shipping address when available', () => {
        const basketWithAddress = {
            ...mockBasket,
            shipments: [
                {
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'San Francisco',
                        stateCode: 'CA',
                        postalCode: '94105',
                    },
                },
            ],
        };
        render(<CartTitle basket={basketWithAddress as typeof mockBasket} deliveryCount={3} />);

        expect(screen.getByText('123 Main St, San Francisco, CA, 94105')).toBeInTheDocument();
    });
});
