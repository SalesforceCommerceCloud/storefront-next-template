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
import { expect, screen, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewsSummaryData, WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import AuthProvider from '@/providers/auth';
import { mockConfig } from '@/test-utils/config';
import WriteReviewButton from '../index';
import type { ReactElement } from 'react';

const mockProduct = { id: 'test-product-123' };

const mockSummary: ReviewsSummaryData = {
    totalCount: 0,
    averageRating: 0,
    distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 0, fiveStars: 0 },
    basedOnLabel: 'Based on 0 reviews',
};

const mockFormConfig: WriteReviewFormData = {
    title: 'Write a Review',
    overallRating: { label: 'Overall Rating', required: true, placeholder: 'Select a rating' },
    reviewTitle: { label: 'Review Title', placeholder: 'Summarize your experience', maxCharacters: 250 },
    reviewBody: {
        label: 'Your Review',
        placeholder: 'What did you like or dislike about this product?',
        minCharacters: 50,
        maxCharacters: 2000,
    },
    recommend: { label: 'Would you recommend this product?', yesLabel: 'Yes', noLabel: 'No' },
    location: {
        label: 'Location',
        placeholder: 'City, State or Country',
        hint: 'Optional',
    },
    addPhotos: {
        label: 'Add Photos (Optional)',
        hint: 'Click to upload or drag and drop',
        accept: 'PNG, JPG',
        maxSize: '5MB',
    },
    termsText: 'By submitting this review, you agree to the Terms.',
    cancelLabel: 'Cancel',
    submitLabel: 'Submit Review',
};

function WriteReviewButtonWrapper(): ReactElement {
    const inRouter = useInRouterContext();
    const content = (
        <ConfigProvider config={mockConfig}>
            <AuthProvider value={{ userType: 'registered', customerId: 'cust-123' }}>
                <ProductProvider product={mockProduct}>
                    <ProductReviewsProvider summary={mockSummary}>
                        <div className="max-w-md p-6">
                            <WriteReviewButton formConfig={mockFormConfig} />
                        </div>
                    </ProductReviewsProvider>
                </ProductProvider>
            </AuthProvider>
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

const meta: Meta<typeof WriteReviewButtonWrapper> = {
    title: 'Extensions/Ratings & Reviews/Write Review Button',
    component: WriteReviewButtonWrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
The WriteReviewButton component opens the Write a Review modal.

**Features:**
- Fetches form config from the product content adapter (getWriteReviewForm)
- Displays the modal title as the button label when loaded
- Must be used within PDP context (ProductProvider + ProductReviewsProvider)
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof WriteReviewButtonWrapper>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Button label comes from adapter (mock returns "Write a Review" after load)
        const button = await screen.findByRole('button', { name: /write a review/i }, { timeout: 5000 });
        await expect(button).toBeInTheDocument();
    },
};

export const OpensModal: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await import('@/components/info-modal');
        const button = await screen.findByRole('button', { name: /write a review/i }, { timeout: 5000 });
        await userEvent.click(button);
        const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
        await expect(dialog).toBeInTheDocument();
        await expect(within(dialog).getByRole('heading', { name: 'Write a Review' })).toBeInTheDocument();
    },
};
