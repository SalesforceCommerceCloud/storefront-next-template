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

export interface SelectInteraction {
    selectedComponentUuid: string;
    setSelectedComponent: (componentUuid: string) => void;
}

/**
 * Custom hook that manages component selection state and handles
 * client-host communication for selection events.
 *
 * @returns Selection state and interaction methods
 */
export function useSelectInteraction({
    componentByUuid,
}: {
    componentByUuid: Record<string, { componentId: string; contentLinkUuid: string }>;
}): SelectInteraction {
    const { state: selectedComponentUuid, setSelectedComponent } = useInteraction({
        initialState: '',
        eventHandlers: {
            ComponentSelected: {
                handler: (event, setState) => {
                    setState(event.componentUuid);
                },
            },
            ComponentDeselected: {
                handler: (_, setState) => {
                    setState('');
                },
            },
        },
        actions: (_state, setState, clientApi) => ({
            setSelectedComponent: (componentUuid: string) => {
                setState(componentUuid);
                const component = componentByUuid[componentUuid];
                clientApi?.selectComponent({
                    componentId: component?.componentId ?? '',
                    contentLinkUuid: component?.contentLinkUuid ?? '',
                    componentUuid,
                });
            },
        }),
    });

    return useMemoObject({
        selectedComponentUuid,
        setSelectedComponent,
    });
}
