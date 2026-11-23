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
import { describe, expect, it } from 'vitest';
import { normalizeLocalInventorySearch } from './local-inventory-search';

describe('inventory search URL', () => {
    it('replaces every obsolete list, preserves unrelated parameters, and resets both pagination modes', () => {
        const next = normalizeLocalInventorySearch(
            new URLSearchParams(
                'q=milk&sort=price-low-to-high&refine=c_brand=Coop&refine=ilids=old|other&refine=ilids=another&refine=orderable_only=true&offset=48&page=3&inventoryStore=A'
            ),
            'list-B',
            'B'
        );
        expect(next.getAll('refine')).toEqual(['c_brand=Coop', 'ilids=list-B', 'orderable_only=true']);
        expect(next.get('q')).toBe('milk');
        expect(next.get('sort')).toBe('price-low-to-high');
        expect(next.has('offset')).toBe(false);
        expect(next.has('page')).toBe(false);
        expect(next.get('inventoryStore')).toBe('B');
    });
    it('clears inventory refinements and preserves ordinary filters after deselection', () => {
        const next = normalizeLocalInventorySearch(
            new URLSearchParams(
                'refine=cgid=food&refine=ilids=list-A&refine=orderable_only=true&offset=24&inventoryStore=A'
            )
        );
        expect(next.getAll('refine')).toEqual(['cgid=food']);
        expect(next.has('offset')).toBe(false);
        expect(next.has('inventoryStore')).toBe(false);
    });
    it('is idempotent and preserves a valid page window', () => {
        const input = new URLSearchParams(
            'refine=c_brand=Coop&refine=ilids=list-A&refine=orderable_only=true&inventoryStore=A&offset=48'
        );
        expect(normalizeLocalInventorySearch(input, 'list-A', 'A').toString()).toBe(input.toString());
    });
    it('showing all never requires inventory refinement and resets pages on store change', () => {
        const input = new URLSearchParams('q=bread&inventoryStore=A&offset=48');
        const next = normalizeLocalInventorySearch(input, 'list-B', 'B');
        expect(next.get('q')).toBe('bread');
        expect(next.has('offset')).toBe(false);
        expect(next.getAll('refine')).toEqual([]);
    });
});
