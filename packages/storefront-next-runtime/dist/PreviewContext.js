import { createContext, useContext } from "react";

//#region src/design/react/core/PreviewContext.tsx
const noop = () => {};
const PreviewContext = createContext({
	isPreviewMode: false,
	isConnected: false,
	notifyClientRouteChanged: noop
});
const usePreviewContext = () => useContext(PreviewContext);

//#endregion
export { usePreviewContext as n, PreviewContext as t };
//# sourceMappingURL=PreviewContext.js.map