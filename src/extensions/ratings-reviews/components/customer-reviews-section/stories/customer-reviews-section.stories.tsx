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
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewsSummaryData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { mockConfig } from '@/test-utils/config';
import CustomerReviewsSection from '../customer-reviews-section';

const mockProduct = { id: 'storybook-product', name: 'Storybook Product' };

// Pre-seed so the provider doesn't try to fetch via `/resource/reviews-summary`
// (no such route exists in the storybook router).
const mockSummary: ReviewsSummaryData = {
    totalCount: 7,
    averageRating: 4.7,
    distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 2, fiveStars: 5 },
    basedOnLabel: 'Based on 7 reviews',
};

/**
 * `CustomerReviewsSection` takes no props — it pulls everything (product,
 * review summary, AI summary, distribution, full reviews list, accordion
 * expansion) from the surrounding providers. The harness below mirrors the
 * production provider stack so the component renders as it would on a PDP.
 */
function CustomerReviewsSectionHarness(): ReactElement {
    const inRouter = useInRouterContext();
    const content = (
        <ConfigProvider config={mockConfig}>
            <ProductProvider product={mockProduct}>
                <ProductReviewsProvider summary={mockSummary}>
                    <div className="max-w-3xl">
                        <CustomerReviewsSection />
                    </div>
                </ProductReviewsProvider>
            </ProductProvider>
        </ConfigProvider>
    );

    if (inRouter) return content;

    const router = createMemoryRouter([{ path: '/', element: content }], { initialEntries: ['/'] });
    return <RouterProvider router={router} />;
}

const meta: Meta<typeof CustomerReviewsSectionHarness> = {
    title: 'Extensions/Ratings & Reviews/Customer Reviews Section',
    component: CustomerReviewsSectionHarness,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Customer Reviews accordion: collapsed at-rest with review-count line, AI summary box, and lazy-loaded review cards on expand. The component reads everything from `ProductReviewsProvider`, so this story has no Controls — vary the rendered state by changing the provider mock.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CustomerReviewsSectionHarness>;

/**
 * Default state — accordion collapsed, header showing the review-count
 * line resolved from `reviewsSummary`. Click the trigger in the browser
 * to expand and lazy-load the review cards.
 */
export const Default: Story = {};
