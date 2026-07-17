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
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import ShippingMultiAddress from '../shipping-multi-address';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import BasketProvider from '@/providers/basket';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('shipping-multi-address-click');
        const logEdit = action('shipping-multi-address-edit');
        const logToggle = action('shipping-multi-address-toggle');

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
            } else if (label.toLowerCase().includes('ship') || label.toLowerCase().includes('deliver')) {
                logToggle({ label });
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

const mockProductItems: ShopperBasketsV2.schemas['ProductItem'][] = [
    {
        itemId: 'item-1',
        productId: 'product-1',
        productName: 'Test Product One',
        quantity: 2,
        price: 29.99,
    },
    {
        itemId: 'item-2',
        productId: 'product-2',
        productName: 'Test Product Two',
        quantity: 1,
        price: 49.99,
    },
    {
        itemId: 'item-3',
        productId: 'product-3',
        productName: 'Test Product Three',
        quantity: 3,
        price: 19.99,
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
];

/**
 * Basket provider decorator that provides product items to the component
 */
const BasketDecorator = (productItems: ShopperBasketsV2.schemas['ProductItem'][]) => {
    const Decorator = (Story: React.ComponentType) => {
        const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'storybook-basket',
            currency: 'USD',
            productItems,
        };

        return (
            <BasketProvider basket={mockBasket}>
                <Story />
            </BasketProvider>
        );
    };
    Decorator.displayName = 'BasketDecorator';
    return Decorator;
};

const mockProductItemsWithVariations: ShopperBasketsV2.schemas['ProductItem'][] = [
    {
        itemId: 'item-1',
        productId: 'product-1',
        productName: 'Test Product With Variations',
        quantity: 1,
        price: 29.99,
        variationValues: {
            color: 'red',
            size: 'medium',
        },
        variationAttributes: [
            {
                id: 'color',
                name: 'Color',
                values: [{ value: 'red', name: 'Red' }],
            },
            {
                id: 'size',
                name: 'Size',
                values: [{ value: 'medium', name: 'Medium' }],
            },
        ],
    },
];

const meta: Meta<typeof ShippingMultiAddress> = {
    component: ShippingMultiAddress,
    title: 'Extensions/Multiship/Shipping Multi Address',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
### ShippingMultiAddress Component

This component handles the multi-address shipping step of the checkout process - allowing customers to assign different shipping addresses to different products in their cart. It displays each product item with its own address selector.

**Key Features:**
- **Product List**: Displays all products from the basket with images, names, variations, quantities, and prices
- **Address Selection**: Each product has its own delivery address selector
- **Toggle Mode**: Allows switching back to single address mode
- **Filter Function**: Uses \`isDeliveryProductItem\` to filter which products should be displayed
- **Basket Integration**: Gets product items directly from the basket provider

**Dependencies:**
- \`@/providers/basket\`: Access to current basket data (provides product items)
- \`@/components/toggle-card\`: Toggle between edit and summary views
- \`@/lib/product/product-utils\`: Product variation display utilities
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
        isDeliveryProductItem: {
            control: false,
            description: 'Filter function to determine which product items should be included',
        },
        isEditing: {
            control: 'boolean',
            description: 'Whether this step is currently being edited (shows form view)',
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked',
        },
        handleToggleShippingAddressMode: {
            description: 'Callback function called when toggling between single and multi-address mode',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify all product names are rendered
        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
        expect(canvas.getByText('Test Product Two')).toBeInTheDocument();
        expect(canvas.getByText('Test Product Three')).toBeInTheDocument();

        // Verify delivery address selects are rendered for each product
        expect(canvas.getByTestId('delivery-address-select-item-1')).toBeInTheDocument();
        expect(canvas.getByTestId('delivery-address-select-item-2')).toBeInTheDocument();
        expect(canvas.getByTestId('delivery-address-select-item-3')).toBeInTheDocument();

        // Each select must have an accessible name (label association) for a11y
        expect(canvas.getAllByRole('combobox', { name: /delivery address/i })).toHaveLength(3);

        // Verify component structure
        expect(canvasElement).toBeInTheDocument();
    },
};

export const WithVariations: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItemsWithVariations),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Shows products with variation attributes (color, size, etc.) displayed correctly.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText('Test Product With Variations')).toBeInTheDocument();
        expect(canvas.getByText('Color: Red')).toBeInTheDocument();
        expect(canvas.getByText('Size: Medium')).toBeInTheDocument();
    },
};

export const CompletedState: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: false,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Shows the completed state with a summary view and edit button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // In completed state, should show summary view
        const buttons = canvas.queryAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0); // May have edit buttons

        expect(canvasElement).toBeInTheDocument();
    },
};

export const SingleProduct: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator([mockProductItems[0]]),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Shows the component with a single product item.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
        expect(canvas.getByTestId('delivery-address-select-item-1')).toBeInTheDocument();
        expect(canvas.getAllByRole('combobox', { name: /delivery address/i })).toHaveLength(1);
    },
};

export const LoadingState: Story = {
    args: {
        isLoading: true,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Shows the component in a loading state (simulated by component loading product data).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Component should still render product items even during loading
        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
    },
};

export const MobileView: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
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

        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};

export const TabletView: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
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

        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};

export const DesktopView: Story = {
    args: {
        isLoading: false,
        isDeliveryProductItem: () => true,
        isEditing: true,
        deliveryShipments: mockDeliveryShipments,
        onEdit: () => {
            action('edit-shipping-multi-address')();
        },
        handleToggleShippingAddressMode: () => {
            action('toggle-shipping-address-mode')();
        },
        onSubmit: () => action('submit-shipping-multi-address')(),
    },
    decorators: [
        BasketDecorator(mockProductItems),
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
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

        expect(canvas.getByText('Test Product One')).toBeInTheDocument();
        expect(canvasElement).toBeInTheDocument();
    },
};
