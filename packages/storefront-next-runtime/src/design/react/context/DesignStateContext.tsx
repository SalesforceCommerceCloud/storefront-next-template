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
    componentTypeInclusions?: string[];
    componentTypeExclusions?: string[];
}

export interface DesignState extends DragInteraction, ScrollInteraction, ComponentUpdateInteraction {
    selectedContentLinkUuid: string | null;
    hoveredContentLinkUuid: string | null;
    setSelectedComponent: (contentLinkUuid: string) => void;
    setHoveredComponent: (componentUuid: string | null) => void;
    deleteComponent: (event: EventPayload<ComponentDeletedEvent>) => void;
    focusComponent: (node: Element) => void;
    focusedContentLinkUuid: string | null;
    nodeToTargetMap: WeakMap<Element, NodeToTargetMapEntry>;
    /**
     * Maps contentLinkUuid to componentId for all mounted DesignComponent instances.
     * Should only be used in interactions and not functional components as it is populated after components are rendered.
     */
    contentLinkMap: Record<string, string>;
    registerContentLink: (contentLinkUuid: string, componentId: string) => void;
}

// oxlint-disable-next-line react-refresh/only-export-components
export const DesignStateContext = React.createContext<DesignState>(null as unknown as DesignState);

export const DesignStateProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [contentLinkMap, setContentLinkMap] = React.useState<Record<string, string>>({});

    const registerContentLink = React.useCallback((contentLinkUuid: string, componentId: string) => {
        setContentLinkMap((prev) => {
            if (prev[contentLinkUuid] === componentId) return prev;
            return { ...prev, [contentLinkUuid]: componentId };
        });
    }, []);

    const selectInteraction = useSelectInteraction({ contentLinkMap });
    const hoverInteraction = useHoverInteraction({ contentLinkMap });
    const deleteInteraction = useDeleteInteraction({
        selectedContentLinkUuid: selectInteraction.selectedContentLinkUuid,
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
            contentLinkMap,
            registerContentLink,
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
            contentLinkMap,
            registerContentLink,
        ]
    );

    return <DesignStateContext.Provider value={state}>{children}</DesignStateContext.Provider>;
};
