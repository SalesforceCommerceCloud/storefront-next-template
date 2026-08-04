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
import type {
    ClientApi,
    ClientConfiguration,
    ClientEventNameMapping,
    HostEventNameMapping,
    WithMeta,
} from './api-types';
import type { HostToClientConfiguration } from './domain-types';
import { Messenger } from './messenger';

/**
 * Factory function to create a ClientApi instance.
 *
 * @public
 * @param _config - Configuration object for the client API (currently unused).
 * @returns {ClientApi} An instance of the ClientApi interface.
 */
export function createClientApi({ emitter, id, forwardedKeys = [], logger }: ClientConfiguration): ClientApi {
    const messenger = new Messenger<ClientEventNameMapping, HostEventNameMapping>({
        source: 'client',
        id,
        emitter,
        logger,
    });
    const subscriptions: (() => void)[] = [];

    let isConnected = false;
    let connectionTimeoutId: number | null = null;
    let hostConfig: HostToClientConfiguration | null = null;

    const clearConnectionTimeout = () => {
        if (connectionTimeoutId) {
            clearTimeout(connectionTimeoutId);
            connectionTimeoutId = null;
        }
    };

    const disconnect = ({ isReconnecting = false }: { isReconnecting?: boolean } = {}) => {
        clearConnectionTimeout();
        isConnected = false;
        subscriptions.forEach((unsubscribe) => unsubscribe());
        messenger.disconnect();
        messenger.emit('ClientDisconnected', { clientId: id, reconnect: isReconnecting });
    };

    const connect = ({
        interval = 1_000,
        timeout = 60_000,
        prepareClient = () => Promise.resolve(),
        onHostConnected,
        onHostDisconnected,
        onError,
        usid,
    }: {
        interval?: number;
        timeout?: number;
        prepareClient?: () => Promise<void>;
        onHostConnected?: (configuration: HostToClientConfiguration) => void;
        onHostDisconnected?: (reconnect: () => void) => void;
        onError?: (error: Error) => void;
        usid?: string;
    } = {}) => {
        if (isConnected) {
            disconnect({ isReconnecting: true });
        }

        const expirationTime = Date.now() + timeout;
        const { markIsReady, emptyQueue } = messenger.connect();

        subscriptions.push(
            messenger.on('ClientAcknowledged', async (event) => {
                if (event.meta.hostId === messenger.getRemoteId()) {
                    // We've already been acknowledged by the host in this case.
                    return;
                }

                hostConfig = event;
                messenger.setRemoteId(event.meta.hostId);
                clearConnectionTimeout();

                try {
                    await prepareClient();

                    markIsReady();
                    messenger.emit('ClientReady', { clientId: id });
                    onHostConnected?.(hostConfig);
                    emptyQueue();
                } catch (error) {
                    onError?.(error as Error);
                }
            }),
            messenger.on('ClientConfigurationChanged', (event) => {
                hostConfig = event;
                onHostConnected?.(hostConfig);
            }),
            messenger.on('HostDisconnected', () => {
                disconnect();
                onHostDisconnected?.(() =>
                    connect({
                        interval,
                        timeout,
                        prepareClient,
                        onHostConnected,
                        onHostDisconnected,
                        onError,
                        usid,
                    })
                );
            })
        );

        const checkInitialization = () => {
            if (Date.now() > expirationTime) {
                throw new Error(`Timed out after waiting ${timeout}ms for host connection`);
            }

            messenger.emit('ClientInitialized', { clientId: id, forwardedKeys, usid }, { requireRemoteId: false });
            connectionTimeoutId = setTimeout(() => checkInitialization(), interval) as unknown as number;
        };

        isConnected = true;
        checkInitialization();
    };

    return {
        addComponentToRegion: messenger.toEmitter('ComponentAddedToRegion'),
        moveComponentToRegion: messenger.toEmitter('ComponentMovedToRegion'),
        startComponentDrag: messenger.toEmitter('ComponentDragStarted'),
        hoverInToComponent: messenger.toEmitter('ComponentHoveredIn'),
        hoverOutOfComponent: messenger.toEmitter('ComponentHoveredOut'),
        selectComponent: messenger.toEmitter('ComponentSelected'),
        deselectComponent: messenger.toEmitter('ComponentDeselected'),
        deleteComponent: messenger.toEmitter('ComponentDeleted'),
        notifyWindowScrollChanged: messenger.toEmitter('WindowScrollChanged'),
        notifyClientReady: messenger.toEmitter('ClientReady'),
        notifyError: messenger.toEmitter('Error'),
        notifyClientPageChanged: messenger.toEmitter('ClientPageChanged'),
        connect,
        on: <TEvent extends keyof ClientEventNameMapping>(
            eventName: TEvent,
            handler: (handlerEvent: Readonly<WithMeta & ClientEventNameMapping[TEvent]>) => void
        ) =>
            messenger.on(eventName, (event) => {
                // Don't receive any events besides the acknowledged event until the client is ready
                if (eventName === 'ClientAcknowledged' || messenger.isReady()) {
                    handler(event);
                }
            }),
        disconnect,
        getRemoteId: () => messenger.getRemoteId(),
    };
}
