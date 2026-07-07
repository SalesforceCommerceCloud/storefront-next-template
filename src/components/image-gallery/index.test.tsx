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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import ImageGallery, { type GalleryImage } from './index';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

const preloadMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom', async () => {
    const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
    return { ...actual, preload: preloadMock };
});

void i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
        'en-US': {
            common: {
                noImageAvailable: 'No Image Available',
                previousImage: 'Previous Image',
                nextImage: 'Next Image',
            },
            product: {
                imageAlt: 'Product Image',
            },
        },
    },
});

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        ConfigProvider,
        { config: mockConfig } as never,
        createElement(I18nextProvider, { i18n: i18next }, children)
    );

// DIS-eligible base URL (already on the imaging host with a `/dw/image/v2/{realm}/` prefix). DIS
// resizing (`sw=`), format conversion, and quality only apply to URLs carrying this prefix — a bare
// third-party host (`example.com`) has no derivable realm, so the resolver serves it verbatim and
// emits no responsive `<source>`s. Gallery tests that assert `sw=` widths must use one.
const disSrc = (name: string) =>
    `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/${name}.jpg`;

const mockImages: GalleryImage[] = [
    { src: disSrc('image1'), alt: 'Image 1' },
    { src: disSrc('image2'), alt: 'Image 2' },
    { src: disSrc('image3'), alt: 'Image 3' },
    { src: disSrc('image4'), alt: 'Image 4' },
    { src: disSrc('image5'), alt: 'Image 5' },
];

// Six entries lets us assert the cap behavior: image1 is the selected slide, image2..5 fall within
// EAGER_PRELOAD_LIMIT (4), and image6 is beyond it — i.e., promoted only on hover/focus intent.
const beyondCapImages: GalleryImage[] = [...mockImages, { src: disSrc('image6'), alt: 'Image 6' }];

describe('ImageGallery - off-screen image preloading', () => {
    beforeEach(() => {
        preloadMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('preloads off-screen images via react-dom preload() with low priority', async () => {
        render(<ImageGallery images={mockImages} />, { wrapper });

        // EAGER_PRELOAD_LIMIT=4 → up to image2..5 staged across consecutive idle frames.
        await waitFor(() => {
            const previewedHrefs = preloadMock.mock.calls
                .filter(([, opts]) => opts?.as === 'image')
                .map(([href]) => String(href))
                .join(' | ');
            expect(previewedHrefs).toContain('image2');
            expect(previewedHrefs).toContain('image3');
            expect(previewedHrefs).toContain('image4');
            expect(previewedHrefs).toContain('image5');
        });

        const imagePreloadCalls = preloadMock.mock.calls.filter(([, opts]) => opts?.as === 'image');
        const previewedHrefs = imagePreloadCalls.map(([href]) => String(href)).join(' | ');
        expect(previewedHrefs).not.toContain('image1'); // selected slide is already rendered

        for (const [, opts] of imagePreloadCalls) {
            expect(opts).toMatchObject({ as: 'image', fetchPriority: 'low' });
            // Each preload call mirrors a <source> from <DynamicImage>: imageSrcSet
            // and imageSizes are populated, type is set. The helper rewrites URLs
            // through DIS (webp, sw=…, sfrm=jpg).
            expect(typeof opts.imageSrcSet).toBe('string');
            expect(opts.imageSrcSet).toMatch(/\bsw=\d+/); // DIS scale-width param
            expect(typeof opts.imageSizes).toBe('string');
            expect(opts.type).toMatch(/^image\//);
        }
    });

    it('skips preloading when there is only a single image', () => {
        const singleImage: GalleryImage[] = [
            {
                src: 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/single.jpg',
                alt: 'Single Image',
            },
        ];

        render(<ImageGallery images={singleImage} />, { wrapper });

        expect(preloadMock).not.toHaveBeenCalled();
    });

    it('defers preload registration to a post-hydration idle frame', () => {
        // Stub requestIdleCallback with a no-op so the deferred work never fires. cancelIdleCallback must
        // also be stubbed because the hook returns a cleanup that calls it on unmount.
        const ricStub = vi.fn(() => 1);
        const cicStub = vi.fn();
        vi.stubGlobal('requestIdleCallback', ricStub);
        vi.stubGlobal('cancelIdleCallback', cicStub);

        render(<ImageGallery images={mockImages} />, { wrapper });

        // The component mounted; the preload effect's gate (shouldPreload) is still false because the
        // idle callback hasn't been invoked. preload() must not have run.
        expect(preloadMock).not.toHaveBeenCalled();
        expect(ricStub).toHaveBeenCalled();

        // Unmount synchronously while the stubs are still in place so the hook's cleanup can call
        // cancelIdleCallback. Otherwise React's deferred passive-effect cleanup would run after
        // afterEach has already torn down the global stubs and trigger ReferenceError.
        cleanup();
    });

    it('renders main image and a thumbnail per gallery item', () => {
        render(<ImageGallery images={mockImages} productName="Test Product" />, { wrapper });

        expect(screen.getAllByAltText('Image 1').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button').length).toBe(mockImages.length);
    });

    it('caps eager preloads to EAGER_PRELOAD_LIMIT (4) regardless of how many off-screen images exist', async () => {
        render(<ImageGallery images={beyondCapImages} />, { wrapper });

        await waitFor(() => {
            const previewedHrefs = preloadMock.mock.calls
                .filter(([, opts]) => opts?.as === 'image')
                .map(([href]) => String(href))
                .join(' | ');
            // Cap is 4: image2..5 are staged eagerly; image6 is deferred to hover/focus intent.
            expect(previewedHrefs).toContain('image2');
            expect(previewedHrefs).toContain('image5');
        });

        const previewedHrefs = preloadMock.mock.calls
            .filter(([, opts]) => opts?.as === 'image')
            .map(([href]) => String(href))
            .join(' | ');

        expect(previewedHrefs).toContain('image3');
        expect(previewedHrefs).toContain('image4');
        expect(previewedHrefs).not.toContain('image6');
        // The selected slide is not eagerly preloaded — DynamicImage handles it.
        expect(previewedHrefs).not.toContain('image1');
    });

    // Connection-aware skips: render the gallery, let React flush the deferred idle frame inside act(),
    // then verify no image preloads were registered. waitFor polls inside act so any state update from
    // useDeferredRender is flushed before assertion.
    const expectNoEagerPreloads = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        const imagePreloadCalls = preloadMock.mock.calls.filter(([, opts]) => opts?.as === 'image');
        expect(imagePreloadCalls).toHaveLength(0);
    };

    it('skips eager preloading when navigator.connection.saveData is true', async () => {
        vi.stubGlobal('navigator', {
            ...globalThis.navigator,
            connection: { saveData: true },
        });

        render(<ImageGallery images={mockImages} />, { wrapper });

        await expectNoEagerPreloads();
    });

    it('promotes a beyond-the-cap slide on thumbnail hover (pointerEnter)', async () => {
        render(<ImageGallery images={beyondCapImages} />, { wrapper });

        // Wait for the initial eager-preload pass to settle so we can measure the delta cleanly.
        await waitFor(() => {
            expect(preloadMock).toHaveBeenCalled();
        });
        preloadMock.mockClear();

        const buttons = screen.getAllByRole('button');
        // Index 5 is image6, which the cap excluded from the eager preload.
        fireEvent.pointerEnter(buttons[5]);

        const promotedHrefs = preloadMock.mock.calls
            .filter(([, opts]) => opts?.as === 'image')
            .map(([href]) => String(href))
            .join(' | ');
        expect(promotedHrefs).toContain('image6');
    });

    it('promotes a beyond-the-cap slide on thumbnail focus', async () => {
        render(<ImageGallery images={beyondCapImages} />, { wrapper });

        await waitFor(() => {
            expect(preloadMock).toHaveBeenCalled();
        });
        preloadMock.mockClear();

        const buttons = screen.getAllByRole('button');
        // Index 5 is image6, which the cap excluded from the eager preload — mirrors the pointer test.
        fireEvent.focus(buttons[5]);

        const promotedHrefs = preloadMock.mock.calls
            .filter(([, opts]) => opts?.as === 'image')
            .map(([href]) => String(href))
            .join(' | ');
        expect(promotedHrefs).toContain('image6');
    });
});

// Thumb sources are routed through <DynamicImage>, which builds a <picture> with one <source> per
// breakpoint (deduped where consecutive widths are equal). The cell width peaks in the `md` range
// (PDP is still single-column) and falls back at `lg+`, so the grid uses the object form
// `{ base, sm, md, lg }` while the fixed-size horizontal strip stays on the simpler array form.
describe('ImageGallery - thumbnail responsive sources', () => {
    // Thumbnail buttons carry `data-index`; the main slide does not. Scoping to those buttons keeps the
    // negative assertions about main-image widths (`sw=680`) honest.
    const collectThumbSrcSets = (container: HTMLElement): string =>
        Array.from(container.querySelectorAll('button[data-index] picture source'))
            .map((s) => s.getAttribute('srcset') || '')
            .join(' | ');

    // Sources outside any thumbnail button — i.e., the main slide's <picture>. Mirrors the inverse of
    // `collectThumbSrcSets` so positive assertions about main-image widths can be made cleanly.
    const collectMainSrcSets = (container: HTMLElement): string =>
        Array.from(container.querySelectorAll('picture source'))
            .filter((s) => !s.closest('button[data-index]'))
            .map((s) => s.getAttribute('srcset') || '')
            .join(' | ');

    it('renders grid thumbnails as <picture> with breakpoint-mapped sw= values', () => {
        const { container } = render(<ImageGallery images={mockImages} />, { wrapper });

        // One <picture> per thumbnail (5 images → 5 thumbs). The main slide also renders via
        // <DynamicImage>, but its widths are exercised in the dedicated main-image test below.
        expect(container.querySelectorAll('button[data-index] picture').length).toBe(mockImages.length);

        const thumbSrcSets = collectThumbSrcSets(container);
        // DEFAULT_WIDTHS_THUMBNAIL_GRID = { base: 144, sm: 176, md: 240, lg: 168 }. The `md` peak is
        // the value most likely to regress if someone collapses the object back to a simple array.
        expect(thumbSrcSets).toMatch(/\bsw=240\b/);
        expect(thumbSrcSets).toMatch(/\bsw=144\b/);
        expect(thumbSrcSets).toMatch(/\bsw=176\b/);
        expect(thumbSrcSets).toMatch(/\bsw=168\b/);
        // Sanity: a thumb must never end up requesting the main-image scale-width (680px). If it
        // does, the migration accidentally fell back to the main-image widths or to no widths at all.
        expect(thumbSrcSets).not.toMatch(/\bsw=680\b/);
    });

    it('renders the main image with the responsive default widths (100vw below lg, 50vw at lg/xl, capped at 680)', () => {
        // DEFAULT_WIDTHS_MAIN = { base: '100vw', lg: '50vw', '2xl': 680 }. Tailwind breakpoints
        // resolve `100vw` → 640 (base/sm), 768 (sm), 1024 (md); `50vw` → 640 (lg), 768 (xl); the
        // `2xl` cap pins 680. Each rung also produces a 2x DPR variant in the same srcset
        // (descriptors `Nw, 2Nw`). Asserting the four headline rungs guards against a regression
        // back to the old flat `['100vw', '680px']` shape that under-sized the main image at md
        // (gallery received 680px when it needed ~960).
        const { container } = render(<ImageGallery images={mockImages} />, { wrapper });

        const mainSrcSets = collectMainSrcSets(container);
        expect(mainSrcSets).toMatch(/\bsw=640\b/);
        expect(mainSrcSets).toMatch(/\bsw=768\b/);
        expect(mainSrcSets).toMatch(/\bsw=1024\b/);
        expect(mainSrcSets).toMatch(/\bsw=680\b/);
    });

    it('renders horizontal-strip thumbnails with the small fixed widths and shows scroll arrows when overflowing', () => {
        // 5 images > 4 triggers the optional left/right scroll buttons in the strip layout.
        const { container } = render(<ImageGallery images={mockImages} horizontalThumbnails />, { wrapper });

        // Thumb buttons + 2 scroll buttons. The scroll buttons carry localized aria-labels.
        expect(screen.getAllByRole('button').length).toBe(mockImages.length + 2);
        expect(screen.getByRole('button', { name: 'Previous Image' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next Image' })).toBeInTheDocument();

        const thumbSrcSets = collectThumbSrcSets(container);
        // DEFAULT_WIDTHS_THUMBNAIL_STRIP = [64, 80]. Both must show up; the grid `md` peak must not.
        expect(thumbSrcSets).toMatch(/\bsw=64\b/);
        expect(thumbSrcSets).toMatch(/\bsw=80\b/);
        expect(thumbSrcSets).not.toMatch(/\bsw=240\b/);
        expect(thumbSrcSets).not.toMatch(/\bsw=680\b/);
    });

    it('does not render the strip scroll arrows when there are 4 or fewer thumbnails', () => {
        const fourImages = mockImages.slice(0, 4);
        render(<ImageGallery images={fourImages} horizontalThumbnails />, { wrapper });

        // Only the 4 thumb buttons — the scroll arrows are gated on `images.length > 4`.
        expect(screen.getAllByRole('button').length).toBe(fourImages.length);
        expect(screen.queryByRole('button', { name: 'Previous Image' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next Image' })).not.toBeInTheDocument();
    });

    it('honors per-callsite widths overrides for main image and thumbnails', () => {
        // Mirrors how a narrow consumer (modal, card cell) sizes the gallery — main capped at 420,
        // thumbs at 96. Defaults would otherwise emit PDP-sized widths and oversize the requests.
        const { container } = render(
            <ImageGallery
                images={mockImages}
                widths={{
                    main: { base: 360, md: 420 },
                    thumbnail: { base: 80, md: 96 },
                }}
            />,
            { wrapper }
        );

        const thumbSrcSets = collectThumbSrcSets(container);
        expect(thumbSrcSets).toMatch(/\bsw=80\b/);
        expect(thumbSrcSets).toMatch(/\bsw=96\b/);
        // Default thumb widths must not leak through when the consumer overrides.
        expect(thumbSrcSets).not.toMatch(/\bsw=240\b/);

        const mainSrcSets = collectMainSrcSets(container);
        expect(mainSrcSets).toMatch(/\bsw=360\b/);
        expect(mainSrcSets).toMatch(/\bsw=420\b/);
        // Default main widths must not leak through alongside the override.
        expect(mainSrcSets).not.toMatch(/\bsw=680\b/);
    });

    it('keeps default thumbnail widths when only main is overridden', () => {
        // Partial overrides are explicitly supported via `widths?.thumbnail ?? DEFAULT_WIDTHS_THUMBNAIL_GRID`.
        // A consumer that cares only about the main image (e.g. cart-item-modal, where thumbs use the
        // fixed-CSS strip) must not accidentally clobber the grid-thumbnail defaults.
        const { container } = render(
            <ImageGallery images={mockImages} widths={{ main: { base: '100vw', md: 420 } }} />,
            { wrapper }
        );

        const thumbSrcSets = collectThumbSrcSets(container);
        // Defaults from DEFAULT_WIDTHS_THUMBNAIL_GRID = { base: 144, sm: 176, md: 240, lg: 168 } apply.
        expect(thumbSrcSets).toMatch(/\bsw=240\b/);
        expect(thumbSrcSets).toMatch(/\bsw=168\b/);

        const mainSrcSets = collectMainSrcSets(container);
        expect(mainSrcSets).toMatch(/\bsw=420\b/);
        // The default main cap (680) is not requested when the consumer overrides main.
        expect(mainSrcSets).not.toMatch(/\bsw=680\b/);
    });

    it('keeps default main widths when only thumbnail is overridden', () => {
        // Inverse partial-override: a consumer that wants the PDP-shaped main image but tighter
        // thumbnails (or vice versa) must get the unmodified default for the other side.
        const { container } = render(
            <ImageGallery images={mockImages} widths={{ thumbnail: { base: 80, md: 96 } }} />,
            { wrapper }
        );

        const thumbSrcSets = collectThumbSrcSets(container);
        expect(thumbSrcSets).toMatch(/\bsw=80\b/);
        expect(thumbSrcSets).toMatch(/\bsw=96\b/);
        // Default grid-thumbnail widths must not leak through.
        expect(thumbSrcSets).not.toMatch(/\bsw=240\b/);

        const mainSrcSets = collectMainSrcSets(container);
        // DEFAULT_WIDTHS_MAIN still in effect: 100vw → 640/768/1024, '2xl' → 680.
        expect(mainSrcSets).toMatch(/\bsw=640\b/);
        expect(mainSrcSets).toMatch(/\bsw=1024\b/);
        expect(mainSrcSets).toMatch(/\bsw=680\b/);
    });
});

describe('ImageGallery - off-screen preload widths', () => {
    beforeEach(() => {
        preloadMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preloads off-screen slides using the overridden main widths (canonical-href consistency)', async () => {
        // The preload path and the render path must share URL math — `preloadDynamicImage` funnels
        // through the same `resolveDynamicImageAttributes` helper that <DynamicImage> uses, so a
        // `widths.main` override at the callsite must propagate to preloads as well. Otherwise the
        // browser cache key the preload populates wouldn't match the cell that later renders the
        // slide, defeating the preload entirely.
        render(
            <ImageGallery
                images={mockImages}
                widths={{
                    main: { base: 360, md: 420 },
                    thumbnail: { base: 80, md: 96 },
                }}
            />,
            { wrapper }
        );

        await waitFor(() => {
            expect(preloadMock).toHaveBeenCalled();
        });

        const imagePreloadCalls = preloadMock.mock.calls.filter(([, opts]) => opts?.as === 'image');
        const previewedSrcSets = imagePreloadCalls.map(([, opts]) => String(opts.imageSrcSet ?? '')).join(' | ');
        // Override widths show up in preload srcset…
        expect(previewedSrcSets).toMatch(/\bsw=360\b/);
        expect(previewedSrcSets).toMatch(/\bsw=420\b/);
        // …and the default main cap does not.
        expect(previewedSrcSets).not.toMatch(/\bsw=680\b/);
    });
});
