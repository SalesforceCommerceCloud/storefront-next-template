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
import { FulfillmentOptionPicker } from '../fulfillment-option-picker';
import { FULFILLMENT_OPTION_IDS } from '../types';

const options = [
    {
        id: FULFILLMENT_OPTION_IDS.DELIVERY,
        label: 'Send to my address',
        description: 'Arrives in three days',
        availability: { available: true },
    },
    {
        id: FULFILLMENT_OPTION_IDS.PICKUP,
        label: 'Collect nearby',
        description: 'No locations available',
        availability: { available: false, disabledReason: 'No locations available' },
    },
];

const meta = {
    title: 'Fulfillment/Fulfillment Option Picker',
    component: FulfillmentOptionPicker,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: { description: { component: 'Displays fulfillment choices as accessible radio cards.' } },
    },
    argTypes: {
        onChange: { table: { disable: true } },
        onOptionClick: { table: { disable: true } },
        renderTitle: { table: { disable: true } },
        getOptionAriaLabel: { table: { disable: true } },
        getOptionAriaDescription: { table: { disable: true } },
        renderDetails: { table: { disable: true } },
        getOptionId: { table: { disable: true } },
    },
} satisfies Meta<typeof FulfillmentOptionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        value: FULFILLMENT_OPTION_IDS.PICKUP,
        options,
        onChange: fn(),
    },
    play: async ({ args, canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const delivery = canvas.getByRole('radio', { name: 'Send to my address' });

        await userEvent.click(delivery);

        await expect(args.onChange).toHaveBeenCalledWith(FULFILLMENT_OPTION_IDS.DELIVERY);
        await expect(canvas.getByRole('radio', { name: 'Collect nearby' })).toBeDisabled();
    },
};
