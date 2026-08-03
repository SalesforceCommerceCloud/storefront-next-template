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
import {
    createClientApi,
    type ClientApi,
    type IsomorphicConfiguration,
    type ClientAcknowledgedEvent,
    type EventPayload,
    type HostToClientConfiguration,
} from '../../messaging-api';
import type { ShopperExperience } from '@/scapi-client/types';
import { DesignStateProvider } from './DesignStateContext';
import { DesignApp } from '../components/DesignApp';
import { usePageDesignerMode } from '../core/PageDesignerProvider';

const noop = () => {
    /* noop */
};

/**
 * Type definition for the Design Context
 * Extends DesignState with additional design-time properties
 */
export interface DesignContextType {
    /** Whether design mode is currently active */
    isDesignMode: boolean;
    /** Client API for host communication */
    clientApi?: ClientApi;
    /** Whether the client is connected to the host */
    isConnected: boolean;
    /** The page designer config */
    pageDesignerConfig: EventPayload<ClientAcknowledgedEvent> | null;
    /** Page data that the client has retrieved */
    clientPage: ShopperExperience.schemas['Page'] | null;
    /** Sets the client page data */
    setClientPage: (page: ShopperExperience.schemas['Page']) => void;
}

// oxlint-disable-next-line react-refresh/only-export-components
export const DesignContext = React.createContext<DesignContextType>({
    isDesignMode: false,
    isConnected: false,
    pageDesignerConfig: null,
    clientPage: null,
    setClientPage: noop,
});

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
    isShopperContextEnabled,
    clientConnectionTimeout,
    clientConnectionInterval,
    clientLogger = noop,
}: React.PropsWithChildren<{
    targetOrigin: string;
    clientId: string;
    usid?: string;
    isShopperContextEnabled?: boolean;
    clientConnectionTimeout?: number;
    clientConnectionInterval?: number;
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

    React.useEffect(() => {
        // This will poll the host for a connection until the client is acknowledged.
        clientApi.connect({
            timeout: clientConnectionTimeout,
            interval: clientConnectionInterval,
            onHostConnected: (event) => {
                setPageDesignerConfig(event);
                setIsConnected(true);
            },
            onHostDisconnected: (reconnect) => {
                setPageDesignerConfig(null);
                setIsConnected(false);
                reconnect();
            },
            onError: () => {
                // TODO: Figure out how to handle this.
            },
            usid,
            isShopperContextEnabled,
        });

        return () => {
            clientApi.disconnect();
            setPageDesignerConfig(null);
            setIsConnected(false);
        };
    }, [clientApi, clientConnectionTimeout, clientConnectionInterval, usid, isShopperContextEnabled]);

    // Use the extracted state management hook
    const contextValue = React.useMemo<DesignContextType>(
        () => ({
            isDesignMode,
            clientApi,
            isConnected,
            pageDesignerConfig,
            clientPage,
            setClientPage: (page: ShopperExperience.schemas['Page']) => {
                if (page !== clientPageRef.current) {
                    clientPageRef.current = page;
                    setClientPage(page);
                    clientApi?.notifyClientPageChanged({ page });
                }
            },
        }),
        [isDesignMode, clientApi, isConnected, pageDesignerConfig, clientPage, setClientPage]
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

/**
 * Custom hook to access the design context
 * Provides access to design mode state and component selection functionality
 *
 * @returns The current design context
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const useDesignContext = (): DesignContextType => React.useContext(DesignContext);
