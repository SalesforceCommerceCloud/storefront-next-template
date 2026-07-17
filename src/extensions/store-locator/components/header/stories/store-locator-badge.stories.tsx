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
import StoreLocatorBadge from '../store-locator-badge';
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

const meta: Meta<typeof StoreLocatorBadge> = {
    title: 'Extensions/Store Locator/Store Locator Badge',
    component: StoreLocatorBadge,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreLocatorBadge component is a lazy-loaded trigger button for the store locator sheet.

## Features

- **Lazy Loading**: Defers loading of the store locator UI until first interaction
- **State Management**: Integrates with store locator global state
- **Accessibility**: Includes proper ARIA labels for screen readers
- **Performance**: Keeps initial bundles small by lazy-loading the sheet component

## Usage

This component is typically rendered in the site header to provide access to the store locator.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoreLocatorProvider>
                <ActionLogger>
                    <Story />
                </ActionLogger>
            </StoreLocatorProvider>
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
Default store locator badge showing:
- Store icon button
- Click to open store locator sheet
- Lazy-loads the sheet component on first click

This is the default state before any interaction.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for and verify badge button is rendered
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();

        // Verify button has aria-label
        const ariaLabel = button.getAttribute('aria-label');
        await expect(ariaLabel).toBeTruthy();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator badge optimized for mobile devices. Shows:
- Touch-friendly button size
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

        // Wait for and verify badge button is rendered
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator badge for desktop devices. Shows:
- Proper spacing and layout
- Desktop-optimized button

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

        // Wait for and verify badge button is rendered
        const button = await canvas.findByRole('button', {}, { timeout: 5000 });
        await expect(button).toBeInTheDocument();
    },
};
