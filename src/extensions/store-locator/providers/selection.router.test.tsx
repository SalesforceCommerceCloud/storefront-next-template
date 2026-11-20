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
import { useLayoutEffect, useRef, useState } from 'react';
import { createMemoryRouter, data, RouterProvider, useLoaderData } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoreLocatorProvider, { useStoreLocator, useStoreLocatorApi, type StoreLocatorStoreApi } from './store-locator';
import { useStoreSelection } from './selection';
import { resourceRoutes } from '@/route-paths';
import ChangeStoreButton from '@/components/store-preferences/preferred-store/change-store-button';
import ProductPrice from '@/components/product-price';
import { shouldRevalidate } from '@/lib/revalidation/routes/category';

const site = vi.hoisted(() => ({ id: 'site' }));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => ({ site }) }));

describe('qualified page prices and selected-store publication', () => {
    it.each([200, 502])('settles selection before ancestor layout measurements after status %s', async (status) => {
        const old = { id: 'A', name: 'Store A', inventoryId: 'inventory-a' };
        const canonical = { id: 'B', name: 'Store B', inventoryId: 'inventory-b' };
        let nativePrice = 10;
        let api: StoreLocatorStoreApi | undefined;
        const layoutStates: { price: number; selected?: string; pending: boolean }[] = [];
        function Controls({ price }: { price: number }) {
            api = useStoreLocatorApi();
            const selected = useStoreLocator((state) => state.selectedStoreInfo);
            const { select } = useStoreSelection();
            return (
                <>
                    <button onClick={() => select({ id: 'B' })}>Save</button>
                    <output data-testid="selected">{selected?.id}</output>
                    <ProductPrice product={{ id: 'sku', price }} currency="USD" />
                </>
            );
        }
        function Page() {
            const { price } = useLoaderData() as { price: number };
            // Ancestor layout effects run after the coordinator's layout effect, before paint.
            useLayoutEffect(() => {
                if (!api) return;
                const state = api.getState();
                layoutStates.push({ price, selected: state.selectedStoreInfo?.id, pending: state.selectionPending });
            }, [price]);
            return (
                <StoreLocatorProvider selectedStoreInfo={old} identity="shopper">
                    <Controls price={price} />
                </StoreLocatorProvider>
            );
        }
        const router = createMemoryRouter([
            { id: 'page', path: '/', loader: () => ({ price: nativePrice }), shouldRevalidate, Component: Page },
            {
                path: resourceRoutes.setSelectedStore,
                action: () => {
                    nativePrice = 20;
                    return data(
                        {
                            success: status === 200,
                            selectedStoreInfo: canonical,
                            effects: { storeSelection: 'committed', nativeContext: 'committed' },
                            ...(status === 502 ? { error: 'PREFERRED_STORE_PERSISTENCE_FAILED' } : {}),
                        },
                        { status }
                    );
                },
            },
        ]);
        try {
            render(<RouterProvider router={router} />);
            await screen.findByText('Save');
            fireEvent.click(screen.getByText('Save'));
            await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('B'));
            expect(screen.getByText('$20.00')).toBeInTheDocument();
            expect(layoutStates.filter((state) => state.price === 20)).toEqual([
                { price: 20, selected: 'B', pending: false },
            ]);
        } finally {
            router.dispose();
        }
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

describe('native router composed selection ownership', () => {
    beforeEach(() => {
        site.id = 'site';
    });
    function setup(
        action: () => unknown,
        pickupAction: ReturnType<typeof vi.fn<() => unknown>> = vi.fn(() => ({ success: true })),
        scope: 'identity' | 'site' = 'identity',
        layoutSelection?: 'preference' | 'pickup' | 'invalidate',
        account = false
    ) {
        let api!: StoreLocatorStoreApi;
        function Controls() {
            api = useStoreLocatorApi();
            const { select } = useStoreSelection();
            const pending = useStoreLocator((state) => state.selectionPending);
            const selected = useStoreLocator((state) => state.selectedStoreInfo);
            const generation = useStoreLocator((state) => state.generation);
            const fired = useRef(false);
            useLayoutEffect(() => {
                if (!layoutSelection || generation !== 1 || fired.current) return;
                fired.current = true;
                if (layoutSelection === 'pickup') api.setState({ isOpen: true, chooserOwner: 'caller' });
                select({ id: 'new' });
                if (layoutSelection === 'invalidate')
                    api.setState({
                        generation: 2,
                        identityScope: 'superseded',
                        selectionPending: false,
                        selectionError: null,
                    });
            }, [generation, select]);
            return (
                <>
                    <button onClick={() => select({ id: 'new' })}>Save</button>
                    <button onClick={() => api.getState().openChooser({ owner: 'caller' })}>Pickup</button>
                    <output data-testid="pending">{String(pending)}</output>
                    <output data-testid="selected">{selected?.id ?? 'none'}</output>
                </>
            );
        }
        function App() {
            const [identity, setIdentity] = useState('A');
            return (
                <>
                    <button
                        onClick={() => {
                            if (scope === 'site') site.id = 'other-site';
                            setIdentity(scope === 'site' ? 'rerender' : 'B');
                        }}>
                        Scope
                    </button>
                    <StoreLocatorProvider identity={scope === 'site' ? 'A' : identity}>
                        <Controls />
                        {account && <ChangeStoreButton />}
                    </StoreLocatorProvider>
                </>
            );
        }
        const router = createMemoryRouter([
            { path: '/', Component: App },
            { path: resourceRoutes.setSelectedStore, action },
            { path: '/pickup', action: pickupAction },
        ]);
        render(<RouterProvider router={router} />);
        return { api: () => api, router, pickupAction };
    }

    it('adopts a committed selection after a 502 profile-default failure without confirming pickup', async () => {
        const action = vi.fn(() =>
            data(
                {
                    success: false,
                    error: 'PREFERRED_STORE_PERSISTENCE_FAILED',
                    selectedStoreInfo: { id: 'new', inventoryId: 'new-inventory' },
                    effects: { storeSelection: 'committed', nativeContext: 'committed' },
                },
                { status: 502 }
            )
        );
        const { api } = setup(action);
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        expect(action).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('selected')).toHaveTextContent('new');
        expect(api().getState()).toMatchObject({
            selectionError: 'PREFERRED_STORE_PERSISTENCE_FAILED',
            confirmedSelection: null,
            isOpen: true,
        });
    });

    it('announces an applied store choice separately from a failed account-default save', async () => {
        const action = vi.fn(() =>
            data(
                {
                    success: false,
                    error: 'PREFERRED_STORE_PERSISTENCE_FAILED',
                    selectedStoreInfo: { id: 'new', inventoryId: 'new-inventory' },
                    effects: { storeSelection: 'committed', nativeContext: 'committed' },
                },
                { status: 502 }
            )
        );
        const { api } = setup(action);
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        expect(screen.getByTestId('selected')).toHaveTextContent('new');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Your store choice was applied, but could not be saved to your account. Try again.'
        );
        expect(screen.queryByText(/Your previous store is unchanged/)).not.toBeInTheDocument();
        expect(api().getState().confirmedSelection).toBeNull();
    });

    it.each([
        'identity',
        'site',
    ] as const)('dispatches a descendant layout-effect save on the committed new %s transport', async (scope) => {
        const current = deferred<unknown>();
        const action = vi.fn(() => current.promise);
        const { api, router } = setup(action, undefined, scope, 'preference');
        fireEvent.click(screen.getByText('Scope'));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        expect(api().getState().selectionPending).toBe(true);
        expect([...router.state.fetchers.keys()]).toEqual([
            expect.stringContaining(`:${api().getState().identityScope}:1`),
        ]);
        await act(async () => {
            current.resolve({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'current' } });
            await current.promise;
        });
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        expect(api().getState().selectedStoreInfo?.inventoryId).toBe('current');
        expect(api().getState().selectionError).toBeNull();
    });

    it('publishes a claimable notification after a new-scope layout-effect selection', async () => {
        const preference = deferred<unknown>();
        const pickup = deferred<unknown>();
        const action = vi.fn(() => preference.promise);
        const pickupAction = vi.fn(() => pickup.promise);
        const { api, router } = setup(action, pickupAction, 'identity', 'pickup');
        fireEvent.click(screen.getByText('Scope'));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        await act(async () => {
            preference.resolve({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'current' } });
            await preference.promise;
        });
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        expect(pickupAction).not.toHaveBeenCalled();
        expect(api().getState().claimConfirmedSelection('caller')).toEqual({ id: 'new', inventoryId: 'current' });
        expect(api().getState().claimConfirmedSelection('caller')).toBeNull();
        await act(async () => {
            pickup.resolve({ success: true });
            await pickup.promise;
        });
        expect(api().getState().selectionError).toBeNull();
        expect(api().getState().selectedStoreInfo?.inventoryId).toBe('current');
        router.dispose();
    });

    it('invalidates a queued layout-effect save before its transport commits', async () => {
        const action = vi.fn(() => ({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'stale' } }));
        const { api } = setup(action, undefined, 'identity', 'invalidate');
        fireEvent.click(screen.getByText('Scope'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(action).not.toHaveBeenCalled();
        expect(api().getState().selectionPending).toBe(false);
        expect(api().getState().selectionError).toBeNull();
        expect(api().getState().selectedStoreInfo).toBeNull();
    });

    const scopeOutcomes = [
        ['identity', 'success'],
        ['identity', 'failure'],
        ['identity', 'rejection'],
        ['site', 'success'],
        ['site', 'failure'],
        ['site', 'rejection'],
    ] as const;
    it.each(
        scopeOutcomes.flatMap(
            ([scope, outcome]) =>
                [
                    [scope, outcome, undefined],
                    [scope, outcome, 'preference'],
                ] as const
        )
    )('permits a new %s save before old %s settles (layout: %s)', async (scope, outcome, layoutSelection) => {
        const old = deferred<unknown>();
        const current = deferred<unknown>();
        const action = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const { api, pickupAction } = setup(action, undefined, scope, layoutSelection);
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByText('Scope'));
        if (!layoutSelection) {
            expect(screen.getByTestId('pending')).toHaveTextContent('false');
            fireEvent.click(screen.getByText('Save'));
        }
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
        const revision = api().getState().selectionRevision;
        await act(async () => {
            if (outcome === 'rejection') old.reject(new Error('old failed'));
            else
                old.resolve(
                    outcome === 'success'
                        ? { success: true, selectedStoreInfo: { id: 'new', inventoryId: 'old' } }
                        : { success: false }
                );
            await Promise.resolve();
        });
        expect(screen.getByTestId('pending')).toHaveTextContent('true');
        expect(api().getState().selectionError).toBeNull();
        expect(api().getState().selectionRevision).toBe(revision);
        expect(pickupAction).not.toHaveBeenCalled();
        await act(async () => {
            current.resolve({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'current' } });
            await current.promise;
        });
        await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'));
        expect(api().getState().selectedStoreInfo?.inventoryId).toBe('current');
    });

    it.each([
        'success',
        'failure',
    ] as const)('unrelated action %s cannot clear a new layout-effect preference save', async (outcome) => {
        const old = deferred<unknown>();
        const current = deferred<unknown>();
        const pickupAction = vi.fn(() => old.promise);
        const action = vi
            .fn()
            .mockResolvedValueOnce({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'inventory' } })
            .mockReturnValueOnce(current.promise);
        const { api, router } = setup(action, pickupAction, 'identity', 'preference');
        fireEvent.click(screen.getByText('Pickup'));
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        let unrelated!: Promise<void>;
        await act(async () => {
            unrelated = router.fetch('unrelated-caller', '0', '/pickup', {
                formMethod: 'PATCH',
                formData: new FormData(),
            });
            await Promise.resolve();
        });
        await waitFor(() => expect(pickupAction).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByText('Scope'));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
        await act(async () => {
            old.resolve({ success: outcome === 'success' });
            await Promise.resolve();
        });
        expect(api().getState().selectionPending).toBe(true);
        await act(async () => {
            current.resolve({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'current' } });
            await current.promise;
        });
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        await unrelated;
        router.dispose();
    });

    it('handles fast collapsed idle success once and terminates no-fresh-data idle without replay', async () => {
        const action = vi
            .fn()
            .mockResolvedValueOnce({ success: true, selectedStoreInfo: { id: 'new', inventoryId: 'inventory' } })
            .mockResolvedValueOnce(undefined);
        const { api } = setup(action);
        await act(async () => {
            fireEvent.click(screen.getByText('Save'));
            await Promise.resolve();
        });
        await waitFor(() => expect(api().getState().selectionPending).toBe(false));
        expect(api().getState().selectedStoreInfo?.id).toBe('new');
        await act(async () => {
            fireEvent.click(screen.getByText('Save'));
            await Promise.resolve();
        });
        await waitFor(() => expect(api().getState().selectionError).toBe('outcome_unknown'));
        expect(api().getState().selectionPending).toBe(false);
        expect(action).toHaveBeenCalledTimes(2);
    });
});
