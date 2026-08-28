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

import { useCallback, useEffect, useRef } from 'react';
import { useInteraction } from './useInteraction';
import type { NodeToTargetMapEntry } from '../context/DesignStateContext';
import { useComponentDiscovery, type ComponentDiscoveryResult } from './useComponentDiscovery';
import { isComponentTypeAllowedInRegion } from '../utils/regionUtils';
import { useMemoObject } from './useMemoObject';

// The height of the scroll buffer on the top and bottom of the window
// as a percentage of the window height.
const SCROLL_BUFFER_HEIGHT_PERCENTAGE = 15;
const SCROLL_BUFFER_MIN_HEIGHT_IN_PIXELS = 50;
// The interval at which the window will scroll within the buffer.
// More often means a smoother experience.
const SCROLL_INTERVAL_IN_MS = 1000 / 60; // 60fps
// The multiplier applied to the scroll factor.
// The scroll factor is a value between 0 and 1 that determines how much to scroll.
// This value will be the maximum amount of pixels that will be scrolled in a single frame.
const SCROLL_BASE_AMOUNT_IN_PIXELS = 50;

interface InsertionType {
    axis: 'x' | 'y';
    type: 'before' | 'after';
}

export interface DropTarget extends Omit<NodeToTargetMapEntry, 'contentLinkUuids'> {
    beforeContentLinkUuid?: string;
    afterContentLinkUuid?: string;
    insertType: InsertionType;
    insertContentLinkUuid?: string;
    regionId: string;
}

export interface DragInteraction {
    dragState: {
        isDragging: boolean;
        x: number;
        y: number;
        currentDropTarget: DropTarget | null;
        pendingTargetCommit: boolean;
        componentType?: string;
        fragmentId?: string;
        sourceContentLinkUuid?: string;
        sourceRegionId?: string;
        rectCache: WeakMap<Element, DOMRect>;
        scrollDirection: 0 | 1 | -1;
        pendingDragContentLinkUuid: string | null;
    };
    commitCurrentDropTarget: () => void;
    startComponentMove: (componentId: string, regionId: string, componentType: string, contentLinkUuid: string) => void;
    updateComponentMove: (params: { x: number; y: number }) => void;
    setPendingDragContentLinkUuid: (contentLinkUuid: string) => void;
    dropComponent: () => void;
    cancelDrag: () => void;
}

function getInsertionType({
    cache,
    node,
    x,
    y,
}: {
    cache: WeakMap<Element, DOMRect>;
    node: Element;
    x: number;
    y: number;
}): InsertionType {
    if (!cache.has(node)) {
        const rect = node.getBoundingClientRect();
        const screenLeft = rect.left - window.scrollX;
        const screenTop = rect.top + window.scrollY;

        // A bounding box is relative to the viewport.
        // We need to know the absolute position, taking into account the scroll position.
        cache.set(node, new DOMRect(screenLeft, screenTop, rect.width, rect.height));
    }

    const rect = cache.get(node) as DOMRect;
    const screenX = x + window.scrollX;
    const screenY = y + window.scrollY;
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    const deltaX = screenX - midX;
    const deltaY = screenY - midY;
    // Use the relative delta for boxes that are not square.
    const relativeDeltaX = deltaX / (rect.width / 2);
    const relativeDeltaY = deltaY / (rect.height / 2);

    if (Math.abs(relativeDeltaX) > Math.abs(relativeDeltaY)) {
        return { axis: 'x', type: relativeDeltaX < 0 ? 'before' : 'after' };
    }

    return { axis: 'y', type: relativeDeltaY < 0 ? 'before' : 'after' };
}

// Determines whether a source component is being dropped on itself.
// Note: componentId parameters here are actually contentLinkUuid values (with fallback to id)
// from the region's contentLinkUuids array, allowing proper duplicate component handling.
function isOnSelfDropTarget({
    sourceContentLinkUuid,
    beforeContentLinkUuid,
    afterContentLinkUuid,
    insertType,
    contentLinkUuid,
}: {
    sourceContentLinkUuid: string | undefined;
    beforeContentLinkUuid: string | undefined;
    afterContentLinkUuid: string | undefined;
    insertType: InsertionType;
    contentLinkUuid: string;
}) {
    const isOnSource = sourceContentLinkUuid && contentLinkUuid === sourceContentLinkUuid;
    const isOnSameRegionBefore =
        sourceContentLinkUuid && insertType.type === 'before' && beforeContentLinkUuid === sourceContentLinkUuid;
    const isOnSameRegionAfter =
        sourceContentLinkUuid && insertType.type === 'after' && afterContentLinkUuid === sourceContentLinkUuid;

    return isOnSource || isOnSameRegionBefore || isOnSameRegionAfter;
}

export function useDragInteraction({
    nodeToTargetMap,
}: {
    nodeToTargetMap: WeakMap<Element, NodeToTargetMapEntry>;
}): DragInteraction {
    const discoverComponents = useComponentDiscovery({
        nodeToTargetMap,
    });
    const getNearestComponentAndRegion = useCallback(
        (
            x: number,
            y: number
        ): {
            component: ComponentDiscoveryResult | null;
            region: ComponentDiscoveryResult | null;
        } => {
            const stack = discoverComponents({ x, y });
            let component: ComponentDiscoveryResult | null = null;
            let region: ComponentDiscoveryResult | null = null;

            for (let i = 0; i < stack.length; i += 1) {
                const entry = stack[i];

                // We need a region id and direction for this to be a target.
                if (entry.regionId) {
                    if (entry.type === 'component') {
                        component = entry;
                    } else if (entry.type === 'region') {
                        region = entry;
                        // Once we find a region we need to exit.
                        break;
                    }
                }
            }

            return { component, region };
        },
        [discoverComponents]
    );

    const getInsertionComponentUuids = (
        contentLinkUuid: string,
        region: NodeToTargetMapEntry & { node: Element }
    ): [string | undefined, string | undefined] => {
        const componentIndex = region.contentLinkUuids.indexOf(contentLinkUuid);

        return [region.contentLinkUuids[componentIndex - 1], region.contentLinkUuids[componentIndex + 1]];
    };

    const getCurrentDropTarget = useCallback(
        ({
            x,
            y,
            rectCache,
            componentType,
        }: {
            x: number;
            y: number;
            rectCache: WeakMap<Element, DOMRect>;
            componentType?: string;
        }): DropTarget | null => {
            const { component, region } = getNearestComponentAndRegion(x, y);

            if (region) {
                // If component type is not allowed, don't return a drop target
                if (
                    !isComponentTypeAllowedInRegion(
                        componentType,
                        region.componentTypeInclusions || [],
                        region.componentTypeExclusions || []
                    )
                ) {
                    return null;
                }

                const insertType: InsertionType = component
                    ? getInsertionType({
                          cache: rectCache,
                          node: component.node,
                          x,
                          y,
                      })
                    : { axis: 'y', type: 'after' };

                const componentContentLinkUuid = component?.contentLinkUuid ?? '';
                const [beforeContentLinkUuid, afterContentLinkUuid] = component
                    ? getInsertionComponentUuids(componentContentLinkUuid, region)
                    : [];

                // If we find a component before a region, it means we are dropping over a component.
                // If no component is found before a region, it means we are dropping over an empty region.
                return {
                    type: component ? 'component' : 'region',
                    regionId: region.regionId,
                    componentId: component?.componentId ?? '',
                    contentLinkUuid: componentContentLinkUuid,
                    parentId: region.parentId,
                    beforeContentLinkUuid,
                    afterContentLinkUuid,
                    insertContentLinkUuid: componentContentLinkUuid,
                    insertType,
                    componentTypeInclusions: region.componentTypeInclusions,
                    componentTypeExclusions: region.componentTypeExclusions,
                };
            }

            return null;
        },
        [getNearestComponentAndRegion]
    );

    const computeScrollFactor = ({ y, windowHeight }: { y: number; windowHeight: number }) => {
        const bufferHeight = Math.max(
            windowHeight * (SCROLL_BUFFER_HEIGHT_PERCENTAGE / 100),
            SCROLL_BUFFER_MIN_HEIGHT_IN_PIXELS
        );
        const bottomBufferStart = windowHeight - bufferHeight;

        if (y > bottomBufferStart) {
            return (y - bottomBufferStart) / bufferHeight;
        }

        if (y < bufferHeight) {
            return (y - bufferHeight) / bufferHeight;
        }

        return 0;
    };

    const computeScrollDirection = (factor: number): 0 | 1 | -1 => {
        if (factor > 0) {
            return 1;
        }

        if (factor < 0) {
            return -1;
        }

        return 0;
    };

    const scrollFactorRef = useRef(0);

    const {
        state: dragState,
        commitCurrentDropTarget,
        updateComponentMove,
        startComponentMove,
        dropComponent,
        cancelDrag,
        setPendingDragContentLinkUuid,
    } = useInteraction({
        initialState: {
            isDragging: false,
            componentType: '',
            fragmentId: undefined as string | undefined,
            sourceContentLinkUuid: undefined as string | undefined,
            sourceRegionId: undefined as string | undefined,
            x: 0,
            y: 0,
            currentDropTarget: null as DropTarget | null,
            pendingTargetCommit: false,
            rectCache: new WeakMap<Element, DOMRect>(),
            pendingDragContentLinkUuid: null,
        } as DragInteraction['dragState'],
        eventHandlers: {
            ComponentDragStarted: {
                handler: (event, setState) => {
                    scrollFactorRef.current = 0;

                    setState((prevState) => ({
                        ...prevState,
                        componentType: event.componentType,
                        fragmentId: event.fragmentId,
                        sourceContentLinkUuid: undefined,
                        sourceRegionId: undefined,
                        x: 0,
                        y: 0,
                        isDragging: true,
                        currentDropTarget: null,
                        pendingTargetCommit: false,
                        scrollDirection: 0,
                        rectCache: new WeakMap<Element, DOMRect>(),
                    }));
                },
            },
            ClientWindowDragExited: {
                handler: (_, setState) => {
                    scrollFactorRef.current = 0;

                    setState((prevState) => ({
                        ...prevState,
                        componentType: '',
                        x: 0,
                        y: 0,
                        isDragging: false,
                        currentDropTarget: null,
                        scrollDirection: 0,
                        pendingTargetCommit: false,
                    }));
                },
            },
            ClientWindowDragMoved: {
                handler: (event, setState) => {
                    scrollFactorRef.current = computeScrollFactor({
                        y: event.y,
                        windowHeight: window.innerHeight,
                    });

                    setState((prevState) => ({
                        ...prevState,
                        x: event.x,
                        y: event.y,
                        isDragging: true,
                        scrollDirection: computeScrollDirection(scrollFactorRef.current),
                        currentDropTarget: getCurrentDropTarget({
                            x: event.x,
                            y: event.y,
                            rectCache: dragState.rectCache,
                            componentType: prevState.componentType,
                        }),
                    }));
                },
            },
            ClientWindowDragDropped: {
                handler: (_, setState) => {
                    setState((prevState) => ({
                        ...prevState,
                        isDragging: false,
                        pendingTargetCommit: true,
                    }));
                },
            },
        },
        actions: (state, setState, clientApi) => ({
            cancelDrag: () => {
                scrollFactorRef.current = 0;

                setState((prevState) => ({
                    ...prevState,
                    x: 0,
                    y: 0,
                    scrollDirection: 0,
                    isDragging: false,
                    pendingDragContentLinkUuid: null,
                }));
            },
            updateComponentMove: ({ x, y }: { x: number; y: number }) => {
                scrollFactorRef.current = computeScrollFactor({
                    y,
                    windowHeight: window.innerHeight,
                });

                setState((prevState) => ({
                    ...prevState,
                    x,
                    y,
                    scrollDirection: computeScrollDirection(scrollFactorRef.current),
                    currentDropTarget: getCurrentDropTarget({
                        x,
                        y,
                        rectCache: state.rectCache,
                        componentType: state.componentType,
                    }),
                }));
            },
            setPendingDragContentLinkUuid: (contentLinkUuid: string) => {
                setState((prevState) => ({
                    ...prevState,
                    pendingDragContentLinkUuid: contentLinkUuid,
                }));
            },
            dropComponent: () => {
                setState((prevState) => ({
                    ...prevState,
                    isDragging: false,
                    pendingTargetCommit: true,
                }));
            },
            startComponentMove: (
                componentId: string,
                regionId: string,
                componentType: string,
                contentLinkUuid: string
            ) => {
                scrollFactorRef.current = 0;

                setState((prevState) => ({
                    ...prevState,
                    x: 0,
                    y: 0,
                    componentType,
                    sourceContentLinkUuid: contentLinkUuid,
                    sourceRegionId: regionId,
                    isDragging: true,
                    scrollDirection: 0,
                    rectCache: new WeakMap<Element, DOMRect>(),
                }));
            },
            commitCurrentDropTarget: () => {
                // Don't do anything if we don't have a drop target.
                if (state.currentDropTarget) {
                    // If we have a source content link uuid, then we are moving a component to a different region.
                    if (state.sourceContentLinkUuid) {
                        if (
                            !isOnSelfDropTarget({
                                sourceContentLinkUuid: state.sourceContentLinkUuid,
                                beforeContentLinkUuid: state.currentDropTarget.beforeContentLinkUuid,
                                afterContentLinkUuid: state.currentDropTarget.afterContentLinkUuid,
                                insertType: state.currentDropTarget.insertType,
                                contentLinkUuid: state.currentDropTarget.contentLinkUuid ?? '',
                            })
                        ) {
                            clientApi?.moveComponentToRegion({
                                componentId: state.currentDropTarget.componentId ?? '',
                                contentLinkUuid: state.sourceContentLinkUuid,
                                sourceRegionId: state.sourceRegionId ?? '',
                                insertType: state.currentDropTarget.insertType?.type,
                                insertComponentId: state.currentDropTarget.insertContentLinkUuid,
                                beforeComponentId: state.currentDropTarget.beforeContentLinkUuid,
                                afterComponentId: state.currentDropTarget.afterContentLinkUuid,
                                targetRegionId: state.currentDropTarget.regionId,
                                targetComponentId: state.currentDropTarget.parentId ?? '',
                            });
                        }
                        // If we don't have a source content link uuid, then we are adding a new component to a region.
                    } else if (state.componentType || state.fragmentId) {
                        clientApi?.addComponentToRegion({
                            insertType: state.currentDropTarget.insertType?.type,
                            insertComponentId: state.currentDropTarget.insertContentLinkUuid,
                            beforeComponentId: state.currentDropTarget.beforeContentLinkUuid,
                            componentProperties: {},
                            componentType: state.fragmentId ? '' : (state.componentType ?? ''),
                            fragmentId: state.fragmentId,
                            targetComponentId: state.currentDropTarget.parentId ?? '',
                            afterComponentId: state.currentDropTarget.afterContentLinkUuid,
                            targetRegionId: state.currentDropTarget.regionId,
                        });
                    }
                }

                scrollFactorRef.current = 0;

                setState((prevState) => ({
                    ...prevState,
                    x: 0,
                    y: 0,
                    componentType: '',
                    scrollDirection: 0,
                    sourceContentLinkUuid: undefined,
                    sourceRegionId: undefined,
                    pendingDragContentLinkUuid: null,
                    currentDropTarget: null,
                    pendingTargetCommit: false,
                }));
            },
        }),
    });

    // Commits the current drop target if we are pending a target commit.
    useEffect(() => {
        if (dragState.pendingTargetCommit) {
            commitCurrentDropTarget();
        }
    }, [dragState.pendingTargetCommit, commitCurrentDropTarget]);

    // Starts scrolling the window when the drag state scroll factor is not 0.
    useEffect(() => {
        if (dragState.scrollDirection !== 0) {
            const interval = setInterval(() => {
                window.scrollBy(0, scrollFactorRef.current * SCROLL_BASE_AMOUNT_IN_PIXELS);
            }, SCROLL_INTERVAL_IN_MS);

            return () => clearInterval(interval);
        }

        return () => {
            // noop
        };
    }, [dragState.scrollDirection, scrollFactorRef]);

    return useMemoObject({
        dragState,
        setPendingDragContentLinkUuid,
        commitCurrentDropTarget,
        startComponentMove,
        updateComponentMove,
        dropComponent,
        cancelDrag,
    });
}
