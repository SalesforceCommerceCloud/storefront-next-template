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
 * Default keep-alive after close, in ms. Set just above the shared dialog's exit animation
 * (`duration-200` on `DialogContent`, see storefront-ui dialog primitive) so the unmount lands
 * after the animation finishes rather than racing its final frame. Overlays with a longer exit
 * animation should pass an explicit `delayMs`.
 */
const DEFAULT_UNMOUNT_DELAY = 250;

/**
 * Track whether an overlay should stay in the React tree, given its `open` state. Returns `true`
 * while `open` is true and for `delayMs` after it flips to false, then `false`.
 *
 * The delay keeps the subtree mounted long enough for an exit animation (e.g. Radix Dialog's
 * `data-[state=closed]:animate-out`) to play, then unmounts it so any children with unmount-time
 * cleanup — such as `useScapiFetcher` deregistering from the fetcher registry — actually tear down.
 * Re-opening during the delay cancels the pending unmount.
 *
 * @param open - Whether the overlay is currently open.
 * @param delayMs - Keep-alive after close, in ms. Defaults to 250 to outlast the 200ms dialog exit animation.
 * @returns Whether the overlay subtree should be mounted.
 */
export function useDeferredUnmount(open: boolean, delayMs = DEFAULT_UNMOUNT_DELAY): boolean {
    const [mounted, setMounted] = useState(open);

    useEffect(() => {
        if (open) {
            setMounted(true);
            return;
        }
        // Already torn down (e.g. a closed tile that never opened) — no timer to arm.
        if (!mounted) {
            return;
        }
        const id = setTimeout(() => setMounted(false), delayMs);
        return () => clearTimeout(id);
    }, [open, mounted, delayMs]);

    return mounted;
}
