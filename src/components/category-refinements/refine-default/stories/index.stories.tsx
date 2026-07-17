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
import RefineDefault from '..';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { FilterValue } from '../../types';

// ---------------------------------------------------------------------------
// RefineDefault is the catch-all checkbox-style filter group used for any
// attribute without a specialized renderer (brand, isNew, material, etc.).
// Visible state is fully a function of (a) the count of values rendered and
// (b) the set of selected values (multi-select via per-value
// isFilterSelected). Both fold into Controls.
// ---------------------------------------------------------------------------

const ALL_DEFAULT_VALUES: FilterValue[] = [
    { value: 'true', label: 'New Arrival', hitCount: 4 },
    { value: 'Brand A', label: 'Brand A', hitCount: 12 },
    { value: 'Brand B', label: 'Brand B', hitCount: 8 },
    { value: 'Brand C', label: 'Brand C', hitCount: 5 },
    { value: 'Brand D', label: 'Brand D', hitCount: 2 },
    { value: 'Brand E', label: 'Brand E', hitCount: 0 },
];
const MAX_VALUES = ALL_DEFAULT_VALUES.length;

type SyntheticArgs = {
    valueCount: number;
    selectedValues: string;
    attributeId: string;
};

const meta: Meta<typeof RefineDefault> = {
    title: 'Category/Category Refinements/Refine Default',
    component: RefineDefault,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Catch-all checkbox-list filter group used for any attribute without a specialized renderer. Renders one checkbox row per value, with label and hit-count pill.',
            },
        },
    },
};

export default meta;

/**
 * Rich-but-realistic baseline — 3 checkbox rows with "New Arrival" pre-checked.
 * `valueCount` slices the canonical fixture (1–6). `selectedValues` is a
 * comma-separated list of `value` fields to render checked. `attributeId`
 * exposes the prop directly so the story can verify a custom attribute name.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: 3,
        selectedValues: 'true',
        attributeId: 'c_isNew',
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of checkbox rows to render (1–${MAX_VALUES})`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedValues: {
            description:
                'Synthetic: comma-separated list of values to render checked (multi-select supported). Empty string = none.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        attributeId: {
            description: 'Direct prop: attribute id used in the checkbox `id` attribute and passed to callbacks.',
            control: 'text',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? 3,
            selectedValues: args.selectedValues ?? '',
            attributeId: args.attributeId ?? 'c_isNew',
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const values = ALL_DEFAULT_VALUES.slice(0, clamped);
        const selectedSet = new Set(
            synthetic.selectedValues
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        );
        const isFilterSelected = (attributeId: string, value: string) =>
            attributeId === synthetic.attributeId && selectedSet.has(value);
        return (
            <RefineDefault
                values={values}
                attributeId={synthetic.attributeId}
                isFilterSelected={isFilterSelected}
                toggleFilter={action('default-toggle-filter')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const checkboxes = canvas.getAllByRole('checkbox');
        await expect(checkboxes.length).toBeGreaterThan(0);
        await userEvent.click(checkboxes[0]);
    },
};
