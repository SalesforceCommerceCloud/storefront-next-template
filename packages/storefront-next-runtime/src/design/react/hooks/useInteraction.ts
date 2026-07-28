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
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ClientApi, ClientEventNameMapping } from '../../messaging-api';
import { useDesignContext } from '../context/DesignContext';

export interface EventHandler<TState, TName extends keyof ClientEventNameMapping> {
    handler: (event: ClientEventNameMapping[TName], setState: Dispatch<SetStateAction<TState>>) => void;
}

export interface InteractionConfig<TState, TActions> {
    /** Initial state value */
    initialState: TState | (() => TState);
    /** Event handlers to register with the client API */
    eventHandlers?: {
        [TKey in keyof ClientEventNameMapping]?: EventHandler<TState, TKey>;
    };
    /** Action creators that return functions to interact with the client API */
    actions?: (state: TState, setState: Dispatch<SetStateAction<TState>>, clientApi: ClientApi | null) => TActions;
}

/**
 * Base hook that provides common interaction patterns for design-time functionality.
 * Reduces boilerplate by handling state management, event listeners, and cleanup.
 *
 * @param config - Configuration object defining the interaction behavior
 * @returns Object containing state and action methods
 */
export function useInteraction<
    TState,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    TActions extends Record<string, (...args: any[]) => any>,
>(config: InteractionConfig<TState, TActions>): { state: TState } & TActions {
    const [state, setState] = useState<TState>(config.initialState);
    const { isDesignMode, clientApi } = useDesignContext();

    useEffect(() => {
        if (!isDesignMode || !clientApi) {
            return () => {
                // Return empty cleanup function for consistency
            };
        }

        const unsubscribeFunctions = Object.entries(config.eventHandlers ?? {}).map(([eventName, entry]) =>
            clientApi.on(eventName as keyof ClientEventNameMapping, (event) =>
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                entry.handler(event as any, setState)
            )
        );

        return () => {
            unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
        };
    }, [isDesignMode, clientApi, config.eventHandlers]);

    const actions = config.actions?.(state, setState, clientApi ?? null) ?? ({} as TActions);

    return { state, ...actions };
}
