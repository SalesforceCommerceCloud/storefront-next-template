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
import RecentSearches from '../recent-searches';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// RecentSearches takes a string array and renders one button per entry plus a
// trailing "Clear recent searches" button. Visible state is fully a function
// of the array length: empty → component renders an empty wrapper (no list,
// no clear button). All variation folds cleanly into Controls. The empty
// case is kept as a dedicated story so the no-content render is bookmarkable.
//
// `closeAndNavigate` and `clearRecentSearches` callbacks bind to `action()`
// directly via component props — no decorator-level click synthesis needed.
// ---------------------------------------------------------------------------

const ALL_RECENT_SEARCHES = [
    'shoes',
    'boots',
    'sneakers',
    'sandals',
    'flip flops',
    'running shoes',
    'hiking boots',
    'dress shoes',
];
const MAX_RECENT = ALL_RECENT_SEARCHES.length;

const meta: Meta<typeof RecentSearches> = {
    title: 'Search/Recent Searches',
    component: RecentSearches,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Recent-searches list shown in the search dropdown when no fresh suggestions are available. Renders one button per entry plus a trailing "Clear recent searches" button.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;

type SyntheticArgs = {
    searchCount: number;
};

/**
 * Rich-but-realistic baseline — 3 recent searches plus the trailing "Clear"
 * button. Use Controls to slice the canonical list (1–8) or set to 0 for
 * the empty branch.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        searchCount: 3,
    },
    argTypes: {
        searchCount: {
            description: `Synthetic: number of recent-search buttons to render (0–${MAX_RECENT}). Setting to 0 shows the empty wrapper (no list, no clear button).`,
            control: { type: 'number', min: 0, max: MAX_RECENT, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            searchCount: args.searchCount ?? 3,
        };
        const clamped = Math.max(0, Math.min(synthetic.searchCount, MAX_RECENT));
        const recentSearches = ALL_RECENT_SEARCHES.slice(0, clamped);
        return (
            <RecentSearches
                recentSearches={recentSearches}
                closeAndNavigate={action('closeAndNavigate')}
                clearRecentSearches={action('clearRecentSearches')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const recentSearchesTitles = await canvas.findAllByText(/recent searches/i, {}, { timeout: 5000 });
        await expect(recentSearchesTitles.length).toBeGreaterThan(0);
    },
};

/**
 * Empty `recentSearches` array. The component renders an empty section
 * wrapper — no list, no clear button. Worth a bookmarkable URL because the
 * resulting visual is fundamentally different (nothing visible at all).
 */
export const Empty: StoryObj<typeof RecentSearches> = {
    args: {
        recentSearches: [],
        closeAndNavigate: action('closeAndNavigate'),
        clearRecentSearches: action('clearRecentSearches'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByText(/recent searches/i)).not.toBeInTheDocument();
        await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    },
};
