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
import { shouldRevalidate } from './home';

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getConfig: () => ({ features: { localInventory: { enabled: state.enabled } } }),
}));

describe('home shelf inventory revalidation', () => {
    it.each([
        [true, 'committed', 'unchanged', 200, true],
        [false, 'committed', 'unchanged', 200, false],
        [false, 'committed', 'committed', 200, true],
        [true, 'committed', 'committed', 502, true],
        [true, 'unchanged', 'unchanged', 200, false],
        [true, 'unknown', 'unknown', 502, false],
    ])('inventory=%s selection=%s native=%s status=%s', async (enabled, storeSelection, nativeContext, status, refresh) => {
        state.enabled = enabled;
        let available = true;
        const load = vi.fn(() => ({ available }));
        const router = createMemoryRouter(
            [
                { id: 'home', path: '/shop', loader: load, shouldRevalidate, Component: () => null },
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
        try {
            await router.navigate('/shop');
            const before = load.mock.calls.length;
            await router.fetch('selection', 'home', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            expect(load).toHaveBeenCalledTimes(before + (refresh ? 1 : 0));
            expect(router.state.loaderData.home.available).toBe(!refresh);
        } finally {
            router.dispose();
        }
    });
});
