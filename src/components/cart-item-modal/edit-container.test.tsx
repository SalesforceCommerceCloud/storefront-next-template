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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { variantProduct } from '@/components/__mocks__/master-variant-product';

const { t } = getTranslation();

type Product = ShopperProducts.schemas['Product'];

const mockLoad = vi.fn().mockResolvedValue(undefined);

interface MockFetcherState {
    load: typeof mockLoad;
    data: Product | null;
    state: 'idle' | 'loading';
    success: boolean;
    errors?: string[];
}

let variantFetcherState: MockFetcherState;

const mockUseScapiFetcher = vi.fn((_client: string, _method: string, _opts: Record<string, unknown>) => {
    return variantFetcherState;
});

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: (...args: unknown[]) => mockUseScapiFetcher(...(args as Parameters<typeof mockUseScapiFetcher>)),
}));

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
vi.mock('@/extensions/ratings-reviews/providers/product-reviews-context', () => ({
    ProductReviewsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useProductReviews: () => ({
        reviewsSummary: null,
        reviewsSummaryLoading: false,
        reviews: [],
        reviewsLoading: false,
        loadReviewsIfNeeded: () => {},
        aiSummary: '',
        addReviewOptimistic: () => {},
        removeReviewOptimistic: () => {},
        expandReviews: () => {},
        registerExpand: () => {},
        registerOnExpanded: () => {},
        triggerOnExpanded: () => {},
    }),
}));
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

// Lazy import so the mock is installed first
const { CartItemModalEditContainer } = await import('./edit-container');

const basketProduct: Product = {
    id: '640188017041M',
    type: { variant: true },
    name: 'Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit',
    variationValues: { color: 'CHARCWL', size: '040', width: 'S' },
    variationAttributes: [
        { id: 'color', name: 'Color', values: [{ name: 'Charcoal', value: 'CHARCWL', orderable: true }] },
        { id: 'size', name: 'Size', values: [{ name: '040', value: '040', orderable: true }] },
    ],
    variants: [
        { productId: '640188017041M', variationValues: { color: 'CHARCWL', size: '040', width: 'S' } },
        { productId: '640188017042M', variationValues: { color: 'CHARCWL', size: '042', width: 'S' } },
    ],
    price: 299.99,
    currency: 'USD',
};

function renderEditContainer(overrides: Partial<React.ComponentProps<typeof CartItemModalEditContainer>> = {}) {
    const props = {
        product: basketProduct,
        itemId: 'item-1',
        open: true,
        onOpenChange: vi.fn(),
        initialQuantity: 2,
        ...overrides,
    };
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <CartItemModalEditContainer {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return { ...render(<RouterProvider router={router} />), props };
}

describe('CartItemModalEditContainer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        variantFetcherState = {
            load: mockLoad,
            data: null,
            state: 'idle' as const,
            success: false,
        };
    });

    describe('product display', () => {
        test('renders product data directly from product prop without additional fetch', () => {
            renderEditContainer();

            expect(screen.getByText(basketProduct.name as string)).toBeInTheDocument();
        });

        test('does not make a full product fetch with variations expand', () => {
            renderEditContainer();

            const fullProductCall = mockUseScapiFetcher.mock.calls.find((call) => {
                const params = call[2]?.params as { query?: { expand?: string[] } } | undefined;
                return params?.query?.expand?.includes('variations');
            });
            expect(fullProductCall).toBeUndefined();
        });
    });

    describe('variant fetcher', () => {
        test('does not trigger variant fetch when selected variant matches productId', () => {
            renderEditContainer();

            const params = mockUseScapiFetcher.mock.calls[0][2].params as {
                path: { id: string };
            };
            expect(params.path.id).toBe('');
            expect(mockLoad).not.toHaveBeenCalled();
        });

        test('configures variant fetcher with the data needed for the selected product URL and cart state', () => {
            renderEditContainer();

            const params = mockUseScapiFetcher.mock.calls[0][2].params as {
                query: { expand: string[]; allImages: boolean };
            };
            expect(params.query.allImages).toBe(true);
            expect(params.query.expand).toEqual(['availability', 'images', 'prices', 'promotions']);
        });

        test('does not retry fetch when variant fetcher has errors (prevents infinite loop)', () => {
            variantFetcherState = {
                load: mockLoad,
                data: null,
                state: 'idle' as const,
                success: false,
                errors: ['Network error'],
            };
            renderEditContainer({
                product: {
                    ...basketProduct,
                    variationValues: { color: 'CHARCWL', size: '042', width: 'S' },
                    variants: [
                        { productId: '640188017041M', variationValues: { color: 'CHARCWL', size: '040', width: 'S' } },
                        { productId: '640188017042M', variationValues: { color: 'CHARCWL', size: '042', width: 'S' } },
                    ],
                },
            });

            expect(mockLoad).not.toHaveBeenCalled();
        });

        test('renders variant data when fetcher resolves for a different variant', () => {
            const variantData: Product = {
                ...variantProduct,
                id: '640188017042M',
                name: 'Charcoal Suit - Size 042',
            };
            variantFetcherState = {
                load: mockLoad,
                data: variantData,
                state: 'idle' as const,
                success: true,
            };
            renderEditContainer({
                product: {
                    ...basketProduct,
                    // variationValues point to the 042M variant, but product.id is 041M,
                    // so needsVariantFetch = true and variant fetcher data is applied.
                    variationValues: { color: 'CHARCWL', size: '042', width: 'S' },
                    variants: [
                        { productId: '640188017041M', variationValues: { color: 'CHARCWL', size: '040', width: 'S' } },
                        { productId: '640188017042M', variationValues: { color: 'CHARCWL', size: '042', width: 'S' } },
                    ],
                },
            });

            expect(screen.getByText(variantData.name as string)).toBeInTheDocument();
        });
    });

    describe('modal rendering', () => {
        test('renders dialog with edit title when open', () => {
            renderEditContainer();

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText(t('editItem:title'))).toBeInTheDocument();
        });

        test('does not render dialog when closed', () => {
            renderEditContainer({ open: false });

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });
});
