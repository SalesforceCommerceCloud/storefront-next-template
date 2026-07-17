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
import CheckoutPickup from '../checkout-pickup';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;
        const logClick = action('pickup-summary-click');
        const logEdit = action('pickup-summary-edit');
        const logHover = action('pickup-summary-hover');
        root.addEventListener(
            'click',
            (e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;
                const button = target.closest('button');
                if (button && root.contains(button)) {
                    if (button.textContent?.toLowerCase().includes('edit')) {
                        logEdit({ label: button.textContent?.trim() });
                    } else {
                        logClick({ label: button.textContent?.trim() });
                    }
                }
            },
            true
        );
        root.addEventListener(
            'pointerover',
            (e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;
                if (target.closest('button, [role="button"], a')) {
                    logHover({ label: target.textContent });
                }
            },
            true
        );
        return () => {};
    }, []);
    return <div ref={containerRef}>{children}</div>;
}

// Mocks
const mockStore = {
    id: 'store-123',
    name: 'SF City Center',
    address1: '123 Market St',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94103',
    countryCode: 'US',
    phone: '555-555-1234',
    email: 'pickup@retail.com',
};
const mockProductA = {
    id: '1',
    itemId: '1',
    productId: 'p1',
    name: 'Mock Product A',
    productName: 'Mock Product A',
    image: 'https://placehold.co/120x120',
    variationAttributes: [
        { id: 'size', name: 'Size', values: [{ value: 'M', name: 'Medium' }] },
        { id: 'color', name: 'Color', values: [{ value: 'Red', name: 'Red' }] },
    ],
    variationValues: { size: 'M', color: 'Red' },
    quantity: 1,
    price: 29.99,
    attributes: [
        { label: 'Size', value: 'M' },
        { label: 'Color', value: 'Red' },
    ],
    imageGroups: [
        {
            viewType: 'small',
            images: [
                {
                    link: 'https://placehold.co/120x120',
                    disBaseLink: 'https://placehold.co/120x120',
                    alt: 'Mock Product A',
                },
            ],
        },
    ],
};
const mockProductB = {
    id: '2',
    itemId: '2',
    productId: 'p2',
    name: 'Mock Product B',
    productName: 'Mock Product B',
    image: 'https://placehold.co/120x120',
    variationAttributes: [
        { id: 'size', name: 'Size', values: [{ value: 'L', name: 'Large' }] },
        { id: 'color', name: 'Color', values: [{ value: 'Blue', name: 'Blue' }] },
    ],
    variationValues: { size: 'L', color: 'Blue' },
    quantity: 2,
    price: 39.99,
    attributes: [
        { label: 'Size', value: 'L' },
        { label: 'Color', value: 'Blue' },
    ],
    imageGroups: [
        {
            viewType: 'small',
            images: [
                {
                    link: 'https://placehold.co/120x120',
                    disBaseLink: 'https://placehold.co/120x120',
                    alt: 'Mock Product B',
                },
            ],
        },
    ],
};
const mockCart = {
    shipments: [{ shipmentId: 'S1', c_fromStoreId: mockStore.id }],
    productItems: [
        { ...mockProductA, shipmentId: 'S1' },
        { ...mockProductB, shipmentId: 'S1' },
    ],
};
const mockProductsByItemId = {
    '1': mockProductA,
    '2': mockProductB,
};

const meta: Meta<typeof CheckoutPickup> = {
    component: CheckoutPickup,
    title: 'Extensions/BOPIS/Checkout Pickup',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `\
### CheckoutPickup Component\n\nDisplays a summary of the pickup store location and the products being picked up. Toggles editable mode for item review or change of location.\n\n**Features:**\n- Shows pickup store name, address, contact\n- Displays summary card(s) for all pickup items\n- Edit button to allow changes (if permitted)\n- Conditionally renders item list only in editing mode\n- Highly composable with checkout context\n\n**Props:**\n- cart: the current basket object\n- productsByItemId: product details map\n- isEditing: whether in editable view\n- onEdit: edit button callback\n`,
            },
        },
    },
    argTypes: {
        cart: { control: 'object', description: 'Basket/cart object with shipments/productItems' },
        productsByItemId: { control: 'object', description: 'Product details enrichment map' },
        isEditing: { control: 'boolean', description: 'Whether editing (displays items)' },
        onEdit: { description: 'Callback when Edit button is pressed' },
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

export const Editing: Story = {
    args: {
        cart: mockCart,
        productsByItemId: mockProductsByItemId,
        isEditing: true,
        onEdit: () => action('edit-pickup-summary')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Pickup Location')).toBeInTheDocument();
        await expect(canvas.getAllByRole('img').length).toBeGreaterThan(0);
        await expect(canvas.getAllByText(/Qty:/i)[0]).toBeInTheDocument();
    },
};

export const Summary: Story = {
    args: {
        cart: mockCart,
        productsByItemId: mockProductsByItemId,
        isEditing: false,
        onEdit: () => action('edit-pickup-summary')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryAllByText(/Qty:/i).length).toBe(0);
        await expect(canvas.getByText('Edit')).toBeInTheDocument();
    },
};

export const EmptyItems: Story = {
    args: {
        cart: { ...mockCart, productItems: [] },
        productsByItemId: mockProductsByItemId,
        isEditing: true,
        onEdit: () => action('edit-pickup-summary')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
    },
};

export const Mobile: Story = {
    ...Editing,
    args: { ...Editing.args },
    globals: { viewport: 'mobile2' },
    parameters: {
        docs: { description: { story: 'Mobile viewport scenario.' } },
    },
};

export const Desktop: Story = {
    args: {
        cart: mockCart,
        productsByItemId: mockProductsByItemId,
        isEditing: false,
        onEdit: () => action('edit-pickup-summary')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    globals: { viewport: 'desktop' },
    parameters: {
        docs: { description: { story: 'Desktop viewport scenario.' } },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Store Pickup Details')).toBeInTheDocument();
        await expect(canvas.getByText('Edit')).toBeInTheDocument();
    },
};
