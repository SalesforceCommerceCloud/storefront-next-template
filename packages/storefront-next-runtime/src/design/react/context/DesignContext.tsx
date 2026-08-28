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
import React from 'react';
import { createClientApi, type IsomorphicConfiguration, type HostToClientConfiguration } from '../../messaging-api';
import type { ShopperExperience } from '@/scapi-client/types';
import { DesignStateProvider } from './DesignStateContext';
import { DesignApp } from '../components/DesignApp';
import { usePageDesignerMode } from '../core/PageDesignerProvider';
import type { PageUpdateMode } from '../core/component.types';
import { DesignContext, useDesignContext, type DesignContextType } from '../core/DesignContext';

const noop = () => {
    /* noop */
};

export type { DesignContextType };
// oxlint-disable-next-line react-refresh/only-export-components
export { DesignContext, useDesignContext };

/**
 * Provider component that enables design-time functionality for child components.
 * Sets up client-host communication and manages component selection state.
 *
 * @param children - Child components to wrap with design functionality
 * @param targetOrigin - Target origin for postMessage communication
 * @param clientId - Id for the client API
 * @returns JSX element wrapping children with design context
 */
export const DesignProvider = ({
    children,
    targetOrigin,
    clientId,
    usid,
    clientConnectionTimeout,
    clientConnectionInterval,
    pageUpdateMode = 'server',
    clientLogger = noop,
}: React.PropsWithChildren<{
    targetOrigin: string;
    clientId: string;
    usid?: string;
    clientConnectionTimeout?: number;
    clientConnectionInterval?: number;
    pageUpdateMode?: PageUpdateMode;
    clientLogger?: IsomorphicConfiguration['logger'];
}>): React.JSX.Element => {
    const { isDesignMode } = usePageDesignerMode();
    const [isConnected, setIsConnected] = React.useState(false);
    const [pageDesignerConfig, setPageDesignerConfig] = React.useState<HostToClientConfiguration | null>(null);
    const [clientPage, setClientPage] = React.useState<ShopperExperience.schemas['Page'] | null>(null);
    const clientPageRef = React.useRef<ShopperExperience.schemas['Page'] | null>(null);

    const clientApi = React.useMemo(
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

    const resetState = React.useCallback(() => {
        setPageDesignerConfig(null);
        setClientPage(null);
        setIsConnected(false);
    }, []);

    React.useEffect(() => {
        // This will poll the host for a connection until the client is acknowledged.
        clientApi.connect({
            timeout: clientConnectionTimeout,
            interval: clientConnectionInterval,
            onHostConnected: (event) => {
                setPageDesignerConfig(event);

                clientApi.on('ClientConfigurationChanged', (configEvent) => {
                    setPageDesignerConfig(configEvent);
                });

                setIsConnected(true);
            },
            onHostDisconnected: (reconnect) => {
                resetState();
                reconnect();
            },
            onError: () => {
                // TODO: Figure out how to handle this.
            },
            usid,
        });

        return () => {
            clientApi.disconnect();
            resetState();
        };
    }, [clientApi, clientConnectionTimeout, clientConnectionInterval, usid, resetState]);

    // Use the extracted state management hook
    const contextValue = React.useMemo<DesignContextType>(
        () => ({
            isDesignMode,
            clientApi,
            isConnected,
            pageDesignerConfig,
            pageUpdateMode,
            clientPage,
            /**
             * Retained for backwards compatibility. Page Designer will ignore this in future versions.
             * @deprecated
             */
            setClientPage: (page: ShopperExperience.schemas['Page']) => {
                // Dedup by page id, not object identity: upstream (`<Region>` →
                // `<PageRegistration>`) rebuilds an equivalent page object on every
                // render, so an identity check would re-apply + re-render forever.
                if (pageUpdateMode === 'server' && page.id !== clientPageRef.current?.id) {
                    clientPageRef.current = page;
                    setClientPage(page);
                    clientApi?.notifyClientPageChanged({ page });
                }
            },
        }),
        [isDesignMode, clientApi, isConnected, pageDesignerConfig, clientPage, setClientPage, pageUpdateMode]
    );

    return (
        <DesignContext.Provider value={contextValue}>
            <DesignStateProvider>
                <DesignApp>{children}</DesignApp>
            </DesignStateProvider>
        </DesignContext.Provider>
    );
};

DesignProvider.defaultProps = {
    clientLogger: noop,
    clientConnectionTimeout: 60_000,
    clientConnectionInterval: 1_000,
};
