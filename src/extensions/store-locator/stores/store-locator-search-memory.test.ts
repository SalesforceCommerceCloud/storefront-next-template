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
import { describe, expect, test } from 'vitest';
import {
    getStoreLocatorSearchMemory,
    getStoreLocatorSearchMemoryKey,
    isStoreLocatorSearchMemory,
} from './store-locator-search-memory';

describe('store locator search memory', () => {
    test('uses independent session-storage keys per site', () => {
        expect(getStoreLocatorSearchMemoryKey('site-a')).not.toBe(getStoreLocatorSearchMemoryKey('site-b'));
    });

    test('rejects search results with a non-array stores data payload', () => {
        const malformedMemory = {
            mode: 'input',
            searchParams: { countryCode: 'US', postalCode: '94105' },
            searchResult: { success: true, stores: { data: {} } },
        };
        sessionStorage.setItem(getStoreLocatorSearchMemoryKey('test-site'), JSON.stringify(malformedMemory));

        expect(isStoreLocatorSearchMemory(malformedMemory)).toBe(false);
        expect(getStoreLocatorSearchMemory('test-site')).toBeUndefined();
    });
});
