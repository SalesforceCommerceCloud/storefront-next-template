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
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import { WishlistPageContent, WishlistSkeleton } from '../wishlist-page';
import { masterProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import AuthProvider from '@/providers/auth';
import type { PublicSessionData } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// WishlistPageContent — full client-side content for the My Wishlist page.
// Visible variations come from:
//   - items[] length (0 = empty state, ≥1 = list)
//   - productsByProductId mappings (drives item rendering + inventory branches
//     via downstream <WishlistListItem>)
// Filter and sort UI is driven via runtime interaction (in-story comboboxes),
// so those branches aren't surfaced as separate snapshot stories.
// Wishlist requires a registered customer, so the only override the global
// StoryShell decorator needs is AuthProvider with a registered session.
// ---------------------------------------------------------------------------

const registeredSession: PublicSessionData = { userType: 'registered', customerId: 'storybook-1' };

const outOfStockProduct: ShopperProducts.schemas['Product'] = {
    ...standardProd,
    id: 'out-of-stock-prod',
    name: 'Vintage Leather Bag',
    inventory: {
        ats: 0,
        backorderable: false,
        id: 'inventory_m',
        orderable: false,
        preorderable: false,
        stockLevel: 0,
    },
};

const onSaleProduct: ShopperProducts.schemas['Product'] = {
    ...standardProd,
    id: 'on-sale-prod',
    name: 'Weekend Travel Duffel',
    price: 49.99,
    pricePerUnit: 49.99,
    tieredPrices: [
        { price: 49.99, pricebook: 'usd-m-sale-prices', quantity: 1 },
        { price: 99.99, pricebook: 'usd-m-list-prices', quantity: 1 },
    ],
};

const variantWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-variant',
    productId: '640188017041M',
    priority: 0,
    public: false,
    quantity: 1,
};

const standardWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-standard',
    productId: standardProd.id,
    priority: 0,
    public: false,
    quantity: 1,
};

const outOfStockWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-out-of-stock',
    productId: 'out-of-stock-prod',
    priority: 0,
    public: false,
    quantity: 1,
};

const onSaleWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-on-sale',
    productId: 'on-sale-prod',
    priority: 0,
    public: false,
    quantity: 1,
};

const productsByProductId: Record<string, ShopperProducts.schemas['Product']> = {
    '640188017041M': masterProduct,
    [standardProd.id]: standardProd,
    'out-of-stock-prod': outOfStockProduct,
    'on-sale-prod': onSaleProduct,
};

const meta: Meta<typeof WishlistPageContent> = {
    title: 'Account/Wishlist/Wishlist Page',
    component: WishlistPageContent,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Full client-side content for the My Wishlist page. Renders saved items with sort and
filter controls (sort: recently added / name / price; filter: all / in stock /
out of stock / on sale), an optimistic remove flow with sessionStorage persistence,
and an empty state when no items remain.

Stories cover the genuinely-distinct visible states: a mixed list of items,
the empty state, a single-item list, and the loading skeleton. Sort and filter
behavior is driven via runtime interaction inside the story.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <AuthProvider value={registeredSession}>
                <Story />
            </AuthProvider>
        ),
    ],
    argTypes: {
        items: { table: { disable: true } },
        productsByProductId: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof WishlistPageContent>;

export const Default: Story = {
    name: 'Default (mixed items)',
    args: {
        items: [variantWishlistItem, standardWishlistItem, outOfStockWishlistItem, onSaleWishlistItem],
        productsByProductId,
    },
};

export const Empty: Story = {
    name: 'Empty wishlist',
    args: {
        items: [],
        productsByProductId: {},
    },
};

export const SingleItem: Story = {
    name: 'Single item',
    args: {
        items: [standardWishlistItem],
        productsByProductId: { [standardProd.id]: standardProd },
    },
};

export const Skeleton: StoryObj<typeof WishlistSkeleton> = {
    name: 'Skeleton',
    render: () => <WishlistSkeleton />,
};
