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

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { mockAltSiteObject } from '@/test-utils/config';
import ProductRecommendations, { type RecommenderConfig } from './index';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';

// Mock data
const mockRecommendations = {
    recoUUID: '8e22270e-6774-467f-90c3-1234567890',
    recommenderName: 'pdp-similar-items',
    displayMessage: 'You May Also Like',
    recs: [
        {
            id: 'test-product-1',
            productId: 'test-product-1',
            productName: 'Test Product 1',
            price: 29.99,
            currency: mockAltSiteObject.defaultCurrency,
        },
        {
            id: 'test-product-2',
            productId: 'test-product-2',
            productName: 'Test Product 2',
            price: 39.99,
            currency: mockAltSiteObject.defaultCurrency,
        },
    ],
};

const mockRecommender: RecommenderConfig = {
    name: 'pdp-similar-items',
    title: 'You May Also Like',
    type: 'recommender',
};

const mockZoneRecommender: RecommenderConfig = {
    name: 'pdp-zone',
    title: 'Featured Products',
    type: 'zone',
};

vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: { id: mockAltSiteObject.id, defaultLocale: mockAltSiteObject.defaultLocale },
            language: mockAltSiteObject.defaultLocale,
            currency: mockAltSiteObject.defaultCurrency,
        })),
    };
});

// Mock useRecommenders hook
const mockGetRecommendations = vi.fn();
const mockGetZoneRecommendations = vi.fn();
let mockUseRecommenders: ReturnType<typeof vi.fn>;

vi.mock('@/hooks/recommenders/use-recommenders', () => ({
    useRecommenders: vi.fn(() => ({
        isLoading: false,
        isEnabled: true,
        recommendations: mockRecommendations,
        error: null,
        getRecommenders: vi.fn(),
        getRecommendations: mockGetRecommendations,
        getZoneRecommendations: mockGetZoneRecommendations,
    })),
}));

// Mock ProductCarousel — wires handleProductClick onto each tile so click tracking is testable.
vi.mock('@/components/product-carousel/carousel', () => ({
    default: ({
        products,
        title,
        className,
        handleProductClick,
    }: {
        products: any[];
        title?: string;
        className?: string;
        handleProductClick?: (product: any) => void;
    }) => (
        <div data-testid="product-carousel" className={className}>
            <h3>{title}</h3>
            <div data-testid="product-count">{products.length} products</div>
            {products.map((product: any) => (
                <div
                    key={product.productId}
                    data-testid={`product-${product.productId}`}
                    onClick={() => handleProductClick?.(product)}>
                    {product.productName}
                </div>
            ))}
        </div>
    ),
}));

// Mock analytics so we can assert the recommender impression + click calls.
const mockTrackViewRecommender = vi.fn();
const mockTrackClickProductInRecommender = vi.fn();
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: vi.fn(() => ({
        trackViewRecommender: mockTrackViewRecommender,
        trackClickProductInRecommender: mockTrackClickProductInRecommender,
    })),
}));

// Mock the intersection observer — default on-screen so impressions fire; tests override.
const mockUseIntersectionObserver = vi.fn((..._args: any[]) => true);
vi.mock('@/hooks/use-intersection-observer', () => ({
    useIntersectionObserver: (...args: any[]) => mockUseIntersectionObserver(...args),
}));

// Mock ProductRecommendationSkeleton
vi.mock('@/components/product/skeletons', () => ({
    ProductRecommendationSkeleton: ({ title }: { title?: string }) => (
        <div data-testid="product-recommendation-skeleton">
            {title && <div>{title}</div>}
            <div>Loading...</div>
        </div>
    ),
}));

const renderComponent = (component: React.ReactElement) => {
    return render(component);
};

describe('ProductRecommendations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseIntersectionObserver.mockReturnValue(true);
    });

    describe('Analytics (FU1)', () => {
        test('fires trackViewRecommender once when on-screen with resolved recs', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: mockRecommendations,
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                expect(mockTrackViewRecommender).toHaveBeenCalledTimes(1);
            });
            expect(mockTrackViewRecommender).toHaveBeenCalledWith({
                recommenderId: mockRecommendations.recoUUID,
                recommenderName: mockRecommendations.recommenderName,
                products: mockRecommendations.recs,
            });
        });

        test('does not fire trackViewRecommender when off-screen', async () => {
            mockUseIntersectionObserver.mockReturnValue(false);
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: mockRecommendations,
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                expect(screen.getByTestId('product-carousel')).toBeInTheDocument();
            });
            expect(mockTrackViewRecommender).not.toHaveBeenCalled();
        });

        test('fires trackClickProductInRecommender with the clicked product on tile click', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: mockRecommendations,
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            const tile = await screen.findByTestId('product-test-product-1');
            fireEvent.click(tile);

            expect(mockTrackClickProductInRecommender).toHaveBeenCalledWith({
                recommenderId: mockRecommendations.recoUUID,
                recommenderName: mockRecommendations.recommenderName,
                product: mockRecommendations.recs[0],
            });
        });
    });

    describe('Basic Rendering', () => {
        test('renders product carousel with recommendations', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: mockRecommendations,
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                const carousel = screen.getByTestId('product-carousel');
                expect(carousel).toBeInTheDocument();
                expect(screen.getByText('You May Also Like')).toBeInTheDocument();
                expect(screen.getByTestId('product-count')).toHaveTextContent('2 products');
            });
        });

        test('renders product tiles from recommendations', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: mockRecommendations,
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                expect(screen.getByTestId('product-test-product-1')).toBeInTheDocument();
                expect(screen.getByTestId('product-test-product-2')).toBeInTheDocument();
            });
        });
    });

    describe('Loading States', () => {
        test('shows loading skeleton when isLoading is true', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: true,
                recommendations: {},
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            const skeleton = screen.getByTestId('product-recommendation-skeleton');
            expect(skeleton).toBeInTheDocument();
            expect(screen.getByText('You May Also Like')).toBeInTheDocument();
        });

        test('does not render when recommendations are empty', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: { recs: [] },
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            const { container } = renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            expect(container.firstChild).toBeNull();
        });
    });

    describe('Hook Integration', () => {
        test('calls getRecommendations for recommender type', () => {
            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            expect(mockGetRecommendations).toHaveBeenCalledWith('pdp-similar-items', undefined, undefined);
        });

        test('calls getZoneRecommendations for zone type', () => {
            renderComponent(<ProductRecommendations recommender={mockZoneRecommender} />);

            expect(mockGetZoneRecommendations).toHaveBeenCalledWith('pdp-zone', undefined, undefined);
        });

        test('passes products to getRecommendations', () => {
            const mockProducts = [{ id: 'product-1', productId: 'product-1' }];
            renderComponent(<ProductRecommendations recommender={mockRecommender} products={mockProducts} />);

            expect(mockGetRecommendations).toHaveBeenCalledWith('pdp-similar-items', mockProducts, undefined);
        });

        test('passes args to getRecommendations', () => {
            const mockArgs = { limit: 5 };
            renderComponent(<ProductRecommendations recommender={mockRecommender} args={mockArgs} />);

            expect(mockGetRecommendations).toHaveBeenCalledWith('pdp-similar-items', undefined, mockArgs);
        });
    });

    describe('Error Handling', () => {
        test('does not render when error is present', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: {},
                error: new Error('Failed to fetch'),
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            const { container } = renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            expect(container.firstChild).toBeNull();
        });

        test('does not render when recommender is null', () => {
            const { container } = renderComponent(<ProductRecommendations recommender={null as any} />);

            expect(container.firstChild).toBeNull();
        });
    });

    describe('Dispatcher (data prop)', () => {
        test('renders carousel from resolved data promise without calling useRecommenders', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            const dataPromise: Promise<Recommendation> = Promise.resolve(mockRecommendations);

            renderComponent(<ProductRecommendations recommender={mockRecommender} data={dataPromise} />);

            await waitFor(() => {
                expect(screen.getByTestId('product-carousel')).toBeInTheDocument();
                expect(screen.getByText('You May Also Like')).toBeInTheDocument();
                expect(screen.getByTestId('product-count')).toHaveTextContent('2 products');
            });

            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });

        test('uses provided fallback while data promise is pending', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            // Never-resolving promise so the Suspense boundary stays in the fallback state
            const dataPromise: Promise<Recommendation> = new Promise(() => {});

            renderComponent(
                <ProductRecommendations
                    recommender={mockRecommender}
                    data={dataPromise}
                    fallback={<div data-testid="custom-fallback">loading…</div>}
                />
            );

            expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });

        test('renders nothing when data promise resolves with no recs', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            const dataPromise: Promise<Recommendation> = Promise.resolve({ recs: [] });

            const { container } = renderComponent(
                <ProductRecommendations recommender={mockRecommender} data={dataPromise} />
            );

            await waitFor(() => {
                expect(container.querySelector('[data-testid="product-carousel"]')).toBeNull();
            });
            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });

        test('renders carousel from `data` alone, using server `displayMessage` as title (no recommender prop)', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            // Server-provided `displayMessage` is enough — the static `recommender` config is not
            // required when `data` carries the title source.
            const dataPromise: Promise<Recommendation> = Promise.resolve({
                ...mockRecommendations,
                displayMessage: 'Server-Driven Title',
            });

            renderComponent(<ProductRecommendations data={dataPromise} />);

            await waitFor(() => {
                expect(screen.getByTestId('product-carousel')).toBeInTheDocument();
                expect(screen.getByText('Server-Driven Title')).toBeInTheDocument();
                expect(screen.getByTestId('product-count')).toHaveTextContent('2 products');
            });

            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });

        test('renders carousel with `recommenderTitle` alone (no `recommenderName`) when `data` is provided', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            // Server response without `displayMessage` — the static `recommenderTitle` prop must
            // fill in. This is the cart route's shape: it pins recs by name on the loader side and
            // passes only the translated title string to the component.
            const dataPromise: Promise<Recommendation> = Promise.resolve({
                ...mockRecommendations,
                displayMessage: undefined,
            });

            renderComponent(<ProductRecommendations recommenderTitle="You might also like" data={dataPromise} />);

            await waitFor(() => {
                expect(screen.getByTestId('product-carousel')).toBeInTheDocument();
                expect(screen.getByText('You might also like')).toBeInTheDocument();
            });

            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });

        test('renders nothing when neither `recommender` nor `displayMessage` provides a title', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockClear();

            // Fail-closed: without either source for a title we don't want a headless carousel.
            const dataPromise: Promise<Recommendation> = Promise.resolve({
                ...mockRecommendations,
                displayMessage: undefined,
            });

            const { container } = renderComponent(<ProductRecommendations data={dataPromise} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="product-carousel"]')).toBeNull();
            });
            expect(mockUseRecommenders).not.toHaveBeenCalled();
        });
    });

    describe('Data Transformation', () => {
        test('uses displayMessage as title if available', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: { ...mockRecommendations, displayMessage: 'Custom Display Message' },
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                expect(screen.getByText('Custom Display Message')).toBeInTheDocument();
            });
        });

        test('falls back to recommender title if no displayMessage', async () => {
            const { useRecommenders } = await import('@/hooks/recommenders/use-recommenders');
            mockUseRecommenders = useRecommenders as any;
            mockUseRecommenders.mockReturnValue({
                isLoading: false,
                recommendations: { ...mockRecommendations, displayMessage: undefined },
                error: null,
                getRecommendations: mockGetRecommendations,
                getZoneRecommendations: mockGetZoneRecommendations,
            });

            renderComponent(<ProductRecommendations recommender={mockRecommender} />);

            await waitFor(() => {
                expect(screen.getByText('You May Also Like')).toBeInTheDocument();
            });
        });
    });
});
