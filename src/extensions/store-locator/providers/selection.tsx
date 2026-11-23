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
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useCallback,
    useState,
    useMemo,
    type PropsWithChildren,
} from 'react';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { useTranslation } from 'react-i18next';
import { resourceRoutes } from '@/route-paths';
import { Button } from '@/components/ui/button';
import { useStoreLocator, useStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import {
    SELECTED_STORE_FETCHER_KEY,
    type SelectedStoreInfo,
} from '@/extensions/store-locator/stores/store-locator-store';
import {
    createSelectionCoordinator,
    type SelectionResult,
} from '@/extensions/store-locator/stores/selection-coordinator';

const SelectionContext = createContext<{
    select: (store: SelectedStoreInfo | null) => void;
    retry: () => void;
    registerFeedback: () => () => void;
} | null>(null);

/** Always mounted inside StoreLocatorProvider. Owns preference persistence only. */
export default function StoreSelectionCoordinator({ children }: PropsWithChildren) {
    const store = useStoreLocatorApi();
    const generation = useStoreLocator((state) => state.generation);
    const scope = useStoreLocator((state) => state.identityScope);
    const [instance] = useState(() => crypto.randomUUID());
    const coordinator = useRef<ReturnType<typeof createSelectionCoordinator> | null>(null);
    if (!coordinator.current) coordinator.current = createSelectionCoordinator(store);
    const preferenceKey = `${SELECTED_STORE_FETCHER_KEY}:${instance}:${scope}:${generation}`;
    const fetcher = useFetcher<SelectionResult>({ key: preferenceKey });
    type Transport = {
        scope: typeof scope;
        generation: number;
        preferenceKey: string;
        preference: typeof fetcher;
    };
    const fetchers = useRef<Transport | null>(null);
    const queued = useRef<{ scope: typeof scope; generation: number; dispatch: (transport: Transport) => void }[]>([]);
    const operation = useRef<{
        id: number;
        generation: number;
        scope: typeof scope;
        key: string | null;
        previous: unknown;
        started: boolean;
        settled: boolean;
    } | null>(null);
    const [settlement, notifySettlement] = useState(0);
    useLayoutEffect(
        () =>
            store.subscribe(() => {
                const liveGeneration = store.getState().generation;
                coordinator.current?.invalidate();
                if (operation.current?.generation !== liveGeneration) operation.current = null;
                queued.current = queued.current.filter(
                    (entry) => entry.generation === liveGeneration && entry.scope === store.getState().identityScope
                );
            }),
        [store]
    );
    const [feedbackHosts, setFeedbackHosts] = useState(0);
    const registerFeedback = useCallback(() => {
        setFeedbackHosts((count) => count + 1);
        return () => setFeedbackHosts((count) => count - 1);
    }, []);

    // Descendant layout effects run before ours. Queue their new-scope intents until
    // useFetcher has committed that scope's transport; never publish transports in render.
    const dispatch = useCallback(
        (entry: (typeof queued.current)[number]) => {
            const live = store.getState();
            if (entry.generation !== live.generation || entry.scope !== live.identityScope) return;
            const transport = fetchers.current;
            if (transport?.generation === entry.generation && transport.scope === entry.scope)
                entry.dispatch(transport);
            else queued.current.push(entry);
        },
        [store]
    );
    useLayoutEffect(() => {
        fetchers.current = { scope, generation, preferenceKey, preference: fetcher };
        const waiting = queued.current;
        queued.current = [];
        for (const entry of waiting) dispatch(entry);
    });

    const submit = useCallback(
        (next: ReturnType<ReturnType<typeof createSelectionCoordinator>['begin']> | undefined) => {
            if (!next) return;
            const active = {
                id: next.id,
                generation: next.generation,
                scope: store.getState().identityScope,
                key: null as string | null,
                previous: undefined as unknown,
                started: false,
                settled: false,
            };
            operation.current = active;
            const owns = () =>
                operation.current === active &&
                active.generation === store.getState().generation &&
                active.scope === store.getState().identityScope;
            const failed = () => {
                if (!owns()) return;
                operation.current = null;
                coordinator.current?.complete(next.id);
            };
            dispatch({
                scope: active.scope,
                generation: active.generation,
                dispatch: (transport) => {
                    if (!owns()) return;
                    active.key = transport.preferenceKey;
                    active.previous = transport.preference.data;
                    try {
                        const submission = transport.preference.submit(next.formData, {
                            method: 'POST',
                            action: resourceRoutes.setSelectedStore,
                        });
                        if (submission !== undefined)
                            void submission.then(() => {
                                if (!owns()) return;
                                active.settled = true;
                                notifySettlement((count) => count + 1);
                            }, failed);
                    } catch {
                        failed();
                    }
                },
            });
        },
        [store, dispatch]
    );
    const select = useCallback(
        (info: SelectedStoreInfo | null) => {
            submit(coordinator.current?.begin(info?.id ?? null, generation, undefined, info?.fulfillmentMode));
        },
        [generation, submit]
    );
    const retry = useCallback(() => submit(coordinator.current?.retry(generation)), [generation, submit]);

    // Route prices and this fetcher's result commit together. Settle the existing selection
    // before paint. Independently reloaded resource consumers must hide their retained data while loading.
    useLayoutEffect(() => {
        const active = operation.current;
        if (
            !active ||
            active.key !== preferenceKey ||
            active.generation !== store.getState().generation ||
            active.scope !== store.getState().identityScope
        )
            return;
        if (fetcher.state !== 'idle') active.started = true;
        if (fetcher.state !== 'idle') return;
        const fresh = fetcher.data !== active.previous && fetcher.data !== undefined;
        if (!fresh && !active.started && !active.settled) return;
        operation.current = null;
        coordinator.current?.complete(active.id, fresh ? fetcher.data : undefined);
    }, [fetcher.data, fetcher.state, preferenceKey, store, settlement]);

    const isOpen = useStoreLocator((state) => state.isOpen);
    const actions = useMemo(() => ({ select, retry, registerFeedback }), [select, retry, registerFeedback]);
    return (
        <SelectionContext.Provider value={actions}>
            {children}
            {!isOpen && feedbackHosts === 0 && <SelectionFeedback retry={retry} />}
        </SelectionContext.Provider>
    );
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useStoreSelectionFeedbackHost() {
    const context = useContext(SelectionContext);
    const registerFeedback = context?.registerFeedback;
    useEffect(() => registerFeedback?.(), [registerFeedback]);
}

export function SelectionFeedback({ retry }: { retry: () => void }) {
    const { t } = useTranslation(['extStoreLocator', 'account', 'routeError']);
    const selectionPending = useStoreLocator((state) => state.selectionPending);
    const selectionIntent = useStoreLocator((state) => state.selectionIntent);
    const selectionError = useStoreLocator((state) => state.selectionError);
    // begin() clears the error synchronously. Keep the Retry control mounted (and focusable) for the
    // retry's duration so keyboard focus is not dropped to the body if the retry fails again.
    const [retryRetained, setRetryRetained] = useState(false);
    useEffect(() => {
        if (selectionError) setRetryRetained(true);
        else if (!selectionPending) setRetryRetained(false);
    }, [selectionError, selectionPending]);
    const confirmationRequired = selectionError === 'STORE_CHANGE_CONFIRMATION_REQUIRED';
    const showRetry = !confirmationRequired && (!!selectionError || (selectionPending && retryRetained));
    return (
        <div aria-live="polite" className="text-center">
            {selectionPending && (
                <p role="status">
                    {t(
                        selectionPending
                            ? selectionIntent === 'reconcile'
                                ? 'storeLocator.selection.checking'
                                : selectionIntent === 'clear'
                                  ? 'storeLocator.selection.clearing'
                                  : 'storeLocator.selection.saving'
                            : 'storeLocator.selection.saving'
                    )}
                </p>
            )}
            {selectionError && (
                <p role="alert">
                    {t(
                        confirmationRequired
                            ? 'routeError:commerceContext.confirmationMessage'
                            : selectionError === 'outcome_unknown'
                              ? 'storeLocator.selection.unknown'
                              : selectionError === 'PREFERRED_STORE_PERSISTENCE_FAILED'
                                ? 'account:storePreferences.preferredStore.accountDefaultError'
                                : 'storeLocator.selection.error'
                    )}
                </p>
            )}
            {showRetry && (
                <Button
                    type="button"
                    variant="outline"
                    aria-disabled={selectionPending}
                    onClick={selectionPending ? undefined : retry}>
                    {t('storeLocator.selection.retry')}
                </Button>
            )}
        </div>
    );
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useStoreSelection() {
    const value = useContext(SelectionContext);
    const store = useStoreLocatorApi();
    const generation = useStoreLocator((state) => state.generation);
    const session = useStoreLocator((state) => state.session);
    const select = useCallback(
        (info: SelectedStoreInfo | null) => {
            const live = store.getState();
            if (live.generation === generation && live.session === session) value?.select(info);
        },
        [generation, session, store, value]
    );
    const retry = useCallback(() => {
        const live = store.getState();
        if (live.generation === generation && live.session === session) value?.retry();
    }, [generation, session, store, value]);
    if (!value) throw new Error('useStoreSelection must be used within StoreLocatorProvider');
    return { select, retry };
}
