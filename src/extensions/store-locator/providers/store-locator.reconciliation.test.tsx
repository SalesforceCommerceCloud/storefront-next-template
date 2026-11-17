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
import { useEffect, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AuthProvider from '@/providers/auth';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import {
    StoreLocatorStateProvider,
    useStoreLocatorApi,
    useStoreLocator,
    type StoreLocatorStoreApi,
    SelectedStoreBoundary,
    type SelectedStoreResolution,
} from './store-locator';

describe('selected-store loader reconciliation', () => {
    it.each([
        'set',
        'clear',
    ] as const)('rejects a root read introduced during %s and released after success', async (intent) => {
        let api!: StoreLocatorStoreApi;
        let release!: (result: SelectedStoreResolution) => void;
        const held = new Promise<SelectedStoreResolution>((resolve) => {
            release = resolve;
        });
        function Probe() {
            api = useStoreLocatorApi();
            const selected = useStoreLocator((state) => state.selectedStoreInfo);
            return (
                <>
                    <span data-testid="live">{selected?.id ?? 'empty'}</span>
                    <SelectedStoreBoundary fallback={<span>pending</span>}>
                        {(selection = selected) => <span data-testid="leaf">{selection?.id ?? 'empty'}</span>}
                    </SelectedStoreBoundary>
                </>
            );
        }
        function App({ promise }: { promise?: Promise<SelectedStoreResolution> }) {
            return (
                <AllProvidersWrapper>
                    <StoreLocatorStateProvider selectedStoreResolution={promise}>
                        <Probe />
                    </StoreLocatorStateProvider>
                </AllProvidersWrapper>
            );
        }
        const view = render(<App />);
        const coordinator = createSelectionCoordinator(api);
        let operation!: NonNullable<ReturnType<typeof coordinator.begin>>;
        act(() => {
            const submitted = coordinator.begin(intent === 'set' ? 'canonical' : null, api.getState().generation);
            if (!submitted) throw new Error('Expected selection operation');
            operation = submitted;
        });
        view.rerender(<App promise={held} />);
        act(() => {
            coordinator.complete(operation.id, {
                success: true,
                selectedStoreInfo: intent === 'set' ? { id: 'canonical', inventoryId: 'canonical-inventory' } : null,
            });
        });
        await act(async () => {
            release({ error: null, selectedStoreInfo: { id: 'stale', inventoryId: 'stale-inventory' } });
            await held;
        });
        expect(screen.getByTestId('live')).toHaveTextContent(intent === 'set' ? 'canonical' : 'empty');
        expect(screen.getByTestId('leaf')).toHaveTextContent(intent === 'set' ? 'canonical' : 'empty');
    });
    it('reconciles a resolved snapshot after an identity change without replacing the provider', async () => {
        let api!: StoreLocatorStoreApi;
        function Probe() {
            api = useStoreLocatorApi();
            return <span>{useStoreLocator((state) => state.selectedStoreInfo)?.id ?? 'empty'}</span>;
        }
        function App({ identity, promise }: { identity: string; promise: Promise<SelectedStoreResolution> }) {
            return (
                <AllProvidersWrapper>
                    <AuthProvider value={{ userType: 'guest', usid: identity }}>
                        <StoreLocatorStateProvider
                            identity={JSON.stringify(['guest', undefined, identity])}
                            selectedStoreResolution={promise}>
                            <Probe />
                        </StoreLocatorStateProvider>
                    </AuthProvider>
                </AllProvidersWrapper>
            );
        }
        const first = new Promise<SelectedStoreResolution>(() => {});
        const { rerender } = render(<App identity="first" promise={first} />);
        const originalApi = api;
        const second = Promise.resolve<SelectedStoreResolution>({
            error: null,
            selectedStoreInfo: { id: 'second-store' },
        });
        rerender(<App identity="second" promise={second} />);
        await waitFor(() => expect(screen.getByText('second-store')).toBeInTheDocument());
        expect(api).toBe(originalApi);
    });
    it('keeps content mounted and prevents a late snapshot overwriting a confirmed selection', async () => {
        let release!: (snapshot: SelectedStoreResolution) => void;
        const promise = new Promise<SelectedStoreResolution>((resolve) => {
            release = resolve;
        });
        let api!: StoreLocatorStoreApi;
        const mounted = vi.fn();
        function Probe() {
            api = useStoreLocatorApi();
            const selected = useStoreLocator((state) => state.selectedStoreInfo);
            useEffect(() => {
                mounted();
            }, []);
            return <div data-testid="content">{selected?.id ?? 'no selection'}</div>;
        }
        function Wrapper({ children }: { children: ReactNode }) {
            return (
                <AllProvidersWrapper>
                    <AuthProvider value={{ userType: 'guest', usid: 'test' }}>
                        <StoreLocatorStateProvider
                            identity={JSON.stringify(['guest', undefined, 'test'])}
                            selectedStoreResolution={promise}>
                            {children}
                        </StoreLocatorStateProvider>
                    </AuthProvider>
                </AllProvidersWrapper>
            );
        }
        render(
            <>
                <Probe />
                <SelectedStoreBoundary fallback={<span>Pending selection</span>}>
                    {(selection) => <span>{selection?.id ?? 'live selection'}</span>}
                </SelectedStoreBoundary>
            </>,
            { wrapper: Wrapper }
        );
        expect(screen.getByTestId('content')).toHaveTextContent('no selection');
        expect(screen.getByText('Pending selection')).toBeInTheDocument();
        act(() => {
            api.setState({ selectionRevision: 1 });
            api.getState().setSelectedStoreInfo({ id: 'new-store' });
        });
        await act(async () => {
            release({ error: null, selectedStoreInfo: { id: 'old-store' } });
            await promise;
        });
        await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('new-store'));
        expect(api.getState().selectedStoreInfo?.id).toBe('new-store');
        expect(mounted).toHaveBeenCalledTimes(1);
    });
});
