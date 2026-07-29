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
import RefinePrice from '..';
import { action } from 'storybook/actions';
import { useEffect, type ComponentType } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useNavigate } from '@/hooks/use-navigate';
import searchResults from '@/components/__mocks__/search-results';
import type { FilterValue } from '../../types';
import type { ShopperSearch } from '@/scapi';

// ---------------------------------------------------------------------------
// RefinePrice composes PriceRangeInput (for free-form min/max entry) with
// DefaultRefinement (for the predefined price-bucket checkboxes). Visible
// state is driven by:
//   - the count of predefined buckets (`values.length`),
//   - which bucket is checked (`isFilterSelected` per value),
//   - the URL `refine=price=(min..max)` param (read via useLocation, drives
//     the inputs).
// All three fold into Controls. Empty `values` array stays as a dedicated
// `NoPredefinedRanges` story because the layout collapses to inputs-only —
// a fundamentally different visual state worth a bookmarkable URL.
//
// `RouteSetter` keeps Controls-driven `preMinPrice`/`preMaxPrice` in sync with
// the URL after first render. The default URL is set via
// `parameters.initialEntries` so the at-rest snapshot/render renders without
// waiting for an effect to fire.
// ---------------------------------------------------------------------------

function RouteSetter({ path }: { path: string }) {
    const navigate = useNavigate();
    useEffect(() => {
        if (path) {
            navigate(path, { replace: true });
        }
    }, [path, navigate]);
    return null;
}

function buildPriceUrl(preMinPrice: string, preMaxPrice: string): string {
    if (!preMinPrice && !preMaxPrice) return '/';
    const min = preMinPrice || '0';
    const max = preMaxPrice || '';
    return `/?refine=price=(${min}..${max})`;
}

const ALL_PRICE_VALUES: FilterValue[] = [
    { value: '(0..50)', label: '$0 - $50', hitCount: 5 },
    { value: '(50..100)', label: '$50 - $100', hitCount: 20 },
    { value: '(100..200)', label: '$100 - $200', hitCount: 15 },
    { value: '(200..)', label: '$200+', hitCount: 6 },
];
const MAX_VALUES = ALL_PRICE_VALUES.length;

const mockSearchResult = searchResults as ShopperSearch.schemas['ProductSearchResult'];

type SyntheticArgs = {
    valueCount: number;
    selectedValue: string;
    preMinPrice: string;
    preMaxPrice: string;
};

const meta: Meta<typeof RefinePrice> = {
    title: 'Category/Category Refinements/Refine Price',
    component: RefinePrice,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Price filter inside the side-panel filters. Combines a free-form min/max input row (PriceRangeInput) with a checkbox list of predefined price buckets (DefaultRefinement). Inputs auto-populate from the `refine=price=(min..max)` URL param.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Rich-but-realistic baseline — all 4 predefined buckets, "$50 - $100" pre-checked,
 * inputs left blank (no URL price filter applied). Use Controls to slice the
 * bucket list, change the checked bucket, or seed the inputs via URL.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        valueCount: 4,
        selectedValue: '(50..100)',
        preMinPrice: '',
        preMaxPrice: '',
    },
    argTypes: {
        valueCount: {
            description: `Synthetic: number of predefined price buckets to render (1–${MAX_VALUES})`,
            control: { type: 'number', min: 1, max: MAX_VALUES, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        selectedValue: {
            description: 'Synthetic: the `value` of the bucket to render checked (e.g. `(50..100)`). Empty = none.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        preMinPrice: {
            description: 'Synthetic: seeds `refine=price=(min..max)` URL param to drive the min input.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        preMaxPrice: {
            description: 'Synthetic: seeds `refine=price=(min..max)` URL param to drive the max input.',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            valueCount: args.valueCount ?? MAX_VALUES,
            selectedValue: args.selectedValue ?? '',
            preMinPrice: args.preMinPrice ?? '',
            preMaxPrice: args.preMaxPrice ?? '',
        };
        const clamped = Math.max(1, Math.min(synthetic.valueCount, MAX_VALUES));
        const values = ALL_PRICE_VALUES.slice(0, clamped);
        const isFilterSelected = (attributeId: string, value: string) =>
            attributeId === 'price' && value === synthetic.selectedValue;
        const initialUrl = buildPriceUrl(synthetic.preMinPrice, synthetic.preMaxPrice);
        return (
            <>
                <RouteSetter path={initialUrl} />
                <RefinePrice
                    values={values}
                    attributeId="price"
                    isFilterSelected={isFilterSelected}
                    toggleFilter={action('price-toggle-filter')}
                    result={mockSearchResult}
                />
            </>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const inputs = canvas.getAllByRole('spinbutton');
        await expect(inputs.length).toBeGreaterThanOrEqual(2);
        const checkboxes = canvas.getAllByRole('checkbox');
        await expect(checkboxes.length).toBeGreaterThan(0);
    },
};

/**
 * Fundamentally different layout: empty `values` array collapses the
 * checkbox list, leaving only the min/max inputs. Worth a bookmarkable URL
 * to assert this null-list state explicitly.
 */
export const NoPredefinedRanges: Story = {
    args: {
        values: [],
        attributeId: 'price',
        isFilterSelected: () => false,
        toggleFilter: action('price-toggle-filter'),
        result: mockSearchResult,
    },
    decorators: [
        (Story: ComponentType, context) => (
            <>
                <RouteSetter path="/" />
                <Story {...(context.args as Record<string, unknown>)} />
            </>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const inputs = canvas.getAllByRole('spinbutton');
        await expect(inputs.length).toBeGreaterThanOrEqual(2);
        const checkboxes = canvas.queryAllByRole('checkbox');
        await expect(checkboxes.length).toBe(0);
    },
};
