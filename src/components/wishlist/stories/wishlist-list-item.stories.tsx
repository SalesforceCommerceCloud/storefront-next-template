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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import WishlistListItem from '../wishlist-list-item';
import { masterProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import BasketProvider from '@/providers/basket';

// -- Shared mock data --

// In-stock variant wishlist item (specific variant of masterProduct)
const variantWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-variant-1',
    productId: '640188017041M', // variant with { color: 'CHARCWL', size: '040', width: 'S' }
    priority: 0,
    public: false,
    quantity: 1,
};

// Master-level wishlist item (no specific variant selected)
const masterWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-master-1',
    productId: masterProduct.id, // '25686395M'
    priority: 0,
    public: false,
    quantity: 1,
};

// Standard product wishlist item
const standardWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-standard-1',
    productId: standardProd.id,
    priority: 0,
    public: false,
    quantity: 1,
};

// Out-of-stock standard product (item-level)
const outOfStockProduct: ShopperProducts.schemas['Product'] = {
    ...standardProd,
    inventory: {
        ats: 0,
        backorderable: false,
        id: 'inventory_m',
        orderable: false,
        preorderable: false,
        stockLevel: 0,
    },
};

// Master product whose specific saved variant is not orderable — exercises the disabled
// "Out of stock" button. We mark every variant as non-orderable so the resolved variant
// pulled via masterWishlistItem/variantWishlistItem is flagged as OOS by the hook.
const outOfStockVariantMasterProduct: ShopperProducts.schemas['Product'] = {
    ...masterProduct,
    variants: masterProduct.variants?.map((variant) => ({
        ...variant,
        orderable: false,
    })),
    inventory: {
        ats: 0,
        backorderable: false,
        id: 'inventory_m',
        orderable: false,
        preorderable: false,
        stockLevel: 0,
    },
};

// On-sale product (with list price higher than sale price)
const onSaleProduct: ShopperProducts.schemas['Product'] = {
    ...standardProd,
    price: 49.99,
    pricePerUnit: 49.99,
    tieredPrices: [
        { price: 49.99, pricebook: 'usd-m-sale-prices', quantity: 1 },
        { price: 99.99, pricebook: 'usd-m-list-prices', quantity: 1 },
    ],
};

// Minimal product (no image, no variants)
const minimalProduct: ShopperProducts.schemas['Product'] = {
    id: 'minimal-product-1',
    name: 'Simple Product',
    price: 19.99,
    currency: mockSiteObject.defaultCurrency,
    inventory: { ats: 5, orderable: true, id: 'inv' },
};

const minimalWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-minimal-1',
    productId: 'minimal-product-1',
    priority: 0,
    public: false,
    quantity: 1,
};

// -- Meta --

const meta: Meta<typeof WishlistListItem> = {
    title: 'Account/Wishlist/Wishlist List Item',
    component: WishlistListItem,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Horizontal card row for a single wishlist product.

**Layout:** \`[Image | Name + Variant Attrs + Stock Status + Remove | Price]\`

**Features:**
- Links image and product name to the PDP (master product)
- Shows resolved variant attribute values (e.g., "Color: Charcoal") for specific variants
- Shows "Select" placeholders for master-level saves requiring variant selection
- Reuses the \`InventoryMessage\` component for consistent stock status display
- Remove button submits to \`/action/wishlist-remove\` and shows a success toast
                `,
            },
        },
    },
    argTypes: {
        product: { table: { disable: true } },
        wishlistItem: { table: { disable: true } },
        onRemove: { table: { disable: true } },
    },
    // Stories render outside the global StoryShell when consumed via
    // composeStories from the snapshot harness, so the Config / Site / Basket
    // providers have to be declared on the meta decorator to keep that path
    // working. Interactive Storybook is fine either way.
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <BasketProvider>
                        <Story />
                    </BasketProvider>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof WishlistListItem>;

// -- Stories --

export const Default: Story = {
    name: 'Default (in-stock variant)',
    args: {
        product: masterProduct,
        wishlistItem: variantWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(masterProduct.name as string)).toBeInTheDocument();
        await expect(canvas.getByRole('img')).toBeInTheDocument();
        // Resolved variant attributes: Color: Charcoal, Size: 40, Width: Short
        await expect(canvas.getByText(/Color: Charcoal/)).toBeInTheDocument();
        await expect(canvas.getByText(/Size: 40/)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /remove from wishlist/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /remove from wishlist/i })).toBeEnabled();
    },
};

export const OutOfStock: Story = {
    name: 'Out of stock (standard product)',
    args: {
        product: outOfStockProduct,
        wishlistItem: standardWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(outOfStockProduct.name as string)).toBeInTheDocument();
        await expect(canvas.getByText('Out of stock')).toBeInTheDocument();
    },
};

export const OutOfStockVariant: Story = {
    name: 'Out of stock (specific variant — disabled button)',
    args: {
        product: outOfStockVariantMasterProduct,
        wishlistItem: variantWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Disabled "Out of stock" button takes the place of "Add to cart"
        const oosButton = canvas.getByRole('button', { name: /out of stock/i });
        await expect(oosButton).toBeInTheDocument();
        await expect(oosButton).toBeDisabled();
        // Add to cart should not render when variant is OOS
        await expect(canvas.queryByRole('button', { name: /add to cart/i })).toBeNull();
    },
};

export const MasterProduct: Story = {
    name: 'Master product (needs variant selection)',
    args: {
        product: masterProduct,
        wishlistItem: masterWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(masterProduct.name as string)).toBeInTheDocument();
        // "Select" placeholder should appear for each attribute
        await expect(canvas.getByText(/Color: Select/)).toBeInTheDocument();
        await expect(canvas.getByText(/Size: Select/)).toBeInTheDocument();
        await expect(canvas.getByText(/Width: Select/)).toBeInTheDocument();
    },
};

export const OnSale: Story = {
    name: 'On sale',
    args: {
        product: onSaleProduct,
        wishlistItem: standardWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(onSaleProduct.name as string)).toBeInTheDocument();
        // Sale price rendered by ProductPrice — use getAllByText to handle visible + sr-only duplicates
        const priceElements = canvas.getAllByText(/£49\.99/);
        await expect(priceElements.length).toBeGreaterThan(0);
    },
};

export const MinimalData: Story = {
    name: 'Minimal data (no image, no variants)',
    args: {
        product: minimalProduct,
        wishlistItem: minimalWishlistItem,
        onRemove: action('onRemove'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Simple Product')).toBeInTheDocument();
        await expect(canvas.queryByRole('img')).toBeNull();
        await expect(canvas.queryByText(/Select/)).toBeNull();
        await expect(canvas.getByRole('button', { name: /remove from wishlist/i })).toBeInTheDocument();
    },
};
