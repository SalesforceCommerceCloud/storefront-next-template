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
import { SparklesIcon } from '../sparkles-icon';

const meta: Meta<typeof SparklesIcon> = {
    title: 'Core/Icons/Sparkles Icon',
    component: SparklesIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Reusable sparkles (four-pointed star) icon. Used in header chat button, AI review summary, and other AI/chat features.
                `,
            },
        },
    },
    argTypes: {
        className: { control: 'text' },
        'aria-hidden': { control: 'boolean' },
    },
};

export default meta;
type Story = StoryObj<typeof SparklesIcon>;

export const Default: Story = {
    args: {},
};

export const WithBrandColor: Story = {
    args: {
        style: { color: 'var(--primary)' },
    },
    parameters: {
        docs: {
            description: {
                story: 'Sparkles icon with brand primary color, e.g. for header chat button.',
            },
        },
    },
};

export const Larger: Story = {
    args: {
        className: 'w-6 h-6',
    },
};
