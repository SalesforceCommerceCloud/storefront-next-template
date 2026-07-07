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
import { allModes } from '../../../../.storybook/modes';
import ProductCartActions from '../index';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import ProductViewProvider from '@/providers/product-view';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';

const meta: Meta<typeof ProductCartActions> = {
    title: 'Components/ProductCartActions',
    component: ProductCartActions,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
    },
    decorators: [
        (Story: React.ComponentType, context) => {
            return (
                <ConfigProvider config={mockConfig}>
                    <SiteProvider
                        site={mockSiteObject}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <ProductViewProvider product={context.args.product as any} initialQuantity={1} mode="add">
                            <Story />
                        </ProductViewProvider>
                    </SiteProvider>
                </ConfigProvider>
            );
        },
    ],
};

export default meta;
type Story = StoryObj<typeof ProductCartActions>;

export const Default: Story = {
    args: {
        product: mockStandardProductOrderable.product,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify Add to Cart button exists and is enabled
        const addToCartButton = canvas.getByRole('button', { name: /add to cart/i });
        await expect(addToCartButton).toBeInTheDocument();
        await expect(addToCartButton).toBeEnabled();

        // Note: Wishlist button is rendered in ProductInfo component, not ProductCartActions
    },
};

export const EditMode: Story = {
    args: {
        product: mockStandardProductOrderable.product,
    },
    decorators: [
        (Story: React.ComponentType, context) => (
            <ConfigProvider config={mockConfig}>
                <ProductViewProvider product={context.args.product as any} initialQuantity={1} mode="edit">
                    <Story />
                </ProductViewProvider>
            </ConfigProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Updated matcher to find "Update" or "Update Cart"
        const updateCartButton = canvas.getByRole('button', { name: /update/i });
        await expect(updateCartButton).toBeInTheDocument();

        // Wishlist button should not be present in edit mode
        const wishlistButton = canvas.queryByRole('button', { name: /add to wishlist/i });
        await expect(wishlistButton).not.toBeInTheDocument();
    },
};

export const CompactWithBuyNow: Story = {
    args: {
        product: mockStandardProductOrderable.product,
        onBuyNow: action('buy-now'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const addToCartButton = canvas.getByRole('button', { name: /add to cart/i });
        await expect(addToCartButton).toBeInTheDocument();
        const buyNowButton = canvas.getByRole('button', { name: /Buy It Now/i });
        await expect(buyNowButton).toBeInTheDocument();
    },
};

export const NoVariantSelected: Story = {
    args: {
        product: {
            ...mockStandardProductOrderable.product,
            variationValues: {},
        },
    },
    decorators: [
        (Story: React.ComponentType, context) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <ProductViewProvider product={context.args.product as any} initialQuantity={1} mode="add">
                        <Story />
                    </ProductViewProvider>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const addToCartButton = canvas.getByRole('button', { name: /add to cart/i });
        await expect(addToCartButton).toBeInTheDocument();
        await expect(addToCartButton).toBeDisabled();
    },
};
