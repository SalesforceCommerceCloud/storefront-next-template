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
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDeferredUnmount } from './use-deferred-unmount';

describe('useDeferredUnmount', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('is unmounted while closed and never open', () => {
        const { result } = renderHook(() => useDeferredUnmount(false));
        expect(result.current).toBe(false);
    });

    it('schedules no unmount timer when it starts closed', () => {
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        renderHook(() => useDeferredUnmount(false));
        // Nothing to tear down — a closed tile must not arm a no-op timer.
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('uses a default delay that outlasts the 200ms dialog exit animation', () => {
        const { result, rerender } = renderHook(({ open }) => useDeferredUnmount(open), {
            initialProps: { open: true },
        });

        rerender({ open: false });
        // Still mounted at the animation's own duration — the default leaves headroom.
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(result.current).toBe(false);
    });

    it('mounts immediately when open flips true', () => {
        const { result, rerender } = renderHook(({ open }) => useDeferredUnmount(open), {
            initialProps: { open: false },
        });

        rerender({ open: true });
        expect(result.current).toBe(true);
    });

    it('stays mounted for the delay after close, then unmounts', () => {
        const { result, rerender } = renderHook(({ open }) => useDeferredUnmount(open, 200), {
            initialProps: { open: true },
        });
        expect(result.current).toBe(true);

        rerender({ open: false });
        // Still mounted immediately after close so the exit animation can play.
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(199);
        });
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toBe(false);
    });

    it('cancels the pending unmount when re-opened during the delay', () => {
        const { result, rerender } = renderHook(({ open }) => useDeferredUnmount(open, 200), {
            initialProps: { open: true },
        });

        rerender({ open: false });
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(result.current).toBe(true);

        // Re-open before the delay elapses.
        rerender({ open: true });
        act(() => {
            vi.advanceTimersByTime(200);
        });
        // The stale unmount timer must not fire.
        expect(result.current).toBe(true);
    });

    it('clears the pending timer on unmount', () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const { rerender, unmount } = renderHook(({ open }) => useDeferredUnmount(open, 200), {
            initialProps: { open: true },
        });

        rerender({ open: false });
        unmount();

        expect(clearTimeoutSpy).toHaveBeenCalled();
    });
});
