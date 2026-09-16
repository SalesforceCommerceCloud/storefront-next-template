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
import {
    resolvePreloadResources,
    type PageDesignerPreloadManifest,
} from '@salesforce/storefront-next-runtime/design/preload';
import type { ShopperExperience } from '@/scapi';
import { collectComponentTypeIds } from './component-identifiers';

describe('critical Page Designer region preparation planning', () => {
    it('selects direct children without speculatively traversing nested payloads', () => {
        const region = {
            id: 'main',
            components: [
                {
                    id: 'layout',
                    typeId: 'Layout.hero',
                    regions: [{ id: 'nested', components: [{ id: 'hero', typeId: 'Content.hero' }] }],
                },
                { id: 'banner', typeId: 'Content.banner' },
            ],
        } as ShopperExperience.schemas['Region'];
        const manifest: PageDesignerPreloadManifest = {
            resources: ['layout.js', 'hero.js', 'banner.js'].map((file) => ({
                file: `assets/${file}`,
                kind: 'module',
            })),
            components: {
                'Layout.hero': { entries: [0] },
                'Content.hero': { entries: [1] },
                'Content.banner': { entries: [2] },
            },
        };

        const typeIds = [...collectComponentTypeIds(region)];
        const resources = resolvePreloadResources(manifest, typeIds, { bundlePath: '/' });

        expect(typeIds).toEqual(['Layout.hero', 'Content.banner']);
        expect(resources).toEqual([
            { kind: 'module', href: '/assets/layout.js' },
            { kind: 'module', href: '/assets/banner.js' },
        ]);
    });
});
