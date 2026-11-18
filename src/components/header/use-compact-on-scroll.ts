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

/**
 * Scroll positions (px) where the header compacts and expands again. The gap between them is larger than the height
 * the header loses, so the layout shift from compacting can't flip it straight back.
 */
export const COMPACT_HEADER_SCROLL = { enter: 64, exit: 16 } as const;

/** Returns `true` once the page has scrolled past `COMPACT_HEADER_SCROLL.enter`, until it's back near the top. */
export function useCompactOnScroll(): boolean {
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        let frame: number | null = null;
        const check = () => {
            frame = null;
            const y = window.scrollY;
            setCompact((prev) => (prev ? y > COMPACT_HEADER_SCROLL.exit : y > COMPACT_HEADER_SCROLL.enter));
        };
        const onScroll = () => {
            if (frame === null) frame = window.requestAnimationFrame(check);
        };
        check();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (frame !== null) window.cancelAnimationFrame(frame);
        };
    }, []);

    return compact;
}
