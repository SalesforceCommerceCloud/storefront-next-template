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
import React, { useRef, useCallback } from 'react';
import type { ComponentDecoratorProps } from '../core/component.types';
import { useComponentDecoratorClasses } from '../hooks/useComponentDecoratorClasses';
import { useDesignState } from '../hooks/useDesignState';
import { useFocusedComponentHandler } from '../hooks/useFocusedComponentHandler';
import { useNodeToTargetStore } from '../hooks/useNodeToTargetStore';
import { DesignFrame } from './DesignFrame';
import { useRegionContext } from '../core/RegionContext';
import { useIsWithinEmbeddedSubtree } from '../core/EmbeddedSubtreeContext';
import { ComponentContext, useComponentContext, type ComponentContextType } from '../core/ComponentContext';
import { useComponentDiscovery } from '../hooks/useComponentDiscovery';
import { useComponentType } from '../hooks/useComponentType';
import { useThrottledCallback } from '../hooks/useThrottledCallback';
import { useComponentInfo } from '../hooks/useComponentInfo';

export function DesignComponent(props: ComponentDecoratorProps<unknown>): React.JSX.Element {
    const { designMetadata, children } = props;
    const {
        id = '',
        contentLinkUuid = '',
        name,
        isFragment = false,
        isVisible = true,
        isLocalized = false,
    } = designMetadata ?? {};
    const componentId = id;
    const componentType = useComponentType(componentId);
    const componentInfo = useComponentInfo(componentId);
    const { nodeToTargetMap } = useDesignState();

    const componentName = componentInfo?.name || componentType?.label || name || 'Component';
    const dragRef = useRef<HTMLDivElement>(null);
    const { regionId } = useRegionContext() ?? {};
    const { componentId: parentComponentId } = useComponentContext() ?? {};

    // Embedded content-block (ECB) children can't be resolved by the host for
    // select / delete / move, so we render them as static, non-interactive
    // content. The embedded owner declares the subtree via the provider, keyed
    // on its own `embedded` flag — the sole source of truth for embeddedness.
    const isEmbedded = useIsWithinEmbeddedSubtree();

    const {
        selectedContentLinkUuid,
        hoveredContentLinkUuid,
        setSelectedComponent,
        setHoveredComponent,
        startComponentMove,
        setPendingDragContentLinkUuid,
        dragState: { pendingDragContentLinkUuid, isDragging, sourceContentLinkUuid: draggingSourceContentLinkUuid },
        registerContentLink,
    } = useDesignState();

    // Registering the uuid → componentId link is what lets host-driven select /
    // hover / focus events resolve back to this node. Gate on !isEmbedded so an
    // embedded instance the host can't edit is never made resolvable.
    // (Registration is additive with no unregister, so this only ever withholds
    // the link — it cannot remove one added while isEmbedded was still false.)
    React.useEffect(() => {
        if (contentLinkUuid && componentId && !isEmbedded) {
            registerContentLink(contentLinkUuid, componentId);
        }
    }, [componentId, contentLinkUuid, registerContentLink, isEmbedded]);

    useFocusedComponentHandler(contentLinkUuid, dragRef, isEmbedded);
    useNodeToTargetStore({
        type: 'component',
        nodeRef: dragRef,
        parentId: parentComponentId,
        regionId,
        componentId,
        contentLinkUuid,
        disabled: isEmbedded,
    });

    const discoverComponents = useComponentDiscovery({
        nodeToTargetMap,
    });

    const isPendingDrag = pendingDragContentLinkUuid === contentLinkUuid;
    const findAndSetHoveredComponent = useCallback(
        (x: number, y: number) => {
            // If we hover off a component, we could still be hovering over a parent component
            // that contains that child. In this instance, the mouse enter doesn't fire and that parent
            // would not be highlighted. Everytime we leave a component, we check
            // if we are hovering over a component at those coordinates. If we are,
            // we set the hovered component to that component.
            const components = discoverComponents({
                x,
                y,
                filter: (entry) => entry.type === 'component',
            });

            setHoveredComponent(components[0]?.contentLinkUuid ?? null);
        },
        [setHoveredComponent, discoverComponents]
    );

    const handleMouseMove = useThrottledCallback(
        (event: React.MouseEvent) => {
            event.stopPropagation();
            findAndSetHoveredComponent(event.clientX, event.clientY);
        },
        1000 / 60, // 60 FPS
        [findAndSetHoveredComponent]
    );

    const handleMouseLeave = useCallback(
        (event: React.MouseEvent) => {
            event.stopPropagation();
            findAndSetHoveredComponent(event.clientX, event.clientY);
        },
        [findAndSetHoveredComponent]
    );

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedComponent(contentLinkUuid ?? '');
        },
        [setSelectedComponent, contentLinkUuid]
    );

    const showFrame = [selectedContentLinkUuid, hoveredContentLinkUuid].includes(contentLinkUuid ?? '') && !isDragging;
    const isDraggable = Boolean(componentId && regionId && componentType?.id);

    const classes = useComponentDecoratorClasses({
        contentLinkUuid,
        isLocalized,
        isFragment: Boolean(isFragment),
    });

    const context = React.useMemo<ComponentContextType>(
        () => ({ componentId: id, name, contentLinkUuid }),
        [id, name, contentLinkUuid]
    );

    // Makes the component a drop target.
    const handleDragOver = React.useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            // Don't prevent propagation here.
            // We depend on the global listener to handle the drag over event.
            // If we are moving a component, don't let it be droppable on itself.
            // Compare by contentLinkUuid to handle duplicate components correctly.
            if (draggingSourceContentLinkUuid !== contentLinkUuid) {
                event.preventDefault();
            }
        },
        [draggingSourceContentLinkUuid, contentLinkUuid]
    );

    // When dragging, we don't consider the component as dragging until the drag start event
    // is triggered. However, we need to mark the component as draggable on mouse down so that
    // it can even be dragged via the native drag and drop API.
    //
    // If we were to mark the components as dragging on mouse down instead, a selection of a component
    // would first remove the frame because this thinks we are dragging the component instead of selecting it.
    // This is why it is split up into two events.
    const handleMouseDown = React.useCallback(
        (event: React.MouseEvent) => {
            if (contentLinkUuid) {
                event.stopPropagation();
                setPendingDragContentLinkUuid(contentLinkUuid);
            }
        },
        [contentLinkUuid, setPendingDragContentLinkUuid]
    );

    const handleDragStart = React.useCallback(
        (event: React.DragEvent) => {
            event.stopPropagation();

            if (componentId && regionId && componentType?.id) {
                startComponentMove(componentId, regionId, componentType.id, contentLinkUuid);
            }
        },
        [componentId, regionId, componentType?.id, contentLinkUuid, startComponentMove]
    );

    // Don't render anything if the components is hidden via visibility rules.
    // We still want the component to be reactive in case the use changes the
    // visibility rules or the render context.
    if (!isVisible) {
        return <></>;
    }

    // An embedded content-block (ECB) subtree can't be edited by the host, so
    // render its children as static content with no design chrome, drop target,
    // or interaction handlers. Hooks above still run (Rules of Hooks) but wire
    // to nothing here — registration is gated and the target store is disabled.
    if (isEmbedded) {
        return <ComponentContext.Provider value={context}>{children}</ComponentContext.Provider>;
    }

    return (
        <div
            ref={dragRef}
            className={classes}
            draggable={isPendingDrag && isDraggable}
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            data-component-type={componentType?.id}
            data-testid={`design-component-${componentId}`}>
            <div className="pd-design__component__drop-target" />
            <DesignFrame
                showFrame={showFrame}
                componentId={componentId}
                contentLinkUuid={contentLinkUuid}
                localized={isLocalized}
                name={componentName}
                parentId={parentComponentId}
                isMoveable={isDraggable}
                regionId={regionId}>
                <ComponentContext.Provider value={context}>{children}</ComponentContext.Provider>
            </DesignFrame>
        </div>
    );
}
