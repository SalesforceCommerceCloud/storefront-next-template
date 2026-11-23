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

import type {
    ConsentAwareEventMediator,
    EventMediator,
    AnalyticsEvent,
    EventAdapter,
    EventSiteInfo,
    ConsentPreferences,
} from './types';

// Module-level storage for the event mediator singleton
// This ensures a single mediator instance across all usages
let mediatorInstance: ConsentAwareEventMediator | undefined;

/**
 * Create an event mediator instance
 *
 * Creates a new ConsentAwareEventMediator that processes events through the provided adapters.
 * The mediator uses the getAdapters function on each track() invocation to ensure
 * it always uses the latest adapters from the adapter registry.
 *
 * @param getAdapters - Function that returns the current array of engagement adapters.
 *                      This function is called on each track() invocation to ensure
 *                      the mediator always uses the latest adapters from the adapter registry.
 * @returns ConsentAwareEventMediator instance
 */
function createEventMediator(getAdapters: () => EventAdapter[]): ConsentAwareEventMediator {
    let preferences: ConsentPreferences | undefined;
    let consentKey: string | undefined;
    let revision = 0;
    const deliveredRevisions = new WeakMap<EventAdapter, number>();

    const syncAdapterConsent = (adapter: EventAdapter): void => {
        if (revision === 0 || deliveredRevisions.get(adapter) === revision || !adapter.onConsentChange) {
            return;
        }
        // Mark before calling customer code so reentrant synchronization is safe.
        deliveredRevisions.set(adapter, revision);
        try {
            Promise.resolve(adapter.onConsentChange(preferences?.slice())).catch((error) => {
                // oxlint-disable-next-line no-console
                console.error(`Failed to notify consent change to ${adapter.name}:`, error);
            });
        } catch (error) {
            // oxlint-disable-next-line no-console
            console.error(`Failed to notify consent change to ${adapter.name}:`, error);
        }
    };

    return {
        notifyConsentChange: (nextPreferences) => {
            const nextKey = JSON.stringify(nextPreferences === undefined ? null : [...new Set(nextPreferences)].sort());
            if (nextKey !== consentKey) {
                consentKey = nextKey;
                preferences = nextPreferences?.slice();
                revision++;
            }
            // Also synchronize new instances when the category set is unchanged.
            for (const adapter of getAdapters()) {
                if (getAdapters().includes(adapter)) {
                    syncAdapterConsent(adapter);
                }
            }
        },
        syncAdapterConsent,
        track: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => {
            processEventWithAdapters(event, getAdapters, syncAdapterConsent, siteInfo, () => {
                // Resolve immediately before each send, including after customer callbacks.
                // Published consent can narrow captured event permissions, never widen them.
                const preferencesForEvent =
                    revision === 0
                        ? consentPreferences
                        : consentPreferences?.filter((category) => preferences?.includes(category));
                return {
                    allowed: revision === 0 || Boolean(preferencesForEvent?.length),
                    preferences: preferencesForEvent,
                };
            }).catch((error) => {
                // oxlint-disable-next-line no-console
                console.error('Analytics tracking failed:', error);
            });
        },
    };
}

/**
 * Get the event mediator singleton instance
 *
 * Returns the singleton ConsentAwareEventMediator instance, creating it if it doesn't exist.
 *
 * @param getAdapters - Function that returns the current array of engagement adapters.
 * @returns ConsentAwareEventMediator instance (singleton) or undefined if not on client side
 */
export function getConsentAwareEventMediator(getAdapters: () => EventAdapter[]): ConsentAwareEventMediator | undefined {
    // Never expose browser consent state to server rendering.
    if (typeof window === 'undefined') {
        return undefined;
    }

    // If mediator already exists, return it
    if (mediatorInstance) {
        return mediatorInstance;
    }

    // Create the event mediator singleton
    mediatorInstance = createEventMediator(getAdapters);
    return mediatorInstance;
}

/**
 * Get the built-in singleton through the original track-only contract.
 *
 * @param getAdapters - Function returning the currently registered adapters
 */
export function getEventMediator(getAdapters: () => EventAdapter[]): EventMediator | undefined {
    return getConsentAwareEventMediator(getAdapters);
}

/**
 * Reset the event mediator singleton (for testing only)
 *
 * This function clears the singleton instance, allowing tests to create a fresh mediator.
 */
export function resetEventMediator(): void {
    mediatorInstance = undefined;
}

/**
 * Process an event with all registered adapters
 *
 * @param event - The analytics event to process
 * @param getAdapters - Function that returns the current array of event adapters
 */
async function processEventWithAdapters(
    event: AnalyticsEvent,
    getAdapters: () => EventAdapter[],
    syncAdapterConsent: (adapter: EventAdapter) => void,
    siteInfo: EventSiteInfo | undefined,
    resolveConsent: () => { allowed: boolean; preferences: ConsentPreferences | undefined }
): Promise<void> {
    // Get the current array of event adapters
    const eventAdapters = getAdapters();
    if (eventAdapters.length === 0) {
        // oxlint-disable-next-line no-console
        console.warn(`There are no active adapters to send the event to`);
        return;
    }

    // Send event to all registered adapters that implement sendEvent in parallel
    const promises = eventAdapters.map(async (adapter) => {
        try {
            syncAdapterConsent(adapter);
            const consent = resolveConsent();
            if (!consent.allowed) {
                return;
            }
            if (typeof adapter.sendEvent === 'function') {
                await adapter.sendEvent(event, siteInfo, consent.preferences);
            } else if (!adapter.onConsentChange) {
                // oxlint-disable-next-line no-console
                console.warn(`Adapter ${adapter.name} does not implement sendEvent`);
            }
        } catch (error) {
            // oxlint-disable-next-line no-console
            console.error(`Failed to send event to ${adapter.name}:`, error);
        }
    });

    await Promise.allSettled(promises);
}
