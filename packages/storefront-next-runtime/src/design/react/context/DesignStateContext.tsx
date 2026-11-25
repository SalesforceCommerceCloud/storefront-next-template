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
import React from 'react';
import { createDesignStore, type DesignStore } from './designStore';
import { DesignStoreContext } from './DesignStoreContext';
import { useSelectInteraction } from '../hooks/useSelectInteraction';
import { useHoverInteraction } from '../hooks/useHoverInteraction';
import { useDeleteInteraction } from '../hooks/useDeleteInteraction';
import { useFocusInteraction } from '../hooks/useFocusInteraction';
import { useScrollInteraction, type ScrollInteraction } from '../hooks/useScrollInteraction';
import { useDragInteraction, type DragInteraction } from '../hooks/useDragInteraction';
import { useComponentUpdateInteraction, type ComponentUpdateInteraction } from '../hooks/useComponentUpdateInteraction';
import type { ComponentDeletedEvent, EventPayload } from '../../messaging-api';

export interface NodeToTargetMapEntry {
    type: 'region' | 'component';
    parentId?: string;
    componentId: string;
    contentLinkUuid?: string;
    regionId: string;
    contentLinkUuids: string[];
    componentUuids: string[];
    componentUuid: string;
    componentTypeInclusions?: string[];
    componentTypeExclusions?: string[];
}

export interface DesignState extends DragInteraction, ScrollInteraction, ComponentUpdateInteraction {
    selectedComponentUuid: string | null;
    hoveredComponentUuid: string | null;
    setSelectedComponent: (componentUuid: string) => void;
    setHoveredComponent: (componentUuid: string | null) => void;
    deleteComponent: (event: EventPayload<ComponentDeletedEvent>) => void;
    focusComponent: (node: Element) => void;
    focusedComponentUuid: string | null;
    nodeToTargetMap: WeakMap<Element, NodeToTargetMapEntry>;
    /**
     * Maps generated component UUIDs to raw component metadata for mounted DesignComponent instances.
     * Should only be used in interactions and not functional components as it is populated after components are rendered.
     */
    componentByUuid: Record<string, { componentId: string; contentLinkUuid: string }>;
    registerComponentUuid: (componentUuid: string, componentId: string, contentLinkUuid: string) => void;
}

// oxlint-disable-next-line react-refresh/only-export-components
export const DesignStateContext = React.createContext<DesignState>(null as unknown as DesignState);

export const DesignStateProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [componentByUuid, setComponentByUuid] = React.useState<
        Record<string, { componentId: string; contentLinkUuid: string }>
    >({});

    const registerComponentUuid = React.useCallback(
        (componentUuid: string, componentId: string, contentLinkUuid: string) => {
            setComponentByUuid((prev) => {
                const component = { componentId, contentLinkUuid };
                if (
                    prev[componentUuid]?.componentId === componentId &&
                    prev[componentUuid]?.contentLinkUuid === contentLinkUuid
                ) {
                    return prev;
                }
                return { ...prev, [componentUuid]: component };
            });
        },
        []
    );

    const selectInteraction = useSelectInteraction({ componentByUuid });
    const hoverInteraction = useHoverInteraction({ componentByUuid });
    const deleteInteraction = useDeleteInteraction({
        selectedComponentUuid: selectInteraction.selectedComponentUuid,
        setSelectedComponent: selectInteraction.setSelectedComponent,
    });
    const focusInteraction = useFocusInteraction({
        setSelectedComponent: selectInteraction.setSelectedComponent,
    });
    const scrollInteraction = useScrollInteraction();
    const componentUpdateInteraction = useComponentUpdateInteraction();
    const nodeToTargetMap = React.useMemo(() => new WeakMap(), []);
    const dragInteraction = useDragInteraction({ nodeToTargetMap });

    const state = React.useMemo(
        () => ({
            ...deleteInteraction,
            ...selectInteraction,
            ...hoverInteraction,
            ...focusInteraction,
            ...dragInteraction,
            ...scrollInteraction,
            ...componentUpdateInteraction,
            nodeToTargetMap,
            componentByUuid,
            registerComponentUuid,
        }),
        [
            deleteInteraction,
            selectInteraction,
            hoverInteraction,
            focusInteraction,
            dragInteraction,
            nodeToTargetMap,
            scrollInteraction,
            componentUpdateInteraction,
            componentByUuid,
            registerComponentUuid,
        ]
    );

    // The "bridge": mirror the combined `state` into an external store each
    // render, so selector-based consumers (useDesignSelector) subscribe to
    // slices without the interaction write-side needing to know about them. The
    // store is created once; on every render with a new `state` object we push
    // it in. `setState` is a no-op when the reference is unchanged.
    const storeRef = React.useRef<DesignStore<DesignState> | null>(null);
    if (!storeRef.current) {
        storeRef.current = createDesignStore<DesignState>(state);
    }
    React.useLayoutEffect(() => {
        storeRef.current?.setState(state);
    }, [state]);

    return (
        <DesignStoreContext.Provider value={storeRef.current}>
            <DesignStateContext.Provider value={state}>{children}</DesignStateContext.Provider>
        </DesignStoreContext.Provider>
    );
};
