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
//#region src/configs/react-router.config.ts
/**
* Storefront Next preset for React Router configuration.
* This preset enforces standard configuration for SFCC Storefront Next applications.
* Most pinned values (`serverModuleFormat`, `ssr`, the `v8` future flags, `basename`, and — in
* workspace environments — `allowedActionOrigins`) cannot be overridden: they are validated and an
* error is thrown if modified. `routeDiscovery.mode` is the one exception — it defaults to
* `'initial'` but may be overridden (e.g. to `'lazy'`); overriding it emits a warning rather than
* throwing, so customers can opt into other modes at their own risk.
*
* Environment variables:
* - `SFW_FALCON_INSTANCE` — (Optional) The Falcon instance identifier (e.g., `aws-dev2-uswest2`).
*   When set together with `SFW_FUNCTIONAL_DOMAIN`, adds workspace proxy domains to
*   `allowedActionOrigins` for CSRF protection on form actions.
* - `SFW_FUNCTIONAL_DOMAIN` — (Optional) The functional domain name (e.g., `cvw-dataplane-test`).
*   Required alongside `SFW_FALCON_INSTANCE` to construct workspace origin patterns.
*/
function storefrontNextPreset() {
	const sfwFalconInstance = process.env.SFW_FALCON_INSTANCE;
	const sfwFunctionalDomain = process.env.SFW_FUNCTIONAL_DOMAIN;
	if (sfwFalconInstance && !sfwFunctionalDomain) console.warn("[storefront-next] SFW_FALCON_INSTANCE is set but SFW_FUNCTIONAL_DOMAIN is not. allowedActionOrigins will not include workspace domains. Set both env vars to enable CSRF protection for workspace proxy origins.");
	if (sfwFunctionalDomain && !sfwFalconInstance) console.warn("[storefront-next] SFW_FUNCTIONAL_DOMAIN is set but SFW_FALCON_INSTANCE is not. allowedActionOrigins will not include workspace domains. Set both env vars to enable CSRF protection for workspace proxy origins.");
	const presetConfig = {
		appDirectory: "./src",
		buildDirectory: "build",
		routeDiscovery: { mode: "initial" },
		serverModuleFormat: "cjs",
		ssr: true,
		future: {
			v8_middleware: true,
			v8_viteEnvironmentApi: true,
			unstable_optimizeDeps: true
		},
		basename: getBasePath() || "/",
		...sfwFalconInstance && sfwFunctionalDomain && { allowedActionOrigins: [`*.dataplane.${sfwFunctionalDomain}.${sfwFalconInstance}.aws.sfdc.cl`, `*.platform.a.${sfwFunctionalDomain}.${sfwFalconInstance}.aws.sfdc.cl`] }
	};
	return {
		name: "storefront-next-preset",
		reactRouterConfig: () => presetConfig,
		reactRouterConfigResolved: ({ reactRouterConfig }) => {
			const errors = [];
			if (reactRouterConfig.routeDiscovery?.mode !== presetConfig.routeDiscovery.mode) console.warn(`[storefront-next] routeDiscovery.mode is "${reactRouterConfig.routeDiscovery?.mode}", but Storefront Next pins it to "${presetConfig.routeDiscovery.mode}". Overriding it is unsupported and may cause unexpected behavior — test thoroughly before deploying.`);
			if (reactRouterConfig.serverModuleFormat !== presetConfig.serverModuleFormat) errors.push(`serverModuleFormat: expected "${presetConfig.serverModuleFormat}", got "${reactRouterConfig.serverModuleFormat}"`);
			if (reactRouterConfig.ssr !== presetConfig.ssr) errors.push(`ssr: expected ${presetConfig.ssr}, got ${reactRouterConfig.ssr}`);
			if (reactRouterConfig.future?.v8_middleware !== presetConfig.future.v8_middleware) errors.push(`future.v8_middleware: expected ${presetConfig.future.v8_middleware}, got ${reactRouterConfig.future?.v8_middleware}`);
			if (reactRouterConfig.future?.v8_viteEnvironmentApi !== presetConfig.future.v8_viteEnvironmentApi) errors.push(`future.v8_viteEnvironmentApi: expected ${presetConfig.future.v8_viteEnvironmentApi}, got ${reactRouterConfig.future?.v8_viteEnvironmentApi}`);
			if (reactRouterConfig.basename !== presetConfig.basename) errors.push(`basename: expected ${presetConfig.basename}, got ${reactRouterConfig.basename}`);
			if (presetConfig.allowedActionOrigins && JSON.stringify(reactRouterConfig.allowedActionOrigins) !== JSON.stringify(presetConfig.allowedActionOrigins)) errors.push(`allowedActionOrigins: expected ${JSON.stringify(presetConfig.allowedActionOrigins)}, got ${JSON.stringify(reactRouterConfig.allowedActionOrigins)}`);
			if (errors.length > 0) throw new Error(`Storefront Next preset configuration was overridden. The following values must not be modified:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
		}
	};
}

//#endregion
export { storefrontNextPreset };
//# sourceMappingURL=react-router.config.js.map