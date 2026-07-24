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
import { describe, test, expect, vi } from 'vitest';
import { resolvePage } from './resolve-page';
import { RequiredError } from '../errors/required';
import type { AttributeResolutionContext } from './attribute-resolution';
import type { ManifestStorage, PageManifest, SiteManifest, QualifierContext, ComponentManifest } from '../types';
import type { ShopperExperience } from '@/scapi-client/types';

const testAttrCtx: AttributeResolutionContext = {
    host: 'https://www.shop.example',
    resolveMediaUrl: ({ libraryDomain, path }) => `https://www.shop.example/${libraryDomain}${path}`,
};

const makePage = (id = 'resolved-page') => ({
    id,
    typeId: 'storePage',
    regions: [],
});

const makePageManifest = (overrides: Partial<PageManifest> = {}): PageManifest => ({
    pageId: 'test-page',
    context: { campaignQualifiers: [], customerGroups: [], dataBindings: [] },
    variationOrder: ['default'],
    variations: {
        default: {
            ruleRequiresContext: false,
            pageRequiresContext: false,
            page: makePage(),
            regions: {},
        },
    },
    defaultVariation: 'default',
    componentInfo: {},
    ...overrides,
});

const makeSiteManifest = (overrides: Partial<SiteManifest> = {}): SiteManifest => ({
    contentObjectAssignments: {},
    categories: {},
    ...overrides,
});

const makeStorage = (
    pageManifest: PageManifest | null = makePageManifest(),
    siteManifest: SiteManifest = makeSiteManifest(),
    componentManifest: ComponentManifest | null = null
): ManifestStorage => ({
    getPageManifest: vi.fn(() => Promise.resolve(pageManifest as PageManifest)),
    getComponentManifest: vi.fn(() => Promise.resolve(componentManifest)),
    getSiteManifest: vi.fn(() => Promise.resolve(siteManifest)),
});

const makeComponentManifest = (overrides: Partial<ComponentManifest> = {}): ComponentManifest => ({
    componentId: 'header',
    component: {
        id: 'header',
        typeId: 'embedded.header',
        regions: [],
    },
    context: { campaignQualifiers: [], customerGroups: [], dataBindings: [] },
    componentInfo: {},
    requiresContext: false,
    ...overrides,
});

describe('resolvePage', () => {
    test('resolves a page by direct page ID', async () => {
        const storage = makeStorage();

        const result = await resolvePage({
            id: 'homepage',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
        });

        expect(result).not.toBeNull();
        expect(result?.id).toBe('resolved-page');
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(storage.getSiteManifest).not.toHaveBeenCalled();
    });

    test('resolves a product ID via content assignment', async () => {
        const siteManifest = makeSiteManifest({
            contentObjectAssignments: {
                pdp: {
                    product: {
                        'prod-1': { lookupMode: 'category-explicit', contentId: 'page-prod-1' },
                    },
                },
            },
        });

        const pageManifest = makePageManifest({ pageId: 'page-prod-1' });
        const storage = makeStorage(pageManifest, siteManifest);

        const result = await resolvePage({
            id: 'prod-1',
            attrCtx: testAttrCtx,
            identifierType: 'product',
            aspectType: 'pdp',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
        });

        expect(result).not.toBeNull();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(storage.getSiteManifest).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(storage.getPageManifest).toHaveBeenCalledWith('page-prod-1');
    });

    test('returns null when product ID has no content assignment', async () => {
        const storage = makeStorage(null, makeSiteManifest());

        const result = await resolvePage({
            id: 'unknown-product',
            attrCtx: testAttrCtx,
            identifierType: 'product',
            aspectType: 'pdp',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
        });

        expect(result).toBeNull();
    });

    test('returns null when page manifest is not found', async () => {
        const storage = makeStorage(null);

        const result = await resolvePage({
            id: 'missing-page',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
        });

        expect(result).toBeNull();
    });

    test('returns null when no variation matches', async () => {
        const pageManifest = makePageManifest({
            variationOrder: ['vip-only'],
            variations: {
                'vip-only': {
                    ruleRequiresContext: true,
                    pageRequiresContext: false,
                    visibilityRule: { activeLocales: ['en-US'], customerGroups: ['vip'] },
                    page: makePage(),
                    regions: {},
                },
            },
            defaultVariation: 'nonexistent',
        });

        const storage = makeStorage(pageManifest);

        const result = await resolvePage({
            id: 'homepage',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
            contextResolver: () =>
                Promise.resolve({
                    customerGroups: {},
                    campaignQualifiers: {},
                }),
        });

        expect(result).toBeNull();
    });

    test('calls contextResolver when pageRequiresContext is true', async () => {
        const contextResolver = vi.fn(
            (): Promise<QualifierContext> =>
                Promise.resolve({
                    customerGroups: { vip: true },
                    campaignQualifiers: {},
                })
        );

        const pageManifest = makePageManifest({
            variationOrder: ['default'],
            variations: {
                default: {
                    ruleRequiresContext: false,
                    pageRequiresContext: true,
                    page: makePage(),
                    regions: {},
                },
            },
            componentInfo: {},
        });

        const storage = makeStorage(pageManifest);

        await resolvePage({
            id: 'homepage',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
            contextResolver,
        });

        expect(contextResolver).toHaveBeenCalled();
    });

    test('does not call contextResolver when pageRequiresContext is false', async () => {
        const contextResolver = vi.fn(
            (): Promise<QualifierContext> =>
                Promise.resolve({
                    customerGroups: {},
                    campaignQualifiers: {},
                })
        );

        const pageManifest = makePageManifest({
            variationOrder: ['default'],
            variations: {
                default: {
                    ruleRequiresContext: false,
                    pageRequiresContext: false,
                    page: makePage(),
                    regions: {},
                },
            },
        });

        const storage = makeStorage(pageManifest);

        await resolvePage({
            id: 'homepage',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
            contextResolver,
        });

        expect(contextResolver).not.toHaveBeenCalled();
    });

    test('throws RequiredError when aspectType is missing for product type', async () => {
        const storage = makeStorage(null, makeSiteManifest());

        await expect(
            resolvePage({
                id: 'prod-1',
                attrCtx: testAttrCtx,
                identifierType: 'product',
                locale: 'en-US',
                defaultLocale: 'en-US',
                manifestStorage: storage,
            })
        ).rejects.toThrow(RequiredError);
    });

    test('throws RequiredError when aspectType is missing for category type', async () => {
        const storage = makeStorage(null, makeSiteManifest());

        await expect(
            resolvePage({
                id: 'cat-1',
                attrCtx: testAttrCtx,
                identifierType: 'category',
                locale: 'en-US',
                defaultLocale: 'en-US',
                manifestStorage: storage,
            })
        ).rejects.toThrow(RequiredError);
    });

    test('throws RequiredError when aspectType is an empty string', async () => {
        const storage = makeStorage(null, makeSiteManifest());

        await expect(
            resolvePage({
                id: 'prod-1',
                attrCtx: testAttrCtx,
                identifierType: 'product',
                aspectType: '',
                locale: 'en-US',
                defaultLocale: 'en-US',
                manifestStorage: storage,
            })
        ).rejects.toThrow(RequiredError);
    });

    test('filters components based on visibility rules in the resolved page', async () => {
        const page = {
            id: 'homepage',
            typeId: 'storePage',
            regions: [
                {
                    id: 'main',
                    components: [
                        { id: 'public-banner', typeId: 'banner', regions: [] },
                        { id: 'vip-offer', typeId: 'promo', regions: [] },
                    ],
                },
            ],
        };

        const pageManifest = makePageManifest({
            variationOrder: ['default'],
            variations: {
                default: {
                    ruleRequiresContext: false,
                    pageRequiresContext: true,
                    page,
                    regions: {},
                },
            },
            componentInfo: {
                'public-banner': {
                    visibilityRules: [],
                    regions: {},
                },
                'vip-offer': {
                    visibilityRules: [{ activeLocales: ['en-US'], customerGroups: ['vip'] }],
                    regions: {},
                },
            },
        });

        const storage = makeStorage(pageManifest);

        const result = await resolvePage({
            id: 'homepage',
            attrCtx: testAttrCtx,
            identifierType: 'page',
            locale: 'en-US',
            defaultLocale: 'en-US',
            manifestStorage: storage,
            contextResolver: () =>
                Promise.resolve({
                    customerGroups: {},
                    campaignQualifiers: {},
                }),
        });

        expect(result?.regions?.[0].components?.map((c) => c.id)).toEqual(['public-banner']);
    });

    describe('page metadata + pageContent overlay', () => {
        const makePageWithMetadata = (id = 'resolved-page'): ShopperExperience.schemas['Page'] => ({
            id,
            typeId: 'storePage',
            regions: [],
            name: 'Default Name',
            aspectTypeId: 'pdpAspect',
            description: 'Default description.',
            pageTitle: 'Default Title',
            pageDescription: 'Default page description.',
            pageKeywords: 'default,keywords',
        });

        test('surfaces page metadata fields at the default locale', async () => {
            const pageManifest = makePageManifest({
                variations: {
                    default: {
                        ruleRequiresContext: false,
                        pageRequiresContext: false,
                        page: makePageWithMetadata(),
                        regions: {},
                    },
                },
            });
            const storage = makeStorage(pageManifest);

            const result = await resolvePage({
                id: 'homepage',
                attrCtx: testAttrCtx,
                identifierType: 'page',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Default Name');
            expect(result?.aspectTypeId).toBe('pdpAspect');
            expect(result?.description).toBe('Default description.');
            expect(result?.pageTitle).toBe('Default Title');
            expect(result?.pageDescription).toBe('Default page description.');
            expect(result?.pageKeywords).toBe('default,keywords');
        });

        test('applies pageContent overlay (full replacement) for non-default locale', async () => {
            const pageManifest = makePageManifest({
                variations: {
                    default: {
                        ruleRequiresContext: false,
                        pageRequiresContext: false,
                        page: makePageWithMetadata(),
                        pageContent: {
                            fr_FR: {
                                name: 'Nom Localisé',
                                pageTitle: 'Titre Localisé',
                                pageDescription: 'Description localisée.',
                                pageKeywords: 'mots,clés',
                                description: 'Description française.',
                                aspectTypeId: 'pdpAspect',
                            },
                        },
                        regions: {},
                    },
                },
            });
            const storage = makeStorage(pageManifest);

            const result = await resolvePage({
                id: 'homepage',
                attrCtx: testAttrCtx,
                identifierType: 'page',
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Nom Localisé');
            expect(result?.pageTitle).toBe('Titre Localisé');
            expect(result?.pageDescription).toBe('Description localisée.');
            expect(result?.pageKeywords).toBe('mots,clés');
            expect(result?.description).toBe('Description française.');
            expect(result?.aspectTypeId).toBe('pdpAspect');
            // Structural fields are never overlaid.
            expect(result?.id).toBe('resolved-page');
            expect(result?.typeId).toBe('storePage');
        });

        test('falls back to default-locale page metadata when overlay is absent for the requested locale', async () => {
            const pageManifest = makePageManifest({
                variations: {
                    default: {
                        ruleRequiresContext: false,
                        pageRequiresContext: false,
                        page: makePageWithMetadata(),
                        pageContent: {
                            fr_FR: {
                                name: 'Nom Localisé',
                            },
                        },
                        regions: {},
                    },
                },
            });
            const storage = makeStorage(pageManifest);

            // Request a locale not listed in pageContent.
            const result = await resolvePage({
                id: 'homepage',
                attrCtx: testAttrCtx,
                identifierType: 'page',
                locale: 'de_DE',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Default Name');
            expect(result?.pageTitle).toBe('Default Title');
            expect(result?.pageDescription).toBe('Default page description.');
        });

        test('falls back to default-locale page metadata when pageContent is absent entirely', async () => {
            const pageManifest = makePageManifest({
                variations: {
                    default: {
                        ruleRequiresContext: false,
                        pageRequiresContext: false,
                        page: makePageWithMetadata(),
                        regions: {},
                    },
                },
            });
            const storage = makeStorage(pageManifest);

            const result = await resolvePage({
                id: 'homepage',
                attrCtx: testAttrCtx,
                identifierType: 'page',
                locale: 'fr_FR',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Default Name');
            expect(result?.pageTitle).toBe('Default Title');
        });
    });

    describe('component identifier type', () => {
        test('resolves an embedded component by id without site or page lookup', async () => {
            const componentManifest = makeComponentManifest({
                componentId: 'header',
                component: {
                    id: 'header',
                    typeId: 'embedded.header',
                    regions: [
                        {
                            id: 'main',
                            components: [{ id: 'logo', typeId: 'commerce_assets.logo', regions: [] }],
                        },
                    ],
                },
            });
            const storage = makeStorage(null, makeSiteManifest(), componentManifest);

            const result = await resolvePage({
                id: 'header',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
            expect(result?.id).toBe('header');
            expect(result?.typeId).toBe('embedded.header');
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(storage.getComponentManifest).toHaveBeenCalledWith('header');
            // Component flow must skip the site manifest and the page-manifest path.
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(storage.getSiteManifest).not.toHaveBeenCalled();
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(storage.getPageManifest).not.toHaveBeenCalled();
        });

        test('returns null when the component manifest is not found (fail-open)', async () => {
            const storage = makeStorage(null, makeSiteManifest(), null);

            const result = await resolvePage({
                id: 'missing-component',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).toBeNull();
        });

        test('skips contextResolver when requiresContext is false', async () => {
            const contextResolver = vi.fn(
                (): Promise<QualifierContext> =>
                    Promise.resolve({
                        customerGroups: {},
                        campaignQualifiers: {},
                    })
            );
            const componentManifest = makeComponentManifest({ requiresContext: false });
            const storage = makeStorage(null, makeSiteManifest(), componentManifest);

            await resolvePage({
                id: 'header',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
                contextResolver,
            });

            expect(contextResolver).not.toHaveBeenCalled();
        });

        test('calls contextResolver when requiresContext is true', async () => {
            const contextResolver = vi.fn(
                (): Promise<QualifierContext> =>
                    Promise.resolve({
                        customerGroups: { vip: true },
                        campaignQualifiers: {},
                    })
            );
            const componentManifest = makeComponentManifest({ requiresContext: true });
            const storage = makeStorage(null, makeSiteManifest(), componentManifest);

            await resolvePage({
                id: 'header',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
                contextResolver,
            });

            expect(contextResolver).toHaveBeenCalledTimes(1);
            expect(contextResolver).toHaveBeenCalledWith(componentManifest.context);
        });

        test('filters child components based on visibility rules', async () => {
            const componentManifest = makeComponentManifest({
                componentId: 'header',
                component: {
                    id: 'header',
                    typeId: 'embedded.header',
                    regions: [
                        {
                            id: 'main',
                            components: [
                                { id: 'public-logo', typeId: 'commerce_assets.logo', regions: [] },
                                { id: 'vip-banner', typeId: 'commerce_assets.banner', regions: [] },
                            ],
                        },
                    ],
                },
                componentInfo: {
                    'public-logo': { visibilityRules: [], regions: {} },
                    'vip-banner': {
                        visibilityRules: [{ activeLocales: ['en_US'], customerGroups: ['vip'] }],
                        regions: {},
                    },
                },
                requiresContext: true,
            });
            const storage = makeStorage(null, makeSiteManifest(), componentManifest);

            const result = await resolvePage({
                id: 'header',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
                contextResolver: () =>
                    Promise.resolve({
                        customerGroups: {},
                        campaignQualifiers: {},
                    }),
            });

            expect(result?.regions?.[0].components?.map((c) => c.id)).toEqual(['public-logo']);
        });

        test('does not require aspectType for component identifier type', async () => {
            const componentManifest = makeComponentManifest();
            const storage = makeStorage(null, makeSiteManifest(), componentManifest);

            // Neither aspectType nor categoryId — RequiredError should not fire.
            const result = await resolvePage({
                id: 'header',
                attrCtx: testAttrCtx,
                identifierType: 'component',
                locale: 'en_US',
                defaultLocale: 'en_US',
                manifestStorage: storage,
            });

            expect(result).not.toBeNull();
        });
    });
});
