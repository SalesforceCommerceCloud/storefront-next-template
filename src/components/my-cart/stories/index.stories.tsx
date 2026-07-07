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
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import MyCart from '../index';
import { checkoutWithMultipleItems } from '@/components/__mocks__/checkout-data';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const mockProductMap: Record<string, Record<string, unknown>> = {
    '1ed3ed7fb732d0333d076ecf3e': {
        id: '701642868279M',
        name: 'Button Front Jacket',
        master: { masterId: '25502228M' },
        variationAttributes: [
            { id: 'color', name: 'Color', values: [{ name: 'Grey Heather', value: 'JJ5FUXX' }] },
            { id: 'size', name: 'Size', values: [{ name: '6', value: '006' }] },
        ],
        variationValues: { color: 'JJ5FUXX', size: '006' },
        // No imageGroups so the "No image" placeholder renders rather than a
        // broken thumbnail (the SCAPI demo CDN URLs frequently 404 in headless
        // Storybook).
        imageGroups: [],
        price: 39.67,
        tieredPrices: [{ price: 39.67, pricebook: 'gbp-m-list-prices', quantity: 1 }],
    },
    d0a0c366980053e7f2645d9706: {
        id: '883360520599M',
        name: 'Casual To Dressy Trousers',
        master: { masterId: '25592770M' },
        variationAttributes: [
            { id: 'color', name: 'Color', values: [{ name: 'Black', value: 'BLACKFB' }] },
            { id: 'size', name: 'Size', values: [{ name: '8', value: '008' }] },
        ],
        variationValues: { color: 'BLACKFB', size: '008' },
        imageGroups: [],
        price: 124.8,
        tieredPrices: [{ price: 124.8, pricebook: 'gbp-m-list-prices', quantity: 1 }],
    },
};

const discountedBasket = {
    ...checkoutWithMultipleItems.cart,
    productItems: [
        {
            ...(checkoutWithMultipleItems.cart.productItems?.[0] ?? {}),
            basePrice: 49.99,
            price: 34.99,
            priceAfterItemDiscount: 34.99,
            tieredPrices: [{ price: 49.99, pricebook: 'gbp-m-list-prices', quantity: 1 }],
        },
    ],
};

const discountedProductMap: Record<string, Record<string, unknown>> = {
    '1ed3ed7fb732d0333d076ecf3e': {
        ...mockProductMap['1ed3ed7fb732d0333d076ecf3e'],
        price: 49.99,
        tieredPrices: [{ price: 49.99, pricebook: 'gbp-m-list-prices', quantity: 1 }],
    },
};

const meta: Meta<typeof MyCart> = {
    title: 'CART/My Cart',
    component: MyCart,
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        docs: {
            description: {
                component: `
### MyCart Component

Displays cart items on the checkout page, separate from the order summary. Each item shows its product image, name, variation attributes (color, size), price, quantity, and a delivery badge.

**Key Features:**

- **Product image** — Resolved from \`productMap\` via \`item.itemId\`. Falls back to a grey placeholder when no image is available.
- **Variation attributes** — Displays color, size, etc. from the product API data (basket items don't carry variation metadata).
- **Price with savings** — Uses \`ProductPrice\` with \`type="total"\`. When the item is on sale (\`priceAfterItemDiscount < basePrice\`), shows a strikethrough list price and a "Saved £X.XX" badge.
- **Per-unit price** — Shown when \`quantity > 1\` (e.g., "£124.80 each").
- **Delivery badge** — Every item shows a truck icon with "Delivery" text.

**Known gap:** The delivery badge is hardcoded — there is no pickup variant. Items fulfilled via store pickup should show a different badge, but the component does not yet branch on shipment type.

**Dependencies:**

- \`@/components/product-price\`: price display with sale/strikethrough logic
- \`@/components/link\`: site-context-aware product link
- \`@/lib/product/product-utils\`: URL generation, variation display values
- \`@/lib/product/image-groups-utils\`: image group selection
- \`@/lib/images/dynamic-image\`: image URL resolution
- \`@/lib/currency\`: currency formatting
`,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    decorators: [
        (Story) => (
            <CheckoutActionLogger name="my-cart">
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <Story />
                </SiteProvider>
            </CheckoutActionLogger>
        ),
    ],
    argTypes: {
        basket: {
            description:
                'Basket object containing `productItems` array. Each item needs `itemId`, `productName`, `quantity`, and price fields.',
            table: { type: { summary: "ShopperBasketsV2.schemas['Basket']" } },
        },
        productMap: {
            description:
                'Map of `itemId` → product data. Supplies images, variation attributes, and master product ID for URL generation. Falls back gracefully when missing.',
            table: { type: { summary: "Record<string, ShopperProducts.schemas['Product']>" } },
        },
        promotions: {
            description: 'Promotions map. Currently unused by the component — reserved for future use.',
            table: { type: { summary: "Record<string, ShopperPromotions.schemas['Promotion']>" } },
        },
    },
};

export default meta;
type Story = StoryObj<typeof MyCart>;

/**
 * Default: two items (one at qty 1, one at qty 3). Shows delivery badges,
 * variation attributes (color, size), and per-unit "each" pricing on the
 * higher-quantity line.
 */
export const Default: Story = {
    render: () => (
        <MyCart basket={checkoutWithMultipleItems.cart} productMap={mockProductMap as Record<string, never>} />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('my-cart-item-701642868279M')).toBeInTheDocument();
        await expect(canvas.getByTestId('my-cart-item-883360520599M')).toBeInTheDocument();
        await expect(canvas.getByText('Button Front Jacket')).toBeInTheDocument();
        await expect(canvas.getByText('Casual To Dressy Trousers')).toBeInTheDocument();
        await expect(canvas.getByText('Color: Grey Heather')).toBeInTheDocument();
        await expect(canvas.getByText('Size: 6')).toBeInTheDocument();
    },
};

/**
 * Single line item at quantity 1. The narrowest populated state: one product
 * row, no per-unit "each" line (that only renders when quantity > 1), and a
 * delivery badge. Verifies the component renders a lone item without relying
 * on the two-item default's layout.
 */
export const SingleItem: Story = {
    render: () => (
        <MyCart
            basket={
                {
                    ...checkoutWithMultipleItems.cart,
                    productItems: [checkoutWithMultipleItems.cart.productItems?.[0]],
                } as never
            }
            // Pass the full product map — MyCart only reads the entry matching the
            // single rendered item, so the extra entries are inert.
            productMap={mockProductMap as Record<string, never>}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Exactly one product row renders, and it's the qty-1 Button Front Jacket.
        await expect(canvas.getByTestId('my-cart-item-701642868279M')).toBeInTheDocument();
        await expect(canvas.getByText('Button Front Jacket')).toBeInTheDocument();
        await expect(canvas.queryByTestId('my-cart-item-883360520599M')).not.toBeInTheDocument();
        // The per-unit "each" line only appears for quantity > 1.
        await expect(canvas.queryByText(/each/i)).not.toBeInTheDocument();
    },
};

/**
 * Empty basket. `productItems: []` renders the cart container with no item
 * rows — the checkout page relies on this not throwing when a basket is
 * cleared. There is no empty-state message inside MyCart itself; the container
 * simply renders empty.
 */
export const EmptyBasket: Story = {
    render: () => (
        <MyCart
            basket={{ ...checkoutWithMultipleItems.cart, productItems: [] } as never}
            productMap={{} as Record<string, never>}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The container renders, but holds no item rows.
        await expect(canvas.getByTestId('my-cart-toggle')).toBeInTheDocument();
        await expect(canvas.queryByTestId(/^my-cart-item-/)).not.toBeInTheDocument();
    },
};

/**
 * Item with a promotion discount applied. Shows strikethrough list price
 * and a "Saved" badge.
 */
export const WithPromotion: Story = {
    render: () => (
        <MyCart basket={discountedBasket as never} productMap={discountedProductMap as Record<string, never>} />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('my-cart-item-701642868279M')).toBeInTheDocument();
        await expect(canvas.getByText(/Saved/)).toBeInTheDocument();
    },
};
