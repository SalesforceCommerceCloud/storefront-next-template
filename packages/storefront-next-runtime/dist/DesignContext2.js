import { n as isDesignModeActive, r as isPreviewModeActive } from "./modeDetection.js";
import { n as usePreviewContext } from "./PreviewContext.js";
import React, { Suspense, createContext, lazy, useContext, useEffect, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/design/react/core/PageDesignerProvider.tsx
const LazyDesignProvider = lazy(() => import("./DesignContext3.js").then((module) => ({ default: module.DesignProvider })));
const LazyPreviewProvider = lazy(() => import("./PreviewContext2.js").then((module) => ({ default: module.PreviewProvider })));
const LoadingFallback = () => null;
const noopLogger = () => {};
/** Reports browser navigations to the Page Designer host. */
const PreviewRouteReporter = () => {
	const { isPreviewMode, notifyClientRouteChanged } = usePreviewContext();
	useEffect(() => {
		if (!isPreviewMode) return;
		const reportCurrentUrl = () => notifyClientRouteChanged(window.location.href);
		const navigation = window.navigation;
		reportCurrentUrl();
		if (!navigation) return;
		navigation.addEventListener("currententrychange", reportCurrentUrl);
		return () => navigation.removeEventListener("currententrychange", reportCurrentUrl);
	}, [isPreviewMode, notifyClientRouteChanged]);
	return null;
};
const PageDesignerContext = createContext({
	isDesignMode: false,
	isPreviewMode: false
});
const usePageDesignerMode = () => useContext(PageDesignerContext);
const PageDesignerProvider = ({ children, targetOrigin, clientId, usid, pageUpdateMode, clientLogger = noopLogger, clientConnectionTimeout = 6e4, clientConnectionInterval = 1e3, mode }) => {
	const [stickyMode, setStickyMode] = useState(() => {
		if (mode) return mode;
		if (isDesignModeActive()) return "EDIT";
		if (isPreviewModeActive()) return "PREVIEW";
	});
	useEffect(() => {
		if (mode && mode !== stickyMode) setStickyMode(mode);
	}, [mode, stickyMode]);
	const contextValue = useMemo(() => ({
		isDesignMode: stickyMode === "EDIT",
		isPreviewMode: stickyMode === "PREVIEW"
	}), [stickyMode]);
	const { isDesignMode, isPreviewMode } = contextValue;
	if ((isDesignMode || isPreviewMode) && !targetOrigin) throw new Error("PageDesignerProvider: targetOrigin is required in design and preview modes for security reasons. This should be the origin of the host application that contains this iframe ");
	if (!isDesignMode && !isPreviewMode) return /* @__PURE__ */ jsx(Fragment, { children });
	let content = children;
	if (isPreviewMode) content = /* @__PURE__ */ jsx(Suspense, {
		fallback: /* @__PURE__ */ jsx(LoadingFallback, {}),
		children: /* @__PURE__ */ jsx(LazyPreviewProvider, {
			targetOrigin,
			clientId,
			usid,
			clientLogger,
			clientConnectionTimeout,
			clientConnectionInterval,
			children: /* @__PURE__ */ jsxs(Fragment, { children: [content, /* @__PURE__ */ jsx(PreviewRouteReporter, {})] })
		})
	});
	if (isDesignMode) content = /* @__PURE__ */ jsx(Suspense, {
		fallback: /* @__PURE__ */ jsx(LoadingFallback, {}),
		children: /* @__PURE__ */ jsx(LazyDesignProvider, {
			targetOrigin,
			clientId,
			usid,
			pageUpdateMode,
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

//#endregion
//#region src/design/react/core/DesignContext.tsx
const DesignContext = React.createContext(null);
const useDesignContext = () => React.useContext(DesignContext);

//#endregion
export { usePageDesignerMode as i, useDesignContext as n, PageDesignerProvider as r, DesignContext as t };
//# sourceMappingURL=DesignContext2.js.map