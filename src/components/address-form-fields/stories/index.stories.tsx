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
import { waitForStorybookReady } from '@storybook/test-utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { AddressFormFields } from '../index';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import { createShippingAddressSchema, type ShippingAddressData } from '@/lib/checkout/schemas';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// ---------------------------------------------------------------------------
// AddressFormFields renders form fields into a parent React Hook Form context.
// Visible variations come from:
//   - showPhone (toggles the phone country code + phone fields)
//   - labelsAsPlaceholders (sr-only labels; placeholder text instead)
//   - showCountry (replaces the read-only country with a dropdown; switches
//     state/zip labels per US/CA)
//   - phoneRequired (asterisk on the phone label)
//   - prefilled vs blank form data
//   - validation-error rendering
//   - billing prefix (prefixed names + autocomplete attributes)
// The Playground drives the boolean props directly + a `country` synthetic
// radio that pre-fills the country field when `showCountry=true`. Validation
// and the billing prefix are dedicated stories because they need their own
// form wrapper (zod resolver / prefixed defaultValues).
// ---------------------------------------------------------------------------

interface BillingFormData {
    billingFirstName: string;
    billingLastName: string;
    billingAddress1: string;
    billingAddress2: string;
    billingCity: string;
    billingStateCode: string;
    billingPostalCode: string;
    billingCountryCode: string;
}

type Country = 'US' | 'CA' | 'GB';

type SyntheticArgs = {
    showPhone: boolean;
    labelsAsPlaceholders: boolean;
    showCountry: boolean;
    phoneRequired: boolean;
    prefilled: boolean;
    country: Country;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    showPhone: true,
    labelsAsPlaceholders: false,
    showCountry: false,
    phoneRequired: false,
    prefilled: false,
    country: 'US',
};

const PREFILLED_BY_COUNTRY: Record<Country, Partial<ShippingAddressData>> = {
    US: {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main Street',
        address2: 'Apt 4B',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        phone: '5551234567',
    },
    CA: {
        firstName: 'Avery',
        lastName: 'Tremblay',
        address1: '500 Rue Sainte-Catherine',
        address2: '',
        city: 'Montréal',
        stateCode: 'QC',
        postalCode: 'H3B 1B5',
        phone: '4165551234',
    },
    GB: {
        firstName: 'David',
        lastName: 'Taylor',
        address1: '10 Downing Street',
        address2: '',
        city: 'London',
        stateCode: '',
        postalCode: 'SW1A 2AA',
        phone: '2012345678',
    },
};

function PlaygroundWrapper(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const baseDefaults: ShippingAddressData = {
        firstName: '',
        lastName: '',
        address1: '',
        address2: '',
        city: '',
        stateCode: '',
        postalCode: '',
        phoneCountryCode: '+1',
        phone: '',
    };
    const defaultValues = merged.prefilled
        ? { ...baseDefaults, ...PREFILLED_BY_COUNTRY[merged.country] }
        : baseDefaults;
    const form = useForm<ShippingAddressData & { countryCode?: string }>({
        defaultValues: { ...defaultValues, countryCode: merged.country },
    });

    return (
        <Form {...form}>
            <form data-testid="address-form-fields-form" className="space-y-4">
                <AddressFormFields
                    form={form}
                    showPhone={merged.showPhone}
                    countryCode={merged.country}
                    labelsAsPlaceholders={merged.labelsAsPlaceholders}
                    showCountry={merged.showCountry}
                    phoneRequired={merged.phoneRequired}
                />
            </form>
        </Form>
    );
}

function ShippingAddressFormWrapperWithValidation() {
    const { t } = getTranslation();
    const schema = createShippingAddressSchema(t);
    const form = useForm<ShippingAddressData>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName: '',
            lastName: '',
            address1: '',
            address2: '',
            city: '',
            stateCode: '',
            postalCode: '',
            phoneCountryCode: '+1',
            phone: '',
        },
    });

    return (
        <Form {...form}>
            <form
                data-testid="address-form-fields-form"
                className="space-y-4"
                onSubmit={(e) => void form.handleSubmit(() => {})(e)}>
                <AddressFormFields form={form} showPhone={true} countryCode="US" />
                <button type="submit">Save</button>
            </form>
        </Form>
    );
}

function BillingAddressFormWrapper() {
    const form = useForm<BillingFormData>({
        defaultValues: {
            billingFirstName: '',
            billingLastName: '',
            billingAddress1: '',
            billingAddress2: '',
            billingCity: '',
            billingStateCode: '',
            billingPostalCode: '',
            billingCountryCode: 'US',
        },
    });

    return (
        <Form {...form}>
            <form data-testid="billing-address-form-fields-form" className="space-y-4">
                <AddressFormFields
                    form={form}
                    fieldPrefix="billing"
                    showPhone={false}
                    showCountry
                    labelsAsPlaceholders
                    countryCode="US"
                />
            </form>
        </Form>
    );
}

const meta: Meta<typeof AddressFormFields> = {
    title: 'Core/Forms/Address Form Fields',
    component: AddressFormFields,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        a11y: {
            ...checkoutStrictA11yParameters.a11y,
            config: {
                rules: [{ id: 'color-contrast', enabled: false }],
            },
        },
        docs: {
            description: {
                component: `
Shared, reusable address form fields with Google Maps Places autocomplete integration.
Used by the checkout shipping-address step, the billing-address section inside the
payment step, and the add-payment-method dialog. Purely presentational — renders fields
into an existing React Hook Form context; does not own form submission or validation.

The Playground story drives the boolean props (\`showPhone\`, \`labelsAsPlaceholders\`,
\`showCountry\`, \`phoneRequired\`) directly, plus synthetic toggles for prefilled data
and country (US/CA/GB) so designers can reach the named-country branches from one
bookmarkable URL. Validation errors and the billing prefix get dedicated stories
because each needs its own form wrapper (zod resolver / prefixed default values).
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
            <CheckoutActionLogger name="address-form-fields">
                <Story />
            </CheckoutActionLogger>
        ),
        (Story) => (
            <div className="max-w-2xl">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        // Hidden: not driven from Controls. Pre-supplied by each wrapper.
        form: { table: { disable: true } },
        fieldPrefix: { table: { disable: true } },
        countryCode: { table: { disable: true } },
        className: { table: { disable: true } },
        autoFocus: { table: { disable: true } },
        autoFocusField: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: empty US shipping form with phone shown. Toggle showPhone /
 * labelsAsPlaceholders / showCountry / phoneRequired to reach the alternative
 * shipping configurations. Use the synthetic `prefilled` toggle to load a
 * realistic address for the chosen `country` (US / CA / GB).
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        showPhone: {
            description: 'Show the phone country-code dropdown and phone input.',
            control: 'boolean',
        },
        labelsAsPlaceholders: {
            description: 'Hide labels (sr-only) and use placeholder text instead.',
            control: 'boolean',
        },
        showCountry: {
            description:
                'Replace the read-only country display with a select. State/Zip labels switch per country (US → State + Zip, CA → Province + Postal Code).',
            control: 'boolean',
        },
        phoneRequired: {
            description: 'Append an asterisk to the phone label.',
            control: 'boolean',
        },
        prefilled: {
            description: 'Load realistic data for the chosen country instead of an empty form.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        country: {
            description:
                'Drives countryCode and the prefilled fixture. US/CA hit the named-state/country branches; GB exercises the free-text state fallback when showCountry is on.',
            control: 'radio',
            options: ['US', 'CA', 'GB'] satisfies Country[],
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: PlaygroundWrapper,
};

/**
 * Submit empty form to trigger react-hook-form / zod validation errors.
 * Asserts the exact translated error messages for all required fields —
 * a real regression catch on the validation wiring.
 */
export const WithValidationErrors: Story = {
    render: () => <ShippingAddressFormWrapperWithValidation />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const saveButton = canvas.getByRole('button', { name: /save/i });
        await userEvent.click(saveButton);

        await expect(canvas.getByText('Please enter your first name.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your last name.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your address.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your city.')).toBeInTheDocument();
        await expect(canvas.getByText('Please select your state.')).toBeInTheDocument();
        await expect(canvas.getByText('Please enter your zip code.')).toBeInTheDocument();
    },
};

/**
 * Billing address form: fieldPrefix='billing', showCountry, and labelsAsPlaceholders.
 * Verifies the prefixed field name + scoped autocomplete attribute — coupled
 * behavior that the snapshot alone won't easily catch.
 */
export const BillingAddress: Story = {
    render: () => <BillingAddressFormWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const firstNameInput = canvas.getByPlaceholderText(/first name\*/i);
        await expect(firstNameInput).toHaveAttribute('name', 'billingFirstName');
        await expect(firstNameInput).toHaveAttribute('autocomplete', 'billing given-name');
        await expect(canvas.getByRole('combobox', { name: /country/i })).toBeInTheDocument();
        await expect(canvas.queryByLabelText(/phone number/i)).not.toBeInTheDocument();
    },
};
