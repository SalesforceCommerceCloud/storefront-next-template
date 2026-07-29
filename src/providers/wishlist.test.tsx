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
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    useIsInWishlist,
    useWishlistActions,
    useWishlistCount,
    useWishlistEntry,
    useWishlistLoader,
    useWishlistIds,
    useWishlistSession,
} from './wishlist';
import { resetWishlistStore, seedWishlistStore } from '@/test-utils/wishlist';
import { resourceRoutes } from '@/route-paths';

/** Build a `Response` mirroring what `/action/wishlist-*` serializes via `data()`. */
function actionResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

// The store is a module-level singleton (no provider): reset every bit of its state between tests
// so ids, load latch, session owner, and the write chain never leak across cases.
beforeEach(() => {
    resetWishlistStore();
});

describe('wishlist store — read-only behavior', () => {
    test('useIsInWishlist returns true for seeded ids', () => {
        seedWishlistStore('c', ['sku-1', 'sku-2']);

        const sku1 = renderHook(() => useIsInWishlist('sku-1'));
        const sku2 = renderHook(() => useIsInWishlist('sku-2'));
        const missing = renderHook(() => useIsInWishlist('not-in-list'));

        expect(sku1.result.current).toBe(true);
        expect(sku2.result.current).toBe(true);
        expect(missing.result.current).toBe(false);
    });

    test('useWishlistCount returns the seeded size', () => {
        seedWishlistStore('c', ['sku-1', 'sku-2']);
        const { result } = renderHook(() => useWishlistCount());
        expect(result.current).toBe(2);
    });

    test('useWishlistIds returns the seeded ids', () => {
        seedWishlistStore('c', ['sku-1', 'sku-2']);
        const { result } = renderHook(() => useWishlistIds());
        expect(Array.from(result.current).sort()).toEqual(['sku-1', 'sku-2']);
    });

    test('empty store: count 0, no members, not pending', () => {
        const count = renderHook(() => useWishlistCount());
        const member = renderHook(() => useIsInWishlist('anything'));
        const actions = renderHook(() => useWishlistActions());

        expect(count.result.current).toBe(0);
        expect(member.result.current).toBe(false);
        expect(actions.result.current.isPending).toBe(false);
    });
});

describe('wishlist store — action-backed mutations', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    /** Seed a signed-in session (default 'cust-1') plus any pre-existing ids, then expose the actions. */
    function setup(customerId: string | null = 'cust-1', productIds: string[] = []) {
        seedWishlistStore(customerId, productIds);
        return renderHook(() => ({ actions: useWishlistActions() }));
    }

    // For tests that need a stable per-product subscription across mutations, also expose that
    // product's membership + entry flags alongside the actions.
    function setupFor(productId: string, productIds: string[] = [], customerId: string | null = 'cust-1') {
        seedWishlistStore(customerId, productIds);
        return renderHook(() => ({
            actions: useWishlistActions(),
            inWishlist: useIsInWishlist(productId),
            entry: useWishlistEntry(productId),
        }));
    }

    test('add(): optimistic insert while pending; success confirms; a single POST is issued', async () => {
        fetchSpy.mockResolvedValue(actionResponse({ success: true }));

        const { result } = setupFor('sku-1');

        let promise!: Promise<unknown>;
        act(() => {
            promise = result.current.actions.add('sku-1');
        });
        // Synchronously after act() returns, the optimistic state should have flipped.
        expect(result.current.inWishlist).toBe(true);
        expect(result.current.entry.pending).toBe(true);

        await act(async () => {
            const r = (await promise) as { success: boolean };
            expect(r.success).toBe(true);
        });

        expect(result.current.inWishlist).toBe(true);
        expect(result.current.entry.pending).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('add(): POSTs productId to the wishlist-add action route', async () => {
        fetchSpy.mockResolvedValue(actionResponse({ success: true }));

        const { result } = setupFor('sku-1');
        await act(async () => {
            await result.current.actions.add('sku-1');
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/action/wishlist-add');
        expect(init.method).toBe('POST');
        expect(init.body).toBeInstanceOf(FormData);
        expect((init.body as FormData).get('productId')).toBe('sku-1');
    });

    test('add(): server failure rolls back so isMember returns to false', async () => {
        fetchSpy.mockResolvedValue(actionResponse({ success: false, error: { message: 'Boom' } }, 500));

        const { result } = setupFor('sku-2');

        await act(async () => {
            const r = (await result.current.actions.add('sku-2')) as { success: boolean };
            expect(r.success).toBe(false);
        });

        expect(result.current.inWishlist).toBe(false);
    });

    test('remove(): optimistic delete; success keeps inWishlist false', async () => {
        fetchSpy.mockResolvedValue(actionResponse({ success: true }));

        const { result } = setupFor('sku-3', ['sku-3']);
        expect(result.current.inWishlist).toBe(true);

        await act(async () => {
            const r = (await result.current.actions.remove('sku-3')) as { success: boolean };
            expect(r.success).toBe(true);
        });

        expect(result.current.inWishlist).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/action/wishlist-remove');
    });

    test('remove(): server failure rolls back so inWishlist returns to true', async () => {
        fetchSpy.mockResolvedValue(actionResponse({ success: false, error: { message: 'Boom' } }, 500));

        const { result } = setupFor('sku-4', ['sku-4']);

        await act(async () => {
            await result.current.actions.remove('sku-4');
        });

        expect(result.current.inWishlist).toBe(true);
    });

    test('toggle(): adds when absent, removes when present', async () => {
        // A fresh Response per call — postWishlistAction consumes the body via .json(),
        // so a single shared Response instance would be already-consumed on the 2nd fetch.
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: true })));

        const { result } = setupFor('sku-5');
        expect(result.current.inWishlist).toBe(false);

        await act(async () => {
            await result.current.actions.toggle('sku-5');
        });
        expect(result.current.inWishlist).toBe(true);

        await act(async () => {
            await result.current.actions.toggle('sku-5');
        });
        expect(result.current.inWishlist).toBe(false);
    });

    test('add(): already in the store returns alreadyInWishlist signal without a server call', async () => {
        const { result } = setupFor('sku-existing', ['sku-existing']);

        let response: { success: boolean; data?: { alreadyInWishlist?: boolean } } | undefined;
        await act(async () => {
            response = (await result.current.actions.add('sku-existing')) as {
                success: boolean;
                data?: { alreadyInWishlist?: boolean };
            };
        });

        expect(response?.success).toBe(true);
        expect(response?.data?.alreadyInWishlist).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.current.inWishlist).toBe(true);
    });

    test('add(): refuses with "in progress" when an add for the same product is in flight', async () => {
        // First add hangs so the optimistic pending entry stays in state.
        let resolveFirst: (value: Response) => void = () => {};
        const firstResponse = new Promise<Response>((resolve) => {
            resolveFirst = resolve;
        });
        fetchSpy.mockReturnValueOnce(firstResponse);

        const { result } = setupFor('sku-1');

        // Kick off the first add — don't await it.
        let firstPromise: Promise<unknown> | undefined;
        act(() => {
            firstPromise = result.current.actions.add('sku-1');
        });

        // Second add lands while the first is still pending.
        let secondResult: { success: boolean; errors?: string[] } | undefined;
        await act(async () => {
            secondResult = (await result.current.actions.add('sku-1')) as { success: boolean; errors?: string[] };
        });

        expect(secondResult?.success).toBe(false);
        expect(secondResult?.errors).toEqual(['Wishlist update in progress']);
        // Only the first add hit fetch; the second short-circuited.
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Let the first add complete so the test cleans up.
        await act(async () => {
            resolveFirst(actionResponse({ success: true }));
            await firstPromise;
        });
    });

    test('remove(): refuses with "in progress" when the add for the same product is in flight', async () => {
        let resolveFirst: (value: Response) => void = () => {};
        const firstResponse = new Promise<Response>((resolve) => {
            resolveFirst = resolve;
        });
        fetchSpy.mockReturnValueOnce(firstResponse);

        const { result } = setupFor('sku-1');

        let firstPromise: Promise<unknown> | undefined;
        act(() => {
            firstPromise = result.current.actions.add('sku-1');
        });

        // Try to remove while the add is still in flight (unconfirmed entry).
        let removeResult: { success: boolean; errors?: string[] } | undefined;
        await act(async () => {
            removeResult = (await result.current.actions.remove('sku-1')) as { success: boolean; errors?: string[] };
        });

        expect(removeResult?.success).toBe(false);
        expect(removeResult?.errors).toEqual(['Wishlist update in progress']);
        // No remove call was made (only the in-flight add).
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFirst(actionResponse({ success: true }));
            await firstPromise;
        });
    });

    test('add()/remove() short-circuit without a customerId (no session) and make no server call', async () => {
        const { result } = setup(null);

        await act(async () => {
            const added = (await result.current.actions.add('sku-6')) as { success: boolean; errors?: string[] };
            expect(added.success).toBe(false);
            expect(added.errors).toEqual(['Not signed in']);

            const removed = (await result.current.actions.remove('sku-6')) as { success: boolean; errors?: string[] };
            expect(removed.success).toBe(false);
            expect(removed.errors).toEqual(['Not signed in']);
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('add(): first add on an empty wishlist succeeds with a single POST (server provisions the list)', async () => {
        // The action route runs getOrCreateWishlist server-side, so a shopper with no list
        // yet still only issues ONE client request — provisioning is invisible to the client.
        fetchSpy.mockResolvedValue(actionResponse({ success: true }));

        const { result } = setupFor('sku-1');

        await act(async () => {
            const r = (await result.current.actions.add('sku-1')) as { success: boolean };
            expect(r.success).toBe(true);
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.current.inWishlist).toBe(true);
        expect(result.current.entry.pending).toBe(false);
    });

    test('add(): concurrent adds of different products issue one POST each', async () => {
        // Fresh Response per call (see toggle test) so both concurrent adds get an unread body.
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: true })));

        const { result } = setup();

        await act(async () => {
            const [a, b] = await Promise.all([
                result.current.actions.add('sku-1') as Promise<{ success: boolean }>,
                result.current.actions.add('sku-2') as Promise<{ success: boolean }>,
            ]);
            expect(a.success).toBe(true);
            expect(b.success).toBe(true);
        });

        // One POST per product — no client-side list-create request to collapse.
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('add(): concurrent first-adds serialize their POSTs so list provisioning finishes first', async () => {
        // Regression guard for the get-or-create race: the first add for a
        // shopper with no wishlist provisions the list server-side. If two concurrent
        // first-adds both POST before the first resolves, each server request sees "no
        // list" and creates its own — duplicate lists, stranded items. The store must
        // serialize the network round-trips so the second POST starts only after the first
        // settles. Optimistic UI still flips synchronously (asserted separately).
        const resolvers: Array<(r: Response) => void> = [];
        let started = 0;
        fetchSpy.mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    started += 1;
                    resolvers.push(resolve);
                })
        );

        const { result } = setup();

        let combined!: Promise<unknown>;
        act(() => {
            combined = Promise.all([result.current.actions.add('sku-1'), result.current.actions.add('sku-2')]);
        });

        // Both optimistic inserts happened synchronously, but only the FIRST POST is in
        // flight — the second is queued behind the write chain.
        await waitFor(() => expect(started).toBe(1));
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Settle the first POST; only then may the second start.
        await act(async () => {
            resolvers[0](actionResponse({ success: true }));
            await waitFor(() => expect(started).toBe(2));
            resolvers[1](actionResponse({ success: true }));
            await combined;
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('add(): a failed write does not poison later writes in the chain', async () => {
        // The first add fails (e.g. server 500). The write chain must recover so the next
        // add still issues its POST rather than hanging on a rejected tail promise.
        fetchSpy
            .mockImplementationOnce(() =>
                Promise.resolve(actionResponse({ success: false, error: { message: 'Boom' } }, 500))
            )
            .mockImplementationOnce(() => Promise.resolve(actionResponse({ success: true })));

        const { result } = setup();

        await act(async () => {
            const first = (await result.current.actions.add('sku-1')) as { success: boolean };
            expect(first.success).toBe(false);
        });
        await act(async () => {
            const second = (await result.current.actions.add('sku-2')) as { success: boolean };
            expect(second.success).toBe(true);
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('remove(): returns "Not in wishlist" when the product is not present', async () => {
        const { result } = setupFor('sku-absent');

        let response!: { success: boolean; errors?: string[] };
        await act(async () => {
            response = (await result.current.actions.remove('sku-absent')) as { success: boolean; errors?: string[] };
        });

        expect(response.success).toBe(false);
        expect(response.errors).toEqual(['Not in wishlist']);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('wishlist store — re-render isolation', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    /**
     * Test that subscribing to product A via `useIsInWishlist` does NOT trigger
     * a re-render when product B is added. This is the entire point of the
     * topic-subscription store — without it, every heart in a product grid
     * would re-render on every wishlist mutation.
     */
    test('mutating one productId does not re-render consumers subscribed to another', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        seedWishlistStore('cust-1', []);

        const skuARenders = { count: 0, last: false };
        const skuBRenders = { count: 0, last: false };

        function SubscriberA() {
            const inWishlist = useIsInWishlist('sku-A');
            const renderRef = useRef(0);
            renderRef.current += 1;
            useEffect(() => {
                skuARenders.count = renderRef.current;
                skuARenders.last = inWishlist;
            });
            return <span data-testid="a">{inWishlist ? 'in' : 'out'}</span>;
        }

        function SubscriberB() {
            const inWishlist = useIsInWishlist('sku-B');
            const renderRef = useRef(0);
            renderRef.current += 1;
            useEffect(() => {
                skuBRenders.count = renderRef.current;
                skuBRenders.last = inWishlist;
            });
            return <span data-testid="b">{inWishlist ? 'in' : 'out'}</span>;
        }

        // Render both subscribers + a tiny harness that exposes the actions.
        let actions!: ReturnType<typeof useWishlistActions>;
        function ActionsCapture() {
            actions = useWishlistActions();
            return null;
        }

        render(
            <>
                <SubscriberA />
                <SubscriberB />
                <ActionsCapture />
            </>
        );

        // After mount: each subscriber has rendered once.
        expect(skuARenders.count).toBe(1);
        expect(skuBRenders.count).toBe(1);
        expect(skuARenders.last).toBe(false);
        expect(skuBRenders.last).toBe(false);

        // Mutate ONLY sku-B. Optimistic insert + pending→confirmed = 2 store notifies
        // for sku-B; sku-A's snapshot value (undefined) never changes, so
        // useSyncExternalStore must skip the re-render for SubscriberA.
        await act(async () => {
            await actions.add('sku-B');
        });

        expect(skuBRenders.last).toBe(true);
        expect(skuBRenders.count).toBeGreaterThan(1);
        // The critical assertion: SubscriberA never re-rendered.
        expect(skuARenders.count).toBe(1);
        expect(skuARenders.last).toBe(false);
    });

    test('useWishlistCount does not re-render on the pending→confirmed transition', async () => {
        // First add: hangs so we can observe the optimistic pending phase.
        let resolveFirst: (value: Response) => void = () => {};
        const firstResponse = new Promise<Response>((resolve) => {
            resolveFirst = resolve;
        });
        fetchSpy.mockReturnValueOnce(firstResponse);
        seedWishlistStore('cust-1', []);

        const countRenders = { count: 0, last: -1 };

        function CountSubscriber() {
            const n = useWishlistCount();
            const renderRef = useRef(0);
            renderRef.current += 1;
            useEffect(() => {
                countRenders.count = renderRef.current;
                countRenders.last = n;
            });
            return <span data-testid="count">{n}</span>;
        }

        let actions!: ReturnType<typeof useWishlistActions>;
        function ActionsCapture() {
            actions = useWishlistActions();
            return null;
        }

        render(
            <>
                <CountSubscriber />
                <ActionsCapture />
            </>
        );

        expect(countRenders.last).toBe(0);
        const initialRenders = countRenders.count;

        // Kick off the optimistic add — count flips 0 → 1.
        let pending!: Promise<unknown>;
        act(() => {
            pending = actions.add('sku-1');
        });
        expect(countRenders.last).toBe(1);
        const afterOptimisticRenders = countRenders.count;
        expect(afterOptimisticRenders).toBeGreaterThan(initialRenders);

        // Resolve the add — the entry flips pending:true → pending:false. The map size
        // stays at 1, so the count subscriber must NOT re-render.
        await act(async () => {
            resolveFirst(new Response(JSON.stringify({ success: true }), { status: 200 }));
            await pending;
        });

        expect(countRenders.last).toBe(1);
        expect(countRenders.count).toBe(afterOptimisticRenders);
    });
});

describe('wishlist store — lazy load', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    /** Response mirroring `/action/wishlist-state` serialized via `data()`. */
    const stateResponse = (productIds: string[], status = 200): Response =>
        new Response(JSON.stringify({ productIds }), { status });

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    /** Bind a signed-in session whose lazy read has NOT run yet, so the load trigger is armed. */
    const seedGuest = (productIds: string[] = []) => seedWishlistStore('guest-1', productIds, { loaded: false });

    test('load fetches /action/wishlist-state and fills the store', async () => {
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1', 'sku-2'])));
        seedGuest();

        const { result } = renderHook(() => ({ load: useWishlistLoader(), sku1: useIsInWishlist('sku-1') }));

        expect(result.current.sku1).toBe(false);

        await act(async () => {
            await result.current.load();
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
        expect(url).toBe(resourceRoutes.wishlistState);
        expect(init?.method ?? 'GET').toBe('GET');

        await waitFor(() => {
            expect(result.current.sku1).toBe(true);
        });
    });

    test('fires at most once even when called many times', async () => {
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));
        seedGuest();

        const { result } = renderHook(() => useWishlistLoader());

        await act(async () => {
            await Promise.all([result.current(), result.current(), result.current()]);
            await result.current();
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('does not re-fetch across separate mounts, and the second mount shows the loaded item', async () => {
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));
        seedGuest();

        const first = renderHook(() => useWishlistLoader());
        await act(async () => {
            await first.result.current();
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        first.unmount();

        // A new route mounts fresh hooks against the same singleton — the load is already
        // satisfied AND the previously-loaded item must be visible without a re-fetch.
        const second = renderHook(() => ({ load: useWishlistLoader(), sku1: useIsInWishlist('sku-1') }));
        expect(second.result.current.sku1).toBe(true);
        await act(async () => {
            await second.result.current.load();
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('re-binding the SAME session does not wipe loaded hearts or re-fetch', async () => {
        // On client navigation the destination loader re-runs and re-supplies the same customerId.
        // setSessionCustomerId no-ops on an unchanged id, so a prior load's hearts must survive.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));

        const { result, rerender } = renderHook(
            ({ customerId }: { customerId: string }) => {
                useWishlistSession(customerId);
                return { load: useWishlistLoader(), sku1: useIsInWishlist('sku-1') };
            },
            { initialProps: { customerId: 'guest-1' } }
        );

        await act(async () => {
            await result.current.load();
        });
        await waitFor(() => expect(result.current.sku1).toBe(true));

        act(() => {
            rerender({ customerId: 'guest-1' });
        });

        expect(result.current.sku1).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('a different shopper does NOT inherit the prior shopper hearts (session eviction)', async () => {
        // Auth transitions are client-side, so the singleton survives a shopper change in the same
        // tab. When useWishlistSession sees a new customerId it must evict the prior hearts, clear
        // the done latch, and — because an earlier intent already armed the load — replay the read
        // for the new shopper.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-A'])));

        const { result, rerender } = renderHook(
            ({ customerId }: { customerId: string }) => {
                useWishlistSession(customerId);
                return {
                    load: useWishlistLoader(),
                    skuA: useIsInWishlist('sku-A'),
                    skuB: useIsInWishlist('sku-B'),
                };
            },
            { initialProps: { customerId: 'guest-A' } }
        );

        // Guest A's first intent fills sku-A (and arms loadRequested).
        await act(async () => {
            await result.current.load();
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(result.current.skuA).toBe(true));

        // Guest B takes over the tab (post logout/login, no hard reload). Different owner: the
        // session change evicts A's heart and replays the read for B.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-B'])));
        act(() => {
            rerender({ customerId: 'guest-B' });
        });

        await waitFor(() => {
            expect(result.current.skuA).toBe(false);
            expect(result.current.skuB).toBe(true);
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('a remove landing mid-load is not resurrected by the server snapshot', async () => {
        // The lazy GET reflects the wishlist as of when it fired; a remove that lands while it's
        // in flight must win over that stale snapshot rather than be undone by the load merge.
        let resolveState: (r: Response) => void = () => {};
        const inFlightState = new Promise<Response>((resolve) => {
            resolveState = resolve;
        });
        seedWishlistStore('guest-1', ['sku-1'], { loaded: false });

        const { result } = renderHook(() => ({
            load: useWishlistLoader(),
            actions: useWishlistActions(),
            sku1: useIsInWishlist('sku-1'),
        }));
        expect(result.current.sku1).toBe(true);

        // Kick off the load (GET hangs) — the server will report sku-1 still present.
        fetchSpy.mockReturnValueOnce(inFlightState);
        let loadPromise!: Promise<void>;
        act(() => {
            loadPromise = result.current.load();
        });

        // Remove sku-1 while the GET is in flight. remove() POSTs to wishlist-remove (success).
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: true })));
        await act(async () => {
            await result.current.actions.remove('sku-1');
        });
        expect(result.current.sku1).toBe(false);

        // Now let the stale GET resolve WITH sku-1 present — the merge must not resurrect it.
        await act(async () => {
            resolveState(stateResponse(['sku-1']));
            await loadPromise;
        });
        expect(result.current.sku1).toBe(false);
    });

    test('a failed remove mid-load rolls back and is NOT dropped by the load merge', async () => {
        // A remove marks the item in pendingRemovals at optimistic-delete time. If the server
        // remove then FAILS, the store rolls back — and the removal marker must be discarded, or
        // the in-flight load would subtract the still-saved item and blank a valid heart.
        let resolveState: (r: Response) => void = () => {};
        const inFlightState = new Promise<Response>((resolve) => {
            resolveState = resolve;
        });
        seedWishlistStore('guest-1', ['sku-1'], { loaded: false });

        const { result } = renderHook(() => ({
            load: useWishlistLoader(),
            actions: useWishlistActions(),
            sku1: useIsInWishlist('sku-1'),
        }));
        expect(result.current.sku1).toBe(true);

        // Kick off the load (GET hangs) — the server will report sku-1 still present.
        fetchSpy.mockReturnValueOnce(inFlightState);
        let loadPromise!: Promise<void>;
        act(() => {
            loadPromise = result.current.load();
        });

        // Remove sku-1 while the GET is in flight, but the server remove FAILS → rollback.
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: false, errors: ['nope'] })));
        await act(async () => {
            await result.current.actions.remove('sku-1');
        });
        expect(result.current.sku1).toBe(true);

        // The GET resolves WITH sku-1 present — the rolled-back item must survive the merge.
        await act(async () => {
            resolveState(stateResponse(['sku-1']));
            await loadPromise;
        });
        expect(result.current.sku1).toBe(true);
    });

    test('an add landing mid-load is not dropped by the server snapshot', async () => {
        // The stale GET snapshot won't list an item added after it fired; the merge must union
        // in the current store keys so a mid-fetch add survives.
        let resolveState: (r: Response) => void = () => {};
        const inFlightState = new Promise<Response>((resolve) => {
            resolveState = resolve;
        });
        seedGuest();

        const { result } = renderHook(() => ({
            load: useWishlistLoader(),
            actions: useWishlistActions(),
            sku2: useIsInWishlist('sku-2'),
        }));

        // Load GET hangs; it will resolve to sku-1 only (no sku-2).
        fetchSpy.mockReturnValueOnce(inFlightState);
        let loadPromise!: Promise<void>;
        act(() => {
            loadPromise = result.current.load();
        });

        // Add sku-2 while the GET is in flight (POST succeeds).
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: true })));
        await act(async () => {
            await result.current.actions.add('sku-2');
        });
        expect(result.current.sku2).toBe(true);

        // The GET resolves without sku-2 — the union must keep the mid-fetch add.
        await act(async () => {
            resolveState(stateResponse(['sku-1']));
            await loadPromise;
        });
        expect(result.current.sku2).toBe(true);
    });

    test('an add whose POST resolves after a shopper swap does NOT land in the new session store', async () => {
        // Auth transitions are client-side (no reload), so a POST can still be in flight when the
        // session swaps. The add-success settle write must be gated on the owner at write time, or
        // the prior shopper's confirmed heart leaks into the new shopper's store.
        let resolveAdd: (r: Response) => void = () => {};
        const inFlightAdd = new Promise<Response>((resolve) => {
            resolveAdd = resolve;
        });
        seedWishlistStore('guest-A', [], { loaded: true });

        const { result, rerender } = renderHook(
            ({ customerId }: { customerId: string }) => {
                useWishlistSession(customerId);
                return { actions: useWishlistActions(), skuA: useIsInWishlist('sku-A') };
            },
            { initialProps: { customerId: 'guest-A' } }
        );

        // Guest A adds sku-A; the POST hangs.
        fetchSpy.mockReturnValueOnce(inFlightAdd);
        let addPromise!: Promise<unknown>;
        act(() => {
            addPromise = result.current.actions.add('sku-A');
        });

        // Guest B takes over the tab before the POST resolves — the swap evicts A's store.
        act(() => {
            rerender({ customerId: 'guest-B' });
        });
        expect(result.current.skuA).toBe(false);

        // A's POST now resolves success — the settle write must be skipped for B's session.
        await act(async () => {
            resolveAdd(actionResponse({ success: true }));
            await addPromise;
        });
        expect(result.current.skuA).toBe(false);
    });

    test('a failed remove whose POST resolves after a shopper swap does NOT roll back into the new session store', async () => {
        // Same window on the remove rollback path: a failed POST must not restore the prior
        // shopper's item into the new shopper's store after a mid-flight session swap.
        let resolveRemove: (r: Response) => void = () => {};
        const inFlightRemove = new Promise<Response>((resolve) => {
            resolveRemove = resolve;
        });
        seedWishlistStore('guest-A', ['sku-A'], { loaded: true });

        const { result, rerender } = renderHook(
            ({ customerId }: { customerId: string }) => {
                useWishlistSession(customerId);
                return { actions: useWishlistActions(), skuA: useIsInWishlist('sku-A') };
            },
            { initialProps: { customerId: 'guest-A' } }
        );
        expect(result.current.skuA).toBe(true);

        // Guest A removes sku-A (optimistic delete); the POST hangs.
        fetchSpy.mockReturnValueOnce(inFlightRemove);
        let removePromise!: Promise<unknown>;
        act(() => {
            removePromise = result.current.actions.remove('sku-A');
        });

        // Guest B takes over before the POST resolves — the swap evicts A's store.
        act(() => {
            rerender({ customerId: 'guest-B' });
        });
        expect(result.current.skuA).toBe(false);

        // A's remove FAILS — the rollback must be skipped for B's session.
        await act(async () => {
            resolveRemove(actionResponse({ success: false, errors: ['nope'] }));
            await removePromise;
        });
        expect(result.current.skuA).toBe(false);
    });

    test('load no-ops once the session is already loaded', async () => {
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));
        // Default seed marks the load done — an already-loaded session must not fire the read.
        seedWishlistStore('reg-1', []);

        const { result } = renderHook(() => useWishlistLoader());

        await act(async () => {
            await result.current();
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('load no-ops without a session', async () => {
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));
        // No session bound (reset leaves customerId null): the read cannot know whose wishlist to load.
        const { result } = renderHook(() => useWishlistLoader());

        await act(async () => {
            await result.current();
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('load fill reaches topic subscribers without re-rendering useWishlistActions consumers', async () => {
        // The store fill must reach only the topic subscribers whose entries changed — a consumer
        // of the actions (which subscribe to the pending flag only) must not re-render, or the
        // whole page would flicker on load.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['abc'])));
        seedGuest();

        const actionsRenders = { count: 0 };
        function ActionsConsumer() {
            useWishlistActions();
            const renderRef = useRef(0);
            renderRef.current += 1;
            useEffect(() => {
                actionsRenders.count = renderRef.current;
            });
            return <span data-testid="actions-consumer">ok</span>;
        }
        function MembershipReadout() {
            const inWishlist = useIsInWishlist('abc');
            return <span data-testid="member-abc">{inWishlist ? 'in' : 'out'}</span>;
        }
        let load!: () => Promise<void>;
        function LoadCapture() {
            load = useWishlistLoader();
            return null;
        }

        render(
            <>
                <ActionsConsumer />
                <MembershipReadout />
                <LoadCapture />
            </>
        );

        await act(async () => {
            await load();
        });

        // The load actually ran: the topic subscriber for 'abc' flipped to "in".
        await waitFor(() => {
            expect(screen.getByTestId('member-abc')).toHaveTextContent('in');
        });

        // The critical assertion: the actions consumer rendered exactly once (mount).
        expect(actionsRenders.count).toBe(1);
    });

    test('an add propagates to the next mount via the singleton store', async () => {
        // add() POSTs to /action/wishlist-add; load() would GET /action/wishlist-state.
        fetchSpy.mockImplementation(() => Promise.resolve(actionResponse({ success: true })));
        seedGuest();

        const first = renderHook(() => useWishlistActions());
        await act(async () => {
            const r = (await first.result.current.add('sku-99')) as { success: boolean };
            expect(r.success).toBe(true);
        });
        first.unmount();

        // A new route's hooks read the same singleton — the just-added item must be present.
        const second = renderHook(() => useIsInWishlist('sku-99'));
        expect(second.result.current).toBe(true);
    });

    test('an at-load heart that requests the load before the session is known replays once bound', async () => {
        // The PDP heart fires loadWishlist() from its own mount effect, which flushes child-before-
        // parent — i.e. before the route's useWishlistSession effect has bound the session. A
        // request with no session yet must be recorded and replayed once the session is known,
        // otherwise the on-mount load would be a permanent no-op.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));

        // Mirrors WishlistButton: triggers the load from a mount effect, nothing else.
        function AtLoadHeart() {
            const load = useWishlistLoader();
            useEffect(() => {
                void load();
            }, [load]);
            return null;
        }

        render(<AtLoadHeart />);
        const readout = renderHook(() => useIsInWishlist('sku-1'));

        // The mount-effect load() has fired, but no session is bound yet, so no fetch went
        // out — the request is recorded, not dropped.
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(readout.result.current).toBe(false);

        // Bind the session — the recorded request must now replay, fire the read, and fill the heart.
        renderHook(() => useWishlistSession('guest-1'));

        await waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(readout.result.current).toBe(true);
        });
        expect(fetchSpy.mock.calls[0][0]).toBe(resourceRoutes.wishlistState);
    });

    test('leaves the store empty and allows retry when the fetch fails', async () => {
        fetchSpy.mockImplementationOnce(() => Promise.reject(new Error('network')));
        seedGuest();

        const { result } = renderHook(() => ({ load: useWishlistLoader(), sku1: useIsInWishlist('sku-1') }));

        await act(async () => {
            await result.current.load();
        });
        expect(result.current.sku1).toBe(false);

        // A later intent may retry — the guard must not be latched on failure.
        fetchSpy.mockImplementation(() => Promise.resolve(stateResponse(['sku-1'])));
        await act(async () => {
            await result.current.load();
        });
        await waitFor(() => {
            expect(result.current.sku1).toBe(true);
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
