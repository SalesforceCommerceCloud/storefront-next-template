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
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { resourceRoutes, routes } from '@/route-paths';
// Exercise the actual resource-route export so current-catalog and historical policies cannot drift together.
import { shouldRevalidate } from '@/routes/resource.last-order';

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
const unchanged = { storeSelection: 'unchanged', nativeContext: 'unchanged' };
const cases = [
    { name: 'native commit', status: 200, effects: { storeSelection: 'committed', nativeContext: 'committed' } },
    { name: 'reconciliation', status: 200, effects: { storeSelection: 'reconciled', nativeContext: 'reconciled' } },
    { name: 'preference only', status: 200, effects: { storeSelection: 'committed', nativeContext: 'unchanged' } },
    { name: 'validation failure', status: 400, effects: unchanged },
    { name: 'basket consent refusal', status: 409, effects: unchanged },
    {
        name: 'profile failure after commit',
        status: 502,
        effects: { storeSelection: 'committed', nativeContext: 'committed' },
    },
    { name: 'unknown outcome', status: 502, effects: { storeSelection: 'unknown', nativeContext: 'unknown' } },
];

// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

describe('historical last-order resource revalidation', () => {
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    it.each(cases)('does not refetch immutable order amounts for $name', async (scenario) => {
        const loader = vi.fn(() => ({ orderTotal: 10 }));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', loader, shouldRevalidate, Component: () => null },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () =>
                        Response.json(
                            { success: scenario.status === 200, effects: scenario.effects },
                            { status: scenario.status }
                        ),
                },
            ],
            { initialEntries: ['/shop'] }
        );
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const before = loader.mock.calls.length;
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            expect(loader.mock.calls.length).toBe(before);
        } finally {
            router.dispose();
        }
    });

    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    it.each([
        resourceRoutes.setSiteContext,
        resourceRoutes.updateShopperContext,
        routes.login,
        routes.logout,
    ])('preserves the existing ambient refresh for %s', async (formAction) => {
        const loader = vi.fn(() => ({}));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', loader, shouldRevalidate, Component: () => null },
                { path: formAction, action: () => ({ success: true }) },
            ],
            { initialEntries: ['/shop'] }
        );
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const before = loader.mock.calls.length;
            await router.fetch('mutation', 'page', formAction, { formMethod: 'POST', formData: new FormData() });
            expect(loader.mock.calls.length).toBe(before + 1);
        } finally {
            router.dispose();
        }
    });
});
