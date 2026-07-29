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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import StoreLocatorSheet from '../store-locator-sheet';
import { Button } from '@/components/ui/button';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

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

function StoryWrapper({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);

    return (
        <StoreLocatorProvider>
            <ActionLogger>
                <StoreLocatorSheet open={open} onOpenChange={setOpen}>
                    {children}
                </StoreLocatorSheet>
                {!open && (
                    <Button onClick={() => setOpen(true)} className="mt-4">
                        Open Store Locator
                    </Button>
                )}
            </ActionLogger>
        </StoreLocatorProvider>
    );
}

const meta: Meta<typeof StoreLocatorSheet> = {
    title: 'Extensions/Store Locator/Store Locator Sheet',
    component: StoreLocatorSheet,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
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
            description: 'Controlled open state',
            control: 'boolean',
        },
        onOpenChange: {
            description: 'Callback when open state changes',
            action: 'onOpenChange',
        },
    },
    decorators: [
        (_Story: React.ComponentType) => (
            <StoryWrapper>
                <Button variant="ghost">Open Store Locator</Button>
            </StoryWrapper>
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
Default store locator sheet showing:
- Sheet overlay with store locator content
- Header with title and description
- Store locator form and list
- Close button

This is the default state when the sheet is open.
                `,
            },
        },
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

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator sheet optimized for mobile devices. Shows:
- Full-width sheet on mobile
- Mobile-optimized layout
- Touch-friendly interactions

The component automatically adapts for mobile screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
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

export const DesktopLayout: Story = {
    parameters: {
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
