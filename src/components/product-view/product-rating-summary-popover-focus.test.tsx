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
/** @sfdc-extension-file SFDC_EXT_RATINGS_REVIEWS */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewsSummaryData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { mockConfig } from '@/test-utils/config';
import { ProductRatingSummary } from './product-rating-summary';

const mockProduct = { id: 'popover-focus-product', name: 'Popover Focus Product' };

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
                </ProductReviewsProvider>
            </ProductProvider>
        </ConfigProvider>
    );
    const router = createMemoryRouter([{ path: '/', element: content }], { initialEntries: ['/'] });
    return <RouterProvider router={router} />;
}

function getContent(): HTMLElement | null {
    return document.querySelector('[data-slot="popover-content"]');
}

describe('ProductRatingSummary popover close focus (W-23545805, G7 t2)', () => {
    beforeAll(() => {
        // jsdom implements neither scrollIntoView nor smooth scrolling.
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('does not return focus to the rating summary trigger when the popover closes on mouse-leave', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const trigger = await screen.findByRole('button', { name: 'View customer reviews' });

        await user.hover(trigger);
        await waitFor(() => expect(getContent()).not.toBeNull());

        await user.unhover(trigger);
        // scheduleClose runs a 150ms timer before the popover actually closes.
        await waitFor(() => expect(getContent()).toBeNull(), { timeout: 2000 });

        // A mouse-leave close must NOT yank focus back to the trigger: doing so scrolls the page
        // back up to the rating summary under a pointer user who has already moved on. Without the
        // conditional onCloseAutoFocus, Radix returns focus to the trigger here.
        expect(document.activeElement).not.toBe(trigger);
    });

    it('returns focus to the rating summary trigger when the popover is dismissed with Escape', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const trigger = await screen.findByRole('button', { name: 'View customer reviews' });

        // Open, then move keyboard focus onto the trigger to model a keyboard user, then Escape.
        await user.hover(trigger);
        await waitFor(() => expect(getContent()).not.toBeNull());

        await user.keyboard('{Escape}');
        await waitFor(() => expect(getContent()).toBeNull(), { timeout: 2000 });

        // A keyboard dismissal (Escape) must return focus to the trigger so the keyboard user is
        // not stranded on <body> (WCAG 2.4.3). The conditional handler allows Radix's default here.
        expect(document.activeElement).toBe(trigger);
    });
});
