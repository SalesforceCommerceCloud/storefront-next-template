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

import { useEffect, useState, type RefObject } from 'react';

export interface UseIntersectionObserverOptions {
    /** Detach the observer after the element first appears, so consumers fire exactly once. */
    useOnce?: boolean;
    root?: Element | null;
    rootMargin?: string;
    threshold?: number | number[];
}

/**
 * Returns whether the referenced element is on screen. Fails open (returns
 * `true`) on the server or when `IntersectionObserver` is unsupported, so
 * viewport-gated side effects (e.g. impression analytics) still fire rather
 * than silently never running. Mirrors PWA Kit's `useIntersectionObserver`.
 */
export function useIntersectionObserver(
    ref: RefObject<Element | null>,
    { useOnce, ...ioOptions }: UseIntersectionObserverOptions = {}
): boolean {
    const [isIntersecting, setIntersecting] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        // Fail open when the API is unavailable (SSR / old browsers).
        if (typeof IntersectionObserver === 'undefined') {
            setIntersecting(true);
            return;
        }

        const observer = new IntersectionObserver(([entry]) => {
            const onScreen = entry.isIntersecting;
            setIntersecting(onScreen);
            if (useOnce && onScreen) {
                observer.disconnect();
            }
        }, ioOptions);

        observer.observe(node);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ioOptions is a fresh object each render; observe the node identity only (PWA Kit parity)
    }, [ref.current]);

    return isIntersecting;
}
