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

import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/product-carousel', () => ({ ProductCarouselSkeleton: () => <div>loading</div> }));
vi.mock('@/components/product-carousel/carousel', () => ({
    ProductCarouselWithData: ({ data }: { data: { hits: { productId: string }[] } }) => (
        <ul data-testid="carousel">
            {data.hits.map((hit) => (
                <li key={hit.productId}>{hit.productId}</li>
            ))}
        </ul>
    ),
}));
vi.mock('@/components/link', () => ({
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
}));

import TopPicksSlider from './maintoppicksslider';

describe('TopPicksSlider', () => {
    test('renders the loaded products and an All Products button to the full list', async () => {
        const searchResult = Promise.resolve({ hits: [{ productId: 'DU-1' }, { productId: 'DU-2' }] }) as never;
        render(<TopPicksSlider searchResult={searchResult} />);

        expect(await screen.findByText('DU-1')).toBeInTheDocument();
        expect(screen.getByText('DU-2')).toBeInTheDocument();
        expect(screen.getByTestId('all-products-button')).toHaveAttribute('href', '/category/root');
        expect(screen.getByTestId('all-products-button')).toHaveTextContent('All Products');
    });

    test('still shows the All Products button when the products fail to load', async () => {
        const searchResult = Promise.reject(new Error('boom')) as never;
        render(<TopPicksSlider searchResult={searchResult} />);
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByTestId('all-products-button')).toBeInTheDocument();
    });
});
