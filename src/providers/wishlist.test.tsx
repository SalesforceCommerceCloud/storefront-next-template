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
import { type ReactNode, useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EMPTY_WISHLIST_STATE, type WishlistInitialState } from '@/lib/wishlist/state';
import {
    WishlistProvider,
    useIsInWishlist,
    useWishlistActions,
    useWishlistCount,
    useWishlistEntry,
    useWishlistIds,
} from './wishlist';

/** Build a `Response` mirroring what `/action/wishlist-*` serializes via `data()`. */
function actionResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

describe('WishlistProvider — read-only behavior', () => {
    test('useIsInWishlist returns true for ids seeded by initialState.productIds', () => {
        const initialState: WishlistInitialState = {
            customerId: 'c',
            productIds: new Set(['sku-1', 'sku-2']),
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={initialState}>{children}</WishlistProvider>
        );

        const sku1 = renderHook(() => useIsInWishlist('sku-1'), { wrapper });
        const sku2 = renderHook(() => useIsInWishlist('sku-2'), { wrapper });
        const missing = renderHook(() => useIsInWishlist('not-in-list'), { wrapper });

        expect(sku1.result.current).toBe(true);
        expect(sku2.result.current).toBe(true);
        expect(missing.result.current).toBe(false);
    });

    test('useWishlistCount returns the seeded size', () => {
        const initialState: WishlistInitialState = {
            customerId: 'c',
            productIds: new Set(['sku-1', 'sku-2']),
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={initialState}>{children}</WishlistProvider>
        );
        const { result } = renderHook(() => useWishlistCount(), { wrapper });
        expect(result.current).toBe(2);
    });

    test('useWishlistIds returns a stable Set per snapshot', () => {
        const initialState: WishlistInitialState = {
            customerId: 'c',
            productIds: new Set(['sku-1', 'sku-2']),
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={initialState}>{children}</WishlistProvider>
        );
        const { result } = renderHook(() => useWishlistIds(), { wrapper });
        expect(Array.from(result.current).sort()).toEqual(['sku-1', 'sku-2']);
    });

    test('hooks throw when used outside a provider', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() => renderHook(() => useIsInWishlist('x'))).toThrow(
                /Wishlist hooks must be used inside <WishlistProvider>/
            );
            expect(() => renderHook(() => useWishlistCount())).toThrow(
                /Wishlist hooks must be used inside <WishlistProvider>/
            );
            expect(() => renderHook(() => useWishlistActions())).toThrow(
                /useWishlistActions must be used inside <WishlistProvider>/
            );
        } finally {
            consoleSpy.mockRestore();
        }
    });

    test('exposes EMPTY_WISHLIST_STATE shape: count 0, no members, not pending', () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={EMPTY_WISHLIST_STATE}>{children}</WishlistProvider>
        );
        const count = renderHook(() => useWishlistCount(), { wrapper });
        const member = renderHook(() => useIsInWishlist('anything'), { wrapper });
        const actions = renderHook(() => useWishlistActions(), { wrapper });

        expect(count.result.current).toBe(0);
        expect(member.result.current).toBe(false);
        expect(actions.result.current.isPending).toBe(false);
    });
});

describe('WishlistProvider — action-backed mutations', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const signedInState = (): WishlistInitialState => ({
        customerId: 'cust-1',
        productIds: new Set(),
    });

    function setup(state = signedInState()) {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={state}>{children}</WishlistProvider>
        );
        // Exposes the actions only — per-product membership is asserted via setupFor()
        // so we don't violate rules-of-hooks by calling useIsInWishlist inside a callback.
        return renderHook(
            () => ({
                actions: useWishlistActions(),
            }),
            { wrapper }
        );
    }

    // For tests that need a stable per-product subscription across mutations, render
    // a small harness that holds a single productId and exposes its membership flag.
    function setupFor(productId: string, state = signedInState()) {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <WishlistProvider initialState={state}>{children}</WishlistProvider>
        );
        return renderHook(
            () => ({
                actions: useWishlistActions(),
                inWishlist: useIsInWishlist(productId),
                entry: useWishlistEntry(productId),
            }),
            { wrapper }
        );
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
        const state: WishlistInitialState = {
            customerId: 'cust-1',
            productIds: new Set(['sku-3']),
        };
        fetchSpy.mockResolvedValue(actionResponse({ success: true }));

        const { result } = setupFor('sku-3', state);
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
        const state: WishlistInitialState = {
            customerId: 'cust-1',
            productIds: new Set(['sku-4']),
        };
        fetchSpy.mockResolvedValue(actionResponse({ success: false, error: { message: 'Boom' } }, 500));

        const { result } = setupFor('sku-4', state);

        await act(async () => {
            await result.current.actions.remove('sku-4');
        });

        expect(result.current.inWishlist).toBe(true);
    });

    test('toggle(): adds when absent, removes when present', async () => {
        // A fresh Response per call — postWishlistAction consumes the body via .text(),
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

    test('add(): already in state returns alreadyInWishlist signal without a server call', async () => {
        const state: WishlistInitialState = {
            customerId: 'cust-1',
            productIds: new Set(['sku-existing']),
        };

        const { result } = setupFor('sku-existing', state);

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
        const noSessionState: WishlistInitialState = {
            customerId: null,
            productIds: new Set(),
        };
        const { result } = setup(noSessionState);

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
        // Regression guard for the get-or-create race (W-23135032): the first add for a
        // shopper with no wishlist provisions the list server-side. If two concurrent
        // first-adds both POST before the first resolves, each server request sees "no
        // list" and creates its own — duplicate lists, stranded items. The provider must
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

describe('WishlistProvider — re-render isolation', () => {
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
     * topic-subscription provider — without it, every heart in a product grid
     * would re-render on every wishlist mutation.
     */
    test('mutating one productId does not re-render consumers subscribed to another', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

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
            <WishlistProvider initialState={{ customerId: 'cust-1', productIds: new Set() }}>
                <SubscriberA />
                <SubscriberB />
                <ActionsCapture />
            </WishlistProvider>
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
            <WishlistProvider initialState={{ customerId: 'cust-1', productIds: new Set() }}>
                <CountSubscriber />
                <ActionsCapture />
            </WishlistProvider>
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

describe('WishlistProvider — async hydration via Promise initialState', () => {
    function CountReadout() {
        const count = useWishlistCount();
        return <span data-testid="count">{count}</span>;
    }

    function MembershipReadout({ productId }: { productId: string }) {
        const inWishlist = useIsInWishlist(productId);
        return <span data-testid={`member-${productId}`}>{inWishlist ? 'in' : 'out'}</span>;
    }

    test('pending Promise: hooks return safe empty defaults until the Promise resolves', () => {
        // A never-resolving Promise keeps the provider in its initial empty state.
        const pending = new Promise<WishlistInitialState>(() => {});

        render(
            <WishlistProvider initialState={pending}>
                <CountReadout />
                <MembershipReadout productId="anything" />
            </WishlistProvider>
        );

        expect(screen.getByTestId('count')).toHaveTextContent('0');
        expect(screen.getByTestId('member-anything')).toHaveTextContent('out');
    });

    test('resolved Promise: hydrates the store via useEffect after mount', async () => {
        const resolve: Promise<WishlistInitialState> = Promise.resolve({
            customerId: 'c1',
            productIds: new Set(['abc']),
        });

        await act(async () => {
            render(
                <WishlistProvider initialState={resolve}>
                    <MembershipReadout productId="abc" />
                </WishlistProvider>
            );
            await resolve;
        });

        await waitFor(() => {
            expect(screen.getByTestId('member-abc')).toHaveTextContent('in');
        });
    });

    test('rejected Promise: provider stays in empty state, no error escapes', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const rejected = Promise.reject(new Error('scapi failed'));
            rejected.catch(() => {}); // prevent unhandled-rejection noise

            await act(async () => {
                render(
                    <WishlistProvider initialState={rejected}>
                        <CountReadout />
                    </WishlistProvider>
                );
                await Promise.allSettled([rejected]);
            });

            await waitFor(() => {
                expect(screen.getByTestId('count')).toHaveTextContent('0');
            });
        } finally {
            consoleSpy.mockRestore();
        }
    });

    test('resolving the Promise hydrates the store WITHOUT re-rendering useWishlistActions consumers', async () => {
        // The store fill must reach only the topic subscribers whose entries changed to prevent a whole-page hydration
        // flicker.
        const actionsRenders = { count: 0 };
        function ActionsConsumer() {
            // Subscribes to the actions context only — NOT to the store. It must not
            // re-render when the store hydrates.
            useWishlistActions();
            const renderRef = useRef(0);
            renderRef.current += 1;
            useEffect(() => {
                actionsRenders.count = renderRef.current;
            });
            return <span data-testid="actions-consumer">ok</span>;
        }

        const resolve: Promise<WishlistInitialState> = Promise.resolve({
            customerId: 'c1',
            productIds: new Set(['abc']),
        });

        await act(async () => {
            render(
                <WishlistProvider initialState={resolve}>
                    <ActionsConsumer />
                    <MembershipReadout productId="abc" />
                </WishlistProvider>
            );
            await resolve;
        });

        // Hydration actually ran: the topic subscriber for 'abc' flipped to "in".
        await waitFor(() => {
            expect(screen.getByTestId('member-abc')).toHaveTextContent('in');
        });

        // The critical assertion: the actions consumer rendered exactly once (mount),
        // proving the provider did not re-render and the actions context stayed stable.
        expect(actionsRenders.count).toBe(1);
    });
});
