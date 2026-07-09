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
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { isServer } from '@/lib/utils';
import type { CarouselApi } from '@/components/ui/carousel';

// Preserve real utils (cn, etc.) but make isServer togglable so we can exercise the SSR
// preload branch inside <DynamicImage>. Defaults to false to match the client-render path
// the rest of the suite relies on.
vi.mock('@/lib/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/utils')>();
    return {
        ...actual,
        isServer: vi.fn().mockReturnValue(false),
    };
});

// Spy on React 19's preload() so we can assert only the first (LCP) slide emits <link rel="preload"> during SSR.
const preloadMock = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom')>();
    return {
        ...actual,
        preload: (...args: unknown[]) => preloadMock(...args),
    };
});

// Import the component after mocks are set up
import HeroCarousel, { type HeroSlide } from './index';

// Mock data constants
const mockSlides: HeroSlide[] = [
    {
        id: '1',
        title: 'First Slide',
        subtitle: 'First subtitle',
        imageUrl: '/image1.jpg',
        imageAlt: 'First image',
        ctaText: 'Learn More',
        ctaLink: '/learn-more',
    },
    {
        id: '2',
        title: 'Second Slide',
        subtitle: 'Second subtitle',
        imageUrl: '/image2.jpg',
        imageAlt: 'Second image',
        ctaText: 'Shop Now',
        ctaLink: '/shop',
    },
    {
        id: '3',
        title: 'Third Slide',
        imageUrl: '/image3.jpg',
        imageAlt: 'Third image',
    },
];

const mockCarouselApi = {
    scrollNext: vi.fn(),
    scrollPrev: vi.fn(),
    scrollTo: vi.fn(),
    canScrollNext: vi.fn(() => true),
    canScrollPrev: vi.fn(() => true),
    selectedScrollSnap: vi.fn(() => 0),
    on: vi.fn(),
    off: vi.fn(),
} as unknown as CarouselApi;

// Simplified mocks
vi.mock('@/components/ui/carousel', () => ({
    Carousel: ({ children, setApi }: { children: React.ReactNode; setApi: (api: CarouselApi) => void }) => {
        React.useEffect(() => {
            setApi(mockCarouselApi);
        }, [setApi]);
        return <div data-testid="carousel">{children}</div>;
    },
    CarouselContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="carousel-content">{children}</div>
    ),
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div data-testid="carousel-item">{children}</div>,
}));

vi.mock('lucide-react', () => ({
    ChevronLeft: () => <div data-testid="chevron-left" />,
    ChevronRight: () => <div data-testid="chevron-right" />,
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, asChild, className }: { children: React.ReactNode; asChild?: boolean; className?: string }) =>
        asChild ? children : <button className={className}>{children}</button>,
}));

// Router testing helper
const renderWithRouter = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <AllProvidersWrapper>{component}</AllProvidersWrapper>,
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
};

describe('HeroCarousel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (isServer as Mock).mockReturnValue(false);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
    });

    describe('Rendering', () => {
        test('renders carousel with slides and content', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            expect(screen.getByTestId('carousel')).toBeInTheDocument();
            expect(screen.getByText('First Slide')).toBeInTheDocument();
            expect(screen.getByText('First subtitle')).toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Shop Now' })).toHaveAttribute('href', '/global/en-GB/shop');

            // Check for Learn More links with specific hrefs
            const learnMoreLinks = screen.getAllByRole('link', { name: 'Learn More' });
            expect(learnMoreLinks).toHaveLength(2);
            expect(learnMoreLinks[0]).toHaveAttribute('href', '/global/en-GB/learn-more');
            expect(learnMoreLinks[1]).toHaveAttribute('href', '/');
        });

        test('renders empty state when no slides provided', () => {
            renderWithRouter(<HeroCarousel slides={[]} />);

            expect(screen.getByText('No slides available')).toBeInTheDocument();
        });

        test('handles slides without optional content', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            expect(screen.getByText('Third Slide')).toBeInTheDocument();
            expect(screen.queryByText('Third subtitle')).not.toBeInTheDocument();
        });
    });

    describe('Navigation', () => {
        test('renders navigation controls when multiple slides exist', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} showDots={true} showNavigation={true} />);

            expect(screen.getAllByRole('tab')).toHaveLength(3);
            expect(screen.getByLabelText(/previous slide/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/next slide/i)).toBeInTheDocument();
        });

        test('hides navigation controls when only one slide', () => {
            renderWithRouter(<HeroCarousel slides={[mockSlides[0]]} showDots={true} showNavigation={true} />);

            expect(screen.queryByRole('tab')).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/previous slide/i)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/next slide/i)).not.toBeInTheDocument();
        });

        test('handles dot navigation clicks', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            const dots = screen.getAllByRole('tab');
            fireEvent.click(dots[1]);

            expect(mockCarouselApi?.scrollTo).toHaveBeenCalledWith(1);
        });

        test('handles arrow navigation clicks', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            const prevButton = screen.getByLabelText(/previous slide/i);
            const nextButton = screen.getByLabelText(/next slide/i);

            fireEvent.click(prevButton);
            expect(mockCarouselApi?.scrollPrev).toHaveBeenCalled();

            fireEvent.click(nextButton);
            expect(mockCarouselApi?.scrollNext).toHaveBeenCalled();
        });

        test('handles keyboard navigation', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            const carousel = screen.getByRole('region');

            fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
            expect(mockCarouselApi?.scrollPrev).toHaveBeenCalled();

            fireEvent.keyDown(carousel, { key: 'ArrowRight' });
            expect(mockCarouselApi?.scrollNext).toHaveBeenCalled();

            fireEvent.keyDown(carousel, { key: 'Home' });
            expect(mockCarouselApi?.scrollTo).toHaveBeenCalledWith(0);

            fireEvent.keyDown(carousel, { key: 'End' });
            expect(mockCarouselApi?.scrollTo).toHaveBeenCalledWith(2);
        });
    });

    describe('Auto-play', () => {
        test('starts auto-play when enabled', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} autoPlay={true} autoPlayInterval={1000} />);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            expect(mockCarouselApi?.scrollNext).toHaveBeenCalled();
        });

        test('pauses auto-play on user interaction', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} autoPlay={true} autoPlayInterval={1000} />);

            const carousel = screen.getByRole('region');
            fireEvent.focus(carousel);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            expect(mockCarouselApi?.scrollNext).not.toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        test('has correct ARIA attributes', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            const carousel = screen.getByRole('region');
            expect(carousel).toHaveAttribute('aria-label', 'Hero carousel with 3 slides');
            expect(carousel).toHaveAttribute('tabIndex', '0');

            const dots = screen.getAllByRole('tab');
            expect(dots[0]).toHaveAttribute('aria-label', 'Go to slide 1 of 3');
            expect(dots[0]).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Props', () => {
        test('respects custom configuration', () => {
            renderWithRouter(
                <HeroCarousel slides={mockSlides} autoPlay={false} showDots={false} showNavigation={false} />
            );

            expect(screen.queryByRole('tab')).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/previous slide/i)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/next slide/i)).not.toBeInTheDocument();
        });

        test('handles missing optional props', () => {
            const slidesWithoutCta = [
                {
                    id: '1',
                    title: 'Test Slide',
                    imageUrl: '/test.jpg',
                    imageAlt: 'Test image',
                },
            ];

            renderWithRouter(<HeroCarousel slides={slidesWithoutCta} />);

            expect(screen.getByText('Learn More')).toBeInTheDocument();
            expect(screen.getByRole('link')).toHaveAttribute('href', '/');
        });
    });

    describe('Initial Load and State Management (PR #164)', () => {
        test('initializes navigation state and sets up event listeners', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            // Verify that onSelect is called immediately to set initial state
            expect(mockCarouselApi?.selectedScrollSnap).toHaveBeenCalled();
            expect(mockCarouselApi?.canScrollPrev).toHaveBeenCalled();
            expect(mockCarouselApi?.canScrollNext).toHaveBeenCalled();

            // Verify event listeners are set up
            expect(mockCarouselApi?.on).toHaveBeenCalledWith('select', expect.any(Function));
            expect(mockCarouselApi?.on).toHaveBeenCalledWith('reInit', expect.any(Function));
        });

        test('validates navigation and cleans up properly', () => {
            const { unmount } = renderWithRouter(<HeroCarousel slides={mockSlides} />);

            // Test keyboard navigation with valid indices
            const carousel = screen.getByRole('region');
            fireEvent.keyDown(carousel, { key: 'Home' });
            expect(mockCarouselApi?.scrollTo).toHaveBeenCalledWith(0);

            fireEvent.keyDown(carousel, { key: 'End' });
            expect(mockCarouselApi?.scrollTo).toHaveBeenCalledWith(2);

            // Test cleanup on unmount
            unmount();
            expect(mockCarouselApi?.off).toHaveBeenCalledWith('select', expect.any(Function));
            expect(mockCarouselApi?.off).toHaveBeenCalledWith('reInit', expect.any(Function));
        });

        test('handles onSelect callback state updates', () => {
            renderWithRouter(<HeroCarousel slides={mockSlides} />);

            // Get and trigger the onSelect callback
            const onMock = mockCarouselApi?.on as any;
            const selectCall = onMock?.mock?.calls?.find((call: any[]) => call[0] === 'select');
            const onSelectCallback = selectCall?.[1];

            if (onSelectCallback) {
                act(() => {
                    onSelectCallback();
                });
            }

            // Verify state update methods are called
            expect(mockCarouselApi?.selectedScrollSnap).toHaveBeenCalled();
            expect(mockCarouselApi?.canScrollPrev).toHaveBeenCalled();
            expect(mockCarouselApi?.canScrollNext).toHaveBeenCalled();
        });
    });

    describe('Responsive image (DynamicImage)', () => {
        const SFCC_SRC =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/dw000/images/large/hero.jpg';

        const disSlides: HeroSlide[] = [
            { id: '1', title: 'First Slide', imageUrl: SFCC_SRC, imageAlt: 'First image' },
            { id: '2', title: 'Second Slide', imageUrl: SFCC_SRC, imageAlt: 'Second image' },
        ];

        test('renders every slide image as a responsive <picture> with DIS-powered <source> elements', () => {
            const { container } = renderWithRouter(<HeroCarousel slides={disSlides} />);

            const pictures = container.querySelectorAll('picture');
            expect(pictures).toHaveLength(disSlides.length);

            const firstSources = pictures[0].querySelectorAll('source');
            expect(firstSources.length).toBeGreaterThan(0);
            // DIS conversion: WebP output for the <source> candidates.
            expect(firstSources[0]).toHaveAttribute('type', 'image/webp');
            expect(firstSources[0].getAttribute('srcset')).toMatch(/\bsw=\d+/);
        });

        test('renders each slide image as a full-bleed cover layer', () => {
            const { container } = renderWithRouter(<HeroCarousel slides={disSlides} />);

            // The absolute-fill positioning lives on the wrapper; object-cover on the <img> itself.
            const image = screen.getByRole('img', { name: 'First image' });
            expect(image).toHaveClass('w-full', 'h-full', 'object-cover');

            const wrapper = container.querySelector('picture')?.parentElement;
            expect(wrapper).toHaveClass('absolute', 'inset-0', 'w-full', 'h-full');
        });
    });

    describe('SSR preload', () => {
        const disSlide = (n: number): HeroSlide => ({
            id: `${n}`,
            title: `Slide ${n}`,
            imageUrl: `https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/dw000/images/large/slide-${n}.jpg`,
            imageAlt: `Image ${n}`,
        });
        const disSlides: HeroSlide[] = [disSlide(1), disSlide(2), disSlide(3)];

        test('preloads only the first slide during server rendering', () => {
            (isServer as Mock).mockReturnValue(true);

            renderWithRouter(<HeroCarousel slides={disSlides} />);

            // Every preload hint must target the first slide (the above-the-fold LCP candidate) — the
            // off-screen slides must never be preloaded, regardless of how many the carousel holds. A
            // single responsive image emits one <link> per breakpoint, so more than one call is expected.
            expect(preloadMock).toHaveBeenCalled();
            for (const [href, opts] of preloadMock.mock.calls as [string, Record<string, unknown>][]) {
                expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });
                // DIS-hosted, WebP-converted preload target for the first slide only.
                expect(String(href)).toContain('edge.disstg.commercecloud.salesforce.com');
                expect(String(href)).toContain('slide-1');
                expect(String(opts.imageSrcSet)).toContain('.webp');
                expect(String(opts.imageSrcSet)).toContain('slide-1');
                expect(String(opts.imageSrcSet)).not.toContain('slide-2');
                expect(String(opts.imageSrcSet)).not.toContain('slide-3');
            }
        });

        test('does not preload during client rendering', () => {
            (isServer as Mock).mockReturnValue(false);

            renderWithRouter(<HeroCarousel slides={disSlides} />);

            expect(preloadMock).not.toHaveBeenCalled();
        });

        test('does not preload the empty placeholder state', () => {
            (isServer as Mock).mockReturnValue(true);

            renderWithRouter(<HeroCarousel slides={[]} />);

            expect(preloadMock).not.toHaveBeenCalled();
        });
    });
});
