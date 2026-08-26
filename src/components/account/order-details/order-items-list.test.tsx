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
import { describe, test, expect } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { OrderItemsList } from './order-items-list';
import { getOrderLineReviewKey } from './order-line-review-key';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, getSitePrefix, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperOrders } from '@/scapi';

type OrderLine = ShopperOrders.schemas['ProductItem'];

const mockSite = mockSiteObject;

const { t } = getTranslation();

describe('OrderItemsList', () => {
    const renderOrderItemsList = (items: any[], productsById: Record<string, any> = {}) => {
        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: (
                        <ConfigWrapper>
                            <SiteProvider
                                site={mockSite}
                                locale={mockLocale}
                                language={mockSiteObject.defaultLocale}
                                currency={mockSiteObject.defaultCurrency}>
                                <OrderItemsList items={items} productsById={productsById} />
                            </SiteProvider>
                        </ConfigWrapper>
                    ),
                },
            ],
            { initialEntries: ['/'] }
        );
        return render(<RouterProvider router={router} />);
    };

    test('renders empty fallback when no items', () => {
        renderOrderItemsList([]);
        expect(screen.getByText(t('account:orders.emptyItemsFallback'))).toBeInTheDocument();
    });

    test('renders item with all product properties (name, quantity, price, Buy Again link, variation attributes)', () => {
        const items = [
            {
                itemId: 'item-1',
                productId: '701643108633M',
                productName: 'Sweater',
                quantity: 3,
                basePrice: 61.99,
                price: 61.99,
                priceAfterItemDiscount: 61.99,
                shipmentId: 'me',
            },
        ];
        const productsById = {
            '701643108633M': {
                id: '701643108633M',
                name: 'Sweater',
                variationAttributes: [
                    { id: 'size', name: 'Size', values: [{ value: 'M', name: 'M' }] },
                    { id: 'color', name: 'Color', values: [{ value: 'NAVY', name: 'Navy' }] },
                ],
                variationValues: { size: 'M', color: 'NAVY' },
            },
        };
        renderOrderItemsList(items, productsById);

        expect(screen.getByRole('heading', { level: 4, name: 'Sweater' })).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.quantityLabel', { count: 3 }))).toBeInTheDocument();
        expect(screen.getByText('£61.99')).toBeInTheDocument();

        const buyAgainLink = screen.getByRole('link', { name: t('account:orders.buyAgain') });
        expect(buyAgainLink).toHaveAttribute('href', `${getSitePrefix()}/product/701643108633M`);

        expect(screen.getByText(/Size: M/)).toBeInTheDocument();
        expect(screen.getByText(/Color: Navy/)).toBeInTheDocument();
    });

    test('renders multiple items as list', () => {
        const items = [
            {
                itemId: 'item-1',
                productId: 'prod-1',
                productName: 'Product One',
                quantity: 1,
                basePrice: 10,
                price: 10,
                priceAfterItemDiscount: 10,
                shipmentId: 'me',
            },
            {
                itemId: 'item-2',
                productId: 'prod-2',
                productName: 'Product Two',
                quantity: 1,
                basePrice: 20,
                price: 20,
                priceAfterItemDiscount: 20,
                shipmentId: 'me',
            },
        ];
        renderOrderItemsList(items, {});
        expect(screen.getByText('Product One')).toBeInTheDocument();
        expect(screen.getByText('Product Two')).toBeInTheDocument();
        expect(screen.getByText('£10.00')).toBeInTheDocument();
        expect(screen.getByText('£20.00')).toBeInTheDocument();

        const list = screen.getByRole('list');
        expect(list).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    test('does not render Buy Again link when item has no productId', () => {
        const items = [
            {
                itemId: 'item-1',
                productName: 'Standalone Item',
                quantity: 1,
                basePrice: 15,
                price: 15,
                priceAfterItemDiscount: 15,
                shipmentId: 'me',
            },
        ];
        renderOrderItemsList(items, {});
        expect(screen.getByText('Standalone Item')).toBeInTheDocument();
        expect(screen.getByText('£15.00')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: t('account:orders.buyAgain') })).not.toBeInTheDocument();
    });

    test('uses quantity 1 in label when item quantity is undefined', () => {
        const items = [
            {
                itemId: 'item-1',
                productId: 'prod-1',
                productName: 'Product',
                basePrice: 9.99,
                price: 9.99,
                priceAfterItemDiscount: 9.99,
                shipmentId: 'me',
            },
        ];
        renderOrderItemsList(items, {});
        expect(screen.getByText(t('account:orders.quantityLabel', { count: 1 }))).toBeInTheDocument();
    });

    test('renders product image when product has imageGroups', () => {
        const items = [
            {
                itemId: 'item-1',
                productId: 'prod-1',
                productName: 'Product With Image',
                quantity: 1,
                basePrice: 50,
                price: 50,
                priceAfterItemDiscount: 50,
                shipmentId: 'me',
            },
        ];
        const productsById = {
            'prod-1': {
                id: 'prod-1',
                name: 'Product With Image',
                imageGroups: [
                    {
                        viewType: 'small',
                        images: [{ link: 'https://example.com/img.jpg', alt: 'Product With Image' }],
                    },
                ],
            },
        };
        renderOrderItemsList(items, productsById);
        const img = screen.getByRole('img', { name: 'Product With Image' });
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', expect.stringContaining('example.com/img.jpg'));
    });
});

describe('getOrderLineReviewKey', () => {
    test('prefers itemId when present', () => {
        expect(getOrderLineReviewKey('ORD-1', { itemId: 'abc-123', productId: 'p1' } as OrderLine, 0)).toBe('abc-123');
    });

    test('falls back to orderNo, productId, quantity, and index when itemId is missing', () => {
        expect(getOrderLineReviewKey('ORD-1', { productId: 'p1', quantity: 2 } as OrderLine, 2)).toBe('ORD-1-p1-2-2');
    });

    test('uses unknown placeholders when orderNo and productId are missing', () => {
        expect(getOrderLineReviewKey(undefined, { quantity: 1 } as OrderLine, 1)).toBe(
            'unknown-order-unknown-product-1-1'
        );
    });
});
