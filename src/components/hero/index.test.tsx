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
import { render, screen } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, type Mock } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { isServer } from '@/lib/utils';

// Mock decorators (minimal mocking to avoid testing them)
vi.mock('@/lib/decorators/component', () => ({
    Component: () => (target: any) => target,
}));

vi.mock('@/lib/decorators', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

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

// Spy on React 19's preload() so we can assert the hero emits <link rel="preload"> during SSR.
const preloadMock = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom')>();
    return {
        ...actual,
        preload: (...args: unknown[]) => preloadMock(...args),
    };
});

// Import the component after mocks are set up
import Hero from './index';

describe('Hero Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (isServer as Mock).mockReturnValue(false);
    });

    const renderHero = (props = {}) => {
        const router = createMemoryRouter(
            [
                {
                    path: '*',
                    element: (
                        <AllProvidersWrapper>
                            <Hero {...props} />
                        </AllProvidersWrapper>
                    ),
                },
            ],
            { initialEntries: ['/'] }
        );
        return render(<RouterProvider router={router} />);
    };

    describe('Content Rendering', () => {
        test('renders empty placeholder state with no props', () => {
            const { container } = renderHero();

            expect(screen.queryByRole('heading')).not.toBeInTheDocument();
            expect(screen.queryByRole('img')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();

            // Placeholder background should be present instead of an image
            expect(container.querySelector('.bg-muted')).toBeInTheDocument();
        });

        test('renders custom content', () => {
            renderHero({
                title: 'Custom Title',
                subtitle: 'Custom Subtitle',
                ctaText: 'Learn More',
                ctaLink: '/custom',
                imageUrl: { url: '/custom.jpg' },
                imageAlt: 'Custom Alt',
            });

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Custom Title');

            const link = screen.getByRole('link');
            expect(link).toHaveTextContent('Learn More');
            expect(link).toHaveAttribute('href', '/global/en-GB/custom');

            const image = screen.getByRole('img', { name: 'Custom Alt' });
            expect(image).toHaveAttribute('src', '/custom.jpg');
            expect(image).toHaveAttribute('alt', 'Custom Alt');
            expect(image).toHaveAttribute('fetchpriority', 'high');

            expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
        });

        test('renders image with empty alt when imageAlt is not provided', () => {
            renderHero({ imageUrl: { url: '/test.jpg' } });

            const image = screen.getByRole('presentation');
            expect(image).toHaveAttribute('src', '/test.jpg');
            expect(image).toHaveAttribute('alt', '');
        });

        test('renders image with title attribute when imageTitle is provided', () => {
            renderHero({
                imageUrl: { url: '/test.jpg' },
                imageAlt: 'Test image',
                imageTitle: 'Hover tooltip text',
            });

            const image = screen.getByRole('img', { name: 'Test image' });
            expect(image).toHaveAttribute('title', 'Hover tooltip text');
        });

        test('does not render title attribute when imageTitle is not provided', () => {
            renderHero({
                imageUrl: { url: '/test.jpg' },
                imageAlt: 'Test image',
            });

            const image = screen.getByRole('img', { name: 'Test image' });
            expect(image).not.toHaveAttribute('title');
        });

        test('does not render title attribute when imageTitle is an empty string', () => {
            renderHero({
                imageUrl: { url: '/test.jpg' },
                imageAlt: 'Test image',
                imageTitle: '',
            });

            const image = screen.getByRole('img', { name: 'Test image' });
            expect(image).not.toHaveAttribute('title');
        });

        test('does not render CTA when only ctaText is provided without ctaLink', () => {
            renderHero({ ctaText: 'Click Me' });
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        test('renders CTA when ctaLink is set without ctaText using a label derived from the path', () => {
            renderHero({ ctaLink: '/sale-items' });
            const link = screen.getByRole('link');
            expect(link).toHaveAttribute('href', '/global/en-GB/sale-items');
            expect(link).toHaveTextContent('sale items');
        });

        test('does not render CTA when ctaLink is empty or whitespace only', () => {
            renderHero({ ctaText: 'Go', ctaLink: '' });
            expect(screen.queryByRole('link')).not.toBeInTheDocument();

            renderHero({ ctaText: 'Go', ctaLink: '   \t  ' });
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        test('applies titleColor when hex is valid', () => {
            renderHero({ title: 'T', titleColor: '#aabbcc' });
            expect(screen.getByRole('heading', { level: 1 })).toHaveStyle({ color: '#aabbcc' });
        });

        test('ignores invalid titleColor and keeps theme foreground class', () => {
            renderHero({ title: 'T', titleColor: 'not-a-color' });
            const heading = screen.getByRole('heading', { level: 1 });
            expect(heading).not.toHaveStyle({ color: 'not-a-color' });
            expect(heading).toHaveClass('text-primary-foreground');
        });

        test('maps buttonStyle Secondary to data-variant secondary', () => {
            const { container } = renderHero({
                ctaLink: '/go',
                ctaText: 'Go',
                buttonStyle: 'Secondary',
            });
            expect(container.querySelector('[data-slot="button"]')).toHaveAttribute('data-variant', 'secondary');
        });

        test('maps buttonStyle Tertiary to data-variant outline', () => {
            const { container } = renderHero({
                ctaLink: '/go',
                ctaText: 'Go',
                buttonStyle: 'Tertiary',
            });
            expect(container.querySelector('[data-slot="button"]')).toHaveAttribute('data-variant', 'outline');
        });
    });

    describe('Overlay position and alignment', () => {
        test('defaults to centered block and centered text when overlay props are omitted', () => {
            const { container } = renderHero({ title: 'T' });
            const overlay = container.querySelector('.absolute.inset-0.z-10.flex');
            expect(overlay).toHaveClass('items-center');
            expect(overlay).not.toHaveClass('pt-6', 'pb-6');
            const block = container.querySelector('.max-w-2xl');
            expect(block).toBeInTheDocument();
            expect(block).toHaveClass('mx-auto', 'text-center');
        });

        test('applies middle-right block position with centered text and CTA row', () => {
            const { container } = renderHero({
                title: 'T',
                ctaText: 'Go',
                ctaLink: '/go',
                overlayPosition: 'Middle Right',
                overlayAlignment: 'center',
            });
            const overlay = container.querySelector('.absolute.inset-0.z-10.flex');
            expect(overlay).toHaveClass('items-center');
            const block = container.querySelector('.max-w-2xl');
            expect(block).toHaveClass('ml-auto', 'text-center');
            expect(block).not.toHaveClass('mx-auto');

            const ctaRow = container.querySelector('.max-w-2xl .flex.justify-center');
            expect(ctaRow).toBeInTheDocument();
        });

        test('maps legacy horizontal overlayPosition values to middle row', () => {
            const { container } = renderHero({ title: 'T', overlayPosition: 'right' });
            expect(container.querySelector('.max-w-2xl')).toHaveClass('ml-auto');
        });

        test('applies top-left overlay row, top padding, and block placement', () => {
            const { container } = renderHero({ title: 'T', overlayPosition: 'Top Left' });
            const overlay = container.querySelector('.absolute.inset-0.z-10.flex');
            expect(overlay).toHaveClass('items-start', 'pt-6', 'sm:pt-8', 'md:pt-10');
            expect(overlay).not.toHaveClass('pb-6');
            const block = container.querySelector('.max-w-2xl');
            expect(block).not.toHaveClass('mx-auto', 'ml-auto');
        });

        test('applies bottom padding for bottom overlay positions', () => {
            const { container } = renderHero({ title: 'T', overlayPosition: 'Bottom Center' });
            const overlay = container.querySelector('.absolute.inset-0.z-10.flex');
            expect(overlay).toHaveClass('items-end', 'pb-6', 'sm:pb-8', 'md:pb-10');
            expect(overlay).not.toHaveClass('pt-6');
        });

        test('normalizes invalid overlay values to middle center', () => {
            const { container } = renderHero({
                title: 'T',
                overlayPosition: 'invalid',
                overlayAlignment: 'also-bad',
            });
            const overlay = container.querySelector('.absolute.inset-0.z-10.flex');
            expect(overlay).toHaveClass('items-center');
            const block = container.querySelector('.max-w-2xl');
            expect(block).toHaveClass('mx-auto', 'text-center');
        });
    });

    describe('Focal Point Behavior', () => {
        const focalPointTestCases = [
            {
                description: 'uses custom focal point',
                imageUrl: { url: '/test.jpg', focalPoint: { x: '30', y: '70' } },
                expectedPosition: '30% 70%',
            },
            {
                description: 'defaults to center when no focal point',
                imageUrl: { url: '/test.jpg' },
                expectedPosition: '50% 50%',
            },
            {
                description: 'handles partial focal point (x only)',
                imageUrl: { url: '/test.jpg', focalPoint: { x: '25' } },
                expectedPosition: '25% 50%',
            },
            {
                description: 'handles partial focal point (y only)',
                imageUrl: { url: '/test.jpg', focalPoint: { y: '75' } },
                expectedPosition: '50% 75%',
            },
            {
                description: 'handles empty focal point object',
                imageUrl: { url: '/test.jpg', focalPoint: {} },
                expectedPosition: '50% 50%',
            },
        ];

        test.each(focalPointTestCases)('$description', ({ imageUrl, expectedPosition }) => {
            renderHero({ imageUrl });

            const image = screen.getByRole('presentation');
            expect(image).toHaveStyle({ objectPosition: expectedPosition });
        });
    });

    describe('Responsive image (DynamicImage)', () => {
        const SFCC_SRC =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/dw000/images/large/hero.jpg';

        test('renders a responsive <picture> with DIS-powered <source> elements', () => {
            const { container } = renderHero({ imageUrl: { url: SFCC_SRC }, imageAlt: 'Hero' });

            const picture = container.querySelector('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source') ?? [];
            expect(sources.length).toBeGreaterThan(0);
            // DIS conversion: WebP output for the <source> candidates.
            expect(sources[0]).toHaveAttribute('type', 'image/webp');
            expect(sources[0].getAttribute('srcset')).toMatch(/\bsw=\d+/);
        });

        test('renders the image as a full-bleed cover layer', () => {
            const { container } = renderHero({ imageUrl: { url: SFCC_SRC }, imageAlt: 'Hero' });

            // The absolute-fill positioning lives on the wrapper; object-cover on the <img> itself.
            const image = screen.getByRole('img', { name: 'Hero' });
            expect(image).toHaveClass('w-full', 'h-full', 'object-cover');

            const wrapper = container.querySelector('picture')?.parentElement;
            expect(wrapper).toHaveClass('absolute', 'inset-0', 'w-full', 'h-full');
        });
    });

    describe('SSR preload', () => {
        const SFCC_SRC =
            'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/dw000/images/large/hero.jpg';

        test('emits <link rel="preload"> hints for the hero image during server rendering', () => {
            (isServer as Mock).mockReturnValue(true);

            renderHero({ imageUrl: { url: SFCC_SRC }, imageAlt: 'Hero' });

            expect(preloadMock).toHaveBeenCalled();
            const [href, opts] = preloadMock.mock.calls[0] as [string, Record<string, unknown>];
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });
            // DIS-hosted, WebP-converted preload target.
            expect(String(href)).toContain('edge.disstg.commercecloud.salesforce.com');
            expect(String(opts.imageSrcSet)).toContain('.webp');
        });

        test('does not preload during client rendering', () => {
            (isServer as Mock).mockReturnValue(false);

            renderHero({ imageUrl: { url: SFCC_SRC }, imageAlt: 'Hero' });

            expect(preloadMock).not.toHaveBeenCalled();
        });

        test('does not preload the empty placeholder state', () => {
            (isServer as Mock).mockReturnValue(true);

            renderHero({});

            expect(preloadMock).not.toHaveBeenCalled();
        });
    });

    describe('Style Override', () => {
        test('injects a <style> tag when styleOverride is provided', () => {
            const { container } = renderHero({ styleOverride: ':root-hero { border-radius: 1rem; }' });
            expect(container.querySelector('style')).toBeInTheDocument();
        });

        test('does not inject a <style> tag when styleOverride is undefined', () => {
            const { container } = renderHero({ styleOverride: undefined });
            expect(container.querySelector('style')).not.toBeInTheDocument();
        });

        test('does not inject a <style> tag when styleOverride is whitespace only', () => {
            const { container } = renderHero({ styleOverride: '   ' });
            expect(container.querySelector('style')).not.toBeInTheDocument();
        });

        test('wraps the fragment in the scoped data-hero-id selector', () => {
            const { container } = renderHero({ styleOverride: '& { color: red; }' });
            const heroId = container.querySelector('[data-hero-id]')?.getAttribute('data-hero-id');
            expect(heroId).toBeTruthy();
            const styleContent = container.querySelector('style')?.textContent ?? '';
            expect(styleContent).toMatch(new RegExp(`\\[data-hero-id="${heroId}"\\]\\s*\\{`));
            expect(styleContent).toContain('color: red');
        });

        test('wraps the entire fragment — inner selectors are untouched', () => {
            const { container } = renderHero({
                styleOverride: '& { color: red; } & [data-slot="button"] { transform: scale(1.05); }',
            });
            const heroId = container.querySelector('[data-hero-id]')?.getAttribute('data-hero-id');
            const styleContent = container.querySelector('style')?.textContent ?? '';
            expect(styleContent).toContain(`[data-hero-id="${heroId}"]`);
            expect(styleContent).toContain('& { color: red; }');
            expect(styleContent).toContain('& [data-slot="button"]');
        });

        test('passes any CSS fragment through inside the wrapper', () => {
            const css = '.custom-class { color: green; }';
            const { container } = renderHero({ styleOverride: css });
            const styleContent = container.querySelector('style')?.textContent ?? '';
            expect(styleContent).toContain(css);
        });

        test('sets data-hero-id attribute on the root div', () => {
            const { container } = renderHero({});
            expect(container.querySelector('[data-hero-id]')).toBeInTheDocument();
        });

        test('preserves base classes on the root div when styleOverride is provided', () => {
            const { container } = renderHero({ styleOverride: ':root-hero { color: red; }' });
            expect(container.querySelector('[data-hero-id]')).toHaveClass('relative', 'w-full', 'overflow-hidden');
        });

        test('trims leading and trailing whitespace from the fragment', () => {
            const { container } = renderHero({ styleOverride: '  & { color: red; }  ' });
            expect(container.querySelector('style')).toBeInTheDocument();
        });
    });

    describe('Height', () => {
        test('applies full height class by default', () => {
            const { container } = renderHero();
            expect(container.firstChild).toHaveClass('h-[100vh]', 'md:h-[85vh]');
        });

        test.each([
            { height: 'sm', classes: ['h-[250px]', 'md:h-[300px]', 'lg:h-[350px]'] },
            { height: 'md', classes: ['h-[350px]', 'md:h-[450px]', 'lg:h-[500px]'] },
            { height: 'lg', classes: ['h-[400px]', 'md:h-[500px]', 'lg:h-[600px]'] },
            { height: 'xl', classes: ['h-[500px]', 'md:h-[600px]', 'lg:h-[700px]'] },
            { height: 'full', classes: ['h-[100vh]', 'md:h-[85vh]'] },
        ])('applies $height height class', ({ height, classes }) => {
            const { container } = renderHero({ height });
            expect(container.firstChild).toHaveClass(...classes);
        });

        test('falls back to full height for invalid height value', () => {
            const { container } = renderHero({ height: 'invalid' });
            expect(container.firstChild).toHaveClass('h-[100vh]', 'md:h-[85vh]');
        });
    });

    describe('Component Behavior', () => {
        test('renders all elements when fully configured', () => {
            renderHero({
                title: 'Test Title',
                imageUrl: { url: '/test.jpg' },
                imageAlt: 'Test image',
                ctaText: 'Go',
                ctaLink: '/go',
            });

            expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'Test image' })).toBeInTheDocument();
            expect(screen.getByRole('link')).toBeInTheDocument();
        });

        test('subtitle is conditionally rendered', () => {
            renderHero({ title: 'Test' });
            expect(screen.queryByText(/subtitle/i)).not.toBeInTheDocument();

            renderHero({ title: 'Test', subtitle: 'Now with subtitle' });
            expect(screen.getByText('Now with subtitle')).toBeInTheDocument();
        });
    });
});
