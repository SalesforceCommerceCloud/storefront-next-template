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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Mirrors the cartridge layout so the tests live outside the deployed cartridge.
const cartridgeDir = resolve(import.meta.dirname, '../../../../../app_storefrontnext_base');
const hookSource = readFileSync(resolve(cartridgeDir, 'cartridge/scripts/hooks/shopperConfiguration.js'), 'utf8');
const metaDir = resolve(cartridgeDir, 'staticfiles/cartridge/impex/default/meta/system-objecttype-extensions');

const GROUP_ID = 'sfnextShopperConfiguration';

const ObjectAttributeDefinition = {
    VALUE_TYPE_INT: 1,
    VALUE_TYPE_DOUBLE: 2,
    VALUE_TYPE_STRING: 3,
    VALUE_TYPE_TEXT: 4,
    VALUE_TYPE_HTML: 5,
    VALUE_TYPE_DATE: 6,
    VALUE_TYPE_IMAGE: 7,
    VALUE_TYPE_BOOLEAN: 8,
    VALUE_TYPE_MONEY: 9,
    VALUE_TYPE_QUANTITY: 10,
    VALUE_TYPE_DATETIME: 11,
    VALUE_TYPE_EMAIL: 12,
    VALUE_TYPE_PASSWORD: 13,
    VALUE_TYPE_SET_OF_STRING: 21,
    VALUE_TYPE_ENUM_OF_INT: 31,
    VALUE_TYPE_ENUM_OF_STRING: 33,
};

type AttributeSpec = { id: string; type: number; multi?: boolean; system?: boolean };
type Values = Record<string, unknown>;

/** Builds the { data: [{ groupId, id, value }] } envelope the MRT data store sync writes, in insertion order. */
function envelope(values: Values) {
    return { data: Object.entries(values).map(([id, value]) => ({ groupId: GROUP_ID, id, value })) };
}

function definition({ id, type, multi = false, system = false }: AttributeSpec) {
    return {
        getID: () => id,
        getValueTypeCode: () => type,
        isMultiValueType: () => multi,
        isSystem: () => system,
    };
}

/**
 * Mocks dw.content.MediaFile. getAbsImageURL(null) returns the plain URL; any transform returns disUrl, falling back
 * to the plain URL as the platform does when Dynamic Imaging is not configured.
 */
function mediaFile({
    url,
    absUrl,
    disUrl,
    alt = null,
    title = null,
}: {
    url?: string;
    absUrl?: string;
    disUrl?: string;
    alt?: string | null;
    title?: string | null;
}) {
    const toURL = (value?: string) => (value ? { toString: () => value } : null);
    return {
        getURL: () => toURL(url),
        getAbsImageURL: (transform: unknown) => toURL(transform ? (disUrl ?? absUrl) : absUrl),
        getAlt: () => alt,
        getTitle: () => title,
    };
}

function group(attributes: AttributeSpec[]) {
    return {
        getAttributeDefinitions: () => {
            const definitions = attributes.map(definition);
            let index = 0;
            return {
                iterator: () => ({
                    hasNext: () => index < definitions.length,
                    next: () => definitions[index++],
                }),
            };
        },
    };
}

function loadHook({
    siteGroup,
    globalGroup,
    siteValues = {},
    globalValues = {},
}: {
    siteGroup?: AttributeSpec[];
    globalGroup?: AttributeSpec[];
    siteValues?: Values;
    globalValues?: Values;
}) {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const groups: Record<string, ReturnType<typeof group> | null> = {
        SitePreferences: siteGroup ? group(siteGroup) : null,
        OrganizationPreferences: globalGroup ? group(globalGroup) : null,
    };
    const modules: Record<string, unknown> = {
        'dw/system/Logger': logger,
        'dw/object/ObjectAttributeDefinition': ObjectAttributeDefinition,
        'dw/system/Site': {
            getCurrent: () => ({ getCustomPreferenceValue: (id: string) => siteValues[id] ?? null }),
        },
        'dw/system/System': { getPreferences: () => ({ getCustom: () => globalValues }) },
        'dw/object/SystemObjectMgr': {
            describe: (typeId: string) => ({
                getAttributeGroup: (groupId: string) => (groupId === GROUP_ID ? groups[typeId] : null),
            }),
        },
    };
    const exports: { modifyGETResponse?: (configResp: unknown) => undefined } = {};
    runInNewContext(hookSource, { exports, require: (path: string) => modules[path] });
    if (!exports.modifyGETResponse) {
        throw new Error('Shopper configuration hook did not export modifyGETResponse');
    }
    return { modifyGETResponse: exports.modifyGETResponse, logger };
}

describe('shopper configuration response hook', () => {
    it('is registered for Shopper Configurations GET responses', () => {
        const hooks = JSON.parse(readFileSync(resolve(cartridgeDir, 'hooks.json'), 'utf8'));

        expect(hooks.hooks).toContainEqual({
            name: 'dw.shop.shopper_configuration.modifyGETResponse',
            script: './cartridge/scripts/hooks/shopperConfiguration',
        });
    });

    it('ships the exposed group, empty, for both site and global preferences', () => {
        for (const file of ['SitePreferences.xml', 'OrganizationPreferences.xml']) {
            const xml = readFileSync(resolve(metaDir, file), 'utf8');
            const groupXml = xml.match(
                new RegExp(`<attribute-group group-id="${GROUP_ID}">[\\s\\S]*?</attribute-group>`)
            );

            expect(groupXml, file).not.toBeNull();
            expect(groupXml?.[0], file).not.toContain('<attribute ');
        }
    });

    it('adds site and global group members under separate keys', () => {
        const { modifyGETResponse } = loadHook({
            siteGroup: [{ id: 'customerServiceEmail', type: ObjectAttributeDefinition.VALUE_TYPE_EMAIL }],
            globalGroup: [{ id: 'maxCartItems', type: ObjectAttributeDefinition.VALUE_TYPE_INT }],
            siteValues: { customerServiceEmail: 'help@example.com', notInGroup: 'hidden' },
            globalValues: { maxCartItems: 50, alsoNotInGroup: 'hidden' },
        });
        const configResp = { configurations: [{ id: 'id', value: 'RefArch' }] };

        modifyGETResponse(configResp);

        expect(configResp).toEqual({
            configurations: [{ id: 'id', value: 'RefArch' }],
            c_customSitePreferences: envelope({ customerServiceEmail: 'help@example.com' }),
            c_customGlobalPreferences: envelope({ maxCartItems: 50 }),
        });
    });

    it('never exposes password or system attributes', () => {
        const { modifyGETResponse, logger } = loadHook({
            siteGroup: [
                { id: 'paymentPassword', type: ObjectAttributeDefinition.VALUE_TYPE_PASSWORD },
                { id: 'innocuousName', type: ObjectAttributeDefinition.VALUE_TYPE_PASSWORD },
                { id: 'mapsApiKey', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
                { id: 'webhookSecret', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
                { id: 'serviceToken', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
                { id: 'systemAttr', type: ObjectAttributeDefinition.VALUE_TYPE_STRING, system: true },
                { id: 'promoBanner', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
            ],
            siteValues: {
                paymentPassword: 'p',
                innocuousName: 'p',
                mapsApiKey: 'k',
                webhookSecret: 's',
                serviceToken: 't',
                systemAttr: 'x',
                promoBanner: 'Free shipping',
            },
        });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp.c_customSitePreferences).toEqual(
            envelope({ mapsApiKey: 'k', webhookSecret: 's', serviceToken: 't', promoBanner: 'Free shipping' })
        );
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(
            '{0}.{1} is in group {2} but is a password and was not exposed',
            'SitePreferences',
            'innocuousName',
            GROUP_ID
        );
    });

    it('omits a key when its group is not defined', () => {
        const { modifyGETResponse } = loadHook({
            globalGroup: [{ id: 'flag', type: ObjectAttributeDefinition.VALUE_TYPE_BOOLEAN }],
            globalValues: { flag: true },
        });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp).toEqual({ c_customGlobalPreferences: envelope({ flag: true }) });
    });

    it('omits attributes that have neither a value nor a default', () => {
        const { modifyGETResponse } = loadHook({
            siteGroup: [
                { id: 'unset', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
                { id: 'emptyString', type: ObjectAttributeDefinition.VALUE_TYPE_STRING },
                { id: 'disabled', type: ObjectAttributeDefinition.VALUE_TYPE_BOOLEAN },
                { id: 'zero', type: ObjectAttributeDefinition.VALUE_TYPE_INT },
            ],
            siteValues: { emptyString: '', disabled: false, zero: 0 },
        });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp.c_customSitePreferences).toEqual(envelope({ emptyString: '', disabled: false, zero: 0 }));
    });

    it('adds an empty envelope for a defined group with no members', () => {
        const { modifyGETResponse } = loadHook({ siteGroup: [], globalGroup: [] });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp).toEqual({ c_customSitePreferences: { data: [] }, c_customGlobalPreferences: { data: [] } });
    });

    it('serializes platform value types to JSON-safe values', () => {
        const enumValue = (value: unknown) => ({
            getValue: () => value,
            getDisplayValue: () => `Display ${String(value)}`,
        });
        const { modifyGETResponse } = loadHook({
            siteGroup: [
                { id: 'enabled', type: ObjectAttributeDefinition.VALUE_TYPE_BOOLEAN },
                { id: 'ratio', type: ObjectAttributeDefinition.VALUE_TYPE_DOUBLE },
                { id: 'layout', type: ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_STRING },
                { id: 'tiers', type: ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_INT, multi: true },
                { id: 'regions', type: ObjectAttributeDefinition.VALUE_TYPE_SET_OF_STRING, multi: true },
                { id: 'banner', type: ObjectAttributeDefinition.VALUE_TYPE_HTML },
                { id: 'logo', type: ObjectAttributeDefinition.VALUE_TYPE_IMAGE },
                { id: 'launchDate', type: ObjectAttributeDefinition.VALUE_TYPE_DATETIME },
            ],
            siteValues: {
                enabled: false,
                ratio: 0.5,
                layout: enumValue('grid'),
                tiers: [enumValue(1), enumValue(2)],
                // Array-like without Array.prototype methods, as Java arrays appear in the script API.
                regions: { length: 2, 0: 'EU', 1: 'US' },
                banner: { getSource: () => '<p>$url()$</p>', getMarkup: () => '<p>https://x</p>' },
                logo: mediaFile({
                    url: '/on/demandware.static/-/Library-Sites-RefArch/default/dw1a2b3c4d/images/logo.png',
                    absUrl: 'https://shop.example.com/on/demandware.static/-/Library-Sites-RefArch/default/dw1a2b3c4d/images/logo.png',
                    alt: 'Logo',
                }),
                launchDate: new Date('2026-01-02T03:04:05.000Z'),
            },
        });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp.c_customSitePreferences).toEqual(
            envelope({
                enabled: false,
                ratio: 0.5,
                layout: 'grid',
                tiers: [1, 2],
                regions: ['EU', 'US'],
                banner: { source: '<p>$url()$</p>', markup: '<p>https://x</p>' },
                logo: {
                    path: 'images/logo.png',
                    absUrl: 'https://shop.example.com/on/demandware.static/-/Library-Sites-RefArch/default/dw1a2b3c4d/images/logo.png',
                    disBaseUrl: null,
                    alt: 'Logo',
                    title: null,
                },
                launchDate: '2026-01-02T03:04:05.000Z',
            })
        );
    });

    it('serializes images in the MRT data store media file shape', () => {
        const disUrl =
            'https://edge.example.com/dw/image/v2/BJQM_PRD/on/demandware.static/-/Library-Sites-RefArch/en_US/dw5e6f7a8b/images/hero%20banner.jpg';
        const { modifyGETResponse } = loadHook({
            siteGroup: [
                { id: 'hero', type: ObjectAttributeDefinition.VALUE_TYPE_IMAGE },
                { id: 'external', type: ObjectAttributeDefinition.VALUE_TYPE_IMAGE },
                { id: 'noUrls', type: ObjectAttributeDefinition.VALUE_TYPE_IMAGE },
            ],
            siteValues: {
                hero: mediaFile({
                    url: 'https://cdn.example.com/on/demandware.static/-/Library-Sites-RefArch/en_US/dw5e6f7a8b/images/hero%20banner.jpg',
                    absUrl: 'https://cdn.example.com/on/demandware.static/-/Library-Sites-RefArch/en_US/dw5e6f7a8b/images/hero%20banner.jpg',
                    disUrl: `${disUrl}?sw=1`,
                    alt: 'Hero',
                    title: 'Spring sale',
                }),
                external: mediaFile({
                    url: 'https://images.example.com/hero.jpg',
                    absUrl: 'https://images.example.com/hero.jpg',
                }),
                noUrls: mediaFile({}),
            },
        });
        const configResp: Record<string, unknown> = {};

        modifyGETResponse(configResp);

        expect(configResp.c_customSitePreferences).toEqual(
            envelope({
                hero: {
                    path: 'images/hero banner.jpg',
                    absUrl: 'https://cdn.example.com/on/demandware.static/-/Library-Sites-RefArch/en_US/dw5e6f7a8b/images/hero%20banner.jpg',
                    disBaseUrl: disUrl,
                    alt: 'Hero',
                    title: 'Spring sale',
                },
                external: {
                    path: null,
                    absUrl: 'https://images.example.com/hero.jpg',
                    disBaseUrl: null,
                    alt: null,
                    title: null,
                },
                noUrls: { path: null, absUrl: null, disBaseUrl: null, alt: null, title: null },
            })
        );
    });

    it('keeps global preferences and logs without throwing when site preferences fail', () => {
        const { modifyGETResponse, logger } = loadHook({
            siteGroup: [{ id: 'broken', type: ObjectAttributeDefinition.VALUE_TYPE_STRING }],
            globalGroup: [{ id: 'flag', type: ObjectAttributeDefinition.VALUE_TYPE_BOOLEAN }],
            siteValues: {
                get broken() {
                    throw new Error('preference unavailable');
                },
            },
            globalValues: { flag: true },
        });
        const configResp: Record<string, unknown> = {};

        expect(() => modifyGETResponse(configResp)).not.toThrow();
        expect(configResp).toEqual({ c_customGlobalPreferences: envelope({ flag: true }) });
        // The error crosses the vm realm boundary, so the hook formats it with String(e).
        expect(logger.error).toHaveBeenCalledWith(
            'Exposing custom site preferences failed: {0}',
            expect.stringContaining('preference unavailable')
        );
    });

    it('returns without reading preferences when the response document is absent', () => {
        const { modifyGETResponse } = loadHook({ siteGroup: [{ id: 'x', type: 3 }] });

        expect(modifyGETResponse(null)).toBeUndefined();
    });
});
