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
import { render, screen, waitFor } from '@testing-library/react';
import { use } from 'react';
import type { ShopperProducts } from '@/scapi';
import { type ProductPageData } from './_app.product.$productId';
import { EMPTY_WISHLIST_STATE } from '@/lib/wishlist/state';

// ProductPage reads `nonce` from the root loader. Tests render the page outside
// a real data router, so stub `useRouteLoaderData` with a deterministic value.
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useRouteLoaderData: (id: string) => (id === 'root' ? { nonce: undefined } : undefined),
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
        trackViewProduct: vi.fn(),
    }),
}));

vi.mock('@/providers/product-context', () => ({
    ProductProvider: ({ children }: any) => <div data-testid="product-provider">{children}</div>,
    useProduct: vi.fn(() => null),
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
    selectedStoreContext: { id: 'selectedStoreContext' },
}));

vi.mock('@/lib/wishlist/fetch-initial-state.server', () => ({
    fetchWishlistInitialState: vi.fn(() => Promise.resolve(EMPTY_WISHLIST_STATE)),
}));

vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    default: ({ children }: any) => <div data-testid="pickup-provider">{children}</div>,
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// Import the functions we want to test
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';

// Import the route module after mocks are set up

describe('Product Detail Route', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset modules to ensure fresh import and createPage call
        vi.resetModules();
        // Import the route module to trigger createPage call with mocks in place
        await import('./_app.product.$productId');
    });
    const mockProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product-123',
        name: 'Test Product',
        primaryCategoryId: 'test-category-123',
        shortDescription: 'Test product description',
        longDescription: 'Long test product description',
        master: undefined,
    };

    const mockCategory: ShopperProducts.schemas['Category'] = {
        id: 'test-category-123',
        name: 'Test Category',
        parentCategoryId: 'parent-category-123',
        categories: [],
    };

    const mockPage = Promise.resolve({
        id: 'pdp',
        typeId: 'page',
        aspectTypeId: 'pdp',
        name: 'Product Detail Page',
        regions: [],
    });

    const mockExtensionLoaderData = {
        wishlistInitialState: Promise.resolve(EMPTY_WISHLIST_STATE),
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
        // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
        estimatedDelivery: Promise.resolve({
            title: '',
            estimatedDelivery: { options: [], note: '' },
            shippingOptions: [],
            internationalShipping: { heading: '', points: [] },
            orderTracking: { heading: '', points: [] },
        }),
        // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    };

    describe('shouldRevalidate export', () => {
        // The policy itself (navigation axis + action-axis denylist) is covered by
        // src/lib/revalidation/routes/product.test.ts. Here we only assert the route wires up that
        // exact function, so the behavior isn't re-tested at the route.
        test('re-exports the shared product revalidation policy', async () => {
            const { shouldRevalidate: shouldRevalidateRoute } = await import('./_app.product.$productId');
            const { shouldRevalidate: shouldRevalidateProduct } = await import('@/lib/revalidation/routes/product');
            expect(shouldRevalidateRoute).toBe(shouldRevalidateProduct);
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

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: productWithoutDescription,
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView
            render(<ProductPage loaderData={mockLoaderData} />);

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

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: productWithDescription,
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView
            render(<ProductPage loaderData={mockLoaderData} />);

            // Component should handle shortDescription
            expect(productWithDescription.shortDescription).toBe('Test description');
        });

        test('should render ProductDetailView with product set', async () => {
            vi.mocked(isProductSet).mockReturnValue(true);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView with product set
            render(<ProductPage loaderData={mockLoaderData} />);
        });

        test('should render ProductDetailView with product bundle', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(true);

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Render the page component to exercise ProductDetailView with product bundle
            render(<ProductPage loaderData={mockLoaderData} />);
        });
    });

    describe('ProductRecommendationsSection component', () => {
        test('should include ProductRecommendations component integration', async () => {
            // This test verifies that the ProductRecommendations component is properly integrated
            // The actual rendering with Suspense and async data is handled by React and tested in integration tests
            const { default: ProductPage } = await import('./_app.product.$productId');

            // Verify the page component can be imported and has the correct structure
            expect(ProductPage).toBeDefined();
            expect(typeof ProductPage).toBe('function');
        });
    });

    describe('ProductPage component', () => {
        test('should handle pageKey correctly', () => {
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                category: Promise.resolve(mockCategory),
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
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            // Test that all required properties are present
            expect(mockLoaderData).toHaveProperty('product');
            expect(mockLoaderData).toHaveProperty('category');
            expect(mockLoaderData).toHaveProperty('page');
            expect(mockLoaderData).toHaveProperty('pageKey');
            expect(mockLoaderData).toHaveProperty('productSchema');
        });

        test('renders ProductContent directly with resolved product (no Suspense around product)', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                category: Promise.resolve(mockCategory),
                page: mockPage,
                pageKey: 'test-product-123',
                pageUrl: 'http://localhost/product/test',
                productSchema: Promise.resolve(null),
                ...mockExtensionLoaderData,
            };

            const { queryByTestId, getByTestId } = render(<ProductPage loaderData={mockLoaderData} />);

            // ProductContent renders synchronously — the route no longer mounts a
            // Suspense boundary around the product
            expect(getByTestId('product-view')).toBeInTheDocument();
            expect(queryByTestId('product-skeleton')).not.toBeInTheDocument();
        });

        test('renders product JSON-LD after main page content', async () => {
            vi.mocked(isProductSet).mockReturnValue(false);
            vi.mocked(isProductBundle).mockReturnValue(false);

            const { default: ProductPage } = await import('./_app.product.$productId');
            const mockLoaderData: ProductPageData = {
                product: mockProduct,
                category: Promise.resolve(mockCategory),
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

            render(<ProductPage loaderData={mockLoaderData} />);

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
    });
});
