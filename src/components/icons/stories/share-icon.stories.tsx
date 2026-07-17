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
import { ShareIcon } from '../share-icon';

const meta: Meta<typeof ShareIcon> = {
    title: 'Core/Icons/Share Icon',
    component: ShareIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Share icon button used to indicate sharing functionality on product pages.',
            },
        },
    },
    argTypes: {
        size: {
            control: 'select',
            options: ['sm', 'md', 'lg'],
        },
        className: { control: 'text' },
        onClick: { action: 'clicked' },
    },
};

export default meta;
type Story = StoryObj<typeof ShareIcon>;

export const Default: Story = {
    args: {},
};

export const Small: Story = {
    args: {
        size: 'sm',
    },
};

export const Medium: Story = {
    args: {
        size: 'md',
    },
};

export const Large: Story = {
    args: {
        size: 'lg',
    },
};

export const CustomClassName: Story = {
    args: {
        className: 'rounded-full hover:bg-accent',
    },
};
