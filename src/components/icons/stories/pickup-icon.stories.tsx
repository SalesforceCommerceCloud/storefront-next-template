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
import { PickupIcon } from '../pickup-icon';

const meta: Meta<typeof PickupIcon> = {
    title: 'Core/Icons/Pickup Icon',
    component: PickupIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Building/store icon used to indicate in-store pickup availability on product tiles.',
            },
        },
    },
    argTypes: {
        className: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof PickupIcon>;

export const Default: Story = {
    args: {},
};

export const Sized: Story = {
    args: {
        className: 'w-6 h-6',
    },
};

export const Colored: Story = {
    args: {
        className: 'w-5 h-5 text-primary',
    },
};
