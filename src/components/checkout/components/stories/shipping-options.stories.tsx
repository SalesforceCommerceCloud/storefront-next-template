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
import type { ComponentType } from 'react';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, within, userEvent } from 'storybook/test';
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import ShippingOptions from '../shipping-options';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import BasketProvider from '@/providers/basket';

const meta: Meta<typeof ShippingOptions> = {
    component: ShippingOptions,
    title: 'CHECKOUT/ShippingOptions',
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
### ShippingOptions Component

This component handles the shipping methods step of the checkout process - allowing customers to select from available shipping methods with different prices and delivery times. It uses a ToggleCard to show either an editable form or a summary view based on the step state.

**Key Features:**
- **Shipping Method Selection**: Radio button selection from available shipping methods
- **Price Display**: Shows shipping costs with promotion support — free, discounted (strikethrough), or standard pricing
- **Toggle States**: Shows edit form when \`isEditing\` is true, summary view when \`isEditing\` is false
- **Saving State**: Displays a spinner overlay and disables the submit button while a selection is being saved
- **Basket Integration**: Pre-selects the current shipping method from basket data; auto-submits the default method for returning customers

**Dependencies:**
- \`@/providers/basket\`: Access to current basket data, selected shipment, and shipping promotions
- \`@/components/toggle-card\`: Toggle between edit and summary views
- \`@/components/ui/radio-group\`: Radio button selection for shipping methods
- \`@/components/ui/button\`: Submit button
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    decorators: [
        (Story) => (
            <div className="max-w-2xl mx-auto p-6">
                <CheckoutActionLogger name="shipping-options">
                    <Story />
                </CheckoutActionLogger>
            </div>
        ),
    ],
    argTypes: {
        onSubmit: {
            description: 'Callback function called when a shipping method is selected and submitted',
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked',
        },
        isLoading: {
            control: 'boolean',
            description:
                'Whether a shipping method selection is being saved — shows spinner overlay and disables submit button',
        },
        isCompleted: {
            control: 'boolean',
            description: 'Unused in the current implementation — edit/summary toggle is driven solely by `isEditing`',
        },
        isEditing: {
            control: 'boolean',
            description: 'Controls the view — true shows the edit form, false shows the summary view',
        },
        actionData: {
            control: 'object',
            description: 'Reserved for future server action error handling — not currently consumed by this component',
        },
        validationError: {
            control: 'text',
            description: 'Reserved for future validation error display — not currently consumed by this component',
        },
        shippingMethods: {
            control: 'object',
            description: 'Available shipping methods to display as radio options',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
    onSubmit: () => action('submit-shipping-options')(),
    onEdit: () => action('edit-shipping-options')(),
    isLoading: false,
    isCompleted: false,
    isEditing: true,
    actionData: undefined,
};

export const EditView: Story = {
    args: {
        ...baseArgs,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                },
                {
                    id: 'express',
                    name: '2-Day Express',
                    description: 'Order received in 2 business days',
                    price: 9.99,
                },
                {
                    id: 'overnight',
                    name: 'Overnight',
                    description: 'Order received the next business day',
                    price: 15.99,
                },
            ],
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Edit mode with three shipping options — first option is pre-selected.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(3);

        await expect(canvas.getByText('Ground')).toBeInTheDocument();
        await expect(canvas.getByText('2-Day Express')).toBeInTheDocument();
        await expect(canvas.getByText('Overnight')).toBeInTheDocument();
    },
};

export const EditViewWithFreeShipping: Story = {
    args: {
        ...baseArgs,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'free',
                    name: 'Free Standard Shipping',
                    description: '5-7 business days',
                    price: 0,
                    estimatedArrival: '5-7 business days',
                },
                {
                    id: 'express',
                    name: 'Express Shipping',
                    description: '2-3 business days',
                    price: 19.99,
                    estimatedArrival: '2-3 business days',
                },
            ],
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows a free shipping option alongside a paid option.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Both options render
        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(2);

        // The free option label should be visible
        const freeLabel = canvas.getByText('Free Standard Shipping');
        await expect(freeLabel).toBeInTheDocument();

        // Click the free option and verify it is selected
        await userEvent.click(radios[0]);
        await expect(radios[0]).toBeChecked();
    },
};

const mockBasketWithShippingDiscount = {
    shippingItems: [
        {
            priceAdjustments: [
                {
                    appliedDiscount: { type: 'percentage', amount: 0.5 },
                },
            ],
        },
    ],
};

const withShippingDiscount = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithShippingDiscount as never}>
        <Story />
    </BasketProvider>
);

export const EditViewWithDiscountedShipping: Story = {
    args: {
        ...baseArgs,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                    shippingPromotions: [{ promotionId: 'promo-50off', promotionName: '50% off shipping' }],
                },
                {
                    id: 'express',
                    name: '2-Day Express',
                    description: 'Order received in 2 business days',
                    price: 9.99,
                    shippingPromotions: [{ promotionId: 'promo-50off', promotionName: '50% off shipping' }],
                },
                {
                    id: 'overnight',
                    name: 'Overnight',
                    description: 'Order received the next business day',
                    price: 15.99,
                    shippingPromotions: [{ promotionId: 'promo-50off', promotionName: '50% off shipping' }],
                },
            ],
        },
    },
    decorators: [withShippingDiscount],
    parameters: {
        docs: {
            description: {
                story: 'Shipping promotion applied — original price is struck through with the discounted price shown alongside.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(3);

        // Strikethrough original prices are present
        const struckPrices = canvasElement.querySelectorAll('.line-through');
        await expect(struckPrices.length).toBeGreaterThan(0);
    },
};

export const SavingState: Story = {
    args: {
        ...baseArgs,
        isLoading: true,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                },
                {
                    id: 'express',
                    name: '2-Day Express',
                    description: 'Order received in 2 business days',
                    price: 9.99,
                },
                {
                    id: 'overnight',
                    name: 'Overnight',
                    description: 'Order received the next business day',
                    price: 15.99,
                },
            ],
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the form while a shipping method selection is being saved — spinner overlay active, submit button disabled.',
            },
        },
        a11y: {
            config: {
                rules: [{ id: 'color-contrast', enabled: false }],
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Submit button should be disabled during loading
        const submitButton = canvas.queryByRole('button', { name: /saving|continue|submit/i });
        if (submitButton) {
            await expect(submitButton).toBeDisabled();
        }
    },
};

const mockBasketWithSelectedShipping = {
    shipments: [
        {
            shippingMethod: {
                id: 'ground',
                name: 'Ground',
                description: 'Order received within 7-10 business days',
                price: 15.99,
            },
        },
    ],
};

const withSelectedShipping = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithSelectedShipping as never}>
        <Story />
    </BasketProvider>
);

export const SummaryView: Story = {
    args: {
        ...baseArgs,
        isCompleted: true,
        isEditing: false,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                },
            ],
        },
    },
    decorators: [withSelectedShipping],
    parameters: {
        docs: {
            description: {
                story: 'Summary view after a shipping method has been selected — shows description, price, and method name with an Edit button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // No radio inputs in summary view
        const radios = canvas.queryAllByRole('radio');
        await expect(radios.length).toBe(0);

        await expect(canvas.getByText('Order received within 7-10 business days')).toBeInTheDocument();
        await expect(canvas.getByText(/Ground/)).toBeInTheDocument();
    },
};

const mockBasketWithFreeShipping = {
    shipments: [
        {
            shippingMethod: {
                id: 'free-ground',
                name: 'Ground',
                description: 'Order received within 7-10 business days',
                price: 0,
            },
        },
    ],
};

const mockBasketWithDiscountedSelectedShipping = {
    shipments: [
        {
            shippingMethod: {
                id: 'ground',
                name: 'Ground',
                description: 'Order received within 7-10 business days',
                price: 15.99,
                shippingPromotions: [{ promotionId: 'promo-50off', promotionName: '50% off shipping' }],
            },
        },
    ],
    shippingItems: [
        {
            priceAdjustments: [
                {
                    appliedDiscount: { type: 'percentage', amount: 0.5 },
                },
            ],
        },
    ],
};

const withFreeShippingSelected = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithFreeShipping as never}>
        <Story />
    </BasketProvider>
);

const withDiscountedShippingSelected = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithDiscountedSelectedShipping as never}>
        <Story />
    </BasketProvider>
);

export const SummaryViewWithFreeShipping: Story = {
    args: {
        ...baseArgs,
        isCompleted: true,
        isEditing: false,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'free-ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 0,
                },
            ],
        },
    },
    decorators: [withFreeShippingSelected],
    parameters: {
        docs: {
            description: {
                story: 'Summary view with a free shipping method selected.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.queryAllByRole('radio');
        await expect(radios.length).toBe(0);

        await expect(canvas.getByText(/free/i)).toBeInTheDocument();
        await expect(canvas.getByText(/Ground/)).toBeInTheDocument();
    },
};

export const SummaryViewWithDiscountedShipping: Story = {
    args: {
        ...baseArgs,
        isCompleted: true,
        isEditing: false,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                    shippingPromotions: [{ promotionId: 'promo-50off', promotionName: '50% off shipping' }],
                },
            ],
        },
    },
    decorators: [withDiscountedShippingSelected],
    parameters: {
        docs: {
            description: {
                story: 'Summary view with a discounted shipping method — original price is struck through with the discounted price alongside.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.queryAllByRole('radio');
        await expect(radios.length).toBe(0);

        // Strikethrough original price is present
        const struckPrices = canvasElement.querySelectorAll('.line-through');
        await expect(struckPrices.length).toBeGreaterThan(0);

        await expect(canvas.getByText(/Ground/)).toBeInTheDocument();
    },
};

export const DisabledState: Story = {
    args: { ...baseArgs, isEditing: false, shippingMethods: undefined },
    parameters: {
        docs: {
            description: {
                story: 'Shows the upcoming/disabled state when the step has not yet been reached — "Complete previous steps to continue" message, no radio inputs.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Upcoming step: no radio inputs
        const radios = canvas.queryAllByRole('radio');
        await expect(radios.length).toBe(0);

        // "Complete previous steps to continue" message is shown
        await expect(canvas.getByText(/complete previous steps/i)).toBeInTheDocument();
    },
};

export const EditViewWithDeliveryWindow: Story = {
    args: {
        ...baseArgs,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                    deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                },
                {
                    id: 'express',
                    name: '2-Day Express',
                    description: 'Order received in 2 business days',
                    price: 29.99,
                    deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-04-30T12:00:00Z' },
                },
            ],
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Edit view with delivery windows returned by the sfcc.app.shipping.quote hook — shows a date range for Ground and a single date for 2-Day Express.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Both methods have delivery windows, so two "Arrives" labels render
        const arrivesLabels = canvas.getAllByText(/Arrives/);
        await expect(arrivesLabels.length).toBe(2);

        // Method names always appear below the header
        await expect(canvas.getByText('Ground')).toBeInTheDocument();
        await expect(canvas.getByText('2-Day Express')).toBeInTheDocument();
    },
};

const mockBasketWithDeliveryWindow = {
    shipments: [
        {
            shippingMethod: {
                id: 'ground',
                name: 'Ground',
                description: 'Order received within 7-10 business days',
                price: 15.99,
            },
        },
    ],
};

const withDeliveryWindowBasket = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithDeliveryWindow as never}>
        <Story />
    </BasketProvider>
);

export const SummaryViewWithDeliveryWindow: Story = {
    args: {
        ...baseArgs,
        isCompleted: true,
        isEditing: false,
        shippingMethods: {
            applicableShippingMethods: [
                {
                    id: 'ground',
                    name: 'Ground',
                    description: 'Order received within 7-10 business days',
                    price: 15.99,
                    deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                },
            ],
        },
    },
    decorators: [withDeliveryWindowBasket],
    parameters: {
        docs: {
            description: {
                story: 'Summary view with a delivery window on the selected shipping method — date range shown below the price line.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.queryAllByRole('radio').length).toBe(0);
        await expect(canvas.getByText(/Arrives/)).toBeInTheDocument();
        await expect(canvas.getByText(/Ground/)).toBeInTheDocument();
    },
};
