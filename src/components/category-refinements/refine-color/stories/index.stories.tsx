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
import RefineColor from '..';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { FilterValue } from '../../types';

// ---------------------------------------------------------------------------
// RefineColor takes RefinementProps — `values: FilterValue[]` plus selection
// callbacks. The visible state is fully a function of (a) the count of
// swatches and (b) the set of selected values (multi-select supported via
// per-value isFilterSelected calls). Both fold into Controls.
// ---------------------------------------------------------------------------

const ALL_COLOR_VALUES: FilterValue[] = [
    { value: 'Black', label: 'Black', hitCount: 43 },
    { value: 'Blue', label: 'Blue', hitCount: 27 },
    { value: 'Red', label: 'Red', hitCount: 1 },
    { value: 'Green', label: 'Green', hitCount: 4 },
    { value: 'White', label: 'White', hitCount: 30 },
    { value: 'Brown', label: 'Brown', hitCount: 15 },
    { value: 'Pink', label: 'Pink', hitCount: 3 },
    { value: 'Purple', label: 'Purple', hitCount: 0 },
    { value: 'Yellow', label: 'Yellow', hitCount: 0 },
    { value: 'Orange', label: 'Orange', hitCount: 0 },
    { value: 'Grey', label: 'Grey', hitCount: 13 },
    { value: 'Navy', label: 'Navy', hitCount: 0 },
];
const MAX_VALUES = ALL_COLOR_VALUES.length;

type SyntheticArgs = {
    valueCount: number;
    selectedValues: string;
};

const meta: Meta<typeof RefineColor> = {
    title: 'Category/Category Refinements/Refine Color',
    component: RefineColor,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Color filter inside the side-panel filters. Renders a 2-up (sm) / 3-up (lg) swatch grid; selected swatches get a ring and the label is bolded. Hit counts render below each name in parentheses.',
            },
        },
    },
};

export default meta;

/**
 * Rich-but-realistic baseline — 6 colors with "Black" pre-selected.
 * `valueCount` slices the canonical color list (1–12). `selectedValues` is
 * a comma-separated list of `value` fields to render as selected (multi-
 * select supported because `isFilterSelected` is called per swatch).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: 6,
        selectedValues: 'Black',
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of color swatches to render (1–${MAX_VALUES})`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedValues: {
            description:
                'Synthetic: comma-separated list of color values to render as selected (e.g. `Black,Blue`). Empty string = no selection.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? 6,
            selectedValues: args.selectedValues ?? '',
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const values = ALL_COLOR_VALUES.slice(0, clamped);
        const selectedSet = new Set(
            synthetic.selectedValues
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        );
        const isFilterSelected = (attributeId: string, value: string) =>
            attributeId === 'c_refinementColor' && selectedSet.has(value);
        return (
            <RefineColor
                values={values}
                attributeId="c_refinementColor"
                isFilterSelected={isFilterSelected}
                toggleFilter={action('color-toggle-filter')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const buttons = canvas.getAllByRole('button');
        await expect(buttons.length).toBeGreaterThan(0);
        const blackButton = buttons.find((btn) => btn.textContent?.includes('Black'));
        if (blackButton) {
            await userEvent.click(blackButton);
        }
    },
};
