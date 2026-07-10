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
import { beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockConfig } from '@/test-utils/config';
import { isServer } from '@/lib/utils';
import { useDynamicImageContext } from '@/providers/dynamic-image';

// Mock decorators (minimal mocking to avoid testing them)
vi.mock('@/lib/decorators/component', () => ({
    Component: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/region-definition', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

import { DynamicImage } from './index';

const src =
    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.jpg';

// DIS-eligible base URL (already on the imaging host with a `/dw/image/v2/{realm}/` prefix). DIS
// transformation only applies to URLs that carry this prefix, so tests exercising format conversion,
// `sw`/`sh`, and quality params must use one — a bare third-party host (`example.com`) is served
// verbatim and produces a plain <img>, not a <picture>.
const disSrc = (ext: string) =>
    `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/image.${ext}`;

let mockConfigImages = {
    ...mockConfig.images,
};

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        useConfig: () => ({
            ...mockConfig,
            images: mockConfigImages,
        }),
    };
});

vi.mock('@/lib/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/utils')>();
    return {
        ...actual,
        isServer: vi.fn().mockReturnValue(false),
    };
});

const preloadMock = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom')>();
    return {
        ...actual,
        preload: (...args: unknown[]) => preloadMock(...args),
    };
});

vi.mock('@/providers/dynamic-image', () => ({
    useDynamicImageContext: vi.fn().mockReturnValue(null),
}));

describe('Dynamic Image Component', () => {
    beforeEach(() => {
        mockConfigImages = {
            ...mockConfig.images,
        };
    });

    afterEach(() => {
        preloadMock.mockClear();
    });

    test('renders an image with default props', () => {
        render(<DynamicImage src={src} alt="Test image" />);

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', src);
        expect(img).toHaveAttribute('alt', 'Test image');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('fetchpriority', 'auto');
    });

    test('renders an image with custom className', () => {
        render(<DynamicImage src={src} alt="Test image" className="custom-class" />);

        const wrapper = screen.getByRole('img').parentElement;
        expect(wrapper).toHaveClass('custom-class');
    });

    test('renders with custom as prop', () => {
        const { container } = render(<DynamicImage src={src} alt="Test image" as="div" />);

        const element = container.querySelector('div[alt="Test image"]');
        expect(element).toBeInTheDocument();
        expect(element?.tagName).toBe('DIV');
        expect(element).toHaveAttribute('alt', 'Test image');
    });

    test('renders with low priority', () => {
        render(<DynamicImage src={src} alt="Test image" priority="low" />);

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('fetchpriority', 'low');
    });

    test('renders with high priority', () => {
        render(<DynamicImage src={src} alt="Test image" priority="high" />);

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('loading', 'eager');
        expect(img).toHaveAttribute('fetchpriority', 'high');
    });

    test('renders lazy with high priority', () => {
        render(<DynamicImage src={src} alt="Test image" loading="lazy" priority="high" />);

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('fetchpriority', 'high');
    });

    test('renders with custom imageProps', () => {
        render(
            <DynamicImage
                src={src}
                alt="Test image"
                imageProps={
                    {
                        title: 'Custom title',
                        'data-testid': 'custom-img',
                    } as any
                }
            />
        );

        const img = screen.getByTestId('custom-img');
        expect(img).toHaveAttribute('title', 'Custom title');
    });

    describe('DIS host rewrite', () => {
        test('rewrites raw classic SFCC URL to DIS-hosted URL in srcSet and <img src>', () => {
            const rawSrc =
                'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';
            render(<DynamicImage src={rawSrc} alt="Test image" widths={[288]} />);

            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).toContain(
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg'
            );
            expect(img.getAttribute('src')).not.toContain('zzrf-001.dx.commercecloud.salesforce.com');

            const source = img.closest('picture')?.querySelector('source');
            expect(source?.getAttribute('srcset')).toContain('/dw/image/v2/DEMO_001/');
            expect(source?.getAttribute('srcset')).toContain('.webp');
            expect(source?.getAttribute('srcset')).toContain('sfrm=jpg');
        });

        test('rewrites raw MyDomain URL to DIS-hosted URL in srcSet and <img src>', () => {
            const rawSrc =
                'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg';
            render(<DynamicImage src={rawSrc} alt="Test image" widths={[288]} />);

            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).toContain(
                'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg'
            );
            expect(img.getAttribute('src')).not.toContain('demo-001.my.cc.salesforce.com');

            const source = img.closest('picture')?.querySelector('source');
            expect(source?.getAttribute('srcset')).toContain('/dw/image/v2/DEMO_001/');
            expect(source?.getAttribute('srcset')).toContain('.webp');
            expect(source?.getAttribute('srcset')).toContain('sfrm=jpg');
        });

        test('leaves raw MyDomain URL as-is when DIS is disabled', () => {
            mockConfigImages = { ...mockConfig.images, enableDis: false };
            const rawSrc =
                'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg';
            render(<DynamicImage src={rawSrc} alt="Test image" />);

            const img = screen.getByRole('img');
            // DIS disabled → relative static path, no DIS host/prefix
            expect(img.getAttribute('src')).toBe(
                '/on/demandware.static/-/Sites-apparel-m-catalog/default/dwffa6be72/images/medium/PG.10232700.JJ0DDXX.PZ.jpg'
            );
        });

        test('does not rewrite host for non-SFCC URL when DIS is enabled', () => {
            const externalSrc = 'https://cdn.example.com/images/product.jpg';
            render(<DynamicImage src={externalSrc} alt="Test image" widths={[288]} />);

            // A non-SFCC host has no derivable realm, so toDisBaseUrl leaves it unchanged and DIS never
            // engages. The URL must be served verbatim as a plain <img> — no host rewrite, no DIS path,
            // and no <picture>/<source> variants the third-party host can't serve.
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src') ?? '';
            expect(imgSrc).toBe(externalSrc);
            expect(img.closest('picture')).not.toBeInTheDocument();
        });
    });

    describe('responsive images', () => {
        test('renders responsive image with widths array', () => {
            render(<DynamicImage src={src} alt="Test image" widths={[100, 200, 400]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(3);

            // Check that sources have proper attributes
            sources?.forEach((source: any, index: number) => {
                expect(source).toHaveAttribute('srcset');
                expect(source).toHaveAttribute('sizes');
                if (index < sources.length - 1) {
                    expect(source).toHaveAttribute('media');
                }
            });
        });

        test('renders responsive image with vw widths', () => {
            render(<DynamicImage src={src} alt="Test image" widths={['50vw', '100vw', '25vw']} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(5);
        });

        test('renders responsive image with breakpoint object', () => {
            render(<DynamicImage src={src} alt="Test image" widths={{ base: 100, sm: 200, md: 400 }} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(3);
        });

        test('renders simple image without widths', () => {
            render(<DynamicImage src={src} alt="Test image" />);

            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.closest('picture')).not.toBeInTheDocument();
        });

        test('renders image with SFCC URL and sw parameter', () => {
            const sfccSrc = disSrc('jpg');
            render(<DynamicImage src={sfccSrc} alt="Test image" widths={[468]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(1);

            const srcset = sources?.[0]?.getAttribute('srcset');
            expect(srcset).toContain('sw=468');
        });

        test('renders responsive image with widths and heights arrays', () => {
            render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} heights={[150, 300]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // [200, 400] → 2 unique widths → 2 sources (reversed: sm first, then base)
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(2);

            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            // sm breakpoint: 1x sw=400&sh=300, 2x sw=800&sh=600
            expect(srcSets[0]).toContain('sw=400');
            expect(srcSets[0]).toContain('sh=300');
            expect(srcSets[0]).toContain('sw=800');
            expect(srcSets[0]).toContain('sh=600');
            // base breakpoint: 1x sw=200&sh=150, 2x sw=400&sh=300
            expect(srcSets[1]).toContain('sw=200');
            expect(srcSets[1]).toContain('sh=150');
        });

        test('renders responsive image without sh when heights not provided', () => {
            render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(2);

            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            // sm breakpoint: 1x sw=400, 2x sw=800
            expect(srcSets[0]).toContain('sw=400');
            expect(srcSets[0]).toContain('sw=800');
            expect(srcSets[0]).not.toContain('sh=');
            // base breakpoint: 1x sw=200, 2x sw=400
            expect(srcSets[1]).toContain('sw=200');
            expect(srcSets[1]).not.toContain('sh=');
        });

        test('renders responsive image with only heights (no widths)', () => {
            render(<DynamicImage src={src} alt="Test image" heights={[200, 400]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // [200, 400] → 2 unique heights → 2 sources (reversed: sm first, then base)
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(2);

            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            // sm breakpoint: 1x sh=400, 2x sh=800
            expect(srcSets[0]).toContain('sh=400');
            expect(srcSets[0]).toContain('sh=800');
            expect(srcSets[0]).not.toContain('sw=');
            // base breakpoint: 1x sh=200, 2x sh=400
            expect(srcSets[1]).toContain('sh=200');
            expect(srcSets[1]).not.toContain('sw=');
        });
    });

    describe('edge cases', () => {
        test('handles empty widths array', () => {
            render(<DynamicImage src={src} alt="Test image" widths={[]} />);

            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.closest('picture')).not.toBeInTheDocument();
        });

        test('handles undefined alt', () => {
            // eslint-disable-next-line jsx-a11y/alt-text
            render(<DynamicImage src={src} />);

            const img = screen.getByRole('presentation');
            expect(img).toHaveAttribute('alt', '');
        });

        test('handles custom loading values', () => {
            render(<DynamicImage src={src} alt="Test image" loading="eager" />);

            const img = screen.getByRole('img');
            expect(img).toHaveAttribute('loading', 'eager');
        });

        test('handles mixed width types', () => {
            render(<DynamicImage src={src} alt="Test image" widths={[100, '50vw', 300]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(3);
        });
    });

    describe('Page Designer image object src', () => {
        test('resolves src from absURL property', () => {
            render(<DynamicImage src={{ absURL: src, url: 'ignored' } as unknown as string} alt="Test image" />);
            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).toContain('absURL' in { absURL: src } ? src.split('/').pop() : '');
            expect(img).toBeInTheDocument();
        });

        test('resolves src from url property when absURL is absent', () => {
            render(<DynamicImage src={{ url: src } as unknown as string} alt="Test image" />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.getAttribute('src')).toBeTruthy();
        });

        test('resolves src from disBaseLink property when absURL and url are absent', () => {
            render(<DynamicImage src={{ disBaseLink: src } as unknown as string} alt="Test image" />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.getAttribute('src')).toBeTruthy();
        });

        test('resolves src from link property as last resort', () => {
            render(<DynamicImage src={{ link: src } as unknown as string} alt="Test image" />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.getAttribute('src')).toBeTruthy();
        });

        test('renders without crashing when image object has no recognized URL property', () => {
            render(<DynamicImage src={{ _type: 'image' } as unknown as string} alt="Test image" />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            // No recognized URL property resolves to empty string — React omits the src attribute
            expect(img.getAttribute('src')).toBeNull();
        });

        test('does not throw when src is a plain string', () => {
            expect(() => render(<DynamicImage src={src} alt="Test image" />)).not.toThrow();
            expect(screen.getByRole('img')).toBeInTheDocument();
        });

        test('does not throw when src is undefined', () => {
            expect(() => render(<DynamicImage src={undefined as unknown as string} alt="Test image" />)).not.toThrow();
            expect(screen.getByRole('img')).toBeInTheDocument();
        });
    });

    describe('image format conversion', () => {
        test('converts non-jpg image to picture with webp sources and jpg fallback', () => {
            const pngSrc = disSrc('png');
            render(<DynamicImage src={pngSrc} alt="Test image" widths={[200, 400]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // All sources should have webp format with sfrm=png parameter
            const sources = picture?.querySelectorAll('source');
            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                expect(srcset).toContain('.webp');
                expect(srcset).toContain('sfrm=png');
            });

            // Fallback img should be jpg format with sfrm=png parameter
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src');
            expect(imgSrc).toContain('.jpg');
            expect(imgSrc).toContain('sfrm=png');
            expect(imgSrc).not.toContain('.png');
        });

        test('converts webp image to picture with webp sources and jpg fallback', () => {
            const webpSrc = disSrc('webp');
            render(<DynamicImage src={webpSrc} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // Sources should remain webp (no change needed)
            const sources = picture?.querySelectorAll('source');
            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                expect(srcset).toContain('.webp');
                // No sfrm parameter when source is already webp
                expect(srcset).not.toContain('sfrm=');
            });

            // Fallback img should be converted to jpg with sfrm=webp
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src');
            expect(imgSrc).toContain('.jpg');
            expect(imgSrc).toContain('sfrm=webp');
        });

        test('converts jpg image to picture with webp sources and jpg fallback', () => {
            const jpgSrc = disSrc('jpg');
            render(<DynamicImage src={jpgSrc} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // Sources should be webp with sfrm=jpg
            const sources = picture?.querySelectorAll('source');
            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                expect(srcset).toContain('.webp');
                expect(srcset).toContain('sfrm=jpg');
            });

            // Fallback img should remain jpg (no change needed)
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src');
            expect(imgSrc).toContain('.jpg');
            // No sfrm parameter when target is already jpg
            expect(imgSrc).not.toContain('sfrm=');
        });
    });

    describe('quality parameter', () => {
        beforeEach(() => {
            mockConfigImages = {
                ...mockConfig.images,
            };
        });

        test('applies default quality from config to srcSet URLs', () => {
            // Default quality in mockConfig.images is 70
            const srcWithoutQuality = disSrc('jpg');
            render(<DynamicImage src={srcWithoutQuality} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');

            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                expect(srcset).toContain('q=70');
            });
        });

        test('applies custom quality from config override to srcSet URLs', () => {
            mockConfigImages = { ...mockConfig.images, quality: 85 };

            const srcWithoutQuality = disSrc('jpg');
            render(<DynamicImage src={srcWithoutQuality} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');

            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                expect(srcset).toContain('q=85');
            });
        });

        test('existing q parameter in URL takes priority over config quality', () => {
            mockConfigImages = { ...mockConfig.images, quality: 85 };

            const srcWithQuality = `${disSrc('jpg')}?q=60`;
            render(<DynamicImage src={srcWithQuality} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');

            sources?.forEach((source) => {
                const srcset = source.getAttribute('srcset');
                // URL's q=60 should be preserved, not overwritten by config's 85
                expect(srcset).toContain('q=60');
                expect(srcset).not.toContain('q=85');
            });
        });
    });

    describe('formats parameter', () => {
        beforeEach(() => {
            mockConfigImages = {
                ...mockConfig.images,
            };
        });

        test('applies default formats from config to source types', () => {
            // Default formats in mockConfig.images is ['webp']
            const srcWithoutFormat = disSrc('jpg');
            render(<DynamicImage src={srcWithoutFormat} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');

            // Should have 1 source per breakpoint (only webp format)
            expect(sources?.length).toBe(1);
            sources?.forEach((source) => {
                expect(source).toHaveAttribute('type', 'image/webp');
            });
        });

        test('applies custom formats from config override to source types', () => {
            mockConfigImages = { ...mockConfig.images, formats: ['avif', 'webp'] };

            const srcWithoutFormat = disSrc('jpg');
            render(<DynamicImage src={srcWithoutFormat} alt="Test image" widths={[200]} />);

            const picture = screen.getByRole('img').closest('picture');
            const sources = picture?.querySelectorAll('source');

            // Should have 2 sources (avif and webp) for the single breakpoint
            expect(sources?.length).toBe(2);

            const types = Array.from(sources || []).map((s) => s.getAttribute('type'));
            expect(types).toContain('image/avif');
            expect(types).toContain('image/webp');
        });
    });

    describe('fallbackFormat parameter', () => {
        test('applies default fallbackFormat from config to img src', () => {
            // Default fallbackFormat in mockConfig.images is 'jpg'
            const pngSrc = disSrc('png');
            render(<DynamicImage src={pngSrc} alt="Test image" widths={[200]} />);

            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src');

            // Fallback should be converted to jpg
            expect(imgSrc).toContain('.jpg');
            expect(imgSrc).toContain('sfrm=png');
        });

        test('applies custom fallbackFormat from config override to img src', () => {
            mockConfigImages = { ...mockConfig.images, fallbackFormat: 'png' };

            const jpgSrc = disSrc('jpg');
            render(<DynamicImage src={jpgSrc} alt="Test image" widths={[200]} />);

            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src');

            // Fallback should be converted to png
            expect(imgSrc).toContain('.png');
            expect(imgSrc).toContain('sfrm=jpg');
        });
    });

    describe('preload links', () => {
        describe('client-side', () => {
            test('does not call preload when priority is low (default)', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} />);
                expect(preloadMock).not.toHaveBeenCalled();
            });

            test('does not call preload when priority is low (explicit)', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} priority="low" />);
                expect(preloadMock).not.toHaveBeenCalled();
            });

            test('does not call preload (even though priority is high)', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} priority="high" />);
                expect(preloadMock).not.toHaveBeenCalled();
            });
        });

        describe('server-side', () => {
            beforeEach(() => {
                (isServer as Mock).mockReturnValue(true);
            });

            afterEach(() => {
                (isServer as Mock).mockReturnValue(false);
            });

            test('does not call preload when priority is low (default)', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} />);
                expect(preloadMock).not.toHaveBeenCalled();
            });

            test('does not call preload when priority is low (explicit)', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} priority="low" />);
                expect(preloadMock).not.toHaveBeenCalled();
            });

            test('calls preload for each link when priority is high', () => {
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} priority="high" />);
                expect(preloadMock).toHaveBeenCalledTimes(2);
                expect(preloadMock).toHaveBeenNthCalledWith(
                    1,
                    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=200&q=70&sfrm=jpg',
                    expect.objectContaining({
                        as: 'image',
                        fetchPriority: 'high',
                        imageSizes: '200px',
                        imageSrcSet:
                            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=200&q=70&sfrm=jpg 200w, https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=400&q=70&sfrm=jpg 400w',
                        media: '(max-width: 639px)',
                        type: 'image/webp',
                    })
                );
                expect(preloadMock).toHaveBeenNthCalledWith(
                    2,
                    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=400&q=70&sfrm=jpg',
                    expect.objectContaining({
                        as: 'image',
                        fetchPriority: 'high',
                        imageSizes: '400px',
                        imageSrcSet:
                            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=400&q=70&sfrm=jpg 400w, https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.webp?sw=800&q=70&sfrm=jpg 800w',
                        media: '(min-width: 640px)',
                        type: 'image/webp',
                    })
                );
            });

            test('preload href is the canonical 1x URL — not the srcSet — and unique per breakpoint', () => {
                // Browsers ignore href when imagesrcset is present, but React keys preload dedup on
                // (as, href). Passing the srcSet string as href would collapse distinct breakpoints
                // into one cache slot and break <link rel=preload> emission.
                render(<DynamicImage src={src} alt="Test image" widths={[200, 400]} priority="high" />);

                const [firstHref, firstOpts] = preloadMock.mock.calls[0] as [string, { imageSrcSet: string }];
                const [secondHref, secondOpts] = preloadMock.mock.calls[1] as [string, { imageSrcSet: string }];

                // Each href is a single URL — no comma-separated candidate list, no width descriptor.
                expect(firstHref).not.toContain(',');
                expect(firstHref).not.toMatch(/\s\d+w$/);
                expect(secondHref).not.toContain(',');
                expect(secondHref).not.toMatch(/\s\d+w$/);

                // Per-breakpoint canonical hrefs differ — preserves React's per-resource dedup.
                expect(firstHref).not.toBe(secondHref);

                // href appears as the 1x candidate inside the imageSrcSet for that breakpoint.
                expect(firstOpts.imageSrcSet.startsWith(`${firstHref} `)).toBe(true);
                expect(secondOpts.imageSrcSet.startsWith(`${secondHref} `)).toBe(true);
            });
        });
    });

    describe('DynamicImageContext integration', () => {
        beforeEach(() => {
            (useDynamicImageContext as Mock).mockReturnValue(null);
        });

        test('renders with default priority when no context is available', () => {
            render(<DynamicImage src={src} alt="Test image" />);

            const img = screen.getByRole('img');
            expect(img).toHaveAttribute('fetchpriority', 'auto');
            expect(img).toHaveAttribute('loading', 'lazy');
        });

        test('renders with high priority when context.hasSource returns true', () => {
            const mockHasSource = vi.fn().mockReturnValue(true);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test image" />);

            const img = screen.getByRole('img');
            expect(mockHasSource).toHaveBeenCalledWith(src);
            expect(img).toHaveAttribute('fetchpriority', 'high');
            expect(img).toHaveAttribute('loading', 'eager');
        });

        test('renders with default priority when context.hasSource returns false', () => {
            const mockHasSource = vi.fn().mockReturnValue(false);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test image" />);

            const img = screen.getByRole('img');
            expect(mockHasSource).toHaveBeenCalledWith(src);
            expect(img).toHaveAttribute('fetchpriority', 'auto');
            expect(img).toHaveAttribute('loading', 'lazy');
        });

        test('explicit priority prop overrides context-based priority', () => {
            const mockHasSource = vi.fn().mockReturnValue(true);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test image" priority="low" />);

            const img = screen.getByRole('img');
            // hasSource should not be called when priority is explicitly set
            expect(img).toHaveAttribute('fetchpriority', 'low');
            expect(img).toHaveAttribute('loading', 'lazy');
        });

        test('calls preload on server when context.hasSource returns true', () => {
            (isServer as Mock).mockReturnValue(true);
            const mockHasSource = vi.fn().mockReturnValue(true);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test image" widths={[200]} />);

            expect(preloadMock).toHaveBeenCalledTimes(1);
            expect(preloadMock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    as: 'image',
                    fetchPriority: 'high',
                })
            );
        });

        test('does not call preload on server when context.hasSource returns false', () => {
            (isServer as Mock).mockReturnValue(true);
            const mockHasSource = vi.fn().mockReturnValue(false);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test image" widths={[200]} />);

            expect(preloadMock).not.toHaveBeenCalled();
        });
    });

    describe('Page Designer Styling Props', () => {
        test('applies objectFit class to image', () => {
            render(<DynamicImage src={src} alt="Test" objectFit="contain" />);
            const img = screen.getByRole('img');
            expect(img.className).toContain('object-contain');
        });

        test('applies borderRadius class to wrapper', () => {
            render(<DynamicImage src={src} alt="Test" borderRadius="lg" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('rounded-lg');
        });

        test('applies boxShadow class to wrapper', () => {
            render(<DynamicImage src={src} alt="Test" boxShadow="xl" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('shadow-xl');
        });

        test('applies padding class to wrapper', () => {
            render(<DynamicImage src={src} alt="Test" padding="4" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('p-4');
        });

        test('applies margin class to wrapper', () => {
            render(<DynamicImage src={src} alt="Test" margin="2" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('m-2');
        });

        test('applies hoverEffect class to wrapper', () => {
            render(<DynamicImage src={src} alt="Test" hoverEffect="scale" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('hover:scale-105');
        });

        test('includes overflow-hidden only when borderRadius is applied', () => {
            // Without borderRadius, should not have overflow-hidden
            const { rerender } = render(<DynamicImage src={src} alt="Test" />);
            let wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toContain('overflow-hidden');

            // With borderRadius, should have overflow-hidden
            rerender(<DynamicImage src={src} alt="Test" borderRadius="lg" />);
            wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('overflow-hidden');
        });

        test('applies multiple styling props correctly', () => {
            render(
                <DynamicImage
                    src={src}
                    alt="Test"
                    objectFit="contain"
                    borderRadius="xl"
                    boxShadow="lg"
                    padding="4"
                    margin="2"
                    hoverEffect="scale"
                />
            );

            const wrapper = screen.getByRole('img').parentElement;
            const img = screen.getByRole('img');

            // Wrapper styles
            expect(wrapper?.className).toContain('rounded-xl');
            expect(wrapper?.className).toContain('shadow-lg');
            expect(wrapper?.className).toContain('p-4');
            expect(wrapper?.className).toContain('m-2');
            expect(wrapper?.className).toContain('hover:scale-105');
            expect(wrapper?.className).toContain('overflow-hidden');

            // Image styles
            expect(img.className).toContain('object-contain');
        });

        test('parses widths string from Page Designer', () => {
            render(<DynamicImage src={src} alt="Test" widths="400,800,1200" />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // Sources are in reverse breakpoint order: md (1200), sm (800), base (400)
            // Each contains 1x and 2x variants
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(3);

            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            expect(srcSets[0]).toContain('sw=1200');
            expect(srcSets[0]).toContain('sw=2400');
            expect(srcSets[1]).toContain('sw=800');
            expect(srcSets[1]).toContain('sw=1600');
            expect(srcSets[2]).toContain('sw=400');
            expect(srcSets[2]).toContain('sw=800');
        });

        test('parses heights string from Page Designer', () => {
            render(<DynamicImage src={src} alt="Test" heights="300,600,900" />);

            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // Heights-only: sources are in reverse breakpoint order (md, sm, base)
            // Each contains 1x and 2x variants for sh, no sw
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(3);

            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            // md breakpoint: heights=900, 1x sh=900, 2x sh=1800
            expect(srcSets[0]).toContain('sh=900');
            expect(srcSets[0]).toContain('sh=1800');
            expect(srcSets[0]).not.toContain('sw=');
            // sm breakpoint: heights=600, 1x sh=600, 2x sh=1200
            expect(srcSets[1]).toContain('sh=600');
            expect(srcSets[1]).toContain('sh=1200');
            expect(srcSets[1]).not.toContain('sw=');
            // base breakpoint: heights=300, 1x sh=300, 2x sh=600
            expect(srcSets[2]).toContain('sh=300');
            expect(srcSets[2]).toContain('sh=600');
            expect(srcSets[2]).not.toContain('sw=');
        });

        test('does not pass Page Designer props to DOM', () => {
            render(
                <DynamicImage
                    src={src}
                    alt="Test"
                    regionId="test-region"
                    component={{} as any}
                    componentData={{}}
                    designMetadata={{} as any}
                    data={{}}
                />
            );

            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper).not.toHaveAttribute('regionId');
            expect(wrapper).not.toHaveAttribute('component');
            expect(wrapper).not.toHaveAttribute('componentData');
            expect(wrapper).not.toHaveAttribute('designMetadata');
            expect(wrapper).not.toHaveAttribute('data');
        });
    });

    describe('styling fallback branches', () => {
        // Page Designer can publish enum values that drift from the type's literal union (e.g. a stale
        // metadata snapshot or a customer override). The component must not crash or emit a stray
        // arbitrary class — it falls back to the default.

        test('falls back to rounded-none for unknown borderRadius values but still adds overflow-hidden', () => {
            render(<DynamicImage src={src} alt="Test" borderRadius={'bogus' as any} />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).toContain('rounded-none');
            // Still a non-default borderRadius branch, so wrapper clips overflow.
            expect(wrapper?.className).toContain('overflow-hidden');
        });

        test('falls back to object-cover for unknown objectFit values', () => {
            render(<DynamicImage src={src} alt="Test" objectFit={'bogus' as any} />);
            const img = screen.getByRole('img');
            expect(img.className).toContain('object-cover');
        });

        test('does not emit a padding class when padding is "0"', () => {
            render(<DynamicImage src={src} alt="Test" padding="0" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toMatch(/(^|\s)p-\d/);
        });

        test('does not emit a margin class when margin is "0"', () => {
            render(<DynamicImage src={src} alt="Test" margin="0" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toMatch(/(^|\s)m-\d/);
        });

        test('does not emit a shadow class when boxShadow is "none"', () => {
            render(<DynamicImage src={src} alt="Test" boxShadow="none" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toContain('shadow-');
        });

        test('does not emit a hover class when hoverEffect is "none"', () => {
            render(<DynamicImage src={src} alt="Test" hoverEffect="none" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toContain('hover:');
            expect(wrapper?.className).not.toContain('transition-');
        });

        test('does not add overflow-hidden when borderRadius is "none"', () => {
            render(<DynamicImage src={src} alt="Test" borderRadius="none" />);
            const wrapper = screen.getByRole('img').parentElement;
            expect(wrapper?.className).not.toContain('overflow-hidden');
            expect(wrapper?.className).not.toContain('rounded-');
        });
    });

    describe('parseDimensionsString edge cases', () => {
        test('treats whitespace-only widths string as undefined and renders no <picture>', () => {
            render(<DynamicImage src={src} alt="Test" widths="   " />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.closest('picture')).not.toBeInTheDocument();
        });

        test('treats all-NaN widths string as undefined and renders no <picture>', () => {
            render(<DynamicImage src={src} alt="Test" widths="abc,xyz" />);
            const img = screen.getByRole('img');
            expect(img).toBeInTheDocument();
            expect(img.closest('picture')).not.toBeInTheDocument();
        });

        test('filters NaN tokens out of mixed widths string', () => {
            render(<DynamicImage src={src} alt="Test" widths="100,abc,200" />);
            const picture = screen.getByRole('img').closest('picture');
            expect(picture).toBeInTheDocument();

            // Two valid widths → two breakpoints/sources (sm first, then base).
            const sources = picture?.querySelectorAll('source');
            expect(sources).toHaveLength(2);
            const srcSets = Array.from(sources ?? []).map((s) => s.getAttribute('srcset'));
            expect(srcSets[0]).toContain('sw=200');
            expect(srcSets[1]).toContain('sw=100');
        });
    });

    describe('enableDis: false', () => {
        beforeEach(() => {
            mockConfigImages = { ...mockConfig.images, enableDis: false };
        });

        test('does not emit <source> elements even when widths are provided', () => {
            render(<DynamicImage src={src} alt="Test" widths={[200, 400]} />);
            const img = screen.getByRole('img');
            // No formats means no <source> children, but the wrapper may still create a <picture>
            // with zero sources — assert the source list is empty either way.
            const picture = img.closest('picture');
            const sources = picture?.querySelectorAll('source');
            expect(sources?.length ?? 0).toBe(0);
        });

        test('does not convert img src format (no sfrm parameter, original extension preserved)', () => {
            const pngSrc = 'https://cdn.example.com/image.png';
            render(<DynamicImage src={pngSrc} alt="Test" widths={[200]} />);
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src') ?? '';
            // replaceImageFormat is not applied → original .png extension survives, no sfrm rewrite.
            expect(imgSrc).not.toContain('sfrm=');
            expect(imgSrc).not.toContain('.webp');
        });

        test('does not pass quality through to img src', () => {
            mockConfigImages = { ...mockConfig.images, enableDis: false, quality: 85 };
            const externalSrc = 'https://cdn.example.com/image.jpg';
            render(<DynamicImage src={externalSrc} alt="Test" widths={[200]} />);
            const img = screen.getByRole('img');
            const imgSrc = img.getAttribute('src') ?? '';
            expect(imgSrc).not.toContain('q=85');
            expect(imgSrc).not.toContain('q=70');
        });
    });

    describe('local relative asset (Vite-bundled public path)', () => {
        // A relative `/images/...` path is a bundled asset the app serves directly. DIS can't
        // transform it (no SFCC host/realm), so even with enableDis=true the component must render
        // it verbatim — never rewrite to a non-existent `/images/hero-01.jpg?sfrm=webp`.
        const LOCAL_SRC = '/images/hero-01.webp';

        test('renders the img with the original relative src, not a DIS-rewritten .jpg', () => {
            render(<DynamicImage src={LOCAL_SRC} alt="Hero" widths={['100vw']} />);

            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).toBe(LOCAL_SRC);
        });

        test('does not emit responsive <source> variants for the un-transformable asset', () => {
            render(<DynamicImage src={LOCAL_SRC} alt="Hero" widths={['100vw']} />);

            const img = screen.getByRole('img');
            const sources = img.closest('picture')?.querySelectorAll('source');
            expect(sources?.length ?? 0).toBe(0);
        });

        test('still SSR-preloads the single local URL for a high-priority hero', () => {
            (isServer as Mock).mockReturnValue(true);

            render(<DynamicImage src={LOCAL_SRC} alt="Hero" widths={['100vw']} priority="high" />);

            expect(preloadMock).toHaveBeenCalledTimes(1);
            const [href, opts] = preloadMock.mock.calls[0] as [string, Record<string, unknown>];
            expect(href).toBe(LOCAL_SRC);
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });

            (isServer as Mock).mockReturnValue(false);
        });

        test('SSR-preloads the single local URL for a high-priority hero even without widths/heights', () => {
            // An LCP hero declared purely by priority — `<DynamicImage src="/images/hero.webp" priority="high" />`
            // with no dimensions — is still a valid preload candidate. There are no per-breakpoint links to emit, so
            // the fallback must preload the one URL the <img> resolves to; gating on widths/heights would silently
            // skip it.
            (isServer as Mock).mockReturnValue(true);

            render(<DynamicImage src={LOCAL_SRC} alt="Hero" priority="high" />);

            expect(preloadMock).toHaveBeenCalledTimes(1);
            const [href, opts] = preloadMock.mock.calls[0] as [string, Record<string, unknown>];
            expect(href).toBe(LOCAL_SRC);
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });

            (isServer as Mock).mockReturnValue(false);
        });
    });

    describe('imageProps precedence', () => {
        test('merges imageProps.className with the computed object-fit class', () => {
            render(
                <DynamicImage
                    src={src}
                    alt="Test"
                    objectFit="contain"
                    imageProps={{ className: 'custom-img-class' } as any}
                />
            );
            const img = screen.getByRole('img');
            expect(img.className).toContain('object-contain');
            expect(img.className).toContain('custom-img-class');
        });

        test('alt prop overrides imageProps.alt', () => {
            render(<DynamicImage src={src} alt="prop alt" imageProps={{ alt: 'imageProps alt' } as any} />);
            const img = screen.getByRole('img');
            expect(img).toHaveAttribute('alt', 'prop alt');
        });

        test('component-computed src overrides imageProps.src', () => {
            const otherSrc = 'https://cdn.example.com/other.jpg';
            render(<DynamicImage src={src} alt="Test" imageProps={{ src: otherSrc } as any} />);
            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).not.toBe(otherSrc);
        });

        test('effective loading overrides imageProps.loading', () => {
            // priority="high" → effectiveLoading is "eager"; imageProps.loading="lazy" should be ignored.
            render(<DynamicImage src={src} alt="Test" priority="high" imageProps={{ loading: 'lazy' } as any} />);
            const img = screen.getByRole('img');
            expect(img).toHaveAttribute('loading', 'eager');
        });

        test('effective fetchPriority overrides imageProps.fetchPriority', () => {
            render(<DynamicImage src={src} alt="Test" priority="low" imageProps={{ fetchPriority: 'high' } as any} />);
            const img = screen.getByRole('img');
            expect(img).toHaveAttribute('fetchpriority', 'low');
        });
    });

    describe('DynamicImageContext: hasSource called with transformed src', () => {
        test('calls hasSource with the DIS-rewritten URL, not the raw src', () => {
            const rawSrc =
                'https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';
            const mockHasSource = vi.fn().mockReturnValue(false);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={rawSrc} alt="Test" />);

            expect(mockHasSource).toHaveBeenCalledTimes(1);
            const callArg = mockHasSource.mock.calls[0][0] as string;
            // The transformed URL is what's emitted on the <img>; hasSource is keyed off the same value.
            expect(callArg).toContain('edge.disstg.commercecloud.salesforce.com');
            expect(callArg).toContain('/dw/image/v2/DEMO_001/');
            expect(callArg).not.toContain('demo-001.dx.commercecloud.salesforce.com');
        });

        test('does not call hasSource when priority is explicitly set', () => {
            const mockHasSource = vi.fn().mockReturnValue(true);
            (useDynamicImageContext as Mock).mockReturnValue({
                hasSource: mockHasSource,
                addSource: vi.fn(),
            });

            render(<DynamicImage src={src} alt="Test" priority="low" />);

            // `priority ?? (...)` short-circuits — hasSource must not run.
            expect(mockHasSource).not.toHaveBeenCalled();
        });
    });

    describe('server-side preload edge cases', () => {
        beforeEach(() => {
            (isServer as Mock).mockReturnValue(true);
        });

        afterEach(() => {
            (isServer as Mock).mockReturnValue(false);
        });

        test('preloads the single static URL when priority is high but no widths/heights are provided', () => {
            // No responsive dimensions → no per-breakpoint links, but a high-priority hero declared by priority
            // alone is still a valid LCP candidate. The fallback preloads the one URL the <img> resolves to rather
            // than emitting nothing.
            render(<DynamicImage src={src} alt="Test" priority="high" />);

            expect(preloadMock).toHaveBeenCalledTimes(1);
            const [href, opts] = preloadMock.mock.calls[0] as [string, Record<string, unknown>];
            // The <img> renders the DIS base URL verbatim: no dimensions means no format conversion (fallbackFormat
            // 'jpg' is a no-op on a .jpg), so the preload href matches the rendered src exactly.
            expect(href).toBe(src);
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });
        });

        test('preloads the single static URL when DIS is disabled but dimensions are requested', () => {
            // Workspace envs disable DIS → no per-breakpoint links, but a high-priority hero should
            // still preload its one static variant rather than emitting nothing.
            mockConfigImages = { ...mockConfig.images, enableDis: false };
            render(<DynamicImage src={src} alt="Test" widths={[200, 400]} priority="high" />);

            expect(preloadMock).toHaveBeenCalledTimes(1);
            const [href, opts] = preloadMock.mock.calls[0] as [string, Record<string, unknown>];
            // DIS off → `toImageUrl` strips the `/dw/image/v2/{realm}/` prefix to a relative static path
            // (served directly by the dev server/proxy), so the preload href is that path, not the full DIS `src`.
            expect(href).toBe(
                '/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/PG.10216885.JJ169XX.PZ.jpg'
            );
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high' });
        });
    });

    describe('wrapper ...rest spread', () => {
        test('passes through extra HTML attributes (data-*, id, style) to the wrapper element', () => {
            render(
                <DynamicImage
                    src={src}
                    alt="Test"
                    {...({ 'data-testid': 'wrapper', id: 'wrap-id', style: { display: 'block' } } as any)}
                />
            );
            const wrapper = screen.getByTestId('wrapper');
            expect(wrapper).toHaveAttribute('id', 'wrap-id');
            expect(wrapper).toHaveStyle({ display: 'block' });
        });
    });

    describe('Page Designer image object normalization', () => {
        test('falls through to url when absURL is empty string', () => {
            // SFCC sometimes emits an image object with absURL set to '' — the resolver must skip the
            // falsy value and use the next non-empty URL property.
            render(<DynamicImage src={{ absURL: '', url: src } as unknown as string} alt="Test" />);
            const img = screen.getByRole('img');
            expect(img.getAttribute('src')).toBeTruthy();
            // Whatever DIS-rewriting happens, the image must end up rendering — i.e., the empty absURL
            // didn't short-circuit the fallback chain.
            expect(img).toBeInTheDocument();
        });
    });
});
