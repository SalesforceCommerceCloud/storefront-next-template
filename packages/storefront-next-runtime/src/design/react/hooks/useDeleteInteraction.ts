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
import type { ComponentDeletedEvent, EventPayload } from '../../messaging-api';
import { useMemoObject } from './useMemoObject';

export interface DeleteInteraction {
    deleteComponent: (componentId: EventPayload<ComponentDeletedEvent>) => void;
}

export function useDeleteInteraction({
    selectedContentLinkUuid,
    setSelectedComponent,
}: {
    selectedContentLinkUuid: string | null;
    setSelectedComponent: (contentLinkUuid: string) => void;
}): DeleteInteraction {
    const { deleteComponent } = useInteraction({
        initialState: null,
        eventHandlers: {},
        actions: (_state, _setState, clientApi) => ({
            deleteComponent: (event: EventPayload<ComponentDeletedEvent>) => {
                clientApi?.deleteComponent(event);

                // When a component is deleted, we want to make sure it's no longer selected.
                if (selectedContentLinkUuid === event.contentLinkUuid) {
                    setSelectedComponent('');
                }
            },
        }),
    });

    return useMemoObject({ deleteComponent });
}
