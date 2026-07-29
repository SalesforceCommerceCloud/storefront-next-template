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
import FiltersButton from '..';
import { action } from 'storybook/actions';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

// ---------------------------------------------------------------------------
// FiltersButton is a tiny presentational button. Its visible state is fully
// determined by three direct props — `isActive`, `selectedFiltersCount`, and
// `className` — all of which Controls drives natively. The Default vs Active
// vs Clicked variants are just different prop values and a click play
// function; viewport reruns belong to the global toolbar, not dedicated
// stories.
// ---------------------------------------------------------------------------

const meta: Meta<typeof FiltersButton> = {
    title: 'Category/Category Refinements/Filters Button',
    component: FiltersButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Button that toggles the PLP filters panel. Variant flips between outline (closed) and default (open) via `isActive`; an optional badge shows `selectedFiltersCount` when > 0.',
            },
        },
    },
    args: {
        onClick: action('filters-button-clicked'),
    },
    argTypes: {
        isActive: {
            description: 'Whether the filters panel is currently open. Drives the variant (outline vs default).',
            control: 'boolean',
        },
        selectedFiltersCount: {
            description: 'Number of currently applied filters. Renders a badge when > 0.',
            control: { type: 'number', min: 0, max: 99, step: 1 },
        },
        className: {
            description: 'Additional Tailwind classes appended to the button.',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Rich-but-realistic baseline — closed panel with three active filters
 * (badge "3"). Drive `isActive`, `selectedFiltersCount`, and `className`
 * from the Controls panel; the play function exercises the click behaviour.
 */
export const FullyFeatured: Story = {
    args: {
        isActive: false,
        selectedFiltersCount: 3,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button');
        await expect(button).toBeInTheDocument();
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await expect(canvas.getByText('3')).toBeInTheDocument();
        await userEvent.click(button);
    },
};
