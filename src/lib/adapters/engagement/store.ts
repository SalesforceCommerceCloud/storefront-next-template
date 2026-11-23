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
import type { EngagementAdapter } from './types';
import { getConsentAwareEventMediator } from '@salesforce/storefront-next-runtime/events';

// Global engagement adapter store
// The main purpose of this store is to store the instances of adapters that were created
const engagementAdapterStore = new Map<string, EngagementAdapter>();

/**
 * Add an engagement adapter to the adapter store
 */
export function addAdapter(name: string, adapter: EngagementAdapter): void {
    engagementAdapterStore.set(name, adapter);
    getConsentAwareEventMediator(getAllAdapters)?.syncAdapterConsent(adapter);
}

/**
 * Remove an engagement adapter from the adapter store
 */
export function removeAdapter(name: string): void {
    engagementAdapterStore.delete(name);
}

/**
 * Get an engagement adapter from the adapter store
 */
export function getAdapter(name: string): EngagementAdapter | undefined {
    return engagementAdapterStore.get(name);
}

/**
 * Get all engagement adapters from the adapter store
 */
export function getAllAdapters(): EngagementAdapter[] {
    return Array.from(engagementAdapterStore.values());
}
