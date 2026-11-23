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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { resourceRoutes } from '@/route-paths';
import { shouldRevalidate as api } from './api-client';
import { shouldRevalidate as listing } from './category';
import { shouldRevalidate as product } from './product';

const state = vi.hoisted(() => ({ enabled: true, walk: vi.fn() }));
vi.mock('@/lib/scapi/fetcher-registry', () => ({ invokeMatchingFetchers: state.walk }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getConfig: () => ({ features: { localInventory: { enabled: state.enabled } } }),
}));

function args(actionResult: unknown): ShouldRevalidateFunctionArgs {
    return {
        currentUrl: new URL('https://shop.example.com/search?q=milk'),
        nextUrl: new URL('https://shop.example.com/search?q=milk'),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: false,
        formMethod: 'POST',
        formAction: resourceRoutes.setSelectedStore,
        actionResult,
    };
}

afterEach(async () => {
    await Promise.resolve();
    state.walk.mockClear();
    state.enabled = true;
});

describe('preparing-store inventory publication', () => {
    it.each([
        ['legacy action', { success: true }, true, true],
        ['committed selection', { effects: { storeSelection: 'committed', nativeContext: 'committed' } }, true, true],
        [
            'failed default save after commit',
            { error: 'Save failed', effects: { storeSelection: 'committed', nativeContext: 'committed' } },
            true,
            true,
        ],
        [
            'selection change with settled context',
            { effects: { storeSelection: 'committed', nativeContext: 'unchanged' } },
            true,
            true,
        ],
        [
            'recovered native context',
            { effects: { storeSelection: 'unchanged', nativeContext: 'reconciled' } },
            true,
            true,
        ],
        ['preference only', { effects: { storeSelection: 'unchanged', nativeContext: 'unchanged' } }, false, false],
        ['uncertain outcome', { outcome: 'unknown' }, false, false],
        ['uncertain selection', { effects: { storeSelection: 'unknown', nativeContext: 'committed' } }, false, false],
        [
            'uncertain native context',
            { effects: { storeSelection: 'committed', nativeContext: 'unknown' } },
            false,
            false,
        ],
    ])('%s', async (_name, actionResult, refreshStock, refreshProduct) => {
        const input = args(actionResult);
        expect(listing(input)).toBe(refreshStock);
        expect(product(input)).toBe(refreshProduct);
        api(input);
        const matches = state.walk.mock.calls[0][0];
        for (const method of ['getProduct', 'getProducts']) {
            expect(
                matches({
                    client: 'shopperProducts',
                    method,
                    options: { params: { query: { expand: ['availability'] } } },
                })
            ).toBe(refreshStock);
        }
        await Promise.resolve();
    });

    it('leaves explicit site availability independent when local inventory is disabled', () => {
        state.enabled = false;
        api(args({ success: true }));
        const matches = state.walk.mock.calls[0][0];
        expect(
            matches({
                client: 'shopperProducts',
                method: 'getProduct',
                options: { params: { query: { expand: ['availability'] } } },
            })
        ).toBe(false);
    });

    it.each(['committed', 'reconciled'])('skips stock-only %s effects when inventory is disabled', (selection) => {
        state.enabled = false;
        expect(listing(args({ effects: { storeSelection: selection, nativeContext: 'unchanged' } }))).toBe(false);
    });

    it.each([
        [true, 'committed', true],
        [false, 'committed', true],
        [true, 'unchanged', false],
        [false, 'unchanged', false],
    ] as const)('keeps stock and pricing refresh independent (inventory=%s, native=%s)', (enabled, nativeContext, refreshPrices) => {
        state.enabled = enabled;
        api(args({ effects: { storeSelection: 'committed', nativeContext } }));
        const matches = state.walk.mock.calls[0][0];
        expect(
            matches({
                client: 'shopperProducts',
                method: 'getProduct',
                options: { params: { query: { expand: ['availability'] } } },
            })
        ).toBe(enabled);
        expect(
            matches({
                client: 'shopperSearch',
                method: 'getSearchSuggestions',
                options: { params: { query: { q: 'milk', expand: ['prices'] } } },
            })
        ).toBe(refreshPrices);
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    it.each([
        resourceRoutes.setSelectedStore,
        `https://shop.example.com${resourceRoutes.setSelectedStore}`,
        `${resourceRoutes.setSelectedStore}?source=chooser`,
    ])('preserves settled pickup inventory refresh for %s', async (formAction) => {
        const read = {
            client: 'shopperProducts',
            method: 'getProduct',
            options: { params: { query: { inventoryIds: ['list-A'], expand: ['availability'] } } },
        };
        api({ ...args({ effects: { storeSelection: 'unchanged', nativeContext: 'unchanged' } }), formAction });
        expect(state.walk.mock.calls[0][0](read)).toBe(true);
        await Promise.resolve();
        state.walk.mockClear();
        api({ ...args({ outcome: 'unknown' }), formAction });
        expect(state.walk.mock.calls[0][0](read)).toBe(false);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
