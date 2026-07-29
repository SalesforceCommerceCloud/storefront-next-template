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
import SelectBonusProductsCard from '../select-bonus-products-card';
import type { BonusPromotionInfo } from '@/lib/cart/bonus-product-utils';
import { action } from 'storybook/actions';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const createMockPromotion = (overrides?: Partial<BonusPromotionInfo>): BonusPromotionInfo => ({
    promotionId: 'promo-buy-one-get-tie',
    bonusDiscountLineItemIds: ['bonus-1'],
    maxBonusItems: 2,
    selectedItems: 0,
    remainingCapacity: 2,
    calloutText: 'Buy one Classic Fit Shirt, get 2 free ties!',
    ...overrides,
});

const meta: Meta<typeof SelectBonusProductsCard> = {
    title: 'Cart/Bonus Products/Select Bonus Products Card',
    component: SelectBonusProductsCard,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Card component that displays a button for selecting bonus products.

### Note:
Component currently only renders a button - promotion data (calloutText, selection counter) is not displayed.

### Usage in Mini Cart:
This card appears below qualifying products in the mini cart to prompt users to select their bonus products.
Clicking the button closes the mini cart and navigates to the full cart page where bonus selection happens.
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof SelectBonusProductsCard>;

/**
 * Default - Simple button to select bonus products
 */
export const Default: Story = {
    args: {
        promotion: createMockPromotion(),
        onSelectClick: action('select-bonus-products-clicked'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const button = canvas.getByRole('button', { name: /Select bonus products/i });
        await expect(button).toBeInTheDocument();
        await expect(button).toBeVisible();
        await userEvent.click(button);
    },
};
