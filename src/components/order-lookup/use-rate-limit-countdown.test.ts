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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimitCountdown } from './use-rate-limit-countdown';

describe('useRateLimitCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('counts down from initial seconds to 0', () => {
        const { result } = renderHook(() => useRateLimitCountdown(5));

        expect(result.current.remaining).toBe(5);
        expect(result.current.done).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(4);
        expect(result.current.done).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(3);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(2);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(1);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);

        // Should stay at 0
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });

    it('returns remaining=0 and done=true when seconds is undefined', () => {
        const { result } = renderHook(() => useRateLimitCountdown(undefined));

        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);

        // Should not change over time
        vi.advanceTimersByTime(5000);
        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });

    it('returns remaining=0 and done=true when seconds is 0', () => {
        const { result } = renderHook(() => useRateLimitCountdown(0));

        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });

    it('clears interval on unmount', () => {
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        const { unmount } = renderHook(() => useRateLimitCountdown(10));

        unmount();

        expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('resets countdown when seconds prop changes', () => {
        const { result, rerender } = renderHook(({ seconds }) => useRateLimitCountdown(seconds), {
            initialProps: { seconds: 5 },
        });

        expect(result.current.remaining).toBe(5);

        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(result.current.remaining).toBe(3);

        // Change seconds prop
        rerender({ seconds: 10 });

        expect(result.current.remaining).toBe(10);
        expect(result.current.done).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.remaining).toBe(9);
    });

    it('returns remaining=0 and done=true when seconds is NaN', () => {
        const { result } = renderHook(() => useRateLimitCountdown(NaN));

        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);

        // Should not change over time, and should not throw/loop
        vi.advanceTimersByTime(5000);
        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });

    it('handles changing from a number to NaN', () => {
        const { result, rerender } = renderHook(({ seconds }) => useRateLimitCountdown(seconds), {
            initialProps: { seconds: 5 },
        });

        expect(result.current.remaining).toBe(5);

        rerender({ seconds: NaN });

        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });

    it('handles changing from a number to undefined', () => {
        const { result, rerender } = renderHook(({ seconds }) => useRateLimitCountdown(seconds), {
            initialProps: { seconds: 5 as number | undefined },
        });

        expect(result.current.remaining).toBe(5);

        rerender({ seconds: undefined });

        expect(result.current.remaining).toBe(0);
        expect(result.current.done).toBe(true);
    });
});
