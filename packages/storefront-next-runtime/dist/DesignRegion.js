import "./messaging-api.js";
import { i as isComponentTypeAllowedInRegion, n as useDesignSelector } from "./DesignContext.js";
import "./modeDetection.js";
import "./DesignContext2.js";
import { n as useIsWithinEmbeddedSubtree, r as RegionContext } from "./EmbeddedSubtreeContext.js";
import { i as useLabels, n as useComponentContext, o as useNodeToTargetStore, r as DesignFrame } from "./ComponentContext.js";
import React, { useCallback, useMemo } from "react";
import { jsx } from "react/jsx-runtime";

//#region src/design/react/hooks/useRegionDecoratorClasses.ts
function useRegionDecoratorClasses({ regionId, componentTypeInclusions, componentTypeExclusions }) {
	const isHovered = useDesignSelector((s) => regionId && s.dragState.currentDropTarget?.regionId === regionId);
	const componentType = useDesignSelector((s) => s.dragState.componentType);
	const isComponentAllowed = useMemo(() => isComponentTypeAllowedInRegion(componentType, componentTypeInclusions, componentTypeExclusions), [
		componentType,
		componentTypeInclusions,
		componentTypeExclusions
	]);
	return [
		"pd-design__decorator",
		"pd-design__region",
		isHovered && isComponentAllowed && "pd-design__region--hovered pd-design__frame--visible"
	].filter(Boolean).join(" ");
}

//#endregion
//#region src/design/react/components/DesignRegion.tsx
function DesignRegion(props) {
	const { designMetadata, children, className } = props;
	const { name, id = "", contentLinkUuids = [], componentTypeInclusions = [], componentTypeExclusions = [] } = designMetadata ?? {};
	const nodeRef = React.useRef(null);
	const classes = useRegionDecoratorClasses({
		regionId: id,
		componentTypeInclusions,
		componentTypeExclusions
	});
	const dragComponentType = useDesignSelector((s) => s.dragState.componentType);
	const isCurrentDropTarget = useDesignSelector((s) => s.dragState.currentDropTarget?.regionId === id);
	const labels = useLabels();
	const showFrame = Boolean(id && isCurrentDropTarget);
	const isEmbedded = useIsWithinEmbeddedSubtree();
	const { contentLinkUuid: parentContentLinkUuid } = useComponentContext() ?? {};
	useNodeToTargetStore({
		type: "region",
		nodeRef,
		parentId: parentContentLinkUuid,
		contentLinkUuids,
		regionId: id,
		componentTypeInclusions,
		componentTypeExclusions,
		disabled: isEmbedded
	});
	const context = React.useMemo(() => ({
		regionId: id,
		contentLinkUuids
	}), [id, contentLinkUuids]);
	const handleDragOver = useCallback((event) => {
		if (isComponentTypeAllowedInRegion(dragComponentType, componentTypeInclusions, componentTypeExclusions)) event.preventDefault();
	}, [
		dragComponentType,
		componentTypeInclusions,
		componentTypeExclusions
	]);
	if (isEmbedded) return /* @__PURE__ */ jsx(RegionContext.Provider, {
		value: context,
		children
	});
	return /* @__PURE__ */ jsx("div", {
		className: classes,
		ref: nodeRef,
		onDragOver: handleDragOver,
		"data-region-id": id,
		children: /* @__PURE__ */ jsx(DesignFrame, {
			name: name ?? labels.defaultRegionName ?? "Region",
			regionId: id,
			localized: true,
			showFrame,
			showToolbox: false,
			className,
			children: /* @__PURE__ */ jsx(RegionContext.Provider, {
				value: context,
				children
			})
		})
	});
}

//#endregion
export { DesignRegion };
//# sourceMappingURL=DesignRegion.js.map