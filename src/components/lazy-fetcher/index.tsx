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
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';

export interface LazyFetcherProps<T> {
    /** Resource route URL to fetch when the container enters the viewport. */
    url: string;
    /** Rendered while the fetch is pending (before data arrives). */
    fallback: ReactNode;
    /** Renders the resolved data. Called once data is available. */
    children: (data: T) => ReactNode;
    /**
     * Rendered when the fetch fails (non-JSON response: 401, 403, 500, network error).
     * Omit to silently collapse the section — appropriate for supplementary content
     * (e.g. homepage carousels) where the page is fully usable without it.
     * Provide content when the section is load-bearing and users need to know it failed.
     * Whatever is rendered here should include screen-reader-accessible text so the
     * aria-live region on the container can announce the failure.
     */
    errorFallback?: ReactNode;
}

/**
 * Defers a resource-route fetch until the container scrolls into view, keeping
 * the page's server-rendered HTML free of personalized data.
 *
 * Uses IntersectionObserver with a 200 px root margin so data starts loading
 * just before the section is visible. Tracks the last loaded URL so a `url`
 * prop change always triggers a fresh fetch, even without a remount.
 *
 * The outer div is an `aria-live="polite"` region so screen readers announce
 * transitions: loading → content, and loading → error when `errorFallback` is set.
 */
export default function LazyFetcher<T>({ url, fallback, children, errorFallback }: LazyFetcherProps<T>): ReactNode {
    const fetcher = useFetcher<T>();
    const containerRef = useRef<HTMLDivElement>(null);
    // Track the last URL that was actually fetched so a prop change re-fetches
    // instead of silently serving stale data from a prior URL.
    const loadedUrlRef = useRef<string | null>(null);

    // Keep a ref to the latest fetcher.load so the IntersectionObserver callback
    // always calls the current version, even if it changes before intersection.
    const loadRef = useRef(fetcher.load);
    useEffect(() => {
        loadRef.current = fetcher.load;
    });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && loadedUrlRef.current !== url) {
                    loadedUrlRef.current = url;
                    void loadRef.current(url);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [url]);

    // Only call children when data is a real object. Plain-text error bodies (401, 403, 500) from
    // resource routes arrive as strings; treating them as T would crash the render prop.
    const data = fetcher.data;
    const hasData = data !== undefined && data !== null && typeof data === 'object';
    // When the fetch settled but returned no valid data (error response), hide the section rather
    // than showing the loading skeleton indefinitely — the observer has already disconnected.
    const [hasFailed, setHasFailed] = useState(false);

    // Reset failure when the url prop changes — a new URL means a fresh fetch attempt.
    useEffect(() => {
        setHasFailed(false);
    }, [url]);

    // On failure, clear the loaded URL so a url-prop change or remount can re-trigger the fetch.
    // We intentionally do NOT reconnect the observer here: the element is almost certainly still
    // in the viewport when settledWithError fires, so an automatic reconnect would retry immediately
    // and require backoff logic to prevent a loop. Consumers who want active retry should pass an
    // errorFallback with a button that forces a url change or remount.
    //
    // `failedUrl` is captured at render time rather than read inside the effect. If the url prop
    // changes while A is in-flight, B's IntersectionObserver may fire in the gap between the
    // commit and the passive effect, updating loadedUrlRef to B. Reading the ref in the effect
    // would then show the error fallback for B; snapshotting at render time preserves the correct URL.
    const failedUrl =
        fetcher.state === 'idle' && loadedUrlRef.current !== null && !hasData ? loadedUrlRef.current : null;
    useEffect(() => {
        if (failedUrl === null) return;
        if (failedUrl === url) {
            setHasFailed(true);
        }
        // Only clear the ref if it still points to the URL that failed — B's IntersectionObserver
        // may have already set it to B between the commit and this effect running.
        if (loadedUrlRef.current === failedUrl) {
            loadedUrlRef.current = null;
        }
    }, [failedUrl, url]);

    // Capture the fallback height whenever the skeleton becomes visible or a
    // transition state changes. offsetHeight forces a synchronous layout flush,
    // so scope the effect to [hasData, hasFailed] to avoid taxing every render.
    // Skeleton height is stable while loading, so one reading per state transition
    // is sufficient for the min-height CLS guard below.
    const skeletonHeightRef = useRef(0);
    useLayoutEffect(() => {
        if (!hasData && !hasFailed && containerRef.current) {
            skeletonHeightRef.current = containerRef.current.offsetHeight;
        }
    }, [hasData, hasFailed]);

    // Apply the captured height as min-height for one paint cycle so the container
    // never collapses to 0 between the fallback being removed and the content painting.
    const [minHeight, setMinHeight] = useState(0);
    const innerRafRef = useRef(0);
    useEffect(() => {
        if (!hasData) return;
        if (skeletonHeightRef.current === 0) return;
        setMinHeight(skeletonHeightRef.current);
        const id = requestAnimationFrame(() => {
            innerRafRef.current = requestAnimationFrame(() => setMinHeight(0));
        });
        return () => {
            cancelAnimationFrame(id);
            cancelAnimationFrame(innerRafRef.current);
        };
    }, [hasData]);

    return (
        <div ref={containerRef} aria-live="polite" style={minHeight > 0 ? { minHeight } : undefined}>
            {hasData ? children(data as T) : hasFailed ? (errorFallback ?? null) : fallback}
        </div>
    );
}
