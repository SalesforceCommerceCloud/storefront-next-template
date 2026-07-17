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
import ProductItem from '../index';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
// Vertical-aware UI flags — resolves to the active vertical's overlay (fashion = true, cosmetic = false),
// matching what ProductItem renders. The default variant gates the "Bonus Product" title badge behind
// this flag, so the play functions must only assert it when the flag is on.
import { uiConfig } from '@/lib/config.ui';

const { showLineItemBonusBadge } = uiConfig.pages.cart;

const mockSite = mockSiteObject;

const meta: Meta<typeof ProductItem> = {
    title: 'Products/Product Item',
    component: ProductItem,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
A component that displays individual product information in cart or summary views.

### Features:
- Product image display with fallback
- Product name as clickable link
- Variation attributes display
- Price formatting and display (supports strikethrough for discounts)
- Primary and secondary actions
- Responsive layout for mobile/desktop
- Summary and default display variants
- Loading states with skeleton overlay
- Bonus product support with badge and special pricing display

### Display Variants:
- **default**: Full product item with card styling, quantity picker, and all details
- **summary**: Compact display for product summary views

### Bonus Products:
- Auto bonus products: Automatically added bonus items with disabled quantity picker
- Choice-based bonus products: User-selectable bonus items with enabled quantity picker
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <div className="max-w-2xl mx-auto">
                        <Story />
                    </div>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductItem>;

// Create a mock product item from the standard product mock
const mockProductItem = {
    ...mockStandardProductOrderable.product,
    itemId: 'test-item-id',
    quantity: 1,
    price: 99.99,
    priceAfterItemDiscount: 99.99,
    productName: mockStandardProductOrderable.product.name ?? '',
    shortDescription: mockStandardProductOrderable.product.shortDescription,
};

export const Default: Story = {
    args: {
        productItem: mockProductItem,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductItem.productName)).toBeInTheDocument();
        const prices = canvas.getAllByText(/£99\.99/);
        await expect(prices.length).toBeGreaterThan(0);
    },
};

export const SummaryVariant: Story = {
    args: {
        productItem: mockProductItem,
        displayVariant: 'summary',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductItem.productName)).toBeInTheDocument();
        // Summary variant is more compact
    },
};

export const WithActions: Story = {
    args: {
        productItem: mockProductItem,
        primaryAction: () => <button className="text-destructive">Remove</button>,
        secondaryActions: () => <button className="text-primary">Edit</button>,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Remove')).toBeInTheDocument();
        await expect(canvas.getByText('Edit')).toBeInTheDocument();
    },
};
// Create a mock bonus product item
const mockBonusProductItem = {
    ...mockStandardProductOrderable.product,
    itemId: 'bonus-item-id',
    basePrice: 99, // Original price - will show as strikethrough list price
    quantity: 1,
    priceAfterItemDiscount: 0, // Bonus product is free - will show as current price $0
    productName: mockStandardProductOrderable.product.name || 'Free Bonus Gift',
    shortDescription: 'This is a bonus product added to your cart',
    bonusProductLineItem: true,
    bonusDiscountLineItemId: 'bonus-discount-1',
    productPromotions: [],
};

export const AutoBonusProduct: Story = {
    args: {
        productItem: mockBonusProductItem,
        secondaryActions: () => <button className="text-destructive">Remove</button>,
    },
    parameters: {
        docs: {
            description: {
                story: `
An auto bonus product that is automatically added to the cart as part of a promotion.

### Features:
- **Bonus Product Badge**: Displays a "Bonus Product" badge next to the product name
- **Strikethrough Original Price**: Shows the original price ($99) with strikethrough
- **Free Price Display**: Shows the discounted price ($0) as the current price
- **Disabled Quantity Picker**: Quantity cannot be changed for auto bonus products
- **Hidden Actions**: Primary and secondary actions are hidden for auto bonus products

### Use Cases:
- Promotional bonus items automatically added to cart
- "Buy X, Get Y Free" promotions
- Automatic gift items

### Key Props:
- \`bonusProductLineItem: true\` - Marks this as a bonus product
- \`basePrice: 99\` - Original price shown as strikethrough
- \`priceAfterItemDiscount: 0\` - Final price after discount (free)
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify basic rendering
        await expect(canvas.getByText(mockBonusProductItem.productName)).toBeInTheDocument();
        // Verify bonus product badge is displayed (gated in default variant; hidden when the flag is off)
        if (showLineItemBonusBadge) {
            await expect(canvas.getByText('Bonus Product')).toBeInTheDocument();
        } else {
            await expect(canvas.queryByText('Bonus Product')).not.toBeInTheDocument();
        }
        // Verify "Free" text is shown for bonus product with zero price
        await expect(canvas.getByText('Free')).toBeInTheDocument();

        // Interaction tests for auto bonus product
        // Verify quantity picker is disabled and cannot be interacted with
        const quantityInput = canvas.getByRole('spinbutton');
        await expect(quantityInput).toBeDisabled();

        // Verify disabled state - disabled inputs should not be focusable
        const inputElement = quantityInput as HTMLInputElement;
        const initialValue = inputElement.value || '1';
        await expect(quantityInput).toHaveValue(Number(initialValue));

        // Disabled inputs should not respond to clicks or typing
        // Note: userEvent.click on disabled elements may not work as expected
        await expect(quantityInput).toBeDisabled();

        // Verify product name link is clickable
        const productLink = canvas.getByRole('link', { name: mockBonusProductItem.productName });
        await expect(productLink).toBeInTheDocument();
        await userEvent.click(productLink);
        // Link should be interactive (action logger will capture this)

        // Verify actions are not visible for auto bonus products
        const removeButton = canvas.queryByText('Remove');
        await expect(removeButton).not.toBeInTheDocument();
    },
};

// Create mock bonus discount line items for choice-based bonus products
const mockChoiceBonusDiscountLineItems = [
    {
        id: 'bonus-discount-choice-1',
        promotionId: 'promo-choice-1',
        maxBonusItems: 3,
        bonusProducts: [
            {
                productId: 'choice-bonus-product-1',
                productName: 'Choice Bonus Product 1',
            },
            {
                productId: 'choice-bonus-product-2',
                productName: 'Choice Bonus Product 2',
            },
        ],
    },
];

// Create a mock choice-based bonus product item
const mockChoiceBonusProductItem = {
    ...mockStandardProductOrderable.product,
    itemId: 'choice-bonus-item-id',
    basePrice: 49.99, // Original price - will show as strikethrough list price
    quantity: 1,
    priceAfterItemDiscount: 0, // Bonus product is free - will show as current price $0
    productId: 'choice-bonus-product-1',
    productName: 'Choice Bonus Gift',
    shortDescription: 'This is a choice-based bonus product that you can select and adjust quantity',
    bonusProductLineItem: true,
    bonusDiscountLineItemId: 'bonus-discount-choice-1',
    productPromotions: [],
};

export const ChoiceBasedBonusProduct: Story = {
    args: {
        productItem: mockChoiceBonusProductItem,
        bonusDiscountLineItems: mockChoiceBonusDiscountLineItems,
        maxBonusQuantity: 3,
        primaryAction: () => <button className="text-destructive">Remove</button>,
        secondaryActions: () => <button className="text-primary">Edit</button>,
    },
    parameters: {
        docs: {
            description: {
                story: `
A choice-based bonus product that allows users to select from multiple bonus options and adjust quantity.

### Features:
- Covers both list and rule based bonus products
- **Bonus Product Badge**: Displays a "Bonus Product" badge next to the product name
- **Strikethrough Original Price**: Shows the original price ($49.99) with strikethrough
- **Free Price Display**: Shows the discounted price ($0) as the current price
- **Enabled Quantity Picker**: Quantity can be changed (up to maxBonusQuantity limit)
- **Visible Actions**: Primary and secondary actions are shown for choice-based bonus products
- **Multiple Options**: Users can choose from multiple bonus products in the promotion

### Differences from Auto Bonus Products:
- ✅ Quantity picker is **enabled** (can adjust quantity)
- ✅ Primary actions are **visible** (e.g., Remove button)
- ✅ Secondary actions are **visible** (e.g., Edit button)
- ✅ Quantity is limited by \`maxBonusQuantity\` prop
- ✅ Part of a promotion with multiple bonus product options

### Use Cases:
- "Choose your free gift" promotions
- "Select 2 free items from these options" promotions
- User-selectable bonus items with quantity limits

### Key Props:
- \`bonusProductLineItem: true\` - Marks this as a bonus product
- \`bonusDiscountLineItemId: 'bonus-discount-choice-1'\` - Links to the discount line item
- \`bonusDiscountLineItems\` - Array containing discount line items with \`bonusProducts\` array
- \`maxBonusQuantity: 3\` - Maximum quantity allowed for this bonus product
- \`basePrice: 49.99\` - Original price shown as strikethrough
- \`priceAfterItemDiscount: 0\` - Final price after discount (free)
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify basic rendering
        await expect(canvas.getByText(mockChoiceBonusProductItem.productName)).toBeInTheDocument();
        // Verify bonus product badge is displayed (gated in default variant; hidden when the flag is off)
        if (showLineItemBonusBadge) {
            await expect(canvas.getByText('Bonus Product')).toBeInTheDocument();
        } else {
            await expect(canvas.queryByText('Bonus Product')).not.toBeInTheDocument();
        }
        // Verify "Free" text is shown for bonus product with zero price
        await expect(canvas.getByText('Free')).toBeInTheDocument();

        // Interaction tests for choice-based bonus product
        // Verify quantity picker is enabled and interactive
        const quantityInput = canvas.getByRole('spinbutton');
        await expect(quantityInput).not.toBeDisabled();

        // Test quantity picker interactions
        // Click to focus
        await userEvent.click(quantityInput);
        await expect(quantityInput).toHaveFocus();

        // Verify actions are visible and clickable
        const removeButton = canvas.getByText('Remove');
        await expect(removeButton).toBeInTheDocument();
        await userEvent.click(removeButton);
        // Action logger will capture this interaction

        const editButton = canvas.getByText('Edit');
        await expect(editButton).toBeInTheDocument();
        await userEvent.click(editButton);
        // Action logger will capture this interaction

        // Verify product name link is clickable
        const productLink = canvas.getByRole('link', { name: mockChoiceBonusProductItem.productName });
        await expect(productLink).toBeInTheDocument();
        await userEvent.click(productLink);
        // Link should be interactive
    },
};

export const NoProductItem: Story = {
    args: {
        productItem: undefined,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Product data not available')).toBeInTheDocument();
    },
};

export const LongProductName: Story = {
    args: {
        productItem: {
            ...mockProductItem,
            productName:
                "Women's Premium Extra-Fine Italian Merino Wool Blend Long-Sleeve Quarter-Zip Sweater with Elbow Patches and Reinforced Stitching",
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: /Women's Premium Extra-Fine/i });
        await expect(link).toBeInTheDocument();
    },
};

export const MissingImages: Story = {
    args: {
        productItem: {
            ...mockProductItem,
            imageGroups: [],
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductItem.productName)).toBeInTheDocument();
        // Image fallback renders a grey placeholder div (no img element)
        const img = canvas.queryByRole('img');
        await expect(img).not.toBeInTheDocument();
    },
};

export const DiscountedPrice: Story = {
    args: {
        productItem: {
            ...mockProductItem,
            price: 79.99,
            basePrice: 99.99,
            priceAfterItemDiscount: 79.99,
            quantity: 1,
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductItem.productName)).toBeInTheDocument();
    },
};

export const MultipleQuantity: Story = {
    args: {
        productItem: {
            ...mockProductItem,
            quantity: 3,
            price: 99.99,
            priceAfterItemDiscount: 299.97,
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductItem.productName)).toBeInTheDocument();
        // Shows "each" price for multi-quantity items
        await expect(canvas.getByText(/each/i)).toBeInTheDocument();
    },
};

export const WithInventoryMessage: Story = {
    args: {
        productItem: {
            ...mockProductItem,
            showInventoryMessage: true,
            inventoryMessage: 'Only 2 left in stock — order soon',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Only 2 left in stock — order soon')).toBeInTheDocument();
    },
};
