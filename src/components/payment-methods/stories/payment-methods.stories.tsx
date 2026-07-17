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
import type { ShopperCustomers } from '@/scapi';
import { PaymentMethods } from '../payment-methods';

// ---------------------------------------------------------------------------
// PaymentMethods is the account "Payment methods" page wrapper. Visible
// variations come from:
//   - whether `customer` is null
//   - number of `paymentInstruments` on the customer (0 → empty state,
//     >=1 → list of PaymentMethodCards)
//   - whether one instrument has `default: true` (sorted first)
// ---------------------------------------------------------------------------

type SyntheticArgs = {
    customerPresent: boolean;
    count: 0 | 1 | 2 | 3;
    withDefault: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    customerPresent: true,
    count: 0,
    withDefault: false,
};

const SAMPLE_INSTRUMENTS: ShopperCustomers.schemas['CustomerPaymentInstrument'][] = [
    {
        paymentInstrumentId: 'pi-1',
        paymentCard: {
            cardType: 'Visa',
            holder: 'John Doe',
            maskedNumber: '************4242',
            expirationMonth: 12,
            expirationYear: 2027,
        },
    },
    {
        paymentInstrumentId: 'pi-2',
        paymentCard: {
            cardType: 'Mastercard',
            holder: 'John Doe',
            maskedNumber: '************5555',
            expirationMonth: 6,
            expirationYear: 2026,
        },
    },
    {
        paymentInstrumentId: 'pi-3',
        paymentCard: {
            cardType: 'Amex',
            holder: 'John Doe',
            maskedNumber: '***********1009',
            expirationMonth: 9,
            expirationYear: 2028,
        },
    },
] as ShopperCustomers.schemas['CustomerPaymentInstrument'][];

function buildCustomer(args: SyntheticArgs): ShopperCustomers.schemas['Customer'] | null {
    if (!args.customerPresent) return null;
    // Mark the LAST instrument as default so the component's "default-first"
    // sort visibly reorders the list (marking index 0 would be a no-op since
    // the sort would leave it where it already is).
    const lastIndex = args.count - 1;
    const instruments = SAMPLE_INSTRUMENTS.slice(0, args.count).map((p, i) => ({
        ...p,
        default: args.withDefault && i === lastIndex,
    }));
    return {
        customerId: 'customer-1',
        addresses: [
            {
                addressId: 'address-1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main Street',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
            },
        ],
        paymentInstruments: instruments,
    } as ShopperCustomers.schemas['Customer'];
}

function renderPaymentMethods(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    return <PaymentMethods customer={buildCustomer(merged)} />;
}

const meta: Meta<typeof PaymentMethods> = {
    title: 'Account/Payment Methods/Payment Methods',
    component: PaymentMethods,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Account "Payment methods" page. Lists the customer's payment instruments (default first),
shows an empty state when there are none, and exposes Add / Remove / Set default actions
that fire route actions on click. The Playground story drives the visible-state toggles:
whether a customer is present, how many instruments to render, and whether the first
instrument is marked as the default.
                `,
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        customer: { table: { disable: true } },
    },
};

export default meta;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: customer present, no payment instruments (empty state).
 * Increase `count` to surface the list, flip `withDefault` to mark the
 * first instrument as the default, or flip `customerPresent` off to render
 * with `customer: null`.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        customerPresent: {
            description: 'When false, render with customer={null}.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        count: {
            description: 'Number of payment instruments on the customer.',
            control: 'select',
            options: [0, 1, 2, 3],
            table: { category: 'Synthetic (data shape)' },
        },
        withDefault: {
            description: 'When true, mark the first instrument as the default (sorted first by the component).',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: renderPaymentMethods,
};
