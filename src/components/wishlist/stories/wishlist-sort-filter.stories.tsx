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

import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import { WishlistSortFilter, type WishlistSortOption, type WishlistFilterOption } from '../wishlist-sort-filter';

// ---------------------------------------------------------------------------
// WishlistSortFilter is a controlled component with two <select> dropdowns.
// Visible variations come from `sortValue` and `filterValue`. The component
// is otherwise stateless — Playground wraps it in local state so designers
// can flip the Controls and see the dropdowns actually update.
// ---------------------------------------------------------------------------

function StatefulSortFilter(props: ComponentProps<typeof WishlistSortFilter>) {
    const [sortValue, setSortValue] = useState<WishlistSortOption>(props.sortValue);
    const [filterValue, setFilterValue] = useState<WishlistFilterOption>(props.filterValue);
    return (
        <WishlistSortFilter
            sortValue={sortValue}
            filterValue={filterValue}
            onSortChange={(v) => {
                setSortValue(v);
                props.onSortChange(v);
            }}
            onFilterChange={(v) => {
                setFilterValue(v);
                props.onFilterChange(v);
            }}
        />
    );
}

const meta: Meta<typeof WishlistSortFilter> = {
    title: 'Account/Wishlist/Wishlist Sort Filter',
    component: WishlistSortFilter,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Controlled sort + filter dropdowns for the My Wishlist page. All sort/filter logic
runs client-side; the API does not support server-side sort/filter.

The Playground story wraps the component in local state so flipping the Controls
actually updates the rendered selects. SortInteraction and FilterInteraction are
dedicated stories whose plays drive a userEvent.selectOptions and lock in the
controlled-component contract.
                `,
            },
        },
    },
    argTypes: {
        onSortChange: { table: { disable: true } },
        onFilterChange: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof WishlistSortFilter>;

/**
 * Playground: sort + filter Controls drive a stateful wrapper. The story-level
 * decorator re-keys on args so flipping a Control forces a remount and the
 * inner `useState(props.*)` re-initializes from the new prop values; without
 * it, useState only reads its initial value and the Controls panel becomes
 * inert (Pattern 18 — `useState(prop)` dead-Control).
 */
export const Playground: Story = {
    args: {
        sortValue: 'recently-added',
        filterValue: 'all',
        onSortChange: action('onSortChange'),
        onFilterChange: action('onFilterChange'),
    },
    argTypes: {
        sortValue: {
            description: 'Currently-selected sort option.',
            control: 'radio',
            options: ['recently-added', 'name-asc', 'price-low', 'price-high'] satisfies WishlistSortOption[],
        },
        filterValue: {
            description: 'Currently-selected filter option.',
            control: 'radio',
            options: ['all', 'in-stock', 'out-of-stock', 'on-sale'] satisfies WishlistFilterOption[],
        },
    },
    decorators: [(Story, ctx) => <Story key={`${String(ctx.args.sortValue)}-${String(ctx.args.filterValue)}`} />],
    render: (args) => <StatefulSortFilter {...args} />,
};

/**
 * Sort interaction — pick "Price High to Low" via the keyboard/userEvent path.
 * Locks in the controlled-component contract: a successful selectOptions call
 * causes the underlying value to update.
 */
export const SortInteraction: Story = {
    args: {
        sortValue: 'recently-added',
        filterValue: 'all',
        onSortChange: action('onSortChange'),
        onFilterChange: action('onFilterChange'),
    },
    render: (args) => <StatefulSortFilter {...args} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const selects = canvas.getAllByRole('combobox');
        await userEvent.selectOptions(selects[0], 'price-high');
        await expect(selects[0]).toHaveValue('price-high');
    },
};

/**
 * Filter interaction — pick "Out of Stock" via userEvent. Same regression
 * catch on the filter select.
 */
export const FilterInteraction: Story = {
    args: {
        sortValue: 'recently-added',
        filterValue: 'all',
        onSortChange: action('onSortChange'),
        onFilterChange: action('onFilterChange'),
    },
    render: (args) => <StatefulSortFilter {...args} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const selects = canvas.getAllByRole('combobox');
        await userEvent.selectOptions(selects[1], 'out-of-stock');
        await expect(selects[1]).toHaveValue('out-of-stock');
    },
};
