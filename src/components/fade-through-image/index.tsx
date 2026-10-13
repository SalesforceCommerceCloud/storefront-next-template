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
import { type ImgHTMLAttributes, type SyntheticEvent, type TransitionEvent, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DynamicImage } from '@/components/dynamic-image';
import type { DynamicImageDimensions } from '@/lib/images/dynamic-image';

/**
 * "Fade through" image for variant swaps (Material Design motion pattern): the outgoing image fades OUT
 * first, then the incoming image fades IN (fade-in starts only after the fade-out completes). The incoming
 * image is preloaded during the fade-out — via a hidden layer — so the fade-in begins immediately with no
 * wait, and there's no low-res placeholder artifact. First paint shows the image instantly (no fade-in →
 * LCP-friendly); the sequence only runs on subsequent swaps. Reduced-motion → an instant swap once ready.
 *
 * Composes {@link DynamicImage} for each layer, reusing the full DIS/responsive/preload pipeline.
 */
export interface FadeThroughImageProps {
    /** Full-res image source (already resolved to a DIS/absolute URL upstream). */
    src: string;
    alt?: string;
    /** Responsive widths forwarded to the composed {@link DynamicImage}. */
    widths?: DynamicImageDimensions | string;
    /** Fetch priority forwarded to {@link DynamicImage}; the PDP hero passes `'high'`. */
    priority?: HTMLImageElement['fetchPriority'];
    /** Wrapper classes — MUST establish the box size (e.g. `aspect-square w-full`) since both layers are absolute. */
    className?: string;
    /** Extra props merged onto the visible `<img>` (composes cleanly — `DynamicImage` spreads `imageProps`). */
    imageProps?: ImgHTMLAttributes<HTMLImageElement>;
}

export function FadeThroughImage({ src, alt = '', widths, priority, className, imageProps }: FadeThroughImageProps) {
    // `shownSrc` is the fully-visible image. On a swap it fades out; meanwhile `nextSrc` preloads (hidden);
    // once the old is out AND the new is loaded, the new fades in and is promoted to `shownSrc`.
    const [shownSrc, setShownSrc] = useState(src);
    const [nextSrc, setNextSrc] = useState<string | null>(null);
    const [oldShown, setOldShown] = useState(true); // current layer opacity: true=1 (shown), false=0 (faded out)
    const [newIn, setNewIn] = useState(false); // incoming layer opacity: true=1 (faded in), false=0 (hidden/loading)
    const [motion, setMotion] = useState(true);

    const outDone = useRef(false);
    const nextLoaded = useRef(false);
    // Mirrors `oldShown` so the swap effect can read the current layer's visibility without listing
    // `oldShown` as a dependency (which would re-fire the swap logic mid-transition).
    const oldShownRef = useRef(true);
    // Handle of the pending fade-in frame, so it can be cancelled when a swap supersedes it — otherwise
    // a stale frame could reveal a newer (possibly not-yet-loaded) image.
    const raf = useRef<number | null>(null);

    const showOldLayer = (shown: boolean) => {
        oldShownRef.current = shown;
        setOldShown(shown);
    };

    const cancelFadeIn = () => {
        if (raf.current !== null) {
            cancelAnimationFrame(raf.current);
            raf.current = null;
        }
    };

    useEffect(() => {
        // A new target supersedes any pending fade-in frame (inlined so the ref stays out of the deps).
        if (raf.current !== null) {
            cancelAnimationFrame(raf.current);
            raf.current = null;
        }
        if (src === shownSrc) {
            // The requested image is already the shown one. If we were mid-swap AWAY from it, abandon that
            // swap and restore this layer — it may have faded out and would otherwise stay transparent.
            setNextSrc(null);
            nextLoaded.current = false;
            outDone.current = false;
            setNewIn(false);
            if (!oldShownRef.current) {
                oldShownRef.current = true;
                setOldShown(true);
            }
            return;
        }
        nextLoaded.current = false;
        setNewIn(false);
        setNextSrc(src);
        if (!motion) {
            // Reduced-motion: hold the current image visible and swap it on load.
            oldShownRef.current = true;
            setOldShown(true);
            outDone.current = false;
        } else if (oldShownRef.current) {
            // Current image is visible → fade it out.
            outDone.current = false;
            oldShownRef.current = false;
            setOldShown(false);
        } else {
            // Rapid swap: the current layer already faded out and will emit no further `transitionend`, so
            // treat the fade-out as complete instead of waiting for an event that never comes.
            outDone.current = true;
        }
    }, [src, shownSrc, motion]);

    // Respect reduced-motion (client-only; defaults to motion-allowed on SSR to avoid a hydration mismatch).
    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!mq) return;
        const apply = () => setMotion(!mq.matches);
        apply();
        mq.addEventListener?.('change', apply);
        return () => mq.removeEventListener?.('change', apply);
    }, []);

    // Cancel any pending fade-in frame on unmount.
    useEffect(
        () => () => {
            if (raf.current !== null) cancelAnimationFrame(raf.current);
        },
        []
    );

    const promote = () => {
        cancelFadeIn();
        setShownSrc((s) => nextSrc ?? s);
        setNextSrc(null);
        showOldLayer(true);
        setNewIn(false);
        outDone.current = false;
        nextLoaded.current = false;
    };

    // Advance once the old has finished fading out AND the new is loaded.
    const advance = () => {
        if (!nextSrc || !nextLoaded.current) return;
        if (!motion) {
            promote(); // no animation → straight swap
            return;
        }
        if (outDone.current) {
            // Old is gone; fade the new in. rAF so the incoming opacity:0 is painted before flipping to 1.
            cancelFadeIn();
            raf.current = requestAnimationFrame(() => {
                raf.current = null;
                setNewIn(true);
            });
        }
    };

    const onOldTransitionEnd = (event: TransitionEvent<HTMLImageElement>) => {
        if (event.propertyName === 'opacity' && !oldShown) {
            outDone.current = true; // finished fading OUT
            advance();
        }
    };

    const onNextLoad = (event: SyntheticEvent<HTMLImageElement>) => {
        imageProps?.onLoad?.(event);
        nextLoaded.current = true;
        advance();
    };

    const onNextError = (event: SyntheticEvent<HTMLImageElement>) => {
        imageProps?.onError?.(event);
        // Incoming image failed to load → abandon the swap and restore the current image, so the hero is
        // never stranded blank (both layers transparent) waiting on a load that will never fire.
        cancelFadeIn();
        setNextSrc(null);
        setNewIn(false);
        showOldLayer(true);
        outDone.current = false;
        nextLoaded.current = false;
    };

    const onNextTransitionEnd = (event: TransitionEvent<HTMLImageElement>) => {
        if (event.propertyName === 'opacity' && newIn) {
            promote(); // finished fading IN
        }
    };

    const transition = motion ? 'transition-opacity duration-300 ease-out' : '';

    return (
        <div className={cn('relative overflow-hidden', className)} data-slot="fade-through-image">
            {/* Current image — fades OUT on a swap. */}
            <DynamicImage
                key={shownSrc}
                src={shownSrc}
                alt={alt}
                widths={widths}
                priority={priority}
                objectFit="contain"
                className="absolute inset-0 h-full w-full"
                imageProps={{
                    decoding: 'async',
                    onTransitionEnd: onOldTransitionEnd,
                    className: cn('h-full w-full', transition, oldShown ? 'opacity-100' : 'opacity-0'),
                }}
            />
            {/* Incoming image — preloads hidden during the fade-out, then fades IN and is promoted. */}
            {nextSrc && nextSrc !== shownSrc && (
                <DynamicImage
                    key={nextSrc}
                    src={nextSrc}
                    alt={alt}
                    widths={widths}
                    priority={priority}
                    objectFit="contain"
                    className="absolute inset-0 h-full w-full"
                    imageProps={{
                        decoding: 'async',
                        'aria-hidden': newIn ? undefined : true,
                        onLoad: onNextLoad,
                        onError: onNextError,
                        onTransitionEnd: onNextTransitionEnd,
                        className: cn('h-full w-full', transition, newIn ? 'opacity-100' : 'opacity-0'),
                    }}
                />
            )}
        </div>
    );
}

FadeThroughImage.displayName = 'FadeThroughImage';
