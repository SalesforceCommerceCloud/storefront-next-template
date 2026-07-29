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
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import type { ShopperBasketsV2 } from '@/scapi';
import CartDeliveryOption from '../cart-delivery-option';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import BasketProvider from '@/providers/basket';
import type { EnrichedProductItem } from '@/lib/product/product-utils';
import { mockStandardProductOrderable } from '../../../../../components/__mocks__/standard-product';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logAction = action('interaction');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;

            const interactiveElement = target.closest('button, a, [role="button"]');
            if (interactiveElement) {
                event.preventDefault();
                event.stopPropagation();
                const label = interactiveElement.textContent?.trim().substring(0, 50) || 'unlabeled';
                const tag = interactiveElement.tagName.toLowerCase();

                if (label.match(/delivery|pickup|pick up/i)) {
                    action('delivery-option-change')({ label });
                } else {
                    logAction({ type: 'click', tag, label });
                }
            }
        };

        root.addEventListener('click', handleClick, true);
        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

// Create mock product item
const mockProductItem: EnrichedProductItem = {
    ...mockStandardProductOrderable.product,
    itemId: 'item-1',
    productId: mockStandardProductOrderable.product.id,
    quantity: 2,
    price: 99.99,
    priceAfterItemDiscount: 99.99,
    productName: mockStandardProductOrderable.product.name,
    shipmentId: 'shipment-1',
};

const meta: Meta<typeof CartDeliveryOption> = {
    title: 'Extensions/BOPIS/Cart Delivery Option',
    component: CartDeliveryOption,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The CartDeliveryOption component renders a delivery option dropdown for cart items.

## Features

- **Fulfillment Detection**: Automatically determines current fulfillment based on shipment
- **Inventory Checking**: Checks availability for both pickup and delivery options
- **Store Locator Integration**: Opens store locator when pickup is selected without a store
- **Form Submission**: Handles delivery option changes with form submission
- **Error Handling**: Shows toast notifications for errors

## Usage

This component is used in the cart to allow customers to change delivery options for individual items.
                `,
            },
        },
    },
    argTypes: {
        product: {
            description: 'Product item from basket with shipment information',
            control: 'object',
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <AllProvidersWrapper>
                <ActionLogger>
                    <Story />
                </ActionLogger>
            </AllProvidersWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CartDeliveryOption>;

export const Default: Story = {
    args: {
        product: mockProductItem,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default delivery option dropdown for a cart item with delivery fulfillment.

Shows:
- Delivery option selected (default)
- Dropdown to switch between delivery and pickup
- Both options enabled
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify dropdown button is rendered
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();

        // Verify it shows "Delivery" by default
        await expect(canvas.getByText('Delivery')).toBeInTheDocument();
    },
};

export const PickupSelected: Story = {
    args: {
        product: {
            ...mockProductItem,
            shipmentId: 'shipment-pickup-1',
            storeId: 'store-1',
            inventoryId: 'inventory-1',
        },
    },
    decorators: [
        (Story: React.ComponentType) => {
            // Create a mock basket with a pickup shipment
            const mockBasketWithPickup: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-pickup-1',
                        c_fromStoreId: 'store-1', // This marks it as a pickup shipment
                    },
                ],
            };

            return (
                <AllProvidersWrapper>
                    <BasketProvider basket={mockBasketWithPickup}>
                        <ActionLogger>
                            <Story />
                        </ActionLogger>
                    </BasketProvider>
                </AllProvidersWrapper>
            );
        },
    ],
    parameters: {
        docs: {
            description: {
                story: `
Delivery option dropdown for a cart item with pickup fulfillment.

Shows:
- Pickup option selected
- Dropdown to switch between delivery and pickup
- Store icon displayed
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify dropdown button is rendered
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();

        // Verify it shows "Pick Up" when pickup is selected
        await expect(canvas.getByText('Pick Up')).toBeInTheDocument();
    },
};

export const Mobile: Story = {
    args: {
        product: mockProductItem,
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify dropdown button is rendered on mobile
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();
    },
};

export const Desktop: Story = {
    args: {
        product: mockProductItem,
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify dropdown button is rendered on desktop
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();
    },
};
