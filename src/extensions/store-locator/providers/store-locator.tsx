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
import {
    createContext,
    type ComponentProps,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    Suspense,
    type ReactNode,
} from 'react';
import { Await, UNSAFE_DataRouterContext } from 'react-router';
import {
    type StoreLocatorStore,
    type StoreApi,
    type SelectedStoreInfo,
    createStoreLocatorStore,
} from '@/extensions/store-locator/stores/store-locator-store';
import {
    getStoreLocatorSearchMemory,
    isStoreLocatorSearchMemory,
} from '@/extensions/store-locator/stores/store-locator-search-memory';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import {
    getLateAuthRecoveryPhase,
    startLateAuthRecovery,
    subscribeLateAuthRecovery,
} from '@/extensions/store-locator/lib/late-auth-recovery';
import { StoreLocatorContext } from '@/extensions/store-locator/providers/context';
import StoreSelectionCoordinator from '@/extensions/store-locator/providers/selection';

export type StoreLocatorStoreApi = StoreApi<StoreLocatorStore>;

export type SelectedStoreResolution = {
    selectedStoreInfo: SelectedStoreInfo | null;
    error: 'profile' | 'store' | null;
    authError?: boolean;
};
type SelectionSource = {
    promise: Promise<SelectedStoreResolution>;
    scope: string;
    generation: number;
    revision: number;
    adoptedRevision?: number;
};
const SelectionResolutionContext = createContext<SelectionSource | null>(null);

/** Retry a late 401 once: revalidate with the recover flag so the root loader awaits the read and the auth middleware refreshes. */
// oxlint-disable-next-line react-refresh/only-export-components
export function useLateAuthRecovery(): () => void {
    const router = useContext(UNSAFE_DataRouterContext)?.router;
    return useCallback(() => {
        if (router) void startLateAuthRecovery(() => router.revalidate());
    }, [router]);
}

function RecoverOnAuthError({ authError }: { authError: boolean }) {
    const recover = useLateAuthRecovery();
    useEffect(() => {
        if (authError) recover();
    }, [authError, recover]);
    return null;
}

function SelectionAuthRecovery() {
    const source = useContext(SelectionResolutionContext);
    const revision = useStoreLocator((state) => state.selectionRevision);
    const scope = useStoreLocator((state) => state.identityScope);
    const pending = useStoreLocator((state) => state.selectionPending);
    const generation = useStoreLocator((state) => state.generation);
    if (
        !source ||
        pending ||
        generation !== source.generation ||
        revision !== source.revision ||
        scope !== source.scope
    )
        return null;
    return (
        <Suspense fallback={null}>
            <Await resolve={source.promise} errorElement={<></>}>
                {(result: SelectedStoreResolution) => <RecoverOnAuthError authError={Boolean(result.authError)} />}
            </Await>
        </Suspense>
    );
}

/** Only store-dependent leaves suspend; the shell and mutation coordinator stay mounted. */
export function SelectedStoreBoundary({
    children,
    fallback,
    errorFallback,
}: {
    children: (selection?: SelectedStoreInfo | null) => ReactNode;
    fallback: ReactNode;
    errorFallback?: ReactNode;
}) {
    const source = useContext(SelectionResolutionContext);
    const revision = useStoreLocator((state) => state.selectionRevision);
    const scope = useStoreLocator((state) => state.identityScope);
    const pending = useStoreLocator((state) => state.selectionPending);
    const generation = useStoreLocator((state) => state.generation);
    const recoveryPhase = useSyncExternalStore(
        subscribeLateAuthRecovery,
        getLateAuthRecoveryPhase,
        getLateAuthRecoveryPhase
    );
    if (!source) return children();
    if (scope !== source.scope || generation !== source.generation) return fallback;
    if (pending || revision !== source.revision) return children();
    return (
        <Suspense fallback={fallback}>
            <Await resolve={source.promise} errorElement={<>{errorFallback ?? children()}</>}>
                {(result: SelectedStoreResolution) =>
                    // A late 401 is retried once; show the loading state until that retry settles.
                    result.authError && recoveryPhase !== 'failed'
                        ? fallback
                        : result.error || result.authError
                          ? (errorFallback ?? children())
                          : children(result.selectedStoreInfo)
                }
            </Await>
        </Suspense>
    );
}

/**
 * StoreLocatorProvider
 *
 * Provides a permanent, identity-scoped store instance for the store locator feature.
 * Reconciles the root loader promise without suspending children or changing mutation revisions.
 *
 * @param children - React subtree that needs access to store locator state
 * @param selectedStoreInfo - Optional authoritative selection for standalone consumers
 * @returns ReactElement
 */
export const StoreLocatorStateProvider = ({
    children,
    selectedStoreInfo,
    selectedStoreResolution,
    homeStorePromptDismissed,
    identity = 'guest',
    resolutionError = false,
}: PropsWithChildren<{
    selectedStoreInfo?: SelectedStoreInfo | null;
    selectedStoreResolution?: Promise<SelectedStoreResolution>;
    homeStorePromptDismissed?: boolean;
    identity?: string;
    resolutionError?: boolean;
}>) => {
    const { site } = useSite();
    const storeRef = useRef<StoreLocatorStoreApi | null>(null);
    const isInitialRenderRef = useRef(true);
    const scope = JSON.stringify([site.id, identity]);
    const scopeRef = useRef(scope);
    const sourceRef = useRef<SelectionSource | null>(null);
    if (storeRef.current === null) {
        storeRef.current = createStoreLocatorStore({
            identityScope: scope,
            selectedStoreInfo: selectedStoreInfo ?? null,
            homeStorePromptDismissed: homeStorePromptDismissed ?? false,
        });
    }

    // A scope change cannot make an already-started read belong to the new shopper/site.
    if (sourceRef.current?.promise !== selectedStoreResolution) {
        sourceRef.current = selectedStoreResolution
            ? {
                  promise: selectedStoreResolution,
                  scope,
                  generation: storeRef.current.getState().generation + (scopeRef.current !== scope ? 1 : 0),
                  revision: storeRef.current.getState().selectionRevision,
              }
            : null;
    }

    useLayoutEffect(() => {
        if (isInitialRenderRef.current) {
            isInitialRenderRef.current = false;
            return;
        }

        const scopeChanged = scopeRef.current !== scope;
        if (scopeChanged) {
            scopeRef.current = scope;
            const store = storeRef.current;
            if (store) {
                store.setState({
                    // Scope owns invalidation; keep the revision consumable by this scope's root/PDP seed.
                    identityScope: scope,
                    generation: store.getState().generation + 1,
                    session: store.getState().session + 1,
                    chooserStoreInfo: null,
                    chooserOwner: null,
                    confirmedSelection: null,
                    selectionPending: false,
                    selectionSettlement: null,
                    selectionError: null,
                    searchResult: null,
                    searchParams: null,
                    shouldSearch: false,
                    deviceCoordinates: { latitude: null, longitude: null },
                    geoError: false,
                    isOpen: false,
                    mode: 'input',
                });
            }
        }
        // Root resolution is authoritative after auth/site changes and revalidation.
        if (scopeChanged || (selectedStoreInfo !== undefined && !resolutionError))
            storeRef.current?.getState().setSelectedStoreInfo(selectedStoreInfo ?? null);
        storeRef.current?.getState().setHomeStorePromptDismissed(homeStorePromptDismissed ?? false);
    }, [homeStorePromptDismissed, selectedStoreInfo, scope, resolutionError]);

    useLayoutEffect(() => {
        const store = storeRef.current;
        const source = sourceRef.current;
        if (!source || !store || source.scope !== scope) return;
        let active = true;
        void source.promise.then(
            (result) => {
                const state = store.getState();
                if (
                    active &&
                    sourceRef.current === source &&
                    state.identityScope === source.scope &&
                    state.generation === source.generation &&
                    state.selectionRevision === source.revision &&
                    !state.selectionPending &&
                    !result.error &&
                    !result.authError
                ) {
                    // Publication is a read, not a user mutation. PDP snapshots share this revision.
                    source.adoptedRevision = state.selectionRevision;
                    state.setSelectedStoreInfo(result.selectedStoreInfo);
                }
            },
            () => {
                /* Leaf Await owns the error fallback. */
            }
        );
        return () => {
            active = false;
        };
    }, [selectedStoreResolution, scope]);

    useEffect(() => {
        const searchMemory = getStoreLocatorSearchMemory(site.id);
        if (isStoreLocatorSearchMemory(searchMemory)) {
            const { mode, searchParams, searchResult } = searchMemory;
            storeRef.current?.setState({ mode, searchParams, searchResult });
        }
    }, [site.id]);

    return (
        <StoreLocatorContext.Provider value={storeRef.current}>
            <SelectionResolutionContext.Provider
                value={
                    sourceRef.current?.scope === scope &&
                    sourceRef.current.generation ===
                        storeRef.current.getState().generation + (scopeRef.current !== scope ? 1 : 0)
                        ? sourceRef.current
                        : null
                }>
                <SelectionAuthRecovery />
                {children}
            </SelectionResolutionContext.Provider>
        </StoreLocatorContext.Provider>
    );
};

/** Read live state in asynchronous callbacks without subscribing the component. */
// oxlint-disable-next-line react-refresh/only-export-components
export const useStoreLocatorApi = (): StoreLocatorStoreApi => {
    const store = useContext(StoreLocatorContext);
    if (!store) {
        throw new Error('useStoreLocator must be used within StoreLocatorProvider');
    }
    return store;
};

/** Read the parent source without creating a second selection owner. */
// oxlint-disable-next-line react-refresh/only-export-components
export const useSelectedStoreSource = () => useContext(SelectionResolutionContext);

/**
 * Selector-based hook to read from the store locator state within the provider.
 * Uses {@link useSyncExternalStore} for optimal re-render behavior.
 * Throws if used outside the provider.
 *
 * @param selector - Function selecting a slice of `StoreLocatorStore`
 * @returns The selected slice value
 *
 * @example
 * const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
 * const selectedStoreId = selectedStoreInfo?.id;
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const useStoreLocator = <T,>(selector: (store: StoreLocatorStore) => T): T => {
    const store = useStoreLocatorApi();

    const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export default function StoreLocatorProvider({ children, ...props }: ComponentProps<typeof StoreLocatorStateProvider>) {
    const router = useContext(UNSAFE_DataRouterContext);
    return (
        <StoreLocatorStateProvider {...props}>
            {router ? <StoreSelectionCoordinator>{children}</StoreSelectionCoordinator> : children}
        </StoreLocatorStateProvider>
    );
}
