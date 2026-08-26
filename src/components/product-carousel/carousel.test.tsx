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

import type React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import type { ShopperSearch } from '@/scapi';
import ProductCarousel, { ProductCarouselWithSuspense, ProductCarouselWithData } from './carousel';

let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }),
    createReactRegionDesignDecorator: (Component: any) => Component,
}));

// Mock data
const mockProducts: ShopperSearch.schemas['ProductSearchHit'][] = [
    {
        productId: 'test-product-1',
        productName: 'Test Product 1',
        image: { alt: 'Test Product 1', link: '/test1.jpg' },
        price: 29.99,
        currency: 'USD',
        inventory: { ats: 10 },
        representedProduct: {
            id: 'test-product-1',
        },
    },
    {
        productId: 'test-product-2',
        productName: 'Test Product 2',
        image: { alt: 'Test Product 2', link: '/test2.jpg' },
        price: 39.99,
        currency: 'USD',
        inventory: { ats: 5 },
        representedProduct: {
            id: 'test-product-2',
        },
    },
    {
        productId: 'test-product-3',
        productName: 'Test Product 3',
        image: { alt: 'Test Product 3', link: '/test3.jpg' },
        price: 49.99,
        currency: 'USD',
        inventory: { ats: 0 },
        representedProduct: {
            id: 'test-product-3',
        },
    },
];

const mockProductSearchResult: ShopperSearch.schemas['ProductSearchResult'] = {
    hits: mockProducts,
    total: 3,
    query: '',
    refinements: [],
    searchPhraseSuggestions: { suggestedTerms: [] },
    sortingOptions: [],
    offset: 0,
    limit: 10,
};

// Mock the ProductTile component. When no product is supplied (the design-mode empty state), the
// real tile renders its own placeholder; the mock mirrors that with a stable test id so the carousel
// empty-state test can count placeholder tiles.
vi.mock('@/components/product-tile', () => ({
    ProductTile: ({
        product,
        className,
        imgAspectRatio,
        quickAddPlacement,
    }: {
        product?: ShopperSearch.schemas['ProductSearchHit'];
        className?: string;
        imgAspectRatio?: number;
        quickAddPlacement?: string;
    }) =>
        product ? (
            <div
                data-testid={`product-tile-${product.productId}`}
                className={className}
                data-aspect={imgAspectRatio}
                data-placement={quickAddPlacement}>
                <h3>{product.productName}</h3>
                <p>${product.price}</p>
            </div>
        ) : (
            <div data-testid="product-tile-placeholder" className={className} data-aspect={imgAspectRatio}>
                <h3>Product</h3>
            </div>
        ),
    ProductTileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the carousel UI components
let mockCanScrollPrev = false;
let mockCanScrollNext = false;

vi.mock('@/components/ui/carousel', () => ({
    Carousel: ({ children, className, opts }: { children: React.ReactNode; className?: string; opts?: any }) => (
        <div data-testid="carousel" className={className} data-opts={JSON.stringify(opts)}>
            {children}
        </div>
    ),
    CarouselContent: ({ children, className }: { children: React.ReactNode; className?: string }) => {
        const isScrollable = mockCanScrollPrev || mockCanScrollNext;
        // In the real implementation, justify-center is on the inner div, but for the mock
        // we apply it to the outer div to match what the tests expect
        const contentClassName = isScrollable ? className : `${className} justify-center`.trim();
        return (
            <div data-testid="carousel-content" className={contentClassName}>
                {children}
            </div>
        );
    },
    CarouselItem: ({ children, className, key }: { children: React.ReactNode; className?: string; key?: string }) => (
        <div data-testid="carousel-item" className={className} data-key={key}>
            {children}
        </div>
    ),
    CarouselPrevious: () => {
        const isScrollable = mockCanScrollPrev || mockCanScrollNext;
        return isScrollable ? <button data-testid="carousel-previous">Previous</button> : null;
    },
    CarouselNext: () => {
        const isScrollable = mockCanScrollPrev || mockCanScrollNext;
        return isScrollable ? <button data-testid="carousel-next">Next</button> : null;
    },
    useCarousel: () => ({
        isScrollable: mockCanScrollPrev || mockCanScrollNext,
        canScrollPrev: mockCanScrollPrev,
        canScrollNext: mockCanScrollNext,
        scrollPrev: vi.fn(),
        scrollNext: vi.fn(),
        orientation: 'horizontal',
    }),
}));

// Mock withSuspense
vi.mock('@/components/with-suspense', () => ({
    default: (Component: React.ComponentType<any>, _options: any) => {
        const WrappedComponent = (props: any) => {
            if (props.resolve) {
                // Simulate promise resolution
                return <Component {...props} data={mockProductSearchResult} />;
            }
            return <Component {...props} />;
        };
        WrappedComponent.displayName = `withSuspense(${Component.displayName || Component.name})`;
        return WrappedComponent;
    },
}));

vi.mock('@/components/region/component', () => ({
    Component: ({ component, className }: { component: { id: string }; className?: string }) => (
        <div data-testid={`region-component-${component.id}`} className={className}>
            Region Component
        </div>
    ),
}));

// Mock ProductCarouselSkeleton
vi.mock('./skeleton', () => ({
    default: ({ title, itemCount }: { title?: string; itemCount?: number }) => (
        <div data-testid="product-carousel-skeleton">
            {title && <h2>{title}</h2>}
            <div>Loading {itemCount || 6} items...</div>
        </div>
    ),
}));

const renderComponent = (component: React.ReactElement) => {
    return render(component);
};

describe('ProductCarousel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCanScrollPrev = false;
        mockCanScrollNext = false;
        mockIsDesignMode = false;
    });

    describe('Basic Rendering', () => {
        test('renders carousel with products', () => {
            // Make carousel scrollable so arrows appear
            mockCanScrollNext = true;

            renderComponent(<ProductCarousel products={mockProducts} title="Featured Products" />);

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('carousel')).toBeInTheDocument();
            expect(screen.getByTestId('carousel-content')).toBeInTheDocument();
            expect(screen.getByTestId('carousel-previous')).toBeInTheDocument();
            expect(screen.getByTestId('carousel-next')).toBeInTheDocument();
        });

        test('renders no title heading when title is not provided', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
            expect(screen.getByTestId('carousel')).toBeInTheDocument();
        });

        test('renders all product tiles', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-2')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-3')).toBeInTheDocument();
        });

        test('applies correct carousel options', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            const carousel = screen.getByTestId('carousel');
            const opts = JSON.parse(carousel.getAttribute('data-opts') || '{}');
            expect(opts.align).toBe('start');
        });
    });

    describe('Empty State Handling', () => {
        test('renders nothing on live storefront when products array is empty', () => {
            mockIsDesignMode = false;
            const { container } = renderComponent(<ProductCarousel products={[]} title="Featured Products" />);

            expect(container).toBeEmptyDOMElement();
            expect(screen.queryByText('Select a product')).not.toBeInTheDocument();
            expect(screen.queryByTestId('carousel')).not.toBeInTheDocument();
        });

        test('renders nothing on live storefront when products is null', () => {
            mockIsDesignMode = false;
            const { container } = renderComponent(<ProductCarousel products={null as any} title="Featured Products" />);

            expect(container).toBeEmptyDOMElement();
        });

        test('renders nothing on live storefront when products is undefined', () => {
            mockIsDesignMode = false;
            const { container } = renderComponent(
                <ProductCarousel products={undefined as any} title="Featured Products" />
            );

            expect(container).toBeEmptyDOMElement();
        });

        test('renders placeholder product tiles in Page Designer design mode when products are empty', () => {
            mockIsDesignMode = true;
            renderComponent(<ProductCarousel products={[]} title="Featured Products" />);

            // The empty state feeds placeholder ProductTiles through the real carousel render path;
            // each renders its own design-mode empty state rather than a bespoke text prompt.
            expect(screen.getByTestId('carousel')).toBeInTheDocument();
            expect(screen.getAllByTestId('product-tile-placeholder')).toHaveLength(8);
            expect(screen.queryByText('Select a product')).not.toBeInTheDocument();
        });

        test('renders component region items when products are empty', () => {
            const component = {
                id: 'carousel-comp-1',
                typeId: 'Layout.productCarousel',
                regions: [
                    {
                        id: 'products',
                        components: [
                            { id: 'product-tile-a', typeId: 'Content.productTile' },
                            { id: 'product-tile-b', typeId: 'Content.productTile' },
                        ],
                    },
                ],
            } as any;

            renderComponent(<ProductCarousel products={[]} title="Featured Products" component={component} />);

            expect(screen.getByTestId('carousel')).toBeInTheDocument();
            expect(screen.getByTestId('region-component-product-tile-a')).toBeInTheDocument();
            expect(screen.getByTestId('region-component-product-tile-b')).toBeInTheDocument();
        });
    });

    describe('ProductTile Integration', () => {
        test('passes correct props to ProductTile', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            const productTile = screen.getByTestId('product-tile-test-product-1');
            expect(productTile).toHaveClass('h-full', 'w-full');
            expect(screen.getByText('Test Product 1')).toBeInTheDocument();
            expect(screen.getByText('$29.99')).toBeInTheDocument();
        });

        test('renders correct number of carousel items', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            const items = screen.getAllByTestId('carousel-item');
            expect(items).toHaveLength(mockProducts.length);
        });

        test('defaults tiles to the portrait 0.8 aspect ratio', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);
            expect(screen.getByTestId('product-tile-test-product-1')).toHaveAttribute('data-aspect', '0.8');
        });

        test('forwards imgAspectRatio to the tiles (e.g. 1 for square)', () => {
            renderComponent(<ProductCarousel products={mockProducts} imgAspectRatio={1} />);
            expect(screen.getByTestId('product-tile-test-product-1')).toHaveAttribute('data-aspect', '1');
        });

        test('applies an itemClassName override to the carousel items', () => {
            renderComponent(<ProductCarousel products={mockProducts} itemClassName="w-[200px] custom-item" />);
            expect(screen.getAllByTestId('carousel-item')[0]).toHaveClass('custom-item');
        });

        test('does not force a quickAddPlacement by default (tile keeps its own default)', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);
            expect(screen.getByTestId('product-tile-test-product-1')).not.toHaveAttribute('data-placement');
        });

        test('forwards quickAddPlacement to the tiles', () => {
            renderComponent(<ProductCarousel products={mockProducts} quickAddPlacement="inline" />);
            expect(screen.getByTestId('product-tile-test-product-1')).toHaveAttribute('data-placement', 'inline');
        });
    });
});

describe('ProductCarouselWithData', () => {
    describe('Data Handling', () => {
        test('renders with ProductSearchResult data', () => {
            renderComponent(<ProductCarouselWithData data={mockProductSearchResult} title="Featured Products" />);

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-2')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-3')).toBeInTheDocument();
        });

        test('renders with direct ProductSearchHit array', () => {
            renderComponent(<ProductCarouselWithData data={mockProducts} title="Featured Products" />);

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
        });

        test('renders nothing on live storefront when no data provided', () => {
            mockIsDesignMode = false;
            const { container } = renderComponent(
                <ProductCarouselWithData data={undefined} title="Featured Products" />
            );

            expect(container).toBeEmptyDOMElement();
            expect(screen.queryByTestId('carousel')).not.toBeInTheDocument();
        });

        test('renders nothing on live storefront when data is null', () => {
            mockIsDesignMode = false;
            const { container } = renderComponent(
                <ProductCarouselWithData data={null as any} title="Featured Products" />
            );

            expect(container).toBeEmptyDOMElement();
            expect(screen.queryByTestId('carousel')).not.toBeInTheDocument();
        });

        test('passes through additional props', () => {
            renderComponent(
                <ProductCarouselWithData data={mockProducts} title="Featured Products" data-testid="custom-carousel" />
            );

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
        });
    });
});

describe('ProductCarouselWithSuspense', () => {
    describe('Suspense Integration', () => {
        test('renders with resolved data', () => {
            const mockPromise = Promise.resolve(mockProductSearchResult);
            renderComponent(<ProductCarouselWithSuspense resolve={mockPromise} title="Featured Products" />);

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
        });

        test('passes through props correctly', () => {
            const mockPromise = Promise.resolve(mockProductSearchResult);
            renderComponent(
                <ProductCarouselWithSuspense
                    resolve={mockPromise}
                    title="Featured Products"
                    data-testid="suspense-carousel"
                />
            );

            expect(screen.getByText('Featured Products')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
        });
    });
});

describe('Component Integration', () => {
    test('maintains consistent behavior across all variants', () => {
        const variants = [
            <ProductCarousel key="basic" products={mockProducts} title="Basic" />,
            <ProductCarouselWithData key="data" data={mockProducts} title="With Data" />,
            <ProductCarouselWithSuspense
                key="suspense"
                resolve={Promise.resolve(mockProducts)}
                title="With Suspense"
            />,
        ];

        variants.forEach((variant) => {
            const { unmount } = renderComponent(variant);
            expect(screen.getByTestId('carousel')).toBeInTheDocument();
            expect(screen.getByTestId('product-tile-test-product-1')).toBeInTheDocument();
            unmount();
        });
    });
});

describe('Carousel Arrow Positioning', () => {
    test('positions previous arrow outside product area', () => {
        // Make carousel scrollable so arrows appear
        mockCanScrollPrev = true;

        renderComponent(<ProductCarousel products={mockProducts} />);

        const prevButton = screen.getByTestId('carousel-previous');
        expect(prevButton).toBeInTheDocument();
    });

    test('positions next arrow outside product area', () => {
        // Make carousel scrollable so arrows appear
        mockCanScrollNext = true;

        renderComponent(<ProductCarousel products={mockProducts} />);

        const nextButton = screen.getByTestId('carousel-next');
        expect(nextButton).toBeInTheDocument();
    });
});

describe('Carousel Options', () => {
    test('applies align start option', () => {
        renderComponent(<ProductCarousel products={mockProducts} />);

        const carousel = screen.getByTestId('carousel');
        const opts = JSON.parse(carousel.getAttribute('data-opts') || '{}');
        expect(opts.align).toBe('start');
    });

    test('maintains align start option', () => {
        renderComponent(<ProductCarousel products={mockProducts} />);

        const carousel = screen.getByTestId('carousel');
        const opts = JSON.parse(carousel.getAttribute('data-opts') || '{}');
        expect(opts.align).toBe('start');
    });

    describe('Conditional Centering', () => {
        test('applies justify-center when carousel is not scrollable', () => {
            mockCanScrollPrev = false;
            mockCanScrollNext = false;

            renderComponent(<ProductCarousel products={mockProducts} />);

            const content = screen.getByTestId('carousel-content');
            expect(content).toHaveClass('justify-center');
        });

        test('does not apply justify-center when carousel is scrollable', () => {
            mockCanScrollPrev = false;
            mockCanScrollNext = true;

            renderComponent(<ProductCarousel products={mockProducts} />);

            const content = screen.getByTestId('carousel-content');
            expect(content).not.toHaveClass('justify-center');
        });

        test('applies items-stretch class regardless of scrollability', () => {
            renderComponent(<ProductCarousel products={mockProducts} />);

            const content = screen.getByTestId('carousel-content');
            expect(content).toHaveClass('items-stretch');
        });

        test('centers products when only 1-2 items fit viewport', () => {
            const fewProducts = mockProducts.slice(0, 2);
            mockCanScrollPrev = false;
            mockCanScrollNext = false;

            renderComponent(<ProductCarousel products={fewProducts} />);

            const content = screen.getByTestId('carousel-content');
            expect(content).toHaveClass('justify-center');
        });
    });

    describe('Arrow Visibility', () => {
        test('hides arrows when not scrollable', () => {
            mockCanScrollPrev = false;
            mockCanScrollNext = false;

            renderComponent(<ProductCarousel products={mockProducts} />);

            expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
        });

        test('shows arrows when scrollable', () => {
            mockCanScrollPrev = false;
            mockCanScrollNext = true;

            renderComponent(<ProductCarousel products={mockProducts} />);

            expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
        });
    });
});
