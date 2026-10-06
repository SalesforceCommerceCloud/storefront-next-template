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

const hookSource = readFileSync(resolve(import.meta.dirname, 'category.js'), 'utf8');

function loadHook(select: string | null) {
    const logger = { error: vi.fn() };
    const exports: { modifyGETResponse?: (category: unknown, doc: unknown) => undefined } = {};
    runInNewContext(hookSource, {
        exports,
        request: {
            httpParameterMap: {
                get: vi.fn(() => ({ stringValue: select })),
            },
        },
        require: vi.fn(() => logger),
    });
    if (!exports.modifyGETResponse) {
        throw new Error('Category hook did not export modifyGETResponse');
    }
    return { modifyGETResponse: exports.modifyGETResponse, logger };
}

describe('category response hook', () => {
    it('is registered for category GET responses', () => {
        const hooks = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../hooks.json'), 'utf8'));

        expect(hooks.hooks).toContainEqual({
            name: 'dw.ocapi.shop.category.modifyGETResponse',
            script: './cartridge/scripts/hooks/category',
        });
    });

    it('prunes each category node to selected and structural fields', () => {
        const { modifyGETResponse } = loadHook(' c_showInMenu, c_headerMenuBanner ');
        const doc = {
            id: 'root',
            name: 'Root',
            description: 'unused',
            c_enableCompare: false,
            c_showInMenu: true,
            categories: [
                {
                    id: 'bags',
                    name: 'Bags',
                    c_headerMenuBanner: 'banner',
                    c_enableCompare: false,
                    onlineSubCategoriesCount: 2,
                    categories: [{ id: 'crossbody', name: 'Crossbody', image: 'unused' }],
                },
            ],
        };

        modifyGETResponse(undefined, doc);

        expect(doc).toEqual({
            id: 'root',
            name: 'Root',
            c_showInMenu: true,
            categories: [
                {
                    id: 'bags',
                    name: 'Bags',
                    c_headerMenuBanner: 'banner',
                    categories: [{ id: 'crossbody', name: 'Crossbody' }],
                },
            ],
        });
    });

    it('prunes the category document shape supplied for each batched category result', () => {
        const { modifyGETResponse } = loadHook('c_showInMenu,onlineSubCategoriesCount');
        const doc = {
            id: 'womens',
            name: 'Womens',
            description: 'unused',
            c_showInMenu: true,
            onlineSubCategoriesCount: 1,
            categories: [
                {
                    id: 'womens-clothing',
                    name: 'Clothing',
                    image: 'unused',
                    c_showInMenu: true,
                    onlineSubCategoriesCount: 0,
                },
            ],
        };

        modifyGETResponse(undefined, doc);

        expect(doc).toEqual({
            id: 'womens',
            name: 'Womens',
            c_showInMenu: true,
            onlineSubCategoriesCount: 1,
            categories: [
                {
                    id: 'womens-clothing',
                    name: 'Clothing',
                    c_showInMenu: true,
                    onlineSubCategoriesCount: 0,
                },
            ],
        });
    });

    it('leaves the response unchanged when c_select is absent or blank', () => {
        for (const select of [null, '   ']) {
            const { modifyGETResponse } = loadHook(select);
            const doc = { id: 'root', name: 'Root', description: 'retained' };

            modifyGETResponse(undefined, doc);

            expect(doc).toEqual({ id: 'root', name: 'Root', description: 'retained' });
        }
    });

    it('returns without reading c_select when the response document is absent', () => {
        const { modifyGETResponse } = loadHook('id');

        expect(modifyGETResponse(undefined, null)).toBeUndefined();
    });

    it('handles empty and null category children', () => {
        const { modifyGETResponse } = loadHook('c_showInMenu');
        const doc = {
            id: 'root',
            name: 'Root',
            categories: [null, { id: 'empty', name: 'Empty', categories: [] }],
        };

        modifyGETResponse(undefined, doc);

        expect(doc).toEqual({
            id: 'root',
            name: 'Root',
            categories: [null, { id: 'empty', name: 'Empty', categories: [] }],
        });
    });

    it('treats prototype property names as explicitly selected fields only', () => {
        const { modifyGETResponse } = loadHook('__proto__,toString');
        const doc = {
            id: 'root',
            name: 'Root',
            constructor: 'remove',
            toString: 'retain',
        };

        modifyGETResponse(undefined, doc);

        expect(doc).toEqual({ id: 'root', name: 'Root', toString: 'retain' });
        expect(Object.prototype).not.toHaveProperty('__categoryPrunePolluted');
    });

    it('logs errors without throwing from the response hook', () => {
        const { modifyGETResponse, logger } = loadHook('id');
        const doc = {
            id: 'root',
            name: 'Root',
            description: 'retained on failure',
            categories: [{ id: 'child', name: 'Child', description: 'also retained' }],
        };
        Object.defineProperty(doc.categories[0], 'categories', {
            enumerable: true,
            get() {
                throw new Error('categories unavailable');
            },
        });

        expect(() => modifyGETResponse(undefined, doc)).not.toThrow();
        expect(logger.error).toHaveBeenCalledWith('c_select category prune failed: {0}', expect.any(String));
    });

    it('logs non-Error rejections without throwing from the response hook', () => {
        const { modifyGETResponse, logger } = loadHook('id');
        const doc = { id: 'root', name: 'Root' };
        Object.defineProperty(doc, 'categories', {
            enumerable: true,
            get() {
                // oxlint-disable-next-line typescript/only-throw-error -- exercise the platform's non-Error rejection path
                throw null;
            },
        });

        expect(() => modifyGETResponse(undefined, doc)).not.toThrow();
        expect(logger.error).toHaveBeenCalledWith('c_select category prune failed: {0}', 'null');
    });
});
