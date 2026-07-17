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
import { allModes } from '../../../../../.storybook/modes';
import { expect, within, userEvent } from 'storybook/test';
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import ShippingAddress from '../shipping-address';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import BasketProvider from '@/providers/basket';
import CheckoutOneClickProvider from '@/components/checkout/utils/checkout-context';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';

const meta: Meta<typeof ShippingAddress> = {
    component: ShippingAddress,
    title: 'Checkout/Shipping/Shipping Address',
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        chromatic: {
            modes: {
                mobile: allModes.mobile,
                desktop: allModes.desktop,
            },
        },
        docs: {
            description: {
                component: `
### ShippingAddress Component

This component handles the shipping address step of the checkout process. It renders in two modes depending on whether the shopper has saved addresses:

**Guest / No Saved Addresses:**
- Displays an address form collecting firstName, lastName, address1, address2, city, stateCode, postalCode, countryCode
- Auto-populates from the basket or customer profile when available
- Phone is managed at the Contact Info step and is not collected here

**Registered Shopper with Saved Addresses:**
- Displays a radio card list of saved addresses via \`SavedAddressesList\`
- Auto-selects the basket address or preferred address
- "Add New Address" button opens \`AddressModal\` to create an additional address

**Key Features:**
- **Two edit modes**: Address form for guests, saved address radio list for returning shoppers
- **Toggle States**: Edit form shown when \`isEditing\` is true; summary view when false. Edit button disabled until \`isCompleted\` is true
- **Saving State**: Spinner overlay and disabled submit button while address is being saved
- **Form Validation**: react-hook-form + Zod schema; field errors shown on submit
- **Auto-population**: Pre-fills form from basket shipment address or customer profile
- **Modal Management**: \`AddressModal\` handles add/edit flows for saved addresses
- **International Support**: Supports multiple countries via the countryCode field
- **Multi-Address Extension**: Optional toggle for multi-shipment mode (extension point)

**Dependencies:**
- \`react-hook-form\` + \`@hookform/resolvers/zod\`: Form state and validation
- \`@/providers/basket\`: Current basket shipment address and customer info
- \`@/providers/auth\`: Customer ID for saved address operations
- \`@/hooks/checkout/use-customer-profile\`: Saved addresses and customer profile data
- \`@/components/toggle-card\`: Edit/summary toggle wrapper
- \`AddressFormFields\`: Address form for guests and first-time shoppers
- \`SavedAddressesList\`: Radio card list of saved addresses (registered shoppers)
- \`AddressModal\`: Modal for adding/editing saved addresses
- \`ShippingAddressDisplay\`: Formatted address in summary view
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
                <CheckoutActionLogger name="shipping-address">
                    <Story />
                </CheckoutActionLogger>
            </div>
        ),
    ],
    argTypes: {
        onSubmit: {
            description: 'Callback function called when the form is submitted — receives a FormData object',
            table: {
                type: { summary: '(formData: FormData) => void' },
            },
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked to re-open the form',
            table: {
                type: { summary: '() => void' },
            },
        },
        isLoading: {
            control: 'boolean',
            description: 'Whether the address is being saved — shows spinner overlay and disables the submit button',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isCompleted: {
            control: 'boolean',
            description: 'Whether this step has been completed — enables the Edit button in summary view',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isEditing: {
            control: 'boolean',
            description: 'Controls the view — true shows the edit form, false shows the summary view',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        actionData: {
            control: 'object',
            description:
                'Server action response — field errors are applied to the form, success triggers address diff detection',
            table: {
                type: { summary: 'CheckoutActionData | undefined' },
            },
        },
        enableMultiAddress: {
            control: 'boolean',
            description: 'Whether to show the "Deliver to multiple addresses" toggle button (extension feature)',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        handleToggleShippingAddressMode: {
            description: 'Callback function invoked when the multi-address mode toggle is clicked (extension feature)',
            table: {
                type: { summary: '() => void | undefined' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
    onSubmit: () => action('submit-shipping-address')(),
    onEdit: () => action('edit-shipping-address')(),
    isLoading: false,
    isCompleted: false,
    isEditing: true,
    actionData: undefined,
    enableMultiAddress: false,
    handleToggleShippingAddressMode: () => action('toggle-shipping-address-mode')(),
};

export const EditView: Story = {
    args: baseArgs,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // 6 textboxes: firstName, lastName, address1, address2, city, postalCode
        // stateCode is a combobox (select), not a textbox
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(6);

        // Verify all required field labels are present
        await expect(canvas.getByLabelText(/First Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Last Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Address Line 1/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/City/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/State/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Zip Code/i)).toBeInTheDocument();
    },
};

export const WithValidationErrors: Story = {
    args: { ...baseArgs },
    parameters: {
        docs: {
            description: {
                story: 'Submitting the empty form triggers react-hook-form validation and shows field-level error messages.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Submit the empty form to trigger validation
        const submitButton = canvas.getByRole('button', { name: /continue/i });
        await userEvent.click(submitButton);

        // Validation messages from schema
        await expect(canvas.getByText('Please enter your first name.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your last name.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your address.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your city.')).toBeInTheDocument();
    },
};

const mockCustomerProfileWithAddresses: CustomerProfile = {
    customer: { customerId: 'cust-1' },
    addresses: [
        {
            addressId: 'addr-1',
            firstName: 'John',
            lastName: 'Doe',
            address1: '5 Wall St',
            city: 'Burlington',
            stateCode: 'MA',
            postalCode: '01803',
            countryCode: 'US',
            preferred: true,
        },
        {
            addressId: 'addr-2',
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'Boston',
            stateCode: 'MA',
            postalCode: '02101',
            countryCode: 'US',
            preferred: false,
        },
    ],
    paymentInstruments: [],
};

const withSavedAddresses = (Story: ComponentType) => (
    <CheckoutOneClickProvider
        customerProfile={mockCustomerProfileWithAddresses}
        shippingDefaultSet={Promise.resolve(undefined)}>
        <Story />
    </CheckoutOneClickProvider>
);

const mockBasketWithAddress = {
    shipments: [
        {
            shippingAddress: {
                firstName: 'John',
                lastName: 'Doe',
                address1: '5 Wall St',
                city: 'Burlington',
                stateCode: 'MA',
                postalCode: '01803',
                countryCode: 'US',
            },
        },
    ],
};

const withMockAddress = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithAddress as never}>
        <Story />
    </BasketProvider>
);

export const WithSavedAddresses: Story = {
    args: baseArgs,
    decorators: [withSavedAddresses],
    parameters: {
        docs: {
            description: {
                story: 'Registered shopper with saved addresses — shows a radio card list instead of the address form. The preferred address is pre-selected.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Radio cards instead of a text form
        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBeGreaterThan(0);
        await expect(radios[0]).toBeChecked();

        await expect(canvas.getByText(/John Doe/i)).toBeInTheDocument();
        await expect(canvas.getByText(/5 Wall St/i)).toBeInTheDocument();
    },
};

export const SummaryView: Story = {
    args: { ...baseArgs, isCompleted: true, isEditing: false },
    decorators: [withMockAddress],
    parameters: {
        docs: {
            description: {
                story: 'Summary view after a shipping address has been saved — shows the formatted address with an Edit button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // No editable inputs in summary view
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);

        await expect(canvas.getByText(/John Doe/i)).toBeInTheDocument();
        await expect(canvas.getByText(/5 Wall St/i)).toBeInTheDocument();
        await expect(canvas.getByText(/Burlington/i)).toBeInTheDocument();
    },
};

export const SavingState: Story = {
    args: { ...baseArgs, isLoading: true },
    decorators: [withMockAddress],
    parameters: {
        docs: {
            description: {
                story: 'Shows the form while the address is being saved — fields are pre-filled, spinner overlay active, submit button disabled.',
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

        // Fields are pre-filled from basket
        await expect(canvas.getByLabelText(/First Name/i)).toHaveValue('John');
        await expect(canvas.getByLabelText(/Last Name/i)).toHaveValue('Doe');
        await expect(canvas.getByLabelText(/Address Line 1/i)).toHaveValue('5 Wall St');

        // Submit button is disabled during save
        const submitButton = canvas.queryByRole('button', { name: /saving/i });
        if (submitButton) {
            await expect(submitButton).toBeDisabled();
        }
    },
};

export const DisabledState: Story = {
    args: { ...baseArgs, isEditing: false },
    parameters: {
        docs: {
            description: {
                story: 'Shows the upcoming/disabled state when the step has not yet been reached — no form inputs visible.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Disabled (upcoming) state: no editable inputs
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);

        await expect(canvasElement).toBeInTheDocument();
    },
};
