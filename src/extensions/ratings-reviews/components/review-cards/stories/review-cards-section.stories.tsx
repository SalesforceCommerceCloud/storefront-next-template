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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import React, { type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import {
    ProductReviewsProvider,
    useProductReviews,
} from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewItem, ReviewsData, ReviewsSummaryData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { mockConfig } from '@/test-utils/config';
import ReviewCardsSection from '../review-cards-section';

const mockProduct = { id: 'storybook-product' };

// Seven mock reviews matching the production fixtures' rating mix (5 fives, 2 fours).
const MOCK_REVIEWS: ReviewItem[] = [
    {
        id: 'r1',
        authorName: 'Alex P.',
        verifiedPurchase: true,
        date: '2025-02-01',
        rating: 5,
        headline: 'Excellent quality',
        body: 'Premium feel and great craftsmanship throughout.',
        helpfulCount: 67,
        photos: [{ url: '/images/black-cube-photo.svg', alt: 'photo' }],
    },
    {
        id: 'r2',
        authorName: 'David L.',
        verifiedPurchase: true,
        date: '2025-01-15',
        rating: 5,
        headline: 'Sleek and sophisticated',
        body: 'The black version is absolutely stunning. It has subtle depth that photos miss.',
        helpfulCount: 22,
    },
    {
        id: 'r3',
        authorName: 'James R.',
        verifiedPurchase: true,
        date: '2025-01-08',
        rating: 5,
        headline: 'Perfect minimalist accent',
        body: 'Clean lines, ideal proportions, sits beautifully on my console table.',
        helpfulCount: 34,
    },
    {
        id: 'r4',
        authorName: 'Maria S.',
        verifiedPurchase: true,
        date: '2024-12-15',
        rating: 5,
        headline: 'Museum quality at home',
        body: 'I bought this for my home office and it elevates the entire space.',
        helpfulCount: 28,
    },
    {
        id: 'r5',
        authorName: 'Rachel M.',
        verifiedPurchase: true,
        date: '2024-12-01',
        rating: 4,
        headline: 'Great neutral option',
        body: 'Fits seamlessly into my living room and the gray is the perfect middle ground.',
        helpfulCount: 15,
    },
    {
        id: 'r6',
        authorName: 'Thomas K.',
        verifiedPurchase: true,
        date: '2024-11-20',
        rating: 4,
        headline: 'Beautiful but smaller than expected',
        body: 'Build quality is outstanding; size is a touch smaller than photos suggested.',
        helpfulCount: 19,
    },
    {
        id: 'r7',
        authorName: 'Emily W.',
        verifiedPurchase: true,
        date: '2024-10-05',
        rating: 5,
        headline: 'Bought 3 for my shelving unit',
        body: 'These cubes arranged on my floating shelves create such a sophisticated look.',
        helpfulCount: 41,
    },
];

// Pre-seed the provider so it doesn't try to fetch from `/resource/reviews-summary`
// (no such route exists inside the storybook router).
const mockSummary: ReviewsSummaryData = {
    totalCount: 7,
    averageRating: 4.7,
    distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 2, fiveStars: 5 },
    basedOnLabel: 'Based on 7 reviews',
};

const mockReviewsData: ReviewsData = {
    heading: 'Customer Reviews',
    subtitle: '7 reviews',
    writeReviewButtonLabel: 'Write a Review',
    summary: {
        averageRating: mockSummary.averageRating,
        totalCount: mockSummary.totalCount,
        basedOnLabel: mockSummary.basedOnLabel,
        distribution: mockSummary.distribution,
    },
    searchPlaceholder: 'Search reviews...',
    sortOptions: ['Most Recent'],
    reviews: MOCK_REVIEWS,
};

const reviewsListPromise = Promise.resolve(mockReviewsData);

/** Triggers loadReviewsIfNeeded on mount so the seeded reviews populate (required for play tests). */
function LoadReviewsOnMount({ children }: { children: React.ReactNode }): ReactElement {
    const { loadReviewsIfNeeded } = useProductReviews();
    React.useEffect(() => {
        loadReviewsIfNeeded();
    }, [loadReviewsIfNeeded]);
    return <>{children}</>;
}

function ReviewCardsSectionWrapper(): ReactElement {
    const inRouter = useInRouterContext();
    const content = (
        <ConfigProvider config={mockConfig}>
            <ProductProvider product={mockProduct}>
                <ProductReviewsProvider summary={mockSummary} reviewsListPromise={reviewsListPromise}>
                    <LoadReviewsOnMount>
                        <div className="max-w-3xl">
                            <h2 className="mb-4 text-2xl font-semibold">Customer Reviews</h2>
                            <ReviewCardsSection />
                        </div>
                    </LoadReviewsOnMount>
                </ProductReviewsProvider>
            </ProductProvider>
        </ConfigProvider>
    );

    if (inRouter) {
        return content;
    }

    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: content,
            },
        ],
        { initialEntries: ['/'] }
    );

    return <RouterProvider router={router} />;
}

const meta: Meta<typeof ReviewCardsSectionWrapper> = {
    title: 'Extensions/Ratings & Reviews/Review Cards Section',
    component: ReviewCardsSectionWrapper,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
ReviewCardsSection displays paginated customer reviews for a product.

**Features:**
- Fetches reviews from the product content adapter (getReviews)
- **Filter** by star rating (1–5) and "With Photos"
- **Search** by keyword (headline, body, author)
- **Sort** by Most Recent, Highest Rated, Lowest Rated, Most Helpful
- Pagination (5 per page) with previous/next and page numbers
- Scrolls to top of section on page change
- Write a Review button (opens modal via adapter getWriteReviewForm)
- Must be used within PDP context (ProductProvider + ProductReviewsProvider)
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ReviewCardsSectionWrapper>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Mock adapter returns 7 reviews; wait for load then "Showing 1-5 of 7 reviews"
        await expect(
            canvas.findByText(/Showing 1-5 of 7 reviews/, {}, { timeout: 10000 })
        ).resolves.toBeInTheDocument();
        // Pagination to page 2
        const page2 = await canvas.findByRole('button', { name: 'Page 2' }, { timeout: 5000 });
        await userEvent.click(page2);
        await expect(canvas.findByText(/Showing 6-7 of 7 reviews/)).resolves.toBeInTheDocument();
    },
};

export const FilterAndSort: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(
            canvas.findByText(/Showing 1-5 of 7 reviews/, {}, { timeout: 10000 })
        ).resolves.toBeInTheDocument();
        // Filter by 5 stars (mock returns 7 reviews, mix of ratings)
        const fiveStarButton = await canvas.findByRole('button', { name: 'Filter by 5 stars' }, { timeout: 5000 });
        await userEvent.click(fiveStarButton);
        await expect(canvas.findByText(/Sort:/)).resolves.toBeInTheDocument();
        // Change sort to Highest Rated
        const sortSelect = await canvas.findByRole('combobox', { name: 'Sort:' }, { timeout: 3000 });
        await userEvent.selectOptions(sortSelect, 'highest-rated');
        await expect(sortSelect).toHaveValue('highest-rated');
    },
};
