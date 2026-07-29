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
import type { ComponentType } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import type { ShopperSearch } from '@/scapi';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';

const mockSite = mockSiteObject;
import CategoryRefinements from '../index';
import searchResults from '@/components/__mocks__/search-results';

// ---------------------------------------------------------------------------
// CategoryRefinements takes two props:
//   - result.refinements — the array of filter groups (the "interface")
//   - refine — a string[] of active "attributeId=value" filters
// The component filters out the cgid group internally (handled by
// QuickFilters elsewhere). The 5-group fixture therefore renders 4 sections.
// Visible variations are entirely a function of:
//   (a) how many refinement groups are present
//   (b) whether any filters are pre-selected (drives defaultOpen and the
//       optimistic-check state of values)
// Both fold into Controls — the synthetic args build the result + refine
// pair from the merchant fixture.
// ---------------------------------------------------------------------------

const fullSearchResult = searchResults as ShopperSearch.schemas['ProductSearchResult'];

// Filter out cgid (the component does this too) so the count exposed via
// Controls matches what the user sees.
const visibleRefinements = (fullSearchResult.refinements ?? []).filter((r) => r.attributeId !== 'cgid');
const MAX_REFINEMENTS = visibleRefinements.length;

type SyntheticArgs = {
    refinementCount: number;
    preSelectedRefines: string;
};

function buildResult({ refinementCount }: SyntheticArgs): ShopperSearch.schemas['ProductSearchResult'] {
    const clamped = Math.max(0, Math.min(refinementCount, MAX_REFINEMENTS));
    return {
        ...fullSearchResult,
        refinements: visibleRefinements.slice(0, clamped),
    };
}

function buildRefine(preSelectedRefines: string): string[] {
    return preSelectedRefines
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

const meta: Meta<typeof CategoryRefinements> = {
    title: 'Category/Category Refinements',
    component: CategoryRefinements,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Side-panel filter controls for Product Listing Pages. Renders a collapsible section per refinement group from `result.refinements` (cgid is filtered out — that group is owned by QuickFilters). Sections with active filters auto-expand.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    decorators: [
        (Story: ComponentType) => (
            <SiteProvider
                site={mockSite}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <Story />
            </SiteProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CategoryRefinements>;
type StoryWithSynthetic = StoryObj<React.ComponentType<Partial<SyntheticArgs>>>;

/**
 * Rich-but-realistic baseline. Drives both the data shape and the
 * pre-selected filters from the Controls panel.
 *
 * - `refinementCount` (1–4) slices the merchant fixture so QA can verify
 *   one-section, two-section, and full-panel layouts without hand-editing.
 * - `preSelectedRefines` is a comma-separated list of `attributeId=value`
 *   strings (e.g. `c_refinementColor=Black,price=(50..100)`). Sections with
 *   any active value auto-expand. Empty string = no pre-selected filters.
 */
export const FullyFeatured: StoryWithSynthetic = {
    args: {
        refinementCount: MAX_REFINEMENTS,
        preSelectedRefines: '',
    },
    argTypes: {
        refinementCount: {
            description: `Synthetic: number of refinement groups to render (0–${MAX_REFINEMENTS})`,
            control: { type: 'number', min: 0, max: MAX_REFINEMENTS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        preSelectedRefines: {
            description:
                'Synthetic: comma-separated "attributeId=value" pairs treated as active. Sections with any active value auto-expand.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            refinementCount: args.refinementCount ?? MAX_REFINEMENTS,
            preSelectedRefines: args.preSelectedRefines ?? '',
        };
        return (
            <CategoryRefinements result={buildResult(synthetic)} refine={buildRefine(synthetic.preSelectedRefines)} />
        );
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Section headers should equal refinementCount (each renders one button trigger)
        const expectedCount = args.refinementCount ?? MAX_REFINEMENTS;
        const headers = canvas.queryAllByRole('button');
        await expect(headers.length).toBeGreaterThanOrEqual(expectedCount);
    },
};

/**
 * No refinements available — the component renders a "no filter options
 * available" empty-state message instead of any filter sections. Visually
 * distinct enough to deserve a bookmarkable URL.
 */
export const Empty: Story = {
    args: {
        result: {
            ...fullSearchResult,
            refinements: [],
        },
        refine: [],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/no filter options available/i)).toBeInTheDocument();
    },
};
