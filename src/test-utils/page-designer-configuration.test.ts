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
import type { ShopperExperience } from '@/scapi';
import { createPageDesignerHostMetadata } from './page-designer-configuration';

type Page = ShopperExperience.schemas['Page'];

function page(value: unknown): Page {
    return value as Page;
}

describe('createPageDesignerHostMetadata', () => {
    it('maps root components by real id with type, properties, and title label', () => {
        const metadata = createPageDesignerHostMetadata(
            page({
                id: 'storybook-page',
                regions: [
                    {
                        id: 'header',
                        components: [
                            {
                                id: 'header-1',
                                typeId: 'banner',
                                contentLinkUuid: 'uuid-header-1',
                                data: { title: 'Welcome Banner Content Block' },
                                visible: true,
                            },
                        ],
                    },
                ],
            })
        );

        expect(metadata.components['header-1']).toEqual({
            id: 'header-1',
            type: 'banner',
            properties: { title: 'Welcome Banner Content Block' },
            visibility: 'visible',
            name: 'Welcome Banner Content Block',
        });
        expect(metadata.components['uuid-header-1']).toBeUndefined();
        expect(metadata.componentTypes.banner).toEqual({
            id: 'banner',
            name: 'banner',
            image: '',
            label: 'Welcome Banner Content Block',
        });
    });

    it('visits nested regions and keeps each component under its own id', () => {
        const metadata = createPageDesignerHostMetadata(
            page({
                id: 'nested',
                regions: [
                    {
                        id: 'main',
                        components: [
                            {
                                id: 'layout-1',
                                typeId: 'one-column-layout',
                                data: { title: 'Layout' },
                                regions: [
                                    {
                                        id: 'inner',
                                        components: [
                                            {
                                                id: 'leaf-a',
                                                typeId: 'text-block',
                                                data: { title: 'Leaf A' },
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        );

        expect(Object.keys(metadata.components)).toEqual(['layout-1', 'leaf-a']);
        expect(metadata.components['leaf-a']?.type).toBe('text-block');
        expect(metadata.componentTypes['text-block']?.id).toBe('text-block');
        expect(metadata.componentTypes['one-column-layout']?.label).toBe('Layout');
    });

    it('dedupes repeated type ids and falls back to typeId when title is missing', () => {
        const metadata = createPageDesignerHostMetadata(
            page({
                id: 'dupes',
                regions: [
                    {
                        id: 'main',
                        components: [
                            { id: 'hero-1', typeId: 'hero-carousel', data: { title: 'Slide 1' } },
                            { id: 'hero-2', typeId: 'hero-carousel', data: { title: 'Slide 2' } },
                            { id: 'untitled', typeId: 'cta', data: {} },
                        ],
                    },
                ],
            })
        );

        expect(Object.keys(metadata.componentTypes)).toEqual(['hero-carousel', 'cta']);
        expect(metadata.componentTypes['hero-carousel']?.label).toBe('Slide 1');
        expect(metadata.components['hero-2']?.type).toBe('hero-carousel');
        expect(metadata.componentTypes.cta?.label).toBe('cta');
        expect(metadata.components.untitled?.name).toBe('cta');
    });

    it('copies component properties and marks hidden components', () => {
        const metadata = createPageDesignerHostMetadata(
            page({
                id: 'props',
                regions: [
                    {
                        id: 'main',
                        components: [
                            {
                                id: 'promo',
                                typeId: 'promo',
                                data: { title: 'Offer', flushAxis: 'x' },
                                visible: false,
                            },
                        ],
                    },
                ],
            })
        );

        expect(metadata.components.promo?.properties).toEqual({ title: 'Offer', flushAxis: 'x' });
        expect(metadata.components.promo?.visibility).toBe('hidden');
    });

    it('returns empty maps for an empty or missing page', () => {
        expect(
            createPageDesignerHostMetadata(
                page({
                    id: 'empty-page',
                    regions: [
                        { id: 'empty-region-1', components: [] },
                        { id: 'empty-region-2', components: [] },
                    ],
                })
            )
        ).toEqual({ components: {}, componentTypes: {} });
        expect(createPageDesignerHostMetadata(undefined)).toEqual({ components: {}, componentTypes: {} });
    });
});
