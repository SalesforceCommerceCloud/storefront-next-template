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
import Logo from '../index';

const meta: Meta<typeof Logo> = {
    title: 'Layout/Logo',
    component: Logo,
    tags: ['autodocs'],
    parameters: {
        docs: {
            description: {
                component:
                    'Brand logo component. Renders the `/images/logo.svg` raster asset. Override this component at `@/components/logo` for brand-specific logos. Sizing is controlled by the caller via `className`.',
            },
        },
    },
    argTypes: {
        // `className` controls sizing/filter from the call site (e.g. the header
        // and error page pass `h-4 w-auto`). Hidden from Controls as utility noise.
        className: { control: false, table: { disable: true } },
        alt: {
            control: 'text',
            description: 'Accessible alt text for the logo image.',
            table: { defaultValue: { summary: "'Logo'" } },
        },
    },
};

export default meta;
type Story = StoryObj<typeof Logo>;

export const Default: Story = {
    args: { className: 'h-8 w-auto' },
};

export const CustomAlt: Story = {
    args: { className: 'h-8 w-auto', alt: 'RefArch Global' },
};
