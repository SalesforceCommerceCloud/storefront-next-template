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
import { useLocation, useNavigation } from 'react-router';
import { useAnalytics } from '@/hooks/use-analytics';

/**
 * Analytics component for wishlist page views.
 * Tracks the current wishlist view, retrying when consent becomes available.
 *
 * Non-visual component (returns null). Follows the `PageViewTracker` pattern:
 * lazy-loads, waits for auth, respects consent, silently fails on error.
 *
 * Mount once per route (guest `/wishlist` and registered `/account/wishlist`).
 */
export function WishlistPageAnalytics() {
    const analytics = useAnalytics();
    const location = useLocation();
    const navigation = useNavigation();
    const viewKey = JSON.stringify([location.key, location.pathname, location.search]);
    const lastTrackedRef = useRef<string | null>(null);
    const analyticsRef = useRef(analytics);
    analyticsRef.current = analytics;

    useEffect(() => {
        if (navigation.state !== 'idle' || lastTrackedRef.current === viewKey) return;
        const controller = new AbortController();
        void analyticsRef.current
            .trackWishlistViewed(controller.signal)
            .then((handedOff) => {
                if (handedOff && !controller.signal.aborted) lastTrackedRef.current = viewKey;
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, [analytics.consentKey, navigation.state, viewKey]);

    return null;
}
