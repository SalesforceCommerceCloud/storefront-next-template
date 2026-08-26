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
import { useEffect, useState } from 'react';

const DEFAULT_IDLE_TIMEOUT = 2000;
const DEFAULT_FALLBACK_TIMEOUT = 0;

export type UseDeferredRenderOptions = {
    /**
     * Maximum time (ms) to wait for an idle frame before forcing the deferred content to render. Forwarded to
     * `requestIdleCallback` as `{ timeout }`.
     * @default 2000
     */
    idleTimeout?: number;
    /**
     * Delay (ms) for the `setTimeout` fallback used when `requestIdleCallback` is unavailable.
     * @default 0
     */
    fallbackTimeout?: number;
};

/**
 * Schedule `tick` on the next idle frame via `requestIdleCallback`, with a `setTimeout` fallback for environments
 * that don't expose RIC (SSR, JSDOM). Returns a cleanup that cancels whichever was scheduled. Use to defer
 * non-critical work (e.g. analytics dispatch) out of the hydration long-task window.
 */
export const scheduleIdleTick = (
    tick: () => void,
    { idleTimeout, fallbackTimeout }: { idleTimeout: number; fallbackTimeout: number }
): (() => void) => {
    if (typeof requestIdleCallback !== 'undefined') {
        const id = requestIdleCallback(tick, { timeout: idleTimeout });
        return () => cancelIdleCallback(id);
    }
    const id = setTimeout(tick, fallbackTimeout);
    return () => clearTimeout(id);
};

/**
 * Hook that defers rendering until an idle frame is available.
 * This is useful for rendering non-critical content after the main content
 * has been painted, improving initial render performance (LCP, TBT).
 *
 * @param enabled - Whether deferred rendering is enabled (default: true)
 * @param options - Optional timing overrides for idle and fallback scheduling
 * @returns Boolean indicating whether the deferred content should be rendered
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const shouldRenderDeferred = useDeferredRender();
 *   return (
 *     <>
 *       <CriticalContent />
 *       {shouldRenderDeferred && <NonCriticalContent />}
 *     </>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Custom timeouts for a latency-sensitive consumer
 * const shouldRender = useDeferredRender(true, {
 *   idleTimeout: 500,
 *   fallbackTimeout: 16,
 * });
 * ```
 */
export function useDeferredRender(enabled = true, options?: UseDeferredRenderOptions): boolean {
    const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    const fallbackTimeout = options?.fallbackTimeout ?? DEFAULT_FALLBACK_TIMEOUT;
    const [shouldRender, setShouldRender] = useState(!enabled);

    useEffect(() => {
        if (!enabled || shouldRender) {
            return;
        }
        return scheduleIdleTick(() => setShouldRender(true), { idleTimeout, fallbackTimeout });
    }, [enabled, shouldRender, idleTimeout, fallbackTimeout]);

    return shouldRender;
}

/**
 * Hook that surfaces an integer cursor growing from `0` to `n`, one step per idle frame. Use when you want to fan
 * out deferred work (e.g. preload N off-screen images) in evenly-spaced chunks instead of registering everything in
 * a single post-hydration tick.
 *
 * `n === 0` is the disabled state — no idle frames are requested. To gate by an external condition, compute `n`
 * conditionally at the call site.
 *
 * SSR-safe: returns `0` until the first idle frame fires on the client. The returned value is clamped to `n`, so a
 * shrinking `n` (e.g. variant switch with fewer slides) cannot surface a stale over-count for one render.
 *
 * @param n - Target sequence length. The cursor grows by 1 per idle frame until it reaches `n`.
 * @param options - Optional timing overrides for idle and fallback scheduling.
 * @returns Integer cursor in `[0, n]`.
 *
 * @example
 * ```tsx
 * // Preload up to EAGER_PRELOAD_LIMIT off-screen slides, one per idle frame.
 * const cap = isPreloadAllowedByConnection() ? EAGER_PRELOAD_LIMIT : 0;
 * const offScreen = images.slice(1, 1 + cap);
 * const ready = useDeferredRenderSequence(offScreen.length);
 * useEffect(() => {
 *     offScreen.slice(0, ready).forEach(preloadGallerySlide);
 * }, [offScreen, ready, preloadGallerySlide]);
 * ```
 */
export function useDeferredRenderSequence(n: number, options?: UseDeferredRenderOptions): number {
    const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    const fallbackTimeout = options?.fallbackTimeout ?? DEFAULT_FALLBACK_TIMEOUT;
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (count >= n) {
            return;
        }
        return scheduleIdleTick(() => setCount((c) => Math.min(c + 1, n)), { idleTimeout, fallbackTimeout });
    }, [n, count, idleTimeout, fallbackTimeout]);

    return Math.min(count, n);
}
