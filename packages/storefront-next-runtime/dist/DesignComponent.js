import "./messaging-api.js";
import { a as useDesignState, i as useThrottledCallback, r as useDesignContext, s as useComponentDiscovery } from "./DesignContext.js";
import "./modeDetection.js";
import "./PageDesignerProvider.js";
import { i as useRegionContext, n as useIsWithinEmbeddedSubtree } from "./EmbeddedSubtreeContext.js";
import { a as useComponentType, n as useComponentContext, o as useNodeToTargetStore, r as DesignFrame, t as ComponentContext } from "./ComponentContext.js";
import React, { useCallback, useRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/design/react/hooks/useComponentDecoratorClasses.ts
function useComponentDecoratorClasses({ contentLinkUuid, isFragment, isLocalized }) {
	const { selectedContentLinkUuid, hoveredContentLinkUuid, dragState } = useDesignState();
	const isSelected = selectedContentLinkUuid === contentLinkUuid;
	const isHovered = !dragState.isDragging && hoveredContentLinkUuid === contentLinkUuid;
	const showFrame = (isSelected || isHovered) && !dragState.isDragging;
	const isMoving = dragState.isDragging && dragState.sourceContentLinkUuid === contentLinkUuid;
	const isDropTarget = dragState.currentDropTarget?.contentLinkUuid === contentLinkUuid;
	const dropTargetInsertType = dragState.currentDropTarget?.insertType;
	const dropTargetAxis = dropTargetInsertType?.axis;
	return [
		"pd-design__decorator",
		isFragment ? "pd-design__fragment" : "pd-design__component",
		showFrame && "pd-design__frame--visible",
		isSelected && "pd-design__decorator--selected",
		isHovered && "pd-design__decorator--hovered",
		isMoving && "pd-design__decorator--moving",
		!isLocalized && "pd-design__component--unlocalized",
		isDropTarget && dropTargetAxis && dropTargetInsertType && `pd-design__drop-target__${dropTargetAxis}-${dropTargetInsertType.type}`
	].filter(Boolean).join(" ");
}

//#endregion
//#region src/design/react/hooks/useFocusedComponentHandler.ts
/**
* Focuses a component when the focused component id matches the content link UUID.
* @param contentLinkUuid - The content link UUID of the component.
* @param nodeRef - The ref object to the node to focus.
* @param disabled - When true, the handler is inert. Embedded instances are not
*   editable by the host, so they must never be focused / scrolled into view;
*   the decorator passes its `isEmbedded` here to enforce that.
*/
function useFocusedComponentHandler(contentLinkUuid, nodeRef, disabled = false) {
	const { focusedContentLinkUuid, focusComponent } = useDesignState();
	React.useEffect(() => {
		if (!disabled && focusedContentLinkUuid === contentLinkUuid && nodeRef.current) focusComponent(nodeRef.current);
	}, [
		disabled,
		focusedContentLinkUuid,
		contentLinkUuid,
		focusComponent,
		nodeRef
	]);
}

//#endregion
//#region src/design/react/hooks/useComponentInfo.ts
/**
* Hook that returns the current ComponentInfo for a given component ID,
* merging the base config with any runtime updates.
*
* @param componentId - The ID of the component to get info for
* @returns The merged ComponentInfo or null if the component doesn't exist
*/
function useComponentInfo(componentId) {
	const { pageDesignerConfig } = useDesignContext();
	const { componentUpdates } = useDesignState();
	const baseComponentInfo = pageDesignerConfig?.components?.[componentId];
	const updates = componentUpdates?.[componentId] ?? {};
	if (!baseComponentInfo) return null;
	return {
		...baseComponentInfo,
		...updates
	};
}

//#endregion
//#region src/design/react/components/DesignComponent.tsx
function DesignComponent(props) {
	const { designMetadata, children } = props;
	const { id = "", contentLinkUuid = "", name, isFragment = false, isVisible = true, isLocalized = false } = designMetadata ?? {};
	const componentId = id;
	const componentType = useComponentType(componentId);
	const componentInfo = useComponentInfo(componentId);
	const { nodeToTargetMap } = useDesignState();
	const componentName = componentInfo?.name || componentType?.label || name || "Component";
	const dragRef = useRef(null);
	const { regionId } = useRegionContext() ?? {};
	const { componentId: parentComponentId } = useComponentContext() ?? {};
	const isEmbedded = useIsWithinEmbeddedSubtree();
	const { selectedContentLinkUuid, hoveredContentLinkUuid, setSelectedComponent, setHoveredComponent, startComponentMove, setPendingDragContentLinkUuid, dragState: { pendingDragContentLinkUuid, isDragging, sourceContentLinkUuid: draggingSourceContentLinkUuid }, registerContentLink } = useDesignState();
	React.useEffect(() => {
		if (contentLinkUuid && componentId && !isEmbedded) registerContentLink(contentLinkUuid, componentId);
	}, [
		componentId,
		contentLinkUuid,
		registerContentLink,
		isEmbedded
	]);
	useFocusedComponentHandler(contentLinkUuid, dragRef, isEmbedded);
	useNodeToTargetStore({
		type: "component",
		nodeRef: dragRef,
		parentId: parentComponentId,
		regionId,
		componentId,
		contentLinkUuid,
		disabled: isEmbedded
	});
	const discoverComponents = useComponentDiscovery({ nodeToTargetMap });
	const isPendingDrag = pendingDragContentLinkUuid === contentLinkUuid;
	const findAndSetHoveredComponent = useCallback((x, y) => {
		setHoveredComponent(discoverComponents({
			x,
			y,
			filter: (entry) => entry.type === "component"
		})[0]?.contentLinkUuid ?? null);
	}, [setHoveredComponent, discoverComponents]);
	const handleMouseMove = useThrottledCallback((event) => {
		event.stopPropagation();
		findAndSetHoveredComponent(event.clientX, event.clientY);
	}, 1e3 / 60, [findAndSetHoveredComponent]);
	const handleMouseLeave = useCallback((event) => {
		event.stopPropagation();
		findAndSetHoveredComponent(event.clientX, event.clientY);
	}, [findAndSetHoveredComponent]);
	const handleClick = useCallback((e) => {
		e.stopPropagation();
		setSelectedComponent(contentLinkUuid ?? "");
	}, [setSelectedComponent, contentLinkUuid]);
	const showFrame = [selectedContentLinkUuid, hoveredContentLinkUuid].includes(contentLinkUuid ?? "") && !isDragging;
	const isDraggable = Boolean(componentId && regionId && componentType?.id);
	const classes = useComponentDecoratorClasses({
		contentLinkUuid,
		isLocalized,
		isFragment: Boolean(isFragment)
	});
	const context = React.useMemo(() => ({
		componentId: id,
		name,
		contentLinkUuid
	}), [
		id,
		name,
		contentLinkUuid
	]);
	const handleDragOver = React.useCallback((event) => {
		if (draggingSourceContentLinkUuid !== contentLinkUuid) event.preventDefault();
	}, [draggingSourceContentLinkUuid, contentLinkUuid]);
	const handleMouseDown = React.useCallback((event) => {
		if (contentLinkUuid) {
			event.stopPropagation();
			setPendingDragContentLinkUuid(contentLinkUuid);
		}
	}, [contentLinkUuid, setPendingDragContentLinkUuid]);
	const handleDragStart = React.useCallback((event) => {
		event.stopPropagation();
		if (componentId && regionId && componentType?.id) startComponentMove(componentId, regionId, componentType.id, contentLinkUuid);
	}, [
		componentId,
		regionId,
		componentType?.id,
		contentLinkUuid,
		startComponentMove
	]);
	if (!isVisible) return /* @__PURE__ */ jsx(Fragment, {});
	if (isEmbedded) return /* @__PURE__ */ jsx(ComponentContext.Provider, {
		value: context,
		children
	});
	return /* @__PURE__ */ jsxs("div", {
		ref: dragRef,
		className: classes,
		draggable: isPendingDrag && isDraggable,
		onClick: handleClick,
		onDragOver: handleDragOver,
		onDragStart: handleDragStart,
		onMouseMove: handleMouseMove,
		onMouseLeave: handleMouseLeave,
		onMouseDown: handleMouseDown,
		"data-component-type": componentType?.id,
		"data-testid": `design-component-${componentId}`,
		children: [/* @__PURE__ */ jsx("div", { className: "pd-design__component__drop-target" }), /* @__PURE__ */ jsx(DesignFrame, {
			showFrame,
			componentId,
			contentLinkUuid,
			localized: isLocalized,
			name: componentName,
			parentId: parentComponentId,
			isMoveable: isDraggable,
			regionId,
			children: /* @__PURE__ */ jsx(ComponentContext.Provider, {
				value: context,
				children
			})
		})]
	});
}

//#endregion
export { DesignComponent };
//# sourceMappingURL=DesignComponent.js.map