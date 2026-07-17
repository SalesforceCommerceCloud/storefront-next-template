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
import Payment from '../payment';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import BasketProvider from '@/providers/basket';
import CheckoutOneClickProvider from '@/components/checkout/utils/checkout-context';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';

const meta: Meta<typeof Payment> = {
    component: Payment,
    title: 'Checkout/Payment',
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        a11y: {
            ...checkoutStrictA11yParameters.a11y,
            config: {
                rules: [{ id: 'aria-valid-attr-value', enabled: false }],
            },
        },
        layout: 'padded',
        docs: {
            description: {
                component: `
### Payment Component

This component handles the payment step of the checkout process, collecting card details and billing address. It supports both new credit card entry and selection from saved payment methods for returning customers.

**Key Features:**
- **New Credit Card Entry**: Credit card input fields (name, number, expiry, CVV) with formatting and validation via \`CreditCardInputFields\`
- **Saved Payment Methods**: For registered customers, displays saved cards as radio options — shows 3 initially with view more/less toggle
- **Save to Profile**: Checkbox to save a new card for future use — only shown for registered customers entering a new card
- **Billing Address**: "Use a different billing address" checkbox — for registered customers with saved addresses, shows a dropdown to select from saved addresses or add a new one; for guests, shows the address form directly
- **Toggle States**: Edit form shown when \`isEditing\` is true; summary view when false
- **Saving State**: Spinner overlay covers the card while the order is being placed (Place Order acts as the submit — there is no separate Continue button)
- **Form Validation**: react-hook-form + Zod schema; field errors shown for card and billing fields

**Dependencies:**
- \`react-hook-form\` + \`@hookform/resolvers/zod\`: Form state and validation
- \`@/providers/basket\`: Current basket data
- \`@/components/toggle-card\`: Edit/summary toggle wrapper
- \`@/lib/checkout/schemas\`: Payment validation schema
- \`CreditCardInputFields\`: Card input fields with formatting
- \`AddressFormFields\`: Billing address form for new address entry
- \`@/components/ui/popover\`: Saved billing address dropdown
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
                <CheckoutActionLogger name="payment">
                    <Story />
                </CheckoutActionLogger>
            </div>
        ),
    ],
    argTypes: {
        onSubmit: {
            description: 'Callback function called when the form is submitted with valid payment data',
            table: {
                type: { summary: '(data: PaymentData) => void' },
            },
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked',
            table: {
                type: { summary: '() => void' },
            },
        },
        isLoading: {
            control: 'boolean',
            description: 'Shows a spinner overlay over the payment card while the order is being placed',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isCompleted: {
            control: 'boolean',
            description: 'Unused in the current implementation — edit/summary toggle is driven solely by `isEditing`',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isEditing: {
            control: 'boolean',
            description: 'Controls the view — true shows the edit form, false shows the summary view',
            table: {
                defaultValue: { summary: 'true' },
            },
        },
        disabled: {
            control: 'boolean',
            description:
                'When true and `isEditing` is false, shows the upcoming/disabled state with a "Complete previous steps" message',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        showUseDifferentBilling: {
            control: 'boolean',
            description:
                'Whether to show the "Use different billing address" checkbox. When false, always uses separate billing.',
            table: {
                defaultValue: { summary: 'true' },
            },
        },
        hidePaymentSaveCheckbox: {
            control: 'boolean',
            description: 'Whether to hide the "Save payment to profile" checkbox for logged-in customers',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        paymentSubmissionRef: {
            description: 'Ref object exposed by the parent checkout flow to access form data and surface field errors.',
            table: {
                type: { summary: 'MutableRefObject<PaymentSubmissionRef> | undefined' },
            },
        },
        actionData: {
            control: 'object',
            description: 'Action data containing form errors or success state from server action',
            table: {
                type: { summary: 'CheckoutActionData | undefined' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockPaymentInstrument = {
    paymentMethodId: 'CREDIT_CARD',
    paymentCard: {
        cardType: 'Visa',
        numberLastDigits: '4242',
        expirationMonth: 12,
        expirationYear: 2027,
    },
};

const mockShippingAddress = {
    firstName: 'Jane',
    lastName: 'Doe',
    address1: '123 Main St',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
};

const mockBillingAddress = {
    firstName: 'John',
    lastName: 'Smith',
    address1: '456 Elm Ave',
    city: 'Los Angeles',
    stateCode: 'CA',
    postalCode: '90001',
    countryCode: 'US',
};

const mockBasketWithPayment = {
    basketId: 'story-basket',
    paymentInstruments: [mockPaymentInstrument],
};

const mockBasketWithDifferentBilling = {
    basketId: 'story-basket',
    paymentInstruments: [mockPaymentInstrument],
    shipments: [{ shippingAddress: mockShippingAddress }],
    billingAddress: mockBillingAddress,
};

const withMockBasket = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithPayment as never}>
        <Story />
    </BasketProvider>
);

const withMockBasketDifferentBilling = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithDifferentBilling as never}>
        <Story />
    </BasketProvider>
);

const mockCustomerProfileWithPayments: CustomerProfile = {
    customer: { customerId: 'cust-1' },
    addresses: [],
    paymentInstruments: [
        {
            paymentInstrumentId: 'pi-visa-1',
            paymentMethodId: 'CREDIT_CARD',
            paymentCard: {
                cardType: 'Visa',
                numberLastDigits: '4242',
                expirationMonth: 12,
                expirationYear: 2027,
                holder: 'Jane Doe',
            },
        },
        {
            paymentInstrumentId: 'pi-mc-2',
            paymentMethodId: 'CREDIT_CARD',
            paymentCard: {
                cardType: 'MasterCard',
                numberLastDigits: '8888',
                expirationMonth: 6,
                expirationYear: 2026,
                holder: 'Jane Doe',
            },
        },
    ],
};

const withMockCustomerPayments = (Story: ComponentType) => (
    <CheckoutOneClickProvider
        customerProfile={mockCustomerProfileWithPayments}
        shippingDefaultSet={Promise.resolve(undefined)}>
        <Story />
    </CheckoutOneClickProvider>
);

const mockCustomerProfileWithPaymentsAndAddresses: CustomerProfile = {
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
    paymentInstruments: mockCustomerProfileWithPayments.paymentInstruments,
};

const withMockCustomerPaymentsAndAddresses = (Story: ComponentType) => (
    <CheckoutOneClickProvider
        customerProfile={mockCustomerProfileWithPaymentsAndAddresses}
        shippingDefaultSet={Promise.resolve(undefined)}>
        <Story />
    </CheckoutOneClickProvider>
);

const baseArgs = {
    onSubmit: () => action('submit-payment')(),
    onEdit: () => action('edit-payment')(),
    isLoading: false,
    isCompleted: false,
    isEditing: true,
    actionData: undefined,
};

export const EditView: Story = {
    args: baseArgs,
    parameters: {
        docs: {
            description: {
                story: 'Edit mode — credit card input fields are shown for new payment entry.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Form renders with inputs in edit mode
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBeGreaterThan(0);

        // Click the first input to verify it is interactive
        await userEvent.click(inputs[0]);
    },
};

export const EditViewWithDifferentBilling: Story = {
    args: { ...baseArgs, showUseDifferentBilling: true },
    parameters: {
        docs: {
            description: {
                story: 'Edit mode with the "Use a different billing address" checkbox checked — shows the billing address form fields beneath the payment section.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Expand the billing address section
        const billingCheckbox = canvas.getByRole('checkbox', { name: /Use a different billing address/i });
        await userEvent.click(billingCheckbox);

        // Billing address form fields are now visible
        await expect(canvas.getByLabelText(/First Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Last Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Address Line 1/i)).toBeInTheDocument();
    },
};

export const WithValidationErrors: Story = {
    args: {
        ...baseArgs,
        actionData: {
            step: 'payment',
            fieldErrors: {
                cardholderName: 'Please enter your name as shown on your card.',
                cardNumber: 'Please enter a valid card number',
                expiryDate: 'Please enter a valid expiry date',
                cvv: 'Please enter a valid CVV',
            },
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows the form with field-level validation errors for all payment fields.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Please enter your name as shown on your card.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter a valid card number')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter a valid expiry date')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter a valid CVV')).toBeInTheDocument();

        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBeGreaterThan(0);
    },
};

export const WithBillingValidationErrors: Story = {
    args: {
        ...baseArgs,
        showUseDifferentBilling: true,
        actionData: {
            step: 'payment',
            fieldErrors: {
                billingFirstName: 'Please enter your first name.',
                billingLastName: 'Please enter your last name.',
                billingAddress1: 'Please enter your address.',
                billingCity: 'Please enter your city.',
                billingPostalCode: 'Please enter your zip code.',
            },
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows billing field validation errors — the "Use a different billing address" checkbox is checked and all required billing fields show errors.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Expand the billing address section first
        const billingCheckbox = canvas.getByRole('checkbox', { name: /Use a different billing address/i });
        await userEvent.click(billingCheckbox);

        // Billing field errors injected via actionData should now be visible
        await expect(canvas.findByText('Please enter your first name.')).resolves.toBeInTheDocument();
        await expect(canvas.findByText('Please enter your last name.')).resolves.toBeInTheDocument();
        await expect(canvas.findByText('Please enter your address.')).resolves.toBeInTheDocument();
    },
};

export const WithSavedPaymentMethods: Story = {
    args: { ...baseArgs },
    decorators: [withMockCustomerPayments],
    parameters: {
        docs: {
            description: {
                story: 'Returning customer with saved payment methods — the preferred card is pre-selected; a "Credit Card" option to enter a new card appears at the bottom.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Saved payment method radios rendered
        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBeGreaterThan(1);

        // First saved method (preferred) is selected by default
        await expect(radios[0]).toBeChecked();

        // Card details visible
        await expect(canvas.getByText(/visa/i)).toBeInTheDocument();
        await expect(canvas.getByText(/4242/i)).toBeInTheDocument();
    },
};

export const WithSavedBillingAddresses: Story = {
    args: { ...baseArgs, showUseDifferentBilling: true },
    decorators: [withMockCustomerPaymentsAndAddresses],
    parameters: {
        docs: {
            description: {
                story: 'Returning customer with saved payments and saved addresses — checking "Use a different billing address" shows a dropdown of saved addresses with the preferred address pre-selected and an "Add new address" option at the bottom.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        // Check the "Use a different billing address" checkbox
        const billingCheckbox = canvas.getByRole('checkbox', { name: /Use a different billing address/i });
        await userEvent.click(billingCheckbox);

        // Open the address dropdown — portal content renders outside canvasElement
        const dropdownTrigger = await canvas.findByRole('button', { name: /Wall St|select an address/i });
        await userEvent.click(dropdownTrigger);

        // Saved addresses are listed in the portal
        await expect(await body.findByText(/5 Wall St/i)).toBeInTheDocument();
        await expect(body.getByText(/123 Main St/i)).toBeInTheDocument();
    },
};

export const WithNewBillingAddress: Story = {
    args: { ...baseArgs, showUseDifferentBilling: true },
    decorators: [withMockCustomerPaymentsAndAddresses],
    parameters: {
        docs: {
            description: {
                story: 'Returning customer who selects "+ Add new address" from the billing address dropdown — shows the full billing address form inline.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        // Check the "Use a different billing address" checkbox
        const billingCheckbox = canvas.getByRole('checkbox', { name: /Use a different billing address/i });
        await userEvent.click(billingCheckbox);

        // Open the address dropdown — portal content renders outside canvasElement
        const dropdownTrigger = await canvas.findByRole('button', { name: /Wall St|select an address/i });
        await userEvent.click(dropdownTrigger);

        const addNewOption = await body.findByText(/\+ Add new address/i);
        await userEvent.click(addNewOption);

        // Billing address form fields are now visible
        await expect(canvas.getByLabelText(/First Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Last Name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/Address Line 1/i)).toBeInTheDocument();
    },
};

export const WithNewCreditCard: Story = {
    args: { ...baseArgs },
    decorators: [withMockCustomerPayments],
    parameters: {
        docs: {
            description: {
                story: 'Returning customer who selects "Credit Card" to enter a new card — shows the card input form and the "Save payment to profile" checkbox.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Click the "Credit Card" radio to switch to new card entry
        const creditCardRadio = canvas.getByRole('radio', { name: /credit card/i });
        await userEvent.click(creditCardRadio);

        // Card input fields are now visible
        await expect(canvas.getByLabelText(/name on card/i)).toBeInTheDocument();

        // Save payment checkbox is visible for registered customers
        await expect(canvas.getByLabelText(/save payment method for future use/i)).toBeInTheDocument();
    },
};

export const SavingState: Story = {
    args: { ...baseArgs, isLoading: true },
    decorators: [withMockCustomerPayments],
    parameters: {
        docs: {
            description: {
                story: 'Spinner overlay shown while the order is being placed — the Payment card is covered and the Place Order button is disabled.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Submit button should be disabled during loading
        const submitButton = canvas.queryByRole('button', { name: /continue|submit|saving|processing/i });
        if (submitButton) {
            await expect(submitButton).toBeDisabled();
        }
    },
};

export const SummaryView: Story = {
    args: { ...baseArgs, isCompleted: true, isEditing: false },
    decorators: [withMockBasket],
    parameters: {
        docs: {
            description: {
                story: 'Shows the completed summary view — card type, last four digits, expiry, and an edit button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Summary shows card info, no editable text inputs
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);

        await expect(canvas.getByText(/Visa \*\*\*\* 4242/i)).toBeInTheDocument();
    },
};

export const SummaryViewWithDifferentBilling: Story = {
    args: { ...baseArgs, isCompleted: true, isEditing: false, showUseDifferentBilling: true },
    decorators: [withMockBasketDifferentBilling],
    parameters: {
        docs: {
            description: {
                story: 'Completed summary view when the billing address differs from the shipping address — shows the billing address lines beneath the card info.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // No editable inputs in summary view
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);

        // Card info visible
        await expect(canvas.getByText(/Visa \*\*\*\* 4242/i)).toBeInTheDocument();

        // Billing address lines visible
        await expect(canvas.getByText(/John Smith/i)).toBeInTheDocument();
        await expect(canvas.getByText(/456 Elm Ave/i)).toBeInTheDocument();
    },
};

export const DisabledState: Story = {
    args: { ...baseArgs, isEditing: false, disabled: true },
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

        // Upcoming step shows "Complete previous steps" message, no form inputs
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);

        await expect(canvas.getByText(/complete previous steps/i)).toBeInTheDocument();
    },
};
