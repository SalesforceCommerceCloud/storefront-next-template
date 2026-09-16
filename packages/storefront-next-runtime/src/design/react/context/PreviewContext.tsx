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
import { useCallback, useEffect, useMemo, useState, type JSX, type PropsWithChildren } from 'react';
import { createClientApi, type IsomorphicConfiguration } from '../../messaging-api';
import { PreviewContext, type PreviewContextType } from '../core/PreviewContext';

// oxlint-disable-next-line react-refresh/only-export-components
export { PreviewContext, usePreviewContext, type PreviewContextType } from '../core/PreviewContext';

const noop = () => {
    /* noop */
};

/**
 * Provider component that enables preview-time functionality for child components.
 *
 * Unlike {@link DesignProvider}, this provider does NOT mount the editor overlays or
 * seed a page from the host — the storefront renders exactly as it does for a real
 * shopper. It opens the messaging channel purely so the client can push events
 * (route changes, scroll, errors) back to the host.
 */
export const PreviewProvider = ({
    children,
    targetOrigin,
    clientId,
    usid,
    clientConnectionTimeout,
    clientConnectionInterval,
    clientLogger = noop,
}: PropsWithChildren<{
    targetOrigin: string;
    clientId: string;
    usid?: string;
    clientConnectionTimeout?: number;
    clientConnectionInterval?: number;
    clientLogger?: IsomorphicConfiguration['logger'];
}>): JSX.Element => {
    const [isConnected, setIsConnected] = useState(false);

    const clientApi = useMemo(
        () =>
            createClientApi({
                logger: clientLogger,
                emitter: {
                    postMessage: (message) => window.parent.postMessage(message, targetOrigin),
                    addEventListener: (handler) => {
                        const listener = (event: MessageEvent) => handler(event.data);

                        window.addEventListener('message', listener);

                        return () => window.removeEventListener('message', listener);
                    },
                },
                id: clientId,
            }),
        [targetOrigin, clientId, clientLogger]
    );

    useEffect(() => {
        clientApi.connect({
            timeout: clientConnectionTimeout,
            interval: clientConnectionInterval,
            onHostConnected: () => {
                setIsConnected(true);
            },
            onHostDisconnected: (reconnect) => {
                setIsConnected(false);
                reconnect();
            },
            onError: noop,
            usid,
        });

        return () => {
            clientApi.disconnect();
            setIsConnected(false);
        };
    }, [clientApi, clientConnectionTimeout, clientConnectionInterval, usid]);

    const notifyClientRouteChanged = useCallback(
        (url: string) => clientApi.notifyClientRouteChanged({ url }),
        [clientApi]
    );

    const contextValue = useMemo<PreviewContextType>(
        () => ({
            isPreviewMode: true,
            clientApi,
            isConnected,
            notifyClientRouteChanged,
        }),
        [clientApi, isConnected, notifyClientRouteChanged]
    );

    return <PreviewContext.Provider value={contextValue}>{children}</PreviewContext.Provider>;
};
