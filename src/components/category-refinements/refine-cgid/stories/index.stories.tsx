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
import RefineCategory from '..';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { FilterValue } from '../../types';

// ---------------------------------------------------------------------------
// RefineCategory (cgid) takes RefinementProps — a `values: FilterValue[]`
// list plus selection callbacks. The visible variation is entirely a function
// of (a) how many values are rendered and (b) which one is currently selected
// (drives the border highlight). Both fold into Controls.
// ---------------------------------------------------------------------------

const ALL_CATEGORY_VALUES: FilterValue[] = [
    { value: 'mens', label: 'Mens', hitCount: 42 },
    { value: 'womens', label: 'Womens', hitCount: 36 },
    { value: 'electronics', label: 'Electronics', hitCount: 18 },
    { value: 'accessories', label: 'Accessories', hitCount: 24 },
];
const MAX_VALUES = ALL_CATEGORY_VALUES.length;

type SyntheticArgs = {
    valueCount: number;
    selectedValue: string;
};

const meta: Meta<typeof RefineCategory> = {
    title: 'Category/Category Refinements/Refine Category',
    component: RefineCategory,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Sub-category navigation list inside the side-panel filters. Renders one link-style button per value in `values`; the selected value gets a border highlight.',
            },
        },
    },
};

export default meta;

/**
 * Rich-but-realistic baseline — four categories with "Mens" pre-selected.
 * `valueCount` slices the canonical list (1–4); `selectedValue` is the
 * `value` of the highlighted entry (empty string = no selection).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: MAX_VALUES,
        selectedValue: 'mens',
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of category values to render (1–${MAX_VALUES})`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedValue: {
            description:
                'Synthetic: `value` of the currently-selected category. Empty string = nothing selected. Drives the border-highlight on the matching button.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? MAX_VALUES,
            selectedValue: args.selectedValue ?? '',
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const values = ALL_CATEGORY_VALUES.slice(0, clamped);
        const isFilterSelected = (attributeId: string, value: string) =>
            attributeId === 'cgid' && value === synthetic.selectedValue;
        return (
            <RefineCategory
                values={values}
                attributeId="cgid"
                isFilterSelected={isFilterSelected}
                toggleFilter={action('cgid-toggle-filter')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const buttons = canvas.getAllByRole('button');
        await expect(buttons.length).toBeGreaterThan(0);
        await userEvent.click(buttons[0]);
    },
};
