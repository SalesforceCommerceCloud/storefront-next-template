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
import { action } from 'storybook/actions';
import { StarRatingDistributions } from '../star-rating-distributions';

const meta = {
    title: 'Products/Product Ratings/Star Rating Distributions',
    component: StarRatingDistributions,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        distributions: {
            description:
                'Array of `{ rating, count }` entries. The component always renders 5 rows (5 → 1) regardless of input — missing ratings display as 0',
        },
        selectedRating: {
            control: { type: 'select' },
            options: ['none', 1, 2, 3, 4, 5],
            mapping: { none: undefined },
            description:
                'When non-null, that row is highlighted (info-foreground background, aria-pressed=true). `none` = no row selected',
        },
        onRatingClick: { table: { disable: true } },
        ref: { table: { disable: true } },
    },
    decorators: [
        (Story) => (
            <div className="w-80">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof StarRatingDistributions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At-rest renders a typical product-page distribution (heavy 5-star,
 * tapering down). Drive every other variant from the Controls panel by
 * editing the `distributions` array:
 *
 *   - All 200 on rating=5 (other rows 0) — replaces `PerfectRating`
 *   - 100/100/100/100/100 — even distribution
 *   - Heavily skewed low (e.g. all 1-star) — replaces `PoorlyRated`
 *   - Sparse data (only 5 + 1 ratings present) — missing rows render as
 *     0 because `distributionMap.get(rating) || 0` (replaces
 *     `SparseDistributions`)
 *   - Very large counts (45678 / 23456 / etc.) — replaces
 *     `LargeReviewCounts` / `VeryLargeReviewCounts`
 *
 * Set `selectedRating: 5` to see the highlighted row state. Set
 * `onRatingClick` (always wired here via the action handler) and the
 * rows become clickable buttons.
 */
export const Default: Story = {
    args: {
        distributions: [
            { rating: 5, count: 120 },
            { rating: 4, count: 50 },
            { rating: 3, count: 20 },
            { rating: 2, count: 8 },
            { rating: 1, count: 2 },
        ],

        onRatingClick: action('rating clicked'),
        selectedRating: 5,
    },
};

/**
 * Edge case — empty distribution. Component still renders 5 rows
 * (5 to 1), each with `reviewCount: 0` and a 0%-width bar. The aria-label
 * resolves with `total: 0`. Bookmarkable URL because the empty case is
 * structurally different (every bar at 0%) from any varied case.
 */
export const EmptyDistributions: Story = {
    args: {
        distributions: [],
    },
};
