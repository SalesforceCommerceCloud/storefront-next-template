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

export interface ScrollInteraction {
    notifyWindowScrollChange: (x: number, y: number) => void;
}

/**
 * Custom hook that manages component hover state and handles
 * client-host communication for hover events.
 *
 * @returns Hover state and interaction methods
 */
export function useScrollInteraction(): ScrollInteraction {
    const { notifyWindowScrollChange } = useInteraction({
        initialState: null,
        eventHandlers: {
            WindowScrollChanged: {
                handler: (event) => {
                    if (event.scrollY != null) {
                        window.scrollTo({
                            behavior: 'instant',
                            top: event.scrollY,
                        });
                    }
                },
            },
        },
        actions: (_state, _setState, clientApi) => ({
            notifyWindowScrollChange: (x: number, y: number) => {
                clientApi?.notifyWindowScrollChanged({
                    scrollX: x,
                    scrollY: y,
                });
            },
        }),
    });

    return useMemoObject({
        notifyWindowScrollChange,
    });
}
