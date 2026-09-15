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
import ProductPrice from './index';

describe('ProductPrice', () => {
    const mockProduct = {
        id: 'test-product',
        name: 'Test Product',
        price: 29.99,
        priceMax: 39.99,
        hitType: 'product' as const,
        type: {},
        variants: [],
        tieredPrices: [
            { quantity: 1, price: 29.99 },
            { quantity: 5, price: 39.99 },
        ],
    };

    test('renders current price and list price for standard product', () => {
        render(<ProductPrice product={mockProduct} currency="USD" labelForA11y="Test Product" />);

        // Price range displayed as min – max (no "From" prefix)
        expect(screen.getByText('$29.99 – $39.99')).toBeInTheDocument();
    });

    test('renders only current price for set product', () => {
        const setProduct = {
            ...mockProduct,
            hitType: 'set' as const,
            type: { set: true },
        };

        render(<ProductPrice product={setProduct} currency="USD" labelForA11y="Test Set" />);

        // Set product with price range shows min – max
        expect(screen.getByText('$29.99 – $39.99')).toBeInTheDocument();
    });

    test('renders current price only when not on sale', () => {
        const noSaleProduct = {
            ...mockProduct,
            priceMax: undefined,
            tieredPrices: [{ quantity: 1, price: 29.99 }],
        };

        render(<ProductPrice product={noSaleProduct} currency="USD" labelForA11y="Test Product" />);

        expect(screen.getByText('$29.99')).toBeInTheDocument();
        expect(screen.queryByText('$39.99')).not.toBeInTheDocument();
    });

    test('applies custom className', () => {
        const { container } = render(
            <ProductPrice product={mockProduct} currency="USD" labelForA11y="Test Product" className="custom-class" />
        );

        expect(container.firstChild).toHaveClass('custom-class');
    });

    test('handles quantity multiplication', () => {
        render(<ProductPrice product={mockProduct} currency="USD" quantity={2} labelForA11y="Test Product" />);

        // Quantity multiplies range: 29.99*2 – 39.99*2
        expect(screen.getByText('$59.98 – $79.98')).toBeInTheDocument();
    });

    test('does not apply quantity multiplication when type is unit', () => {
        render(
            <ProductPrice product={mockProduct} currency="USD" quantity={2} labelForA11y="Test Product" type="unit" />
        );

        // Unit type: show range per unit, no quantity multiplication
        expect(screen.getByText('$29.99 – $39.99')).toBeInTheDocument();
        expect(screen.queryByText('$59.98 – $79.98')).not.toBeInTheDocument();
    });

    test('does not render a list price for a basket item whose derived unit price equals its list price', () => {
        render(
            <ProductPrice
                product={
                    {
                        itemId: 'cart-item',
                        basePrice: 34.99,
                        price: 174.95,
                        priceAfterItemDiscount: 174.95,
                        quantity: 5,
                    } as unknown as Parameters<typeof ProductPrice>[0]['product']
                }
                currency="USD"
                quantity={5}
            />
        );

        expect(screen.getAllByText('$174.95')).toHaveLength(1);
        expect(document.querySelector('.line-through')).not.toBeInTheDocument();
    });

    test('does not render indistinguishable unit prices for a discounted basket item', () => {
        render(
            <ProductPrice
                product={
                    {
                        itemId: 'cart-item',
                        basePrice: 10,
                        price: 29.99,
                        priceAfterItemDiscount: 29.99,
                        quantity: 3,
                    } as unknown as Parameters<typeof ProductPrice>[0]['product']
                }
                currency="USD"
                quantity={3}
                type="unit"
            />
        );

        expect(screen.getAllByText('$10.00')).toHaveLength(1);
        expect(document.querySelector('.line-through')).not.toBeInTheDocument();
    });

    test('renders "Price unavailable" when the product has no price for the currency', () => {
        const noPriceProduct = {
            id: 'test-product',
            name: 'Test Product',
            hitType: 'product' as const,
            type: { item: true },
        };

        render(<ProductPrice product={noPriceProduct} currency="DKK" labelForA11y="Test Product" />);

        expect(screen.getAllByText('Price unavailable').length).toBeGreaterThan(0);
        // Must not present the missing price as free / 0.
        expect(screen.queryByText(/0[.,]00/)).not.toBeInTheDocument();
    });

    test('renders a no-price product normally (not "Price unavailable") when allowMissingPrice is set', () => {
        const noPriceProduct = {
            id: 'bonus-product',
            name: 'Bonus Product',
            hitType: 'product' as const,
            type: { item: true },
        };

        render(<ProductPrice product={noPriceProduct} currency="USD" labelForA11y="Bonus Product" allowMissingPrice />);

        // Bonus/promo products opt out of the "unavailable" treatment and render the coalesced 0.
        expect(screen.queryByText('Price unavailable')).not.toBeInTheDocument();
        expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    test('renders an explicit 0 price as a real price, not "Price unavailable"', () => {
        const freeProduct = {
            id: 'free-product',
            name: 'Free Product',
            price: 0,
            hitType: 'product' as const,
            type: { item: true },
        };

        render(<ProductPrice product={freeProduct} currency="USD" labelForA11y="Free Product" />);

        expect(screen.getByText('$0.00')).toBeInTheDocument();
        expect(screen.queryByText('Price unavailable')).not.toBeInTheDocument();
    });
});
