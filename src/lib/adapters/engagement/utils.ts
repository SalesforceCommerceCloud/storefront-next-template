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
import type { ConsentCategory, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import { TrackingConsent } from '@/types/tracking-consent';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/**
 * Check whether there is sufficient consent to send events.
 *
 * Returns true (allow) when:
 * - The user granted at least one category and the adapter has no consentCategory
 *   configured (adapter doesn't require specific consent)
 * - The adapter's consentCategory is included in the consent preferences
 *
 * Returns false when:
 * - No consentPreferences are provided (undefined means consent state is unknown or
 *   not yet determined — the safe default is to block)
 * - consentPreferences is an empty array (user explicitly declined all tracking)
 * - The adapter's consentCategory is not in the granted preferences
 *
 * @param adapterConsentCategory - The consent category configured on the adapter
 * @param consentPreferences - The consent preferences from the consent system
 * @returns true if there is sufficient consent, false otherwise
 */
export function hasConsent(adapterConsentCategory?: ConsentCategory, consentPreferences?: ConsentPreferences): boolean {
    // Consent state unknown or not yet determined — block
    if (!consentPreferences) {
        return false;
    }
    // User explicitly declined all tracking
    if (consentPreferences.length === 0) {
        return false;
    }
    // Adapter doesn't require a specific category — allow
    if (!adapterConsentCategory) {
        return true;
    }
    return consentPreferences.includes(adapterConsentCategory);
}

/**
 * Build consent preferences from the binary TrackingConsent (DNT) and configured consent categories.
 *
 * This bridges the existing binary consent system with the per-adapter granular
 * consent model. When the consent UI is extended to support category-level choices,
 * this function can be updated to return a subset of categories.
 *
 * @param trackingConsent - The visitor's binary consent status
 * @param consentCategories - The configured consent categories (from config.engagement.analytics.trackingConsent.consentCategories)
 * @param isTrackingConsentEnabled - Whether the tracking consent system is active
 * @returns ConsentPreferences with granted categories, empty array if declined, or undefined if not yet determined.
 *          When undefined is returned, the hook layer (useAnalytics / PageViewTracker) blocks all tracking.
 */
export function buildConsentPreferences(
    trackingConsent: TrackingConsent | undefined,
    consentCategories: ConsentCategory[],
    isTrackingConsentEnabled: boolean
): ConsentPreferences | undefined {
    // Empty categories is a misconfiguration — no adapter requiring a specific
    // category (e.g. the analytics adapters default to 'analytics') could ever
    // fire. Fall back to a 'necessary' floor so necessary-only / unconditional
    // adapters still work, and warn so the drop is diagnosable, not silent.
    if (consentCategories.length === 0) {
        logger.warn(
            'config.engagement.analytics.trackingConsent.consentCategories is empty; ' +
                "falling back to ['necessary']. Adapters requiring a specific consent category " +
                "(e.g. 'analytics') will send nothing — add the categories your adapters need."
        );
        consentCategories = ['necessary'];
    }

    // Consent system not active — allow the configured categories unrestricted
    if (!isTrackingConsentEnabled) {
        return [...consentCategories];
    }
    if (trackingConsent === TrackingConsent.Accepted) {
        return [...consentCategories];
    }
    if (trackingConsent === TrackingConsent.Declined) {
        return [];
    }
    // Consent enabled but not yet determined — block tracking
    return undefined;
}
