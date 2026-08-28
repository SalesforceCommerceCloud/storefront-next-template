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

export interface FocusInteraction {
    focusedContentLinkUuid: string | null;
    focusComponent: (node: Element) => void;
}

export function useFocusInteraction({
    setSelectedComponent,
}: {
    setSelectedComponent: (contentLinkUuid: string) => void;
}): FocusInteraction {
    const { state: focusedContentLinkUuid, focusComponent } = useInteraction({
        initialState: null as string | null,
        eventHandlers: {
            ComponentFocused: {
                handler: (event, setState) => {
                    setSelectedComponent('');
                    setState(event.contentLinkUuid);
                },
            },
        },
        actions: (_state, setState) => ({
            focusComponent: (node: Element) => {
                node.scrollIntoView();
                setState(null);
            },
        }),
    });

    return useMemoObject({
        focusedContentLinkUuid,
        focusComponent,
    });
}
