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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ShopperProducts } from '@/scapi';
import ProductViewProvider, { useProductView } from './product-view';

// Stub the hook so the provider renders without the basket / fetcher stack — the assertions here
// are about the provider's context value, not the hook's internals.
const { mockUseProductActions } = vi.hoisted(() => ({ mockUseProductActions: vi.fn() }));

vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: mockUseProductActions,
}));

vi.mock('@/hooks/product/use-current-variant', () => ({
    useCurrentVariant: () => undefined,
}));

// The provider also merges URL-derived selections with a client-side override before deriving
// currentVariant (see product-view.tsx). Stub this too so the assertions here — about the
// provider's context value, not the hook's internals — don't need a Router context.
vi.mock('@/hooks/product/use-selected-variations', () => ({
    useSelectedVariations: () => ({}),
}));

const product = { id: 'p1', type: { item: true } } as ShopperProducts.schemas['Product'];

describe('ProductViewProvider', () => {
    beforeEach(() => {
        mockUseProductActions.mockReturnValue({});
    });

    test('exposes allowMissingPrice=false by default', () => {
        const { result } = renderHook(() => useProductView(), {
            wrapper: ({ children }) => <ProductViewProvider product={product}>{children}</ProductViewProvider>,
        });
        expect(result.current.allowMissingPrice).toBe(false);
    });

    test('forwards an explicit allowMissingPrice prop', () => {
        const { result } = renderHook(() => useProductView(), {
            wrapper: ({ children }) => (
                <ProductViewProvider product={product} allowMissingPrice>
                    {children}
                </ProductViewProvider>
            ),
        });
        expect(result.current.allowMissingPrice).toBe(true);
    });

    test('does not initialize a fulfillment selection', () => {
        renderHook(() => useProductView(), {
            wrapper: ({ children }) => <ProductViewProvider product={product}>{children}</ProductViewProvider>,
        });

        expect(mockUseProductActions).toHaveBeenCalledWith(
            expect.objectContaining({ initialFulfillmentSelection: undefined })
        );
    });

    test('mirrors the hook gate bypass when itemId is set (edit mode), so display tracks gate', () => {
        // The hook bypasses the price gate when an item is in the basket. The provider must
        // mirror that into the display path so a no-price in-basket line doesn't show
        // "Price unavailable" next to an enabled Update button.
        const { result } = renderHook(() => useProductView(), {
            wrapper: ({ children }) => (
                <ProductViewProvider product={product} mode="edit" itemId="cart-line-1">
                    {children}
                </ProductViewProvider>
            ),
        });
        expect(result.current.allowMissingPrice).toBe(true);
    });

    test('forwards an initial fulfillment selection to the product actions state', () => {
        renderHook(() => useProductView(), {
            wrapper: ({ children }) => (
                <ProductViewProvider product={product} initialFulfillmentSelection={{ optionId: 'delivery' }}>
                    {children}
                </ProductViewProvider>
            ),
        });

        expect(mockUseProductActions).toHaveBeenCalledWith(
            expect.objectContaining({ initialFulfillmentSelection: { optionId: 'delivery' } })
        );
    });
});
