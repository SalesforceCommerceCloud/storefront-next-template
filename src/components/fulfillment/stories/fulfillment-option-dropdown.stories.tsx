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
import { expect, fn, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { FulfillmentOptionDropdown } from '../fulfillment-option-dropdown';
import { FULFILLMENT_OPTION_IDS } from '../types';

const options = [
    {
        id: FULFILLMENT_OPTION_IDS.DELIVERY,
        label: 'Delivery',
        menuLabel: 'Send to an address',
        availability: { available: true },
    },
    {
        id: FULFILLMENT_OPTION_IDS.PICKUP,
        label: 'Pickup',
        menuLabel: 'Collect from a location',
        availability: { available: true },
    },
];

const meta = {
    title: 'Fulfillment/Fulfillment Option Dropdown',
    component: FulfillmentOptionDropdown,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: { description: { component: 'Displays fulfillment choices in a compact radio dropdown.' } },
    },
    argTypes: {
        onChange: { table: { disable: true } },
        renderIcon: { table: { disable: true } },
    },
} satisfies Meta<typeof FulfillmentOptionDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        value: FULFILLMENT_OPTION_IDS.DELIVERY,
        options,
        onChange: fn(),
    },
    play: async ({ args, canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: 'Delivery' }));
        const menu = within(document.body);
        const pickup = await menu.findByRole('menuitemradio', { name: 'Collect from a location' });
        await userEvent.click(pickup);

        await expect(args.onChange).toHaveBeenCalledWith(FULFILLMENT_OPTION_IDS.PICKUP);
    },
};
