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

import type { EventMediator, AnalyticsEvent, EventAdapter, EventSiteInfo, ConsentPreferences } from './types';

// Module-level storage for the event mediator singleton
// This ensures a single mediator instance across all usages
let mediatorInstance: EventMediator | undefined;

/**
 * Create an event mediator instance
 *
 * Creates a new EventMediator that processes events through the provided adapters.
 * The mediator uses the getAdapters function on each track() invocation to ensure
 * it always uses the latest adapters from the adapter registry.
 *
 * @param getAdapters - Function that returns the current array of engagement adapters.
 *                      This function is called on each track() invocation to ensure
 *                      the mediator always uses the latest adapters from the adapter registry.
 * @returns EventMediator instance
 */
function createEventMediator(getAdapters: () => EventAdapter[]): EventMediator {
    return {
        track: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => {
            processEventWithAdapters(event, getAdapters, siteInfo, consentPreferences).catch((error) => {
                // oxlint-disable-next-line no-console
                console.error('Analytics tracking failed:', error);
            });
        },
    };
}

/**
 * Get the event mediator singleton instance
 *
 * Returns the singleton EventMediator instance, creating it if it doesn't exist.
 *
 * @param getAdapters - Function that returns the current array of engagement adapters.
 * @returns EventMediator instance (singleton) or undefined if not on client side
 */
export function getEventMediator(getAdapters: () => EventAdapter[]): EventMediator | undefined {
    // If mediator already exists, return it
    if (mediatorInstance) {
        return mediatorInstance;
    }

    // Only create on client side
    if (typeof window === 'undefined') {
        return undefined;
    }

    // Create the event mediator singleton
    mediatorInstance = createEventMediator(getAdapters);
    return mediatorInstance;
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
    siteInfo?: EventSiteInfo,
    consentPreferences?: ConsentPreferences
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
            if (typeof adapter.sendEvent === 'function') {
                await adapter.sendEvent(event, siteInfo, consentPreferences);
            } else {
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
