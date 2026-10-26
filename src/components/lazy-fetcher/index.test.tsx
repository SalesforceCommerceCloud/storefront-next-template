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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LazyFetcher from './index';

// ── IntersectionObserver mock ──────────────────────────────────────────────
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let triggerIntersection: ((intersecting: boolean) => void) | null = null;
class MockIntersectionObserver {
    constructor(cb: IOCallback) {
        triggerIntersection = (intersecting) => cb([{ isIntersecting: intersecting }]);
    }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// ── useFetcher mock ────────────────────────────────────────────────────────
const mockFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: undefined as unknown,
    load: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return { ...actual, useFetcher: () => mockFetcher };
});

// ── requestAnimationFrame stub ─────────────────────────────────────────────
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());

describe('LazyFetcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = undefined;
        triggerIntersection = null;
    });

    it('shows fallback before the fetch resolves', () => {
        render(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Error</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        expect(screen.getByText('Loading…')).toBeInTheDocument();
        expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('renders content when fetch returns valid object data', () => {
        mockFetcher.data = { value: 42 };
        render(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>}>
                {(data) => <div>Value: {(data as { value: number }).value}</div>}
            </LazyFetcher>
        );
        expect(screen.getByText('Value: 42')).toBeInTheDocument();
    });

    it('shows errorFallback and hides skeleton after a failed fetch', () => {
        mockFetcher.state = 'idle';
        mockFetcher.data = 'Internal Error'; // non-object → triggers hasFailed

        const { rerender } = render(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );

        // Trigger observer so loadedUrlRef.current is set (required for settledWithError to be true)
        triggerIntersection?.(true);

        rerender(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );

        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('failure state persists through parent re-renders without a new fetch', () => {
        mockFetcher.state = 'idle';
        mockFetcher.data = 'Internal Error';

        const { rerender } = render(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        triggerIntersection?.(true);

        // First re-render settles into error state
        rerender(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        expect(screen.getByText('Failed')).toBeInTheDocument();

        // Second re-render (unrelated parent state change) — error must persist, not revert to skeleton
        rerender(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('resets failure state when url prop changes', () => {
        mockFetcher.data = 'Internal Error';

        const { rerender } = render(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        triggerIntersection?.(true);
        rerender(
            <LazyFetcher url="/api/data" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        expect(screen.getByText('Failed')).toBeInTheDocument();

        // URL changes → failure resets → skeleton shows again for the new fetch
        mockFetcher.data = undefined;
        rerender(
            <LazyFetcher url="/api/data-v2" fallback={<div>Loading…</div>} errorFallback={<div>Failed</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('does not show error fallback when in-flight request for old URL fails after URL changes', () => {
        // Reproduce the failure scenario from Jie Dai's review (P3): URL changes from A to B while
        // A is still loading. A's request fails before B's IntersectionObserver fires. Without the
        // loadedUrlRef === url guard, A's failure would set hasFailed and show the error fallback
        // for B — a section that never had a chance to load should show its skeleton, not an error.
        const { rerender } = render(
            <LazyFetcher url="/api/section-a" fallback={<div>Loading…</div>} errorFallback={<div>Error</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );

        // Step 1: URL A's IntersectionObserver fires → loadedUrlRef.current = '/api/section-a'
        triggerIntersection?.(true);
        mockFetcher.state = 'loading';

        // Step 2: URL prop changes to B while A is in-flight
        // The URL-change effect resets hasFailed and creates a new observer for B (not triggered).
        rerender(
            <LazyFetcher url="/api/section-b" fallback={<div>Loading…</div>} errorFallback={<div>Error</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );

        // Step 3: A's request fails; the response arrives after the URL changed to B
        mockFetcher.state = 'idle';
        mockFetcher.data = 'Gateway Timeout';
        rerender(
            <LazyFetcher url="/api/section-b" fallback={<div>Loading…</div>} errorFallback={<div>Error</div>}>
                {() => <div>Content</div>}
            </LazyFetcher>
        );

        // A's failure must not bleed into B — show B's loading skeleton, not the error fallback
        expect(screen.queryByText('Error')).not.toBeInTheDocument();
        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
});
