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
// RefineCategory (cgid) takes RefinementProps — a `values: FilterValue[]` list
// plus selection callbacks. It renders a SINGLE-SELECT radio group for a
// promoted category level, e.g. an "activity" parent whose child categories
// become the sidebar facet (SCAPI `cgid` is single-valued). SCAPI returns cgid
// refinements hierarchically, so a parent value carries its children in
// `.values`; the component flattens to the leaf children. Visible state is a
// function of (a) how many leaf values render and (b) which one is selected.
// ---------------------------------------------------------------------------

const ALL_CATEGORY_VALUES: FilterValue[] = [
    { value: 'mens', label: 'Mens', hitCount: 42 },
    { value: 'womens', label: 'Womens', hitCount: 36 },
    { value: 'electronics', label: 'Electronics', hitCount: 18 },
    { value: 'accessories', label: 'Accessories', hitCount: 24 },
];
const MAX_VALUES = ALL_CATEGORY_VALUES.length;

// Hierarchical payload as SCAPI returns it for a promoted parent category: one
// "activity" parent whose `.values` are the child categories the sidebar shows.
const HIERARCHICAL_ACTIVITY_VALUES: FilterValue[] = [
    {
        value: 'activity',
        label: 'Activity',
        hitCount: 160,
        values: [
            { value: 'running', label: 'Running', hitCount: 42 },
            { value: 'trail', label: 'Trail', hitCount: 18 },
            { value: 'training', label: 'Training', hitCount: 24 },
            { value: 'walking', label: 'Walking', hitCount: 20 },
            { value: 'casual', label: 'Casual', hitCount: 56 },
        ],
    },
];

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
                    'Single-select radio facet for a category (`cgid`) refinement promoted into the side-panel filters. SCAPI `cgid` is single-valued, so selecting a category replaces the active one. Renders one radio row per leaf category, with label and hit-count pill. Flattens SCAPI hierarchical values to the child categories.',
            },
        },
    },
};

export default meta;

/**
 * Rich-but-realistic baseline — four categories with "Mens" pre-selected.
 * `valueCount` slices the canonical list (1–4); `selectedValue` is the single
 * active `value` (empty string = none). cgid is single-select.
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
            description: 'Synthetic: the single selected `value` (single-select). Empty string = none.',
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
        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBeGreaterThan(0);
        await userEvent.click(radios[0]);
    },
};

/**
 * Hierarchical payload — an "activity" parent category whose child categories
 * (running, trail, training, walking, casual) are flattened into the radio
 * group. This is the shape SCAPI returns when a parent category is promoted to
 * the sidebar facet (footwear "Shop by Activity").
 */
export const HierarchicalActivity: StoryObj<ComponentType> = {
    render: () => {
        const isFilterSelected = (attributeId: string, value: string) => attributeId === 'cgid' && value === 'running';
        return (
            <RefineCategory
                values={HIERARCHICAL_ACTIVITY_VALUES}
                attributeId="cgid"
                isFilterSelected={isFilterSelected}
                toggleFilter={action('cgid-toggle-filter')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Five leaf activity categories render as radios (parent is flattened away).
        const radios = canvas.getAllByRole('radio');
        await expect(radios).toHaveLength(5);
        await userEvent.click(radios[1]);
    },
};
