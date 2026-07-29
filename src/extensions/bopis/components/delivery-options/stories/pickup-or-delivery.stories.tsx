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
import PickupOrDelivery from '../pickup-or-delivery';
import { DELIVERY_OPTIONS } from '@/extensions/bopis/constants';
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

            // Log button clicks (store selection button)
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

const mockStore: SelectedStoreInfo = {
    id: 'store-1',
    name: 'Downtown Store',
    inventoryId: 'inventory-1',
};

const meta: Meta<typeof PickupOrDelivery> = {
    title: 'Extensions/BOPIS/Pickup Or Delivery',
    component: PickupOrDelivery,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The PickupOrDelivery component allows users to choose between shipping and pickup options.

## Features

- **Radio Selection**: Radio button group for delivery and pickup options
- **Store Integration**: Store selection button that opens store locator
- **Availability Status**: Shows stock status messages for each option
- **Disabled States**: Can disable pickup or delivery based on inventory

## Usage

This component is used within DeliveryOptions to provide the actual selection interface.
                `,
            },
        },
    },
    argTypes: {
        value: {
            description: 'Current selected delivery option',
            control: 'select',
            options: [DELIVERY_OPTIONS.DELIVERY, DELIVERY_OPTIONS.PICKUP],
        },
        onChange: {
            description: 'Callback function when delivery option changes',
            action: 'onChange',
        },
        isPickupDisabled: {
            description: 'Whether pickup option is disabled',
            control: 'boolean',
        },
        pickupStore: {
            description: 'The pickup store for basket items, if pickup option is selected',
            control: 'object',
        },
        isDeliveryDisabled: {
            description: 'Whether delivery option is disabled',
            control: 'boolean',
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
        value: DELIVERY_OPTIONS.DELIVERY,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default pickup or delivery selection showing:
- Delivery option selected by default
- Both options enabled
- "Select store" prompt for pickup option

This is the default state when no store is selected.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify delivery option is selected (Radix UI renders as button with role="radio")
        const deliveryRadio = canvasElement.querySelector('#delivery-option') as HTMLElement;
        await expect(deliveryRadio).toBeInTheDocument();
        await expect(deliveryRadio).toHaveAttribute('aria-checked', 'true');
    },
};

export const PickupSelected: Story = {
    args: {
        value: DELIVERY_OPTIONS.PICKUP,
        pickupStore: mockStore,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup option selected with store chosen. Shows:
- Pickup option selected
- Store name displayed
- "In stock at store" message when available

This state appears after a user selects a store and chooses pickup.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify pickup option is selected (Radix UI renders as button with role="radio")
        const pickupRadio = canvasElement.querySelector('#pickup-option') as HTMLElement;
        await expect(pickupRadio).toBeInTheDocument();
        await expect(pickupRadio).toHaveAttribute('aria-checked', 'true');

        // Verify store name is displayed
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const PickupDisabled: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY,
        pickupStore: mockStore,
        isPickupDisabled: true,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup option disabled due to out of stock. Shows:
- Delivery option selected
- Pickup option disabled
- "Unavailable - Pick up in store" message
- "Out of stock at store" message

This state appears when the selected store doesn't have inventory.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify pickup option is disabled (Radix UI renders as button with role="radio")
        const pickupRadio = canvasElement.querySelector('#pickup-option') as HTMLElement;
        await expect(pickupRadio).toBeInTheDocument();
        await expect(pickupRadio).toBeDisabled();
    },
};

export const DeliveryDisabled: Story = {
    args: {
        value: DELIVERY_OPTIONS.PICKUP,
        pickupStore: mockStore,
        isPickupDisabled: false,
        isDeliveryDisabled: true,
    },
    parameters: {
        docs: {
            description: {
                story: `
Delivery option disabled due to site-wide out of stock. Shows:
- Pickup option selected
- Delivery option disabled
- Only pickup available

This state appears when the product is out of stock site-wide but available at stores.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify delivery option is disabled (Radix UI renders as button with role="radio")
        const deliveryRadio = canvasElement.querySelector('#delivery-option') as HTMLElement;
        await expect(deliveryRadio).toBeInTheDocument();
        await expect(deliveryRadio).toBeDisabled();
    },
};

export const NoStoreSelected: Story = {
    args: {
        value: DELIVERY_OPTIONS.PICKUP,
        pickupStore: null,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup option selected but no store chosen. Shows:
- Pickup option selected
- "Select store" prompt
- Store selection button

This state appears when user selects pickup but hasn't chosen a store yet.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify pickup option is selected (Radix UI renders as button with role="radio")
        const pickupRadio = canvasElement.querySelector('#pickup-option') as HTMLElement;
        await expect(pickupRadio).toBeInTheDocument();
        await expect(pickupRadio).toHaveAttribute('aria-checked', 'true');
    },
};

export const MobileLayout: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup or delivery selection optimized for mobile devices. Shows:
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

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY,
        pickupStore: mockStore,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup or delivery selection for desktop devices. Shows:
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
        const canvas = within(canvasElement);

        // Wait for and verify radio group is rendered
        const radioGroup = canvasElement.querySelector('[data-testid="delivery-option-select"]');
        await expect(radioGroup).toBeInTheDocument();

        // Verify store name is displayed
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};
