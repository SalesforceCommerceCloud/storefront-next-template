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
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router';
import StoreLocatorProvider, {
    useStoreLocatorApi,
    type SelectedStoreResolution,
} from '@/extensions/store-locator/providers/store-locator';
import { PickupInventoryProvider, usePickupInventory, PickupInventoryRecovery } from './pickup-inventory';
import type { PdpPickupInventory } from '@/extensions/bopis/lib/pdp-pickup-inventory.server';
import DeliveryOptions from '@/components/fulfillment/delivery-options';
import ProductViewProvider from '@/providers/product-view';
import ProductCartActions from '@/components/product-cart-actions';
import PickupProvider, { usePickup } from '@/extensions/bopis/context/pickup-context';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { ConfigWrapper } from '@/test-utils/config';
import { useBulkChildProductInventory } from '@/hooks/product/use-bulk-child-product-inventory';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useProductSetsBundles } from '@/hooks/product/use-product-sets-bundles';
import { useProductActions } from '@/hooks/product/use-product-actions';
import { useState } from 'react';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: { id: siteId }, locale: { id: 'en-US' } }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }));
vi.mock('@/components/link', async () => ({
    Link: (await import('react-router')).Link,
}));
let api: ReturnType<typeof useStoreLocatorApi>;
let siteId = 'site';
function Consumer({ sku = 'sku' }: { sku?: string }) {
    api = useStoreLocatorApi();
    const result = usePickupInventory(sku);
    return (
        <output role="note">
            {result.status}:{result.product?.inventories?.[0]?.stockLevel ?? 'none'}
        </output>
    );
}
const store = { id: 'A', inventoryId: 'inv-A' };
function selectStore(info: { id: string; inventoryId: string }) {
    api.setState({ selectionRevision: api.getState().selectionRevision + 1 });
    api.getState().setSelectedStoreInfo(info);
}
function held<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((release) => {
        resolve = release;
    });
    return { promise, resolve };
}
function tree(
    selection: Promise<SelectedStoreResolution>,
    inventory: Promise<PdpPickupInventory>,
    sku = 'sku',
    identity = 'shopper'
) {
    return (
        <MemoryRouter>
            <ConfigWrapper>
                <StoreLocatorProvider identity={identity} selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory}>
                        <main>Critical product</main>
                        <Consumer sku={sku} />
                        <PickupInventoryRecovery />
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </ConfigWrapper>
        </MemoryRouter>
    );
}
const snapshot: PdpPickupInventory = {
    status: 'resolved',
    storeId: 'A',
    inventoryId: 'inv-A',
    products: [{ id: 'sku', inventories: [{ id: 'inv-A', stockLevel: 3, orderable: true }] }],
};
describe('PDP inventory source', () => {
    it('invalidates inventory through real coordinator begin and matching settlement revisions', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        render(tree(selection, Promise.resolve(snapshot)));
        await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('resolved:3'));
        const coordinator = createSelectionCoordinator(api);
        let operation!: NonNullable<ReturnType<typeof coordinator.begin>>;
        act(() => {
            const next = coordinator.begin('B', api.getState().generation);
            if (!next) throw new Error('Expected operation');
            operation = next;
        });
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
        const pendingRevision = api.getState().selectionRevision;
        act(() => {
            coordinator.complete(operation.id, { success: true, selectedStoreInfo: { id: 'B', inventoryId: 'inv-B' } });
        });
        expect(api.getState().selectionRevision).toBe(pendingRevision + 1);
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
        act(() => {
            coordinator.complete(operation.id, { success: true, selectedStoreInfo: store });
        });
        expect(api.getState().selectionRevision).toBe(pendingRevision + 1);
        expect(api.getState().selectedStoreInfo?.id).toBe('B');
    });
    it('hydrates an interactive SKU while the initial store seed is held and rejects its late result', async () => {
        const load = vi.fn();
        let fetched: { id: string; inventory: { id: string; ats: number; orderable: boolean } } | undefined;
        vi.spyOn(await import('@/hooks/use-scapi-fetcher'), 'useScapiFetcher').mockImplementation(
            () =>
                ({ load, state: 'idle', success: Boolean(fetched), data: fetched }) as unknown as ReturnType<
                    typeof useScapiFetcher
                >
        );
        const selection = held<SelectedStoreResolution>();
        const inventory = held<PdpPickupInventory>();
        const product = { id: 'master', type: { master: true }, price: 42 };
        function Actions({ sku }: { sku: string }) {
            const actions = useProductActions({
                product,
                currentVariant: { productId: sku, price: 42, orderable: true },
                hydrateVariantInventory: true,
            });
            return <button disabled={!actions.canAddToCart}>Purchase {sku}</button>;
        }
        function Page() {
            const [sku, setSku] = useState('A');
            return (
                <AllProvidersWrapper>
                    <StoreLocatorProvider selectedStoreResolution={selection.promise}>
                        <PickupInventoryProvider promise={inventory.promise}>
                            <button onClick={() => setSku('B')}>Select B</button>
                            <button onClick={() => setSku('A')}>Select A</button>
                            <Actions sku={sku} />
                        </PickupInventoryProvider>
                    </StoreLocatorProvider>
                </AllProvidersWrapper>
            );
        }
        const router = createMemoryRouter([{ path: '/', element: <Page /> }]);
        render(<RouterProvider router={router} />);
        expect(load).not.toHaveBeenCalled();
        await userEvent.setup().click(screen.getByRole('button', { name: 'Select B' }));
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        fetched = { id: 'B', inventory: { id: 'site-B', ats: 7, orderable: true } };
        await act(async () => {
            await router.revalidate();
        });
        expect(screen.getByRole('button', { name: 'Purchase B' })).toBeEnabled();
        fetched = undefined;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Select A' }));
        expect(load).toHaveBeenCalledTimes(2);
        fetched = { id: 'A', inventory: { id: 'new-site-A', ats: 9, orderable: true } };
        await act(async () => {
            await router.revalidate();
        });
        expect(screen.getByRole('button', { name: 'Purchase A' })).toBeEnabled();
        await act(async () => {
            selection.resolve({ selectedStoreInfo: store, error: null });
            inventory.resolve({
                ...snapshot,
                products: [{ id: 'A', inventory: { id: 'site-A', ats: 0, orderable: false } }],
            });
            await inventory.promise;
        });
        expect(screen.getByRole('button', { name: 'Purchase A' })).toBeEnabled();
        vi.restoreAllMocks();
    });
    it.each([
        true,
        false,
    ])('pickup ATC uses current SKU-owned store records, never master records (%s)', async (ownRecord) => {
        function ChoosePickup() {
            const pickup = usePickup();
            return <button onClick={() => pickup?.addItem('master', 'inv-A', 'A')}>Choose pickup</button>;
        }
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = Promise.resolve<PdpPickupInventory>({ ...snapshot, products: [] });
        const element = (
            <AllProvidersWrapper>
                <StoreLocatorProvider selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory}>
                        <ChoosePickup />
                        <ProductViewProvider
                            product={{
                                id: 'master',
                                type: { master: true },
                                price: 42,
                                inventory: { id: 'site', ats: 50, orderable: true },
                                inventories: ownRecord ? [] : [{ id: 'inv-A', stockLevel: 50, orderable: true }],
                            }}
                            currentVariant={
                                {
                                    productId: 'new-sku',
                                    price: 42,
                                    orderable: true,
                                    inventory: { id: 'site', ats: 7, orderable: true },
                                    inventories: ownRecord ? [{ id: 'inv-A', stockLevel: 7, orderable: true }] : [],
                                } as import('@/scapi').ShopperProducts.schemas['Variant']
                            }
                            initialFulfillmentSelection={{
                                optionId: 'pickup',
                                metadata: { inventoryId: 'inv-A', storeId: 'A' },
                            }}>
                            <ProductCartActions product={{ id: 'master', type: { master: true }, price: 42 }} />
                        </ProductViewProvider>
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        render(
            <RouterProvider
                router={createMemoryRouter([{ path: '/', element: <PickupProvider>{element}</PickupProvider> }])}
            />
        );
        await act(async () => {
            await inventory;
        });
        await userEvent.setup().click(screen.getByRole('button', { name: 'Choose pickup' }));
        if (ownRecord) expect(screen.getByTestId('add-to-cart')).toBeEnabled();
        else expect(screen.getByTestId('add-to-cart')).toBeDisabled();
    });
    it.each(['identity', 'site'])('accepts fresh root/PDP promises after a retained %s reset', async (scope) => {
        const firstSelection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const firstInventory = Promise.resolve(snapshot);
        const view = render(tree(firstSelection, firstInventory));
        await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('resolved:3'));
        const selection = held<SelectedStoreResolution>();
        const inventory = held<PdpPickupInventory>();
        if (scope === 'site') siteId = 'other-site';
        view.rerender(
            tree(selection.promise, inventory.promise, 'sku', scope === 'identity' ? 'new-shopper' : 'shopper')
        );
        await act(async () => {
            selection.resolve({ selectedStoreInfo: { id: 'B', inventoryId: 'inv-B' }, error: null });
            inventory.resolve({
                ...snapshot,
                storeId: 'B',
                inventoryId: 'inv-B',
                products: [{ id: 'sku', inventories: [{ id: 'inv-B', stockLevel: 7, orderable: true }] }],
            });
            await inventory.promise;
        });
        expect(screen.getByRole('note')).toHaveTextContent('resolved:7');
        act(() => {
            selectStore(store);
            selectStore({ id: 'B', inventoryId: 'inv-B' });
        });
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
        siteId = 'site';
    });
    it('retains delivery choice, publication, DOM and focus when pending inventory resolves', async () => {
        const user = userEvent.setup();
        const inventory = held<PdpPickupInventory>();
        const onSelectionChange = vi.fn();
        render(
            <AllProvidersWrapper>
                <StoreLocatorProvider
                    selectedStoreResolution={Promise.resolve({ selectedStoreInfo: store, error: null })}>
                    <PickupInventoryProvider promise={inventory.promise}>
                        <DeliveryOptions
                            product={{ id: 'sku', inventory: { id: 'site', ats: 5, orderable: true } }}
                            quantity={1}
                            onSelectionChange={onSelectionChange}
                        />
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        const delivery = screen.getByRole('radio', { name: 'fulfillment.delivery' });
        await user.click(delivery);
        expect(delivery).toBeChecked();
        expect(delivery).toHaveFocus();
        expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionId: 'delivery' }));
        await act(async () => {
            inventory.resolve(snapshot);
            await inventory.promise;
        });
        expect(screen.getByRole('radio', { name: 'fulfillment.delivery' })).toBe(delivery);
        expect(delivery).toBeChecked();
        expect(delivery).toHaveFocus();
        expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionId: 'delivery' }));
    });
    it('keeps delivery enabled and pickup gated while server inventory is pending', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = held<PdpPickupInventory>();
        render(
            <AllProvidersWrapper>
                <StoreLocatorProvider selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory.promise}>
                        <DeliveryOptions
                            product={{ id: 'sku', inventory: { id: 'site', ats: 5, orderable: true } }}
                            quantity={1}
                        />
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        expect(screen.getByRole('radio', { name: 'fulfillment.delivery' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: /pickUpInStore/ })).toBeDisabled();
        await act(async () => {
            inventory.resolve(snapshot);
            await inventory.promise;
        });
        await waitFor(() => expect(screen.getByRole('radio', { name: /pickUpInStore/ })).toBeEnabled());
    });
    it('initial child inventory comes from the seed without a mount load', async () => {
        const load = vi.fn();
        vi.spyOn(await import('@/hooks/use-scapi-fetcher'), 'useScapiFetcher').mockReturnValue({
            load,
            state: 'idle',
        } as unknown as ReturnType<typeof useScapiFetcher>);
        const inventory = held<PdpPickupInventory>();
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        function Children() {
            const result = useBulkChildProductInventory({
                childSelections: [
                    { product: { id: 'sku', inventory: { id: 'site', ats: 5, orderable: true } }, quantity: 1 },
                ],
                inventoryId: 'inv-A',
            });
            return (
                <span data-testid="child-stock">
                    {result.enrichedSelections[0].product.inventories?.[0]?.stockLevel ?? 'pending'}
                </span>
            );
        }
        render(
            <StoreLocatorProvider selectedStoreResolution={selection}>
                <PickupInventoryProvider promise={inventory.promise}>
                    <Children />
                </PickupInventoryProvider>
            </StoreLocatorProvider>
        );
        expect(load).not.toHaveBeenCalled();
        await act(async () => {
            inventory.resolve(snapshot);
            await inventory.promise;
        });
        expect(screen.getByTestId('child-stock')).toHaveTextContent('3');
        expect(load).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });
    it('allows choosing a store when the server resolves without a selected store', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: null, error: null });
        const inventory = Promise.resolve<PdpPickupInventory>({ status: 'empty', products: [] });
        render(
            <AllProvidersWrapper>
                <StoreLocatorProvider selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory}>
                        <DeliveryOptions
                            product={{ id: 'sku', inventory: { id: 'site', ats: 5, orderable: true } }}
                            quantity={1}
                        />
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        await act(async () => {
            await inventory;
        });
        expect(screen.getByRole('radio', { name: /pickUpInStore/ })).toBeEnabled();
    });
    it('fetches a newly selected child SKU without losing the interaction result to the seed', async () => {
        const load = vi.fn();
        const fetcher = { load, state: 'idle', success: false, data: undefined } as unknown as ReturnType<
            typeof useScapiFetcher
        >;
        vi.spyOn(await import('@/hooks/use-scapi-fetcher'), 'useScapiFetcher').mockReturnValue(fetcher);
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = Promise.resolve(snapshot);
        function Child({ sku }: { sku: string }) {
            const result = useBulkChildProductInventory({
                childSelections: [
                    {
                        product: { id: 'master' },
                        variant: {
                            productId: sku,
                            ...(sku === 'sku' ? { inventory: { id: 'site', ats: 5, orderable: true } } : {}),
                        },
                        quantity: 2,
                    },
                ],
                inventoryId: 'inv-A',
            });
            return (
                <span data-testid="selected-child-stock">
                    {result.enrichedSelections[0].product.inventories?.[0]?.stockLevel ?? 'pending'}
                </span>
            );
        }
        const content = (sku: string) => (
            <StoreLocatorProvider selectedStoreResolution={selection}>
                <PickupInventoryProvider promise={inventory}>
                    <Child sku={sku} />
                </PickupInventoryProvider>
            </StoreLocatorProvider>
        );
        const view = render(content('sku'));
        await act(async () => {
            await inventory;
        });
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByTestId('selected-child-stock')).toHaveTextContent('3');
        view.rerender(content('new-sku'));
        expect(load).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('selected-child-stock')).toHaveTextContent('pending');
        vi.mocked(useScapiFetcher).mockReturnValue({ ...fetcher, state: 'loading' });
        view.rerender(content('new-sku'));
        vi.mocked(useScapiFetcher).mockReturnValue({
            ...fetcher,
            success: true,
            data: { data: [{ id: 'new-sku', inventories: [{ id: 'inv-A', stockLevel: 7, orderable: true }] }] },
        } as unknown as ReturnType<typeof useScapiFetcher>);
        view.rerender(content('new-sku'));
        expect(screen.getByTestId('selected-child-stock')).toHaveTextContent('7');
        vi.restoreAllMocks();
    });
    it('uses new-store interaction inventory after rejecting the old seed', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = Promise.resolve(snapshot);
        function Options() {
            api = useStoreLocatorApi();
            return (
                <DeliveryOptions
                    product={{
                        id: 'sku',
                        inventory: { id: 'site', ats: 5, orderable: true },
                        inventories: [{ id: 'inv-B', stockLevel: 4, orderable: true }],
                    }}
                    quantity={1}
                />
            );
        }
        render(
            <AllProvidersWrapper>
                <StoreLocatorProvider selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory}>
                        <Options />
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        await act(async () => {
            await inventory;
        });
        act(() => selectStore({ id: 'B', inventoryId: 'inv-B' }));
        expect(screen.getByRole('radio', { name: /pickUpInStore/ })).toBeEnabled();
    });
    it('bundle pickup quantity uses deferred parent stock rather than child stock', async () => {
        vi.spyOn(await import('@/hooks/use-scapi-fetcher'), 'useScapiFetcher').mockReturnValue({
            load: vi.fn(),
            state: 'idle',
        } as unknown as ReturnType<typeof useScapiFetcher>);
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = Promise.resolve({
            ...snapshot,
            products: [
                { id: 'bundle', inventories: [{ id: 'inv-A', stockLevel: 2, orderable: true }] },
                {
                    id: 'sku',
                    inventory: { id: 'site', ats: 20, orderable: true },
                    inventories: [{ id: 'inv-A', stockLevel: 99, orderable: true }],
                },
            ],
        });
        function Bundle() {
            const result = useProductSetsBundles({
                product: {
                    id: 'bundle',
                    type: { bundle: true },
                    inventory: { id: 'site', stockLevel: 8, ats: 8, orderable: true },
                    bundledProducts: [{ id: 'sku', quantity: 1, product: { id: 'sku', type: { item: true } } }],
                },
                selectedStoreInventoryId: 'inv-A',
                basketPickupStore: { inventoryId: 'inv-A' },
            });
            return <span data-testid="bundle-stock">{result.bundleStockLevel ?? 'pending'}</span>;
        }
        render(
            <AllProvidersWrapper>
                <StoreLocatorProvider selectedStoreResolution={selection}>
                    <PickupInventoryProvider promise={inventory}>
                        <MemoryRouter>
                            <Bundle />
                        </MemoryRouter>
                    </PickupInventoryProvider>
                </StoreLocatorProvider>
            </AllProvidersWrapper>
        );
        await act(async () => {
            await inventory;
        });
        expect(screen.getByTestId('bundle-stock')).toHaveTextContent('2');
        vi.restoreAllMocks();
    });
    it('survives its own root adoption but rejects local A to B to A', async () => {
        const selection = held<SelectedStoreResolution>();
        const inventory = held<PdpPickupInventory>();
        render(tree(selection.promise, inventory.promise));
        expect(screen.getByRole('main')).toHaveTextContent('Critical product');
        expect(screen.getByRole('note')).toHaveTextContent('pending:none');
        await act(async () => {
            selection.resolve({ selectedStoreInfo: store, error: null });
            await selection.promise;
        });
        await act(async () => {
            inventory.resolve(snapshot);
            await inventory.promise;
        });
        expect(screen.getByRole('note')).toHaveTextContent('resolved:3');
        act(() => {
            selectStore({ id: 'B', inventoryId: 'inv-B' });
            selectStore(store);
        });
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
    });
    it('releases the initial-fetch gate when the shopper changes stores before the seed resolves', async () => {
        const selection = held<SelectedStoreResolution>();
        const inventory = held<PdpPickupInventory>();
        render(tree(selection.promise, inventory.promise));
        act(() => selectStore({ id: 'B', inventoryId: 'inv-B' }));
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
        await act(async () => {
            selection.resolve({ selectedStoreInfo: store, error: null });
            inventory.resolve(snapshot);
            await inventory.promise;
        });
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
    });
    it('does not reuse old inventory when auth identity changes with the same promises', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const inventory = Promise.resolve(snapshot);
        const view = render(tree(selection, inventory));
        await act(async () => {
            await inventory;
        });
        expect(screen.getByRole('note')).toHaveTextContent('resolved:3');
        view.rerender(tree(selection, inventory, 'sku', 'other-shopper'));
        await act(async () => {
            await inventory;
        });
        expect(screen.getByRole('note')).toHaveTextContent('stale:none');
    });
    it('does not borrow another SKU inventory and retries a late auth error without a recovery link', async () => {
        const selection = Promise.resolve({ selectedStoreInfo: store, error: null });
        const view = render(tree(selection, Promise.resolve(snapshot), 'master'));
        await act(async () => {
            await selection;
        });
        expect(screen.getByRole('note')).toHaveTextContent('resolved:none');
        const inventory = held<PdpPickupInventory>();
        view.rerender(tree(selection, inventory.promise));
        await act(async () => {
            inventory.resolve({ ...snapshot, status: 'auth-error' });
            await inventory.promise;
        });
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('status')).toBeNull();
    });
});
