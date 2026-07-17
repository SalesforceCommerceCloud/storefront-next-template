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
import { ReviewCard } from '../review-card';
import type { ReviewItem } from '@/extensions/ratings-reviews/lib/api/reviews.server';

const SHORT_BODY =
    "I've been meaning to write this review for a while now. The matte white finish is absolutely pristine. Worth every penny.";

type SyntheticArgs = {
    authorName: string;
    headline: string;
    bodyLength: number;
    rating: number;
    verifiedPurchase: boolean;
    location: string;
    helpfulCount: number;
    showReportLabel: boolean;
    photoCount: number;
};

const meta: Meta<ComponentType<SyntheticArgs>> = {
    title: 'Extensions/Ratings & Reviews/Review Card',
    component: ReviewCard as unknown as ComponentType<SyntheticArgs>,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        authorName: { control: 'text', description: 'Reviewer name (first letter renders in the avatar)' },
        headline: { control: 'text', description: 'Review headline displayed as h3' },
        bodyLength: {
            control: { type: 'number', min: 0, max: 1500, step: 50 },
            description:
                'Synthetic arg — body length. Values > 400 trigger the "Read More" toggle and a body truncated to 400 chars with ellipsis',
        },
        rating: {
            control: { type: 'range', min: 1, max: 5, step: 1 },
            description: 'Star rating 1–5 (drives both the visible stars and aria-label)',
        },
        verifiedPurchase: {
            control: 'boolean',
            description: 'Show or hide the "Verified Purchase" badge next to the author name',
        },
        location: {
            control: 'text',
            description: 'Optional location appended to the date row (empty string hides it)',
        },
        helpfulCount: {
            control: { type: 'number', min: 0, max: 999 },
            description:
                'Initial helpful-count. 0 renders "Helpful" with no count; positive renders "Helpful ({count})". Click the button in the browser to increment',
        },
        showReportLabel: {
            control: 'boolean',
            description: 'Whether to render the "Report" button next to the helpful action',
        },
        photoCount: {
            control: { type: 'number', min: 0, max: 6 },
            description:
                'Synthetic arg — number of photo thumbnails. 0 hides the photo strip; >0 renders thumbs that open a lightbox on click',
        },
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-2xl">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<ComponentType<SyntheticArgs>>;

const buildReview = ({
    authorName,
    headline,
    bodyLength,
    rating,
    verifiedPurchase,
    location,
    helpfulCount,
    showReportLabel,
    photoCount,
}: SyntheticArgs): ReviewItem => {
    const body =
        bodyLength <= SHORT_BODY.length
            ? SHORT_BODY.slice(0, bodyLength)
            : SHORT_BODY + 'A'.repeat(bodyLength - SHORT_BODY.length);
    return {
        id: 'story-default',
        authorName,
        verifiedPurchase,
        date: 'February 2025',
        location: location || undefined,
        rating,
        headline,
        body,
        helpfulCount,
        reportLabel: showReportLabel ? 'Report' : undefined,
        photos:
            photoCount > 0
                ? Array.from({ length: photoCount }, (_, idx) => ({
                      id: `photo-${idx}`,
                      url: `/images/review-photo-${(idx % 3) + 1}.svg`,
                      alt: `Review photo ${idx + 1}`,
                  }))
                : undefined,
    };
};

/**
 * At-rest — verified-purchase reviewer with a short body, full 5-star
 * rating, location, and a positive helpful count. Drive every other
 * variant from the Controls panel:
 *
 *   - `verifiedPurchase: false` — removes the green check-badge next to
 *     the author name (replaces the old `WithoutVerifiedBadge` story)
 *   - `bodyLength: 500` — body exceeds the 400-char truncate threshold;
 *     a "Read More" button appears below the truncated text. Click in
 *     the browser to expand to full body (replaces `LongBodyWithReadMore`)
 *   - `rating: 1..4` — fewer filled stars; aria-label updates
 *   - `location: ''` — hides the location half of the date row
 *   - `helpfulCount: 0` — "Helpful" with no count; positive shows count
 *   - `showReportLabel: false` — hides the Report button
 *   - `photoCount: 1..6` — adds photo thumbnails below the body. Click
 *     a thumbnail in the browser to open the lightbox modal
 */
export const Default: Story = {
    args: {
        authorName: 'Alexandra P.',
        headline: 'A comprehensive review after 6 months of ownership',
        bodyLength: SHORT_BODY.length,
        rating: 5,
        verifiedPurchase: true,
        location: 'Boston, MA',
        helpfulCount: 12,
        showReportLabel: true,
        photoCount: 0,
    },
    render: (args) => <ReviewCard review={buildReview(args)} />,
};
