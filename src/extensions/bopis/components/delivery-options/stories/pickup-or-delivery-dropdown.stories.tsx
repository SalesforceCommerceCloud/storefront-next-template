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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import PickupOrDeliveryDropdown from '../pickup-or-delivery-dropdown';
import { DELIVERY_OPTIONS, type DeliveryOption } from '@/extensions/bopis/constants';

const meta: Meta<typeof PickupOrDeliveryDropdown> = {
    title: 'Extensions/BOPIS/Pickup Or Delivery Dropdown',
    component: PickupOrDeliveryDropdown,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `\
A compact button+dropdown popover for selecting Delivery or Pick Up in Store.\
\
Includes custom states, accessibility support, and styled to match UI guidelines.\
            `,
            },
        },
    },
    argTypes: {
        value: {
            description: 'Current selected fulfillment type',
            control: 'select',
            options: [DELIVERY_OPTIONS.DELIVERY, DELIVERY_OPTIONS.PICKUP],
        },
        onChange: { description: 'Change handler', action: 'onChange' },
        isPickupDisabled: {
            description: 'Whether the Pick up in store option is disabled',
            control: 'boolean',
        },
        isDeliveryDisabled: {
            description: 'Whether the Ship to address option is disabled',
            control: 'boolean',
        },
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: { story: 'Delivery selected, both options enabled.' },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /delivery/i }, { timeout: 5000 });
        await expect(trigger).toBeInTheDocument();

        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const shipToAddress = await documentBody.findByRole(
            'menuitem',
            { name: /ship to address/i },
            { timeout: 5000 }
        );
        const storePickup = await documentBody.findByRole(
            'menuitem',
            { name: /pick up in store|store pickup/i },
            {
                timeout: 5000,
            }
        );
        await expect(shipToAddress).toBeInTheDocument();
        await expect(storePickup).toBeInTheDocument();

        await userEvent.click(storePickup);
    },
};

export const PickupSelected: Story = {
    args: {
        value: DELIVERY_OPTIONS.PICKUP as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: { story: 'Pickup selected, both options enabled.' },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Trigger button shows short label "Pick Up"
        const trigger = await canvas.findByRole('button', { name: /pick up/i }, { timeout: 5000 });
        await expect(trigger).toBeInTheDocument();

        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const shipToAddress = await documentBody.findByRole(
            'menuitem',
            { name: /ship to address/i },
            { timeout: 5000 }
        );
        const storePickup = await documentBody.findByRole(
            'menuitem',
            { name: /pick up in store|store pickup/i },
            {
                timeout: 5000,
            }
        );
        await expect(shipToAddress).toBeInTheDocument();
        await expect(storePickup).toBeInTheDocument();

        await userEvent.click(shipToAddress);
    },
};

export const CustomClass: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'Menu with a custom CSS class for styling. Play function opens the dropdown via keyboard (Tab + Enter) and verifies menu items are present.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /delivery/i }, { timeout: 5000 });
        await expect(trigger).toBeInTheDocument();

        trigger.focus();
        await expect(trigger).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        const documentBody = within(document.body);
        const shipToAddress = await documentBody.findByRole(
            'menuitem',
            { name: /ship to address/i },
            { timeout: 5000 }
        );
        const storePickup = await documentBody.findByRole(
            'menuitem',
            { name: /pick up in store|store pickup/i },
            {
                timeout: 5000,
            }
        );
        await expect(shipToAddress).toBeInTheDocument();
        await expect(storePickup).toBeInTheDocument();
    },
};
