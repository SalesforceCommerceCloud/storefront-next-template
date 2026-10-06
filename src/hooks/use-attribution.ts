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
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { TrackingConsent } from '@/types/tracking-consent';
import { useTrackingConsent } from '@/hooks/use-tracking-consent';
import { captureAttribution, clearAttribution } from '@/lib/attribution';

// The tracking-consent cookie. Read directly (as `active-data.ts` does) so the decision is
// independent of the `engagement.analytics.trackingConsent.enabled` config flag — the removed
// server middleware honored `dw_dnt` unconditionally, and we keep that behavior.
const TRACKING_CONSENT_COOKIE_NAME = 'dw_dnt';

/**
 * Apply the first-touch attribution decision for an already-resolved cookie `Domain`: clear the
 * cookie when the shopper has opted out (`dw_dnt=1` / {@link TrackingConsent.Declined}), otherwise
 * capture first touch. The DNT signal is read straight from the cookie so the decision is
 * independent of the `engagement.analytics.trackingConsent.enabled` config flag (matching the
 * removed server middleware).
 *
 * Shared by {@link useAttribution} (the normal App path) and `root.tsx`'s `ErrorBoundary`: a
 * campaign link that lands directly on a 404/route error renders the ErrorBoundary instead of App,
 * where the Site/Config providers `useAttribution` needs are not mounted, so that path resolves the
 * cookie domain from loader data and calls this directly. Both callers invoke it from a
 * browser-only effect; `captureAttribution`/`clearAttribution` are themselves fail-open.
 */
export function applyAttribution(cookieDomain: string | undefined): void {
    if (Cookies.get(TRACKING_CONSENT_COOKIE_NAME) === TrackingConsent.Declined) {
        clearAttribution({ cookieDomain });
        return;
    }
    captureAttribution({ cookieDomain });
}

/**
 * ⚠️ **Client-only hook.** Manages the first-touch `dw_attribution` marketing-attribution cookie
 * in the browser (W-23493124). Mount it once, high in the app tree, from a client-only component
 * (see `AttributionCapture` in `root.tsx`).
 *
 * On every consent state and on first mount it either captures first-touch attribution or clears
 * it:
 *  - If the shopper has opted out (`dw_dnt=1` / {@link TrackingConsent.Declined}), expire any
 *    existing `dw_attribution` cookie and capture nothing. An in-session opt-out sets `dw_dnt=1`
 *    via the server action and updates the auth context, so `trackingConsent` changes and this
 *    effect re-runs immediately — clearing the cookie without waiting for a full-page navigation.
 *  - Otherwise (consent accepted, or no consent recorded yet) write the first-touch cookie
 *    optimistically. Consent is recorded only *after* the landing request, by which point the
 *    campaign params are gone from the URL, so gating capture on an explicit `dw_dnt=0` would never
 *    capture first touch — an absent consent cookie therefore permits the write.
 *
 * The DNT decision reads `dw_dnt` straight from the cookie (config-flag independent); the reactive
 * `trackingConsent` value is used only as the effect trigger for an in-session consent change.
 */
export function useAttribution(): void {
    const { site } = useSite();
    const config = useConfig();
    const { trackingConsent } = useTrackingConsent();

    useEffect(() => {
        // Resolve the cookie `Domain` exactly as the server does for every storefront cookie: the
        // per-site override, else the global `app.cookies.domain` (see `resolveCookieDomain` /
        // `WishlistMergeToast`). It must match the write, or the browser won't drop the cookie on
        // an opt-out clear.
        const cookieDomain = site.cookies?.domain || config.cookies?.domain;

        applyAttribution(cookieDomain);
        // `trackingConsent` is the reactive trigger: it flips when an in-session opt-out completes,
        // re-running this effect so the cookie is cleared right away.
    }, [trackingConsent, site.cookies?.domain, config.cookies?.domain]);
}
