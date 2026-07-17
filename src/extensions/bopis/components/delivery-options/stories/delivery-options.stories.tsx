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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import DeliveryOptions from '../delivery-options';
import { masterProductWithInventories } from '@/components/__mocks__/master-product-with-inventories';
import type { ShopperProducts } from '@/scapi';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logChange = action('delivery-option-change');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            // Prevent navigation on links
            const link = target.closest('a');
            if (link) {
                event.preventDefault();
                const href = link.getAttribute('href');
                logClick({ type: 'click', element: 'link', href, label: link.textContent?.trim() });
                return;
            }

            // Log button clicks
            const button = target.closest('button, [role="button"]');
            if (button) {
                const label =
                    button.textContent?.trim() || button.getAttribute('aria-label') || button.tagName.toLowerCase();
                logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
            }
        };

        const handleChange = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const radio = target.closest('input[type="radio"]');
            if (radio instanceof HTMLInputElement) {
                logChange({ value: radio.value, checked: radio.checked });
            }
        };

        root.addEventListener('click', handleClick, true);
        root.addEventListener('change', handleChange, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
            root.removeEventListener('change', handleChange, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const mockProduct: ShopperProducts.schemas['Product'] = masterProductWithInventories;
const mockStore: SelectedStoreInfo = {
    id: 'store-1',
    name: 'Downtown Store',
    inventoryId: 'inventory-1',
};

const meta: Meta<typeof DeliveryOptions> = {
    title: 'Extensions/BOPIS/Delivery Options',
    component: DeliveryOptions,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The DeliveryOptions component provides the complete delivery options experience for BOPIS.

## Features

- **Delivery Selection**: Allows users to choose between shipping and pickup options
- **Store Integration**: Integrates with store locator for pickup store selection
- **Inventory Awareness**: Shows availability status for both delivery and pickup options
- **Basket Context**: Adapts display when item is already in basket

## Usage

This component is used on product pages to let customers choose how they want to receive their order.
                `,
            },
        },
    },
    argTypes: {
        product: {
            description: 'The product to check inventory for',
            control: 'object',
        },
        quantity: {
            description: 'The selected quantity to check inventory against',
            control: 'number',
        },
        basketPickupStore: {
            description: 'The pickup store for basket items. When provided, indicates item is in basket.',
            control: 'object',
        },
        className: {
            description: 'Additional CSS classes',
            control: 'text',
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        product: mockProduct,
        quantity: 1,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default delivery options display showing:
- Radio buttons for delivery and pickup
- Store selection link for pickup option
- Availability status messages

This is the default state when viewing a product page.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify delivery options container is rendered
        const container = canvasElement.querySelector('[class*="space-y-4"]');
        await expect(container).toBeInTheDocument();

        // Verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();
    },
};

export const WithStoreSelected: Story = {
    args: {
        product: mockProduct,
        quantity: 1,
    },
    parameters: {
        docs: {
            description: {
                story: `
Delivery options with a store already selected. Shows:
- Store name in the pickup option
- "In stock at store" message when available
- Ability to change store selection

This state appears after a user has selected a store from the store locator.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify delivery options container is rendered
        const container = canvasElement.querySelector('[class*="space-y-4"]');
        await expect(container).toBeInTheDocument();
    },
};

export const InBasket: Story = {
    args: {
        product: mockProduct,
        quantity: 1,
        basketPickupStore: mockStore,
    },
    parameters: {
        docs: {
            description: {
                story: `
Delivery options when item is already in basket. Shows:
- No title or radio options (hidden when editing from cart)
- Only the selected delivery option information

This state appears when editing an item that's already in the cart.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify delivery options container is rendered
        const container = canvasElement.querySelector('[class*="space-y-4"]');
        await expect(container).toBeInTheDocument();

        // Verify title is not shown when in basket
        const title = canvasElement.querySelector('h3[role="heading"]');
        await expect(title).not.toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    args: {
        product: mockProduct,
        quantity: 1,
    },
    parameters: {
        docs: {
            description: {
                story: `
Delivery options optimized for mobile devices. Shows:
- Stacked layout for better mobile viewing
- Touch-friendly radio buttons
- Mobile-optimized spacing

The component automatically adapts for mobile screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify delivery options container is rendered
        const container = canvasElement.querySelector('[class*="space-y-4"]');
        await expect(container).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        product: mockProduct,
        quantity: 1,
    },
    parameters: {
        docs: {
            description: {
                story: `
Delivery options for desktop devices. Shows:
- Proper spacing and layout
- All options clearly displayed
- Desktop-optimized interaction

The component provides a clean layout for desktop screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify delivery options container is rendered
        const container = canvasElement.querySelector('[class*="space-y-4"]');
        await expect(container).toBeInTheDocument();

        // Verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();
    },
};
