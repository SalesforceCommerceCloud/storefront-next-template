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
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { MemoryRouter } from 'react-router';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockSiteObject as defaultMockSite } from '@/test-utils/config';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import AuthProvider from '@/providers/auth';
import type { PdpPickupInventory } from '@/extensions/bopis/lib/pdp-pickup-inventory.server';
import { PickupInventoryProvider, usePickupInventory } from '@/extensions/bopis/context/pickup-inventory';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import {
    StoreLocatorStateProvider,
    useStoreLocatorApi,
    useStoreLocator,
    useSelectedStoreSource,
    type StoreLocatorStoreApi,
} from './store-locator';

type Resolution = {
    selectedStoreInfo: { id: string; inventoryId?: string } | null;
    error: 'profile' | 'store' | null;
    authError?: boolean;
};
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((release) => {
        resolve = release;
    });
    return { promise, resolve };
}

describe('root selection publication', () => {
    it('does not relabel an old promise when the identity changes before new loader data arrives', async () => {
        const root = deferred<Resolution>();
        let api!: StoreLocatorStoreApi;
        function Probe() {
            api = useStoreLocatorApi();
            return <span>{useStoreLocator((state) => state.selectedStoreInfo)?.id ?? 'empty'}</span>;
        }
        function App({ identity }: { identity: string }) {
            return (
                <AllProvidersWrapper>
                    <StoreLocatorStateProvider identity={identity} selectedStoreResolution={root.promise}>
                        <Probe />
                    </StoreLocatorStateProvider>
                </AllProvidersWrapper>
            );
        }
        const { rerender } = render(<App identity="A" />);
        rerender(<App identity="B" />);
        rerender(<App identity="A" />);
        await act(async () => {
            root.resolve({ selectedStoreInfo: { id: 'old-identity-store' }, error: null });
            await root.promise;
        });
        expect(api.getState().selectedStoreInfo).toBeNull();
    });
    it.each(['save', 'rollback', 'pending'])('rejects publication started before a %s', async (outcome) => {
        const root = deferred<Resolution>();
        let api!: StoreLocatorStoreApi;
        function Probe() {
            api = useStoreLocatorApi();
            return <span>{useStoreLocator((state) => state.selectedStoreInfo)?.id}</span>;
        }
        render(
            <AllProvidersWrapper>
                <StoreLocatorStateProvider
                    selectedStoreInfo={{ id: 'confirmed', inventoryId: 'inv-confirmed' }}
                    selectedStoreResolution={root.promise}>
                    <Probe />
                </StoreLocatorStateProvider>
            </AllProvidersWrapper>
        );
        const coordinator = createSelectionCoordinator(api);
        act(() => {
            const operation = coordinator.begin('new', api.getState().generation);
            if (!operation) throw new Error('Expected selection operation');
            if (outcome === 'save')
                coordinator.complete(operation.id, {
                    success: true,
                    selectedStoreInfo: { id: 'new', inventoryId: 'inv-new' },
                });
            if (outcome === 'rollback') coordinator.complete(operation.id, { success: false, error: 'failed' });
        });
        await act(async () => {
            root.resolve({ selectedStoreInfo: { id: 'stale' }, error: null });
            await root.promise;
        });
        expect(api.getState().selectedStoreInfo?.id).toBe(outcome === 'save' ? 'new' : 'confirmed');
        expect(api.getState().selectionRevision).toBe(outcome === 'pending' ? 1 : 2);
    });

    it.each(['identity', 'site'])('rejects the previous %s promise after scope changes', async (change) => {
        const old = deferred<Resolution>();
        const next = deferred<Resolution>();
        let api!: StoreLocatorStoreApi;
        function Probe() {
            api = useStoreLocatorApi();
            return <span>{useStoreLocator((state) => state.selectedStoreInfo)?.id ?? 'empty'}</span>;
        }
        function App({ changed }: { changed: boolean }) {
            return (
                <AllProvidersWrapper>
                    <SiteProvider
                        site={{
                            ...defaultMockSite,
                            id: changed && change === 'site' ? 'other-site' : defaultMockSite.id,
                        }}
                        locale={defaultMockSite.supportedLocales[0]}
                        language="en-US"
                        currency="USD">
                        <StoreLocatorStateProvider
                            identity={changed && change === 'identity' ? 'B' : 'A'}
                            selectedStoreResolution={changed ? next.promise : old.promise}>
                            <Probe />
                        </StoreLocatorStateProvider>
                    </SiteProvider>
                </AllProvidersWrapper>
            );
        }
        const { rerender } = render(<App changed={false} />);
        const original = api;
        rerender(<App changed />);
        await act(async () => {
            old.resolve({ selectedStoreInfo: { id: 'stale' }, error: null });
            await old.promise;
        });
        expect(api.getState().selectedStoreInfo).toBeNull();
        await act(async () => {
            next.resolve({ selectedStoreInfo: { id: 'current' }, error: null });
            await next.promise;
        });
        expect(api.getState().selectedStoreInfo?.id).toBe('current');
        expect(api).toBe(original);
    });
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    it.each(['root-first', 'pickup-first'])('preserves matching PDP availability and revision: %s', async (order) => {
        const root = deferred<Resolution>();
        const pickup = deferred<PdpPickupInventory>();
        let api!: StoreLocatorStoreApi;
        let adoptedRevision: number | undefined;
        function Probe() {
            api = useStoreLocatorApi();
            adoptedRevision = useSelectedStoreSource()?.adoptedRevision;
            const selected = useStoreLocator((state) => state.selectedStoreInfo);
            const availability = usePickupInventory('sku');
            return (
                <div>
                    {selected?.id ?? 'empty'}:{availability.status}
                </div>
            );
        }
        render(
            <AllProvidersWrapper>
                <AuthProvider value={{ userType: 'guest', usid: 'test' }}>
                    <StoreLocatorStateProvider
                        identity={JSON.stringify(['guest', undefined, 'test'])}
                        {...{ selectedStoreResolution: root.promise }}>
                        <PickupInventoryProvider promise={pickup.promise}>
                            <Probe />
                        </PickupInventoryProvider>
                    </StoreLocatorStateProvider>
                </AuthProvider>
            </AllProvidersWrapper>
        );
        const publishRoot = async () => {
            await act(async () => {
                root.resolve({ selectedStoreInfo: { id: 'A', inventoryId: 'inv-A' }, error: null });
                await root.promise;
            });
        };
        const publishPickup = async () => {
            await act(async () => {
                pickup.resolve({
                    storeId: 'A',
                    inventoryId: 'inv-A',
                    status: 'resolved',
                    products: [{ id: 'sku', inventories: [{ id: 'inv-A', orderable: true }] }],
                });
                await pickup.promise;
            });
        };
        if (order === 'root-first') {
            await publishRoot();
            await publishPickup();
        } else {
            await publishPickup();
            await publishRoot();
        }
        expect(screen.getByText('A:resolved')).toBeInTheDocument();
        expect(api.getState().selectionRevision).toBe(0);
        expect(adoptedRevision).toBe(api.getState().selectionRevision);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    it('never offers a manual recovery link on a late auth error', async () => {
        const root = deferred<Resolution>();
        render(
            <MemoryRouter>
                <AllProvidersWrapper>
                    <StoreLocatorStateProvider {...{ selectedStoreResolution: root.promise }}>
                        <h1>Shell</h1>
                    </StoreLocatorStateProvider>
                </AllProvidersWrapper>
            </MemoryRouter>
        );
        expect(screen.getByRole('heading', { name: 'Shell' })).toBeInTheDocument();
        await act(async () => {
            root.resolve({ selectedStoreInfo: null, error: 'profile', authError: true });
            await root.promise;
        });
        expect(screen.queryByRole('link')).toBeNull();
    });
});
