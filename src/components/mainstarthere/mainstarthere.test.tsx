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

vi.mock('@/components/product-tile', () => ({
    ProductTileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ProductTile: ({ product }: { product: { productId: string } }) => <li>{product.productId}</li>,
}));
vi.mock('@/components/link', () => ({
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock('@/providers/dynamic-image', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import MainStartHere from './mainstarthere';

const hits = Array.from({ length: 9 }, (_, i) => ({ productId: `DU-${i + 1}` }));

describe('MainStartHere (featured products)', () => {
    test('shows the first six featured products instead of static promo cards', async () => {
        render(<MainStartHere searchResult={Promise.resolve({ hits }) as never} />);

        expect(await screen.findByText('DU-1')).toBeInTheDocument();
        expect(screen.getByText('DU-6')).toBeInTheDocument();
        expect(screen.queryByText('DU-7')).not.toBeInTheDocument();
        expect(screen.queryByText(/Final Hours/)).not.toBeInTheDocument();
        expect(screen.getByTestId('all-products-button')).toHaveAttribute('href', '/category/root');
    });

    test('shows an error message when the products fail to load', async () => {
        render(<MainStartHere searchResult={Promise.reject(new Error('boom')) as never} />);
        expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
});
