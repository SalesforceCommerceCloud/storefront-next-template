import { Scripts as Scripts$1 } from "react-router";
import { getClientBundlePath } from "@salesforce/storefront-next-runtime/assets";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/utils/paths.ts
/**
* Get the configurable base path for the application.
* Reads from MRT_ENV_BASE_PATH environment variable.
*
* The base path is used for CDN routing to the correct MRT environment.
* It is prepended to all URLs: page routes, /mobify/bundle/ assets, and /mobify/proxy/api.
*
* Validation rules:
* - Must be a single path segment starting with '/'
* - Max 63 characters after the leading slash
* - Only URL-safe characters allowed
* - Returns empty string if not set
*
* @returns The sanitized base path (e.g., '/site-a' or '')
*
* @example
* // No base path configured
* getBasePath() // → ''
*
* // With base path '/storefront'
* getBasePath() // → '/storefront'
*
* // Automatically sanitizes
* // MRT_ENV_BASE_PATH='storefront/' → '/storefront'
*/
function getBasePath() {
	const basePath = process.env.MRT_ENV_BASE_PATH?.trim();
	if (!basePath) return "";
	if (!/^\/[a-zA-Z0-9_.+$~"'@:-]{1,63}$/.test(basePath)) throw new Error(`Invalid base path: "${basePath}". Base path must be a single segment starting with '/' (e.g., '/site-a'), contain only URL-safe characters, and be at most 63 characters after the leading slash.`);
	return basePath;
}

//#endregion
//#region src/react-router/Scripts.tsx
/**
* Determines if the code is running in a server-side rendering (SSR) environment.
* Returns true when window is undefined (server), false otherwise (client).
*/
const isSSR = typeof window === "undefined";
/**
* Internal component that injects bundle configuration scripts during server-side rendering.
*
* This component renders a script tag that sets up global bundle variables on the window object,
* which are used by the client-side application to locate and load the correct bundle assets.
*
* The script defines:
* - `window._BUNDLE_ID`: The unique identifier for the current bundle (from BUNDLE_ID env var, defaults to 'local')
* - `window._BUNDLE_PATH`: The path to the client bundle assets (e.g., `/mobify/bundle/{bundleId}/client/`)
*
* @returns A script element during SSR, or null during client-side rendering
* @internal
*/
const InternalServerScripts = ({ nonce }) => {
	if (!isSSR) return null;
	const bundleId = process.env.BUNDLE_ID || "local";
	const basePath = getBasePath();
	const bundlePath = getClientBundlePath();
	return /* @__PURE__ */ jsx("script", {
		id: "sf-next-bundle-config",
		nonce,
		dangerouslySetInnerHTML: { __html: `
        window._BUNDLE_ID = ${JSON.stringify(bundleId)};
        window._BUNDLE_PATH = ${JSON.stringify(bundlePath)};
        window._BASE_PATH = ${JSON.stringify(basePath)};
    ` }
	});
};
/**
* Enhanced Scripts component that wraps React Router's Scripts component with Storefront Next-specific functionality.
*
* This component extends the standard React Router Scripts component by injecting additional
* bundle configuration scripts during server-side rendering. It ensures that bundle metadata
* (ID and path) are available on the client before any other scripts execute.
*
* @private This is an internal SDK component — do not import directly.
* It is automatically applied via the `patchReactRouter` Vite plugin at build time.
* Customers should use `Scripts` from `react-router` as normal; the plugin transparently
* substitutes this enhanced version in production builds.
*
* @param props - Props passed through to the underlying React Router Scripts component
* @returns A fragment containing internal bundle scripts and React Router scripts
*/
function Scripts(props) {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(InternalServerScripts, { nonce: props.nonce }), /* @__PURE__ */ jsx(Scripts$1, { ...props })] });
}

//#endregion
export { Scripts };
//# sourceMappingURL=Scripts.js.map