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
import { act, render, screen, waitFor } from '@testing-library/react';
import { use, StrictMode } from 'react';
import type { ShopperProducts } from '@/scapi';
import { loader, type ProductPageData } from './_app.p.$';

const tracking = vi.hoisted(() => ({
    consentKey: 'accepted',
    trackViewProduct:
        vi.fn<(data: { product: ShopperProducts.schemas['Product'] }, signal?: AbortSignal) => Promise<boolean>>(),
    location: { pathname: '/p/test-product-123', search: '', hash: '', key: 'default', state: null },
    navigationState: 'idle',
    siteId: 'test-site',
    localeId: 'en-US',
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: { id: tracking.siteId }, locale: { id: tracking.localeId } }),
}));

// ProductPage reads `nonce` from the root loader. Tests render the page outside
// a real data router, so stub `useRouteLoaderData` with a deterministic value.
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useRouteLoaderData: (id: string) => (id === 'root' ? { nonce: undefined } : undefined),
        useLocation: () => tracking.location,
        useNavigation: () => ({ state: tracking.navigationState }),
    };
});

// Mock the components and utilities
vi.mock('@/components/product-skeleton', () => ({
    default: () => <div data-testid="product-skeleton">Loading...</div>,
}));

vi.mock('@/components/product-view', () => ({
    default: ({ product, category }: any) => (
        <div data-testid="product-view">
            <div data-testid="product-name">{product?.name}</div>
            <div data-testid="category-name">{category?.name}</div>
        </div>
    ),
}));

// Flattened vertical mirrors import the overlay explicitly while the canonical
// route imports the product-view barrel. Keep the route test isolated in both forms.
vi.mock('@/components/product-view/product-view', () => ({
    default: ({ product, category }: any) => (
        <div data-testid="product-view">
            <div data-testid="product-name">{product?.name}</div>
            <div data-testid="category-name">{category?.name}</div>
        </div>
    ),
}));

vi.mock('@/components/product-bottom-bar', () => ({
    default: () => <div data-testid="product-bottom-bar" />,
}));

vi.mock('@/components/product-view/child-products', () => ({
    default: ({ parentProduct }: any) => (
        <div data-testid="child-products">
            <div data-testid="parent-product-id">{parentProduct?.id}</div>
        </div>
    ),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

vi.mock('@/components/typography', () => ({
    Typography: ({ children, variant, className, ...props }: any) => (
        <div data-variant={variant} className={className} {...props}>
            {children}
        </div>
    ),
}));

vi.mock('@/components/product/skeletons', () => ({
    ProductRecommendationsSkeleton: () => <div data-testid="recommendations-skeleton">Loading recommendations...</div>,
}));

vi.mock('@/components/with-suspense', () => ({
    default: (Component: any, _options: any) => {
        return function WrappedComponent(props: any) {
            return (
                <div data-testid="with-suspense">
                    <Component {...props} />
                </div>
            );
        };
    },
}));

vi.mock('@/components/product-carousel', () => ({
    ProductCarouselWithSuspense: ({ title, resolve }: any) => {
        try {
            // oxlint-disable-next-line react/rules-of-hooks -- oxlint flags use() in try/catch; eslint-plugin-react-hooks accepts this test pattern
            const data = use(resolve);
            return (
                <div data-testid="product-carousel">
                    <div data-testid="carousel-title">{title}</div>
                    <div data-testid="carousel-hits">{(data as any)?.hits?.length || 0}</div>
                </div>
            );
        } catch {
            return (
                <div data-testid="product-carousel">
                    <div data-testid="carousel-title">{title}</div>
                </div>
            );
        }
    },
}));

vi.mock('@/lib/product/product-utils', () => ({
    isProductSet: vi.fn(),
    isProductBundle: vi.fn(),
}));

vi.mock('@/components/product-recommendations', () => ({
    default: ({ recommender }: any) => (
        <div data-testid="product-recommendations">
            <div data-testid="recommender-title">{recommender?.title}</div>
        </div>
    ),
}));

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        consentKey: tracking.consentKey,
        trackViewProduct: tracking.trackViewProduct,
    }),
}));

vi.mock('@/providers/product-context', () => ({
    ProductProvider: ({ children }: any) => <div data-testid="product-provider">{children}</div>,
    useProduct: vi.fn(() => null),
}));

vi.mock('@/providers/product-view', () => ({
    default: ({ children }: any) => <div data-testid="product-view-provider">{children}</div>,
    useOptionalProductView: vi.fn(() => null),
}));

vi.mock('@/components/region', () => ({
    Region: ({ fallback }: any) => <div data-testid="region">{fallback}</div>,
}));

vi.mock('@/components/category-breadcrumbs', () => ({
    default: ({ category }: any) => <div data-testid="category-breadcrumbs">{category?.name}</div>,
}));

vi.mock('@/components/json-ld', () => ({
    JsonLd: ({ id }: any) => <script data-testid={id} type="application/ld+json" />,
}));

vi.mock('@/targets/ui-target', () => ({
    UITarget: () => null,
}));

vi.mock('@/extensions/ratings-reviews/providers/product-reviews-context', () => ({
    ProductReviewsProvider: ({ children }: any) => <div data-testid="product-reviews-provider">{children}</div>,
}));

vi.mock('@/extensions/ratings-reviews/components/target/reviews-section-target', () => ({
    default: () => <div data-testid="reviews-section-target" />,
}));

vi.mock('@/extensions/ratings-reviews/components/target/reviews-summary-target', () => ({
    default: () => <div data-testid="reviews-summary-target" />,
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/store-locator/middlewares/selected-store.server', () => ({
    // `defaultValue: null` so the loader's `context.get(selectedStoreContext)` resolves to null
    // (no store selected) instead of throwing, since the test context never sets this key.
    selectedStoreContext: { id: 'selectedStoreContext', defaultValue: null },
}));

vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    default: ({ children }: any) => <div data-testid="pickup-provider">{children}</div>,
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
vi.mock('@/extensions/shipping-delivery/context/shipping-delivery-context', () => ({
    ShippingDeliveryProvider: ({ children, productId }: any) => (
        <div data-testid="shipping-delivery-provider" data-product-id={productId}>
            {children}
        </div>
    ),
}));
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

// Server-side loader dependencies. Mocked so the loader can run in isolation and its
// SEO-URL wiring (buildSeoPageUrl / redirectToCanonicalPath, both left real) can be asserted.
vi.mock('@/lib/api/products.server', () => ({
    fetchProductById: vi.fn(),
}));

vi.mock('@/lib/seo/url-resolution.server', () => ({
    resolveProductRoute: vi.fn(),
}));

const mockAttemptRouteSeoFallback = vi.hoisted(() => vi.fn());
vi.mock('@/lib/seo/route-fallback.server', () => ({
    attemptRouteSeoFallback: mockAttemptRouteSeoFallback,
}));

vi.mock('@/lib/product/swatch-products.server', () => ({
    resolveSwatchProductImages: vi.fn(),
}));

vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: vi.fn(),
}));

vi.mock('@/utils/product-schema', () => ({
    generateProductSchema: vi.fn(),
}));

vi.mock('@/extensions/ratings-reviews/lib/api/reviews.server', () => ({
    getReviewsSummary: vi.fn(),
    getReviews: vi.fn(),
    getWriteReviewForm: vi.fn(),
}));

vi.mock('@/extensions/bnpl/lib/api/bnpl.server', () => ({
    getBuyNowPayLaterMessage: vi.fn(),
    getBuyNowPayLaterLearnMore: vi.fn(),
}));

vi.mock('@/extensions/product-content/lib/api/product-content.server', () => ({
    getReturnsAndWarranty: vi.fn(),
    pdpSectionApi: {},
}));

vi.mock('@/extensions/product-content/lib/pdp-sections', () => ({
    resolvePdpSections: vi.fn(() => []),
}));

// Import the functions we want to test
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { createTestContext } from '@/lib/test-utils';
import { fetchProductById } from '@/lib/api/products.server';
import { resolveProductRoute } from '@/lib/seo/url-resolution.server';
import { resolveSwatchProductImages } from '@/lib/product/swatch-products.server';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { generateProductSchema } from '@/utils/product-schema';
import { getReviewsSummary, getReviews, getWriteReviewForm } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { getBuyNowPayLaterMessage, getBuyNowPayLaterLearnMore } from '@/extensions/bnpl/lib/api/bnpl.server';
import { getReturnsAndWarranty } from '@/extensions/product-content/lib/api/product-content.server';
import type { Route } from './+types/_app.p.$';
import config from '@/config/server';

// Import the route module after mocks are set up

describe('Product Detail Route', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        tracking.consentKey = 'accepted';
        tracking.trackViewProduct.mockReset().mockResolvedValue(true);
        tracking.location = { pathname: '/p/test-product-123', search: '', hash: '', key: 'default', state: null };
        tracking.navigationState = 'idle';
        tracking.siteId = 'test-site';
        tracking.localeId = 'en-US';
        // Reset modules to ensure fresh import and createPage call
        vi.resetModules();
        // Import the route module to trigger createPage call with mocks in place
        await import('./_app.p.$');
    });
    const mockProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product-123',
        name: 'Test Product',
        primaryCategoryId: 'test-category-123',
        shortDescription: 'Test product description',
        longDescription: 'Long test product description',
        master: undefined,
    };

    const mockPage = Promise.resolve({
        id: 'pdp',
        typeId: 'page',
        aspectTypeId: 'pdp',
        name: 'Product Detail Page',
        regions: [],
    });

    const mockExtensionLoaderData = {
        youMightAlsoLikeRecommendations: Promise.resolve({}),
        completeTheRoomRecommendations: Promise.resolve({}),
        // @sfdc-extension-block-start SFDC_EXT_BNPL
        bnplMessage: Promise.resolve({
            paymentCount: 4,
            amountPerPayment: 0,
        }),
        bnplLearnMore: Promise.resolve({
            paymentSchedule: { amountPerPayment: 0, totalAmount: 0, schedule: [] },
            howItWorks: [],
            disclosures: '',
        }),
        // @sfdc-extension-block-end SFDC_EXT_BNPL
        // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
        reviewsSummary: {
            totalCount: 0,
            averageRating: 0,
            distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 0, fiveStars: 0 },
            basedOnLabel: '',
        },
        reviewsList: Promise.resolve({
            heading: '',
            subtitle: '',
            writeReviewButtonLabel: '',
            summary: {
                averageRating: 0,
                totalCount: 0,
                basedOnLabel: '',
                distribution: { oneStar: 0, twoStars: 0, threeStars: 0, fourStars: 0, fiveStars: 0 },
            },
            searchPlaceholder: '',
            sortOptions: [],
            reviews: [],
        }),
        writeReviewForm: Promise.resolve({
            title: '',
            overallRating: { label: '', required: true, placeholder: '' },
            reviewTitle: { label: '', placeholder: '', maxCharacters: 0 },
            reviewBody: { label: '', placeholder: '', minCharacters: 0, maxCharacters: 0 },
            recommend: { label: '', yesLabel: '', noLabel: '' },
            addPhotos: { label: '', hint: '', accept: '', maxSize: '' },
            termsText: '',
            cancelLabel: '',
            submitLabel: '',
        }),
        // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
        // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
        returnsWarranty: Promise.resolve({
            title: '',
            description: '',
            returnsPolicy: { heading: '', intro: '', conditions: [], howToReturn: [] },
            warranty: { heading: '', intro: '', whatsCovered: [], whatsNotCovered: [], claimsProcess: '' },
            exchanges: { heading: '', intro: '', process: '' },
        }),
        pdpCollapsibles: Promise.resolve([]),
        // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
    };

    function renderProductPage(
        ProductPage: React.ComponentType<{ loaderData: ProductPageData }>,
        loaderData: ProductPageData
    ) {
        return render(<ProductPage loaderData={loaderData} />);
    }

    describe('shouldRevalidate export', () => {
        // The policy itself (navigation axis + action-axis denylist) is covered by
        // src/lib/revalidation/routes/product.test.ts. Here we only assert the route wires up that
        // exact function, so the behavior isn't re-tested at the route.
        test('re-exports the shared product revalidation policy', async () => {
            const { shouldRevalidate: shouldRevalidateRoute } = await import('./_app.p.$');
            const { shouldRevalidate: shouldRevalidateProduct } = await import('@/lib/revalidation/routes/product');
            expect(shouldRevalidateRoute).toBe(shouldRevalidateProduct);
        });
    });

    describe('product impression recovery', () => {
        const impressionData = (): ProductPageData => ({
            product: mockProduct,
            page: mockPage,
            pageKey: mockProduct.id,
            pageUrl: '/p/test-product-123',
            productSchema: Promise.resolve(null),
            ...mockExtensionLoaderData,
        });

        test('recovers a consent-skipped current product once after acceptance', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            const data = impressionData();
            tracking.consentKey = 'unknown';
            tracking.trackViewProduct.mockResolvedValueOnce(false);
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);

            tracking.consentKey = 'accepted';
            view.rerender(<ProductPage loaderData={data} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);
            view.rerender(<ProductPage loaderData={{ ...data, product: { ...mockProduct } }} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);
        });

        test.each([
            'consent',
            'product',
            'location',
            'navigation',
            'unmount',
        ])('aborts pending tracking on %s change', async (change) => {
            const { default: ProductPage } = await import('./_app.p.$');
            let resolve!: (value: boolean) => void;
            tracking.trackViewProduct.mockImplementationOnce(
                () =>
                    new Promise<boolean>((done) => {
                        resolve = done;
                    })
            );
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            const signal = tracking.trackViewProduct.mock.calls[0][1];
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal?.aborted).toBe(false);
            if (change === 'consent') tracking.consentKey = 'declined';
            if (change === 'location') tracking.location = { ...tracking.location, search: '?color=blue', key: 'next' };
            if (change === 'navigation') tracking.navigationState = 'loading';
            if (change === 'unmount') view.unmount();
            else
                view.rerender(
                    <ProductPage
                        loaderData={
                            change === 'product' ? { ...data, product: { ...mockProduct, id: 'variant-456' } } : data
                        }
                    />
                );
            expect(signal?.aborted).toBe(true);
            await act(() => {
                resolve(true);
                return Promise.resolve();
            });
            if (change === 'navigation' || change === 'unmount') {
                expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);
            }
        });

        test('deduplicates Strict Mode and irrelevant rerenders before and after handoff', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            let resolve!: (value: boolean) => void;
            tracking.trackViewProduct.mockImplementationOnce(
                () =>
                    new Promise<boolean>((done) => {
                        resolve = done;
                    })
            );
            const data = impressionData();
            const view = render(
                <StrictMode>
                    <ProductPage loaderData={data} />
                </StrictMode>
            );
            await act(async () => {});
            view.rerender(
                <StrictMode>
                    <ProductPage loaderData={{ ...data, product: { ...mockProduct } }} />
                </StrictMode>
            );
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);
            expect(tracking.trackViewProduct.mock.calls[0][1]?.aborted).toBe(false);
            await act(() => {
                resolve(true);
                return Promise.resolve();
            });
            tracking.consentKey = 'declined';
            view.rerender(
                <StrictMode>
                    <ProductPage loaderData={data} />
                </StrictMode>
            );
            tracking.consentKey = 'accepted';
            tracking.location = { ...tracking.location, search: '?color=blue', hash: '#details', key: 'next' };
            view.rerender(
                <StrictMode>
                    <ProductPage loaderData={data} />
                </StrictMode>
            );
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);
        });

        test.each([
            'pathname',
            'site',
            'locale',
            'product',
        ])('tracks a new %s impression even when the route stays mounted', async (change) => {
            const { default: ProductPage } = await import('./_app.p.$');
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            if (change === 'pathname')
                tracking.location = { ...tracking.location, pathname: '/p/another-slug/test-product-123' };
            if (change === 'site') tracking.siteId = 'another-site';
            if (change === 'locale') tracking.localeId = 'fr-FR';
            const current = change === 'product' ? { ...data, product: { ...mockProduct, id: 'variant-456' } } : data;
            view.rerender(<ProductPage loaderData={current} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);
            expect(tracking.trackViewProduct.mock.calls[1][0]).toEqual({ product: current.product });
        });

        test('ignores a stale completion and recovers only the current product after consent', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            let resolve!: (value: boolean) => void;
            tracking.trackViewProduct.mockImplementationOnce(
                () =>
                    new Promise<boolean>((done) => {
                        resolve = done;
                    })
            );
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            tracking.consentKey = 'unknown';
            tracking.trackViewProduct.mockResolvedValueOnce(false);
            const current = { ...data, product: { ...mockProduct, id: 'variant-456' } };
            view.rerender(<ProductPage loaderData={current} />);
            await act(() => {
                resolve(true);
                return Promise.resolve();
            });
            tracking.consentKey = 'accepted';
            view.rerender(<ProductPage loaderData={current} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(3);
            expect(tracking.trackViewProduct.mock.calls[2][0]).toEqual({ product: current.product });
        });

        test('does not retry skipped work on irrelevant rerenders, but retries when navigation settles', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            tracking.trackViewProduct.mockResolvedValueOnce(false);
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            view.rerender(<ProductPage loaderData={{ ...data, product: { ...mockProduct } }} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);
            tracking.navigationState = 'loading';
            view.rerender(<ProductPage loaderData={data} />);
            tracking.navigationState = 'idle';
            view.rerender(<ProductPage loaderData={data} />);
            await act(async () => {});
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);
        });

        test('retains a true handoff completed after consent withdrawal without duplicating on acceptance', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            let resolve!: (value: boolean) => void;
            tracking.trackViewProduct.mockImplementationOnce(
                () =>
                    new Promise<boolean>((done) => {
                        resolve = done;
                    })
            );
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(() => Promise.resolve());
            const signal = tracking.trackViewProduct.mock.calls[0][1];

            tracking.consentKey = 'declined';
            tracking.trackViewProduct.mockResolvedValueOnce(false);
            view.rerender(<ProductPage loaderData={data} />);
            expect(signal?.aborted).toBe(true);
            await act(() => {
                resolve(true);
                return Promise.resolve();
            });
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);

            tracking.consentKey = 'accepted';
            view.rerender(<ProductPage loaderData={data} />);
            await act(() => Promise.resolve());
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(2);
        });

        test('keeps tracking failures from breaking the route or causing automatic retries', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            tracking.trackViewProduct.mockRejectedValueOnce(new Error('Tracking failed'));
            const data = impressionData();
            const view = render(<ProductPage loaderData={data} />);
            await act(async () => {});
            view.rerender(<ProductPage loaderData={{ ...data, product: { ...mockProduct } }} />);
            await act(async () => {});
            expect(screen.getByTestId('product-view')).toBeInTheDocument();
            expect(tracking.trackViewProduct).toHaveBeenCalledTimes(1);
        });
    });

    describe('ProductDetailView component', () => {
        test('should have correct product utility functions available', () => {
            // Test that the utility functions are properly imported and available
            expect(typeof isProductSet).toBe('function');
            expect(typeof isProductBundle).toBe('function');
        });

        test('should handle product utility function calls correctly', () => {
            // Test that utility functions can be called with product data
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const result1 = isProductSet(mockProduct);
            const result2 = isProductBundle(mockProduct);

            expect(result1).toBe(false);
            expect(result2).toBe(false);
            expect(isProductSet).toHaveBeenCalledWith(mockProduct);
            expect(isProductBundle).toHaveBeenCalledWith(mockProduct);
        });

        test('should handle product set detection', () => {
            vi.mocked(isProductSet).mockReturnValue(true);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const result = isProductSet(mockProduct);
            expect(result).toBe(true);
        });

        test('should handle product bundle detection', () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(true);

            const result = isProductBundle(mockProduct);
            expect(result).toBe(true);
        });

        test('should handle product without shortDescription', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const productWithoutDescription = {
                ...mockProduct,
                shortDescription: undefined,
            };

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: productWithoutDescription,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView
            renderProductPage(ProductPage, mockLoaderData);

            // Component should handle missing shortDescription
            expect(productWithoutDescription.shortDescription).toBeUndefined();
        });

        test('should handle product with shortDescription', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const productWithDescription = {
                ...mockProduct,
                shortDescription: 'Test description',
            };

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: productWithDescription,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView
            renderProductPage(ProductPage, mockLoaderData);

            // Component should handle shortDescription
            expect(productWithDescription.shortDescription).toBe('Test description');
        });

        test('should render ProductDetailView with product set', async () => {
            vi.mocked(isProductSet).mockReturnValue(true);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView with product set
            renderProductPage(ProductPage, mockLoaderData);
        });

        test('should render ProductDetailView with product bundle', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(true);

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView with product bundle
            renderProductPage(ProductPage, mockLoaderData);
        });
    });

    describe('ProductRecommendationsSection component', () => {
        test('should include ProductRecommendations component integration', async () => {
            // This test verifies that the ProductRecommendations component is properly integrated
            // The actual rendering with Suspense and async data is handled by React and tested in integration tests
            const { default: ProductPage } = await import('./_app.p.$');

            // Verify the page component can be imported and has the correct structure
            expect(ProductPage).toBeDefined();
            expect(typeof ProductPage).toBe('function');
        });
    });

    describe('ProductPage component', () => {
        test('should handle pageKey correctly', () => {
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Test that pageKey is correctly passed through
            expect(mockLoaderData.pageKey).toBe('test-product-123');
        });

        test('should have proper loader data structure', () => {
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Test that all required properties are present
            expect(mockLoaderData).toHaveProperty('product');
            expect(mockLoaderData).toHaveProperty('page');
            expect(mockLoaderData).toHaveProperty('pageKey');
            expect(mockLoaderData).toHaveProperty('productSchema');
        });

        test('renders ProductContent directly with resolved product (no Suspense around product)', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            const { queryByTestId, getByTestId } = renderProductPage(ProductPage, mockLoaderData);

            // ProductContent renders synchronously — the route no longer mounts a
            // Suspense boundary around the product
            expect(getByTestId('product-view')).toBeInTheDocument();
            expect(queryByTestId('product-skeleton')).not.toBeInTheDocument();
        });

        // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
        test('passes the product ID to the delivery provider', async () => {
            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            renderProductPage(ProductPage, mockLoaderData);

            expect(screen.getByTestId('shipping-delivery-provider')).toHaveAttribute(
                'data-product-id',
                'test-product-123'
            );
        });
        // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

        test('renders product JSON-LD after main page content', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: '/product/test-product-123',
                productSchema: Promise.resolve({
                    '@context': 'https://schema.org',
                    '@type': 'Product',
                    name: 'Test Product',
                }),
                ...mockExtensionLoaderData,
            };

            renderProductPage(ProductPage, mockLoaderData);

            await waitFor(() => {
                expect(screen.getByTestId('product-view')).toBeInTheDocument();
                expect(screen.getByTestId('product-schema')).toBeInTheDocument();
            });

            const pageContent = screen.getByTestId('product-view');
            const productSchema = screen.getByTestId('product-schema');
            expect(Boolean(pageContent.compareDocumentPosition(productSchema) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
                true
            );
        });

        test('renders breadcrumbs from the product primary_category expansion', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.p.$');
            const mockLoaderData: ProductPageData = {
                product: {
                    ...mockProduct,
                    primaryCategory: { id: 'test-category-123', name: 'Test Category' },
                },
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            const { getByTestId } = render(<ProductPage loaderData={mockLoaderData} />);
            expect(getByTestId('category-breadcrumbs')).toHaveTextContent('Test Category');
        });
    });
});

describe('Product Detail Route loader', () => {
    const mockContext = createTestContext({ locale: 'en-US' });
    const noSeoContext = createTestContext({
        locale: 'en-US',
        appConfig: {
            url: {
                ...config.app.url,
                seoRoutes: undefined,
            },
        },
    });
    const seoContext = createTestContext({
        locale: 'en-US',
        appConfig: {
            url: {
                ...config.app.url,
                seoRoutes: {
                    [config.app.defaultSiteId]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        },
    });
    const mockProduct = {
        id: 'test-product-123',
        name: 'Test Product',
    } as ShopperProducts.schemas['Product'];

    const createLoaderArgs = (url: string, context = mockContext): Route.LoaderArgs => ({
        request: new Request(url),
        url: new URL(url),
        context,
        params: { siteId: 'test-site', localeId: 'en-US', '*': 'test-product-123' },
        pattern: '/p/*',
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(resolveProductRoute).mockReturnValue({ productId: 'test-product-123' });
        mockAttemptRouteSeoFallback.mockResolvedValue(undefined);
        vi.mocked(fetchProductById).mockResolvedValue(mockProduct);
        vi.mocked(resolveSwatchProductImages).mockResolvedValue(undefined);
        vi.mocked(fetchPageWithComponentData).mockResolvedValue({} as never);
        vi.mocked(generateProductSchema).mockReturnValue({
            '@context': 'https://schema.org',
            '@type': 'Product',
        } as never);
        vi.mocked(getReviewsSummary).mockResolvedValue({} as never);
        vi.mocked(getReviews).mockResolvedValue({} as never);
        vi.mocked(getWriteReviewForm).mockResolvedValue({} as never);
        vi.mocked(getBuyNowPayLaterMessage).mockResolvedValue({} as never);
        vi.mocked(getBuyNowPayLaterLearnMore).mockResolvedValue({} as never);
        vi.mocked(getReturnsAndWarranty).mockResolvedValue({} as never);
    });

    test('preserves the compatible product request when SEO routes are disabled', async () => {
        await loader(createLoaderArgs('https://example.com/global/en-US/p/test-product-123', noSeoContext));

        const options = vi.mocked(fetchProductById).mock.calls[0]?.[2];
        expect(options?.expand).not.toContain('slug');
    });

    test('requests the product slug when SEO routes are enabled', async () => {
        await loader(createLoaderArgs('https://example.com/global/en-US/p/test-product-123', seoContext));

        const options = vi.mocked(fetchProductById).mock.calls[0]?.[2];
        expect(options?.expand).toContain('slug');
    });

    test('301-redirects a stale product slug using the existing product response', async () => {
        vi.mocked(fetchProductById).mockResolvedValue({ ...mockProduct, slug: 'current café' });

        const response = await loader(
            createLoaderArgs('https://example.com/global/en-US/p/old-slug/test-product-123?color=blue', seoContext)
        ).then(
            () => undefined,
            (error: unknown) => error as Response
        );

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe(
            '/global/en-US/p/current%20caf%C3%A9/test-product-123?color=blue'
        );
        expect(fetchProductById).toHaveBeenCalledOnce();
        expect(mockAttemptRouteSeoFallback).not.toHaveBeenCalled();
    });

    test('does not combine a selected variant slug with the master route ID', async () => {
        const variant = { ...mockProduct, id: 'variant-456', slug: 'variant-slug' };
        vi.mocked(fetchProductById).mockResolvedValue(variant);

        const result = await loader(
            createLoaderArgs(
                'https://example.com/global/en-US/p/master-slug/test-product-123?pid=variant-456',
                seoContext
            )
        );

        expect(result.product).toBe(variant);
        expect(fetchProductById).toHaveBeenCalledWith(seoContext, 'variant-456', expect.any(Object));
        expect(mockAttemptRouteSeoFallback).not.toHaveBeenCalled();
    });

    test('redirects to the slug-less canonical when SCAPI omits the product slug', async () => {
        vi.mocked(fetchProductById).mockResolvedValue({ ...mockProduct, slug: undefined });

        const response = await loader(
            createLoaderArgs('https://example.com/global/en-US/p/old-slug/test-product-123', seoContext)
        ).then(
            () => undefined,
            (error: unknown) => error as Response
        );

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/global/en-US/p/test-product-123');
        expect(fetchProductById).toHaveBeenCalledOnce();
        expect(mockAttemptRouteSeoFallback).not.toHaveBeenCalled();
    });

    test('converges the schema URL onto the canonical page URL, dropping the request origin and tracking params', async () => {
        // The request arrives on example.com carrying a tracking param; structured data must point
        // at the public app origin with the tracking param stripped, matching the canonical <link>
        // and og:url rather than echoing the raw request URL.
        await loader(
            createLoaderArgs('https://example.com/global/en-US/p/test-product-123?utm_source=news&sort=price')
        );

        expect(generateProductSchema).toHaveBeenCalledWith(
            mockProduct,
            'http://localhost:3000/global/en-US/p/test-product-123?sort=price'
        );
    });

    test('does not look up a product when the matched alias belongs to another site', async () => {
        vi.mocked(resolveProductRoute).mockReturnValue(null);
        const redirect = new Response(null, { status: 302, headers: { Location: '/current-product' } });
        mockAttemptRouteSeoFallback.mockResolvedValueOnce(redirect);

        const result = await loader(createLoaderArgs('https://example.com/p/test-product-123'));

        expect(result).toBe(redirect);
        expect(fetchProductById).not.toHaveBeenCalled();
    });

    test('301-redirects a trailing-slash product path to the canonical path, preserving the query', async () => {
        try {
            await loader(createLoaderArgs('https://example.com/p/test-product-123/?sort=price'));
            expect.fail('Expected loader to throw a redirect');
        } catch (error: any) {
            expect(error).toBeInstanceOf(Response);
            expect(error.status).toBe(301);
            expect(error.headers.get('Location')).toBe('/p/test-product-123?sort=price');
        }
    });
});
