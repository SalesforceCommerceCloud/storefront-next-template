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
import ActiveFilters from '..';
import { useEffect, type ComponentType } from 'react';
import { useNavigate } from '@/hooks/use-navigate';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import searchResults from '@/components/__mocks__/search-results';
import type { ShopperSearch } from '@/scapi';

// ---------------------------------------------------------------------------
// ActiveFilters takes a single prop, `result: ProductSearchResult`, but the
// chips it renders are driven by URL `refine` query params (read via
// useLocation). The fixture supplies the lookup tables (refinement metadata
// → human-readable labels); the URL drives which chips appear.
//
// Visible variation is therefore entirely a function of how many `refine=...`
// pairs are in the URL. That folds into a single Controls toggle:
// `preSelectedRefines` — a comma-separated list of `attributeId=value` pairs.
// Empty string → component returns null (kept as dedicated `NoActiveFilters`).
//
// The component owns its click handling (writes URL via navigate), so no
// action-logging decorator is needed. RouteSetter syncs Controls-driven URL
// changes after first render; the default URL is set via
// `parameters.initialEntries` so the at-rest snapshot/render renders without
// waiting for an effect to fire.
// ---------------------------------------------------------------------------

function RouteSetter({ initialEntries }: { initialEntries: string[] }) {
    const navigate = useNavigate();
    useEffect(() => {
        if (initialEntries[0]) {
            navigate(initialEntries[0], { replace: true });
        }
    }, [initialEntries, navigate]);
    return null;
}

function buildRefineSearch(preSelectedRefines: string): string {
    const pairs = preSelectedRefines
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (pairs.length === 0) return '/';
    return `/?${pairs.map((p) => `refine=${p}`).join('&')}`;
}

const meta: Meta<typeof ActiveFilters> = {
    title: 'Category/Category Refinements/Active Filters',
    component: ActiveFilters,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Active-filter chip row for Product Listing Pages. Reads `refine` URL params and renders one removable chip per active filter (cgid is hidden — owned by QuickFilters). Returns null when no filters are active.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

type SyntheticArgs = {
    preSelectedRefines: string;
};

const mockSearchResult = searchResults as ShopperSearch.schemas['ProductSearchResult'];

/**
 * Rich-but-realistic baseline — two active filters from the merchant fixture
 * (Black + Size M). `preSelectedRefines` is a comma-separated list of
 * `attributeId=value` pairs that drives the URL `refine` params.
 *
 * Empty string → component returns null (matches the `NoActiveFilters` story).
 * Add more pairs (e.g. `c_refinementColor=Black,c_refinementColor=Pink,
 * c_isNew=true`) to verify multiple chips and clear-all behaviour.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        preSelectedRefines: 'c_refinementColor=Black,c_size=M',
    },
    argTypes: {
        preSelectedRefines: {
            description:
                'Synthetic: comma-separated "attributeId=value" pairs. Each pair becomes a `refine=` URL param, which the component reads to render chips.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    parameters: {
        // Seed the snapshot/at-rest render with the URL matching the default
        // preSelectedRefines arg so `useLocation()` resolves before first paint.
        // RouteSetter still drives Controls-driven re-renders for live toggling.
        initialEntries: ['/?refine=c_refinementColor%3DBlack&refine=c_size%3DM'],
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            preSelectedRefines: args.preSelectedRefines ?? '',
        };
        const initialUrl = buildRefineSearch(synthetic.preSelectedRefines);
        return (
            <>
                <RouteSetter initialEntries={[initialUrl]} />
                <ActiveFilters result={mockSearchResult} />
            </>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Chip text comes from the merchant fixture's labels (e.g. "Black", "M");
        // assert at least one chip from the seeded URL is rendered.
        const blackChip = await canvas.findByText('Black', {}, { timeout: 5000 });
        await expect(blackChip).toBeInTheDocument();
    },
};

/**
 * No filters active — the component returns null. Worth a bookmarkable URL
 * to assert the null-render explicitly.
 */
export const NoActiveFilters: Story = {
    args: {
        result: mockSearchResult,
    },
    decorators: [
        (Story: ComponentType, context) => (
            <>
                <RouteSetter initialEntries={['/']} />
                <Story {...(context.args as Record<string, unknown>)} />
            </>
        ),
    ],
    play: async ({ canvasElement }) => {
        const activeFiltersText = canvasElement.querySelector('p');
        if (activeFiltersText) {
            await expect(activeFiltersText).not.toHaveTextContent(/active filters/i);
        }
    },
};
