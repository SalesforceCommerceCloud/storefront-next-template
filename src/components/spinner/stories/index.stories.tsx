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
import { Spinner } from '../index';

const meta: Meta<typeof Spinner> = {
    title: 'Core/Feedback/Spinner',
    component: Spinner,
    tags: ['autodocs'],
    parameters: {
        docs: {
            description: {
                component:
                    'Loading spinner with size variants using class-variance-authority. Use the Controls panel to flip between `sm` / `md` / `lg` / `xl`.',
            },
        },
    },
    argTypes: {
        size: {
            control: { type: 'radio' },
            options: ['sm', 'md', 'lg', 'xl'],
            description: 'Size variant of the spinner',
            table: {
                type: { summary: "'sm' | 'md' | 'lg' | 'xl'" },
                defaultValue: { summary: "'md'" },
            },
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        // For status colors (e.g. destructive), prefer adding a cva `status`
        // variant rather than overriding `border-t-*` from the call site.
        className: { control: false, table: { disable: true } },
    },
    decorators: [
        (Story) => (
            <div className="min-h-[40vh] bg-background flex items-center justify-center">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default spinner — flip `size` in Controls to see the `sm` / `md` / `lg` /
 * `xl` variants. Replaces the dedicated per-size stories that each varied
 * a single prop.
 */
export const Default: Story = {
    args: {
        size: 'md',
    },
};
