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
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { ProductProvider } from '@/providers/product-context';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import { mockConfig } from '@/test-utils/config';
import { ProductRatingSummary } from '../product-rating-summary';

const mockProduct = { id: 'storybook-product', name: 'Storybook Product' };

function ProductRatingSummaryWrapper({ interactive }: { interactive?: boolean }): ReactElement {
    const inRouter = useInRouterContext();
    const content = (
        <ConfigProvider config={mockConfig}>
            <ProductProvider product={mockProduct}>
                <ProductReviewsProvider>
                    <div className="max-w-md">
                        <ProductRatingSummary interactive={interactive} />
                    </div>
                </ProductReviewsProvider>
            </ProductProvider>
        </ConfigProvider>
    );

    if (inRouter) return content;

    const router = createMemoryRouter([{ path: '/', element: content }], { initialEntries: ['/'] });
    return <RouterProvider router={router} />;
}

const meta: Meta<typeof ProductRatingSummaryWrapper> = {
    title: 'Products/Product View/Product Rating Summary',
    component: ProductRatingSummaryWrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Star rating summary under product description. Hover or focus to open distribution popover; click or Enter/Space to expand reviews accordion.',
            },
        },
    },
    argTypes: {
        interactive: {
            description:
                'When false, disables hover popover and review-link interactions (used by ProductInfo when other components own the rating popover).',
            control: 'boolean',
        },
    },
};

export default meta;

type Story = StoryObj<typeof ProductRatingSummaryWrapper>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes the `interactive`
 * prop, the only customization the component accepts. Review-count variations
 * (0, 1, many reviews) are not driven from props or fixtures — they come from
 * the `ProductReviewsProvider` adapter, which doesn't accept seed data. Adding
 * a controlled provider is component-source work outside this PR's boundary,
 * so review-count states stay covered by the customer-reviews-section stories.
 */
export const Playground: Story = {
    args: {
        interactive: true,
    },
};
