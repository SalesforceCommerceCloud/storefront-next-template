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
import type { ShopperExperience } from '@/scapi';
import { collectComponentTypeIds } from './component-identifiers';

const createComponent = (id: string, typeId: string, regions: ShopperExperience.schemas['Region'][] = []) =>
    ({ id, typeId, regions }) as ShopperExperience.schemas['Component'];

const createRegion = (components: ShopperExperience.schemas['Component'][], id = 'region') =>
    ({ id, components }) as ShopperExperience.schemas['Region'];

describe('collectComponentTypeIds', () => {
    test('collects only direct children and dedupes type IDs in payload order', () => {
        const nested = createComponent('nested', 'Content.nestedOnly');
        const selected = createRegion(
            [
                createComponent('hero', 'Content.hero', [createRegion([nested], 'nested')]),
                createComponent('again', 'Content.shared'),
            ],
            'main'
        );
        const result = collectComponentTypeIds(selected);

        expect([...result]).toEqual(['Content.hero', 'Content.shared']);
    });

    test('returns empty sets for a missing region', () => {
        expect(collectComponentTypeIds(undefined)).toEqual(new Set());
    });

    test('returns empty sets for an empty region', () => {
        expect(collectComponentTypeIds(createRegion([], 'main'))).toEqual(new Set());
    });

    test('handles regions and components without nested collections', () => {
        const component = {
            id: 'hero',
            typeId: 'Content.hero',
            regions: undefined,
        } as ShopperExperience.schemas['Component'];
        const withoutComponents = {
            id: 'empty',
            components: undefined,
        } as ShopperExperience.schemas['Region'];

        expect(collectComponentTypeIds(createRegion([component], 'main'))).toEqual(new Set(['Content.hero']));
        expect(collectComponentTypeIds(withoutComponents)).toEqual(new Set());
    });
});
