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
import { useLocation } from 'react-router';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useAuth } from '@/providers/auth';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import { getAllAdapters, buildConsentPreferences } from '@/lib/adapters';
import { useTrackingConsent } from '@/hooks/use-tracking-consent';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/**
 * Component that tracks page view events asynchronously
 *
 * This component lazy loads analytics dependencies and tracks page views on location changes.
 * All tracking work is async and non-blocking, so it doesn't impact page load performance.
 *
 * Note: This is a non-visual component (returns null) and is located in lib/analytics
 * rather than components/ to avoid Storybook coverage issues.
 */
export function PageViewTracker() {
    const location = useLocation();
    const config = useConfig();
    const auth = useAuth();
    const { trackingConsent, isTrackingConsentEnabled } = useTrackingConsent();
    const { site, language } = useSite();
    const trackedRef = useRef<{ path: string; timestamp: number } | null>(null);
    const trackingResetDuration = config.engagement.analytics.pageViewsResetDuration;

    useEffect(() => {
        // Only track on client side
        if (typeof window === 'undefined') {
            return;
        }

        // Don't track if user has declined tracking or hasn't provided consent yet
        // (avoids unnecessary auth resolution and mediator initialization)
        const consentCategories = config.engagement.analytics.trackingConsent?.consentCategories ?? [];
        const consentPreferences = buildConsentPreferences(
            trackingConsent,
            consentCategories,
            isTrackingConsentEnabled
        );
        if (!consentPreferences || consentPreferences.length === 0) {
            return;
        }

        const pathname = location.pathname;
        const queryParams = location.search;
        const hash = location.hash;
        const fullPath = `${pathname}${queryParams}${hash}`;
        const now = Date.now();

        // Wait for auth to be defined before tracking
        if (auth === undefined) {
            return;
        }

        // Skip if we've already tracked this exact path and it's within the reset duration
        if (trackedRef.current?.path === fullPath && now - trackedRef.current.timestamp < trackingResetDuration) {
            return;
        }

        // Check if this path should be tracked
        const blockedPaths = config.engagement.analytics.pageViewsBlocklist;
        const shouldTrackPath = !blockedPaths.some((blocked) => pathname.startsWith(blocked));

        if (!shouldTrackPath) {
            return;
        }

        // Track page view asynchronously
        const trackPageView = async () => {
            try {
                // Ensure adapters are initialized before getting mediator so we have adapters to track the event
                await ensureAdaptersInitialized(config);

                // Dynamically import event creation functions - these are not in the initial bundle
                const { createEvent, getEventMediator, sendViewPageEvent } = await import(
                    '@salesforce/storefront-next-runtime/events'
                );

                const mediator = getEventMediator(getAllAdapters);
                if (!mediator) {
                    return;
                }

                // Create and send the page view event
                // Auth is guaranteed to be defined at this point due to the check above
                const event = createEvent('view_page', {
                    path: pathname,
                    payload: {
                        userType: auth.userType ?? 'guest',
                        encUserId: auth.encUserId ?? undefined,
                        usid: auth.usid,
                        customerId: auth.customerId,
                    },
                });
                const eventSiteInfo = { siteId: site.id, localeId: language };
                sendViewPageEvent(event, mediator, eventSiteInfo, consentPreferences);
            } catch (error) {
                // Silently fail - analytics should not break the app
                trackedRef.current = null; // Reset the tracked path to allow tracking again
                if (import.meta.env.DEV) {
                    logger.warn('Failed to load and send page view tracking', { error });
                }
            }
        };

        void trackPageView();
        trackedRef.current = { path: fullPath, timestamp: now };
    }, [
        location.pathname,
        location.search,
        location.hash,
        config.engagement.analytics.pageViewsBlocklist,
        config,
        auth,
        trackingConsent,
        trackingResetDuration,
        isTrackingConsentEnabled,
        site,
        language,
    ]);

    return null;
}
