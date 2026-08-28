import "./messaging-api.js";
import { a as useComponentDiscovery, n as useDesignSelector, r as useThrottledCallback } from "./DesignContext.js";
import "./modeDetection.js";
import { n as useDesignContext } from "./DesignContext2.js";
import { i as useRegionContext, n as useIsWithinEmbeddedSubtree } from "./EmbeddedSubtreeContext.js";
import { n as RootComponentResetProvider, r as useIsRootComponent } from "./RootComponentContext.js";
import { a as useComponentType, n as useComponentContext, o as useNodeToTargetStore, r as DesignFrame, t as ComponentContext } from "./ComponentContext.js";
import React, { useCallback, useRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/design/react/hooks/useComponentDecoratorClasses.ts
function useComponentDecoratorClasses({ contentLinkUuid, isFragment, isLocalized }) {
	const isSelected = useDesignSelector((s) => s.selectedContentLinkUuid === contentLinkUuid);
	const isHoveredContentLink = useDesignSelector((s) => s.hoveredContentLinkUuid === contentLinkUuid);
	const isHovered = useDesignSelector((s) => isHoveredContentLink && !s.dragState.isDragging);
	const showFrame = useDesignSelector((s) => (isSelected || isHovered) && !s.dragState.isDragging);
	const isSourceContentLinkUuid = useDesignSelector((s) => s.dragState.sourceContentLinkUuid === contentLinkUuid);
	const isMoving = useDesignSelector((s) => s.dragState.isDragging && isSourceContentLinkUuid);
	const isDropTarget = useDesignSelector((s) => s.dragState.currentDropTarget?.contentLinkUuid === contentLinkUuid);
	const dropTargetClass = useDesignSelector((s) => {
		const insertType = s.dragState.currentDropTarget?.insertType;
		if (isDropTarget && insertType?.axis && insertType?.type) return `pd-design__drop-target__${insertType.axis}-${insertType.type}`;
		return null;
	});
	return [
		"pd-design__decorator",
		isFragment ? "pd-design__fragment" : "pd-design__component",
		showFrame && "pd-design__frame--visible",
		isSelected && "pd-design__decorator--selected",
		isHovered && "pd-design__decorator--hovered",
		isMoving && "pd-design__decorator--moving",
		!isLocalized && "pd-design__component--unlocalized",
		dropTargetClass
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
function useFocusedComponentHandler(contentLinkUuid, nodeRef, disabled) {
	const focusComponent = useDesignSelector((s) => s.focusComponent);
	const isFocused = useDesignSelector((s) => s.focusedContentLinkUuid === contentLinkUuid);
	React.useEffect(() => {
		if (!disabled && isFocused && nodeRef.current) focusComponent(nodeRef.current);
	}, [
		isFocused,
		focusComponent,
		nodeRef,
		disabled
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
	const { pageDesignerConfig } = useDesignContext() ?? {};
	const componentUpdate = useDesignSelector((s) => s.componentUpdates?.[componentId]) ?? {};
	const baseComponentInfo = pageDesignerConfig?.components?.[componentId];
	if (!baseComponentInfo) return null;
	const { name } = componentUpdate;
	return {
		...baseComponentInfo,
		name: name ?? baseComponentInfo.name
	};
}

//#endregion
//#region src/design/react/hooks/useComponentProps.ts
/**
* Hook that merges live property overrides onto a component's props.
*
* Reads any `properties` recorded for the component in the design-time
* `componentUpdates` state (populated by `ComponentPropertiesChanged` events)
* and shallow-merges them over the passed props so the wrapped component
* re-renders with the edited values.
*
* The merged result is intentionally a fresh object each call. The decorated
* component spreads those values into its own props, so `React.memo` compares
* the individual top-level values with its default shallow comparator.
*
* @param componentId - The ID of the component to resolve props for
* @param props - The component's base props
* @returns The base props, with any live overrides merged on top
*/
function useComponentProps(componentId, props) {
	const overrideProperties = useDesignSelector((s) => s.componentUpdates?.[componentId]?.properties);
	return {
		...props,
		...overrideProperties
	};
}

//#endregion
//#region src/design/react/hooks/useComponentVisibility.ts
/**
* Resolves a component's current visibility in Page Designer.
*
* A host-provided visibility override takes precedence over the component's
* base visibility. Without an override, the boolean visibility metadata maps
* to the state consumed by design-mode components.
*
* @param componentId - The component whose visibility state is being resolved.
* @param isVisible - The component's base visibility from page data.
* @returns The effective `visible` or `hidden` state for the component.
*/
function useComponentVisibility(componentId, isVisible) {
	return useDesignSelector((s) => s.componentUpdates?.[componentId]?.visibility) ?? (isVisible ? "visible" : "hidden");
}

//#endregion
//#region src/design/react/components/DesignComponent.tsx
function DesignComponent(props) {
	const { designMetadata, children,...componentProps } = props;
	const { id = "", contentLinkUuid = "", name, isFragment = false, isVisible = true, isLocalized = false } = designMetadata ?? {};
	const componentId = id;
	const componentType = useComponentType(componentId);
	const componentInfo = useComponentInfo(componentId);
	const componentVisibility = useComponentVisibility(componentId, isVisible);
	const resolvedComponentProps = useComponentProps(componentId, componentProps);
	const componentName = componentInfo?.name || componentType?.label || name || "Component";
	const dragRef = useRef(null);
	const { regionId } = useRegionContext() ?? {};
	const { componentId: parentComponentId } = useComponentContext() ?? {};
	const nodeToTargetMap = useDesignSelector((s) => s.nodeToTargetMap);
	const isSelectedContentLinkUuid = useDesignSelector((s) => s.selectedContentLinkUuid === contentLinkUuid);
	const isHoveredContentLinkUuid = useDesignSelector((s) => s.hoveredContentLinkUuid === contentLinkUuid);
	const setSelectedComponent = useDesignSelector((s) => s.setSelectedComponent);
	const setHoveredComponent = useDesignSelector((s) => s.setHoveredComponent);
	const startComponentMove = useDesignSelector((s) => s.startComponentMove);
	const setPendingDragContentLinkUuid = useDesignSelector((s) => s.setPendingDragContentLinkUuid);
	const isPendingDrag = useDesignSelector((s) => s.dragState.pendingDragContentLinkUuid === contentLinkUuid);
	const showFrame = useDesignSelector((s) => (isSelectedContentLinkUuid || isHoveredContentLinkUuid) && !s.dragState.isDragging);
	const isDraggingSourceContentLinkUuid = useDesignSelector((s) => s.dragState.sourceContentLinkUuid === contentLinkUuid);
	const registerContentLink = useDesignSelector((s) => s.registerContentLink);
	const isEmbedded = useIsWithinEmbeddedSubtree();
	const isRoot = useIsRootComponent();
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
		if (!isDraggingSourceContentLinkUuid) event.preventDefault();
	}, [isDraggingSourceContentLinkUuid]);
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
	if (componentVisibility !== "visible") return /* @__PURE__ */ jsx(Fragment, {});
	if (isEmbedded) return /* @__PURE__ */ jsx(ComponentContext.Provider, {
		value: context,
		children: children(resolvedComponentProps)
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
			isFragment: Boolean(isFragment),
			name: componentName,
			parentId: parentComponentId,
			isMoveable: isDraggable && !isRoot,
			isDeletable: !isRoot,
			regionId,
			children: /* @__PURE__ */ jsx(RootComponentResetProvider, { children: /* @__PURE__ */ jsx(ComponentContext.Provider, {
				value: context,
				children: children(resolvedComponentProps)
			}) })
		})]
	});
}

//#endregion
export { DesignComponent };
//# sourceMappingURL=DesignComponent.js.map