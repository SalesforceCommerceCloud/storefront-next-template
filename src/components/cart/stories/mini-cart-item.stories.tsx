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
import MiniCartItem from '../mini-cart-item';
import { type ReactNode, type ReactElement } from 'react';
import { expect, within, waitFor } from 'storybook/test';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockConfig } from '@/test-utils/config';
import { mockCartLineProduct } from '@/components/__mocks__';
import CartTitle from '../cart-title';

/**
 * Reusable mini cart shell wrapper that adds the "My Cart" header (close button
 * + title) and a Checkout / Continue Shopping / View Cart footer — mirroring
 * the production `<CartSheetPanel>` chrome.
 *
 * Earlier versions of this shell rendered an invented free-shipping progress
 * bar and a "Complete the Look" carousel; both were Pattern 8 violations
 * (visual-only UI with no production analogue) and have been removed.
 */
function MiniCartShell({
    children,
    itemCount = 1,
    showFooter = true,
}: {
    children: ReactNode;
    itemCount?: number;
    showFooter?: boolean;
}): ReactElement {
    return (
        <div className="w-full max-w-md h-full bg-background shadow-xl flex flex-col rounded-lg overflow-hidden">
            <div className="flex-shrink-0 border-b border-border">
                <div className="flex items-center justify-between px-4 sm:px-6 py-4">
                    <div className="[&_h1]:my-0 truncate pr-2">
                        <CartTitle
                            basket={{
                                productItems: Array.from({ length: itemCount }, (_, i) => ({
                                    itemId: `item-${i}`,
                                    quantity: 1,
                                })),
                            }}
                            deliveryCount={itemCount}
                        />
                    </div>
                    <button
                        className="p-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Close cart">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="pt-4 md:pt-6 pb-4 md:pb-6">
                    <div className="pt-4 border-t border-border">
                        <div className="px-4 md:px-6 py-4">{children}</div>
                    </div>
                </div>
            </div>
            {showFooter && (
                <div className="flex-shrink-0 border-t border-border p-4 md:p-6 space-y-3">
                    <Button className="w-full">Checkout $59.00</Button>
                    <Button variant="outline" className="w-full">
                        Continue Shopping
                    </Button>
                    <button
                        type="button"
                        className="w-full text-center text-sm text-primary hover:text-primary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded py-2">
                        View Cart
                    </button>
                </div>
            )}
        </div>
    );
}

// Shared cart-domain product fixture — `imageGroups: []` so the "No image"
// placeholder renders rather than a broken thumbnail.
const baseProduct = { ...mockCartLineProduct, productName: 'Product Name' };

const meta: Meta<typeof MiniCartItem> = {
    title: 'Cart/Mini Cart/Mini Cart Item',
    component: MiniCartItem,
    tags: ['autodocs', 'interaction', 'skip-a11y'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
\`MiniCartItem\` displays a product in the mini cart flyout. Owns the product image, name, variation attributes, pricing block, quantity stepper, and remove button. Used inside \`<CartSheet>\` from the header — its single production importer.

## Stories

| Story | Description |
|-------|-------------|
| **Default** | Standard line with savings; \`product\` is exposed as a control so quantity / variation attributes / pricing / images can be tweaked without spawning new stories (Pattern 10). The default fixture has \`imageGroups: []\` so the "No image" placeholder renders rather than a broken thumbnail — flip the \`product\` control to add an image. |
| **AtStockLimit** | Boundary: increment disabled, "Maximum stock reached" alert |
| **EmptyCart** | The empty-state shell (no \`<MiniCartItem>\` rendered — exercises the cart-flyout layout when the basket is empty) |
                `,
            },
        },
    },
    argTypes: {
        product: {
            description: 'Combined basket item and product data with images, pricing, and variations',
            control: 'object',
            table: {
                type: { summary: 'MiniCartItemProduct' },
            },
        },
        onRemove: {
            description: 'Callback fired when the user clicks the remove button. Bound to Storybook actions panel.',
            action: 'remove-clicked',
            table: {
                type: { summary: '() => void' },
            },
        },
    },
    args: {
        product: baseProduct,
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <div className="w-full max-w-md">
                    <Story />
                </div>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof MiniCartItem>;

export const Default: Story = {
    render: (args) => (
        <MiniCartShell>
            <MiniCartItem {...args} />
        </MiniCartShell>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Mini cart item rendered inside the standard cart-sheet shell. Adjust the `product` control to demonstrate quantity, savings, variation attributes, or imagery without spawning new stories.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        const cartTitle = await canvas.findByText(/Delivery - 1 out of 1 item$/);
        await expect(cartTitle).toBeInTheDocument();

        const closeButton = await canvas.findByRole('button', { name: /close/i });
        await expect(closeButton).toBeInTheDocument();

        const productName = await canvas.findByText('Product Name');
        await expect(productName).toBeInTheDocument();

        await waitFor(() => {
            const priceContainer = canvasElement.querySelector('[data-testid="mini-cart-item"]');
            expect(priceContainer).toBeInTheDocument();
            const priceText = priceContainer?.textContent || '';
            expect(priceText).toContain('£20.00');
            expect(priceText).toContain('£15.00');
        });

        const quantityInput = await canvas.findByLabelText('Quantity');
        await expect(quantityInput).toBeInTheDocument();
        await expect(quantityInput).toHaveValue(1);

        const removeButton = await canvas.findByRole('button', { name: /remove item/i });
        await expect(removeButton).toBeInTheDocument();
    },
};

export const AtStockLimit: Story = {
    args: {
        product: { ...baseProduct, quantity: 4, inventory: { id: 'mock-inv', ats: 4 } },
    },
    render: (args) => (
        <MiniCartShell>
            <MiniCartItem {...args} />
        </MiniCartShell>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Boundary case: quantity matches `inventory.ats`. Increment is disabled and the "Maximum stock reached" alert is announced.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        const quantityInput = await canvas.findByLabelText('Quantity');
        await expect(quantityInput).toBeInTheDocument();
        await expect(quantityInput).toHaveValue(4);

        const incrementButton = await canvas.findByTestId('quantity-increment');
        await expect(incrementButton).toBeDisabled();

        const stockMessage = await canvas.findByRole('alert');
        await expect(stockMessage).toBeInTheDocument();
        await expect(stockMessage).toHaveTextContent('Maximum stock reached');
    },
};

export const EmptyCart: Story = {
    render: () => (
        <MiniCartShell itemCount={0} showFooter={false}>
            <div className="flex flex-col items-center text-center py-8">
                <svg
                    className="w-24 h-24 text-muted-foreground/30 mx-auto mb-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                </svg>

                <h2 className="text-2xl font-semibold text-foreground mb-2">Your cart is empty</h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                    Looks like you haven&apos;t added anything to your cart yet. Start shopping to fill it up with
                    amazing products!
                </p>

                <Button className="px-8">Start Shopping</Button>
            </div>
        </MiniCartShell>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Empty-state shell — header at zero count and a "Start Shopping" CTA. No `<MiniCartItem>` is rendered.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        const cartTitle = await canvas.findByText(/Delivery - 0 out of 0 items$/);
        await expect(cartTitle).toBeInTheDocument();

        const closeButton = await canvas.findByRole('button', { name: /close/i });
        await expect(closeButton).toBeInTheDocument();

        const emptyHeading = await canvas.findByText('Your cart is empty');
        await expect(emptyHeading).toBeInTheDocument();

        const subtitle = await canvas.findByText(/Looks like you haven't added anything/);
        await expect(subtitle).toBeInTheDocument();

        const startShoppingButton = await canvas.findByRole('button', { name: /start shopping/i });
        await expect(startShoppingButton).toBeInTheDocument();
    },
};
