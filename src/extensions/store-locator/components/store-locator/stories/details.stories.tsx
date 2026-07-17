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
import StoreDetails from '../details';
import { createMockStore } from '@/extensions/bopis/tests/__mocks__/basket';
import type { ShopperStores } from '@/scapi';
import { Button } from '@/components/ui/button';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');

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

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const mockStore: ShopperStores.schemas['Store'] & { c_customerServiceEmail?: string } = createMockStore(
    'store-1',
    'inventory-1',
    {
        name: 'Downtown Store',
        address1: '123 Main Street',
        address2: 'Suite 100',
        city: 'San Francisco',
        stateCode: 'CA',
        postalCode: '94102',
        countryCode: 'US',
        phone: '415-555-1234',
        c_customerServiceEmail: 'downtown@example.com',
        distance: 2.5,
        storeHours: '<p>Mon-Fri: 9am-9pm<br/>Sat-Sun: 10am-8pm</p>',
    } as Partial<ShopperStores.schemas['Store']> & { c_customerServiceEmail?: string }
);

const mockStoreNoDistance: ShopperStores.schemas['Store'] = createMockStore('store-2', 'inventory-2', {
    name: 'Uptown Store',
    address1: '456 Oak Avenue',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94103',
    countryCode: 'US',
});

const meta: Meta<typeof StoreDetails> = {
    title: 'Extensions/Store Locator/Store Details',
    component: StoreDetails,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreDetails component displays store information including name, address, optional distance, phone and email.

## Features

- **Store Information**: Shows name, address, distance, phone, and email
- **Store Hours**: Presented in an accordion to keep the card compact
- **Distance Display**: Shows distance when available
- **Flexible Layout**: Supports mobile and desktop layouts
- **Primary Action Slot**: Optional action button in reserved area

## Usage

This component is used in the store locator list to display individual store information.
                `,
            },
        },
    },
    argTypes: {
        store: {
            description: 'Store object containing store information',
            control: 'object',
        },
        showDistance: {
            description: 'Whether to show distance information',
            control: 'boolean',
        },
        distanceUnit: {
            description: 'Distance unit to display ("km" | "mi")',
            control: 'select',
            options: ['km', 'mi'],
        },
        showStoreHours: {
            description: 'Whether to show store hours in an accordion',
            control: 'boolean',
        },
        showPhone: {
            description: 'Whether to show the phone number',
            control: 'boolean',
        },
        showEmail: {
            description: 'Whether to show the email address',
            control: 'boolean',
        },
        compactAddress: {
            description: 'Use compact address format with store name inline',
            control: 'boolean',
        },
        id: {
            description: 'ID for accessibility',
            control: 'text',
        },
        mobileLayout: {
            description: 'Use mobile layout regardless of screen size',
            control: 'boolean',
        },
        primaryAction: {
            description: 'Optional primary action slot (e.g. button)',
            control: false,
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
        store: mockStore,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: true,
        showPhone: true,
        showEmail: true,
        compactAddress: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default store details display showing:
- Store name
- Full address
- Distance information
- Expandable accordion with phone, email, and store hours

This is the default state with all information displayed.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();

        // Verify address is present
        const address = await canvas.findByText(/123 Main Street/i, {}, { timeout: 5000 });
        await expect(address).toBeInTheDocument();
    },
};

export const WithoutDistance: Story = {
    args: {
        store: mockStoreNoDistance,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: false,
        showPhone: false,
        showEmail: false,
        compactAddress: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store details without distance information. Shows:
- Store name and address
- No distance displayed when not available

This state appears when distance information is not provided.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify store name is present
        const storeName = await canvas.findByText(/uptown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const WithPrimaryAction: Story = {
    args: {
        store: mockStore,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: true,
        showPhone: true,
        showEmail: true,
        compactAddress: false,
        primaryAction: <Button size="sm">Select Store</Button>,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store details with a primary action button. Shows:
- Store information
- Action button in the reserved area (top-right on mobile, third column on desktop)

This is useful for store selection flows.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();

        // Verify action button is present
        const actionButton = await canvas.findByText(/select store/i, {}, { timeout: 5000 });
        await expect(actionButton).toBeInTheDocument();
    },
};

export const CompactAddress: Story = {
    args: {
        store: mockStore,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: true,
        showPhone: true,
        showEmail: true,
        compactAddress: true,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store details with compact address format. Shows:
- Store name inline with address ("Store Name - Address")
- More compact layout
- Useful for checkout/BOPIS flows

This format saves vertical space while maintaining readability.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify store name is present in address
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    args: {
        store: mockStore,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: true,
        showPhone: true,
        showEmail: true,
        compactAddress: false,
        mobileLayout: true,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store details optimized for mobile devices. Shows:
- Stacked layout for better mobile viewing
- Touch-friendly accordion
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
        const canvas = within(canvasElement);

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        store: mockStore,
        showDistance: true,
        distanceUnit: 'km',
        showStoreHours: true,
        showPhone: true,
        showEmail: true,
        compactAddress: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store details for desktop devices. Shows:
- Grid layout with proper spacing
- All information clearly displayed
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

        // Verify store name is present
        const storeName = await canvas.findByText(/downtown store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};
