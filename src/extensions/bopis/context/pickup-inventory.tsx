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
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useSyncExternalStore,
    Suspense,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import { Await } from 'react-router';
import {
    useSelectedStoreSource,
    useStoreLocatorApi,
    useLateAuthRecovery,
} from '@/extensions/store-locator/providers/store-locator';
import type { PdpPickupInventory } from '@/extensions/bopis/lib/pdp-pickup-inventory.server';

function createInventorySource(
    promise: Promise<PdpPickupInventory>,
    selection: ReturnType<typeof useSelectedStoreSource>,
    api: ReturnType<typeof useStoreLocatorApi>
) {
    let result: PdpPickupInventory | null = null;
    const listeners = new Set<() => void>();
    return {
        promise,
        selection,
        api,
        // A replacement root source finalizes its revision after the scope-reset layout effect.
        // Existing sources must retain the revision captured before any later local mutation.
        revision:
            selection &&
            selection.adoptedRevision === undefined &&
            selection.revision === api.getState().selectionRevision
                ? undefined
                : api.getState().selectionRevision,
        getSnapshot: () => result,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        publish: (value: PdpPickupInventory) => {
            result = value;
            listeners.forEach((listener) => listener());
        },
    };
}
const InventoryContext = createContext<ReturnType<typeof createInventorySource> | null>(null);
const ResolvedContext = createContext<PdpPickupInventory | null>(null);
const subscribeEmpty = () => () => {
    /* No inventory source to unsubscribe. */
};
const emptySnapshot = () => null;

/** The source is scoped to this PDP; publishing never suspends the product/provider tree. */
export function PickupInventoryProvider({
    promise,
    children,
}: PropsWithChildren<{ promise?: Promise<PdpPickupInventory> }>) {
    return promise ? <ActiveInventoryProvider promise={promise}>{children}</ActiveInventoryProvider> : children;
}
function ActiveInventoryProvider({ promise, children }: PropsWithChildren<{ promise: Promise<PdpPickupInventory> }>) {
    const selection = useSelectedStoreSource();
    const api = useStoreLocatorApi();
    const ref = useRef<ReturnType<typeof createInventorySource> | null>(null);
    if (!ref.current || ref.current.promise !== promise || ref.current.selection !== selection) {
        ref.current = createInventorySource(promise, selection, api);
    }
    const source = ref.current;
    useEffect(() => {
        let active = true;
        void promise.then(
            (result) => {
                if (active) source.publish(result);
            },
            () => {
                if (active) source.publish({ status: 'error', products: [] });
            }
        );
        return () => {
            active = false;
        };
    }, [promise, source]);
    return <InventoryContext.Provider value={source}>{children}</InventoryContext.Provider>;
}

/** Resolve only a fulfillment leaf, keeping delivery available in its pending fallback. */
export function PickupInventoryBoundary({ children, fallback }: PropsWithChildren<{ fallback: ReactNode }>) {
    const source = useContext(InventoryContext);
    const inventory = usePickupInventory('');
    if (!source || inventory.status === 'stale') return children;
    return (
        <Suspense fallback={fallback}>
            <Await resolve={source.promise} errorElement={fallback}>
                {(result: PdpPickupInventory) => (
                    <ResolvedContext.Provider value={result}>{children}</ResolvedContext.Provider>
                )}
            </Await>
        </Suspense>
    );
}

/** Only exact-SKU results from the current parent source/revision/store are usable. */
// oxlint-disable-next-line react-refresh/only-export-components
export function usePickupInventory(productId: string) {
    const source = useContext(InventoryContext);
    const resolved = useContext(ResolvedContext);
    const initialSelection = useRef({ source, productId, changed: false });
    if (initialSelection.current.source !== source) initialSelection.current = { source, productId, changed: false };
    if (initialSelection.current.productId !== productId) initialSelection.current.changed = true;
    const published = useSyncExternalStore(
        source?.subscribe ?? subscribeEmpty,
        source?.getSnapshot ?? emptySnapshot,
        emptySnapshot
    );
    const selection = useSelectedStoreSource();
    const state = useSyncExternalStore(
        source?.api.subscribe ?? subscribeEmpty,
        source ? source.api.getState : emptySnapshot,
        source ? source.api.getState : emptySnapshot
    );
    const revision = state?.selectionRevision;
    const selected = state?.selectedStoreInfo;
    const result = resolved ?? published;
    const expectedRevision =
        source?.revision === undefined || source?.revision === source?.selection?.revision
            ? (source?.selection?.adoptedRevision ?? source?.selection?.revision ?? source?.revision)
            : source?.revision;
    // Post-write revalidation commits while the write is pending, so its sources carry the pending
    // revision. They stay usable after a confirmed write only through the strict store-identity match.
    const settlement = state?.selectionSettlement;
    const afterConfirmedWrite =
        !!settlement &&
        revision === settlement.to &&
        expectedRevision === settlement.from &&
        !!result &&
        result.storeId === selected?.id &&
        result.inventoryId === selected?.inventoryId;
    const matchingSource =
        source &&
        source.selection === selection &&
        selection != null &&
        (revision === expectedRevision || afterConfirmedWrite);
    // During SSR the root store has not adopted its streamed result yet.
    const unadopted = matchingSource && !afterConfirmedWrite && selection.adoptedRevision === undefined;
    const matchingStore =
        result && (unadopted || (result.storeId === selected?.id && result.inventoryId === selected?.inventoryId));
    const snapshot = matchingSource && matchingStore ? result : null;
    const isInitialSelection = !initialSelection.current.changed;
    const product = isInitialSelection ? snapshot?.products.find((candidate) => candidate.id === productId) : undefined;
    return {
        active: source != null,
        isInitialSelection,
        status: !source
            ? ('inactive' as const)
            : !matchingSource
              ? ('stale' as const)
              : snapshot
                ? snapshot.status
                : ('pending' as const),
        product,
        snapshot,
    };
}

/** Pickup inventory hit a late 401: retry once (shared with the store badge); renders nothing. */
export function PickupInventoryRecovery() {
    const { status } = usePickupInventory('');
    const recover = useLateAuthRecovery();
    useEffect(() => {
        if (status === 'auth-error') recover();
    }, [status, recover]);
    return null;
}
