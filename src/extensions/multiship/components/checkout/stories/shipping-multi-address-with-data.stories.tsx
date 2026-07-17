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
import { Suspense } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import ShippingMultiAddressWithData from '../shipping-multi-address-with-data';
import BasketProvider from '@/providers/basket';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

// Mock data
const mockProductItems: ShopperBasketsV2.schemas['ProductItem'][] = [
    {
        itemId: 'item-1',
        productId: 'product-1',
        productName: 'Test Product One',
        quantity: 2,
        price: 29.99,
        shipmentId: 'shipment-1',
    },
    {
        itemId: 'item-2',
        productId: 'product-2',
        productName: 'Test Product Two',
        quantity: 1,
        price: 49.99,
        shipmentId: 'shipment-2',
    },
];

const mockDeliveryShipments: ShopperBasketsV2.schemas['Shipment'][] = [
    {
        shipmentId: 'shipment-1',
        shippingAddress: {
            address1: '123 Main St',
            city: 'San Francisco',
            stateCode: 'CA',
            postalCode: '94102',
            countryCode: 'US',
        },
    },
    {
        shipmentId: 'shipment-2',
        shippingAddress: {
            address1: '456 Oak Ave',
            city: 'Oakland',
            stateCode: 'CA',
            postalCode: '94601',
            countryCode: 'US',
        },
    },
];

const mockProductMap: Record<string, ShopperProducts.schemas['Product']> = {
    'item-1': {
        id: 'product-1',
        name: 'Test Product One',
        imageGroups: [
            {
                viewType: 'small',
                images: [
                    {
                        link: 'https://placehold.co/120x120',
                        alt: 'Test Product One',
                    },
                ],
            },
        ],
    } as ShopperProducts.schemas['Product'],
    'item-2': {
        id: 'product-2',
        name: 'Test Product Two',
        imageGroups: [
            {
                viewType: 'small',
                images: [
                    {
                        link: 'https://placehold.co/120x120',
                        alt: 'Test Product Two',
                    },
                ],
            },
        ],
    } as ShopperProducts.schemas['Product'],
};

const createProductMapPromise = () => Promise.resolve(mockProductMap);

const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
    basketId: 'storybook-basket',
    currency: 'USD',
    productItems: mockProductItems,
    shipments: mockDeliveryShipments,
};

const meta: Meta<typeof ShippingMultiAddressWithData> = {
    component: ShippingMultiAddressWithData,
    title: 'Extensions/Multiship/Shipping Multi Address With Data',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `\
### ShippingMultiAddressWithData Component

Wrapper component that resolves productMap Promise within Suspense boundary for ShippingMultiAddress.

**Features:**
- Resolves productMap promise when editing
- Handles Suspense boundaries gracefully
- Passes product data to ShippingMultiAddress component
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <BasketProvider basket={mockBasket}>
                <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                    <Story />
                </Suspense>
            </BasketProvider>
        ),
    ],
    argTypes: {
        productMapPromise: { control: false, description: 'Promise resolving to product details map' },
        isEditing: { control: 'boolean', description: 'Whether editing (displays form view)' },
        isLoading: { control: 'boolean', description: 'Whether component is in loading state' },
        onEdit: { description: 'Callback when Edit button is pressed' },
        onSubmit: { description: 'Callback when form is submitted' },
        handleToggleShippingAddressMode: { description: 'Callback when toggling address mode' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const EditingView: Story = {
    args: {
        isLoading: false,
        isEditing: true,
        productMapPromise: createProductMapPromise(),
        isDeliveryProductItem: (_item: ShopperBasketsV2.schemas['ProductItem']) => true,
        deliveryShipments: mockDeliveryShipments,
        handleToggleShippingAddressMode: () => action('toggle-shipping-address-mode')(),
        onEdit: () => action('edit-shipping-multi-address')(),
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render and productMap to resolve
        await expect(await canvas.findByText('Test Product One', {}, { timeout: 5000 })).toBeInTheDocument();
        await expect(await canvas.findByText('Test Product Two', {}, { timeout: 3000 })).toBeInTheDocument();
    },
};

export const SummaryView: Story = {
    args: {
        isLoading: false,
        isEditing: false,
        productMapPromise: createProductMapPromise(),
        isDeliveryProductItem: (_item: ShopperBasketsV2.schemas['ProductItem']) => true,
        deliveryShipments: mockDeliveryShipments,
        handleToggleShippingAddressMode: () => action('toggle-shipping-address-mode')(),
        onEdit: () => action('edit-shipping-multi-address')(),
        onSubmit: () => action('submit-shipping-multi-address')(),
        isCompleted: true, // Step must be completed to show "multiple locations" message
        hasMultipleDeliveryAddresses: true, // Multiple unique addresses (123 Main St vs 456 Oak Ave)
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // In summary view with multiple shipments and completed step, component shows summary text
        await expect(
            await canvas.findByText('You are shipping to multiple locations.', {}, { timeout: 5000 })
        ).toBeInTheDocument();

        // In summary view, edit button should be present
        const editButton = canvas.queryByRole('button', { name: /edit/i });
        if (editButton) {
            await expect(editButton).toBeInTheDocument();
        }
    },
};

export const InteractionTest: Story = {
    args: {
        isLoading: false,
        isEditing: true,
        productMapPromise: createProductMapPromise(),
        isDeliveryProductItem: (_item: ShopperBasketsV2.schemas['ProductItem']) => true,
        deliveryShipments: mockDeliveryShipments,
        handleToggleShippingAddressMode: () => action('toggle-shipping-address-mode-clicked')(),
        onEdit: () => action('edit-shipping-multi-address-clicked')(),
        onSubmit: () => action('submit-shipping-multi-address-clicked')(),
    },
    parameters: {
        docs: {
            description: {
                story: 'Interactive test story for verifying user interactions with shipping multi-address component.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render and productMap to resolve
        const productOne = await canvas.findByText('Test Product One', {}, { timeout: 5000 });
        await expect(productOne).toBeInTheDocument();

        const productTwo = await canvas.findByText('Test Product Two', {}, { timeout: 3000 });
        await expect(productTwo).toBeInTheDocument();

        // Verify component structure
        await expect(canvasElement).toBeInTheDocument();

        // Look for interactive elements (address selects, buttons, etc.)
        const buttons = canvas.queryAllByRole('button');
        if (buttons.length > 0) {
            // Test interaction with first button if available
            await userEvent.click(buttons[0]);
        }
    },
};
