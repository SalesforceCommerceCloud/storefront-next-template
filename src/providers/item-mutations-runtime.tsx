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
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useFetchers, useInRouterContext } from 'react-router';
import { useAuthFetcher } from '@/hooks/use-auth-fetcher';
import { useBasketItemStore } from '@/providers/basket-item-state';
import { getStore, type Entry, type Store } from '@/providers/item-mutations-store';

/** Native fetcher ownership stays in a small leaf; controls do not subscribe to Router's full fetcher context. */
function ItemFetcherHandle({ store, entry }: { store: Store; entry: Entry }) {
    const fetcher = useAuthFetcher<unknown>({ key: entry.key });
    const submitRef = useRef(fetcher.submit);
    useLayoutEffect(() => {
        submitRef.current = fetcher.submit;
    });
    useLayoutEffect(() => store.register(entry, (...args) => submitRef.current(...args)), [store, entry]);
    useLayoutEffect(
        () => store.publish(entry, { state: fetcher.state, data: fetcher.data }),
        [store, entry, fetcher.state, fetcher.data]
    );
    return null;
}
function ItemFetcherMonitor({ store }: { store: Store }) {
    const fetchers = useFetchers();
    const entries = useSyncExternalStore(store.subscribeHandles, store.getHandles, store.getServerHandles);
    useLayoutEffect(
        () =>
            store.publishPending(fetchers.filter((fetcher) => fetcher.state !== 'idle').map((fetcher) => fetcher.key)),
        [store, fetchers]
    );
    return entries.map((entry) => <ItemFetcherHandle key={entry.key} store={store} entry={entry} />);
}
/** Supplied by active controls, never imported by the initial basket shell. */
export default function ItemMutationsRuntime() {
    const basket = useBasketItemStore();
    const store = getStore(basket);
    const inRouter = useInRouterContext();
    return inRouter ? <ItemFetcherMonitor store={store} /> : null;
}
