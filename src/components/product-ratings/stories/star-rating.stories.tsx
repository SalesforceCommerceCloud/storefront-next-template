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

import { StarRating } from '../star-rating';

const meta: Meta<typeof StarRating> = {
    title: 'Products/Product Ratings/Star Rating',
    component: StarRating,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        rating: {
            control: { type: 'range', min: 0, max: 5, step: 0.1 },
            description: 'Rating value 0–5. Decimals drive partial-fill via opacity on the right-most filled star',
        },
        reviewCount: {
            control: { type: 'number', min: 0 },
            description: 'Review count interpolated into the rating link and review-count label',
        },
        showRatingLabel: {
            control: 'boolean',
            description: 'Show the rating label (e.g. "4.8 out of 5") next to or above the stars',
        },
        ratingLabelPosition: {
            control: 'radio',
            options: ['top', 'right'],
            description: 'Where to position the rating label relative to the stars',
        },
        ratingLabelFormat: {
            control: 'radio',
            options: ['full', 'short'],
            description: '`full` = "X out of 5", `short` = "X" (numeric only)',
        },
        showRatingLink: {
            control: 'boolean',
            description: 'Show the clickable "X (N)" link next to the stars (jumps to reviews)',
        },
        showReviewCountLabel: {
            control: 'boolean',
            description: 'Show the review-count label below the stars (e.g. "Based on 342 reviews")',
        },
        starSize: {
            control: 'radio',
            options: ['sm', 'default', 'lg'],
            description: '`sm` = 12px (PLP), `default` = 16px (PDP), `lg` = 24px (modal/distribution sheet)',
        },
        ratingLabelTemplate: { table: { disable: true } },
        ratingLinkTemplate: { table: { disable: true } },
        reviewCountLabelTemplate: { table: { disable: true } },
        ratingLabelClassName: { table: { disable: true } },
        reviewCountLabelClassName: { table: { disable: true } },
        starClassName: { table: { disable: true } },
        ratingLinkClassName: { table: { disable: true } },
        starContainerAriaLabelTemplate: { table: { disable: true } },
        ratingLinkAriaLabelTemplate: { table: { disable: true } },
        totalStars: { table: { disable: true } },
        onRatingLinkClick: { table: { disable: true } },
        ref: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At-rest renders every visible piece this component can show: top rating
 * label, all 5 stars (including partial-fill on the right-most filled
 * star for fractional ratings), rating link, and review-count label below.
 * Drive every other variant from the Controls panel:
 *
 *   - `rating` slider — drag from 0 → 5 to watch partial-fill on the
 *     right-most filled star (0.7 = 70% gradient, etc.)
 *   - `showRatingLabel: false` — hides the top label (replaces the old
 *     `WithTopLabel` story)
 *   - `ratingLabelPosition: 'right'` + `ratingLabelFormat: 'short'` —
 *     compact inline numeric (replaces `WithRightLabel`)
 *   - `showRatingLink: false` — hides the "4.8 (342)" button (replaces
 *     `WithRatingLink`)
 *   - `showReviewCountLabel: false` — hides the bottom label (replaces
 *     `WithReviewCountLabel`)
 *   - `starSize: 'sm'` / `'default'` / `'lg'` — three size presets used
 *     in production
 */
export const Playground: Story = {
    args: {
        rating: 3.9,
        reviewCount: 34,
        showRatingLabel: true,
        ratingLabelPosition: 'right',
        ratingLabelFormat: 'short',
        showRatingLink: true,
        showReviewCountLabel: true,
        starSize: 'sm',
        onRatingLinkClick: action('rating link clicked'),
    },
};

/**
 * Production preset — Product Detail Page configuration. `starSize:
 * 'default'` (16px), no rating label, no review-count label, just the
 * clickable "4.8 (342)" link beside the stars. Bookmarkable URL for
 * QA reviewers to compare PDP layouts.
 */
export const RatingOnPDP: Story = {
    args: {
        rating: 4.8,
        reviewCount: 342,
        starSize: 'default',
        showRatingLabel: false,
        showRatingLink: true,
        showReviewCountLabel: false,
        onRatingLinkClick: action('rating link clicked'),
    },
};

/**
 * Production preset — distribution-sheet configuration with the rating
 * rendered as a 5xl headline number above large (24px) stars. Bookmarkable
 * URL so QA testers don't have to reconstruct the layout by hand.
 */
export const RatingOnDistributionSheet: Story = {
    args: {
        rating: 4.8,
        reviewCount: 342,
        starSize: 'lg',
        showRatingLabel: true,
        ratingLabelPosition: 'top',
        ratingLabelFormat: 'short',
        ratingLabelClassName: 'text-5xl font-semibold text-black mb-2',
        showReviewCountLabel: true,
        reviewCountLabelClassName: 'text-xs text-gray-500 mt-2',
    },
};

/**
 * Production preset — rating-modal configuration. `sm` stars, full-format
 * label on the right ("4.8 out of 5"), review-count label below.
 */
export const RatingOnRatingModal: Story = {
    args: {
        rating: 4.8,
        reviewCount: 342,
        showRatingLabel: true,
        ratingLabelPosition: 'right',
        ratingLabelFormat: 'full',
        showReviewCountLabel: true,
    },
};
