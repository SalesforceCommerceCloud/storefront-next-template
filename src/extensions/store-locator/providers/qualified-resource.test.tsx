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
import { useEffect, useRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, data, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { resourceRoutes } from '@/route-paths';
import { RESOURCE_API_ROUTE } from '@/lib/scapi/resource-encoding';
import { shouldRevalidate } from '@/lib/revalidation/routes/api-client';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
import { StoreLocatorContext } from './context';
import { createStoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';

describe('qualified resource presentation during store changes', () => {
    it.each([
        false,
        true,
    ])('hides the previous store quote until the independent reload settles (failure: %s)', async (failure) => {
        let nativePrice = 10;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const store = createStoreLocatorStore();
        store.setState({ selectedStoreInfo: { id: 'A', inventoryId: 'IA' } });
        const coordinator = createSelectionCoordinator(store);
        const result = {
            success: true,
            selectedStoreInfo: { id: 'B', inventoryId: 'IB' },
            effects: { storeSelection: 'committed', nativeContext: 'committed' },
        } as const;
        let reloads = 0;
        function Quote() {
            const fetcher = useScapiFetcher('shopperSearch', 'getSearchSuggestions', {
                params: { query: { q: 'milk', expand: ['prices'] } },
            });
            const loaded = useRef(false);
            useEffect(() => {
                if (!loaded.current) {
                    loaded.current = true;
                    void fetcher.load();
                }
            }, [fetcher]);
            return (
                <output>
                    {fetcher.data
                        ? String((fetcher.data as { price?: number }).price)
                        : fetcher.errors
                          ? 'error'
                          : 'pending'}
                </output>
            );
        }
        const router = createMemoryRouter([
            {
                path: '/',
                Component: () => (
                    <StoreLocatorContext.Provider value={store}>
                        <Outlet />
                    </StoreLocatorContext.Provider>
                ),
                children: [{ index: true, Component: Quote }],
            },
            {
                path: `${RESOURCE_API_ROUTE}/:resource`,
                loader: async () => {
                    reloads++;
                    if (nativePrice === 20) {
                        await gate;
                        if (failure) return { success: false, errors: ['unavailable'] };
                    }
                    return { success: true, data: { price: nativePrice } };
                },
                shouldRevalidate,
            },
            {
                path: resourceRoutes.setSelectedStore,
                action: () => {
                    nativePrice = 20;
                    return data(result);
                },
            },
        ]);
        try {
            render(<RouterProvider router={router} />);
            await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('10'));
            let operation!: NonNullable<ReturnType<typeof coordinator.begin>>;
            act(() => {
                const next = coordinator.begin('B', store.getState().generation);
                if (!next) throw new Error('Expected operation');
                operation = next;
            });
            expect(screen.getByRole('status')).toHaveTextContent('pending');
            await act(async () => {
                await router.fetch('selection', '0', resourceRoutes.setSelectedStore, {
                    formMethod: 'POST',
                    formData: new FormData(),
                });
                coordinator.complete(operation.id, result);
            });
            expect(store.getState().selectedStoreInfo?.id).toBe('B');
            expect(screen.getByRole('status')).toHaveTextContent('pending');
            expect(screen.queryByText('10')).not.toBeInTheDocument();
            act(() => {
                release();
            });
            await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(failure ? 'error' : '20'));
            expect(reloads).toBe(2);
        } finally {
            release();
            router.dispose();
        }
    });
});
