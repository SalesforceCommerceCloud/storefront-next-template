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
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useAuth } from '@/providers/auth';
import { TrackingConsent } from '@/types/tracking-consent';
import { resourceRoutes } from '@/route-paths';

/**
 * Hook for managing tracking consent functionality.
 * Provides utilities for reading and setting tracking consent values, checking if banner should be shown,
 * and managing the consent flow.
 *
 * ⚠️ **Client-only hook**: This hook uses React Context (`useConfig`, `useAuth`) and React Router's
 * `useFetcher`, so it can only be used in client components. Mark your component with
 * `'use client'` directive.
 *
 * **Data Flow (Server-Only Auth Architecture):**
 * - Tracking consent is read from `useAuth()` which provides client-safe session data.
 * - The root loader reads from cookies on the server and extracts non-sensitive fields.
 * - Updates are sent to the server via the `/action/update-tracking-consent` action route,
 *   which refreshes the auth token and sets the cookie via Set-Cookie headers.
 * - After updates, the next navigation/loader run will reflect the new consent value.
 *
 * @returns Object containing tracking consent state and utility functions
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * export function MyComponent() {
 *   const { trackingConsent, isTrackingConsentEnabled, shouldShowBanner, setTrackingConsent } = useTrackingConsent();
 *
 *   if (shouldShowBanner) {
 *     // Show consent banner
 *   }
 *
 *   const handleAccept = () => {
 *     setTrackingConsent(TrackingConsent.Accepted); // User accepts tracking
 *   };
 * }
 * ```
 */
export function useTrackingConsent() {
    const config = useConfig();
    const fetcher = useFetcher();
    const auth = useAuth();

    // Extract tracking consent config to avoid repeated property access
    const trackingConsentConfig = useMemo(
        () => config.engagement?.analytics?.trackingConsent,
        [config.engagement?.analytics?.trackingConsent]
    );

    // Check if tracking consent is enabled (use config from hook, not getConfig() which doesn't work in React components)
    const isTrackingConsentEnabled = useMemo(() => {
        return trackingConsentConfig?.enabled ?? false;
    }, [trackingConsentConfig?.enabled]);

    // Track if user has responded in this session (for immediate banner dismissal)
    const [hasResponded, setHasResponded] = useState(false);

    // Read tracking consent from auth context (source of truth)
    // Auth data is provided by AuthProvider which receives clientAuth from the root loader
    // This ensures server/client consistency and avoids hydration mismatches
    const trackingConsent =
        auth?.authMode === 'trusted-agent'
            ? TrackingConsent.Declined
            : isTrackingConsentEnabled
              ? auth?.trackingConsent
              : undefined;

    // Reset hasResponded when session shows no tracking consent value (e.g., after logout/login)
    // This allows banner to show again if needed
    useEffect(() => {
        if (!isTrackingConsentEnabled) {
            setHasResponded(false);
            return;
        }
        // If session shows no tracking consent value, reset hasResponded so banner can show again
        if (trackingConsent === undefined) {
            setHasResponded(false);
        }
    }, [trackingConsent, isTrackingConsentEnabled]);

    // Determine if banner should be shown
    // Banner shows if: feature is enabled AND user hasn't responded (no tracking consent in session)
    // We hide immediately when user responds (hasResponded), but rely on session to show it
    const shouldShowBanner = useMemo(() => {
        if (!isTrackingConsentEnabled) {
            return false;
        }
        // Show banner if no tracking consent in session AND user hasn't responded in this session
        return trackingConsent === undefined && !hasResponded;
    }, [isTrackingConsentEnabled, trackingConsent, hasResponded]);

    // Get default tracking consent value from config
    const defaultTrackingConsent = useMemo(() => {
        return trackingConsentConfig?.defaultTrackingConsent ?? TrackingConsent.Declined;
    }, [trackingConsentConfig?.defaultTrackingConsent]);

    /**
     * Set tracking consent value by submitting to the server action.
     * The server action refreshes the SLAS token with the new tracking consent preference
     * and sets cookies via Set-Cookie headers.
     * Banner hides immediately when called. If the request fails, the banner will
     * reappear on the next navigation when the loader re-reads cookies.
     *
     * @param consent - TrackingConsent.Accepted if user accepts tracking, TrackingConsent.Declined if declined
     * @returns Promise that resolves when the fetcher becomes idle (request completes)
     */
    const setTrackingConsent = useCallback(
        (consent: TrackingConsent): Promise<void> => {
            if (!isTrackingConsentEnabled) {
                return Promise.resolve();
            }

            // Hide banner immediately for better UX
            setHasResponded(true);

            // Submit to server action - server handles token refresh and cookie updates
            // Return the promise so callers can await completion
            return fetcher.submit(
                { trackingConsent: consent },
                {
                    method: 'POST',
                    action: resourceRoutes.updateTrackingConsent,
                }
            );
        },
        [isTrackingConsentEnabled, fetcher]
    );

    return {
        trackingConsent,
        isTrackingConsentEnabled,
        shouldShowBanner,
        setTrackingConsent,
        defaultTrackingConsent,
    };
}
