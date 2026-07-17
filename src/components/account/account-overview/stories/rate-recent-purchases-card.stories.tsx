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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RateRecentPurchasesCard } from '../rate-recent-purchases-card';
import type { Order } from '@/components/account/order-list';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

// Story fixtures omit `imageUrl` so thumbnails fall through to the "No Image" placeholder.
const sampleOrder: Order = {
    orderNo: 'INV001',
    orderDate: '2024-09-14T10:30:00Z',
    status: 'shipped',
    total: 129.99,
    currency: mockSiteObject.defaultCurrency,
    itemCount: 2,
    productItems: [
        {
            productId: '701643108633M',
            quantity: 1,
            productName: 'Charcoal Crewneck',
        },
        {
            productId: '701643108634M',
            quantity: 1,
            productName: 'Navy Tee',
        },
    ],
};

const meta: Meta<typeof RateRecentPurchasesCard> = {
    title: 'Account/Overview/Rate Recent Purchases Card',
    component: RateRecentPurchasesCard,
    tags: ['autodocs', 'skip-a11y'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Engagement card for the most recent order: thumbnails, product names, order status, and CTA to order details to rate purchases.',
            },
        },
    },
    decorators: [
        // Pattern 4: the global withRouter decorator already provides router
        // context. Wrapping in <MemoryRouter> here triggers React Router's
        // "You cannot render a <Router> inside another <Router>" invariant.
        (Story) => (
            <ConfigWrapper>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <div className="max-w-3xl">
                        <Story />
                    </div>
                </SiteProvider>
            </ConfigWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof RateRecentPurchasesCard>;

export const Default: Story = {
    args: {
        order: sampleOrder,
    },
};

export const SingleLineNoImage: Story = {
    args: {
        order: {
            ...sampleOrder,
            productItems: [
                {
                    productId: 'SKU-1',
                    quantity: 1,
                    productName: 'Unnamed catalog item',
                },
            ],
        },
    },
};
