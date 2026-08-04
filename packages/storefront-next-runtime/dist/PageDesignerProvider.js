import { n as isDesignModeActive, r as isPreviewModeActive } from "./modeDetection.js";
import { Suspense, createContext, lazy, useContext, useMemo } from "react";
import { Fragment, jsx } from "react/jsx-runtime";

//#region src/design/react/core/PageDesignerProvider.tsx
const LazyDesignProvider = lazy(() => import("./DesignContext2.js").then((module) => ({ default: module.DesignProvider })));
const LazyPreviewProvider = lazy(() => import("./PreviewContext.js").then((module) => ({ default: module.PreviewProvider })));
const LoadingFallback = () => null;
const PageDesignerContext = createContext({
	isDesignMode: false,
	isPreviewMode: false
});
const usePageDesignerMode = () => useContext(PageDesignerContext);
const PageDesignerProvider = ({ children, targetOrigin, clientId, usid, clientLogger, clientConnectionTimeout, clientConnectionInterval, mode }) => {
	const contextValue = useMemo(() => ({
		isDesignMode: mode === "EDIT" || isDesignModeActive(),
		isPreviewMode: mode === "PREVIEW" || isPreviewModeActive()
	}), [mode]);
	const { isDesignMode, isPreviewMode } = contextValue;
	if (isDesignMode && !targetOrigin) throw new Error("PageDesignerProvider: targetOrigin is required when in design mode for security reasons. This should be the origin of the host application that contains this iframe ");
	if (!isDesignMode && !isPreviewMode) return /* @__PURE__ */ jsx(Fragment, { children });
	let content = children;
	if (isPreviewMode) content = /* @__PURE__ */ jsx(Suspense, {
		fallback: /* @__PURE__ */ jsx(LoadingFallback, {}),
		children: /* @__PURE__ */ jsx(LazyPreviewProvider, { children: content })
	});
	if (isDesignMode) content = /* @__PURE__ */ jsx(Suspense, {
		fallback: /* @__PURE__ */ jsx(LoadingFallback, {}),
		children: /* @__PURE__ */ jsx(LazyDesignProvider, {
			targetOrigin,
			clientId,
			usid,
			clientLogger,
			clientConnectionTimeout,
			clientConnectionInterval,
			children: content
		})
	});
	return /* @__PURE__ */ jsx(PageDesignerContext.Provider, {
		value: contextValue,
		children: content
	});
};
PageDesignerProvider.defaultProps = {
	clientConnectionTimeout: 6e4,
	clientConnectionInterval: 1e3,
	mode: void 0,
	clientLogger: () => {}
};

//#endregion
export { usePageDesignerMode as n, PageDesignerProvider as t };
//# sourceMappingURL=PageDesignerProvider.js.map