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
import { useEffect, useRef, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
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
    const { isDesignMode, clientApi } = useDesignContext() ?? {};

    // Latest-value refs, reassigned every render. The stable subscription and
    // action wrappers below read through these at CALL / DISPATCH time, so they
    // always see the current state / clientApi / factory / handlers without
    // changing identity or forcing re-subscription. This is what lets actions be
    // referentially stable (so consumers that put them in `useCallback`/`useEffect`
    // dep arrays don't thrash) while still being free of stale-closure bugs.
    const stateRef = useRef(state);
    stateRef.current = state;
    const clientApiRef = useRef(clientApi ?? null);
    clientApiRef.current = clientApi ?? null;
    const actionsFactoryRef = useRef(config.actions);
    actionsFactoryRef.current = config.actions;
    const eventHandlersRef = useRef(config.eventHandlers);
    eventHandlersRef.current = config.eventHandlers;

    // Subscribe event handlers to the client API exactly ONCE per design-mode
    // connection. Each subscription registers a stable dispatcher that reads
    // `eventHandlersRef.current` at fire time, so:
    //   1. Host listeners are NOT torn down + re-added on every render — they
    //      would be if `config.eventHandlers` (a fresh literal each render) were
    //      an effect dependency, which for drag/hover means every frame.
    //   2. The dispatched handler is always the LATEST render's closure, so a
    //      handler that reads render-scope values (e.g. drag's `ClientWindowDragMoved`
    //      reading the current `rectCache` WeakMap) never goes stale — the same
    //      freshness the action wrappers get, but at the subscription boundary.
    // The set of event names is static per hook, so discovering it once is safe.
    useEffect(() => {
        if (!isDesignMode || !clientApi) {
            return () => {
                // Return empty cleanup function for consistency
            };
        }

        const eventNames = Object.keys(eventHandlersRef.current ?? {}) as (keyof ClientEventNameMapping)[];
        const unsubscribeFunctions = eventNames.map((eventName) =>
            clientApi.on(eventName, (event) =>
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                eventHandlersRef.current?.[eventName]?.handler(event as any, setState)
            )
        );

        return () => {
            unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
        };
    }, [isDesignMode, clientApi]);

    // Build the wrappers exactly once. Action names are static per factory, so
    // we discover the key set from a first invocation and mint one stable
    // wrapper per key. Each wrapper re-invokes the LATEST factory against the
    // LATEST state/clientApi, capturing neither.
    //
    // Freshness has two sources, both required:
    //   1. `stateRef.current` — the factory's `state` arg is always the latest
    //      committed value (e.g. drag's `state.currentDropTarget`).
    //   2. `actionsFactoryRef.current` — re-invoking the latest factory literal
    //      picks up its latest lexical closures (e.g. drag's `getCurrentDropTarget`
    //      useCallback and `scrollFactorRef`), not the ones captured at mint time.
    const stableActionsRef = useRef<TActions | null>(null);
    if (stableActionsRef.current === null && config.actions) {
        const initialActions = config.actions(stateRef.current, setState, clientApiRef.current);
        const wrapped = {} as Record<string, (...args: unknown[]) => unknown>;
        for (const key of Object.keys(initialActions)) {
            wrapped[key] = (...args: unknown[]) =>
                actionsFactoryRef.current?.(stateRef.current, setState, clientApiRef.current)[key](...args);
        }
        stableActionsRef.current = wrapped as TActions;
    }

    // `stableActionsRef.current` is minted once above and never changes identity
    // afterward, so `state` is the only real dependency; re-memoize only when it
    // changes to keep the returned object referentially stable across chrome churn.
    const result = useMemo(
        () =>
            ({
                state,
                ...stableActionsRef.current,
            }) as { state: TState } & TActions,
        [state]
    );

    return result;
}
