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
import type { ShopperProducts } from '@/scapi';
import ProductPrice from '../index';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import { mockMasterProductHitWithOneVariant } from '../../__mocks__/product-search-hit-data';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof ProductPrice> = {
    title: 'Products/Product Price',
    component: ProductPrice,
    tags: ['autodocs', 'interaction', 'qualified-prices'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        currency: {
            description: 'Currency code (USD, EUR, GBP, etc.)',
            control: 'select',
            options: ['USD', 'EUR', 'GBP'],
        },
        quantity: { description: 'Quantity multiplier (used with type="total")', control: 'number' },
        type: {
            description: 'Display unit price or quantity-multiplied total',
            control: 'select',
            options: ['unit', 'total'],
        },
        labelForA11y: { description: 'sr-only label prefix (e.g. product name) for screen readers', control: 'text' },
        hidePromo: { description: 'Hide promotional callout text (e.g. in modal/edit mode)', control: 'boolean' },
        currentPriceOnly: {
            description: 'Show only current price (no list price, no promo, no "From" prefix)',
            control: 'boolean',
        },
        className: { description: 'Wrapper CSS class', control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof ProductPrice>;

/**
 * Default — single in-stock product, no promotion, no quantity multiplier.
 * Renders just the current price with the matching sr-only aria-label.
 *
 * Drive most variants from the Controls panel:
 *   - `quantity` + `type: 'total'` — multiplies displayed price (see WithQuantity)
 *   - `currency` — switches symbol (USD/EUR/GBP)
 *   - `hidePromo: true` — suppresses promo callout in any sale/promo story
 *   - `currentPriceOnly: true` — strips list price, promo, and "From" prefix
 *   - `labelForA11y` — appears in sr-only span only
 *
 * Distinct visual states use dedicated stories below:
 *   - WithQuantity — total = unit * quantity
 *   - PriceRange — master product (different fixture shape)
 *   - OnSale — adds struck-through list price
 *   - WithPromoCallout — adds promo callout below price
 */
export const Default: Story = {
    args: {
        product: mockStandardProductOrderable.product,
        currency: 'USD',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const prices = canvas.getAllByText(/\$99.99/);
        await expect(prices.length).toBeGreaterThan(0);
        await expect(prices[0]).toBeVisible();
    },
};

/**
 * Quantity-multiplied total — `quantity: 3, type: 'total'` shows
 * `$299.97` (99.99 * 3). Distinct visible price; kept dedicated.
 */
export const WithQuantity: Story = {
    args: {
        product: mockStandardProductOrderable.product,
        currency: 'USD',
        quantity: 3,
        type: 'total',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const prices = canvas.getAllByText(/\$299.97/);
        await expect(prices.length).toBeGreaterThan(0);
    },
};

/**
 * Master product price range — `mockMasterProductHitWithOneVariant`
 * triggers the master+priceMax branch in `getPriceData`, displaying
 * a qualified single price (£191.99), without treating a book maximum as a list price. Different
 * fixture shape from Default, kept dedicated.
 */
export const PriceRange: Story = {
    args: {
        product: mockMasterProductHitWithOneVariant as any,
        currency: 'GBP',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const prices = canvas.getAllByText(/£191.99/);
        await expect(prices.length).toBeGreaterThan(0);
    },
};

/**
 * On-sale product — sale price displayed alongside struck-through list
 * price. Distinct from Default (adds line-through ListPrice element).
 */
export const OnSale: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            price: 99.99,
            productPromotions: [{ promotionId: 'native-sale', promotionalPrice: 79.99, calloutMsg: '' }],
        },
        currency: 'USD',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const salePrices = canvas.getAllByText(/\$79.99/);
        await expect(salePrices.length).toBeGreaterThan(0);
        const listPrices = canvas.getAllByText(/\$99.99/);
        await expect(listPrices.length).toBeGreaterThan(0);
    },
};

/** Calculated line amounts remain authoritative when catalog consultation policy changes. */
export const CalculatedLineWithCatalogPriceOnRequest: Story = {
    args: {
        product: {
            id: 'calculated-sku',
            itemId: 'calculated-line',
            quantity: 2,
            basePrice: 10,
            price: 20,
            priceAfterItemDiscount: 18,
            c_priceOnRequest: true,
        },
        currency: 'USD',
        type: 'unit',
        currentPriceOnly: true,
        hidePromo: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await expect(within(canvasElement).getByText('$9.00')).toBeVisible();
    },
};

/**
 * Price unavailable — the product has no price for the active currency (e.g. a currency with no
 * price-book entry, where SCAPI omits `price`). Instead of a misleading "0.00", the component
 * renders a localized "Price unavailable" message. An explicit price of `0` is NOT treated this
 * way — it renders as a real "0.00".
 */
export const PriceUnavailable: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            price: undefined,
            pricePerUnit: undefined,
            priceMax: undefined,
            tieredPrices: undefined,
            productPromotions: undefined,
        },
        currency: 'DKK',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
    },
};

/**
 * With promo callout — adds a `productPromotions` entry with `calloutMsg`.
 * Distinct from OnSale because it renders an extra `<PromoCallout>` block
 * below the price.
 *
 * Use the `promoCalloutClassName` arg to inject custom styling on the
 * callout container — replaces the prior `WithCustomPromoCalloutStyling`
 * dedicated story (which only differed by passing `promoCalloutProps.className`).
 */
export const WithPromoCallout: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            price: 99.99,
            productPromotions: [
                {
                    promotionId: 'storybook-20-off',
                    promotionalPrice: 79.99,
                    calloutMsg: 'Get 20% off of this item.',
                },
            ],
        },
        currency: 'USD',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const salePrices = canvas.getAllByText(/\$79.99/);
        await expect(salePrices.length).toBeGreaterThan(0);
        const promoCallout = canvas.getByText(/Get 20% off/);
        await expect(promoCallout).toBeVisible();
    },
};

/** Ecom-qualified callouts are returned independently of whether an offer supplies a product price. */
export const QualifiedStoreOffers: Story = {
    args: {
        currency: 'GBP',
        product: {
            id: 'qualified-store-product',
            price: 16,
            productPromotions: [
                { promotionId: 'individual-store', calloutMsg: 'Store offer' },
                { promotionId: 'store-group', calloutMsg: 'Member stores: spend £25 for a gift' },
                { promotionId: 'all-store', calloutMsg: 'All stores: use your coupon at checkout' },
            ],
        } as ShopperProducts.schemas['Product'],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Store offer')).toBeVisible();
        await expect(canvas.getByText('Member stores: spend £25 for a gift')).toBeVisible();
        await expect(canvas.getByText('All stores: use your coupon at checkout')).toBeVisible();
    },
};
