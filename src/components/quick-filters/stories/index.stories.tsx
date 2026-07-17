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
import QuickFilters from '../index';
import { useEffect, type ComponentType } from 'react';
import { within, expect, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useNavigate } from '@/hooks/use-navigate';
import type { ShopperProducts } from '@/scapi';

// ---------------------------------------------------------------------------
// QuickFilters takes a `category` object and renders one chip per
// `category.categories[]` entry. Visible state is fully a function of (a)
// the count of subcategories and (b) which one is the active `cgid` in the
// URL. Both fold into Controls. Empty `category.categories` returns null —
// kept as a dedicated story.
//
// The component owns its click handling (writes URL via navigate). RouteSetter
// keeps Controls-driven `activeCategoryId` in sync with the URL after first
// render; the default URL is set via `parameters.initialEntries`.
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

const ALL_SUBCATEGORIES: NonNullable<ShopperProducts.schemas['Category']['categories']> = [
    { id: 'womens-tops', name: 'Tops' },
    { id: 'womens-bottoms', name: 'Bottoms' },
    { id: 'womens-dresses', name: 'Dresses' },
    { id: 'womens-outerwear', name: 'Outerwear' },
    { id: 'womens-shoes', name: 'Shoes' },
    { id: 'womens-accessories', name: 'Accessories' },
    { id: 'womens-bags', name: 'Bags' },
    { id: 'womens-jewelry', name: 'Jewelry' },
];
const MAX_VALUES = ALL_SUBCATEGORIES.length;

type SyntheticArgs = {
    valueCount: number;
    activeCategoryId: string;
    showLabels: boolean;
};

const meta: Meta<typeof QuickFilters> = {
    title: 'Category/Quick Filters',
    component: QuickFilters,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Horizontal chip row of subcategory quick filters. Reads `category.categories[]` and renders one outline button per entry; the chip whose `cgid` is active in the URL gets the filled `default` variant.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Rich-but-realistic baseline — 4 subcategories with no active `cgid`.
 * `valueCount` slices the canonical list (1–8). `activeCategoryId` seeds
 * the URL `refine=cgid=...` to drive the active-chip state. `showLabels`
 * toggles whether `name` is set on each subcategory (off = falls back to
 * the raw `id`).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: 4,
        activeCategoryId: '',
        showLabels: true,
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of subcategory chips to render (1–${MAX_VALUES})`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        activeCategoryId: {
            description:
                'Synthetic: seeds `refine=cgid=<id>` in the URL. The matching chip flips to the filled `default` variant. Empty = no active chip.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        showLabels: {
            description:
                'Synthetic: when off, subcategory `name` fields are stripped so chips render the raw `id` (matches old `NoLabels` story).',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? 4,
            activeCategoryId: args.activeCategoryId ?? '',
            showLabels: args.showLabels ?? true,
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const subcategories = ALL_SUBCATEGORIES.slice(0, clamped).map((cat) =>
            synthetic.showLabels ? cat : { id: cat.id }
        );
        const category: ShopperProducts.schemas['Category'] = {
            id: 'womens',
            name: 'Women',
            categories: subcategories,
        };
        const initialUrl = synthetic.activeCategoryId ? `/?refine=cgid=${synthetic.activeCategoryId}` : '/';
        return (
            <>
                <RouteSetter initialEntries={[initialUrl]} />
                <QuickFilters category={category} />
            </>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const buttons = canvas.getAllByRole('button');
        await expect(buttons.length).toBeGreaterThan(0);
        const firstChip = buttons[0];
        if (firstChip) {
            await expect(firstChip).toHaveAttribute('aria-pressed');
            await userEvent.click(firstChip);
        }
    },
};

/**
 * With a `categoryLabel` supplied, a "Shop by {label}" header (sparkles icon +
 * text) renders before the chips. Verticals opt into this via the category
 * route (gated on `uiConfig.pages.category.showCategoryLabel`); the component
 * itself just renders the header when the prop is present.
 */
export const WithCategoryLabel: Story = {
    render: () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'womens',
            name: 'Women',
            categories: ALL_SUBCATEGORIES.slice(0, 4),
        };
        return (
            <>
                <RouteSetter initialEntries={['/']} />
                <QuickFilters category={category} categoryLabel="Women" />
            </>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Shop by Women')).toBeInTheDocument();
    },
};

/**
 * Empty `category.categories` makes the component return null. Worth a
 * bookmarkable URL to assert this null-render explicitly.
 */
export const EmptyState: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const buttons = canvasElement.querySelectorAll('button');
        await expect(buttons.length).toBe(0);
    },
};
