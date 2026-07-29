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
import CheckoutPickupWithData from '../checkout-pickup-with-data';
import CheckoutProvider from '@/components/checkout/utils/checkout-context';
import PickupProvider from '@/extensions/bopis/context/pickup-context';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

// Mock data
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

const mockCart: ShopperBasketsV2.schemas['Basket'] = {
    basketId: 'test-basket',
    currency: 'USD',
    shipments: [{ shipmentId: 'S1', c_fromStoreId: mockStore.id }],
    productItems: [
        {
            itemId: 'item-1',
            productId: 'product-1',
            productName: 'Test Product One',
            quantity: 1,
            price: 29.99,
            shipmentId: 'S1',
        },
    ],
};

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
};

const createProductMapPromise = () => Promise.resolve(mockProductMap);

const meta: Meta<typeof CheckoutPickupWithData> = {
    component: CheckoutPickupWithData,
    title: 'Extensions/BOPIS/Checkout Pickup With Data',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `\
### CheckoutPickupWithData Component

Wrapper component that resolves productMap Promise within Suspense boundary for CheckoutPickup.
Waits for shipping defaults to be set before rendering.

**Features:**
- Resolves productMap promise when editing
- Waits for shippingDefaultSet promise before rendering
- Handles Suspense boundaries gracefully
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <PickupProvider
                initialPickupStores={
                    new Map([
                        [
                            mockStore.id,
                            {
                                id: mockStore.id,
                                name: mockStore.name,
                                address1: mockStore.address1,
                                city: mockStore.city,
                                stateCode: mockStore.stateCode,
                                postalCode: mockStore.postalCode,
                                countryCode: mockStore.countryCode,
                                phone: mockStore.phone,
                                email: mockStore.email,
                            } as any,
                        ],
                    ])
                }>
                <CheckoutProvider customerProfile={undefined} shippingDefaultSet={Promise.resolve(undefined)}>
                    <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                        <Story />
                    </Suspense>
                </CheckoutProvider>
            </PickupProvider>
        ),
    ],
    argTypes: {
        cart: { control: 'object', description: 'Basket/cart object with shipments/productItems' },
        productMapPromise: { control: false, description: 'Promise resolving to product details map' },
        isEditing: { control: 'boolean', description: 'Whether editing (displays items)' },
        onEdit: { description: 'Callback when Edit button is pressed' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SummaryView: Story = {
    args: {
        cart: mockCart,
        productMapPromise: createProductMapPromise(),
        isEditing: false,
        onEdit: () => action('edit-pickup')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render (after shippingDefaultSet resolves)
        await expect(await canvas.findByText(/pick up|store pickup/i, {}, { timeout: 5000 })).toBeInTheDocument();

        // Verify edit button is present in summary view
        const editButton = await canvas.findByRole('button', { name: /edit/i }, { timeout: 3000 });
        await expect(editButton).toBeInTheDocument();

        // Test clicking edit button
        await userEvent.click(editButton);
    },
};

export const EditingView: Story = {
    args: {
        cart: mockCart,
        productMapPromise: createProductMapPromise(),
        isEditing: true,
        onEdit: () => action('edit-pickup')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render and productMap to resolve
        await expect(await canvas.findByText(/pick up|store pickup/i, {}, { timeout: 5000 })).toBeInTheDocument();

        // In editing mode, product details should be visible
        await expect(await canvas.findByText('Test Product One', {}, { timeout: 3000 })).toBeInTheDocument();
    },
};

export const InteractionTest: Story = {
    args: {
        cart: mockCart,
        productMapPromise: createProductMapPromise(),
        isEditing: false,
        onEdit: () => action('edit-pickup-clicked')(),
        onContinue: () => action('continue-pickup')(),
        continueButtonLabel: 'Continue',
    },
    parameters: {
        docs: {
            description: {
                story: 'Interactive test story for verifying user interactions with checkout pickup component.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render
        const pickupTitle = await canvas.findByText(/pick up|store pickup/i, {}, { timeout: 5000 });
        await expect(pickupTitle).toBeInTheDocument();

        // Find and click the edit button
        const editButton = await canvas.findByRole('button', { name: /edit/i }, { timeout: 3000 });
        await expect(editButton).toBeInTheDocument();
        await userEvent.click(editButton);

        // Verify component structure
        await expect(canvasElement).toBeInTheDocument();
    },
};
