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
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInteraction } from './useInteraction';
import { useDesignContext } from '../context/DesignContext';
import type { ClientApi } from '../../messaging-api';

vi.mock('../context/DesignContext');

/** Minimal ClientApi stand-in: `on` records the subscription and returns an unsubscribe spy. */
function makeClientApi() {
    const unsubscribe = vi.fn();
    const on = vi.fn().mockReturnValue(unsubscribe);
    return { on, unsubscribe, api: { on } as unknown as ClientApi };
}

function mockDesignContext({ isDesignMode = true, clientApi }: { isDesignMode?: boolean; clientApi?: ClientApi }) {
    vi.mocked(useDesignContext).mockReturnValue({
        isDesignMode,
        clientApi,
    } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);
}

describe('useInteraction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the initial state and no actions when no factory is supplied', () => {
        mockDesignContext({ clientApi: makeClientApi().api });

        const { result } = renderHook(() => useInteraction({ initialState: 42 }));

        expect(result.current.state).toBe(42);
        expect(Object.keys(result.current)).toEqual(['state']);
    });

    it('exposes actions that update state via setState', () => {
        mockDesignContext({ clientApi: makeClientApi().api });

        const { result } = renderHook(() =>
            useInteraction({
                initialState: 0,
                actions: (_state, setState) => ({
                    increment: () => setState((prev) => prev + 1),
                }),
            })
        );

        expect(result.current.state).toBe(0);
        act(() => result.current.increment());
        expect(result.current.state).toBe(1);
        act(() => result.current.increment());
        expect(result.current.state).toBe(2);
    });

    it('keeps action identities stable across re-renders', () => {
        mockDesignContext({ clientApi: makeClientApi().api });

        const { result, rerender } = renderHook(() =>
            useInteraction({
                initialState: 0,
                actions: (_state, setState) => ({
                    increment: () => setState((prev) => prev + 1),
                }),
            })
        );

        const firstRef = result.current.increment;

        // Re-render from a prop-less parent and from a real state change.
        rerender();
        expect(result.current.increment).toBe(firstRef);

        act(() => result.current.increment());
        expect(result.current.state).toBe(1);
        // The identity must survive a state-change-driven re-render — this is what
        // lets consumers safely put the action in useCallback/useEffect dep arrays.
        expect(result.current.increment).toBe(firstRef);
    });

    it('reads the latest committed state at call time, not a stale snapshot (kind-1 freshness)', () => {
        mockDesignContext({ clientApi: makeClientApi().api });

        const observed: number[] = [];
        const { result } = renderHook(() =>
            useInteraction({
                initialState: 0,
                actions: (state, setState) => ({
                    bump: () => setState((prev) => prev + 1),
                    // Reads `state` directly (like hover/drag) rather than via functional setState.
                    observe: () => observed.push(state),
                }),
            })
        );

        act(() => {
            result.current.bump();
        });
        act(() => {
            result.current.bump();
        });
        // `observe` is the same stable function throughout, yet must see the CURRENT
        // committed state (2), not the 0 captured when the wrappers were first minted.
        act(() => {
            result.current.observe();
        });
        expect(observed).toEqual([2]);
    });

    it('reads the latest factory closure values across re-renders (kind-2 freshness)', () => {
        mockDesignContext({ clientApi: makeClientApi().api });

        // `label` is a fresh binding per render; the factory literal closes over it.
        // A naive one-time memoization would freeze the first render's `label`.
        const { result, rerender } = renderHook(
            ({ label }: { label: string }) =>
                useInteraction({
                    initialState: null,
                    actions: () => ({
                        readLabel: () => label,
                    }),
                }),
            { initialProps: { label: 'a' } }
        );

        const readLabelRef = result.current.readLabel;
        expect(result.current.readLabel()).toBe('a');

        rerender({ label: 'b' });
        // Same stable identity...
        expect(result.current.readLabel).toBe(readLabelRef);
        // ...but re-invokes the LATEST factory, which closed over the latest `label`.
        expect(result.current.readLabel()).toBe('b');
    });

    it('uses the live clientApi after a null -> set transition', () => {
        // Start disconnected (no clientApi), then connect.
        mockDesignContext({ clientApi: undefined });

        const seen: Array<ClientApi | null> = [];
        const { result, rerender } = renderHook(() =>
            useInteraction({
                initialState: null,
                actions: (_state, _setState, clientApi) => ({
                    capture: () => seen.push(clientApi),
                }),
            })
        );

        act(() => {
            result.current.capture();
        });
        expect(seen[seen.length - 1]).toBeNull();

        const { api } = makeClientApi();
        mockDesignContext({ clientApi: api });
        rerender();

        act(() => {
            result.current.capture();
        });
        // Same stable `capture`, but it must now see the connected clientApi.
        expect(seen[seen.length - 1]).toBe(api);
    });

    it('subscribes event handlers to the clientApi in design mode and unsubscribes on unmount', () => {
        const { api, on, unsubscribe } = makeClientApi();
        mockDesignContext({ isDesignMode: true, clientApi: api });

        const handler = vi.fn();
        const { unmount } = renderHook(() =>
            useInteraction({
                initialState: null,
                eventHandlers: {
                    ComponentHoveredIn: { handler },
                },
            })
        );

        expect(on).toHaveBeenCalledTimes(1);
        expect(on).toHaveBeenCalledWith('ComponentHoveredIn', expect.any(Function));

        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('subscribes only once and does not re-subscribe across re-renders', () => {
        const { api, on, unsubscribe } = makeClientApi();
        mockDesignContext({ isDesignMode: true, clientApi: api });

        // Fresh eventHandlers literal every render (the real-world case for all
        // inline-config hooks); the subscription must NOT tear down + re-add.
        const { rerender } = renderHook(() =>
            useInteraction({
                initialState: 0,
                eventHandlers: {
                    ComponentHoveredIn: { handler: vi.fn() },
                },
            })
        );

        expect(on).toHaveBeenCalledTimes(1);

        rerender();
        rerender();

        expect(on).toHaveBeenCalledTimes(1);
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('dispatches to the latest handler closure across re-renders (no stale closure)', () => {
        const { api, on } = makeClientApi();
        mockDesignContext({ isDesignMode: true, clientApi: api });

        // `token` is a fresh binding per render; the handler closes over it, like
        // drag's ClientWindowDragMoved closing over the current rectCache WeakMap.
        // With subscribe-once, the single registered dispatcher must still invoke
        // the LATEST render's handler, not the one captured at subscription time.
        const seen: string[] = [];
        const { rerender } = renderHook(
            ({ token }: { token: string }) =>
                useInteraction({
                    initialState: null,
                    eventHandlers: {
                        ComponentHoveredIn: {
                            handler: () => seen.push(token),
                        },
                    },
                }),
            { initialProps: { token: 'first' } }
        );

        // The dispatcher registered on the clientApi (first arg to `on`).
        const dispatch = on.mock.calls[0][1] as (event: unknown) => void;

        act(() => dispatch({}));
        expect(seen).toEqual(['first']);

        rerender({ token: 'second' });
        act(() => dispatch({}));
        // Same registered dispatcher, but it read the latest render's handler.
        expect(seen).toEqual(['first', 'second']);
        expect(on).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe when not in design mode', () => {
        const { api, on } = makeClientApi();
        mockDesignContext({ isDesignMode: false, clientApi: api });

        renderHook(() =>
            useInteraction({
                initialState: null,
                eventHandlers: {
                    ComponentHoveredIn: { handler: vi.fn() },
                },
            })
        );

        expect(on).not.toHaveBeenCalled();
    });
});
