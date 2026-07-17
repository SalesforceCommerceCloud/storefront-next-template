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
import { allModes } from '../../../../.storybook/modes';
import CategorySorting from '../index';
import type { ComponentType } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import searchResults from '@/components/__mocks__/search-results';
import type { ShopperSearch } from '@/scapi';

// ---------------------------------------------------------------------------
// CategorySorting reads `sortingOptions` and `selectedSortingOption` off the
// ProductSearchResult fixture and renders a labeled `<select>`. Visible
// state is fully a function of (a) the count of options and (b) which one
// is selected. Both fold into Controls. Empty options array stays as a
// dedicated story because the component returns null — a fundamentally
// different visual state worth a bookmarkable URL.
//
// The component owns its own onChange handling (writes to URL via navigate),
// so no action-logging decorator is needed — Controls + the live URL bar
// already make changes observable.
// ---------------------------------------------------------------------------

const mockSearchResult = searchResults as ShopperSearch.schemas['ProductSearchResult'];
const ALL_SORTING_OPTIONS = mockSearchResult.sortingOptions ?? [];
const MAX_OPTIONS = ALL_SORTING_OPTIONS.length;

type SyntheticArgs = {
    optionCount: number;
    selectedSortingOption: string;
};

const meta: Meta<typeof CategorySorting> = {
    title: 'Category/Category Sorting',
    component: CategorySorting,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Sort dropdown for category and search result pages. Renders a labeled `<select>` with one option per `result.sortingOptions[]`. Returns null when the options list is empty.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Rich-but-realistic baseline — full canonical sorting options list with
 * "best-matches" pre-selected. Use Controls to slice the options or change
 * the selection.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        optionCount: MAX_OPTIONS,
        selectedSortingOption: 'best-matches',
    },
    argTypes: {
        optionCount: {
            description: `Synthetic: number of sorting options to render (1–${MAX_OPTIONS})`,
            control: { type: 'number', min: 1, max: MAX_OPTIONS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedSortingOption: {
            description: 'Synthetic: the `id` of the option to render selected. Empty string = no explicit selection.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            optionCount: args.optionCount ?? MAX_OPTIONS,
            selectedSortingOption: args.selectedSortingOption ?? '',
        };
        const clamped = Math.max(1, Math.min(synthetic.optionCount, MAX_OPTIONS));
        const options = ALL_SORTING_OPTIONS.slice(0, clamped);
        const result: ShopperSearch.schemas['ProductSearchResult'] = {
            ...mockSearchResult,
            sortingOptions: options,
            selectedSortingOption: synthetic.selectedSortingOption || undefined,
        };
        return <CategorySorting result={result} />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const label = canvas.getByText(/sort by/i);
        await expect(label).toBeInTheDocument();
        const select = canvas.getByRole<HTMLSelectElement>('combobox');
        await expect(select).toBeInTheDocument();
        if (select.options[1]?.value) {
            await userEvent.selectOptions(select, select.options[1].value);
        }
    },
};

/**
 * Empty `sortingOptions` array — component returns null. Worth a
 * bookmarkable URL to assert this null-render explicitly.
 */
export const NoSortingOptions: Story = {
    args: {
        result: {
            ...mockSearchResult,
            sortingOptions: [],
            selectedSortingOption: undefined,
        } as ShopperSearch.schemas['ProductSearchResult'],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const select = canvasElement.querySelector('select');
        await expect(select).not.toBeInTheDocument();
    },
};
