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
import GoogleIcon from '../google-icon';

const meta: Meta<typeof GoogleIcon> = {
    title: 'Core/Icons/Google Icon',
    component: GoogleIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Official multi-color Google "G" mark for use on "Sign in with Google" buttons.
Colors and proportions are fixed per Google's [branding guidelines](https://developers.google.com/identity/branding-guidelines).
                `,
            },
        },
    },
    argTypes: {
        className: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof GoogleIcon>;

export const Default: Story = {
    args: {
        className: 'size-5',
    },
};

export const Small: Story = {
    args: {
        className: 'size-4',
    },
    parameters: {
        docs: {
            description: {
                story: '16px variant — matches the Button component default SVG sizing.',
            },
        },
    },
};

export const Large: Story = {
    args: {
        className: 'size-8',
    },
};
