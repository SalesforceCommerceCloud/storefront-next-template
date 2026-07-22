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
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperProducts } from '@/scapi';

import InventoryMessage from '../index';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('inventory-message-click');
        const logHover = action('inventory-message-hover');

        const isInsideHarness = (element: Element) => root.contains(element);

        const deriveLabel = (element: HTMLElement): string => {
            const ariaLabel = element.getAttribute('aria-label')?.trim();
            if (ariaLabel) {
                return ariaLabel;
            }

            const textContent = element.textContent?.replace(/\s+/g, ' ').trim();
            if (textContent) {
                return textContent;
            }

            const testId = element.getAttribute('data-testid')?.trim();
            if (testId) {
                return testId;
            }

            return element.tagName.toLowerCase();
        };

        const findMessageElement = (start: Element | null): HTMLElement | null => {
            let current: Element | null = start;
            while (current && current !== root) {
                if (current instanceof HTMLElement && isInsideHarness(current)) {
                    return current;
                }
                current = current.parentElement;
            }
            return null;
        };

        let lastHoverElement: HTMLElement | null = null;

        const handleClick = (event: Event) => {
            const target = event.target as Element | null;
            if (!target) return;

            const message = findMessageElement(target);
            if (!message) {
                return;
            }

            const label = deriveLabel(message);
            if (!label) {
                return;
            }

            logClick({ label });
        };

        const handlePointerOver = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (!target) return;

            const message = findMessageElement(target);
            if (!message || message === lastHoverElement) {
                return;
            }

            const label = deriveLabel(message);
            if (!label) {
                return;
            }

            lastHoverElement = message;
            logHover({ label });
        };

        const handlePointerOut = (event: PointerEvent) => {
            if (!lastHoverElement) {
                return;
            }

            const target = event.target as Element | null;
            if (!target) return;

            const message = findMessageElement(target);
            if (!message || message !== lastHoverElement) {
                return;
            }

            const related = event.relatedTarget as Element | null;
            if (related && lastHoverElement.contains(related)) {
                return;
            }

            lastHoverElement = null;
        };

        root.addEventListener('click', handleClick, true);
        root.addEventListener('pointerover', handlePointerOver, true);
        root.addEventListener('pointerout', handlePointerOut, true);

        return () => {
            lastHoverElement = null;
            root.removeEventListener('click', handleClick, true);
            root.removeEventListener('pointerover', handlePointerOver, true);
            root.removeEventListener('pointerout', handlePointerOut, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

/**
 * The InventoryMessage component displays inventory status messages for products.
 * It supports four different states: In Stock, Pre-Order, Back Order, and Out of Stock.
 * Each state has its own color scheme and messaging.
 */
const meta: Meta<typeof InventoryMessage> = {
    title: 'Products/Inventory Message',
    component: InventoryMessage,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
The Inventory Message component displays real-time inventory status for products on the Product Detail Page (PDP).

**Features:**
- **In Stock**: Green badge indicating product availability
- **Pre-Order**: Blue badge for pre-orderable items
- **Back Order**: Orange badge for back-orderable items  
- **Out of Stock**: Red badge when product is unavailable

The component uses variant inventory when available, falling back to product-level inventory.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ActionLogger>
                <div className="p-8">
                    <Story />
                </div>
            </ActionLogger>
        ),
    ],
    argTypes: {
        product: {
            description: 'Product data containing inventory information',
            control: false,
        },
        currentVariant: {
            description: 'Current variant if product has variations',
            control: false,
        },
        className: {
            description: 'Additional CSS classes to apply',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Helper function to create mock product data
const createMockProduct = (
    inventory?: Partial<ShopperProducts.schemas['Inventory']>
): ShopperProducts.schemas['Product'] => ({
    id: 'test-product-123',
    name: 'Test Product',
    ...(inventory ? { inventory: inventory as ShopperProducts.schemas['Inventory'] } : {}),
});

/**
 * All badge variants in one composite: In Stock, Pre-Order, Back Order, Out of Stock, Unknown
 */
export const AllVariants: Story = {
    render: () => (
        <div className="flex flex-wrap gap-4">
            <InventoryMessage
                product={createMockProduct({
                    orderable: true,
                    ats: 10,
                    backorderable: false,
                    preorderable: false,
                })}
            />
            <InventoryMessage
                product={createMockProduct({
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                    ats: 0,
                })}
            />
            <InventoryMessage
                product={createMockProduct({
                    orderable: true,
                    preorderable: false,
                    backorderable: true,
                    ats: 0,
                })}
            />
            <InventoryMessage
                product={createMockProduct({
                    orderable: false,
                    preorderable: false,
                    backorderable: false,
                    ats: 0,
                })}
            />
            <InventoryMessage product={createMockProduct()} showUnknownStatus={true} />
        </div>
    ),
    parameters: {
        docs: {
            description: {
                story: 'All inventory badge variants: In Stock, Pre-Order, Back Order, Out of Stock, and Unknown status.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Assert the exact visible message text — the sr-only status prefixes ("Pre-order: ",
        // "Back order: ") would otherwise double-match a loose regex.
        await expect(canvas.getByText('In stock')).toBeInTheDocument();
        await expect(canvas.getByText('Available for pre-order')).toBeInTheDocument();
        await expect(canvas.getByText('Available for back order')).toBeInTheDocument();
        await expect(canvas.getByText('Out of stock')).toBeInTheDocument();
        await expect(canvas.getByText('Inventory unavailable')).toBeInTheDocument();
    },
};

/**
 * Perpetual inventory: SCAPI returns ats=999999 for items the merchant has flagged as
 * never-out-of-stock. The PDP renders the same bucketed "In stock" message and never
 * surfaces the underlying count.
 */
export const Perpetual: Story = {
    args: {
        product: createMockProduct({
            orderable: true,
            ats: 999999,
            backorderable: false,
            preorderable: false,
        }),
    },
    parameters: {
        docs: {
            description: {
                story: 'Perpetual inventory variant. Renders "In stock" without leaking the underlying 999999 sentinel.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('In stock')).toBeInTheDocument();
        await expect(canvas.queryByText(/999999/)).not.toBeInTheDocument();
        await expect(canvas.queryByText(/units/)).not.toBeInTheDocument();
    },
};
