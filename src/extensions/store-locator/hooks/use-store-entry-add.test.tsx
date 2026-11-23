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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { useStoreEntryAdd } from '@/extensions/store-locator/hooks/use-store-entry-add';
import { StoreLocatorContext } from '@/extensions/store-locator/providers/context';
import { createStoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';
import { loadPendingAddActions } from '@/extensions/store-locator/lib/load-pending-add';
import { parsePendingAdd, requestPendingAdd, resumePendingAdd } from '@/extensions/store-locator/lib/pending-add';

const pendingAddActions = { parsePendingAdd, requestPendingAdd, resumePendingAdd };

vi.mock('@/extensions/store-locator/lib/load-pending-add', () => ({ loadPendingAddActions: vi.fn() }));

beforeEach(() => vi.mocked(loadPendingAddActions).mockReset());

describe('store entry with a minimal client config', () => {
    it('leaves the existing add path available when features is absent', () => {
        const config = { ...mockConfig };
        Reflect.deleteProperty(config, 'features');
        const resume = vi.fn();
        const { result } = renderHook(useStoreEntryAdd, {
            wrapper: ({ children }) => (
                <ConfigProvider config={config}>
                    <MemoryRouter>{children}</MemoryRouter>
                </ConfigProvider>
            ),
        });
        expect(result.current.enabled).toBe(false);
        expect(result.current.intercept({ productId: 'variant', quantity: 2 }, resume)).toBe(false);
        expect(result.current.getSelection()).toBeUndefined();
        expect(resume).not.toHaveBeenCalled();
        expect(loadPendingAddActions).not.toHaveBeenCalled();
    });
});

function setupLoadingEntry() {
    let resolve!: (value: typeof pendingAddActions) => void;
    let reject!: (error: Error) => void;
    const loading = new Promise<typeof pendingAddActions>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    vi.mocked(loadPendingAddActions).mockReturnValue(loading);
    const store = createStoreLocatorStore();
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: { enabled: true, fulfillmentModes: ['pickup' as const, 'delivery' as const] },
        },
    };
    const hook = renderHook(() => ({ entry: useStoreEntryAdd(), navigate: useNavigate() }), {
        wrapper: ({ children }) => (
            <ConfigProvider config={config}>
                <StoreLocatorContext.Provider value={store}>
                    <MemoryRouter>{children}</MemoryRouter>
                </StoreLocatorContext.Provider>
            </ConfigProvider>
        ),
    });
    return { ...hook, store, resolve, reject };
}

const productIntent = () => ({
    productId: 'pink-size-6',
    quantity: 2,
    optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
});

describe('loading optional pending-add actions', () => {
    it('reserves one request and snapshots variant/options/quantity before the chunk resolves', async () => {
        const { result, store, resolve } = setupLoadingEntry();
        const resume = vi.fn();
        const intent = productIntent();
        act(() => {
            expect(result.current.entry.intercept(intent, resume)).toBe(true);
            expect(result.current.entry.intercept(productIntent(), resume)).toBe(true);
        });
        expect(loadPendingAddActions).toHaveBeenCalledOnce();
        expect(store.getState().isOpen).toBe(false);
        intent.quantity = 9;
        intent.optionItems[0].optionValueId = 'changed';
        await act(async () => {
            resolve(pendingAddActions);
            await Promise.resolve();
        });
        expect(store.getState().pendingAdd?.intent).toEqual(productIntent());
        expect(store.getState().isOpen).toBe(true);
        expect(store.getState().pendingAddLoad).toBeNull();
        expect(resume).not.toHaveBeenCalled();
    });

    it.each([
        'close',
        'navigate',
        'unmount',
        'identity',
    ] as const)('does not open or resume a stale add after %s while its chunk loads', async (reason) => {
        const { result, store, resolve, unmount } = setupLoadingEntry();
        const resume = vi.fn();
        act(() => {
            result.current.entry.intercept(productIntent(), resume);
        });
        act(() => {
            if (reason === 'close') store.getState().close();
            if (reason === 'navigate') void result.current.navigate('/another-product');
            if (reason === 'unmount') unmount();
            if (reason === 'identity') store.setState({ generation: store.getState().generation + 1 });
        });
        await act(async () => {
            resolve(pendingAddActions);
            await Promise.resolve();
        });
        expect(store.getState().isOpen).toBe(false);
        expect(store.getState().pendingAdd).toBeNull();
        expect(store.getState().pendingAddLoad).toBeNull();
        expect(resume).not.toHaveBeenCalled();
    });

    it('clears a failed chunk request, reports the failure once and permits an explicit retry', async () => {
        const { result, store, reject } = setupLoadingEntry();
        const resume = vi.fn();
        const feedback = vi.fn();
        act(() => {
            result.current.entry.intercept(productIntent(), resume, feedback);
        });
        await act(async () => {
            reject(new Error('fixture: chunk unavailable'));
            await Promise.resolve();
        });
        expect(feedback).toHaveBeenCalledOnce();
        expect(store.getState().pendingAddLoad).toBeNull();
        expect(store.getState().pendingAdd).toBeNull();
        expect(store.getState().isOpen).toBe(false);
        expect(resume).not.toHaveBeenCalled();
        vi.mocked(loadPendingAddActions).mockResolvedValue(pendingAddActions);
        await act(async () => {
            result.current.entry.intercept(productIntent(), resume, feedback);
            await Promise.resolve();
        });
        expect(store.getState().isOpen).toBe(true);
        expect(store.getState().pendingAdd?.intent).toEqual(productIntent());
        expect(resume).not.toHaveBeenCalled();
    });
});
