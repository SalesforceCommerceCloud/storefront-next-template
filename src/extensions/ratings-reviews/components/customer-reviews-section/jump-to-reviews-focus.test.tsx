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
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewsSummaryData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { mockConfig } from '@/test-utils/config';
import { ProductRatingSummary } from '@/components/product-view/product-rating-summary';
import CustomerReviewsSection from './customer-reviews-section';

const mockProduct = { id: 'jump-focus-product', name: 'Jump Focus Product' };

// A non-zero totalCount makes the rating summary interactive (`canInteract`), so the
// "View customer reviews" jump control renders and can be activated.
const mockSummary: ReviewsSummaryData = {
    totalCount: 7,
    averageRating: 4.7,
    distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 2, fiveStars: 5 },
    basedOnLabel: 'Based on 7 reviews',
};

function Harness() {
    const content = (
        <ConfigProvider config={mockConfig}>
            <ProductProvider product={mockProduct}>
                <ProductReviewsProvider summary={mockSummary}>
                    <ProductRatingSummary />
                    <CustomerReviewsSection />
                </ProductReviewsProvider>
            </ProductProvider>
        </ConfigProvider>
    );
    const router = createMemoryRouter([{ path: '/', element: content }], { initialEntries: ['/'] });
    return <RouterProvider router={router} />;
}

describe('Jump-to-reviews moves keyboard focus (W-23325662)', () => {
    const scrollIntoView = vi.fn();

    beforeAll(() => {
        // jsdom implements neither scrollIntoView nor smooth scrolling; stub it so the
        // jump handler runs to the focus() call, which is the behaviour under test.
        Element.prototype.scrollIntoView = scrollIntoView;
    });

    it('moves focus to the customer reviews section when the rating summary is activated', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const jumpControl = await screen.findByRole('button', { name: 'View customer reviews' });
        const reviewsSection = document.getElementById('customer-reviews');
        expect(reviewsSection).not.toBeNull();
        // The target must be programmatically focusable for the jump to land on it.
        expect(reviewsSection).toHaveAttribute('tabindex', '-1');

        await user.click(jumpControl);

        // After the accordion opens the registered onExpanded callback scrolls to and focuses
        // the reviews section. Assert keyboard focus actually lands there, not just the scroll.
        await waitFor(() => {
            expect(document.activeElement).toBe(reviewsSection);
        });
        expect(scrollIntoView).toHaveBeenCalled();
    });
});
