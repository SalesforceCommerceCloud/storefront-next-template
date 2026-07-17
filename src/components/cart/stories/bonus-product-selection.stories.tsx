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
import BonusProductSelection from '../bonus-product-selection';
import { action } from 'storybook/actions';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

// `imageGroups: []` so the component's "No image" placeholder renders rather
// than a broken thumbnail (the SCAPI demo CDN URLs frequently 404 in headless
// Storybook).
const TIE_COLOURS = ['Navy', 'Red', 'Black', 'Forest', 'Burgundy', 'Cream', 'Slate', 'Mustard'];
const TIE_PRICES = [29.0, 35.0, 42.0, 25.0, 39.0, 31.0, 45.0, 28.0];

function buildBonusFixture(count: number) {
    const safe = Math.max(1, Math.min(count, TIE_COLOURS.length));
    const productLinks = Array.from({ length: safe }, (_, i) => ({
        productId: `product-${i + 1}`,
        productName: `Classic Silk Tie - ${TIE_COLOURS[i]}`,
    }));
    const bonusDiscountLineItem: ShopperBasketsV2.schemas['BonusDiscountLineItem'] = {
        id: 'bdli-1',
        promotionId: 'promo-1',
        maxBonusItems: safe,
        bonusProducts: productLinks,
    };
    const bonusProductsById: Record<string, ShopperProducts.schemas['Product']> = Object.fromEntries(
        productLinks.map((link, i) => [
            link.productId,
            {
                id: link.productId,
                name: link.productName,
                price: TIE_PRICES[i % TIE_PRICES.length],
                imageGroups: [],
            } satisfies ShopperProducts.schemas['Product'],
        ])
    );
    const basket: ShopperBasketsV2.schemas['Basket'] = {
        basketId: 'basket-1',
        productItems: [],
        bonusDiscountLineItems: [bonusDiscountLineItem],
    };
    return { bonusDiscountLineItem, bonusProductsById, basket };
}

interface StoryArgs {
    bonusProductCount: number;
    promotionName: string;
}

const meta: Meta<StoryArgs> = {
    title: 'Cart/Bonus Products/Bonus Product Selection',
    // No `component` field — the render function builds the real component
    // from the synthetic `bonusProductCount` arg, so the args type can't match
    // `<BonusProductSelection>`'s prop shape.
    tags: ['autodocs', 'interaction'],
    args: {
        bonusProductCount: 3,
        promotionName: 'Buy one Classic Fit Shirt and get free ties',
    },
    argTypes: {
        bonusProductCount: {
            control: { type: 'range', min: 1, max: TIE_COLOURS.length },
            description:
                'Number of bonus products synthesised into the carousel. Drag past 4 to expose the carousel prev/next navigation buttons (Pattern 20 — synthesise array fixtures from a numeric control).',
        },
        promotionName: {
            control: 'text',
            description: 'Promotion name rendered in the carousel title.',
        },
    },
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
A bonus product selection component that displays eligible bonus products in a carousel. Users can select bonus products to add to their cart.

## Features

- **Product Carousel**: Horizontal scrolling carousel of bonus products
- **Product Cards**: Individual cards showing product image, title, and "Free" badge
- **Select Button**: Action button to select a bonus product
- **Visual Feedback**: Clear indication of selected products

## Usage

\`\`\`tsx
import BonusProductSelection from '../bonus-product-selection';

function CartPage() {
  return (
    <div>
      <CartContent />
      <BonusProductSelection />
    </div>
  );
}
\`\`\`

## Stories

The single \`Default\` story is driven by a \`bonusProductCount\` numeric control (Pattern 20). Drag the control above 4 to verify the carousel prev/next buttons enable.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <div className="max-w-[465px]">
                <Story />
            </div>
        ),
    ],
    render: ({ bonusProductCount, promotionName }) => {
        const { bonusDiscountLineItem, bonusProductsById, basket } = buildBonusFixture(bonusProductCount);
        return (
            <BonusProductSelection
                bonusDiscountLineItem={bonusDiscountLineItem}
                bonusProductsById={bonusProductsById}
                basket={basket}
                promotionName={promotionName}
                onProductSelect={action('product-selected')}
            />
        );
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);

        const selectButtons = await canvas.findAllByRole('button', { name: /select/i });
        await expect(selectButtons.length).toBeGreaterThan(0);

        // Above ~4 products the carousel exposes prev/next navigation. Use it
        // to exercise that branch without spawning a separate story (Pattern 20).
        if (args.bonusProductCount > 4) {
            const nextButton = await canvas.findByRole('button', { name: /next slide/i });
            const prevButton = await canvas.findByRole('button', { name: /previous slide/i });
            await waitFor(() => {
                expect(nextButton).toBeEnabled();
            });
            await userEvent.click(nextButton);
            await userEvent.click(prevButton);
        }

        await userEvent.click(selectButtons[0]);
    },
};
