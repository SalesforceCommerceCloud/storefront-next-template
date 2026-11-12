import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
const CARTRIDGES_BASE_DIR = "cartridges";
const SFNEXT_BASE_CARTRIDGE_NAME = "app_storefrontnext_base";
/**
* Reject path-like `--cartridge-name` values before they are joined under `cartridges/`.
* Invalid input is rejected as-is; it is not trimmed or sanitized.
*/
function assertValidCartridgeName(cartridgeName) {
	if (cartridgeName.trim().length === 0 || cartridgeName === "." || cartridgeName === ".." || /[\\/]/.test(cartridgeName) || cartridgeName.includes("\0") || /^[a-zA-Z]:/.test(cartridgeName)) throw new Error("Invalid --cartridge-name: must be a single cartridge name, not a path.");
}
/** Metadata directory relative to `cartridges/`, for the given cartridge name. */
function cartridgeExperienceDir(cartridgeName = SFNEXT_BASE_CARTRIDGE_NAME) {
	return `${cartridgeName}/cartridge/experience`;
}
const SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR = cartridgeExperienceDir();
/**
* When enabled, automatically generates and deploys cartridge metadata before an MRT push.
* This is useful for keeping Page Designer metadata in sync with component changes.
*
* When enabled:
* 1. Generates cartridge metadata from decorated components
* 2. Deploys the cartridge to Commerce Cloud (requires dw.json configuration)
* 3. Proceeds with the MRT push
*
* To enable: Set this to `true` in your local config.ts
* Default: false (manual cartridge generation/deployment via `sfnext generate-cartridge` and `sfnext deploy-cartridge`)
*/
const GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH = false;
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
* Load runtime config from config.server.ts for MRT bundle settings.
*
* Keep in sync with @salesforce/storefront-next-runtime/src/config/load-config.ts.
*/
async function loadRuntimeConfig(projectDirectory) {
	if (!projectDirectory) return;
	const configPath = resolve(projectDirectory, "config.server.ts");
	if (!existsSync(configPath)) return;
	try {
		const { createJiti } = await import("jiti");
		const mod = await createJiti(import.meta.url, {
			fsCache: false,
			interopDefault: true
		}).import(configPath);
		return (mod.default ?? mod).runtime;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`[storefront-next-dev] Found config.server.ts at ${configPath} but failed to import it.\n${reason}`, { cause: error });
	}
}
const buildMrtConfig = async (_buildDirectory, projectDirectory) => {
	const ssrEntryPoint = getMrtEntryFile("production");
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
	const runtimeConfig = await loadRuntimeConfig(projectDirectory);
	const ssrOnly = mergePatterns(defaultSsrOnly, runtimeConfig?.ssrOnly);
	const ssrShared = mergePatterns(defaultSsrShared, runtimeConfig?.ssrShared);
	const ssrParameters = {
		...defaultSsrParameters,
		...runtimeConfig?.ssrParameters ?? {}
	};
	if (!ssrParameters.envBasePath) delete ssrParameters.envBasePath;
	return {
		ssrOnly,
		ssrShared,
		ssrParameters
	};
};

//#endregion
export { assertValidCartridgeName as a, loadRuntimeConfig as c, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR as i, GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH as n, buildMrtConfig as o, SFNEXT_BASE_CARTRIDGE_NAME as r, cartridgeExperienceDir as s, CARTRIDGES_BASE_DIR as t };