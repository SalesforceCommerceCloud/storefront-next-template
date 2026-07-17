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
import CartPickup from '../index';
import { createMockStore } from '@/extensions/bopis/tests/__mocks__/basket';
import type { ShopperStores } from '@/scapi';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logChangeStore = action('change-store');

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
                if (label.toLowerCase().includes('change')) {
                    logChangeStore({ label });
                } else {
                    logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
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

const mockStore: ShopperStores.schemas['Store'] = createMockStore('store-1', 'inventory-1', {
    name: 'Downtown Store',
    address1: '123 Main Street',
    address2: 'Suite 100',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    phone: '415-555-1234',
    email: 'downtown@example.com',
});

const meta: Meta<typeof CartPickup> = {
    title: 'Extensions/BOPIS/Cart Pickup',
    component: CartPickup,
    tags: ['autodocs', 'interaction'],
    args: {
        store: mockStore,
        pickupCount: 1,
        totalCount: 3,
    },
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The CartPickup component displays store information for pickup orders on the cart page.

## Features

- **Store Display**: Shows store name and address with icon
- **Change Store Button**: Button to open store locator and change pickup store
- **Auto-update**: Automatically updates basket when store is changed from store locator
- **Cart Integration**: Designed for use in cart/checkout flows

## Usage

This component is used on the cart page to show customers where they can pick up their order.
                `,
            },
        },
    },
    argTypes: {
        store: {
            description: 'Store object containing store information',
            control: 'object',
        },
        pickupCount: {
            description: 'Number of basket line items in this pickup section',
            control: 'number',
        },
        totalCount: {
            description: 'Total basket line items (pickup + delivery) for the heading',
            control: 'number',
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
    parameters: {
        docs: {
            description: {
                story: `
Default pickup store info display showing:
- Store icon and heading with store name and line counts (e.g. "1 out of 3 items")
- Store address
- "Change Store" button

This is the default state when an item is in the cart with a pickup store selected.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for and verify pickup store info card is rendered
        const card = canvasElement.querySelector('[data-testid="cart-pickup-card"]');
        await expect(card).toBeInTheDocument();

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();

        // Verify change store button is present
        const changeButton = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(changeButton).toBeInTheDocument();
    },
};

export const LongStoreName: Story = {
    args: {
        store: createMockStore('store-1', 'inventory-1', {
            name: 'Downtown San Francisco Flagship Store',
            address1: '123 Main Street',
            city: 'San Francisco',
            stateCode: 'CA',
            postalCode: '94102',
        }),
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup store info with a very long store name. Shows:
- Long store name wrapping properly
- Address still clearly displayed
- Layout stability with long names

This verifies the component handles long store names gracefully.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for and verify pickup store info card is rendered
        const card = canvasElement.querySelector('[data-testid="cart-pickup-card"]');
        await expect(card).toBeInTheDocument();

        // Verify long store name is displayed
        const storeName = await canvas.findByText(/downtown san francisco/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    args: {
        store: mockStore,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup store info optimized for mobile devices. Shows:
- Stacked layout for better mobile viewing
- Touch-friendly button
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

        // Wait for and verify pickup store info card is rendered
        const card = canvasElement.querySelector('[data-testid="cart-pickup-card"]');
        await expect(card).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        store: mockStore,
    },
    parameters: {
        docs: {
            description: {
                story: `
Pickup store info for desktop devices. Shows:
- Proper spacing and layout
- All information clearly displayed
- Desktop-optimized button placement

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

        // Wait for and verify pickup store info card is rendered
        const card = canvasElement.querySelector('[data-testid="cart-pickup-card"]');
        await expect(card).toBeInTheDocument();

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};
