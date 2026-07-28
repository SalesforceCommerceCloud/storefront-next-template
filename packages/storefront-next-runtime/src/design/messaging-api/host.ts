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
    HostApi,
    HostConfiguration,
    ClientEventNameMapping,
    HostEventNameMapping,
    WithMeta,
    ConfigFactory,
} from './api-types';
import type { ClientInitializedEvent } from './domain-types';
import { Messenger } from './messenger';

const defaultConfigFactory: ConfigFactory = () =>
    Promise.resolve({ components: {}, componentTypes: {}, labels: {}, regions: {} });
/**
 * Factory function to create a HostApi instance.
 *
 * @public
 * @param {HostConfiguration} config - Configuration object for the host API.
 * @returns {HostApi} An instance of the HostApi interface.
 */
export function createHostApi({ emitter, id, logger }: HostConfiguration): HostApi {
    const messenger = new Messenger<HostEventNameMapping, ClientEventNameMapping>({
        source: 'host',
        id,
        emitter,
        logger,
    });
    const subscriptions: (() => void)[] = [];
    let isConnected = false;
    const disconnect = () => {
        isConnected = false;
        messenger.disconnect();
        subscriptions.forEach((unsubscribe) => unsubscribe());
        messenger.emit('HostDisconnected', {});
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
        forwardKeyPress: messenger.toEmitter('HostKeyPressed'),
        notifyClientWindowDragDropped: messenger.toEmitter('ClientWindowDragDropped'),
        notifyClientWindowDragEntered: messenger.toEmitter('ClientWindowDragEntered'),
        notifyClientWindowDragMoved: messenger.toEmitter('ClientWindowDragMoved'),
        notifyClientWindowDragExited: messenger.toEmitter('ClientWindowDragExited'),
        setComponentProperties: messenger.toEmitter('ComponentPropertiesChanged'),
        notifyWindowScrollChanged: messenger.toEmitter('WindowScrollChanged'),
        notifyPageSettingsChanged: messenger.toEmitter('PageSettingsChanged'),
        notifyMediaChanged: () => messenger.emit('MediaChangedEvent', {}),
        notifyError: messenger.toEmitter('Error'),
        focusComponent: messenger.toEmitter('ComponentFocused'),
        setClientConfiguration: messenger.toEmitter('ClientConfigurationChanged'),
        notifyComponentUpdated: messenger.toEmitter('ComponentUpdated'),
        connect: ({
            configFactory = defaultConfigFactory,
            onClientConnected,
            onClientDisconnected,
            onError,
        }: {
            configFactory: ConfigFactory;
            onClientConnected?: (clientId: string, config: ClientInitializedEvent) => void;
            onClientDisconnected?: (clientId: string) => void;
            onError?: (error: Error) => void;
        }) => {
            if (isConnected) {
                disconnect();
            }

            const { markIsReady, emptyQueue } = messenger.connect();

            subscriptions.push(
                messenger.on('ClientDisconnected', (event) => {
                    if (event.meta.clientId === messenger.getRemoteId()) {
                        messenger.setRemoteId(undefined);
                    }

                    onClientDisconnected?.(event.meta.clientId ?? '');
                })
            );

            subscriptions.push(
                messenger.on('ClientInitialized', async (event) => {
                    const remoteId = messenger.getRemoteId();

                    // If the same client tries reconnecting, we should allow it.
                    // If there is no remote id, we should allow any client to connect.
                    if ((remoteId && event.meta.clientId === remoteId) || !remoteId) {
                        messenger.setRemoteId(event.meta.clientId);

                        try {
                            const config = await configFactory();

                            messenger.emit('ClientAcknowledged', config, { requireRemoteId: false });

                            const { clientId } = await messenger.toPromise('ClientReady');

                            if (clientId !== messenger.getRemoteId()) {
                                throw new Error('Client id mismatch');
                            }

                            markIsReady();
                            onClientConnected?.(clientId, event);
                            emptyQueue();
                        } catch (error) {
                            onError?.(error as Error);
                        }
                    }
                })
            );

            isConnected = true;
        },
        on: <TEvent extends keyof HostEventNameMapping>(
            event: TEvent,
            handler: (handlerEvent: Readonly<WithMeta & HostEventNameMapping[TEvent]>) => void
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        ) => messenger.on(event as any, handler as any),
        disconnect,
        getRemoteId: () => messenger.getRemoteId(),
    };
}
