import "./modeDetection.js";
import { n as usePageDesignerMode, t as PageDesignerProvider } from "./PageDesignerProvider.js";
import { i as useRegionContext, n as useIsWithinEmbeddedSubtree, t as EmbeddedSubtreeProvider } from "./EmbeddedSubtreeContext.js";
import React, { lazy } from "react";
import { Fragment, jsx } from "react/jsx-runtime";

//#region src/design/react/core/PageDesignerPageMetadataProvider.tsx
const LazyPageRegistration = lazy(() => import("./PageRegistration.js").then((module) => ({ default: module.PageRegistration })));
/**
* Provides the page metadata for Page Designer.
*/
function PageDesignerPageMetadataProvider({ page, children }) {
	const { isDesignMode } = usePageDesignerMode();
	if (!isDesignMode) return /* @__PURE__ */ jsx(Fragment, { children });
	return /* @__PURE__ */ jsx(LazyPageRegistration, {
		page,
		children
	});
}

//#endregion
//#region src/design/react/core/ComponentDecorator.tsx
const LazyDesignComponent = lazy(() => import("./DesignComponent.js").then((module) => ({ default: module.DesignComponent })));
/**
* Creates a higher-order component that wraps React components with design-time functionality.
* In design mode, adds visual indicators, selection handling, and host communication.
* In normal mode, renders the component unchanged for optimal performance.
*
* @template TProps - The props type of the component being decorated
* @param Component - The React component to wrap with design functionality
* @returns A new component with design-time capabilities
*/
function createReactComponentDesignDecorator(Component) {
	return function DesignDecoratedComponent(props) {
		const { designMetadata, children,...componentProps } = props;
		const { isDesignMode } = usePageDesignerMode();
		return isDesignMode ? /* @__PURE__ */ jsx(LazyDesignComponent, {
			designMetadata,
			children: /* @__PURE__ */ jsx(Component, {
				...componentProps,
				children
			})
		}) : /* @__PURE__ */ jsx(Component, {
			...componentProps,
			children
		});
	};
}

//#endregion
//#region src/design/react/core/RegionDecorator.tsx
const LazyDesignRegion = lazy(() => import("./DesignRegion.js").then((module) => ({ default: module.DesignRegion })));
function createReactRegionDesignDecorator(Region) {
	return function DesignDecoratedRegion(props) {
		const { designMetadata, children, className,...componentProps } = props;
		const { isDesignMode } = usePageDesignerMode();
		return isDesignMode ? /* @__PURE__ */ jsx(LazyDesignRegion, {
			designMetadata,
			className,
			children: /* @__PURE__ */ jsx(Region, {
				...componentProps,
				children
			})
		}) : /* @__PURE__ */ jsx(Region, {
			...componentProps,
			className,
			children
		});
	};
}

//#endregion
//#region src/design/react/core/adapter.ts
/**
* React framework adapter that implements React-specific behavior
* for the framework-agnostic component registry.
*/
var ReactAdapter = class {
	/**
	* Creates a React lazy component from an importer function.
	*/
	createLazyComponent(importer) {
		return React.lazy(async () => {
			return { default: (await importer()).default };
		});
	}
	/**
	* Decorates a React component with design-time capabilities.
	* Uses the React-specific design decorator directly.
	*/
	decorateComponent(component) {
		return createReactComponentDesignDecorator(component);
	}
};
/**
* Creates a React adapter instance with optional configuration.
*/
function createReactAdapter() {
	return new ReactAdapter();
}

//#endregion
export { EmbeddedSubtreeProvider, PageDesignerPageMetadataProvider, PageDesignerProvider, createReactAdapter, createReactComponentDesignDecorator, createReactRegionDesignDecorator, useIsWithinEmbeddedSubtree, usePageDesignerMode, useRegionContext };
//# sourceMappingURL=design-react-core.js.map