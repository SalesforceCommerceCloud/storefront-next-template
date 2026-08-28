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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import type { ClientApi, HostToClientConfiguration } from '../../messaging-api';
import type { ShopperExperience } from '@/scapi-client/types';
import { DesignProvider, useDesignContext } from './DesignContext';

// Controllable fake client so the test can drive the host-connection callbacks
// and the `ClientConfigurationChanged` subscription directly. Defined via
// vi.hoisted so the (hoisted) vi.mock factory below can reference it.
const hoisted = vi.hoisted(() => {
    const eventHandlers: Record<string, (event: unknown) => void> = {};
    const state: { connectOptions?: unknown } = {};
    const connect = vi.fn((options: unknown) => {
        state.connectOptions = options;
    });
    const disconnect = vi.fn();
    const on = vi.fn((event: string, handler: (event: unknown) => void) => {
        eventHandlers[event] = handler;
        return () => {
            delete eventHandlers[event];
        };
    });
    const notifyClientPageChanged = vi.fn();
    const clientApi = { connect, disconnect, on, notifyClientPageChanged };

    return { eventHandlers, state, connect, disconnect, on, notifyClientPageChanged, clientApi };
});

vi.mock('../../messaging-api', () => ({
    createClientApi: vi.fn(() => hoisted.clientApi as unknown as ClientApi),
}));

// Design mode is on so the provider connects; keep it independent of window.location.
vi.mock('../core/PageDesignerProvider', () => ({
    usePageDesignerMode: () => ({ isDesignMode: true, isPreviewMode: false }),
}));

// Bypass the interaction store + global listener machinery — irrelevant to page updates.
vi.mock('./DesignStateContext', () => ({
    DesignStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/DesignApp', () => ({
    DesignApp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

type ClientConnectOptions = NonNullable<Parameters<ClientApi['connect']>[0]>;

const baseConfig: HostToClientConfiguration = {
    components: {},
    componentTypes: {},
    labels: {},
    regions: {},
};

const pageA: ShopperExperience.schemas['Page'] = { id: 'page-a', typeId: 'testPage', regions: [] };
const pageB: ShopperExperience.schemas['Page'] = { id: 'page-b', typeId: 'testPage', regions: [] };
const deprecatedPage: ShopperExperience.schemas['Page'] = { id: 'deprecated-page', typeId: 'testPage', regions: [] };

// Reads the design context so tests can assert that the live page + locale flow
// through `pageDesignerConfig` (what `<Region>` and the design hooks consume).
// `useDesignContext()` is `null` outside a provider, hence the optional chaining.
const Consumer = () => {
    const ctx = useDesignContext();

    return (
        <div>
            <span data-testid="connected">{String(ctx?.isConnected ?? false)}</span>
            <span data-testid="mode">{ctx?.pageUpdateMode ?? 'none'}</span>
            <span data-testid="client-page">{ctx?.clientPage?.id ?? 'null'}</span>
            <span data-testid="live-page">{ctx?.pageDesignerConfig?.page?.id ?? 'null'}</span>
            <span data-testid="live-locale">{ctx?.pageDesignerConfig?.locale ?? 'null'}</span>
            <button type="button" data-testid="set-page" onClick={() => ctx?.setClientPage(deprecatedPage)}>
                set
            </button>
        </div>
    );
};

const renderProvider = (pageUpdateMode: 'client' | 'server') =>
    render(
        <DesignProvider targetOrigin="*" clientId="test-client" pageUpdateMode={pageUpdateMode}>
            <Consumer />
        </DesignProvider>
    );

const getConnectOptions = () => hoisted.state.connectOptions as ClientConnectOptions;

describe('DesignProvider', () => {
    beforeEach(() => {
        hoisted.state.connectOptions = undefined;
        Object.keys(hoisted.eventHandlers).forEach((key) => delete hoisted.eventHandlers[key]);
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('exposes a null context outside of a DesignProvider', () => {
        const { getByTestId } = render(<Consumer />);

        expect(getByTestId('connected').textContent).toBe('false');
        expect(getByTestId('live-page').textContent).toBe('null');
    });

    it('connects the client on mount', () => {
        renderProvider('client');

        expect(hoisted.connect).toHaveBeenCalledTimes(1);
    });

    it('never subscribes to the removed ClientPageChanged event', () => {
        renderProvider('client');

        act(() => {
            getConnectOptions().onHostConnected?.({ ...baseConfig, page: pageA });
        });

        expect(hoisted.on).not.toHaveBeenCalledWith('ClientPageChanged', expect.any(Function));
    });

    // The live page + locale ride along on the host configuration for both update
    // modes; `pageUpdateMode` only gates the deprecated `setClientPage` setter.
    describe.each(['client', 'server'] as const)('%s mode', (mode) => {
        it('seeds pageDesignerConfig (page + locale) from the host connection event', () => {
            const { getByTestId } = renderProvider(mode);

            act(() => {
                getConnectOptions().onHostConnected?.({ ...baseConfig, page: pageA, locale: 'en-US' });
            });

            expect(getByTestId('connected').textContent).toBe('true');
            expect(getByTestId('live-page').textContent).toBe('page-a');
            expect(getByTestId('live-locale').textContent).toBe('en-US');
        });

        it('subscribes to ClientConfigurationChanged and updates the page + locale in place', () => {
            const { getByTestId } = renderProvider(mode);

            // Subscription happens inside onHostConnected, not on mount.
            act(() => {
                getConnectOptions().onHostConnected?.({ ...baseConfig, page: pageA, locale: 'en-US' });
            });

            expect(hoisted.on).toHaveBeenCalledWith('ClientConfigurationChanged', expect.any(Function));

            act(() => {
                hoisted.eventHandlers.ClientConfigurationChanged({ ...baseConfig, page: pageB, locale: 'fr-FR' });
            });

            expect(getByTestId('live-page').textContent).toBe('page-b');
            expect(getByTestId('live-locale').textContent).toBe('fr-FR');
        });

        it('resets state when the host disconnects and requests a reconnect', () => {
            const { getByTestId } = renderProvider(mode);
            const reconnect = vi.fn();

            act(() => {
                getConnectOptions().onHostConnected?.({ ...baseConfig, page: pageA });
            });
            expect(getByTestId('live-page').textContent).toBe('page-a');

            act(() => {
                getConnectOptions().onHostDisconnected?.(reconnect);
            });

            expect(reconnect).toHaveBeenCalledTimes(1);
            expect(getByTestId('connected').textContent).toBe('false');
            expect(getByTestId('live-page').textContent).toBe('null');
        });
    });

    describe('deprecated setClientPage setter', () => {
        it('is ignored in client mode', () => {
            const { getByTestId } = renderProvider('client');

            fireEvent.click(getByTestId('set-page'));

            expect(getByTestId('client-page').textContent).toBe('null');
            expect(hoisted.notifyClientPageChanged).not.toHaveBeenCalled();
        });

        it('applies and notifies the host in server mode', () => {
            const { getByTestId } = renderProvider('server');

            fireEvent.click(getByTestId('set-page'));

            expect(getByTestId('client-page').textContent).toBe('deprecated-page');
            expect(hoisted.notifyClientPageChanged).toHaveBeenCalledWith({ page: deprecatedPage });
        });

        // Regression: `<Region>` → `<PageRegistration>` rebuilds the page object on
        // every render (spread of the resolved/live page) and hands it to
        // setClientPage from an effect. A reference-equality dedup guard never
        // matches the fresh-but-equivalent object, so in server mode it re-applies
        // + re-renders forever (an infinite loop in the LivePageSwitching story).
        // The guard must dedup by a stable value (page id), not object identity.
        it('dedups by page id, not object identity, when re-applied with a fresh equivalent object', () => {
            // Two distinct objects that describe the same page — exactly what a
            // re-render produces upstream.
            const first: ShopperExperience.schemas['Page'] = { id: 'same-page', typeId: 'testPage', regions: [] };
            const second: ShopperExperience.schemas['Page'] = { id: 'same-page', typeId: 'testPage', regions: [] };

            const Setter = () => {
                const ctx = useDesignContext();
                return (
                    <>
                        <button type="button" data-testid="apply-first" onClick={() => ctx?.setClientPage(first)}>
                            first
                        </button>
                        <button type="button" data-testid="apply-second" onClick={() => ctx?.setClientPage(second)}>
                            second
                        </button>
                    </>
                );
            };

            const { getByTestId } = render(
                <DesignProvider targetOrigin="*" clientId="test-client" pageUpdateMode="server">
                    <Setter />
                </DesignProvider>
            );

            fireEvent.click(getByTestId('apply-first'));
            fireEvent.click(getByTestId('apply-second'));

            // The second call is an equivalent page (same id) — it must be treated
            // as a no-op so an effect firing it every render can't loop.
            expect(hoisted.notifyClientPageChanged).toHaveBeenCalledTimes(1);
            expect(hoisted.notifyClientPageChanged).toHaveBeenCalledWith({ page: first });
        });
    });
});
