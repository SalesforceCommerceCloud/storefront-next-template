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
import RefineInventory from '../index';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logCheckboxChange = action('checkbox-change');
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

            // Log button clicks (store name link)
            const button = target.closest('button, [role="button"], span[class*="underline"]');
            if (button) {
                const label =
                    button.textContent?.trim() || button.getAttribute('aria-label') || button.tagName.toLowerCase();
                if (label.toLowerCase().includes('store') || label.toLowerCase().includes('select')) {
                    logStoreSelection({ label });
                } else {
                    logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
                }
            }
        };

        const handleChange = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const checkbox = target.closest('input[type="checkbox"]');
            if (checkbox instanceof HTMLInputElement) {
                logCheckboxChange({ checked: checkbox.checked, id: checkbox.id });
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

function StoreSetter({
    children,
    storeId,
    inventoryId,
}: {
    children: ReactNode;
    storeId?: string;
    inventoryId?: string;
}): ReactElement {
    const setSelectedStoreInfo = useStoreLocator((s) => s.setSelectedStoreInfo);
    const store = useStoreLocator((s) => s.selectedStoreInfo);

    // Set store in useEffect - this will trigger a re-render of children
    useEffect(() => {
        if (storeId && inventoryId && (!store || store.inventoryId !== inventoryId)) {
            setSelectedStoreInfo({ id: storeId, inventoryId, name: 'Downtown Store' });
        }
    }, [storeId, inventoryId, setSelectedStoreInfo, store]);

    return <>{children}</>;
}

const meta: Meta<typeof RefineInventory> = {
    title: 'Extensions/BOPIS/Refine Inventory',
    component: RefineInventory,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The RefineInventory component displays a "Shop by Availability" filter that allows users to filter products by availability at a selected store.

## Features

- **Accordion Filter**: Expandable accordion with inventory filter checkbox
- **Store Integration**: Integrates with store locator for store selection
- **Auto-apply**: Automatically applies filter when store is selected
- **Category Integration**: Works with category refinement system

## Usage

This component is used in category pages to filter products by store availability.
                `,
            },
        },
    },
    argTypes: {
        isFilterSelected: {
            description: 'Function to check if a filter is currently selected',
            action: 'isFilterSelected',
        },
        hasActiveFilter: {
            description: 'Whether any refine is active for an attribute (parent effectiveRefines)',
            action: 'hasActiveFilter',
        },
        toggleFilter: {
            description: 'Function to toggle a filter on/off',
            action: 'toggleFilter',
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
        isFilterSelected: (_attributeId: string, _value: string) => false,
        hasActiveFilter: (_attributeId: string) => false,
        toggleFilter: (_attributeId: string, _value: string) => {
            action('toggleFilter')({ attributeId: _attributeId, value: _value });
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Default refine inventory filter showing:
- Accordion with "Shop by Availability" heading
- Unchecked checkbox
- "Select store" prompt when no store is selected

This is the default state when no store is selected.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify accordion is rendered
        const accordion = canvasElement.querySelector('[data-testid="sf-store-inventory-filter"]');
        await expect(accordion).toBeInTheDocument();

        // Verify checkbox is present
        const checkbox = canvasElement.querySelector('[data-testid="sf-store-inventory-filter-checkbox"]');
        await expect(checkbox).toBeInTheDocument();
    },
};

export const WithStoreSelected: Story = {
    args: {
        isFilterSelected: (_attributeId: string, _value: string) => {
            return _attributeId === 'ilids' && _value === 'inventory-1';
        },
        hasActiveFilter: (_attributeId: string) => _attributeId === 'ilids',
        toggleFilter: (_attributeId: string, _value: string) => {
            action('toggleFilter')({ attributeId: _attributeId, value: _value });
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Refine inventory filter with a store selected. Shows:
- Store name displayed in the label
- Checkbox can be checked/unchecked
- "Change store" functionality available

This state appears after a user has selected a store from the store locator.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify accordion is rendered
        const accordion = canvasElement.querySelector('[data-testid="sf-store-inventory-filter"]');
        await expect(accordion).toBeInTheDocument();

        // Verify checkbox is present
        const checkbox = canvasElement.querySelector('[data-testid="sf-store-inventory-filter-checkbox"]');
        await expect(checkbox).toBeInTheDocument();
    },
};

export const FilterChecked: Story = {
    args: {
        isFilterSelected: (_attributeId: string, _value: string) => {
            return _attributeId === 'ilids' && _value === 'inventory-1';
        },
        hasActiveFilter: (_attributeId: string) => _attributeId === 'ilids',
        toggleFilter: (_attributeId: string, _value: string) => {
            action('toggleFilter')({ attributeId: _attributeId, value: _value });
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoreSetter storeId="store-1" inventoryId="inventory-1">
                <ActionLogger>
                    <Story />
                </ActionLogger>
            </StoreSetter>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: `
Refine inventory filter with checkbox checked. Shows:
- Checkbox in checked state
- Filter is active
- Store name displayed

This state appears when the inventory filter is active.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for and verify accordion is rendered
        const accordion = canvasElement.querySelector('[data-testid="sf-store-inventory-filter"]');
        await expect(accordion).toBeInTheDocument();

        // Wait for checkbox to be checked (store is set asynchronously, component needs to re-render)
        const checkbox = canvasElement.querySelector(
            '[data-testid="sf-store-inventory-filter-checkbox"]'
        ) as HTMLElement;
        await expect(checkbox).toBeInTheDocument();
        // Wait for checkbox to have checked state (Radix UI uses data-state="checked")
        // The component needs time to re-render after store is set
        const { waitFor } = await import('@testing-library/react');
        await waitFor(
            () => {
                expect(checkbox).toHaveAttribute('data-state', 'checked');
            },
            { timeout: 3000 }
        );
    },
};

export const MobileLayout: Story = {
    args: {
        isFilterSelected: (_attributeId: string, _value: string) => false,
        hasActiveFilter: (_attributeId: string) => false,
        toggleFilter: (_attributeId: string, _value: string) => {
            action('toggleFilter')({ attributeId: _attributeId, value: _value });
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Refine inventory filter optimized for mobile devices. Shows:
- Accordion layout for better mobile viewing
- Touch-friendly checkbox
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

        // Wait for and verify accordion is rendered
        const accordion = canvasElement.querySelector('[data-testid="sf-store-inventory-filter"]');
        await expect(accordion).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        isFilterSelected: (_attributeId: string, _value: string) => {
            return _attributeId === 'ilids' && _value === 'inventory-1';
        },
        hasActiveFilter: (_attributeId: string) => _attributeId === 'ilids',
        toggleFilter: (_attributeId: string, _value: string) => {
            action('toggleFilter')({ attributeId: _attributeId, value: _value });
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Refine inventory filter for desktop devices. Shows:
- Proper spacing and layout
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

        // Wait for and verify accordion is rendered
        const accordion = canvasElement.querySelector('[data-testid="sf-store-inventory-filter"]');
        await expect(accordion).toBeInTheDocument();
    },
};
