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
 * `Theme/Shadows` — drop-shadow reference for the active vertical.
 *
 * The one themeable shadow token is `--ui-shadow`, bridged into the `shadow-ui`
 * utility (fashion = `none`; cosmetic = a soft elevation). The `shadow-ui` card
 * below renders the active vertical's value. The remaining cards use Tailwind's
 * default shadow scale (literal classes, no custom tokens) as reference. Every
 * card keeps a `border` so a `none`/flat shadow is still visible.
 */

/** Themeable token card (`shadow-ui`, first) followed by Tailwind defaults. */
const SHADOWS: { className: string; label: string }[] = [
    { className: 'shadow-ui', label: 'shadow-ui · --ui-shadow (themed)' },
    { className: 'shadow-none', label: 'shadow-none' },
    { className: 'shadow-sm', label: 'shadow-sm' },
    { className: 'shadow', label: 'shadow' },
    { className: 'shadow-md', label: 'shadow-md' },
    { className: 'shadow-lg', label: 'shadow-lg' },
    { className: 'shadow-xl', label: 'shadow-xl' },
];

const meta: Meta = {
    title: 'Theme/Shadows',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Drop-shadow reference. `shadow-ui` is the one themeable shadow (`--ui-shadow`) and reflects the active vertical (fashion = `none`; cosmetic = soft elevation). The remaining cards are Tailwind framework defaults. Cards keep a border so a flat shadow is still visible.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const AllShadows: Story = {
    name: 'All Shadows',
    render: () => (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SHADOWS.map(({ className, label }) => (
                <div
                    key={label}
                    className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 px-6 py-10">
                    <div className={`h-20 w-20 rounded-lg border border-border bg-card ${className}`} />
                    <code className="text-center text-xs text-foreground break-all">{label}</code>
                </div>
            ))}
        </div>
    ),
};
