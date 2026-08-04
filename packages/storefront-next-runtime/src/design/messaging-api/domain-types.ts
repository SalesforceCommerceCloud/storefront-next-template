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
import type { ShopperExperience } from '@/scapi-client/types';

/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

interface WithBaseEvent {
    eventType: string;
    // Add any properties that apply to all events
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

export interface HostToClientConfiguration {
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
export type DefaultForwardedKeys = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Delete';

/**
 * Information about a component on the page.
 */
export interface ComponentInfo {
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
export interface RegionInfo {
    /**
     * The custom name for the region.
     */
    name: string;
}

/**
 * Information about a component type.
 */
export interface ComponentType {
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

/// ////////////////////////////////////////////////////////////////
/// Host Events - Events that are subscribed to on the host side. //
/// ////////////////////////////////////////////////////////////////

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
export interface ClientInitializedEvent extends WithBaseEvent {
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
    // Put any client-specific config here
}

export interface ClientReady extends WithBaseEvent {
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
export interface ClientDisconnectedEvent extends WithBaseEvent {
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
export interface ClientPageChangedEvent extends WithBaseEvent {
    eventType: 'ClientPageChanged';
    /**
     * The page data from the client.
     */
    page: ShopperExperience.schemas['Page'];
}

/// /////////////////////////////////////////////////////////////////
// Client Events - Events that are subscribed on the client side. //
/// /////////////////////////////////////////////////////////////////

/**
 * Emits when the host disconnects from the client.
 * @target client
 * @group Events
 */
export interface HostDisconnected extends WithBaseEvent {
    eventType: 'HostDisconnected';
}

/**
 * Emits from the host to the client to acknowledge that the client has been initialized.
 * This event must be received by the client before any other events can be emitted from the client.
 * @target client
 * @group Events
 */
export interface ClientAcknowledgedEvent extends WithBaseEvent, HostToClientConfiguration {
    eventType: 'ClientAcknowledged';
}

/**
 * Emits when the client configuration changes from the host since the last ClientAcknowledgedEvent.
 * @target client
 * @group Events
 */
export interface ClientConfigurationChangedEvent extends WithBaseEvent, HostToClientConfiguration {
    eventType: 'ClientConfigurationChanged';
}

/**
 * Emits when a component is updated in the editor.
 *
 * @target client
 * @group Events
 */
export interface ComponentUpdatedEvent extends WithBaseEvent {
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
export interface ClientWindowDragEnteredEvent extends WithBaseEvent, WithComponentType {
    eventType: 'ClientWindowDragEntered';
}
/**
 * Emits when dragging from the host moves over the client window.
 * @target client
 * @group Events
 */
export interface ClientWindowDragMovedEvent extends WithBaseEvent, WithClientVector, WithComponentType {
    eventType: 'ClientWindowDragMoved';
}
/**
 * Emits when dragging from the host exits the client window.
 * @target client
 * @group Events
 */
export interface ClientWindowDragExitedEvent extends WithBaseEvent, WithComponentType {
    eventType: 'ClientWindowDragExited';
}
/**
 * Emits when dragging from the host is released over the client window.
 * @target client
 * @group Events
 */
export interface ClientWindowDragDroppedEvent extends WithBaseEvent, WithComponentType, WithFragmentId {
    eventType: 'ClientWindowDragDropped';
}
/**
 * Emits when a component's properties change.
 * @target client
 * @group Events
 */
export interface ComponentPropertiesChangedEvent<TProps extends Record<string, unknown> = Record<string, unknown>>
    extends WithBaseEvent,
        WithComponentId {
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
export interface ComponentFocusedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
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
export interface HostKeyPressedEvent<TKey extends string = DefaultForwardedKeys> extends WithBaseEvent {
    eventType: 'HostKeyPressed';
    key: TKey;
}
/**
 * Emits when the page settings are modified within the host.
 * @target client
 * @group Events
 */
export interface PageSettingsChangedEvent<TSettings extends Record<string, unknown> = Record<string, unknown>>
    extends WithBaseEvent {
    eventType: 'PageSettingsChanged';
    settings: TSettings;
}
/**
 * Emits when the media is changed on the host.
 * Media would include images, videos, style sheets, etc.
 * @target client
 * @group Events
 */
export interface MediaChangedEvent extends WithBaseEvent {
    eventType: 'MediaChanged';
}

/// ////////////////////////////////////////////////////////////////////////////
// Isomorphic Events - Events that are subscribed to on both client and host side. //
/// ////////////////////////////////////////////////////////////////////////////

/**
 * Emits when the clients window is scrolled.
 * @target host
 * @group Events
 */
export interface WindowScrollChangedEvent extends WithBaseEvent {
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
export interface ComponentMovedToRegionEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
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
export interface ComponentHoveredInEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
    eventType: 'ComponentHoveredIn';
}
/**
 * Emits when a component is hovered out of.
 * @target isomorphic
 * @group Events
 */
export interface ComponentHoveredOutEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
    eventType: 'ComponentHoveredOut';
}
/**
 * Emits when a component is selected.
 * @target isomorphic
 * @group Events
 */
export interface ComponentSelectedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
    eventType: 'ComponentSelected';
}
/**
 * Emits when a component is deselected.
 * @target isomorphic
 * @group Events
 */
export interface ComponentDeselectedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
    eventType: 'ComponentDeselected';
}
/**
 * Emits when a component is deleted.
 * @target isomorphic
 * @group Events
 */
export interface ComponentDeletedEvent extends WithBaseEvent, WithComponentId, WithContentLinkUuid {
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
export interface ComponentAddedToRegionEvent<TProps extends Record<string, unknown> = Record<string, unknown>>
    extends WithBaseEvent,
        WithFragmentId {
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
export interface ComponentDragStartedEvent extends WithBaseEvent, WithFragmentId {
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
export interface ErrorEvent extends WithBaseEvent {
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
