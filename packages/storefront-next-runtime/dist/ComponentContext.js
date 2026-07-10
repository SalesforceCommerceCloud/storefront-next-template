import { a as useDesignState, r as useDesignContext } from "./DesignContext.js";
import React from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/design/react/hooks/useNodeToTargetStore.ts
function useNodeToTargetStore({ parentId, componentId, contentLinkUuid, regionId, nodeRef, type, contentLinkUuids, componentTypeInclusions, componentTypeExclusions, disabled = false }) {
	const { nodeToTargetMap } = useDesignState();
	React.useEffect(() => {
		const node = nodeRef.current;
		if (!node) return;
		if (disabled) {
			nodeToTargetMap.delete(node);
			return;
		}
		nodeToTargetMap.set(node, {
			parentId,
			componentId,
			contentLinkUuid,
			regionId,
			type,
			contentLinkUuids,
			componentTypeInclusions,
			componentTypeExclusions
		});
	}, [
		nodeRef,
		parentId,
		componentId,
		contentLinkUuid,
		regionId,
		type,
		contentLinkUuids,
		nodeToTargetMap,
		componentTypeInclusions,
		componentTypeExclusions,
		disabled
	]);
}

//#endregion
//#region src/design/react/hooks/useComponentType.ts
function useComponentType(componentId) {
	const { pageDesignerConfig } = useDesignContext();
	const { type = "" } = pageDesignerConfig?.components[componentId] ?? {};
	return pageDesignerConfig?.componentTypes[type] ?? null;
}

//#endregion
//#region src/design/react/components/DeleteToolboxButton.tsx
const DeleteToolboxButton = ({ title, onClick, onMouseDown = () => {} }) => /* @__PURE__ */ jsx("button", {
	className: "pd-design__frame__toolbox-button",
	title,
	type: "button",
	onMouseDown,
	onClick,
	children: /* @__PURE__ */ jsx("svg", {
		className: "pd-design__frame__delete-icon",
		viewBox: "0 0 24 24",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: /* @__PURE__ */ jsx("path", {
			d: "M18 6L6 18M6 6l12 12",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	})
});

//#endregion
//#region src/design/react/components/MoveToolboxButton.tsx
const MoveToolboxButton = ({ title }) => /* @__PURE__ */ jsx("button", {
	className: "pd-design__frame__toolbox-button",
	title,
	type: "button",
	children: /* @__PURE__ */ jsx("svg", {
		className: "pd-design__frame__move-icon",
		viewBox: "0 0 24 24",
		xmlns: "http://www.w3.org/2000/svg",
		children: /* @__PURE__ */ jsx("path", {
			d: "M22.9 11.7l-3.8-4.2c-.3-.3-.6 0-.6.4v2.7h-4.7c-.2 0-.4-.2-.4-.4V5.5h2.7c.5 0 .7-.4.4-.6l-4.1-3.8c-.2-.2-.5-.2-.7 0L7.6 4.9c-.3.3-.1.6.4.6h2.6v4.7c0 .2-.2.4-.4.4H5.5V7.9c0-.5-.4-.7-.6-.4l-3.8 4.1c-.2.2-.2.5 0 .7l3.8 4.1c.3.3.6.1.6-.4v-2.6h4.7c.2 0 .4.2.4.4v4.7H7.9c-.5 0-.7.4-.4.6l4.1 3.8c.2.2.5.2.7 0l4.1-3.8c.3-.3.1-.6-.4-.6h-2.6v-4.7c0-.2.2-.4.4-.4h4.7v2.7c0 .5.4.7.6.4l3.8-4.1c.2-.3.2-.5 0-.7z",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	})
});

//#endregion
//#region src/design/react/hooks/useLabels.ts
function useLabels() {
	const { pageDesignerConfig } = useDesignContext();
	return pageDesignerConfig?.labels ?? {};
}

//#endregion
//#region src/design/react/components/DesignOverlay.tsx
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
const DesignOverlay = () => {
	return /* @__PURE__ */ jsx("div", {
		className: "pd-design__frame__overlay",
		children: /* @__PURE__ */ jsx("svg", {
			xmlns: "http://www.w3.org/2000/svg",
			x: "0px",
			y: "0px",
			width: "52px",
			height: "52px",
			viewBox: "0 0 52 52",
			enableBackground: "new 0 0 52 52",
			xmlSpace: "preserve",
			children: /* @__PURE__ */ jsx("path", {
				fill: "#FFFFFF",
				d: "M26,2C12.7,2,2,12.7,2,26s10.7,24,24,24s24-10.7,24-24S39.3,2,26,2z M26,7C26,7,26,7,26,7C26,7,26,7,26,7\n	C26,7,26,7,26,7z M28,7.1c-0.1,0-0.1,0-0.2,0C27.9,7.1,28,7.1,28,7.1z M26,45C15.5,45,7,36.5,7,26c0-1,0.1-2.1,0.3-3\n	c1.3,0.2,2.9,0.7,3.7,1.5c1.7,1.8,3.6,3.9,5.4,4.3c0,0-0.2,0.1-0.4,0.4c-0.2,0.3-0.4,0.9-0.4,1.9c0,4.7,4.4,1.9,4.4,6.6\n	c0,4.7,5.3,6.6,5.3,2.8s3.5-5.6,3.5-8.5s-2.7-2.8-4.4-3.8c-1.8-0.9-2.7-2.4-6.1-1.9c-1.8-1.7-2.8-3.1-2-4.7c0.9-1.7,4.6-2,4.6-4.6\n	s-2.5-3.1-4.3-3.1c-0.8,0-2.5-0.6-3.9-1.3c1.7-1.7,3.8-3.1,6-4.1c1.6,0.7,4.3,1.8,6.6,1.8c2.7,0,4.1-1.9,3.7-3.1\n	c4.5,0.7,8.5,3,11.4,6.2c-1.5,0.9-3.5,1.9-7,1.9c-4.6,0-4.6,4.7-1.9,5.6c2.8,0.9,5.6-1.8,6.5,0c0.9,1.8-6.5,1.8-4.6,6.4\n	c1.9,4.6,3.7-0.1,5.6,4.5c1.9,4.6,5.6-0.7,2.8-4.3c-1.2-1.6-0.9-6.5,1.9-6.5h0.9c0.4,1.6,0.7,3.3,0.7,5C45,36.5,36.5,45,26,45z"
			})
		})
	});
};

//#endregion
//#region src/design/react/components/DesignFrame.tsx
const DesignFrame = ({ componentId, children, name, parentId, regionId, contentLinkUuid, localized = false, showFrame = false, showToolbox = true, isMoveable = true, className }) => {
	const componentType = useComponentType(componentId ?? "");
	const { deleteComponent } = useDesignState();
	const labels = useLabels();
	const nodeRef = React.useRef(null);
	const handleDelete = React.useCallback((event) => {
		event.stopPropagation();
		if (componentId) deleteComponent({
			componentId,
			contentLinkUuid: contentLinkUuid ?? "",
			sourceComponentId: parentId ?? "",
			sourceRegionId: regionId ?? ""
		});
	}, [
		deleteComponent,
		componentId,
		contentLinkUuid,
		parentId,
		regionId
	]);
	const stopPropagation = (event) => event.stopPropagation();
	return /* @__PURE__ */ jsxs("div", {
		className: [
			"pd-design__frame",
			showFrame && "pd-design__frame--visible",
			className
		].filter(Boolean).join(" "),
		ref: nodeRef,
		children: [
			showFrame && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", { className: "pd-design__frame--x" }), /* @__PURE__ */ jsx("div", { className: "pd-design__frame--y" })] }),
			/* @__PURE__ */ jsxs("div", {
				className: "pd-design__frame__label",
				onMouseDown: stopPropagation,
				children: [
					componentType?.image && /* @__PURE__ */ jsx("span", {
						className: "pd-design__icon",
						children: /* @__PURE__ */ jsx("img", {
							src: componentType.image,
							alt: ""
						})
					}),
					/* @__PURE__ */ jsx("span", {
						className: "pd-design__frame__name",
						children: name
					}),
					!localized && /* @__PURE__ */ jsx("span", {
						className: "pd-design__frame__fallback-badge",
						children: labels.fallback ?? "Fallback"
					})
				]
			}),
			showToolbox && /* @__PURE__ */ jsxs("div", {
				className: "pd-design__frame__toolbox",
				children: [isMoveable && /* @__PURE__ */ jsx(MoveToolboxButton, { title: labels.moveComponent ?? "Move component" }), /* @__PURE__ */ jsx(DeleteToolboxButton, {
					title: labels.deleteComponent ?? "Delete component",
					onMouseDown: stopPropagation,
					onClick: handleDelete
				})]
			}),
			/* @__PURE__ */ jsx(DesignOverlay, {}),
			children
		]
	});
};
DesignFrame.defaultProps = {
	parentId: void 0,
	componentId: void 0,
	showToolbox: true,
	regionId: void 0,
	showFrame: false
};

//#endregion
//#region src/design/react/core/ComponentContext.tsx
const ComponentContext = React.createContext(null);
const useComponentContext = () => React.useContext(ComponentContext);

//#endregion
export { useComponentType as a, useLabels as i, useComponentContext as n, useNodeToTargetStore as o, DesignFrame as r, ComponentContext as t };
//# sourceMappingURL=ComponentContext.js.map