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
    hoveredContentLinkUuid: string | null;
    setHoveredComponent: (componentUuid: string | null) => void;
}

/**
 * Custom hook that manages component hover state and handles
 * client-host communication for hover events.
 *
 * @returns Hover state and interaction methods
 */
export function useHoverInteraction({ contentLinkMap }: { contentLinkMap: Record<string, string> }): HoverInteraction {
    const { state: hoveredContentLinkUuid, setHoveredComponent } = useInteraction({
        initialState: null as string | null,
        eventHandlers: {
            ComponentHoveredIn: {
                handler: (event, setState) => setState(event.contentLinkUuid),
            },
            ComponentHoveredOut: {
                handler: (_, setState) => setState(null),
            },
        },
        actions: (state, setState, clientApi) => ({
            setHoveredComponent: (componentUuid: string | null) => {
                if (state && componentUuid !== state) {
                    clientApi?.hoverOutOfComponent({
                        componentId: contentLinkMap[state] ?? state,
                        contentLinkUuid: state,
                    });
                }

                if (componentUuid && componentUuid !== state) {
                    clientApi?.hoverInToComponent({
                        componentId: contentLinkMap[componentUuid] ?? null,
                        contentLinkUuid: componentUuid,
                    });
                }

                setState(componentUuid);
            },
        }),
    });

    return useMemoObject({
        hoveredContentLinkUuid,
        setHoveredComponent,
    });
}
