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
import { CartItemAddToWishlistButton } from '../cart-item-add-to-wishlist-button';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import type { EnrichedProductItem } from '@/lib/product/product-utils';

const sampleLine: EnrichedProductItem = {
    itemId: 'cart-wl-story-line',
    productId: '25505481M',
    productName: 'Sample product',
    quantity: 1,
} as EnrichedProductItem;

const meta: Meta<typeof CartItemAddToWishlistButton> = {
    title: 'Cart/Items/Cart Item Add to Wishlist Button',
    component: CartItemAddToWishlistButton,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    "Link-style control on cart lines to add or remove the product from the shopper wishlist. Requires React Router (fetchers) and app providers. The mode (Add vs Remove) is driven entirely by `wishlistProductIds` — pass an empty array to render the **Add to Wishlist** label, or include the product's ID to render **Remove from Wishlist**. Flip it via the controls panel to see both states.",
            },
        },
    },
    args: {
        product: sampleLine,
        wishlistProductIds: [],
        className: '',
    },
    argTypes: {
        wishlistProductIds: {
            control: 'object',
            description:
                'Hydrated wishlist product IDs from the cart loader. When the array contains `product.productId`, the button switches to Remove mode.',
        },
        product: { table: { disable: true } },
        className: { table: { disable: true } },
    },
    decorators: [
        (Story) => (
            <AllProvidersWrapper>
                <Story />
            </AllProvidersWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state — product not in wishlist (Add mode). Use the controls panel
 * to flip `wishlistProductIds` to `[product.productId]` to see Remove mode.
 */
export const Default: Story = {};
