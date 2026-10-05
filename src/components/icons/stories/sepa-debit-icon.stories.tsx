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
import SepaDebitIcon from '../sepa-debit-icon';

const meta: Meta<typeof SepaDebitIcon> = {
    title: 'Core/Icons/SEPA Debit Icon',
    component: SepaDebitIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'SEPA Direct Debit wordmark used on saved payment methods and remove-confirmation UI when the instrument type is `sepa_debit`.',
            },
        },
    },
    argTypes: {
        className: { control: 'text' },
        width: { control: 'number' },
        height: { control: 'number' },
    },
};

export default meta;
type Story = StoryObj<typeof SepaDebitIcon>;

/** Default size matching payment-method list / remove dialog usage. */
export const Default: Story = {
    args: {
        width: 40,
        height: 32,
        className: 'max-w-[40px] max-h-[32px]',
    },
};

export const Compact: Story = {
    args: {
        width: 36,
        height: 13,
    },
};
