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
import StoreAddress from '../address';
import { createMockStore } from '@/extensions/bopis/tests/__mocks__/basket';
import type { ShopperStores } from '@/scapi';

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
    countryCode: 'US',
});

const meta: Meta<typeof StoreAddress> = {
    title: 'Extensions/Store Locator/Store Address',
    component: StoreAddress,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreAddress component renders a store address in an i18n-friendly way.

## Features

- **i18n Support**: Field order and separators come from UI strings for localization
- **Flexible Formatting**: Supports both multiline and single-line formats
- **Store Name Option**: Can include store name inline with address

## Usage

This component is used within StoreDetails to display store address information.
                `,
            },
        },
    },
    argTypes: {
        store: {
            description: 'Store object containing address information',
            control: 'object',
        },
        multiline: {
            description: 'Whether to show each address line on separate lines',
            control: 'boolean',
        },
        includeStoreName: {
            description: 'Include store name inline with first address line',
            control: 'boolean',
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
        multiline: true,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default store address display showing:
- Multiline format with each address line on separate lines
- Full address information
- No store name included

This is the default multiline format.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify address is rendered
        const addressText = await canvas.findByText(/123 Main Street/i, {}, { timeout: 5000 });
        await expect(addressText).toBeInTheDocument();
    },
};

export const SingleLine: Story = {
    args: {
        store: mockStore,
        multiline: false,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address in single-line format. Shows:
- All address information on one line
- Compact display

This format is useful for constrained spaces.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify address is rendered
        const addressText = await canvas.findByText(/123 Main Street/i, {}, { timeout: 5000 });
        await expect(addressText).toBeInTheDocument();
    },
};

export const WithStoreName: Story = {
    args: {
        store: mockStore,
        multiline: true,
        includeStoreName: true,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address with store name included inline. Shows:
- Store name followed by address
- Format: "Store Name - Address Line 1"
- Useful for compact displays

This format is commonly used in checkout/BOPIS flows.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify store name is included
        const storeName = await canvas.findByText(/Downtown Store/i, {}, { timeout: 5000 });
        await expect(storeName).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    args: {
        store: mockStore,
        multiline: true,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address optimized for mobile devices. Shows:
- Multiline format for better readability
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

        // Verify address is rendered
        const addressText = await canvas.findByText(/123 Main Street/i, {}, { timeout: 5000 });
        await expect(addressText).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        store: mockStore,
        multiline: true,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address for desktop devices. Shows:
- Proper spacing and layout
- All information clearly displayed

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

        // Verify address is rendered
        const addressText = await canvas.findByText(/123 Main Street/i, {}, { timeout: 5000 });
        await expect(addressText).toBeInTheDocument();
    },
};
