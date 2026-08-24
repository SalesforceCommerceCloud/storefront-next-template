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
 *
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductMerchandisingGridSkeleton from './skeleton';

const { useConfig } = vi.hoisted(() => ({
    useConfig: vi.fn(() => ({ global: { productListing: { defaultProductTileImgAspectRatio: 0.8 } } })),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig }));

describe('ProductMerchandisingGridSkeleton', () => {
    test('reserves the resolved header and product-tile structure', () => {
        const { container } = render(
            <ProductMerchandisingGridSkeleton
                columns={3}
                rows={2}
                title="Featured pieces"
                shopAllUrl="/category"
                shopAllText="Shop all"
            />
        );

        expect(screen.getByTestId('product-merchandising-grid-skeleton-header')).toBeInTheDocument();
        expect(container.querySelectorAll('.product-tile-skeleton')).toHaveLength(6);
        const productImagePlaceholders = container.querySelectorAll('.product-tile-skeleton .aspect-square');
        expect(productImagePlaceholders).toHaveLength(6);
        productImagePlaceholders.forEach((placeholder) => {
            expect(placeholder).toHaveStyle({ aspectRatio: '0.8' });
        });
    });

    test('uses a square placeholder when product tiles use the default image ratio', () => {
        useConfig.mockReturnValue({ global: { productListing: { defaultProductTileImgAspectRatio: 1 } } });
        const { container } = render(<ProductMerchandisingGridSkeleton columns={2} rows={1} />);

        container.querySelectorAll('.product-tile-skeleton .aspect-square').forEach((placeholder) => {
            expect(placeholder).not.toHaveAttribute('style');
        });
    });
});
