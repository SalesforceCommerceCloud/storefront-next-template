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
import { useEffect, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ContentCard from '@/components/content-card';
import type { ComponentType } from '@/components/region';
import ContentCarousel, { type ContentCarouselProps } from './index';

const { api, design, renderRegion } = vi.hoisted(() => ({
    api: { scrollNext: vi.fn(), selectedScrollSnap: () => 0, on: vi.fn(), off: vi.fn() },
    design: { enabled: false },
    renderRegion: vi.fn(),
}));
vi.mock('@salesforce/storefront-next-runtime/design/react/core', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    usePageDesignerMode: () => ({ isDesignMode: design.enabled }),
}));
vi.mock('@/components/ui/carousel', () => ({
    CarouselItem: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}));
vi.mock('@/components/carousel-section', () => ({
    CarouselSection: ({
        title,
        children,
        headerActions,
        carouselProps,
        showNavigation,
    }: {
        title?: string;
        children: React.ReactNode;
        headerActions?: React.ReactNode;
        carouselProps: { setApi: (value: unknown) => void } & React.HTMLAttributes<HTMLDivElement>;
        showNavigation?: boolean;
    }) => {
        const setApi = carouselProps.setApi;
        useEffect(() => {
            setApi(api);
        }, [setApi]);
        return (
            <section>
                <h2>{title}</h2>
                {headerActions}
                <div
                    data-testid="track"
                    onMouseEnter={carouselProps.onMouseEnter}
                    onMouseLeave={carouselProps.onMouseLeave}
                    onFocusCapture={carouselProps.onFocusCapture}
                    onBlurCapture={carouselProps.onBlurCapture}>
                    {children}
                </div>
                {showNavigation && <button type="button">Next slide</button>}
            </section>
        );
    },
}));
vi.mock('@/components/region/component', () => ({
    Component: ({ component }: { component: ComponentType }) => {
        renderRegion(component);
        return <ContentCard {...(component.data as ComponentProps<typeof ContentCard>)} />;
    },
}));

const items: NonNullable<ContentCarouselProps['items']> = [
    {
        id: 'first',
        title: 'Weekly picks',
        imageUrl: '/first.webp',
        imageAlt: 'First artwork',
        buttonText: 'Shop first',
        buttonLink: '/first',
    },
    { id: 'second', title: 'Market finds', imageUrl: '/second.webp', buttonText: 'Shop second', buttonLink: '/second' },
];
function renderCarousel(props: ContentCarouselProps = {}) {
    const router = createMemoryRouter([
        {
            path: '*',
            element: (
                <AllProvidersWrapper>
                    <ContentCarousel title="Featured" items={items} {...props} />
                </AllProvidersWrapper>
            ),
        },
    ]);
    return render(<RouterProvider router={router} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    design.enabled = false;
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('ContentCarousel', () => {
    test('renders real content cards and keeps multiple card links accessible', () => {
        const { container } = renderCarousel();
        expect(screen.getByRole('heading', { name: 'Weekly picks' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'Shop first' })).toHaveAttribute('href', '/global/en-GB/first');
        expect(screen.getByRole('link', { name: 'Shop second' })).toBeVisible();
        expect(container.querySelectorAll('[inert], [aria-hidden="true"] a')).toHaveLength(0);
        expect(screen.getByAltText('First artwork')).toHaveAttribute('fetchpriority', 'high');
        expect(screen.queryByRole('button', { name: /slideshow/i })).not.toBeInTheDocument();
    });

    test('authored items take precedence and reject non-card types', () => {
        const component = {
            id: 'carousel',
            typeId: 'Layout.contentCarousel',
            regions: [
                {
                    id: 'items',
                    components: [
                        {
                            id: 'authored',
                            typeId: 'Content.contentCard',
                            data: { title: 'Authored campaign', imageUrl: '/authored.webp' },
                        },
                        { id: 'hero', typeId: 'Content.hero', data: { title: 'Wrong component' } },
                    ],
                },
            ],
        } as unknown as ComponentType;
        renderCarousel({ component });
        expect(screen.getByRole('heading', { name: 'Authored campaign' })).toBeInTheDocument();
        expect(screen.queryByText('Weekly picks')).not.toBeInTheDocument();
        expect(screen.queryByText('Wrong component')).not.toBeInTheDocument();
        expect(renderRegion).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    title: 'Authored campaign',
                    imagePriority: 'high',
                    loading: 'eager',
                    imageWidths: expect.any(Array),
                }),
            })
        );
    });

    test('renders no live empty carousel and previews real empty cards only in design mode', () => {
        const view = renderCarousel({ items: [] });
        expect(view.container.querySelector('section')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        cleanup();
        design.enabled = true;
        renderCarousel({ items: [], title: undefined });
        expect(screen.getByRole('heading', { name: 'Content Carousel' })).toBeVisible();
        expect(screen.getAllByText('Add your title here')).toHaveLength(4);
        expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
    });

    test('validates responsive card counts without emitting invalid CSS', () => {
        const { container } = renderCarousel({ itemsOnMobile: 1.25, itemsOnTablet: 'NaN', itemsOnDesktop: 0 });
        const root = container.querySelector<HTMLElement>('[data-slot="content-carousel"]');
        expect(root?.style.getPropertyValue('--content-carousel-mobile-width')).toBe('80%');
        expect(root?.style.getPropertyValue('--content-carousel-tablet-width')).toBe('50%');
        expect(root?.style.getPropertyValue('--content-carousel-desktop-width')).toBe('25%');
    });

    test('autoplay stops on explicit pause and cleans up on unmount', async () => {
        vi.useFakeTimers();
        const view = renderCarousel({ autoPlay: true, autoPlayInterval: 1000 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(api.scrollNext).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Pause the slideshow' }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(api.scrollNext).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Play the slideshow' }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(api.scrollNext).toHaveBeenCalledTimes(2);
        view.unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(api.scrollNext).toHaveBeenCalledTimes(2);
    });

    test('pointer exit cannot restart autoplay while a card still has keyboard focus', async () => {
        vi.useFakeTimers();
        renderCarousel({ autoPlay: true, autoPlayInterval: 1000 });
        const track = screen.getByTestId('track');
        const first = screen.getByRole('link', { name: 'Shop first' });
        const second = screen.getByRole('link', { name: 'Shop second' });
        fireEvent.mouseEnter(track);
        fireEvent.focus(first);
        fireEvent.mouseLeave(track);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(api.scrollNext).not.toHaveBeenCalled();
        fireEvent.blur(first, { relatedTarget: second });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(api.scrollNext).not.toHaveBeenCalled();
        fireEvent.blur(second, { relatedTarget: null });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(api.scrollNext).toHaveBeenCalledTimes(1);
    });

    test('reduced motion starts paused and a single card never rotates', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'matchMedia',
            vi.fn((media: string) => ({
                matches: media === '(prefers-reduced-motion: reduce)',
                media,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
            }))
        );
        renderCarousel({ autoPlay: true, autoPlayInterval: 1000 });
        expect(screen.getByRole('button', { name: 'Play the slideshow' })).toBeVisible();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(api.scrollNext).not.toHaveBeenCalled();
        cleanup();
        renderCarousel({ autoPlay: true, items: [items[0]] });
        expect(screen.queryByRole('button', { name: /slideshow/ })).not.toBeInTheDocument();
    });
});
