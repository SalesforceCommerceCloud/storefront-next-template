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
/* oxlint-disable import/no-namespace */
import type * as Domain from './domain-types';

export type Source = 'host' | 'client';

/**
 * A type that adds metadata to an event.
 * @inline
 * @expand
 * @hidden
 */
export interface WithMeta {
    /**
     * Metadata attached to an event.
     */
    meta: {
        /**
         * Indicates that the event is part of the messaging api.
         * Primarily used to distinguish messages events from other services.
         */
        pdMessagingApi: true;
        /**
         * The source of the event.
         * Since some events are bidirectional, we need to know which side the event is coming from.
         */
        source: Source;
        /**
         * The id of the connected client.
         */
        clientId?: string;
        /**
         * The id of the connected host.
         */
        hostId?: string;
    };
}

export type EventPayload<TEvent> = Omit<TEvent, 'eventType' | 'meta'>;

/**
 * The mapping of events, emitted on the host and client, to their corresponding event and API name.
 * @hidden
 */
export interface IsomorphicEventNameMapping {
    ComponentDragStarted: Domain.ComponentDragStartedEvent;
    ComponentHoveredIn: Domain.ComponentHoveredInEvent;
    ComponentHoveredOut: Domain.ComponentHoveredOutEvent;
    ComponentSelected: Domain.ComponentSelectedEvent;
    ComponentDeselected: Domain.ComponentDeselectedEvent;
    ComponentAddedToRegion: Domain.ComponentAddedToRegionEvent;
    ComponentDeleted: Domain.ComponentDeletedEvent;
    ComponentMovedToRegion: Domain.ComponentMovedToRegionEvent;
    WindowScrollChanged: Domain.WindowScrollChangedEvent;
    Error: Domain.ErrorEvent;
}

/**
 * The mapping of host events, emitted on the host, to their corresponding event and API name.
 * @hidden
 */
export interface HostEventNameMapping extends IsomorphicEventNameMapping {
    ClientInitialized: Domain.ClientInitializedEvent;
    ClientReady: Domain.ClientReady;
    ClientDisconnected: Domain.ClientDisconnectedEvent;
    ClientPageChanged: Domain.ClientPageChangedEvent;
}

/**
 * The mapping of client events to their corresponding event.
 * @hidden
 */
export interface ClientEventNameMapping extends IsomorphicEventNameMapping {
    HostDisconnected: Domain.HostDisconnected;
    PageSettingsChanged: Domain.PageSettingsChangedEvent;
    HostKeyPressed: Domain.HostKeyPressedEvent;
    ClientAcknowledged: Domain.ClientAcknowledgedEvent;
    ClientConfigurationChanged: Domain.ClientConfigurationChangedEvent;
    ComponentUpdated: Domain.ComponentUpdatedEvent;
    ComponentReset: Domain.ComponentResetEvent;
    ClientWindowDragEntered: Domain.ClientWindowDragEnteredEvent;
    ClientWindowDragMoved: Domain.ClientWindowDragMovedEvent;
    ClientWindowDragExited: Domain.ClientWindowDragExitedEvent;
    ClientWindowDragDropped: Domain.ClientWindowDragDroppedEvent;
    ComponentPropertiesChanged: Domain.ComponentPropertiesChangedEvent;
    MediaChangedEvent: Domain.MediaChangedEvent;
    ComponentFocused: Domain.ComponentFocusedEvent;
}

/**
 * @hidden
 */
export type ClientMessage = ClientEventNameMapping[keyof ClientEventNameMapping];
/**
 * @hidden
 */
export type HostMessage = HostEventNameMapping[keyof HostEventNameMapping];
/**
 * @hidden
 */
export type EventTypeName = keyof HostEventNameMapping | keyof ClientEventNameMapping;

/**
 * @inline
 * @expand
 * @hidden
 */
export type WithEventType<TMapping, TEvent extends keyof TMapping = keyof TMapping> = {
    /**
     * The event type of the event.
     */
    eventType: TEvent;
};

/**
 * The type of a handler for an event.
 *
 * @template TMapping - The mapping of event names to their payload types.
 * @template TEvent - The type of the event.
 * @template TPartial - Whether the event is partial.
 */
export type EventHandler<TMapping, TEvent extends keyof TMapping = keyof TMapping, TPartial = false> = (
    // Events are readonly, include meta data, an event type, and a payload for the specific event type.
    // Events can also be partial, when coming from the event emitter before this library processes them.
    event: TPartial extends true
        ? Readonly<Partial<WithMeta & WithEventType<TMapping, TEvent> & TMapping[TEvent]>>
        : Readonly<WithMeta & WithEventType<TMapping, TEvent> & TMapping[TEvent]>
) => unknown;

/**
 * An emitter that will perform the underlying communication with the client or host.
 */
export interface MessageEmitter<TInMapping, TOutMapping> {
    /**
     * Sends a message to the other side of the connection.
     * @param message - The message to send.
     */
    postMessage(message: WithMeta & WithEventType<TOutMapping>): void;
    /**
     * Provides a handler for incoming messages.
     * The provided handler will determine if the message is for the messaging api and direct it accordingly.
     * @param handler
     * @returns A function to remove the event listener.
     */
    addEventListener(handler: EventHandler<TInMapping, keyof TInMapping, true>): () => void;
}

/**
 * Configuration that applies for both host and client.
 *
 * @inline
 * @expand
 * @hidden
 * @stability development
 */
export interface IsomorphicConfiguration {
    /**
     * The id of the client.
     */
    id: string;
    /**
     * A logger for logging all messages.
     */
    logger?: (message: unknown, source: 'host' | 'client') => void;
}

export interface ClientConfiguration extends IsomorphicConfiguration {
    /**
     * The underlying message emitter that will be used to send events.
     */
    emitter: MessageEmitter<ClientEventNameMapping, HostEventNameMapping>;
    /**
     * The keys that are forwarded from the host to the client.
     */
    forwardedKeys?: string[];
}

export interface HostConfiguration extends IsomorphicConfiguration {
    /**
     * The underlying message emitter that will be used to send events.
     */
    emitter: MessageEmitter<HostEventNameMapping, ClientEventNameMapping>;
}

/**
 * @inline
 * @hidden
 */
export interface IsomorphicApi {
    /**
     * Starts a component drag operation.
     * This method initiates dragging of a specific component, typically in response
     * to user interaction or programmatic requirements.
     *
     * @param event - The component drag start event
     * @param event.componentId - The ID of the component to start dragging
     * @param event.x - The x position where the drag operation starts
     * @param event.y - The y position where the drag operation starts
     * @stability development
     *
     * @example
     * ```typescript
     * api.startComponentDrag({
     *   componentId: 'draggable-component',
     *   x: 100,
     *   y: 150
     * });
     * ```
     *
     * @see {Domain.ComponentDragStartedEvent}
     */
    startComponentDrag(event: EventPayload<Domain.ComponentDragStartedEvent>): void;

    /**
     * Moves a component to a different region of a component.
     *
     * @param event - The component move event containing the component and region information
     * @param event.componentId - The ID of the component to move
     * @param event.targetComponentId - The ID of the component where the component is being moved to
     * @param event.targetRegionId - The ID of the region that the component is being moved to
     * @stability development
     *
     * @example
     * ```typescript
     * api.moveComponentToRegion({
     *   componentId: 'component-123',
     *   targetComponentId: 'parent-component',
     *   targetRegionId: 'content-region'
     *   sourceRegionId: 'source-content-region'
     *   sourceComponentId: 'source-component'
     * });
     * ```
     * @see {Domain.ComponentMovedToRegionEvent}
     */
    moveComponentToRegion(event: EventPayload<Domain.ComponentMovedToRegionEvent>): void;
    /**
     * Notifies the host that a component is being hovered over.
     *
     * @param event - The component hover event containing the component ID
     * @param event.componentId - The ID of the component being hovered over
     * @stability development
     *
     * @example
     * ```typescript
     * api.hoverInToComponent({
     *   componentId: 'component-123'
     * });
     * ```
     */
    hoverInToComponent(event: EventPayload<Domain.ComponentHoveredInEvent>): void;

    /**
     * Notifies the host that a component is no longer being hovered over.
     *
     * @param event - The component hover exit event containing the component ID
     * @param event.componentId - The ID of the component that was hovered over
     * @stability development
     *
     * @example
     * ```typescript
     * api.hoverOutOfComponent({
     *   componentId: 'component-123'
     * });
     * ```
     */
    hoverOutOfComponent(event: EventPayload<Domain.ComponentHoveredOutEvent>): void;

    /**
     * Notifies the host that a component has been selected.
     *
     * @param event - The component selection event containing the component ID
     * @param event.componentId - The ID of the component that was selected
     * @stability development
     *
     * @example
     * ```typescript
     * api.selectComponent({
     *   componentId: 'component-123'
     * });
     * ```
     */
    selectComponent(event: EventPayload<Domain.ComponentSelectedEvent>): void;

    /**
     * Notifies the host that a component has been deselected.
     *
     * @param event - The component deselection event containing the component ID
     * @param event.componentId - The ID of the component that was deselected
     * @stability development
     *
     * @example
     * ```typescript
     * api.deselectComponent({
     *   componentId: 'component-123'
     * });
     * ```
     */
    deselectComponent(event: EventPayload<Domain.ComponentDeselectedEvent>): void;

    /**
     * Notifies the host that a component has been added to a specific region of another component.
     *
     * @param event - The component addition event containing component and region information
     * @param event.targetComponentId - The ID of the component that owns the region
     * @param event.targetRegionId - The ID of the region where the component is being added
     * @param event.sourceComponentId - The ID of the component being added to the region
     * @stability development
     *
     * @example
     * ```typescript
     * api.addComponentToRegion({
     *   targetComponentId: 'parent-component',
     *   targetRegionId: 'content-region',
     *   componentId: 'child-component'
     * });
     * ```
     */
    addComponentToRegion(event: EventPayload<Domain.ComponentAddedToRegionEvent>): void;

    /**
     * Notifies the host that a component has been deleted.
     *
     * @param event - The component deletion event containing the component ID
     * @param event.componentId - The ID of the component that was deleted
     * @param event.sourceComponentId - The ID of the component that the component was deleted from
     * @param event.sourceRegionId - The ID of the region that the component was deleted from
     * @stability development
     *
     * @example
     * ```typescript
     * api.deleteComponent({
     *   componentId: 'component-123',
     *   sourceComponentId: 'parent-component',
     *   sourceRegionId: 'content-region'
     * });
     * ```
     */
    deleteComponent(event: EventPayload<Domain.ComponentDeletedEvent>): void;

    /**
     * Notifies that an error has occurred.
     *
     * @param event - The error event containing the error message and stack trace
     * @param event.message - The error message
     * @param event.stack - The stack trace of the error
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyError({
     *   message: 'An error occurred',
     *   stack: 'Error: An error occurred\n    at ...'
     * });
     * ```
     */
    notifyError(event: EventPayload<Domain.ErrorEvent>): void;

    /**
     * Notifies the host that the client window scroll position has changed.
     *
     * @param event - The window scroll change event containing the new scroll positions
     * @param event.scrollX - The horizontal scroll position of the window
     * @param event.scrollY - The vertical scroll position of the window
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyWindowScrollChanged({
     *   scrollX: 100,
     *   scrollY: 200
     * });
     * ```
     */
    notifyWindowScrollChanged(event: Partial<EventPayload<Domain.WindowScrollChangedEvent>>): void;
    /**
     * Gets the id of the remote side of the connection.
     * @returns The id of the remote side of the connection.
     */
    getRemoteId(): string | undefined;
}

export interface ClientApi extends IsomorphicApi {
    /**
     * Disconnects the client from the host.
     * @param options - Optional configuration for the disconnection process
     * @param options.isReconnecting - Whether the client is attempting to reconnect to the host.
     */
    disconnect(options?: { isReconnecting?: boolean }): void;

    /**
     * Connects the client or host to the messaging api.
     * This should be called when the client or host is initialized.
     * This will start listening for events from the other side.
     *
     * @param options - Optional configuration for the connection process
     * @param options.interval - Optional interval in milliseconds for retrying initialization
     * @param options.timeout - Optional timeout in milliseconds for the connection process
     * @param options.prepareClient - Optional function to prepare the client for the connection process
     * @returns The client acknowledged event
     * @stability development
     *
     * @example
     * ```typescript
     * await api.connect({ interval: 1_000 });
     * // Connected to host.
     *
     * // With prepare logic
     * await api.connect({ prepareClient: async () => await doSomethingAsync() });
     * ```
     */
    connect(options?: {
        interval?: number;
        prepareClient?: () => Promise<void>;
        timeout?: number;
        onHostConnected?: (event: Domain.HostToClientConfiguration) => void;
        onHostDisconnected?: (reconnect: () => void) => void;
        onError?: (error: Error) => void;
        usid?: string;
    }): void;

    /**
     * Notifies the host that the client is ready.
     *
     * @param event - The client ready event
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientReady({});
     * ```
     *
     * @see {Domain.ClientReady}
     */
    notifyClientReady(event: EventPayload<Domain.ClientReady>): void;
    /**
     * Notifies the host that the client components have changed.
     *
     * @param event - The client components change event containing the new components
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientComponentsChanged({ components: { ... }});
     * ```
     */
    notifyClientPageChanged(event: EventPayload<Domain.ClientPageChangedEvent>): void;
    /**
     * Registers an event handler for client-side events.
     *
     * @template TEvent - The type of client event to listen for
     * @param event - The name of the event to listen for
     * @param handler - The callback function that will be invoked when the event occurs
     * @returns A function to remove the event listener.
     * @stability development
     *
     * @example
     * ```typescript
     * api.on('ComponentSelected', (event) => {
     *   console.log('Component selected:', event.componentId);
     * });
     * ```
     */
    on<TEvent extends keyof ClientEventNameMapping>(
        event: TEvent,
        handler: (handlerEvent: Readonly<WithMeta & ClientEventNameMapping[TEvent]>) => void
    ): () => void;
    on(event: 'Event', handler: (handlerEvent: Readonly<WithMeta & ClientMessage>) => void): () => void;
}

/**
 * A function that returns a promise that resolves to the client acknowledged event.
 * This is used to configure the client when it is initialized.
 */
export type ConfigFactory = () => Promise<EventPayload<Domain.ClientAcknowledgedEvent>>;

export interface HostApi extends IsomorphicApi {
    /**
     * Disconnects the host instance.
     * This will remove all event listeners and clean up any resources.
     *
     * @stability development
     *
     * @example
     * ```typescript
     * api.disconnect();
     * ```
     */
    disconnect(): void;

    /**
     * Connects the client or host to the messaging api.
     * This should be called when the client or host is initialized.
     *
     * @param params - The parameters for the connection process
     * @param params.configFactory - A function for providing configuration to the client.
     * This can be async if configuration needs to be fetched.
     * @returns The boolean value that indicates if the connection process was successful
     *
     * @stability development
     *
     * @example
     * ```typescript
     * api.connect();
     * // Start listening for client events.
     * ```
     */
    connect(params: {
        configFactory: ConfigFactory;
        onClientConnected?: (clientId: string) => void;
        onClientDisconnected?: (clientId: string) => void;
        onError?: (error: Error) => void;
    }): void;
    /**
     * Registers an event handler for host-side events.
     *
     * @template TEvent - The type of host event to listen for
     * @param event - The name of the event to listen for
     * @param handler - The callback function that will be invoked when the event occurs
     * @returns A function to remove the event listener.
     * @stability development
     *
     * @example
     * ```typescript
     * api.on('ComponentSelected', (event) => {
     *   console.log('Component selection changed:', event.componentId);
     * });
     * ```
     */
    on<TEvent extends keyof HostEventNameMapping>(
        event: TEvent,
        handler: (handlerEvent: Readonly<WithMeta & HostEventNameMapping[TEvent]>) => void
    ): () => void;
    on(event: 'Event', handler: (handlerEvent: Readonly<WithMeta & HostMessage>) => void): () => void;

    /**
     * Notifies the host that the page settings have changed.
     * This method allows the host to control the scroll position of connected clients.
     *
     * @param event - The page settings change event
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyPageSettingsChanged({ settings: { ... }});
     * ```
     *
     * @see {Domain.PageSettingsChangedEvent}
     */
    notifyPageSettingsChanged(event: EventPayload<Domain.PageSettingsChangedEvent>): void;

    /**
     * Forwards a key press event from the host environment to the client.
     * This allows the client to respond to keyboard input that occurs in the host context.
     *
     * @param event - The key press event containing the pressed key
     * @param event.key - The key that was pressed (must be one of the forwarded keys)
     * @stability development
     *
     * @example
     * ```typescript
     * // Forward arrow key navigation
     * api.forwardKeyPress({ key: 'ArrowUp' });
     * api.forwardKeyPress({ key: 'ArrowDown' });
     *
     * // Forward delete key
     * api.forwardKeyPress({ key: 'Delete' });
     * ```
     *
     * @see {Domain.HostKeyPressedEvent}
     * @see {Domain.DefaultForwardedKeys}
     */
    forwardKeyPress(event: EventPayload<Domain.HostKeyPressedEvent>): void;

    /**
     * Notifies the host that a client window drag operation has entered a component.
     * This event is triggered when a drag operation starts over a component in the client window.
     *
     * @param event - The drag enter event containing component and position information
     * @param event.componentId - The ID of the component being dragged over
     * @param event.x - The x position of the drag event relative to the window
     * @param event.y - The y position of the drag event relative to the window
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientWindowDragEntered({
     *   componentId: 'drop-zone-component',
     *   x: 150,
     *   y: 200
     * });
     * ```
     *
     * @see {Domain.ClientWindowDragEnteredEvent}
     */
    notifyClientWindowDragEntered(event: EventPayload<Domain.ClientWindowDragEnteredEvent>): void;

    /**
     * Notifies the host that a client window drag operation has moved over a component.
     * This event is triggered as the drag operation continues over a component.
     *
     * @param event - The drag move event containing component and position information
     * @param event.componentId - The ID of the component being dragged over
     * @param event.x - The current x position of the drag event relative to the window
     * @param event.y - The current y position of the drag event relative to the window
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientWindowDragMoved({
     *   componentId: 'drop-zone-component',
     *   x: 160,
     *   y: 200
     * });
     * ```
     *
     * @see {Domain.ClientWindowDragMovedEvent}
     */
    notifyClientWindowDragMoved(event: EventPayload<Domain.ClientWindowDragMovedEvent>): void;

    /**
     * Notifies the host that a client window drag operation has exited a component.
     * This event is triggered when a drag operation leaves a component area.
     *
     * @param event - The drag exit event containing component and position information
     * @param event.componentId - The ID of the component that was being dragged over
     * @param event.x - The x position where the drag operation exited
     * @param event.y - The y position where the drag operation exited
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientWindowDragExited({
     *   componentId: 'drop-zone-component',
     *   x: 50,
     *   y: 100
     * });
     * ```
     *
     * @see {Domain.ClientWindowDragExitedEvent}
     */
    notifyClientWindowDragExited(event: EventPayload<Domain.ClientWindowDragExitedEvent>): void;

    /**
     * Notifies the host that a client window drag operation has been dropped on a component.
     * This event is triggered when a drag operation completes with a drop action.
     *
     * @param event - The drag drop event containing component and position information
     * @param event.componentId - The ID of the component where the drop occurred
     * @param event.x - The x position where the drop occurred
     * @param event.y - The y position where the drop occurred
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyClientWindowDragDropped({
     *   componentId: 'target-component',
     *   x: 200,
     *   y: 150
     * });
     * ```
     *
     * @see {Domain.ClientWindowDragDroppedEvent}
     */
    notifyClientWindowDragDropped(event: EventPayload<Domain.ClientWindowDragDroppedEvent>): void;

    /**
     * Notifies the host that media has changed or was updated.
     *
     * @param event - The media change event
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyMediaChanged({});
     * ```
     * @see {Domain.MediaChangedEvent}
     */
    notifyMediaChanged(): void;

    /**
     * Sets the properties of a component.
     *
     * @param event - The component properties change event containing the component and properties
     * @param event.componentId - The ID of the component to set the properties of
     * @param event.properties - The new properties of the component
     * @stability development
     *
     * @example
     * ```typescript
     * api.setComponentProperties({
     *   componentId: 'component-123',
     *   properties: { color: 'red' }
     * });
     * ```
     *
     * @see {@link Domain.ComponentPropertiesChangedEvent}
     */
    setComponentProperties<TProps extends Record<string, unknown> = Record<string, unknown>>(
        event: EventPayload<Domain.ComponentPropertiesChangedEvent<TProps>>
    ): void;

    /**
     * Notifies the host that a component has been focused.
     *
     * @param event - The component focus event containing the component ID
     * @param event.componentId - The ID of the component that was focused
     * @stability development
     */
    focusComponent(event: EventPayload<Domain.ComponentFocusedEvent>): void;
    /**
     * Notifies the host that the client configuration has changed.
     *
     * @param event - The client configuration change event containing the new configuration
     * @stability development
     *
     * @example
     * ```typescript
     * api.setClientConfiguration({ ... });
     * ```
     */
    setClientConfiguration(event: EventPayload<Domain.ClientConfigurationChangedEvent>): void;
    /**
     * Notifies the client that a component has been updated.
     *
     * @param event - The component update event containing the component ID, change type, and new value
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyComponentUpdated({
     *   componentId: 'comp-123',
     *   changeType: 'name',
     *   newValue: 'New Component Name'
     * });
     * ```
     */
    notifyComponentUpdated(event: EventPayload<Domain.ComponentUpdatedEvent>): void;
    /**
     * Notifies the client that a component has had it's working/pending state reset.
     *
     * @param event - The component reset event containing the component ID and an optional list of change types to clear.
     *                If no change types are provided, all will be cleared.
     * @stability development
     *
     * @example
     * ```typescript
     * api.notifyComponentReset({
     *   componentId: 'comp-123',
     *   changeTypes: ['properties', 'visibility'],
     * });
     * ```
     */
    notifyComponentReset(event: EventPayload<Domain.ComponentResetEvent>): void;
}
