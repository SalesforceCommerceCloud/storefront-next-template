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

import type { ReactNode } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { uiConfig } from '@/lib/config.ui';

// CartContent is heavy and not what's under test — render its `recommendationsSlot`
// inline so the route-level Suspense + ProductRecommendationSkeleton fallback wiring
// is the only thing being exercised.
vi.mock('@/components/cart/cart-content', () => ({
    default: ({ recommendationsSlot }: { recommendationsSlot?: ReactNode }) => (
        <div data-testid="cart-content-stub">{recommendationsSlot}</div>
    ),
}));

// Render the recommendation skeleton with a stable test id so the test can locate it
// without relying on internal Tailwind classnames or the (heavy) ProductCarouselSkeleton tree.
vi.mock('@/components/product/skeletons', async () => {
    const actual = await vi.importActual<typeof import('@/components/product/skeletons')>(
        '@/components/product/skeletons'
    );
    return {
        ...actual,
        ProductRecommendationSkeleton: ({ title }: { title?: string }) => (
            <div data-testid="product-recommendation-skeleton">{title}</div>
        ),
    };
});

// ProductRecommendations stub that mirrors the real component's "show fallback while
// `data` is pending" contract: the test only needs the Suspense behaviour, not the
// resolved carousel rendering.
vi.mock('@/components/product-recommendations', async () => {
    const { Suspense, use } = await import('react');
    const Resolved = ({ promise }: { promise: Promise<{ recs?: unknown[] }> }) => {
        const value = use(promise);
        return <div data-testid="product-recommendations-resolved">{(value?.recs?.length ?? 0).toString()}</div>;
    };
    return {
        default: ({ data, fallback }: { data?: Promise<{ recs?: unknown[] }>; fallback?: ReactNode }) => (
            <Suspense fallback={fallback ?? null}>{data ? <Resolved promise={data} /> : null}</Suspense>
        ),
    };
});

vi.mock('@/components/cart/cart-skeleton', () => ({
    default: ({ recommendationsSlot }: { recommendationsSlot?: ReactNode }) => (
        <div data-testid="cart-skeleton">{recommendationsSlot}</div>
    ),
}));

// Per-page UI flags. Default to the canonical value (recommendations on) so the
// existing recommendation tests below are unaffected; the gating test flips it per-case.
vi.mock('@/lib/config.ui', () => ({
    uiConfig: { pages: { cart: { showRecommendations: true } } },
}));

vi.mock('@/components/cart/cart-load-error', () => ({
    CartLoadError: () => <div data-testid="cart-load-error" />,
}));

vi.mock('@/components/seo-meta', () => ({
    SeoMeta: () => <div data-testid="seo-meta" />,
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

const mockBasketData = {
    basket: { basketId: 'b1', productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1 }] } as any,
    productsByItemId: { i1: { id: 'p1' } } as any,
    bonusProductsById: {},
    promotions: {},
    storesByStoreId: {},
};

const renderCartRoute = async (loaderData: {
    cartMayAlsoLikePromise: Promise<any>;
    cartRecentlyViewedPromise: Promise<any>;
}) => {
    const Cart = (await import('./_app.cart')).default;
    const router = createMemoryRouter(
        [
            {
                path: '/cart',
                element: <Cart />,
                loader: () => ({
                    basketDataPromise: Promise.resolve(mockBasketData),
                    wishlistProductIdsPromise: Promise.resolve([]),

                    cartMayAlsoLikePromise: loaderData.cartMayAlsoLikePromise,
                    cartRecentlyViewedPromise: loaderData.cartRecentlyViewedPromise,
                    ruleBasedBonusProductsPromise: Promise.resolve({}),
                    basketSnapshot: null,
                    pageUrl: 'http://localhost/cart',
                }),
            },
        ],
        { initialEntries: ['/cart'] }
    );

    return render(
        <AllProvidersWrapper>
            <RouterProvider router={router} />
        </AllProvidersWrapper>
    );
};

describe('Cart route component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to the canonical default — the gating test mutates this.
        uiConfig.pages.cart.showRecommendations = true;
    });

    describe('Recommendations skeleton fallback', () => {
        test('renders a ProductRecommendationSkeleton fallback per recommender while promises are pending', async () => {
            // Pending promises keep both <ProductRecommendations data={…}> Suspense boundaries
            // showing their fallback. The cart's upper carousel can sit in the initial viewport
            // on small carts (single line item), so the fallback must reserve carousel-shaped
            // vertical space rather than falling through to `null` (which would cause CLS).
            const pending = new Promise<any>(() => {});

            await renderCartRoute({
                cartMayAlsoLikePromise: pending,
                cartRecentlyViewedPromise: pending,
            });

            await waitFor(() => {
                expect(screen.getByTestId('cart-content-stub')).toBeInTheDocument();
            });

            const skeletons = await screen.findAllByTestId('product-recommendation-skeleton');
            expect(skeletons).toHaveLength(1);

            // The skeleton receives the translated title for its recommender so the heading doesn't pop in when the
            // promise resolves.
            const titles = skeletons.map((el) => el.textContent);
            expect(titles).toHaveLength(1);
            expect(titles[0]).toBe('You might also like');
        });

        test('renders the rec skeleton via the CartSkeleton fallback while basketDataPromise is pending', async () => {
            // Gate A: when the basket itself hasn't resolved yet, the resolved-branch <CartBody>
            // (and its rec Suspense boundaries) aren't in the tree. The route-level CartSkeleton
            // fallback must therefore render the rec skeletons itself, otherwise the cart's upper
            // carousel slot is empty during initial load and shifts in once the basket resolves.
            const pendingBasket = new Promise<typeof mockBasketData>(() => {});
            const pendingRecs = new Promise<any>(() => {});

            const Cart = (await import('./_app.cart')).default;
            const router = createMemoryRouter(
                [
                    {
                        path: '/cart',
                        element: <Cart />,
                        loader: () => ({
                            basketDataPromise: pendingBasket,
                            wishlistProductIdsPromise: Promise.resolve([]),

                            cartMayAlsoLikePromise: pendingRecs,
                            cartRecentlyViewedPromise: pendingRecs,
                            ruleBasedBonusProductsPromise: Promise.resolve({}),
                            basketSnapshot: { uniqueProductCount: 1 },
                            pageUrl: 'http://localhost/cart',
                        }),
                    },
                ],
                { initialEntries: ['/cart'] }
            );

            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            // Gate A is showing — CartSkeleton, not CartBody/cart-content-stub.
            await waitFor(() => {
                expect(screen.getByTestId('cart-skeleton')).toBeInTheDocument();
            });
            expect(screen.queryByTestId('cart-content-stub')).not.toBeInTheDocument();

            // The rec skeleton must already be in the DOM — passed through CartSkeleton's
            // recommendationsSlot — so the carousel area doesn't pop in once the basket resolves.
            const skeletons = await screen.findAllByTestId('product-recommendation-skeleton');
            expect(skeletons).toHaveLength(1);
            const titles = skeletons.map((el) => el.textContent);
            expect(titles).toHaveLength(1);
            expect(titles[0]).toBe('You might also like');
        });

        test('does not render ProductRecommendationSkeleton once recommendation promises resolve', async () => {
            await renderCartRoute({
                cartMayAlsoLikePromise: Promise.resolve({ recs: [] }),
                cartRecentlyViewedPromise: Promise.resolve({ recs: [] }),
            });

            await waitFor(() => {
                expect(screen.getByTestId('cart-content-stub')).toBeInTheDocument();
            });

            // Both Suspense boundaries flip from the skeleton fallback to the resolved subtree
            // (the stub renders one element per resolved promise).
            await waitFor(() => {
                expect(screen.getAllByTestId('product-recommendations-resolved')).toHaveLength(2);
            });
            expect(screen.queryByTestId('product-recommendation-skeleton')).not.toBeInTheDocument();
        });
    });

    describe('Recommendations gating (uiConfig.pages.cart.showRecommendations)', () => {
        test('renders no recommendation region when the vertical disables recommendations', async () => {
            // Cosmetic sets showRecommendations: false via the vertical-resolved config.ui
            // override. The loader still returns (empty) rec promises so the shape stays stable,
            // but the route must render neither the live slot nor its reserved-space skeleton.
            uiConfig.pages.cart.showRecommendations = false;

            await renderCartRoute({
                cartMayAlsoLikePromise: Promise.resolve({ recs: [] }),
                cartRecentlyViewedPromise: Promise.resolve({ recs: [] }),
            });

            await waitFor(() => {
                expect(screen.getByTestId('cart-content-stub')).toBeInTheDocument();
            });

            // No skeleton, no resolved carousel — the recommendationsSlot is undefined.
            expect(screen.queryByTestId('product-recommendation-skeleton')).not.toBeInTheDocument();
            expect(screen.queryByTestId('product-recommendations-resolved')).not.toBeInTheDocument();
        });
    });

    describe('shouldRevalidate export', () => {
        // The policy itself is covered by src/lib/revalidation/routes/cart.test.ts. Here we only
        // assert the cart route wires up that exact function, so the behavior isn't re-tested at the route.
        test('re-exports the cart revalidation policy', async () => {
            const { shouldRevalidate } = await import('./_app.cart');
            const { shouldRevalidate: shouldRevalidateCart } = await import('@/lib/revalidation/routes/cart');
            expect(shouldRevalidate).toBe(shouldRevalidateCart);
        });
    });
});
