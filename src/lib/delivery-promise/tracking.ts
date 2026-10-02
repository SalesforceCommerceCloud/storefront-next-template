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
import { getCityByHubId } from './city-management';

const FALLBACK_PREFIX = 'DRS-';
const DIGITS = 8;

/** FNV-1a 32-bit hash: enough entropy for a mock, and stable across runs. */
function hash(value: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

/**
 * Mock tracking number: the hub's `trackingPrefix` + 8 digits derived from `seed`. The same hub and seed
 * always give the same number, so confirmation and re-renders agree.
 */
export function generateTrackingNumber(hubId: string, seed: string): string {
    const prefix = getCityByHubId(hubId)?.hub.trackingPrefix ?? FALLBACK_PREFIX;
    const digits = String(hash(`${hubId}:${seed}`) % 10 ** DIGITS).padStart(DIGITS, '0');
    return `${prefix}${digits}`;
}
