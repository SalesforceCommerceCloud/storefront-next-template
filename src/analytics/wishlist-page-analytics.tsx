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
import { useEffect, useRef } from 'react';
import { useAnalytics } from '@/hooks/use-analytics';

/**
 * Analytics component for wishlist page views.
 * Tracks `wishlist_viewed` event when the component mounts.
 *
 * Non-visual component (returns null). Follows the `PageViewTracker` pattern:
 * lazy-loads, waits for auth, respects consent, silently fails on error.
 *
 * Mount once per route (guest `/wishlist` and registered `/account/wishlist`).
 */
export function WishlistPageAnalytics() {
    const { trackWishlistViewed } = useAnalytics();
    const hasTrackedRef = useRef(false);

    useEffect(() => {
        // Only track once per mount to prevent duplicate events on re-renders
        if (hasTrackedRef.current) {
            return;
        }
        hasTrackedRef.current = true;

        void trackWishlistViewed();
        // Intentionally omit trackWishlistViewed from deps to prevent re-tracking on function reference changes
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
