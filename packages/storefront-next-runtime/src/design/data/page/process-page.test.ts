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
import { describe, test, expect } from 'vitest';
import { processPage, type PageProcessorContext } from './process-page';
import type { AttributeDefinition, AttributeResolutionContext } from './attribute-resolution';
import type { ShopperExperience } from '@/scapi-client/types';

const testAttrCtx: AttributeResolutionContext = {
    host: 'https://www.shop.example',
    resolveMediaUrl: ({ libraryDomain, path }) => `https://www.shop.example/${libraryDomain}${path}`,
};

type Page = ShopperExperience.schemas['Page'];
type Component = ShopperExperience.schemas['Component'];

const makeComponent = (id: string, overrides: Partial<Component> = {}) => ({
    id,
    typeId: `type.${id}`,
    regions: [] as ShopperExperience.schemas['Region'][],
    ...overrides,
});

const makeRegion = (id: string, components: ShopperExperience.schemas['Component'][] = []) => ({
    id,
    components,
});

const makePage = (regions: ShopperExperience.schemas['Region'][] = []): Page => ({
    id: 'test-page',
    typeId: 'storePage',
    regions,
});

const regionConfig = (maxComponents?: number) => ({
    maxComponents,
});

describe('processPage', () => {
    describe('visibility rules', () => {
        test('keeps components without visibility rules', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);
            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components).toHaveLength(1);
            expect(result.regions?.[0].components?.[0].id).toBe('banner');
        });

        test('removes components whose visibility rules fail', () => {
            const page = makePage([makeRegion('main', [makeComponent('public-banner'), makeComponent('vip-offer')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    'public-banner': {
                        visibilityRules: [],
                        regions: {},
                    },
                    'vip-offer': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.map((c) => c.id)).toEqual(['public-banner']);
        });

        test('keeps components whose visibility rules pass', () => {
            const page = makePage([makeRegion('main', [makeComponent('vip-offer')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: { vip: true }, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    'vip-offer': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components).toHaveLength(1);
        });

        test('keeps component when any visibility rule passes (OR logic)', () => {
            const page = makePage([makeRegion('main', [makeComponent('promo')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: { vip: true },
                    campaignQualifiers: {},
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    promo: {
                        visibilityRules: [
                            { activeLocales: ['en_US'], customerGroups: ['vip'] },
                            {
                                activeLocales: ['en_US'],
                                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'discount' }],
                            },
                        ],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components).toHaveLength(1);
            expect(result.regions?.[0].components?.[0].id).toBe('promo');
        });

        test('removes component when all visibility rules fail', () => {
            const page = makePage([makeRegion('main', [makeComponent('promo')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: {},
                    campaignQualifiers: {},
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    promo: {
                        visibilityRules: [
                            { activeLocales: ['en_US'], customerGroups: ['vip'] },
                            {
                                activeLocales: ['en_US'],
                                campaignQualifiers: [{ campaignId: 'sale', promotionId: 'discount' }],
                            },
                        ],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components).toHaveLength(0);
        });
    });

    describe('descendant traversal', () => {
        test('filters nested components with failing visibility rules', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('nested-vip')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: {},
                    },
                    'nested-vip': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const container = result.regions?.[0].components?.[0];
            expect(container?.id).toBe('container');
            expect(container?.regions?.[0].components).toHaveLength(0);
        });

        test('resolves data bindings on nested components', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [
                            makeRegion('inner', [
                                makeComponent('bound-child', {
                                    data: { heading: 'Fallback' } as unknown as Component['data'],
                                }),
                            ]),
                        ],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: {},
                    campaignQualifiers: {},
                    dataBindings: {
                        content_asset: { 'asset-1': { title: 'Resolved Title' } },
                    },
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        dataBinding: undefined,
                        regions: {},
                    },
                    'bound-child': {
                        visibilityRules: [],
                        dataBinding: {
                            expressions: { heading: 'content_asset.title' },
                            contexts: [{ type: 'content_asset', id: 'asset-1' }],
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const child = result.regions?.[0].components?.[0].regions?.[0].components?.[0];
            expect((child?.data as Record<string, unknown>).heading).toBe('Resolved Title');
        });

        test('traverses children when component is not in componentInfo', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('unknown-container', {
                        regions: [makeRegion('inner', [makeComponent('nested-vip')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    'nested-vip': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const container = result.regions?.[0].components?.[0];
            expect(container?.id).toBe('unknown-container');
            expect(container?.regions?.[0].components).toHaveLength(0);
        });

        test('always traverses descendants regardless of descendant flags', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('child')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: {},
                    },
                    child: {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const container = result.regions?.[0].components?.[0];
            // Child is removed because descendants are always traversed
            expect(container?.regions?.[0].components).toHaveLength(0);
        });
    });

    describe('data binding resolution', () => {
        test('resolves data binding expressions on components', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Fallback' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: {},
                    campaignQualifiers: {},
                    dataBindings: {
                        content_asset: { 'asset-1': { title: 'Winter Sale' } },
                    },
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        dataBinding: {
                            expressions: { heading: 'content_asset.title' },
                            contexts: [{ type: 'content_asset', id: 'asset-1' }],
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Winter Sale');
        });

        test('leaves components unchanged when no dataBindings are provided', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Static' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Static');
        });
    });

    describe('locale content resolution', () => {
        test('merges locale-specific content into component data', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Default Heading' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English Heading', subtitle: 'English Subtitle' },
                            fr_FR: { heading: 'Titre Français', subtitle: 'Sous-titre Français' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('English Heading');
            expect(data.subtitle).toBe('English Subtitle');
        });

        test('selects content for the correct locale', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English' },
                            fr_FR: { heading: 'Français' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Français');
        });

        test('leaves component unchanged when no content exists for locale or default locale', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Original' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'ja_JP',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            fr_FR: { heading: 'French' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Original');
        });

        test('leaves component unchanged when componentInfo has no content', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Original' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Original');
        });

        test('applies default content when no locale-specific content exists', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'ja_JP',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'Default Heading', subtitle: 'Default Subtitle' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Default Heading');
            expect(data.subtitle).toBe('Default Subtitle');
        });

        test('locale-specific content overrides default content', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'Default Heading', subtitle: 'Default Subtitle' },
                            fr_FR: { heading: 'French Heading' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            // Locale-specific value overrides default
            expect(data.heading).toBe('French Heading');
            // Default value is preserved for attributes not overridden by locale
            expect(data.subtitle).toBe('Default Subtitle');
        });

        test('falls back to "default" bucket when locale and default locale have no content', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_GB',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            default: { heading: 'Willkommen' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Willkommen');
        });

        test('site-default-locale content overrides "default" bucket', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_GB',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            default: { heading: 'Willkommen' },
                            en_GB: { heading: 'Welcome' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            // en_US not authored -> falls back to en_GB (site default), not "default"
            expect(data.heading).toBe('Welcome');
        });

        test('locale-specific content takes precedence over both default tiers', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_GB',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            default: { heading: 'Willkommen' },
                            en_GB: { heading: 'Welcome' },
                            en_US: { heading: 'Howdy' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Howdy');
        });

        test('data bindings override locale content for bound attributes', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { heading: 'Default', body: 'Default Body' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: {},
                    campaignQualifiers: {},
                    dataBindings: {
                        content_asset: { 'asset-1': { title: 'Bound Title' } },
                    },
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'Locale Heading', body: 'Locale Body' },
                        },
                        dataBinding: {
                            expressions: { heading: 'content_asset.title' },
                            contexts: [{ type: 'content_asset', id: 'asset-1' }],
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            // Data binding overrides the locale content for 'heading'
            expect(data.heading).toBe('Bound Title');
            // Locale content is preserved for non-bound attributes
            expect(data.body).toBe('Locale Body');
        });
    });

    describe('localized flag', () => {
        test('sets localized to true when locale-specific content exists', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'Default' },
                            fr_FR: { heading: 'French' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const component = result.regions?.[0].components?.[0] as Record<string, unknown>;
            expect(component.localized).toBe(true);
        });

        test('sets localized to false when falling back to default locale only', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'ja_JP',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const component = result.regions?.[0].components?.[0] as Record<string, unknown>;
            expect(component.localized).toBe(false);
        });

        test('sets localized to false when componentInfo has no content', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const component = result.regions?.[0].components?.[0] as Record<string, unknown>;
            expect(component.localized).toBe(false);
        });
    });

    describe('visible flag', () => {
        test('sets visible to true on all processed components', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner'), makeComponent('promo')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: { visibilityRules: [], regions: {} },
                    promo: { visibilityRules: [], regions: {} },
                },
            };

            const result = processPage(page, context);
            const components = result.regions?.[0].components as Record<string, unknown>[];
            expect(components[0].visible).toBe(true);
            expect(components[1].visible).toBe(true);
        });

        test('sets visible to true on nested components', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('child')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: { visibilityRules: [], regions: {} },
                    child: { visibilityRules: [], regions: {} },
                },
            };

            const result = processPage(page, context);
            const container = result.regions?.[0].components?.[0] as Record<string, unknown>;
            const child = result.regions?.[0].components?.[0].regions?.[0].components?.[0] as Record<string, unknown>;
            expect(container.visible).toBe(true);
            expect(child.visible).toBe(true);
        });
    });

    describe('region maxComponents', () => {
        test('truncates components to maxComponents limit', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b'), makeComponent('c')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(2) },
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.[0].regions?.[0].components?.map((c) => c.id)).toEqual(['a', 'b']);
        });

        test('keeps all components when maxComponents is null', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b'), makeComponent('c')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig() },
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(3);
        });

        test('keeps all components when region is not in componentInfo regions', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b'), makeComponent('c')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(3);
        });

        test('applies maxComponents after visibility filtering', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [
                            makeRegion('inner', [
                                makeComponent('visible-1'),
                                makeComponent('hidden'),
                                makeComponent('visible-2'),
                                makeComponent('visible-3'),
                            ]),
                        ],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(2) },
                    },
                    'visible-1': { visibilityRules: [], regions: {} },
                    hidden: {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                    'visible-2': { visibilityRules: [], regions: {} },
                    'visible-3': { visibilityRules: [], regions: {} },
                },
            };

            const result = processPage(page, context);
            // 'hidden' is removed by visibility rules first, then maxComponents=2 keeps only the first 2 visible
            expect(result.regions?.[0].components?.[0].regions?.[0].components?.map((c) => c.id)).toEqual([
                'visible-1',
                'visible-2',
            ]);
        });

        test('handles maxComponents greater than component count', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(10) },
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(2);
        });

        test('handles maxComponents of zero', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(0) },
                    },
                },
            };

            const result = processPage(page, context);
            expect(result.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(0);
        });

        test('applies maxComponents independently per region', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [
                            makeRegion('header', [makeComponent('h1'), makeComponent('h2'), makeComponent('h3')]),
                            makeRegion('footer', [makeComponent('f1'), makeComponent('f2'), makeComponent('f3')]),
                        ],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: {
                            header: regionConfig(1),
                            footer: regionConfig(2),
                        },
                    },
                },
            };

            const result = processPage(page, context);
            const containerRegions = result.regions?.[0].components?.[0].regions;
            expect(containerRegions?.[0].components?.map((c) => c.id)).toEqual(['h1']);
            expect(containerRegions?.[1].components?.map((c) => c.id)).toEqual(['f1', 'f2']);
        });

        test('applies maxComponents to nested regions', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('n1'), makeComponent('n2'), makeComponent('n3')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(1) },
                    },
                },
            };

            const result = processPage(page, context);
            const innerRegion = result.regions?.[0].components?.[0].regions?.[0];
            expect(innerRegion?.components?.map((c) => c.id)).toEqual(['n1']);
        });
    });

    describe('pruneInvisible: false (preview mode)', () => {
        test('keeps invisible components with visible: false instead of removing them', () => {
            const page = makePage([makeRegion('main', [makeComponent('public'), makeComponent('vip-only')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    public: { visibilityRules: [], regions: {} },
                    'vip-only': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
                pruneInvisible: false,
            };

            const result = processPage(page, context);
            const components = result.regions?.[0].components as Record<string, unknown>[];
            expect(components).toHaveLength(2);
            expect(components[0].visible).toBe(true);
            expect(components[1].visible).toBe(false);
        });

        test('marks overflow components as visible: false instead of truncating', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [makeRegion('inner', [makeComponent('a'), makeComponent('b'), makeComponent('c')])],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(1) },
                    },
                },
                pruneInvisible: false,
            };

            const result = processPage(page, context);
            const components = result.regions?.[0].components?.[0].regions?.[0].components as Record<string, unknown>[];
            expect(components).toHaveLength(3);
            expect(components[0].visible).toBe(true);
            expect(components[1].visible).toBe(false);
            expect(components[2].visible).toBe(false);
        });

        test.each([
            {
                name: 'invisible in middle',
                ids: ['visible-1', 'hidden', 'visible-2', 'visible-3'],
                expected: [true, false, true, false],
            },
            {
                name: 'invisible at start',
                ids: ['hidden', 'visible-1', 'visible-2', 'visible-3'],
                expected: [false, true, true, false],
            },
            {
                name: 'invisible at end',
                ids: ['visible-1', 'visible-2', 'visible-3', 'hidden'],
                expected: [true, true, false, false],
            },
            {
                name: 'multiple invisible scattered',
                ids: ['hidden-1', 'visible-1', 'hidden-2', 'visible-2', 'visible-3'],
                expected: [false, true, false, true, false],
            },
        ])('maxComponents only counts visible components ($name)', ({ ids, expected }) => {
            const hiddenRule = [{ activeLocales: ['en_US'], customerGroups: ['vip'] }];
            const page = makePage([
                makeRegion('main', [
                    makeComponent('container', {
                        regions: [
                            makeRegion(
                                'inner',
                                ids.map((id) => makeComponent(id))
                            ),
                        ],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    container: {
                        visibilityRules: [],
                        regions: { inner: regionConfig(2) },
                    },
                    ...Object.fromEntries(
                        ids.map((id) => [
                            id,
                            {
                                visibilityRules: id.startsWith('hidden') ? hiddenRule : [],
                                regions: {},
                            },
                        ])
                    ),
                },
                pruneInvisible: false,
            };

            const result = processPage(page, context);
            const components = result.regions?.[0].components?.[0].regions?.[0].components as Record<string, unknown>[];
            expect(components).toHaveLength(ids.length);
            expect(components.map((c) => c.visible)).toEqual(expected);
        });
    });

    test('handles page with no regions', () => {
        const page = makePage();
        const context: PageProcessorContext = {
            attrCtx: testAttrCtx,
            qualifiers: null,
            locale: 'en_US',
            defaultLocale: 'en_US',
            pageInfo: { regions: {} },
            componentInfo: {},
        };

        const result = processPage(page, context);
        expect(result.regions).toEqual([]);
    });

    test('handles components not in componentInfo', () => {
        const page = makePage([makeRegion('main', [makeComponent('unknown')])]);
        const context: PageProcessorContext = {
            attrCtx: testAttrCtx,
            qualifiers: null,
            locale: 'en_US',
            defaultLocale: 'en_US',
            pageInfo: { regions: {} },
            componentInfo: {},
        };

        const result = processPage(page, context);
        expect(result.regions?.[0].components).toHaveLength(1);
    });

    describe('definition-driven attribute composition', () => {
        const componentTypes = (defs: Record<string, AttributeDefinition>) => ({
            'type.banner': { attributeDefinitions: defs },
        });

        test('uses active-locale value when present', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string', defaultValue: 'Definition Default' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English Heading' },
                            fr_FR: { heading: 'Titre Français' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Titre Français');
        });

        test('falls back to fallback-locale value when active locale has no value', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string', defaultValue: 'Definition Default' },
                    subtitle: { id: 'subtitle', type: 'string' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English Heading', subtitle: 'English Subtitle' },
                            fr_FR: { heading: 'Titre Français' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Titre Français');
            expect(data.subtitle).toBe('English Subtitle');
        });

        test('falls back to attrDef.defaultValue when neither locale has a value', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string', defaultValue: 'Definition Default' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: { en_US: {}, fr_FR: {} },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Definition Default');
        });

        test('omits the key when no value at any priority', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: { en_US: {}, fr_FR: {} },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data).not.toHaveProperty('heading');
        });

        test('drops attributes not declared in the type definitions', () => {
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { strayKey: 'should-be-dropped' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string', defaultValue: 'h' },
                }),
                componentInfo: {
                    banner: { visibilityRules: [], regions: {} },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data).toEqual({ heading: 'h' });
            expect(data).not.toHaveProperty('strayKey');
        });

        test('preserves explicit null/empty-string overrides over defaultValue', () => {
            // An attribute set to `null` or `""` in locale content is an
            // intentional value, not "missing". It must win over the
            // attribute-definition's defaultValue.
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    a: { id: 'a', type: 'string', defaultValue: 'def-a' },
                    b: { id: 'b', type: 'string', defaultValue: 'def-b' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { a: null, b: '' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.a).toBeNull();
            expect(data.b).toBe('');
        });

        test('data binding still overrides composed attribute values', () => {
            const page = makePage([makeRegion('main', [makeComponent('banner')])]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: {
                    customerGroups: {},
                    campaignQualifiers: {},
                    dataBindings: {
                        content_asset: { 'asset-1': { title: 'Bound Title' } },
                    },
                },
                locale: 'en_US',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentTypes: componentTypes({
                    heading: { id: 'heading', type: 'string', defaultValue: 'Definition Default' },
                }),
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: { en_US: { heading: 'Locale Heading' } },
                        dataBinding: {
                            expressions: { heading: 'content_asset.title' },
                            contexts: [{ type: 'content_asset', id: 'asset-1' }],
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.heading).toBe('Bound Title');
        });

        test('falls back to legacy merge when no componentTypes are supplied', () => {
            // No `componentTypes` map present. The processor should still
            // produce something sensible — the legacy merge of node.data +
            // defaultContent + localeContent.
            const page = makePage([
                makeRegion('main', [
                    makeComponent('banner', {
                        data: { fromNode: 'n', heading: 'Fallback' } as unknown as Component['data'],
                    }),
                ]),
            ]);

            const context: PageProcessorContext = {
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                pageInfo: { regions: {} },
                componentInfo: {
                    banner: {
                        visibilityRules: [],
                        content: {
                            en_US: { heading: 'English Heading' },
                            fr_FR: { heading: 'Titre Français' },
                        },
                        regions: {},
                    },
                },
            };

            const result = processPage(page, context);
            const data = result.regions?.[0].components?.[0].data as Record<string, unknown>;
            expect(data.fromNode).toBe('n');
            expect(data.heading).toBe('Titre Français');
        });
    });

    test('does not mutate the original page object', () => {
        const innerComponent = makeComponent('nested-vip');
        const innerRegion = makeRegion('inner', [innerComponent]);
        const container = makeComponent('container', { regions: [innerRegion] });
        const mainRegion = makeRegion('main', [container]);
        const page = makePage([mainRegion]);

        const context: PageProcessorContext = {
            attrCtx: testAttrCtx,
            qualifiers: { customerGroups: {}, campaignQualifiers: {} },
            locale: 'en_US',
            defaultLocale: 'en_US',
            pageInfo: { regions: {} },
            componentInfo: {
                container: {
                    visibilityRules: [],
                    regions: {},
                },
                'nested-vip': {
                    visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                    regions: {},
                },
            },
        };

        const result = processPage(page, context);

        // The nested-vip component should be filtered from the result
        expect(result.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(0);

        // The original page should still have the nested-vip component
        expect(page.regions?.[0].components?.[0].regions?.[0].components).toHaveLength(1);
        expect(page.regions?.[0].components?.[0].regions?.[0].components?.[0].id).toBe('nested-vip');
    });

    describe('component-rooted (ComponentManifest) input', () => {
        test('processes a component root and filters nested components by visibility', () => {
            const root: Component = {
                id: 'header',
                typeId: 'embedded.header',
                regions: [
                    {
                        id: 'main',
                        components: [makeComponent('public-logo'), makeComponent('vip-banner')],
                    },
                ],
            };
            const context: PageProcessorContext = {
                kind: 'component',
                attrCtx: testAttrCtx,
                qualifiers: { customerGroups: {}, campaignQualifiers: {} },
                locale: 'en_US',
                defaultLocale: 'en_US',
                componentInfo: {
                    'public-logo': { visibilityRules: [], regions: {} },
                    'vip-banner': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
            };

            const result = processPage(root, context);

            expect(result.id).toBe('header');
            expect(result.regions?.[0].components?.map((c) => c.id)).toEqual(['public-logo']);
        });

        test('applies locale content overlay on a component-rooted tree', () => {
            const root: Component = {
                id: 'header',
                typeId: 'embedded.header',
                regions: [
                    {
                        id: 'main',
                        components: [
                            makeComponent('greeting', {
                                data: { text: 'Hello' } as unknown as Component['data'],
                            }),
                        ],
                    },
                ],
            };
            const context: PageProcessorContext = {
                kind: 'component',
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                componentInfo: {
                    greeting: {
                        visibilityRules: [],
                        regions: {},
                        content: {
                            en_US: { text: 'Hello' },
                            fr_FR: { text: 'Bonjour' },
                        },
                    },
                },
            };

            const result = processPage(root, context);

            expect(result.regions?.[0].components?.[0].data).toEqual({ text: 'Bonjour' });
            expect(result.regions?.[0].components?.[0].localized).toBe(true);
        });

        test("honors region maxComponents on the root component's nested regions", () => {
            const root: Component = {
                id: 'header',
                typeId: 'embedded.header',
                regions: [
                    {
                        id: 'main',
                        components: [makeComponent('a'), makeComponent('b'), makeComponent('c')],
                    },
                ],
            };
            const context: PageProcessorContext = {
                kind: 'component',
                attrCtx: testAttrCtx,
                qualifiers: null,
                locale: 'en_US',
                defaultLocale: 'en_US',
                componentInfo: {
                    header: { visibilityRules: [], regions: { main: regionConfig(2) } },
                    a: { visibilityRules: [], regions: {} },
                    b: { visibilityRules: [], regions: {} },
                    c: { visibilityRules: [], regions: {} },
                },
            };

            const result = processPage(root, context);

            expect(result.regions?.[0].components?.map((c) => c.id)).toEqual(['a', 'b']);
        });
    });
});
