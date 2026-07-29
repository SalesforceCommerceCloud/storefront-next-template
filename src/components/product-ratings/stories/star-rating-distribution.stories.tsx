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
import { StarRatingDistribution } from '../star-rating-distribution';

const meta = {
    title: 'Products/Product Ratings/Star Rating Distribution',
    component: StarRatingDistribution,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        rating: {
            control: { type: 'number', min: 1, max: 5, step: 1 },
            description: 'Star rating row this distribution represents (1–5)',
        },
        reviewCount: {
            control: { type: 'number', min: 0 },
            description: 'Number of reviews at this rating (drives the bar fill width)',
        },
        totalReviews: {
            control: { type: 'number', min: 0 },
            description: 'Total reviews across all ratings (denominator for percentage calculation)',
        },
        selectedRating: { table: { disable: true } },
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
} satisfies Meta<typeof StarRatingDistribution>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At-rest renders a single 5-star row with 60% fill (120 of 200 reviews).
 * Drive every other variant from the Controls panel:
 *
 *   - `rating: 1..5` — switch which row this represents (the leading "5"
 *     and the star icon update)
 *   - `reviewCount: 200` + `totalReviews: 200` — 100% bar fill (replaces
 *     the old `HighPercentage` / `PerfectRating` stories)
 *   - `reviewCount: 0` — 0% bar (replaces `ZeroReviews`)
 *   - `reviewCount: 2` + `totalReviews: 200` — 1% sliver (replaces
 *     `VeryLowPercentage`)
 *   - `reviewCount: 123456` + `totalReviews: 500000` — exercise tabular
 *     numerals with large counts (replaces `ExtremelyLargeReviewCount`)
 *
 * The wrapper decorator constrains width to `w-80` (320px). To see how
 * the row reflows in wider containers, change the decorator at the
 * meta level or use the StarRatingDistributions story for a live grid.
 */
export const Default: Story = {
    args: {
        rating: 5,
        reviewCount: 120,
        totalReviews: 200,
        onRatingClick: action('rating clicked'),
    },
};
