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

/**
 * `Theme/Radius` — corner-radius reference for the active vertical.
 *
 * The one themeable radius token is `--ui-radius`, bridged into the `rounded-ui`
 * utility (fashion = `0` / sharp; cosmetic = `var(--radius-xl)` / soft). The
 * `rounded-ui` box below renders the active vertical's value. The remaining
 * boxes use Tailwind's default radius scale (literal classes, no custom tokens)
 * as reference.
 */

/** Themeable token box (`rounded-ui`, first) followed by Tailwind defaults. */
const RADII: { className: string; label: string }[] = [
    { className: 'rounded-ui', label: 'rounded-ui · --ui-radius (themed)' },
    { className: 'rounded-none', label: 'rounded-none' },
    { className: 'rounded-sm', label: 'rounded-sm' },
    { className: 'rounded-md', label: 'rounded-md' },
    { className: 'rounded-lg', label: 'rounded-lg' },
    { className: 'rounded-xl', label: 'rounded-xl' },
    { className: 'rounded-2xl', label: 'rounded-2xl' },
    { className: 'rounded-full', label: 'rounded-full' },
];

const meta: Meta = {
    title: 'Theme/Radius',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Corner-radius reference. `rounded-ui` is the one themeable radius (`--ui-radius`) and reflects the active vertical (fashion = sharp `0`; cosmetic = soft). The remaining boxes are Tailwind framework defaults.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const AllRadii: Story = {
    name: 'All Radii',
    render: () => (
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {RADII.map(({ className, label }) => (
                <div
                    key={label}
                    className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
                    <div className={`h-20 w-20 border-2 border-primary bg-muted ${className}`} />
                    <code className="text-center text-xs text-foreground break-all">{label}</code>
                </div>
            ))}
        </div>
    ),
};
