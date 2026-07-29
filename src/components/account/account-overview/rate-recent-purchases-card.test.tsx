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
import { RateRecentPurchasesCard } from './rate-recent-purchases-card';
import type { Order } from '@/components/account/order-list';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, getSitePrefix, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const mockSite = mockSiteObject;
const { t } = getTranslation();

function renderRateCard(order: Order) {
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
                            <RateRecentPurchasesCard order={order} />
                        </SiteProvider>
                    </ConfigWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
}

describe('RateRecentPurchasesCard', () => {
    const baseOrder: Order = {
        orderNo: 'INV005',
        orderDate: '2024-09-14T10:30:00Z',
        status: 'completed',
        total: 100,
        currency: mockSiteObject.defaultCurrency,
        itemCount: 2,
        productItems: [
            {
                productId: 'prod-a',
                quantity: 1,
                imageUrl: 'https://example.com/a.jpg',
                imageAlt: 'Coat',
                productName: 'Wool Blend Coat',
            },
            {
                productId: 'prod-b',
                quantity: 1,
                imageUrl: 'https://example.com/b.jpg',
                imageAlt: 'Blazer',
                productName: 'Oversized Blazer',
            },
        ],
    };

    test('renders title, subtitle, joined product names, and order caption', () => {
        renderRateCard(baseOrder);

        expect(
            screen.getByRole('heading', { level: 2, name: t('account:overview.rateRecentPurchases.title') })
        ).toBeInTheDocument();
        expect(screen.getByText(t('account:overview.rateRecentPurchases.subtitle'))).toBeInTheDocument();
        expect(screen.getByText('Wool Blend Coat, Oversized Blazer')).toBeInTheDocument();
        expect(
            screen.getByText(
                t('account:overview.rateRecentPurchases.orderCaption', {
                    orderNo: '#INV005',
                    status: t('account:orders.status.completed'),
                })
            )
        ).toBeInTheDocument();
    });

    test('CTA links to order details for this order', () => {
        renderRateCard(baseOrder);
        const cta = screen.getByRole('link', { name: t('account:overview.rateRecentPurchases.cta') });
        expect(cta).toHaveAttribute('href', `${getSitePrefix()}/account/orders/INV005`);
    });

    test('renders product thumbnails with expected image sources', () => {
        renderRateCard(baseOrder);
        expect(screen.getByRole('img', { name: 'Coat' })).toHaveAttribute('src', 'https://example.com/a.jpg');
        expect(screen.getByRole('img', { name: 'Blazer' })).toHaveAttribute('src', 'https://example.com/b.jpg');
    });

    test('caption shows the return label (over raw status) when returnStatus is set', () => {
        renderRateCard({ ...baseOrder, returnStatus: 'RETURN_COMPLETE' });

        expect(
            screen.getByText(
                t('account:overview.rateRecentPurchases.orderCaption', {
                    orderNo: '#INV005',
                    status: t('account:orders.returnStatus.complete'),
                })
            )
        ).toBeInTheDocument();
        // Raw "Completed" status is not shown once a return status wins.
        expect(
            screen.queryByText(
                t('account:overview.rateRecentPurchases.orderCaption', {
                    orderNo: '#INV005',
                    status: t('account:orders.status.completed'),
                })
            )
        ).not.toBeInTheDocument();
    });

    test('omits product title line when no product names are available', () => {
        const order: Order = {
            ...baseOrder,
            productItems: [{ productId: 'x', quantity: 1, imageUrl: 'https://example.com/x.jpg', imageAlt: 'X' }],
        };
        renderRateCard(order);
        expect(screen.queryByText('Wool Blend Coat')).not.toBeInTheDocument();
    });
});
