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
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useIntersectionObserver } from './use-intersection-observer';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let lastCallback: ObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class MockIntersectionObserver {
    constructor(cb: ObserverCallback) {
        lastCallback = cb;
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = vi.fn();
}

// Renders the hook against a real DOM node so `ref.current` is populated.
const useObserverOnNode = (options?: Parameters<typeof useIntersectionObserver>[1]) => {
    const ref = useRef<HTMLDivElement>(null);
    // Attach a node synchronously so the effect sees ref.current.
    if (!ref.current) {
        ref.current = document.createElement('div');
    }
    return useIntersectionObserver(ref, options);
};

describe('useIntersectionObserver', () => {
    beforeEach(() => {
        lastCallback = null;
        observe.mockClear();
        disconnect.mockClear();
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns false initially and true once the element intersects', () => {
        const { result } = renderHook(() => useObserverOnNode());
        expect(result.current).toBe(false);
        expect(observe).toHaveBeenCalledTimes(1);

        act(() => {
            lastCallback?.([{ isIntersecting: true }]);
        });
        expect(result.current).toBe(true);
    });

    it('disconnects after the first intersection when useOnce is set (fires once)', () => {
        const { result } = renderHook(() => useObserverOnNode({ useOnce: true }));

        act(() => {
            lastCallback?.([{ isIntersecting: true }]);
        });
        expect(result.current).toBe(true);
        expect(disconnect).toHaveBeenCalled();
    });

    it('fails open (returns true) when IntersectionObserver is unsupported', () => {
        vi.stubGlobal('IntersectionObserver', undefined);
        const { result } = renderHook(() => useObserverOnNode({ useOnce: true }));
        expect(result.current).toBe(true);
    });
});
