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
import { createMemoryRouter, data } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { resourceRoutes } from '@/route-paths';
import { shouldRevalidate } from './category-products';

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getConfig: () => ({ features: { localInventory: { enabled: state.enabled } } }),
}));

describe('category carousel availability after store selection', () => {
    it.each([
        [true, 'committed', 'unchanged', 200, true],
        [false, 'committed', 'unchanged', 200, false],
        [false, 'committed', 'committed', 200, true],
        [true, 'committed', 'committed', 502, true],
        [true, 'unchanged', 'unchanged', 200, false],
        [true, 'unknown', 'unknown', 502, false],
    ])('refreshes only settled dependent reads (inventory=%s, selection=%s, native=%s, status=%s)', async (enabled, storeSelection, nativeContext, status, refresh) => {
        state.enabled = enabled;
        let available = true;
        const load = vi.fn(() => ({ hits: [{ productId: 'milk', c_localInventoryAvailable: available }] }));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', Component: () => null },
                { path: resourceRoutes.categoryProducts, loader: load, shouldRevalidate },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => {
                        available = false;
                        return data({ effects: { storeSelection, nativeContext } }, { status });
                    },
                },
            ],
            { initialEntries: ['/shop'] }
        );
        let lastWindow: { hits: { c_localInventoryAvailable: boolean }[] } | undefined;
        const unsubscribe = router.subscribe((routerState) => {
            const value = routerState.fetchers.get('carousel')?.data;
            if (value) lastWindow = value;
        });
        try {
            await router.fetch('carousel', 'page', `${resourceRoutes.categoryProducts}?refine=cgid=root`);
            expect(load).toHaveBeenCalledTimes(1);
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            expect(load).toHaveBeenCalledTimes(refresh ? 2 : 1);
            expect(lastWindow?.hits[0].c_localInventoryAvailable).toBe(!refresh);
        } finally {
            unsubscribe();
            router.dispose();
        }
    });
});
