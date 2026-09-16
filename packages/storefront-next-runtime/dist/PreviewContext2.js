import { n as createClientApi } from "./messaging-api.js";
import { n as usePreviewContext, t as PreviewContext } from "./PreviewContext.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsx } from "react/jsx-runtime";

//#region src/design/react/context/PreviewContext.tsx
const noop = () => {};
/**
* Provider component that enables preview-time functionality for child components.
*
* Unlike {@link DesignProvider}, this provider does NOT mount the editor overlays or
* seed a page from the host — the storefront renders exactly as it does for a real
* shopper. It opens the messaging channel purely so the client can push events
* (route changes, scroll, errors) back to the host.
*/
const PreviewProvider = ({ children, targetOrigin, clientId, usid, clientConnectionTimeout, clientConnectionInterval, clientLogger = noop }) => {
	const [isConnected, setIsConnected] = useState(false);
	const clientApi = useMemo(() => createClientApi({
		logger: clientLogger,
		emitter: {
			postMessage: (message) => window.parent.postMessage(message, targetOrigin),
			addEventListener: (handler) => {
				const listener = (event) => handler(event.data);
				window.addEventListener("message", listener);
				return () => window.removeEventListener("message", listener);
			}
		},
		id: clientId
	}), [
		targetOrigin,
		clientId,
		clientLogger
	]);
	useEffect(() => {
		clientApi.connect({
			timeout: clientConnectionTimeout,
			interval: clientConnectionInterval,
			onHostConnected: () => {
				setIsConnected(true);
			},
			onHostDisconnected: (reconnect) => {
				setIsConnected(false);
				reconnect();
			},
			onError: noop,
			usid
		});
		return () => {
			clientApi.disconnect();
			setIsConnected(false);
		};
	}, [
		clientApi,
		clientConnectionTimeout,
		clientConnectionInterval,
		usid
	]);
	const notifyClientRouteChanged = useCallback((url) => clientApi.notifyClientRouteChanged({ url }), [clientApi]);
	const contextValue = useMemo(() => ({
		isPreviewMode: true,
		clientApi,
		isConnected,
		notifyClientRouteChanged
	}), [
		clientApi,
		isConnected,
		notifyClientRouteChanged
	]);
	return /* @__PURE__ */ jsx(PreviewContext.Provider, {
		value: contextValue,
		children
	});
};

//#endregion
export { PreviewContext, PreviewProvider, usePreviewContext };
//# sourceMappingURL=PreviewContext2.js.map