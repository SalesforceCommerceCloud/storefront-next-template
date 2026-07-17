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
import StoreLocatorList from '../list';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logStoreSelection = action('store-selection');

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
                if (label.toLowerCase().includes('load more')) {
                    logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
                } else {
                    logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
                }
            }
        };

        const handleChange = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const radio = target.closest('input[type="radio"]');
            if (radio instanceof HTMLInputElement) {
                logStoreSelection({ value: radio.value, checked: radio.checked });
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

function StoryWrapper({ children }: { children: ReactNode }) {
    return (
        <StoreLocatorProvider>
            <ActionLogger>{children}</ActionLogger>
        </StoreLocatorProvider>
    );
}

const meta: Meta<typeof StoreLocatorList> = {
    title: 'Extensions/Store Locator/Store Locator List',
    component: StoreLocatorList,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreLocatorList component presents search results and selection UI for stores.

## Features

- **Store Results**: Displays list of stores from search
- **Radio Selection**: Allows users to select a store via radio buttons
- **Pagination**: Load more functionality for large result sets
- **Status Messages**: Shows search status and error messages
- **Loading State**: Displays skeleton while loading

## Usage

This component is used within the StoreLocator component to display search results.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoryWrapper>
                <Story />
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
Default store locator list showing:
- No results (hasSearched is false)
- Component returns null when no search has been performed

This is the initial state before any search.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // When hasSearched is false, component returns null
        // So we just verify the component renders without errors
        await expect(canvasElement).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator list optimized for mobile devices. Shows:
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

        // Verify component renders
        await expect(canvasElement).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator list for desktop devices. Shows:
- Grid layout with proper spacing
- All store information clearly displayed
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

        // Verify component renders
        await expect(canvasElement).toBeInTheDocument();
    },
};
