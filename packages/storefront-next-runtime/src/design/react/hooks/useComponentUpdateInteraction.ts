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
import { useInteraction } from './useInteraction';
import { useMemoObject } from './useMemoObject';
import type { HostToClientConfiguration } from '@/design/messaging-api';
import type { ComponentVisibilityState } from '@/design/react/core/component.types';

export interface ComponentUpdate {
    name?: string;
    visibility?: ComponentVisibilityState;
    properties?: Record<string, unknown>;
}

export interface ComponentUpdateInteraction {
    componentUpdates: Record<string, ComponentUpdate>;
}

function getComponentUpdatesFromComponents(
    components: HostToClientConfiguration['components'],
    seed: Record<string, ComponentUpdate> = {}
): Record<string, ComponentUpdate> {
    return Object.entries(components).reduce(
        (acc, [id, componentInfo]) => {
            acc[id] = {};

            if (componentInfo.name) {
                acc[id].name = seed[id]?.name ?? componentInfo.name;
            }

            if (componentInfo.properties) {
                // Seeded overrides (prior local edits) win over the incoming
                // host config for the same component; `seed[id]` is absent for
                // any component the shopper hasn't locally edited, hence `?.`.
                acc[id].properties = { ...componentInfo.properties, ...seed[id]?.properties };
            }

            if (componentInfo.visibility) {
                acc[id].visibility = seed[id]?.visibility ?? componentInfo.visibility;
            }

            return acc;
        },
        {} as Record<string, ComponentUpdate>
    );
}
/**
 * Custom hook that manages component update state and handles
 * client-host communication for component update events.
 *
 * Listens for ComponentUpdated events from the host and maintains
 * a map of component IDs to their updated data.
 *
 * @returns Component update state
 */
export function useComponentUpdateInteraction(): ComponentUpdateInteraction {
    const { state: componentUpdates } = useInteraction<Record<string, ComponentUpdate>, Record<string, never>>({
        initialState: {},
        eventHandlers: {
            ClientConfigurationChanged: {
                handler: (event, setState) => {
                    // 'reconcile' (default): prior local edits win over the incoming
                    // config, so in-flight edits survive a live sync. 'replace': a
                    // clean slate that drops local overrides, like the handshake.
                    setState((prev) =>
                        event.changeType === 'replace'
                            ? getComponentUpdatesFromComponents(event.components)
                            : getComponentUpdatesFromComponents(event.components, prev)
                    );
                },
            },
            ClientAcknowledged: {
                handler: (event, setState) => {
                    setState(getComponentUpdatesFromComponents(event.components));
                },
            },
            ComponentReset: {
                handler: (event, setState) => {
                    setState((prev) => {
                        if (!prev[event.componentId]) {
                            return prev;
                        }

                        if (!event.changeTypes) {
                            const remainingUpdates = { ...prev };
                            delete remainingUpdates[event.componentId];
                            return remainingUpdates;
                        }

                        const updatedComponent = { ...prev[event.componentId] };
                        event.changeTypes.forEach((type) => delete updatedComponent[type]);

                        return {
                            ...prev,
                            [event.componentId]: updatedComponent,
                        };
                    });
                },
            },
            // Handle runtime component updates
            ComponentUpdated: {
                handler: (event, setState) => {
                    setState((prev) => {
                        const componentId = event.componentId;
                        const existing = prev[componentId] || {};

                        // Update the specific field based on changeType
                        const updated = { ...existing };

                        switch (event.changeType) {
                            case 'name': {
                                updated.name = event.newValue;
                                break;
                            }
                            case 'visibility': {
                                updated.visibility = event.newValue;
                                break;
                            }
                            default:
                                break;
                        }

                        return {
                            ...prev,
                            [componentId]: updated,
                        };
                    });
                },
            },
            // Handle live property edits from the Visual Canvas
            ComponentPropertiesChanged: {
                handler: (event, setState) => {
                    if (!event.properties) {
                        return;
                    }

                    setState((prev) => {
                        const changeType = event.changeType ?? 'partial';
                        const componentId = event.componentId;
                        const existing = prev[componentId] || {};

                        // A 'full' change is the authoritative property set, so we
                        // discard the previous property overrides. Non-property fields
                        // (e.g. `name`) are independent of properties and preserved.
                        let basisProperties: Record<string, unknown> | undefined;
                        let isUnchanged = true;

                        if (changeType === 'partial') {
                            basisProperties = existing.properties;
                            isUnchanged = Object.entries(event.properties).every(([key, value]) =>
                                Object.is(value, basisProperties?.[key])
                            );
                        } else {
                            isUnchanged = false;
                        }

                        if (isUnchanged) {
                            return prev;
                        }

                        const mergedProperties = {
                            ...basisProperties,
                            ...event.properties,
                        };

                        return {
                            ...prev,
                            [componentId]: {
                                ...existing,
                                properties: mergedProperties,
                            },
                        };
                    });
                },
            },
        },
    });

    return useMemoObject({ componentUpdates });
}
