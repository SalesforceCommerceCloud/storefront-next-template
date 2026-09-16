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
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ClientApi, HostToClientConfiguration } from '../../messaging-api';
import { PreviewContext, PreviewProvider, usePreviewContext } from './PreviewContext';

const hoisted = vi.hoisted(() => {
    const state: { connectOptions?: unknown } = {};
    const connect = vi.fn((options: unknown) => {
        state.connectOptions = options;
    });
    const disconnect = vi.fn();
    const notifyClientRouteChanged = vi.fn();
    const clientApi = { connect, disconnect, notifyClientRouteChanged };

    return { state, connect, disconnect, notifyClientRouteChanged, clientApi };
});

vi.mock('../../messaging-api', () => ({
    createClientApi: vi.fn(() => hoisted.clientApi as unknown as ClientApi),
}));

type ClientConnectOptions = NonNullable<Parameters<ClientApi['connect']>[0]>;

const baseConfig: HostToClientConfiguration = {
    components: {},
    componentTypes: {},
    labels: {},
    regions: {},
};

const Consumer = () => {
    const ctx = usePreviewContext();

    return (
        <div>
            <span data-testid="preview-mode">{String(ctx.isPreviewMode)}</span>
            <span data-testid="connected">{String(ctx.isConnected)}</span>
            <span data-testid="client-api">{ctx.clientApi ? 'set' : 'null'}</span>
        </div>
    );
};

const renderProvider = () =>
    render(
        <PreviewProvider targetOrigin="*" clientId="test-client" usid="test-usid">
            <Consumer />
        </PreviewProvider>
    );

describe('PreviewContext', () => {
    afterEach(() => {
        vi.clearAllMocks();
        hoisted.state.connectOptions = undefined;
        cleanup();
    });

    it('mounts with isPreviewMode=true and a clientApi but no host connection', () => {
        const { getByTestId } = renderProvider();

        expect(getByTestId('preview-mode').textContent).toBe('true');
        expect(getByTestId('client-api').textContent).toBe('set');
        expect(getByTestId('connected').textContent).toBe('false');
    });

    it('opens a connection with usid and marks isConnected once the host acknowledges', () => {
        const { getByTestId } = renderProvider();

        expect(hoisted.connect).toHaveBeenCalledTimes(1);
        const opts = hoisted.state.connectOptions as ClientConnectOptions;

        expect(opts.usid).toBe('test-usid');

        act(() => {
            opts.onHostConnected?.(baseConfig);
        });

        expect(getByTestId('connected').textContent).toBe('true');
    });

    it('disconnects the client on unmount', () => {
        const { unmount } = renderProvider();

        unmount();

        expect(hoisted.disconnect).toHaveBeenCalled();
    });

    it('exposes notifyClientRouteChanged which forwards the URL to clientApi.notifyClientRouteChanged', () => {
        let capturedNotify: ((url: string) => void) | undefined;
        const RouteConsumer = () => {
            capturedNotify = usePreviewContext().notifyClientRouteChanged;
            return null;
        };

        render(
            <PreviewProvider targetOrigin="*" clientId="test-client">
                <RouteConsumer />
            </PreviewProvider>
        );

        capturedNotify?.('https://example.com/products/abc');

        expect(hoisted.notifyClientRouteChanged).toHaveBeenCalledWith({
            url: 'https://example.com/products/abc',
        });
    });

    it('keeps notifyClientRouteChanged reference stable across isConnected flips', () => {
        // Regression guard: an unstable identity would trigger a duplicate ClientRouteChanged
        // when isConnected flips false->true (the RouteEmitter effect would re-run).
        const captured: Array<((url: string) => void) | undefined> = [];
        const RouteConsumer = () => {
            captured.push(usePreviewContext().notifyClientRouteChanged);
            return null;
        };

        render(
            <PreviewProvider targetOrigin="*" clientId="test-client" usid="test-usid">
                <RouteConsumer />
            </PreviewProvider>
        );

        const before = captured.at(-1);
        expect(before).toBeDefined();

        act(() => {
            const opts = hoisted.state.connectOptions as ClientConnectOptions;
            opts.onHostConnected?.(baseConfig);
        });

        const after = captured.at(-1);
        expect(after).toBe(before);
    });

    it('exposes the default (no-provider) context safely', () => {
        const StandaloneConsumer = () => {
            const { isPreviewMode, isConnected, clientApi } = usePreviewContext();

            return (
                <>
                    <span data-testid="mode">{String(isPreviewMode)}</span>
                    <span data-testid="connected">{String(isConnected)}</span>
                    <span data-testid="api">{clientApi ? 'set' : 'null'}</span>
                </>
            );
        };
        const { getByTestId } = render(
            <PreviewContext.Provider
                value={{ isPreviewMode: false, isConnected: false, notifyClientRouteChanged: () => undefined }}>
                <StandaloneConsumer />
            </PreviewContext.Provider>
        );

        expect(getByTestId('mode').textContent).toBe('false');
        expect(getByTestId('connected').textContent).toBe('false');
        expect(getByTestId('api').textContent).toBe('null');
    });
});
