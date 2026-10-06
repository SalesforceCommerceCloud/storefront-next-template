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

/**
 * Lifecycle test for the close-flush handoff over the REAL React Router fetcher registry (only the toast and
 * i18n are mocked). It reproduces the reviewed race directly: a mini-cart line item submits a keyed fetcher,
 * the drawer closes and unmounts the line item while that request is still in flight, and the request settles
 * only afterwards. The store and `CartMutationToastWatcher` are the real modules, so this proves React Router
 * keeps the in-flight fetcher alive across the zero-owner gap and the watcher's leaf receives the settled
 * data — the exact hand-off the unit test's mocked fetcher cannot exercise.
 */
import { render, act, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { createMemoryRouter, RouterProvider, useFetcher } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CartMutationToastWatcher } from './cart-mutation-toast-watcher';

import { registerPendingCartMutation, unregisterPendingCartMutation } from '@/hooks/cart-mutation-toast-store';

const KEY = 'item-1-mini-cart-item';
const ACTION_PATH = '/cart-item';

const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

// Fires when the line item observes its own request settle while still mounted (the in-panel case).
const mockOwnerSettled = vi.fn();

// Identity t(): the real resolvers still map a success/error to the right key and variant.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// The gated action stands in for the in-flight PATCH; the test resolves it on demand to control timing.
let resolveAction: ((value: { success: boolean }) => void) | null = null;
function makeGatedAction() {
    return () =>
        new Promise<{ success: boolean }>((resolve) => {
            resolveAction = resolve;
        });
}

// Minimal stand-in for the mini-cart line item: submits a keyed fetcher on mount and, if that request is
// still in flight when it unmounts, hands the key off to the watcher exactly as `use-cart-quantity-update`.
function MiniCartLineItem(): null {
    const fetcher = useFetcher({ key: KEY });
    const initiatedRef = useRef(false);
    const submittedRef = useRef(false);

    useEffect(() => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        initiatedRef.current = true;
        void fetcher.submit(new FormData(), { method: 'post', action: ACTION_PATH });
    }, [fetcher]);

    // The in-panel case: clear the marker if the response settles while still mounted, so no hand-off fires.
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            initiatedRef.current = false;
            mockOwnerSettled();
        }
    }, [fetcher.state, fetcher.data]);

    // The close-flush case: on unmount mid-flight, register the hand-off.
    useEffect(
        () => () => {
            if (initiatedRef.current) registerPendingCartMutation(KEY, 'quantity-update');
        },
        []
    );

    return null;
}

let setShowItem: ((show: boolean) => void) | null = null;
function Root(): React.ReactElement {
    const [showItem, setShow] = useState(true);
    setShowItem = setShow;
    return (
        <>
            <CartMutationToastWatcher />
            {showItem ? <MiniCartLineItem /> : null}
        </>
    );
}

function renderApp() {
    const router = createMemoryRouter(
        [
            { path: '/', Component: Root },
            { path: ACTION_PATH, action: makeGatedAction() },
        ],
        { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    return router;
}

beforeEach(() => {
    resolveAction = null;
    setShowItem = null;
});

afterEach(() => {
    unregisterPendingCartMutation(KEY);
    vi.clearAllMocks();
});

describe('mini-cart close-flush toast hand-off (real fetcher registry)', () => {
    test('fires exactly one toast when the in-flight request settles after the line item unmounts', async () => {
        const router = renderApp();

        // The line item submitted; the gated action leaves the fetcher in flight and no toast has fired.
        await waitFor(() => expect(router.state.fetchers.get(KEY)?.state).toBe('submitting'));
        expect(mockAddToast).not.toHaveBeenCalled();

        // Drawer closes mid-flight: the line item unmounts and hands its keyed fetcher to the watcher.
        await act(async () => {
            setShowItem?.(false);
            await Promise.resolve();
        });

        // React Router kept the in-flight fetcher alive across the zero-owner gap; still no toast yet.
        expect(router.state.fetchers.has(KEY)).toBe(true);
        expect(mockAddToast).not.toHaveBeenCalled();

        // The response settles now, with only the watcher's leaf owning the key.
        await act(async () => {
            resolveAction?.({ success: true });
            await Promise.resolve();
        });

        await waitFor(() => expect(mockAddToast).toHaveBeenCalledTimes(1));
        expect(mockAddToast).toHaveBeenCalledWith('quantityUpdated', 'success');
    });

    test('does not hand off (no watcher toast) when the request settles before the line item unmounts', async () => {
        const router = renderApp();

        await waitFor(() => expect(router.state.fetchers.get(KEY)?.state).toBe('submitting'));

        // In-panel case: the response settles while the line item is still mounted, clearing the marker.
        await act(async () => {
            resolveAction?.({ success: true });
            await Promise.resolve();
        });
        await waitFor(() => expect(mockOwnerSettled).toHaveBeenCalled());

        // Closing the drawer now must not register a hand-off, so the watcher fires nothing.
        await act(async () => {
            setShowItem?.(false);
            await Promise.resolve();
        });

        expect(mockAddToast).not.toHaveBeenCalled();
    });
});
