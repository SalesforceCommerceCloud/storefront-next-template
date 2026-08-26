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
import { PaymentMethodCard } from '../payment-method-card';

const meta: Meta<typeof PaymentMethodCard> = {
    title: 'Account/Orders/Order Details/Payment Method Card',
    component: PaymentMethodCard,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Payment method card (`data-card="payment-method"`) shown in the Order Summary rail on both the registered-account and guest order-lookup Order Details pages. Renders nothing when there are no displayable payment methods.',
            },
        },
    },
    tags: ['autodocs'],
    // No per-story decorators: the global preview stack already supplies i18n. The component
    // takes its data via the `payments` prop.
    argTypes: {
        className: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof PaymentMethodCard>;

export const SinglePayment: Story = {
    args: {
        payments: [{ id: 'payment-1', label: 'Visa ending in 1234' }],
    },
};

export const MultiplePayments: Story = {
    args: {
        payments: [
            { id: 'payment-1', label: 'Visa ending in 1234' },
            { id: 'payment-2', label: 'Gift card ending in 5678' },
        ],
    },
};

export const Empty: Story = {
    args: {
        payments: [],
    },
    parameters: {
        docs: {
            description: {
                story: 'No displayable payment methods — the component renders nothing.',
            },
        },
    },
};
