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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { CustomerAddressForm } from '../form';
import type { CustomerAddressFormData } from '../index';
import type { ScapiFetcher } from '@/hooks/use-scapi-fetcher';
import type { ShopperCustomers } from '@/scapi';
import { action } from 'storybook/actions';

// ---------------------------------------------------------------------------
// CustomerAddressForm renders an editable address form with zod validation,
// a submitting overlay, and inline success/error banners (when no callback
// is supplied for those events). Visible variations come from:
//   - initialData (pre-filled vs blank, US vs CA)
//   - updateFetcher.state ('idle' / 'submitting' / 'success' / 'error')
//   - whether onSuccess / onError callbacks are supplied (when not, the form
//     falls back to inline banners)
// All toggles are surfaced through the Playground; dedicated stories cover
// the visually distinct loading / validation / inline-banner branches.
// ---------------------------------------------------------------------------

type Country = 'US' | 'CA';
type FetcherState = 'idle' | 'submitting' | 'success' | 'error';

type SyntheticArgs = {
    prefilled: boolean;
    country: Country;
    withCallbacks: boolean;
    fetcherState: FetcherState;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    prefilled: true,
    country: 'US',
    withCallbacks: true,
    fetcherState: 'idle',
};

const PREFILLED_BY_COUNTRY: Record<
    Country,
    Partial<ShopperCustomers.schemas['CustomerAddress']> & { addressId?: string }
> = {
    US: {
        addressId: 'Home',
        firstName: 'Test',
        lastName: 'User2',
        phone: '(778) 288-1237',
        countryCode: 'US',
        address1: '1234 Main St',
        address2: 'Apt 4B',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        preferred: true,
    },
    CA: {
        addressId: 'Work',
        firstName: 'John',
        lastName: 'Doe',
        phone: '(416) 555-1234',
        countryCode: 'CA',
        address1: '123 Yonge Street',
        address2: 'Suite 200',
        city: 'Toronto',
        stateCode: 'ON',
        postalCode: 'M5B 2H1',
        preferred: false,
    },
};

function createMockFetcher<TData>({
    state,
    data,
    success,
    errors,
}: {
    state: 'idle' | 'loading' | 'submitting';
    data?: TData;
    success?: boolean;
    errors?: string[];
}): ScapiFetcher<TData> {
    return {
        state,
        data,
        success: success ?? false,
        errors,
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

function buildFetcher(state: FetcherState): ScapiFetcher<ShopperCustomers.schemas['CustomerAddress']> {
    switch (state) {
        case 'submitting':
            return createMockFetcher<ShopperCustomers.schemas['CustomerAddress']>({ state: 'submitting' });
        case 'success':
            return createMockFetcher<ShopperCustomers.schemas['CustomerAddress']>({
                state: 'idle',
                data: PREFILLED_BY_COUNTRY.US as ShopperCustomers.schemas['CustomerAddress'],
                success: true,
            });
        case 'error':
            return createMockFetcher<ShopperCustomers.schemas['CustomerAddress']>({
                state: 'idle',
                errors: ['Failed to save address. Please try again.'],
            });
        case 'idle':
        default:
            return createMockFetcher<ShopperCustomers.schemas['CustomerAddress']>({ state: 'idle' });
    }
}

function renderForm(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const initialData = (
        merged.prefilled ? PREFILLED_BY_COUNTRY[merged.country] : {}
    ) as Partial<CustomerAddressFormData>;
    return (
        <CustomerAddressForm
            initialData={initialData}
            updateFetcher={buildFetcher(merged.fetcherState)}
            onSuccess={merged.withCallbacks ? action('onSuccess') : undefined}
            onError={merged.withCallbacks ? action('onError') : undefined}
            onCancel={action('onCancel')}
        />
    );
}

const meta: Meta<typeof CustomerAddressForm> = {
    title: 'Account/Addresses/Customer Address Form',
    component: CustomerAddressForm,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Editable address form with zod validation, a submitting overlay, and inline
success/error banners (used when no callback is supplied for those events).

The Playground story exposes the visible-state toggles directly: pre-fill US or
CA addresses, swap callbacks for inline banners, and drive the fetcher through
its idle / submitting / success / error states. Validation errors get a dedicated
story because they require a real form submission.
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
        initialData: { table: { disable: true } },
        updateFetcher: { table: { disable: true } },
        onSuccess: { table: { disable: true } },
        onError: { table: { disable: true } },
        onCancel: { table: { disable: true } },
        isFirstAddress: { table: { disable: true } },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: pre-filled US address, callbacks active, fetcher idle.
 * Toggle `prefilled` off for an empty form, `country: 'CA'` for the
 * Canadian-state branch, `withCallbacks` off to surface inline banners,
 * and `fetcherState` to switch between idle / submitting / success / error.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        prefilled: {
            description: 'Load realistic data for the chosen country instead of an empty form.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        country: {
            description:
                'US (NY state) or CA (Ontario province) — drives the prefilled fixture and stateCode dropdown.',
            control: 'radio',
            options: ['US', 'CA'] satisfies Country[],
            table: { category: 'Synthetic (data shape)' },
        },
        withCallbacks: {
            description:
                'When off, omit onSuccess/onError so the form falls back to inline success/error banners (driven by fetcherState).',
            control: 'boolean',
            table: { category: 'Synthetic (callbacks)' },
        },
        fetcherState: {
            description:
                'Mock fetcher state: idle, submitting (overlay + Saving button), success (data), error (errors[]).',
            control: 'select',
            options: ['idle', 'submitting', 'success', 'error'] satisfies FetcherState[],
            table: { category: 'Synthetic (fetcher)' },
        },
    },
    render: renderForm,
};

/**
 * Submit empty form to trigger zod validation errors. Locks in that the
 * field-level validation messages render at all (real regression catch).
 */
export const WithValidationErrors: Story = {
    render: () => renderForm({ prefilled: false }),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const saveButton = canvas.getByRole('button', { name: /save/i });
        await userEvent.click(saveButton);

        const errors = await canvas.findAllByText(/(address title|first name).*required/i);
        await expect(errors.length).toBeGreaterThanOrEqual(1);
    },
};

/**
 * Submitting state — loading overlay + disabled "Saving..." button.
 */
export const Submitting: Story = {
    render: () => renderForm({ fetcherState: 'submitting' }),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const overlay = canvasElement.querySelector('[data-testid="customer-address-form-loading"]');
        await expect(overlay).toBeInTheDocument();

        const saveButton = await canvas.findByRole('button', { name: /saving/i });
        await expect(saveButton).toBeDisabled();
    },
};

/**
 * Inline error banner — fetcher returned errors and no onError callback was supplied.
 */
export const InlineError: Story = {
    render: () => renderForm({ withCallbacks: false, fetcherState: 'error' }),
};

/**
 * Inline success banner — fetcher returned success and no onSuccess callback was supplied.
 */
export const InlineSuccess: Story = {
    render: () => renderForm({ withCallbacks: false, fetcherState: 'success' }),
};
