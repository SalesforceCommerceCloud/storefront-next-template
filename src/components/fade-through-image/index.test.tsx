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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

// Compose over DynamicImage rather than re-test it — mock it to a bare <img> that forwards `imageProps`
// exactly as the real component does (spreads `{...imageProps}`, so className/onLoad/onTransitionEnd/aria reach the DOM).
vi.mock('@/components/dynamic-image', () => ({
    DynamicImage: ({ src, alt, imageProps }: { src: string; alt?: string; imageProps?: Record<string, unknown> }) => (
        <img data-testid="layer" src={src} alt={alt ?? ''} {...imageProps} />
    ),
}));

import { FadeThroughImage } from './index';

const layers = () => screen.getAllByTestId('layer') as HTMLImageElement[];

beforeEach(() => {
    // jsdom has no matchMedia — default it to "motion allowed" (matches:false).
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
});
afterEach(cleanup);

describe('FadeThroughImage (sequenced fade-out → fade-in)', () => {
    it('renders the current src immediately on first paint (single layer, opaque, no fade)', () => {
        render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
        const imgs = layers();
        expect(imgs).toHaveLength(1);
        expect(imgs[0]).toHaveAttribute('src', 'hero-1.jpg');
        expect(imgs[0]).toHaveAttribute('alt', 'Watch');
        expect(imgs[0].className).toContain('opacity-100');
    });

    it('fades the old out first, holds the new hidden until the old is gone, then fades the new in and promotes', async () => {
        const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);

        // Swap → old begins fading OUT; new mounts hidden (opacity-0, aria-hidden) and preloads.
        rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);
        const imgs = layers();
        expect(imgs).toHaveLength(2);
        const [oldLayer, newLayer] = imgs;
        expect(oldLayer).toHaveAttribute('src', 'hero-1.jpg');
        expect(oldLayer.className).toContain('opacity-0'); // fading out
        expect(newLayer).toHaveAttribute('src', 'hero-2.jpg');
        expect(newLayer.className).toContain('opacity-0'); // hidden
        expect(newLayer).toHaveAttribute('aria-hidden', 'true');

        // New finishes loading BEFORE the old has faded out → it must NOT start fading in yet.
        fireEvent.load(newLayer);
        await Promise.resolve();
        expect(newLayer.className).toContain('opacity-0'); // still hidden — fade-in waits for fade-out

        // Old finishes fading out → NOW the new fades in.
        fireEvent.transitionEnd(oldLayer, { propertyName: 'opacity' });
        await waitFor(() => expect(newLayer.className).toContain('opacity-100'));

        // New finishes fading in → promoted; only the new layer remains, fully opaque.
        fireEvent.transitionEnd(newLayer, { propertyName: 'opacity' });
        await waitFor(() => {
            const finalImgs = layers();
            expect(finalImgs).toHaveLength(1);
            expect(finalImgs[0]).toHaveAttribute('src', 'hero-2.jpg');
            expect(finalImgs[0].className).toContain('opacity-100');
        });
    });

    it('swaps instantly (no fades) under prefers-reduced-motion', async () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
        rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);

        // Old is held (not faded out); new preloads then promotes on load — no transition needed.
        const newLayer = layers().filter((i) => i.getAttribute('src') === 'hero-2.jpg')[0];
        expect(newLayer).toBeTruthy();
        fireEvent.load(newLayer);
        await waitFor(() => {
            const finalImgs = layers();
            expect(finalImgs).toHaveLength(1);
            expect(finalImgs[0]).toHaveAttribute('src', 'hero-2.jpg');
        });
    });

    it('ignores transitionEnd for properties other than opacity', async () => {
        const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
        rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);
        const [oldLayer] = layers();
        // A non-opacity transitionEnd on the old layer must NOT advance the sequence.
        fireEvent.transitionEnd(oldLayer, { propertyName: 'transform' });
        await new Promise((r) => setTimeout(r, 40));
        expect(layers()).toHaveLength(2); // still mid-transition
    });

    const bySrc = (src: string) => layers().filter((i) => i.getAttribute('src') === src)[0];

    it('promotes the latest src after a rapid swap that lands once the old layer has already faded out', async () => {
        // Regression: once the old layer is gone it emits no further transitionEnd, so a swap arriving at
        // that moment must NOT reset the fade-out state — otherwise the newest image never fades in and the
        // hero is stranded transparent.
        const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
        rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);

        // Old fades fully out while hero-2 is still loading (do NOT load it — a scheduled fade-in frame
        // would otherwise mask the stuck-state this guards).
        fireEvent.transitionEnd(bySrc('hero-1.jpg'), { propertyName: 'opacity' });

        // A third src arrives before hero-2 loaded / was promoted.
        rerender(<FadeThroughImage src="hero-3.jpg" alt="Watch" />);
        const layer3 = bySrc('hero-3.jpg');
        expect(layer3).toBeTruthy();

        fireEvent.load(layer3);
        await waitFor(() => expect(layer3.className).toContain('opacity-100')); // fades in (not stuck)
        fireEvent.transitionEnd(layer3, { propertyName: 'opacity' });
        await waitFor(() => {
            const finalImgs = layers();
            expect(finalImgs).toHaveLength(1);
            expect(finalImgs[0]).toHaveAttribute('src', 'hero-3.jpg');
            expect(finalImgs[0].className).toContain('opacity-100');
        });
    });

    it('cancels a superseded fade-in frame so a newer image is not revealed before it loads', () => {
        // Regression: a scheduled fade-in frame must be cancelled when a new src supersedes it, or the
        // stale frame flips the incoming layer visible before the newer image's onLoad has fired.
        const rafQueue: Array<() => void> = [];
        const rafMock = vi.fn((cb: FrameRequestCallback) => {
            rafQueue.push(() => cb(0));
            return rafQueue.length; // 1-based handle
        });
        const cafMock = vi.fn((id: number) => {
            rafQueue[id - 1] = () => {}; // drop the cancelled frame
        });
        vi.stubGlobal('requestAnimationFrame', rafMock);
        vi.stubGlobal('cancelAnimationFrame', cafMock);
        try {
            const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
            rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);
            fireEvent.load(bySrc('hero-2.jpg'));
            fireEvent.transitionEnd(bySrc('hero-1.jpg'), { propertyName: 'opacity' }); // schedules the fade-in
            expect(rafQueue).toHaveLength(1);

            // Supersede with hero-3 before the frame runs.
            rerender(<FadeThroughImage src="hero-3.jpg" alt="Watch" />);
            expect(cafMock).toHaveBeenCalled();

            // Run everything queued: the cancelled frame is now a no-op and must not reveal hero-3.
            for (const fn of rafQueue) fn();
            const layer3 = bySrc('hero-3.jpg');
            expect(layer3.className).toContain('opacity-0'); // still hidden — hero-3 has not loaded
            expect(layer3).toHaveAttribute('aria-hidden', 'true');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('restores the current image when the incoming image fails to load', async () => {
        // Regression: without an onError path a failed incoming load leaves the sequence waiting forever with
        // both layers transparent. The current image must be restored instead.
        const { rerender } = render(<FadeThroughImage src="hero-1.jpg" alt="Watch" />);
        rerender(<FadeThroughImage src="hero-2.jpg" alt="Watch" />);

        fireEvent.transitionEnd(bySrc('hero-1.jpg'), { propertyName: 'opacity' }); // old faded out, awaiting the new
        fireEvent.error(bySrc('hero-2.jpg')); // the incoming image fails (e.g. 404)

        await waitFor(() => {
            const finalImgs = layers();
            expect(finalImgs).toHaveLength(1);
            expect(finalImgs[0]).toHaveAttribute('src', 'hero-1.jpg'); // current image kept
            expect(finalImgs[0].className).toContain('opacity-100'); // and made visible again
        });
    });

    it('server-renders the current image without throwing (SSR-safe)', () => {
        const html = renderToString(<FadeThroughImage src="ssr-hero.jpg" alt="SSR Watch" />);
        expect(html).toContain('data-slot="fade-through-image"');
        expect(html).toContain('ssr-hero.jpg');
        expect(html).toContain('alt="SSR Watch"');
    });

    it('forwards className to the wrapper and imageProps to the image', () => {
        render(
            <FadeThroughImage
                src="hero.jpg"
                alt="Watch"
                className="aspect-square w-full"
                imageProps={{ decoding: 'async' }}
            />
        );
        const wrapper = screen.getByTestId('layer').parentElement;
        expect(wrapper?.className).toContain('aspect-square');
        expect(wrapper?.className).toContain('w-full');
        expect(screen.getByTestId('layer')).toHaveAttribute('decoding', 'async');
    });
});
