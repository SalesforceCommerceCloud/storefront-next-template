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
import { act, renderHook } from '@testing-library/react';
import { COMPACT_HEADER_SCROLL, useCompactOnScroll } from './use-compact-on-scroll';

let frames: FrameRequestCallback[] = [];

function scrollTo(y: number): void {
    act(() => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
        window.dispatchEvent(new Event('scroll'));
        for (const cb of frames.splice(0)) cb(0);
    });
}

describe('useCompactOnScroll', () => {
    beforeEach(() => {
        frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    it('starts expanded at the top', () => {
        const { result } = renderHook(() => useCompactOnScroll());
        expect(result.current).toBe(false);
    });

    it('starts compact when the page loads scrolled', () => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
        const { result } = renderHook(() => useCompactOnScroll());
        expect(result.current).toBe(true);
    });

    it('compacts past the enter point and only expands again near the top', () => {
        const { result } = renderHook(() => useCompactOnScroll());
        scrollTo(COMPACT_HEADER_SCROLL.enter);
        expect(result.current).toBe(false);
        scrollTo(COMPACT_HEADER_SCROLL.enter + 1);
        expect(result.current).toBe(true);
        scrollTo(COMPACT_HEADER_SCROLL.exit + 1);
        expect(result.current).toBe(true);
        scrollTo(COMPACT_HEADER_SCROLL.exit);
        expect(result.current).toBe(false);
    });

    it('stops listening on unmount', () => {
        const { result, unmount } = renderHook(() => useCompactOnScroll());
        unmount();
        scrollTo(500);
        expect(result.current).toBe(false);
    });
});
