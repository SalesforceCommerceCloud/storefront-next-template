import { createContext, useContext } from "react";
import { jsx } from "react/jsx-runtime";

//#region src/design/react/core/RootComponentContext.tsx
const RootComponentContext = createContext(false);
/**
* Marks the single component rendered directly beneath it as the design-canvas
* root — the standalone content block being edited, which cannot be moved or
* deleted. Non-sticky: {@link DesignComponent} consumes it once and re-provides
* `false` (via {@link RootComponentResetProvider}) to its own children, so
* root-ness never propagates into nested components. No effect outside design
* mode, where the design decorators do not render.
*/
function RootComponentProvider({ children }) {
	return /* @__PURE__ */ jsx(RootComponentContext.Provider, {
		value: true,
		children
	});
}
/**
* Resets canvas-root-ness to `false` for descendants. {@link DesignComponent}
* wraps its children in this after reading {@link useIsRootComponent}, so a
* nested child of the root is never itself treated as root.
*/
function RootComponentResetProvider({ children }) {
	return /* @__PURE__ */ jsx(RootComponentContext.Provider, {
		value: false,
		children
	});
}
/**
* Whether the caller is the design-canvas root component. `false` when no
* {@link RootComponentProvider} is present, so full-page content — which the
* template never wraps — is never treated as root.
*/
function useIsRootComponent() {
	return useContext(RootComponentContext);
}

//#endregion
export { RootComponentResetProvider as n, useIsRootComponent as r, RootComponentProvider as t };
//# sourceMappingURL=RootComponentContext.js.map