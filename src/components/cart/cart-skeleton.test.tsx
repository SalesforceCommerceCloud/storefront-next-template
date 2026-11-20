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
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import CartSkeleton from './cart-skeleton';

describe('CartSkeleton', () => {
    describe('Itemized Skeleton Structure', () => {
        test('should render itemized skeletons when item count is greater than 0', () => {
            const { container } = render(<CartSkeleton productItemCount={1} />);
            expect(screen.getByTestId('sf-cart-skeleton')).toBeInTheDocument();
            // Page heading h1 placeholder (h-10)
            const titleSkeleton = container.querySelector('.h-10.w-48');
            expect(titleSkeleton).toBeInTheDocument();
            // Product image placeholder
            const imageSkeleton = container.querySelector('.aspect-square');
            expect(imageSkeleton).toBeInTheDocument();
            // Price block placeholder
            const priceSkeleton = container.querySelector('[class*="w-[8.5rem]"]');
            expect(priceSkeleton).toBeInTheDocument();
            // Order summary heading placeholder
            const summaryTitle = container.querySelector('.h-7.w-28');
            expect(summaryTitle).toBeInTheDocument();
        });

        test('should render the correct number of product item skeletons', () => {
            const { container } = render(<CartSkeleton productItemCount={3} />);
            const productImages = container.querySelectorAll('.aspect-square');
            expect(productImages).toHaveLength(3);
        });

        test('should reserve space for the fixed mobile checkout bar', () => {
            const { container } = render(<CartSkeleton productItemCount={1} />);
            // Real CartContent uses `pb-32 md:pb-0` to leave room for the fixed bottom CTA.
            const root = container.querySelector('[data-testid="sf-cart-skeleton"]');
            expect(root?.className).toContain('pb-32');
            expect(root?.className).toContain('md:pb-0');
        });
    });

    describe('Recommendations slot', () => {
        test('renders the slot when provided', () => {
            render(
                <CartSkeleton
                    productItemCount={1}
                    recommendationsSlot={<div data-testid="recs-skeleton-slot">recs</div>}
                />
            );
            expect(screen.getByTestId('recs-skeleton-slot')).toBeInTheDocument();
        });

        test('renders nothing in the recommendations region when no slot is provided', () => {
            const { queryByTestId, container } = render(<CartSkeleton productItemCount={1} />);
            // Sanity: the page heading still renders, but no slot leaks into the tree.
            expect(container.querySelector('.h-10.w-48')).toBeInTheDocument();
            expect(queryByTestId('recs-skeleton-slot')).not.toBeInTheDocument();
        });
    });

    describe('Consistent State', () => {
        test('should render consistently across multiple renders', () => {
            const { rerender } = render(<CartSkeleton productItemCount={1} />);

            expect(screen.getByTestId('sf-cart-skeleton')).toBeInTheDocument();

            rerender(<CartSkeleton productItemCount={1} />);

            expect(screen.getByTestId('sf-cart-skeleton')).toBeInTheDocument();
        });
    });
});
