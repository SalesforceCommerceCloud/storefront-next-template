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
/**
 * Canonical inventory refinements. URL inventory values express a filter preference only.
 * Showing unavailable products is the default; native availability filtering is explicit.
 */
export function normalizeLocalInventorySearch(params: URLSearchParams, inventoryId?: string, storeId?: string) {
    const next = new URLSearchParams(params);
    const refinements = next.getAll('refine');
    const hideUnavailable = refinements.includes('orderable_only=true');
    const expected = refinements.filter((value) => !/^(ilids|orderable_only)=/.test(value));
    if (inventoryId && hideUnavailable) expected.push(`ilids=${inventoryId}`, 'orderable_only=true');
    if (JSON.stringify(expected) !== JSON.stringify(refinements) || next.get('inventoryStore') !== (storeId ?? null)) {
        next.delete('refine');
        expected.forEach((value) => next.append('refine', value));
        next.delete('offset');
        next.delete('page');
        next.delete('inventoryStore');
        if (storeId) next.set('inventoryStore', storeId);
    }
    return next;
}
