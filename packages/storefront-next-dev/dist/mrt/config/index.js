//#region src/mrt/utils.ts
const MRT_BUNDLE_TYPE_SSR = "ssr";
const MRT_STREAMING_ENTRY_FILE = "streamingHandler";
/**
* Gets the MRT entry file for the given mode
* @param mode - The mode to get the MRT entry file for
* @returns The MRT entry file for the given mode
*/
const getMrtEntryFile = (mode) => {
	return process.env.MRT_BUNDLE_TYPE !== MRT_BUNDLE_TYPE_SSR && mode === "production" ? MRT_STREAMING_ENTRY_FILE : MRT_BUNDLE_TYPE_SSR;
};

//#endregion
//#region src/config.ts
const SFNEXT_BASE_CARTRIDGE_NAME = "app_storefrontnext_base";
/** Metadata directory relative to `cartridges/`, for the given cartridge name. */
function cartridgeExperienceDir(cartridgeName = SFNEXT_BASE_CARTRIDGE_NAME) {
	return `${cartridgeName}/cartridge/experience`;
}
const SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR = cartridgeExperienceDir();
/**
* Merge override patterns with defaults while preserving required defaults.
*
* Overrides are prepended so they can add additional globs or exclusions, while
* defaults remain in the list to prevent breaking essential artifacts.
*
* @example
* const defaults = ['server/**', 'loader.js'];
* const overrides = ['custom/**', '!static/**'];
* mergePatterns(defaults, overrides);
* // => ['custom/**', '!static/**', 'server/**', 'loader.js']
*/
const mergePatterns = (defaults, overrides) => {
	if (!overrides?.length) return defaults;
	return Array.from(new Set([...overrides, ...defaults]));
};
/**
* Build the MRT SSR configuration from the `runtime` section of `config.server.ts`.
*
* Patterns from `runtime` are merged with the defaults rather than replacing them. Pure and
* synchronous so build tooling that already has the runtime config loaded can reuse the defaults.
*
* @param runtime - The `runtime` section of `config.server.ts`, if any
* @param mode - Build mode; `production` selects the streaming entry point unless `MRT_BUNDLE_TYPE=ssr`
*/
const buildMrtSsrConfig = (runtime, mode = "production") => {
	const ssrEntryPoint = getMrtEntryFile(mode);
	const defaultSsrOnly = [
		"server/**/*",
		"package.json",
		"loader.js",
		`${ssrEntryPoint}.{js,mjs,cjs}`,
		`${ssrEntryPoint}.{js,mjs,cjs}.map`,
		"!static/**/*",
		"sfnext-server-*.mjs",
		"sfnext-server-*.mjs.map"
	];
	const defaultSsrShared = [
		"client/**/*",
		"static/**/*",
		"**/*.css",
		"**/*.png",
		"**/*.jpg",
		"**/*.jpeg",
		"**/*.gif",
		"**/*.svg",
		"**/*.ico",
		"**/*.woff",
		"**/*.woff2",
		"**/*.ttf",
		"**/*.eot"
	];
	const defaultSsrParameters = { ssrFunctionNodeVersion: "24.x" };
	const ssrOnly = mergePatterns(defaultSsrOnly, runtime?.ssrOnly);
	const ssrShared = mergePatterns(defaultSsrShared, runtime?.ssrShared);
	const ssrParameters = {
		...defaultSsrParameters,
		...runtime?.ssrParameters ?? {}
	};
	if (!ssrParameters.envBasePath) delete ssrParameters.envBasePath;
	return {
		ssrOnly,
		ssrShared,
		ssrParameters
	};
};

//#endregion
export { buildMrtSsrConfig };
//# sourceMappingURL=index.js.map