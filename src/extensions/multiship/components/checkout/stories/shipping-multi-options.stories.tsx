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
import { expect, within, waitFor } from 'storybook/test';
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import ShippingMultiOptions from '../shipping-multi-options';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('shipping-multi-options-click');
        const logEdit = action('shipping-multi-options-edit');
        const logSubmit = action('shipping-multi-options-submit');

        const handleClick = (event: MouseEvent) => {
            if (event.isTrusted === false) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            const interactive = target.closest('button, [role="button"], a, [role="link"]');
            if (!interactive || !root.contains(interactive)) return;

            if (interactive instanceof HTMLAnchorElement) {
                event.preventDefault();
            }

            const label = interactive.textContent?.trim() || interactive.getAttribute('aria-label') || '';

            if (label.toLowerCase().includes('edit')) {
                logEdit({ label });
            } else if (label.toLowerCase().includes('continue') || label.toLowerCase().includes('submit')) {
                logSubmit({ label });
            } else {
                logClick({ label });
            }
        };

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const mockAddress1: ShopperBasketsV2.schemas['OrderAddress'] = {
    addressId: 'addr-1',
    address1: '123 Main Street',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
    firstName: 'John',
    lastName: 'Doe',
};

const mockAddress2: ShopperBasketsV2.schemas['OrderAddress'] = {
    addressId: 'addr-2',
    address1: '456 Oak Avenue',
    city: 'Los Angeles',
    stateCode: 'CA',
    postalCode: '90001',
    countryCode: 'US',
    firstName: 'Jane',
    lastName: 'Smith',
};

const mockShipments: ShopperBasketsV2.schemas['Shipment'][] = [
    {
        shipmentId: 'shipment-1',
        shippingAddress: mockAddress1,
        productItems: [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product One',
                quantity: 2,
                price: 29.99,
            },
        ],
    },
    {
        shipmentId: 'shipment-2',
        shippingAddress: mockAddress2,
        productItems: [
            {
                itemId: 'item-2',
                productId: 'product-2',
                productName: 'Test Product Two',
                quantity: 1,
                price: 49.99,
            },
        ],
    },
];

const mockSingleShipment: ShopperBasketsV2.schemas['Shipment'][] = [
    {
        shipmentId: 'shipment-1',
        shippingAddress: mockAddress1,
        productItems: [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product One',
                quantity: 2,
                price: 29.99,
            },
        ],
    },
];

const mockShippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
    'shipment-1': {
        applicableShippingMethods: [
            {
                id: 'standard',
                name: 'Standard Shipping',
                description: 'Delivery in 5-7 business days',
                price: 0,
                c_estimatedArrivalTime: 'Dec 15-17',
            },
            {
                id: 'express',
                name: 'Express Shipping',
                description: 'Delivery in 2-3 business days',
                price: 14.99,
                c_estimatedArrivalTime: 'Dec 12-13',
            },
            {
                id: 'overnight',
                name: 'Overnight Shipping',
                description: 'Next business day delivery',
                price: 29.99,
                c_estimatedArrivalTime: 'Dec 11',
            },
        ],
        defaultShippingMethodId: 'standard',
    },
    'shipment-2': {
        applicableShippingMethods: [
            {
                id: 'standard',
                name: 'Standard Shipping',
                description: 'Delivery in 5-7 business days',
                price: 0,
                c_estimatedArrivalTime: 'Dec 15-17',
            },
            {
                id: 'express',
                name: 'Express Shipping',
                description: 'Delivery in 2-3 business days',
                price: 14.99,
                c_estimatedArrivalTime: 'Dec 12-13',
            },
        ],
        defaultShippingMethodId: 'standard',
    },
};

const mockShipmentsWithSelectedMethods: ShopperBasketsV2.schemas['Shipment'][] = [
    {
        shipmentId: 'shipment-1',
        shippingAddress: mockAddress1,
        shippingMethod: {
            id: 'express',
            name: 'Express Shipping',
            price: 14.99,
            c_estimatedArrivalTime: 'Dec 12-13',
        },
        productItems: [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product One',
                quantity: 2,
                price: 29.99,
            },
        ],
    },
    {
        shipmentId: 'shipment-2',
        shippingAddress: mockAddress2,
        shippingMethod: {
            id: 'standard',
            name: 'Standard Shipping',
            price: 0,
            c_estimatedArrivalTime: 'Dec 15-17',
        },
        productItems: [
            {
                itemId: 'item-2',
                productId: 'product-2',
                productName: 'Test Product Two',
                quantity: 1,
                price: 49.99,
            },
        ],
    },
];

const meta: Meta<typeof ShippingMultiOptions> = {
    component: ShippingMultiOptions,
    title: 'CHECKOUT/ShippingMultiOptions',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
### ShippingMultiOptions Component

This component handles the shipping method selection step for multi-address checkout - allowing customers to choose shipping methods for each shipment/destination. It displays shipping options grouped by shipment with pricing and estimated delivery times.

**Key Features:**
- **Multiple Shipments**: Displays shipping methods for each destination address separately
- **Method Selection**: Radio button groups for selecting shipping speed/method per shipment
- **Pricing Display**: Shows cost for each shipping method (including free shipping)
- **Estimated Delivery**: Displays arrival time estimates when available
- **Auto-Submit**: Automatically applies default shipping methods for returning customers
- **Summary View**: Displays selected methods in completed state
- **Loading States**: Shows loading spinner during data fetching

**Dependencies:**
- \`@/hooks/checkout/use-customer-profile\`: Access customer profile for auto-selection
- \`@/providers/basket\`: Access to current basket and shipment data
- \`@/components/toggle-card\`: Toggle between edit and summary views
- \`@/lib/customer/profile-utils\`: Default shipping method selection utilities
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    argTypes: {
        shipments: {
            control: 'object',
            description: 'Array of shipment data with addresses and product items',
        },
        shippingMethodsMap: {
            control: 'object',
            description: 'Map of available shipping methods by shipment ID',
        },
        isEditing: {
            control: 'boolean',
            description: 'Whether this step is currently being edited (shows form view)',
        },
        isCompleted: {
            control: 'boolean',
            description: 'Whether this step has been completed (shows summary view)',
        },
        isLoading: {
            control: 'boolean',
            description: 'Whether the component is in a loading state',
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked',
        },
        onSubmit: {
            description: 'Callback function called when the form is submitted',
        },
        actionData: {
            control: 'object',
            description: 'Error data from checkout actions',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify shipment headers are rendered
        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvas.getByText(/Shipment 2/i)).toBeInTheDocument();

        // Verify shipping addresses are shown
        expect(canvas.getByText(/123 Main Street/i)).toBeInTheDocument();
        expect(canvas.getByText(/456 Oak Avenue/i)).toBeInTheDocument();

        // Verify shipping methods are rendered (using getAllByText since multiple shipments have same method names)
        const standardShippingOptions = canvas.getAllByText('Standard Shipping');
        expect(standardShippingOptions.length).toBeGreaterThan(0);
        const expressShippingOptions = canvas.getAllByText('Express Shipping');
        expect(expressShippingOptions.length).toBeGreaterThan(0);
        expect(canvas.getByText('Overnight Shipping')).toBeInTheDocument();

        // Verify continue button is present
        const continueButton = canvas.getByRole('button', { name: /continue/i });
        expect(continueButton).toBeInTheDocument();
        expect(continueButton).not.toBeDisabled();
    },
};

export const WithSelectedMethods: Story = {
    args: {
        shipments: mockShipmentsWithSelectedMethods,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows shipments with pre-selected shipping methods.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvas.getByText(/Shipment 2/i)).toBeInTheDocument();

        // Wait for radio buttons to be rendered (async provider/data)
        await waitFor(
            () => {
                const radioButtons = canvas.getAllByRole('radio');
                expect(radioButtons.length).toBe(5);
            },
            { timeout: 10000 }
        );

        const expressRadioShipment1 = canvasElement.querySelector('#shipment-1-express');
        const standardRadioShipment2 = canvasElement.querySelector('#shipment-2-standard');
        expect(expressRadioShipment1).toBeInTheDocument();
        expect(standardRadioShipment2).toBeInTheDocument();
    },
};

export const CompletedState: Story = {
    args: {
        shipments: mockShipmentsWithSelectedMethods,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: false,
        isCompleted: true,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the completed state with a summary view displaying selected shipping methods.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // In completed state, should show summary view with addresses
        expect(canvas.getByText(/123 Main Street/i)).toBeInTheDocument();
        expect(canvas.getByText(/456 Oak Avenue/i)).toBeInTheDocument();

        // Should show selected method names
        expect(canvas.getByText(/Express Shipping/i)).toBeInTheDocument();
        expect(canvas.getByText(/Standard Shipping/i)).toBeInTheDocument();

        expect(canvasElement).toBeInTheDocument();
    },
};

export const LoadingState: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: true,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component in a loading state with disabled submit button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Submit button is disabled during loading (label may be "Saving...", "Continue", or locale equivalent)
        const submitButton = await waitFor(
            () => canvas.getByRole('button', { name: /saving|continue|salvataggio|no methods/i }),
            { timeout: 5000 }
        );
        expect(submitButton).toBeDisabled();
    },
};

export const SingleShipment: Story = {
    args: {
        shipments: mockSingleShipment,
        shippingMethodsMap: {
            'shipment-1': mockShippingMethodsMap['shipment-1'],
        },
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component with a single shipment (only one destination).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await waitFor(
            () => {
                expect(canvas.queryByText(/Shipment 1/i)).not.toBeInTheDocument();
                expect(canvas.queryByText(/Shipment 2/i)).not.toBeInTheDocument();
                expect(canvas.getByText('Standard Shipping')).toBeInTheDocument();
                expect(canvas.getByText('Express Shipping')).toBeInTheDocument();
            },
            { timeout: 5000 }
        );
    },
};

export const NoShipments: Story = {
    args: {
        shipments: [],
        shippingMethodsMap: {},
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component when no shipments are available (empty basket or no addresses set).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await waitFor(
            () => {
                expect(canvas.getByText(/no shipments available|enter address first/i)).toBeInTheDocument();
                const continueButton = canvas.getByRole('button');
                expect(continueButton).toBeDisabled();
            },
            { timeout: 5000 }
        );
    },
};

export const NoShippingMethods: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: {
            'shipment-1': {
                applicableShippingMethods: [],
            },
            'shipment-2': {
                applicableShippingMethods: [],
            },
        },
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component when no shipping methods are available for the destinations.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Should show shipment headers
        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvas.getByText(/Shipment 2/i)).toBeInTheDocument();

        // Should show no methods available messages
        const noMethodsMessages = canvas.getAllByText(/no.*methods.*available/i);
        expect(noMethodsMessages.length).toBeGreaterThan(0);

        // Continue button should be disabled
        const continueButton = canvas.getByRole('button');
        expect(continueButton).toBeDisabled();
    },
};

export const FreeShipping: Story = {
    args: {
        shipments: mockSingleShipment,
        shippingMethodsMap: {
            'shipment-1': {
                applicableShippingMethods: [
                    {
                        id: 'free-standard',
                        name: 'Free Standard Shipping',
                        description: 'Free delivery in 5-7 business days',
                        price: 0,
                        c_estimatedArrivalTime: 'Dec 15-17',
                    },
                ],
                defaultShippingMethodId: 'free-standard',
            },
        },
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component with only free shipping available.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText('Free Standard Shipping')).toBeInTheDocument();
        // Should show "FREE" instead of price
        expect(canvas.getByText('FREE')).toBeInTheDocument();
    },
};

export const MobileView: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component optimized for mobile viewport.',
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};

export const TabletView: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component optimized for tablet viewport.',
            },
        },
    },
    globals: {
        viewport: 'tablet',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};

export const DesktopView: Story = {
    args: {
        shipments: mockShipments,
        shippingMethodsMap: mockShippingMethodsMap,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the component optimized for desktop viewport.',
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText(/Shipment 1/i)).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};

const mockShipmentsWithDeliveryWindow: ShopperBasketsV2.schemas['Shipment'][] = [
    {
        shipmentId: 'shipment-1',
        shippingAddress: mockAddress1,
        productItems: [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product One',
                quantity: 1,
                price: 29.99,
            },
        ],
    },
];

const mockShippingMethodsMapWithDeliveryWindow: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
    'shipment-1': {
        applicableShippingMethods: [
            {
                id: 'standard',
                name: 'Standard Shipping',
                description: 'Delivery in 5-7 business days',
                price: 0,
                // deliveryWindow is preferred; c_estimatedArrivalTime is the fallback and should be ignored here.
                deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                c_estimatedArrivalTime: 'Dec 15-17',
            },
            {
                id: 'express',
                name: 'Express Shipping',
                description: 'Delivery in 2-3 business days',
                price: 14.99,
                // No deliveryWindow — falls back to c_estimatedArrivalTime.
                c_estimatedArrivalTime: 'Dec 12-13',
            },
        ],
        defaultShippingMethodId: 'standard',
    },
};

export const WithDeliveryWindow: Story = {
    args: {
        shipments: mockShipmentsWithDeliveryWindow,
        shippingMethodsMap: mockShippingMethodsMapWithDeliveryWindow,
        isEditing: true,
        isCompleted: false,
        isLoading: false,
        onEdit: () => {
            action('edit-shipping-multi-options')();
        },
        onSubmit: (formData: FormData) => {
            action('submit-shipping-multi-options')(Object.fromEntries(formData));
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'A method with a structured deliveryWindow shows the formatted date range, while a method without one falls back to c_estimatedArrivalTime.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Standard uses the formatted delivery window, not its c_estimatedArrivalTime.
        expect(canvas.getByText(/30.*Apr.*2026|Apr 30.*2026/)).toBeInTheDocument();
        expect(canvas.queryByText(/Dec 15-17/i)).not.toBeInTheDocument();

        // Express has no delivery window, so it falls back to c_estimatedArrivalTime.
        expect(canvas.getByText(/Dec 12-13/i)).toBeInTheDocument();
    },
};
