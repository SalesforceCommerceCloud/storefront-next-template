import { r as ShopperExperience } from "./types2.js";

//#region src/design/messaging-api/domain-types.d.ts

interface WithBaseEvent {
  eventType: string;
}
/**
 * @inline
 * @hidden
 */
interface WithComponentId {
  /**
   * The id of the component that the event is related to.
   */
  componentId: string;
}
interface WithContentLinkUuid {
  /**
   * The content link UUID of the component.
   */
  contentLinkUuid: string;
}
interface WithComponentType {
  /**
   * The component type that the event is related to.
   */
  componentType: string;
}
interface WithFragmentId {
  /**
   * The id of the fragment that the event is related to.
   * Fragments are reusable component instances that can be placed in multiple locations.
   */
  fragmentId?: string;
}
/**
 * @inline
 * @hidden
 */
interface WithClientVector {
  /**
   * The x position of the event.
   * The position is relative to the client window and does not take any scrolling into account.
   */
  x: number;
  /**
   * The y position of the event.
   * The position is relative to the client window and does not take any scrolling into account.
   */
  y: number;
}
interface HostToClientConfiguration {
  /**
   * The components by id that are in the component tree.
   */
  components: Record<string, ComponentInfo>;
  /**
   * A map of component types by id.
   */
  componentTypes: Record<string, ComponentType>;
  /**
   * A map of labels by translation key. These labels will be in the locale of the user.
   */
  labels: Record<string, string>;
  /**
   * The locale to use on the client.
   */
  locale?: string;
  /**
   * The regions by id that are available in the component tree.
   */
  regions: Record<string, RegionInfo>;
}
/**
 * The default keys that are forwarded from the host to the client.
 * @hidden
 */
type DefaultForwardedKeys = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Delete';
/**
 * Information about a component on the page.
 */
interface ComponentInfo {
  /**
   *  The unique id of the component.
   */
  id: string;
  /**
   * The component type.
   */
  type: string;
  /**
   * The custom name for the component.
   */
  name?: string;
}
/**
 * Information about a region in the component tree.
 */
interface RegionInfo {
  /**
   * The custom name for the region.
   */
  name: string;
}
/**
 * Information about a component type.
 */
interface ComponentType {
  /**
   * The unique id of the component type.
   */
  id: string;
  /**
   * The name of the component type.
   */
  name: string;
  /**
   * The image of the component type.
   */
  image: string;
  /**
   * The label for the component type.
   */
  label: string;
}
/**
 * Emitted by the client to establish a connection with the host.
 * This event should be emitted by the client on an interval until a ClientAcknowledgedEvent is received from the host.
 *
 * - If there is already a registered client with the host with the same client name,
 *   the old client will be replaced with the new one.
 * - If there is already a registered client with the host with a different client id,
 *   an error will be thrown.
 *
 * A client is a 1 to 1 with a host.
 *
 * ```mermaid
 * sequenceDiagram
 *     Client->>Host: ClientInitializedEvent
 *     Host->>Client: ClientAcknowledgedEvent
 *     Client->>Host: ClientReadyEvent
 *     activate Client
 *     Client->>Host: ComponentSelectedEvent
 *     Host->>Client: ComponentPropertiesChangedEvent
 * ```
 *
 * If the host is not ready to register the client, the client should retry at an interval until the host is ready.
 *
 * ```mermaid
 * sequenceDiagram
 *     Client-->>Host: ClientInitializedEvent
 *     Client-->>Host: ClientInitializedEvent
 *     Client->>Host: ClientInitializedEvent
 *     Host->>Client: ClientAcknowledgedEvent
 *     Client->>Host: ClientReadyEvent
 *     activate Client
 *     Client->>Host: ComponentSelectedEvent
 *     Host->>Client: ComponentPropertiesChangedEvent
 * ```
 *
 * @see {ClientAcknowledgedEvent}
 * @target host
 * @group Events
 */
interface ClientInitializedEvent extends WithBaseEvent {
  eventType: 'ClientInitialized';
  /**
   * The id to use for the client.
   */
  clientId: string;
  /**
   * The keys that are forwarded from the host to the client.
   */
  forwardedKeys?: string[];
  /**
   * The user session ID.
   */
  usid?: string;
}
interface ClientReady extends WithBaseEvent {
  eventType: 'ClientReady';
  /**
   * The id to use for the client.
   */
  clientId: string;
}
/**
 * Emits when a client disconnects from the host.
 * This event may not fire depending on the circumstances of the disconnect.
 * For example, if a crash occurs in the client environment, the event may not fire.
 * @target host
 * @group Events
 */
interface ClientDisconnectedEvent extends WithBaseEvent {
  eventType: 'ClientDisconnected';
  /**
   * The id of the client that disconnected.
   */
  clientId: string;
  /**
   * Whether the client is attempting to reconnect to the host.
   * This occurs when the client as a configuration change.
   */
  reconnect: boolean;
}
/**
 * Emits when the components in the client configuration change.
 * @target client
 * @group Events
 */
interface ClientPageChangedEvent extends WithBaseEvent {
  eventType: 'ClientPageChanged';
  /**
   * The page data from the client.
   */
  page: ShopperExperience.schemas['Page'];
}
/**
 * Emits when the host disconnects from the client.
 * @target client
 * @group Events
 */
interface HostDisconnected extends WithBaseEvent {
  eventType: 'HostDisconnected';
}
/**
 * Emits from the host to the client to acknowledge that the client has been initialized.
 * This event must be received by the client before any other events can be emitted from the client.
 * @target client
 * @group Events
 */
interface ClientAcknowledgedEvent extends WithBaseEvent, HostToClientConfiguration {
  eventType: 'ClientAcknowledged';
}
/**
 * Emits when the client configuration changes from the host since the last ClientAcknowledgedEvent.
 * @target client
 * @group Events
 */
interface ClientConfigurationChangedEvent extends WithBaseEvent, HostToClientConfiguration {
  eventType: 'ClientConfigurationChanged';
}
/**
 * Emits when a component is updated in the editor.
 *
 * @target client
 * @group Events
 */
interface ComponentUpdatedEvent extends WithBaseEvent {
  eventType: 'ComponentUpdated';
  /**
   * The unique identifier of the component
   */
  componentId: string;
  /**
   * The type of change that occurred
   */
  changeType: 'name' | 'visibility';
  /**
   * The new value after the change
   */
  newValue: unknown;
  /**
   * The old value before the change (optional)
   */
  oldValue?: unknown;
}
/**
 * Emits when dragging from the host enters the client window.
 * @target client
 * @group Events
 */
interface ClientWindowDragEnteredEvent extends WithBaseEvent, WithComponentType {
  eventType: 'ClientWindowDragEntered';
}
/**
 * Emits when dragging from the host moves over the client window.
 * @target client
 * @group Events
 */
interface ClientWindowDragMovedEvent extends WithBaseEvent, WithClientVector, WithComponentType {
  eventType: 'ClientWindowDragMoved';
}
/**
 * Emits when dragging from the host exits the client window.
 * @target client
 * @group Events
 */
interface ClientWindowDragExitedEvent extends WithBaseEvent, WithComponentType {
  eventType: 'ClientWindowDragExited';
}
/**
 * Emits when dragging from the host is released over the client window.
 * @target client
 * @group Events
 */
interface ClientWindowDragDroppedEvent extends WithBaseEvent, WithComponentType, WithFragmentId {
  eventType: 'ClientWindowDragDropped';
}
/**
 * Emits when a component's properties change.
 * @target client
 * @group Events
 */
interface ComponentPropertiesChangedEvent<TProps extends Record<string, unknown> = Record<string, unknown>> extends WithBaseEvent, WithComponentId {
  eventType: 'ComponentPropertiesChanged';
  /**
   * The new properties of the component.
   */
  properties: TProps;
}
/**
 * Emits when a component is focused.
 * @target client
 * @group Events
 */
interface ComponentFocusedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentFocused';
}
/**
 * Event emitted from the host to the client when a key is pressed.
 * Used to forward keypress events from the host environment to the client.
 *
 * @template TKey - The type of key being forwarded.
 * @target client
 * @group Events
 */
interface HostKeyPressedEvent<TKey extends string = DefaultForwardedKeys> extends WithBaseEvent {
  eventType: 'HostKeyPressed';
  key: TKey;
}
/**
 * Emits when the page settings are modified within the host.
 * @target client
 * @group Events
 */
interface PageSettingsChangedEvent<TSettings extends Record<string, unknown> = Record<string, unknown>> extends WithBaseEvent {
  eventType: 'PageSettingsChanged';
  settings: TSettings;
}
/**
 * Emits when the media is changed on the host.
 * Media would include images, videos, style sheets, etc.
 * @target client
 * @group Events
 */
interface MediaChangedEvent extends WithBaseEvent {
  eventType: 'MediaChanged';
}
/**
 * Emits when the clients window is scrolled.
 * @target host
 * @group Events
 */
interface WindowScrollChangedEvent extends WithBaseEvent {
  eventType: 'WindowScrollChanged';
  /**
   * The horizontal scroll position of the window.
   */
  scrollX?: number;
  /**
   * The vertical scroll position of the window.
   */
  scrollY?: number;
}
/**
 * Emits when a component is moved to a different region of a component.
 * @target isomorphic
 * @group Events
 */
interface ComponentMovedToRegionEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentMovedToRegion';
  /**
   * The id of the component that comes before the insert component.
   */
  beforeComponentId?: string;
  /**
   * The id of the component that comes after the insert component.
   */
  afterComponentId?: string;
  /**
   * The id of the component this component should be inserted before or after.
   * If not provided, then it is up to the host to determine where in the target region this is inserted.
   */
  insertComponentId?: string;
  /**
   * When an insertComponentId is provided, this will insert the new component before or after the component with that component id.
   */
  insertType?: 'before' | 'after';
  /**
   * The id of the component that owns the region this component is being moved to.
   */
  targetComponentId: string;
  /**
   * The id of the region that the component is being moved to.
   */
  targetRegionId: string;
  /**
   * The region that the component is being moved from.
   */
  sourceRegionId: string;
}
/**
 * Emits when a component is hovered over.
 * @target isomorphic
 * @group Events
 */
interface ComponentHoveredInEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentHoveredIn';
}
/**
 * Emits when a component is hovered out of.
 * @target isomorphic
 * @group Events
 */
interface ComponentHoveredOutEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentHoveredOut';
}
/**
 * Emits when a component is selected.
 * @target isomorphic
 * @group Events
 */
interface ComponentSelectedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentSelected';
}
/**
 * Emits when a component is deselected.
 * @target isomorphic
 * @group Events
 */
interface ComponentDeselectedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentDeselected';
}
/**
 * Emits when a component is deleted.
 * @target isomorphic
 * @group Events
 */
interface ComponentDeletedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
  eventType: 'ComponentDeleted';
  /**
   * The id of the component that the component was deleted from.
   */
  sourceComponentId: string;
  /**
   * The region that the component was deleted from.
   */
  sourceRegionId: string;
}
/**
 * Emits when a component is added to a region of a component.
 * @template TProps - The type of the component properties.
 * @target isomorphic
 * @group Events
 */
interface ComponentAddedToRegionEvent<TProps extends Record<string, unknown> = Record<string, unknown>> extends WithBaseEvent, WithFragmentId {
  eventType: 'ComponentAddedToRegion';
  /**
   * The specifier of the component to add.
   * This will be used to lookup the component in the registry.
   */
  componentType: string;
  /**
   * The properties of the component to add.
   * These will be used to initialize the component.
   */
  componentProperties: TProps;
  /**
   * The id of the component that owns the region this component is being added to.
   */
  targetComponentId: string;
  /**
   * The id of the region that the component is being added to.
   */
  targetRegionId: string;
  /**
   * When an insertComponentId is provided, this will insert the new component before or after the component with that component id.
   */
  insertType?: 'before' | 'after';
  /**
   * The id of the component this component should be inserted before or after.
   * If not provided, then it is up to the host to determine where in the target region this is inserted.
   */
  insertComponentId?: string;
  /**
   * The id of the component that comes before the insert component.
   */
  beforeComponentId?: string;
  /**
   * The id of the component that comes after the insert component.
   */
  afterComponentId?: string;
}
/**
 * Emits when a component drag starts from the host or client.
 * @target isomorphic
 * @group Events
 */
interface ComponentDragStartedEvent extends WithBaseEvent, WithFragmentId {
  eventType: 'ComponentDragStarted';
  /**
   * The type of the component that is being dragged.
   */
  componentType: string;
}
/**
 * Emits when an error occurs.
 * @target isomorphic
 * @group Events
 */
interface ErrorEvent extends WithBaseEvent {
  eventType: 'Error';
  /**
   * The error message.
   */
  message: string;
  /**
   * TODO: Add error codes if we need the app to recover from the error.
   * Add once scenarios are defined.
   */
  code?: unknown;
}
//#endregion
//#region src/design/messaging-api/api-types.d.ts
type Source = 'host' | 'client';
/**
 * A type that adds metadata to an event.
 * @inline
 * @expand
 * @hidden
 */
interface WithMeta {
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
type EventPayload<TEvent> = Omit<TEvent, 'eventType' | 'meta'>;
/**
 * The mapping of events, emitted on the host and client, to their corresponding event and API name.
 * @hidden
 */
interface IsomorphicEventNameMapping {
  ComponentDragStarted: ComponentDragStartedEvent;
  ComponentHoveredIn: ComponentHoveredInEvent;
  ComponentHoveredOut: ComponentHoveredOutEvent;
  ComponentSelected: ComponentSelectedEvent;
  ComponentDeselected: ComponentDeselectedEvent;
  ComponentAddedToRegion: ComponentAddedToRegionEvent;
  ComponentDeleted: ComponentDeletedEvent;
  ComponentMovedToRegion: ComponentMovedToRegionEvent;
  WindowScrollChanged: WindowScrollChangedEvent;
  Error: ErrorEvent;
}
/**
 * The mapping of host events, emitted on the host, to their corresponding event and API name.
 * @hidden
 */
interface HostEventNameMapping extends IsomorphicEventNameMapping {
  ClientInitialized: ClientInitializedEvent;
  ClientReady: ClientReady;
  ClientDisconnected: ClientDisconnectedEvent;
  ClientPageChanged: ClientPageChangedEvent;
}
/**
 * The mapping of client events to their corresponding event.
 * @hidden
 */
interface ClientEventNameMapping extends IsomorphicEventNameMapping {
  HostDisconnected: HostDisconnected;
  PageSettingsChanged: PageSettingsChangedEvent;
  HostKeyPressed: HostKeyPressedEvent;
  ClientAcknowledged: ClientAcknowledgedEvent;
  ClientConfigurationChanged: ClientConfigurationChangedEvent;
  ComponentUpdated: ComponentUpdatedEvent;
  ClientWindowDragEntered: ClientWindowDragEnteredEvent;
  ClientWindowDragMoved: ClientWindowDragMovedEvent;
  ClientWindowDragExited: ClientWindowDragExitedEvent;
  ClientWindowDragDropped: ClientWindowDragDroppedEvent;
  ComponentPropertiesChanged: ComponentPropertiesChangedEvent;
  MediaChangedEvent: MediaChangedEvent;
  ComponentFocused: ComponentFocusedEvent;
}
/**
 * @hidden
 */
type ClientMessage = ClientEventNameMapping[keyof ClientEventNameMapping];
/**
 * @hidden
 */
type HostMessage = HostEventNameMapping[keyof HostEventNameMapping];
/**
 * @hidden
 */
type EventTypeName = keyof HostEventNameMapping | keyof ClientEventNameMapping;
/**
 * @inline
 * @expand
 * @hidden
 */
type WithEventType<TMapping, TEvent extends keyof TMapping = keyof TMapping> = {
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
type EventHandler<TMapping, TEvent extends keyof TMapping = keyof TMapping, TPartial = false> = (event: TPartial extends true ? Readonly<Partial<WithMeta & WithEventType<TMapping, TEvent> & TMapping[TEvent]>> : Readonly<WithMeta & WithEventType<TMapping, TEvent> & TMapping[TEvent]>) => unknown;
/**
 * An emitter that will perform the underlying communication with the client or host.
 */
interface MessageEmitter<TInMapping, TOutMapping> {
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
interface IsomorphicConfiguration {
  /**
   * The id of the client.
   */
  id: string;
  /**
   * A logger for logging all messages.
   */
  logger?: (message: unknown, source: 'host' | 'client') => void;
}
interface ClientConfiguration extends IsomorphicConfiguration {
  /**
   * The underlying message emitter that will be used to send events.
   */
  emitter: MessageEmitter<ClientEventNameMapping, HostEventNameMapping>;
  /**
   * The keys that are forwarded from the host to the client.
   */
  forwardedKeys?: string[];
}
interface HostConfiguration extends IsomorphicConfiguration {
  /**
   * The underlying message emitter that will be used to send events.
   */
  emitter: MessageEmitter<HostEventNameMapping, ClientEventNameMapping>;
}
/**
 * @inline
 * @hidden
 */
interface IsomorphicApi {
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
  startComponentDrag(event: EventPayload<ComponentDragStartedEvent>): void;
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
  moveComponentToRegion(event: EventPayload<ComponentMovedToRegionEvent>): void;
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
  hoverInToComponent(event: EventPayload<ComponentHoveredInEvent>): void;
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
  hoverOutOfComponent(event: EventPayload<ComponentHoveredOutEvent>): void;
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
  selectComponent(event: EventPayload<ComponentSelectedEvent>): void;
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
  deselectComponent(event: EventPayload<ComponentDeselectedEvent>): void;
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
  addComponentToRegion(event: EventPayload<ComponentAddedToRegionEvent>): void;
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
  deleteComponent(event: EventPayload<ComponentDeletedEvent>): void;
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
  notifyError(event: EventPayload<ErrorEvent>): void;
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
  notifyWindowScrollChanged(event: Partial<EventPayload<WindowScrollChangedEvent>>): void;
  /**
   * Gets the id of the remote side of the connection.
   * @returns The id of the remote side of the connection.
   */
  getRemoteId(): string | undefined;
}
interface ClientApi extends IsomorphicApi {
  /**
   * Disconnects the client from the host.
   * @param options - Optional configuration for the disconnection process
   * @param options.isReconnecting - Whether the client is attempting to reconnect to the host.
   */
  disconnect(options?: {
    isReconnecting?: boolean;
  }): void;
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
    onHostConnected?: (event: HostToClientConfiguration) => void;
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
  notifyClientReady(event: EventPayload<ClientReady>): void;
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
  notifyClientPageChanged(event: EventPayload<ClientPageChangedEvent>): void;
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
  on<TEvent extends keyof ClientEventNameMapping>(event: TEvent, handler: (handlerEvent: Readonly<WithMeta & ClientEventNameMapping[TEvent]>) => void): () => void;
  on(event: 'Event', handler: (handlerEvent: Readonly<WithMeta & ClientMessage>) => void): () => void;
}
/**
 * A function that returns a promise that resolves to the client acknowledged event.
 * This is used to configure the client when it is initialized.
 */
type ConfigFactory = () => Promise<EventPayload<ClientAcknowledgedEvent>>;
interface HostApi extends IsomorphicApi {
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
  on<TEvent extends keyof HostEventNameMapping>(event: TEvent, handler: (handlerEvent: Readonly<WithMeta & HostEventNameMapping[TEvent]>) => void): () => void;
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
  notifyPageSettingsChanged(event: EventPayload<PageSettingsChangedEvent>): void;
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
  forwardKeyPress(event: EventPayload<HostKeyPressedEvent>): void;
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
  notifyClientWindowDragEntered(event: EventPayload<ClientWindowDragEnteredEvent>): void;
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
  notifyClientWindowDragMoved(event: EventPayload<ClientWindowDragMovedEvent>): void;
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
  notifyClientWindowDragExited(event: EventPayload<ClientWindowDragExitedEvent>): void;
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
  notifyClientWindowDragDropped(event: EventPayload<ClientWindowDragDroppedEvent>): void;
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
  setComponentProperties<TProps extends Record<string, unknown> = Record<string, unknown>>(event: EventPayload<ComponentPropertiesChangedEvent<TProps>>): void;
  /**
   * Notifies the host that a component has been focused.
   *
   * @param event - The component focus event containing the component ID
   * @param event.componentId - The ID of the component that was focused
   * @stability development
   */
  focusComponent(event: EventPayload<ComponentFocusedEvent>): void;
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
  setClientConfiguration(event: EventPayload<ClientConfigurationChangedEvent>): void;
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
  notifyComponentUpdated(event: EventPayload<ComponentUpdatedEvent>): void;
}
//#endregion
//#region src/design/messaging-api/client.d.ts
/**
 * Factory function to create a ClientApi instance.
 *
 * @public
 * @param _config - Configuration object for the client API (currently unused).
 * @returns {ClientApi} An instance of the ClientApi interface.
 */
declare function createClientApi({
  emitter,
  id,
  forwardedKeys,
  logger
}: ClientConfiguration): ClientApi;
//#endregion
//#region src/design/messaging-api/host.d.ts
/**
 * Factory function to create a HostApi instance.
 *
 * @public
 * @param {HostConfiguration} config - Configuration object for the host API.
 * @returns {HostApi} An instance of the HostApi interface.
 */
declare function createHostApi({
  emitter,
  id,
  logger
}: HostConfiguration): HostApi;
//#endregion
export { WindowScrollChangedEvent as $, ClientWindowDragExitedEvent as A, ComponentMovedToRegionEvent as B, ClientConfigurationChangedEvent as C, ClientReady as D, ClientPageChangedEvent as E, ComponentDragStartedEvent as F, DefaultForwardedKeys as G, ComponentSelectedEvent as H, ComponentFocusedEvent as I, HostKeyPressedEvent as J, ErrorEvent as K, ComponentHoveredInEvent as L, ComponentAddedToRegionEvent as M, ComponentDeletedEvent as N, ClientWindowDragDroppedEvent as O, ComponentDeselectedEvent as P, RegionInfo as Q, ComponentHoveredOutEvent as R, ClientAcknowledgedEvent as S, ClientInitializedEvent as T, ComponentType as U, ComponentPropertiesChangedEvent as V, ComponentUpdatedEvent as W, MediaChangedEvent as X, HostToClientConfiguration as Y, PageSettingsChangedEvent as Z, IsomorphicEventNameMapping as _, ClientEventNameMapping as a, WithEventType as b, EventHandler as c, HostApi as d, HostConfiguration as f, IsomorphicConfiguration as g, IsomorphicApi as h, ClientConfiguration as i, ClientWindowDragMovedEvent as j, ClientWindowDragEnteredEvent as k, EventPayload as l, HostMessage as m, createClientApi as n, ClientMessage as o, HostEventNameMapping as p, HostDisconnected as q, ClientApi as r, ConfigFactory as s, createHostApi as t, EventTypeName as u, MessageEmitter as v, ClientDisconnectedEvent as w, WithMeta as x, Source as y, ComponentInfo as z };
//# sourceMappingURL=index.d.ts.map