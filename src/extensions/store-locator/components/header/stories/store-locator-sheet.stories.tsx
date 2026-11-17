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
import { expect, fn, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ReactNode } from 'react';
import StoreLocatorSheet from '../store-locator-sheet';
import { Button } from '@/components/ui/button';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

function StoryWrapper({
    children,
    open,
    onOpenChange,
}: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <StoreLocatorProvider>
            <StoreLocatorSheet open={open} onOpenChange={onOpenChange}>
                {children}
            </StoreLocatorSheet>
        </StoreLocatorProvider>
    );
}

const meta: Meta<typeof StoreLocatorSheet> = {
    title: 'Extensions/Store Locator/Store Locator Sheet',
    component: StoreLocatorSheet,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        // Luxury's Store Locator fetches boutique data as it mounts.
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
        ],
        docs: {
            description: {
                component: `
The StoreLocatorSheet component is a controlled sheet container that hosts the store locator experience.

## Features

- **Controlled Component**: Parent must manage open state
- **Sheet Container**: Uses shadcn Sheet component for overlay
- **Mobile Layout**: Forces mobile layout for constrained container
- **Accessibility**: Includes proper ARIA labels and descriptions

## Usage

This component wraps the StoreLocator component in a sheet overlay, typically triggered by the StoreLocatorBadge.
                `,
            },
        },
    },
    argTypes: {
        open: {
            description: 'Whether the controlled sheet is open.',
            control: 'boolean',
        },
        onOpenChange: {
            table: { disable: true },
        },
    },
    render: (args) => (
        <StoryWrapper open={args.open} onOpenChange={args.onOpenChange}>
            <Button variant="ghost">Open Store Locator</Button>
        </StoryWrapper>
    ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        open: false,
        onOpenChange: fn(),
    },
    parameters: {
        // The luxury sheet body seeds its branded boutique list from this route on open; harmless for fashion.
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
            {
                path: '/resource/appointment-territories',
                loader: () => ({ success: false, error: 'SCHEDULER_NOT_CONFIGURED' }),
            },
        ],
        docs: {
            description: {
                story: 'Closed state with the real trigger. Select `open` in Controls to inspect the sheet without changing its story fixture.',
            },
        },
    },
};

export const Open: Story = {
    tags: ['interaction'],
    args: {
        open: true,
        onOpenChange: fn(),
    },
    parameters: {
        // The luxury sheet body seeds its branded boutique list from this route on open; harmless for fashion.
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
            {
                path: '/resource/appointment-territories',
                loader: () => ({ success: false, error: 'SCHEDULER_NOT_CONFIGURED' }),
            },
        ],
        docs: {
            description: {
                story: 'Open controlled sheet with the Store Locator form and initial empty results state. The sheet is intentionally forced into its mobile locator layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const dialog = await within(document.body).findByRole('dialog');
        await expect(dialog).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        // The luxury sheet body seeds its branded boutique list from this route on open; harmless for fashion.
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
            {
                path: '/resource/appointment-territories',
                loader: () => ({ success: false, error: 'SCHEDULER_NOT_CONFIGURED' }),
            },
        ],
        docs: {
            description: {
                story: `
Store locator sheet for desktop devices. Shows:
- Narrower sheet width (1/3 of screen)
- Desktop-optimized layout
- Proper spacing

The component provides a clean layout for desktop screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement: _canvasElement }) => {
        await waitForStorybookReady(_canvasElement);

        // Store locator sheet renders in a portal, so check document.body
        const documentBody = within(document.body);
        const canvas = within(_canvasElement);

        // Find and click the button to open the sheet
        // There may be multiple buttons, so get all and use the first one
        const buttons = await canvas.findAllByRole('button', { name: /open store locator/i }, { timeout: 5000 });
        await expect(buttons.length).toBeGreaterThan(0);
        const openButton = buttons[0];

        await userEvent.click(openButton);

        // Wait for sheet to open
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Wait for store locator sheet to open
        const sheet = await documentBody.findByRole('dialog', { hidden: false }, { timeout: 5000 });
        await expect(sheet).toBeInTheDocument();
    },
};
