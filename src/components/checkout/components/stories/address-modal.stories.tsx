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
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, within } from 'storybook/test';
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useState } from 'react';
import { AddressModal } from '../address-modal';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof AddressModal> = {
    title: 'Checkout/Address/Address Modal',
    component: AddressModal,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        controls: { expanded: true },
        a11y: {
            ...checkoutStrictA11yParameters.a11y,
            config: {
                rules: [
                    // Radix Dialog renders focus-guard spans with tabindex="0" and aria-hidden="true"
                    // as part of its focus trap implementation. axe flags these as inconclusive, but
                    // they're intentional and correct accessibility behavior for modal focus management.
                    { id: 'aria-hidden-focus', enabled: false },
                ],
            },
        },
        docs: {
            description: {
                component: `Dialog for adding or editing a shipping address during checkout. Renders a Zod-validated form
with country-aware fields (state/province, postal code format) via the shared \`AddressFormFields\` component.

On save, the validated \`CustomerAddress\` object is passed to \`onSave\`, and the modal closes automatically
unless \`isLoading\` is provided (parent-controlled close). Supports both single-address checkout and
multi-address (multiship) scenarios through configurable props like \`showAddressId\` and \`strictValidation\`.`,
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
    tags: ['autodocs', 'interaction'],
    argTypes: {
        open: {
            control: false,
            description:
                '**Required.** Controls whether the dialog is visible. Managed internally by the story wrapper.',
            table: {
                type: { summary: 'boolean' },
            },
            type: { name: 'boolean', required: true },
        },
        onOpenChange: {
            control: false,
            description:
                '**Required.** Called when the dialog open state changes (close button, cancel, or overlay click).',
            table: {
                type: { summary: '(open: boolean) => void' },
            },
            type: { name: 'function', required: true },
        },
        onSave: {
            control: false,
            description:
                'Called with a validated `CustomerAddress` object when the form is submitted. The modal auto-closes unless `isLoading` is set.',
        },
        isEditMode: {
            control: 'boolean',
            description: 'When `true`, the title reads "Edit Address" instead of "Add New Address".',
            table: { defaultValue: { summary: 'false' } },
        },
        countryCode: {
            control: 'text',
            description: 'Default country code used for the country selector and postal code validation.',
            table: { defaultValue: { summary: '"US"' } },
        },
        defaultValues: {
            control: 'object',
            description:
                'Partial `CustomerAddress` to pre-populate form fields (e.g. for edit mode). The form resets to these values each time the dialog opens.',
        },
        showAddressId: {
            control: 'boolean',
            description:
                'Shows an address title/label field (e.g. "Home", "Work"). When shown, the field is required. Only used by the multiship extension.',
            table: { defaultValue: { summary: 'false' } },
        },
        showPhone: {
            control: 'boolean',
            description: 'Shows the phone number field with country code selector.',
            table: { defaultValue: { summary: 'false' } },
        },
        showCountry: {
            control: 'boolean',
            description: 'Shows the country dropdown selector.',
            table: { defaultValue: { summary: 'true' } },
        },
        labelsAsPlaceholders: {
            control: 'boolean',
            description:
                'Hides field labels and uses placeholder text only. Labels become `sr-only` for accessibility.',
            table: { defaultValue: { summary: 'false' } },
        },
        strictValidation: {
            control: 'boolean',
            description:
                'Enables strict validation: phone, state, and postal code become required, and country-specific postal code format (US/CA) is enforced.',
            table: { defaultValue: { summary: 'false' } },
        },
        isLoading: {
            control: 'boolean',
            description:
                'When set, disables both buttons and shows "Saving…" on the save button. The modal will not auto-close on save — the parent must control closing via `onOpenChange`.',
            table: { defaultValue: { summary: 'undefined' } },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

function AddressModalWithState(args: Partial<React.ComponentProps<typeof AddressModal>>) {
    const [open, setOpen] = useState(args.open ?? false);
    return (
        <>
            {!open && (
                <button type="button" onClick={() => setOpen(true)}>
                    Open modal
                </button>
            )}
            <AddressModal
                {...args}
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    args.onOpenChange?.(next);
                }}
            />
        </>
    );
}

export const _DocsAnchor: Story = {
    tags: ['!dev'],
    args: { open: false, onOpenChange: () => {}, onSave: () => {} },
};

export const AddAddress: Story = {
    tags: ['!autodocs'],
    render: (args) => <AddressModalWithState {...args} />,
    args: {
        open: true,
        countryCode: 'US',
        onOpenChange: action('onOpenChange'),
        onSave: action('onSave'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(document.body);

        void expect(body.getByRole('dialog')).toBeInTheDocument();
        void expect(body.getByRole('heading', { name: /add new address/i })).toBeInTheDocument();
    },
};

export const EditAddress: Story = {
    tags: ['!autodocs'],
    render: (args) => <AddressModalWithState {...args} />,
    args: {
        open: true,
        isEditMode: true,
        countryCode: 'US',
        onOpenChange: action('onOpenChange'),
        onSave: action('onSave'),
        defaultValues: {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '123 Main St',
            address2: 'Apt 4',
            city: 'San Francisco',
            stateCode: 'CA',
            postalCode: '94102',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(document.body);
        void expect(body.getByRole('dialog')).toBeInTheDocument();
        void expect(body.getByRole('heading', { name: /edit address/i })).toBeInTheDocument();
    },
};

export const Saving: Story = {
    tags: ['!autodocs'],
    render: (args) => <AddressModalWithState {...args} />,
    args: {
        open: true,
        isLoading: true,
        countryCode: 'US',
        onOpenChange: action('onOpenChange'),
        onSave: action('onSave'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(document.body);
        void expect(body.getByRole('dialog')).toBeInTheDocument();
        void expect(body.getByRole('button', { name: /saving/i })).toBeDisabled();
        void expect(body.getByRole('button', { name: /cancel/i })).toBeDisabled();
    },
};
