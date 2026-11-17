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
/** @sfdc-extension-file SFDC_EXT_BOPIS */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLoaderData } from 'react-router';
import StoreLocatorProvider, {
    useStoreLocator,
    type SelectedStoreResolution,
} from '@/extensions/store-locator/providers/store-locator';
import { useStoreSelection } from '@/extensions/store-locator/providers/selection';
import { PickupInventoryProvider, usePickupInventory } from './pickup-inventory';
import type { PdpPickupInventory } from '@/extensions/bopis/lib/pdp-pickup-inventory.server';
import { ConfigWrapper } from '@/test-utils/config';
import { resourceRoutes } from '@/route-paths';

vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: { id: 'site' } }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }));
vi.mock('@/components/link', async () => ({ Link: (await import('react-router')).Link }));

type LoaderData = { selection: Promise<SelectedStoreResolution>; inventory: Promise<PdpPickupInventory> };

const server = { store: 'A', staleInventory: false };
const storeInfo = (id: string) => ({ id, inventoryId: `inv-${id}` });
const inventoryFor = (id: string): PdpPickupInventory => ({
    status: 'resolved',
    storeId: id,
    inventoryId: `inv-${id}`,
    products: [{ id: 'sku', inventories: [{ id: `inv-${id}`, stockLevel: 3, orderable: true }] }],
});

function Probe() {
    const result = usePickupInventory('sku');
    const selected = useStoreLocator((state) => state.selectedStoreInfo);
    const { select } = useStoreSelection();
    return (
        <>
            <output role="note">
                {result.status}:{result.product?.inventories?.[0]?.stockLevel ?? 'none'}
            </output>
            <output data-testid="selected">{selected?.id ?? 'none'}</output>
            <button onClick={() => select(storeInfo('B'))}>Select B</button>
        </>
    );
}
function Page() {
    const data = useLoaderData() as LoaderData;
    return (
        <ConfigWrapper>
            <StoreLocatorProvider selectedStoreResolution={data.selection}>
                <PickupInventoryProvider promise={data.inventory}>
                    <Probe />
                </PickupInventoryProvider>
            </StoreLocatorProvider>
        </ConfigWrapper>
    );
}

describe('PDP inventory across a successful preference write (native router)', () => {
    beforeEach(() => {
        server.store = 'A';
        server.staleInventory = false;
    });

    it.each([
        ['immediately', false],
        ['after a delay', true],
    ])('keeps the revalidated inventory usable when the selection resolves %s', async (_name, delayed) => {
        const router = createMemoryRouter([
            {
                path: '/',
                Component: Page,
                loader: (): LoaderData => {
                    const id = server.store;
                    const selection = new Promise<SelectedStoreResolution>((resolve) => {
                        const value = { selectedStoreInfo: storeInfo(id), error: null };
                        if (delayed && id === 'B') setTimeout(() => resolve(value), 20);
                        else resolve(value);
                    });
                    return { selection, inventory: Promise.resolve(inventoryFor(server.staleInventory ? 'A' : id)) };
                },
            },
            {
                path: resourceRoutes.setSelectedStore,
                action: () => {
                    server.store = 'B';
                    return { success: true, selectedStoreInfo: storeInfo('B') };
                },
            },
        ]);
        render(<RouterProvider router={router} />);
        await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('resolved:3'));

        act(() => {
            fireEvent.click(screen.getByText('Select B'));
        });
        await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('B'));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
        });

        // The post-write revalidated PDP inventory belongs to store B and must stay usable.
        expect(screen.getByRole('note')).toHaveTextContent('resolved:3');
    });
    it('still rejects inventory for the previous store captured while the write was pending', async () => {
        server.staleInventory = true;
        const router = createMemoryRouter([
            {
                path: '/',
                Component: Page,
                loader: (): LoaderData => ({
                    selection: Promise.resolve({ selectedStoreInfo: storeInfo(server.store), error: null }),
                    inventory: Promise.resolve(inventoryFor(server.staleInventory ? 'A' : server.store)),
                }),
            },
            {
                path: resourceRoutes.setSelectedStore,
                action: () => {
                    server.store = 'B';
                    return { success: true, selectedStoreInfo: storeInfo('B') };
                },
            },
        ]);
        render(<RouterProvider router={router} />);
        await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('resolved:3'));
        act(() => {
            fireEvent.click(screen.getByText('Select B'));
        });
        await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('B'));
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
    });
});
