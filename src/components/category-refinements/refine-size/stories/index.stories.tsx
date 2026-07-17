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
import RefineSize from '..';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { FilterValue } from '../../types';

// ---------------------------------------------------------------------------
// RefineSize is a flex-wrap pill list — one outline button per size value,
// selected pills get a darker border. Multi-select supported because
// `isFilterSelected` is called per value. Visible state is fully a function
// of (a) value count and (b) the set of selected values. Both fold into
// Controls.
// ---------------------------------------------------------------------------

const ALL_SIZE_VALUES: FilterValue[] = [
    { value: 'XS', label: 'XS', hitCount: 5 },
    { value: 'S', label: 'S', hitCount: 8 },
    { value: 'M', label: 'M', hitCount: 8 },
    { value: 'L', label: 'L', hitCount: 6 },
    { value: 'XL', label: 'XL', hitCount: 7 },
    { value: '4', label: '4', hitCount: 31 },
    { value: '6', label: '6', hitCount: 32 },
    { value: '8', label: '8', hitCount: 32 },
    { value: '10', label: '10', hitCount: 34 },
    { value: '12', label: '12', hitCount: 31 },
    { value: '14', label: '14', hitCount: 33 },
    { value: '16', label: '16', hitCount: 0 },
];
const MAX_VALUES = ALL_SIZE_VALUES.length;

type SyntheticArgs = {
    valueCount: number;
    selectedValues: string;
};

const meta: Meta<typeof RefineSize> = {
    title: 'Category/Category Refinements/Refine Size',
    component: RefineSize,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Size filter inside the side-panel filters. Renders a flex-wrap pill list of outline buttons, one per size value, with hit count. Selected pills get a darker border. Multi-select supported.',
            },
        },
    },
};

export default meta;

/**
 * Rich-but-realistic baseline — 5 lettered sizes (XS–XL) with "M" pre-selected.
 * `valueCount` slices the canonical list (1–12; the long list mixes letter
 * sizes and numeric clothing sizes). `selectedValues` is a comma-separated
 * list of `value` fields to render selected (multi-select supported).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: 5,
        selectedValues: 'M',
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of size pills to render (1–${MAX_VALUES}). Letter sizes 1–5; numeric sizes 6–12; last entry has hitCount=0.`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedValues: {
            description:
                'Synthetic: comma-separated list of size values to render selected (e.g. `S,M,L`). Empty string = no selection.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? 5,
            selectedValues: args.selectedValues ?? '',
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const values = ALL_SIZE_VALUES.slice(0, clamped);
        const selectedSet = new Set(
            synthetic.selectedValues
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        );
        const isFilterSelected = (attributeId: string, value: string) =>
            attributeId === 'c_size' && selectedSet.has(value);
        return (
            <RefineSize
                values={values}
                attributeId="c_size"
                isFilterSelected={isFilterSelected}
                toggleFilter={action('size-toggle-filter')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const buttons = canvas.getAllByRole('button');
        await expect(buttons.length).toBeGreaterThan(0);
        const mButton = buttons.find((btn) => btn.textContent?.includes('M'));
        if (mButton) await userEvent.click(mButton);
    },
};
