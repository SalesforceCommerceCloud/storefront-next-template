import React from "react";
import { jsx } from "react/jsx-runtime";

//#region src/design/react/core/RegionContext.tsx
const RegionContext = React.createContext(null);
const useRegionContext = () => React.useContext(RegionContext);

//#endregion
//#region src/design/react/core/EmbeddedSubtreeContext.tsx
const EmbeddedSubtreeContext = React.createContext(false);
/**
* Marks everything rendered beneath it as living in an embedded subtree — Page
* Designer content the host cannot resolve for select / delete / move. The
* template sets `embedded` from the embedded owner's `embedded` flag; the
* design decorators read it via {@link useIsWithinEmbeddedSubtree} to suppress
* their editing chrome.
*
* Nesting is sticky: once a subtree is embedded, descendants stay embedded even
* if an inner provider passes `embedded={false}`, since embeddedness is a
* property of the whole subtree, not any single boundary.
*/
function EmbeddedSubtreeProvider({ embedded, children }) {
	const parentEmbedded = React.useContext(EmbeddedSubtreeContext);
	return /* @__PURE__ */ jsx(EmbeddedSubtreeContext.Provider, {
		value: parentEmbedded || embedded,
		children
	});
}
/**
* Whether the caller is rendered within an {@link EmbeddedSubtreeProvider} that
* was told the subtree is embedded. `false` when no provider is present, so
* page content — which the template never wraps — is never treated as embedded.
*/
function useIsWithinEmbeddedSubtree() {
	return React.useContext(EmbeddedSubtreeContext);
}

//#endregion
export { useRegionContext as i, useIsWithinEmbeddedSubtree as n, RegionContext as r, EmbeddedSubtreeProvider as t };
//# sourceMappingURL=EmbeddedSubtreeContext.js.map