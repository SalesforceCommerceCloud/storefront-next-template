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

import type { ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { allModes } from '../../../../.storybook/modes';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { action } from 'storybook/actions';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Form } from '@/components/ui/form';
import { CustomerProfileFields } from '../customer-profile-fields';
import { createCustomerProfileFormSchema, type CustomerProfileFormData } from '../index';
import type { ScapiFetcher } from '@/hooks/use-scapi-fetcher';
import type { ShopperCustomers } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// ---------------------------------------------------------------------------
// CustomerProfileFields renders firstName, lastName, phone, gender (1=M, 2=F),
// and birthday into a parent React Hook Form context, plus Save/Cancel
// buttons. Visible variations come from:
//   - prefilled vs empty
//   - whether onCancel is supplied (renders the Cancel button)
//   - hideActions (suppresses the entire footer for header placement)
//   - updateFetcher.state (drives the Save → Saving button + disabled state)
//   - validation errors after a submit
// ---------------------------------------------------------------------------

type FetcherState = 'idle' | 'submitting';

type SyntheticArgs = {
    prefilled: boolean;
    withCancelAction: boolean;
    hideActions: boolean;
    fetcherState: FetcherState;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    prefilled: false,
    withCancelAction: false,
    hideActions: false,
    fetcherState: 'idle',
};

const PREFILLED_VALUES: CustomerProfileFormData = {
    firstName: 'John',
    lastName: 'Doe',
    phone: '555-1234',
    gender: '1',
    birthday: '1990-05-15',
};

const EMPTY_VALUES: CustomerProfileFormData = {
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    birthday: '',
};

function createMockFetcher<TData>(state: FetcherState): ScapiFetcher<TData> {
    return {
        state,
        data: undefined,
        success: false,
        load: async () => {},
        submit: async () => {},
        formAction: undefined,
        formData: undefined,
        formEncType: 'application/x-www-form-urlencoded',
        formMethod: 'GET',
        formTarget: undefined,
        text: undefined,
        json: undefined,
        Form: undefined as unknown,
        reset: () => {},
        type: 'init',
    } as unknown as ScapiFetcher<TData>;
}

function PlaygroundWrapper(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const { t } = getTranslation();
    const schema = createCustomerProfileFormSchema(t);
    const form = useForm<CustomerProfileFormData>({
        resolver: zodResolver(schema),
        defaultValues: merged.prefilled ? PREFILLED_VALUES : EMPTY_VALUES,
    });
    const updateFetcher = createMockFetcher<ShopperCustomers.schemas['Customer']>(merged.fetcherState);

    return (
        <Form {...form}>
            <form onSubmit={(e) => void form.handleSubmit(() => {})(e)} data-testid="customer-profile-fields-form">
                <CustomerProfileFields
                    form={form}
                    updateFetcher={updateFetcher}
                    onCancel={merged.withCancelAction ? action('onCancel') : undefined}
                    hideActions={merged.hideActions}
                />
            </form>
        </Form>
    );
}

function ValidationErrorsWrapper() {
    const { t } = getTranslation();
    const schema = createCustomerProfileFormSchema(t);
    const form = useForm<CustomerProfileFormData>({
        resolver: zodResolver(schema),
        defaultValues: EMPTY_VALUES,
    });
    const updateFetcher = createMockFetcher<ShopperCustomers.schemas['Customer']>('idle');

    return (
        <Form {...form}>
            <form onSubmit={(e) => void form.handleSubmit(() => {})(e)} data-testid="customer-profile-fields-form">
                <CustomerProfileFields form={form} updateFetcher={updateFetcher} />
            </form>
        </Form>
    );
}

const meta: Meta<typeof CustomerProfileFields> = {
    title: 'Account/Profile/Customer Profile Fields',
    component: CustomerProfileFields,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        chromatic: {
            modes: {
                mobile: allModes.mobile,
                desktop: allModes.desktop,
            },
        },
        docs: {
            description: {
                component: `
Form fields for editing the customer profile (firstName, lastName, phone, gender,
birthday) plus Save/Cancel actions. Designed to render inside an external React
Hook Form context.

The Playground story drives the visible-state toggles directly: prefilled vs empty,
whether the Cancel button is wired, whether the action footer is shown, and the
mock fetcher state (idle / submitting). Validation errors get a dedicated story
because they require a submit-empty-form interaction.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="p-8 max-w-2xl">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        form: { table: { disable: true } },
        updateFetcher: { table: { disable: true } },
        onCancel: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: empty form, no Cancel button, idle fetcher. Toggle `prefilled`
 * to load realistic values, `withCancelAction` to wire the Cancel button,
 * `hideActions` to suppress the footer, and `fetcherState` to flip into the
 * submitting state.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        prefilled: {
            description: 'Load realistic firstName/lastName/phone/gender/birthday values.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withCancelAction: {
            description: 'Wire onCancel so the Cancel button renders.',
            control: 'boolean',
            table: { category: 'Synthetic (actions)' },
        },
        hideActions: {
            description:
                'When true, suppress the entire Save/Cancel footer (used when actions live in the page header).',
            control: 'boolean',
        },
        fetcherState: {
            description: 'Mock fetcher state — idle (Save button) or submitting (disabled Saving button).',
            control: 'radio',
            options: ['idle', 'submitting'] satisfies FetcherState[],
            table: { category: 'Synthetic (fetcher)' },
        },
    },
    render: PlaygroundWrapper,
};

/**
 * Submitting state — locks in that the submit button shows the "Saving"
 * label and is disabled while the fetcher is in flight.
 */
export const Submitting: Story = {
    render: () => PlaygroundWrapper({ prefilled: true, fetcherState: 'submitting' }),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        const submitButton = await canvas.findByRole('button', {
            name: t('account:profile.savingButton'),
        });
        await expect(submitButton).toBeDisabled();
    },
};

/**
 * Validation errors — submit an empty form to trigger zod errors. Locks in
 * that field-level validation messages render at all.
 */
export const WithValidationErrors: Story = {
    render: () => <ValidationErrorsWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        const submitButton = canvas.getByRole('button', { name: t('account:profile.saveButton') });
        await userEvent.click(submitButton);

        // At least one inline FormMessage should surface after submit.
        const errors = await canvas.findAllByText(/required|enter your/i);
        await expect(errors.length).toBeGreaterThan(0);
    },
};
