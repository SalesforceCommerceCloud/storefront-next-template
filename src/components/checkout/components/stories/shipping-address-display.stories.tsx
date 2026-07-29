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
import ShippingAddressDisplay from '../shipping-address-display';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof ShippingAddressDisplay> = {
    title: 'Checkout/Shipping/Shipping Address Display',
    component: ShippingAddressDisplay,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Displays a shipping address in standard format: Name, Address1 Address2, City StateCode ZipCode, Country. When address is missing or empty, renders nothing. Used in checkout and order details.',
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
        address: {
            description: 'Address to display; when null or empty, nothing is rendered',
        },
        displayPhone: {
            description: 'When true, show phone number',
            control: 'boolean',
        },
        variant: {
            description: 'Display variant: summary or card (card shows default badge when preferred)',
            control: 'select',
            options: ['summary', 'card'],
        },
    },
};

export default meta;
type Story = StoryObj<typeof ShippingAddressDisplay>;

const fullAddress = {
    firstName: 'Jane',
    lastName: 'Doe',
    address1: '123 Main St',
    address2: 'Apt 4',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
};

export const DefaultView: Story = {
    args: {
        address: fullAddress,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify key address fields render
        await expect(canvas.getByText('Jane Doe')).toBeInTheDocument();
        await expect(canvas.getByText(/123 Main St/)).toBeInTheDocument();
        await expect(canvas.getByText(/San Francisco/)).toBeInTheDocument();
    },
};

export const WithPhone: Story = {
    args: {
        address: { ...fullAddress, phone: '555-123-4567' },
        displayPhone: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Address renders
        await expect(canvas.getByText('Jane Doe')).toBeInTheDocument();

        // Phone number is visible (stripCountryCode may reformat; check for core digits)
        await expect(canvas.getByText(/555-123-4567|5551234567/)).toBeInTheDocument();
    },
};

export const WithDefaultTag: Story = {
    args: {
        address: { ...fullAddress, preferred: true },
        variant: 'card',
    },
    parameters: {
        docs: {
            description: {
                story: 'Card variant with a preferred address — shows the "Default" badge alongside the name.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Jane Doe')).toBeInTheDocument();

        const badge = canvas.queryByText(/default/i);
        await expect(badge).toBeInTheDocument();
    },
};
