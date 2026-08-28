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
    selectedContentLinkUuid: string;
    setSelectedComponent: (contentLinkUuid: string) => void;
}

/**
 * Custom hook that manages component selection state and handles
 * client-host communication for selection events.
 *
 * @returns Selection state and interaction methods
 */
export function useSelectInteraction({
    contentLinkMap,
}: {
    contentLinkMap: Record<string, string>;
}): SelectInteraction {
    const { state: selectedContentLinkUuid, setSelectedComponent } = useInteraction({
        initialState: '',
        eventHandlers: {
            ComponentSelected: {
                handler: (event, setState) => {
                    setState(event.contentLinkUuid);
                },
            },
            ComponentDeselected: {
                handler: (_, setState) => {
                    setState('');
                },
            },
        },
        actions: (_state, setState, clientApi) => ({
            setSelectedComponent: (contentLinkUuid: string) => {
                setState(contentLinkUuid);
                clientApi?.selectComponent({
                    componentId: contentLinkMap[contentLinkUuid] ?? '',
                    contentLinkUuid,
                });
            },
        }),
    });

    return useMemoObject({
        selectedContentLinkUuid,
        setSelectedComponent,
    });
}
