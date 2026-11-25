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

export interface HoverInteraction {
    hoveredComponentUuid: string | null;
    setHoveredComponent: (componentUuid: string | null) => void;
}

/**
 * Custom hook that manages component hover state and handles
 * client-host communication for hover events.
 *
 * @returns Hover state and interaction methods
 */
export function useHoverInteraction({
    componentByUuid,
}: {
    componentByUuid: Record<string, { componentId: string; contentLinkUuid: string }>;
}): HoverInteraction {
    const { state: hoveredComponentUuid, setHoveredComponent } = useInteraction({
        initialState: null as string | null,
        eventHandlers: {
            ComponentHoveredIn: {
                handler: (event, setState) => setState(event.componentUuid),
            },
            ComponentHoveredOut: {
                handler: (_, setState) => setState(null),
            },
        },
        actions: (state, setState, clientApi) => ({
            setHoveredComponent: (componentUuid: string | null) => {
                if (state && componentUuid !== state) {
                    const component = componentByUuid[state];
                    clientApi?.hoverOutOfComponent({
                        componentId: component?.componentId ?? '',
                        contentLinkUuid: component?.contentLinkUuid ?? '',
                        componentUuid: state,
                    });
                }

                if (componentUuid && componentUuid !== state) {
                    const component = componentByUuid[componentUuid];
                    clientApi?.hoverInToComponent({
                        componentId: component?.componentId ?? '',
                        contentLinkUuid: component?.contentLinkUuid ?? '',
                        componentUuid,
                    });
                }

                setState(componentUuid);
            },
        }),
    });

    return useMemoObject({
        hoveredComponentUuid,
        setHoveredComponent,
    });
}
