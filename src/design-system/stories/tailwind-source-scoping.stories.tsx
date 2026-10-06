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

const meta = {
    title: 'Design System/Regression/Tailwind Source Scoping',
    parameters: {
        layout: 'centered',
    },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * These literal candidates deliberately occur only in a story. The Tailwind
 * source-policy regression check verifies that Storybook emits them while the
 * production stylesheet does not.
 */
export const StoryOnlyUtilities: Story = {
    render: () => (
        <div data-testid="tailwind-story-only-fixture">
            <span className="block bg-background text-brand-black-off">Story-only source fixture</span>
            {/* Exercise the background candidate on a decorative swatch that contains no text. */}
            <div className="h-16 w-[137px] sm:h-[73px] bg-sidebar-ring" aria-hidden="true" />
        </div>
    ),
};
