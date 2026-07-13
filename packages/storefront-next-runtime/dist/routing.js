import { t as loadConfig } from "./load-config.js";
import { t as applyUrlConfig } from "./apply-url-config.js";
import path from "node:path";
import { flatRoutes as flatRoutes$1 } from "@react-router/fs-routes";
import fs from "node:fs/promises";

//#region src/routing/merge-routes.ts
/**
* Find the nearest route by its ID in the route tree
* @param routes - The route subtree to search
* @param layoutId - The route ID to find (e.g., "routes/_app" or "routes/_app.account")
* @param rootPath - The full route path from the root to the current route (default: '')
* @returns An object with routes array, routeIndex, and path, or null if not found. Returns exact match if found, otherwise returns route where route.id is a prefix of layoutId
*/
function findNearestRoute(routes, layoutId, rootPath = "") {
	for (let i = 0; i < routes.length; i++) {
		const route = routes[i];
		const path$1 = route.path ? `${rootPath}/${route.path}` : rootPath;
		if (route.id === layoutId) return {
			routes,
			routeIndex: i,
			path: path$1
		};
		if (route.children) {
			const found = findNearestRoute(route.children, layoutId, path$1);
			if (found) return found;
		}
		if (route.id && layoutId.startsWith(route.id)) return {
			routes,
			routeIndex: i,
			path: path$1
		};
	}
	return null;
}
/**
* Merges extension routes into the main routes array, handling route nesting.
* Routes without IDs are added directly to the routes array. Routes with IDs are processed
* to remove the extension prefix and are either:
* - Added as children of existing routes (if a nearest route is found via prefix matching)
* - Replace existing routes (if an exact match is found)
* - Added directly to the routes array (if no matching route exists)
*
* When adding as a child, the parent route's path is clipped from the child route's path.
*
* @param routes - The main routes array to merge into (mutated in place)
* @param extensionRoutes - The extension routes to merge
* @param extensionIdPrefix - The prefix to remove from extension route IDs (e.g., "extensions/store-locator/")
*/
function mergeRoutes(routes, extensionRoutes, extensionIdPrefix) {
	for (const route of extensionRoutes) {
		if (!route.id) {
			routes.unshift(route);
			continue;
		}
		const routeId = route.id.replace(extensionIdPrefix, "");
		const nearestRouteResult = findNearestRoute(routes, routeId);
		if (nearestRouteResult) {
			const nearestRoute = nearestRouteResult.routes[nearestRouteResult.routeIndex];
			if (nearestRoute.id === routeId) nearestRouteResult.routes[nearestRouteResult.routeIndex].file = route.file;
			else {
				let path$1 = route.path?.slice(nearestRouteResult.path.length);
				if (path$1?.startsWith("/")) path$1 = path$1.slice(1);
				path$1 = path$1 ? path$1 : void 0;
				if (!nearestRoute.children) nearestRoute.children = [];
				nearestRoute.children.unshift({
					...route,
					id: routeId,
					path: path$1
				});
			}
		} else routes.unshift({
			...route,
			id: routeId
		});
	}
}

//#endregion
//#region src/routing/flat-routes.ts
const APP_SRC_DIR = "src";
const EXTENSIONS_DIR = "extensions";
const VERTICALS_DIR = "verticals";
const APP_WRAPPER_FILE = "app-wrapper.tsx";
/**
* Scans `src/extensions/` for extension route directories and merges any discovered
* routes into the base route tree. Mutates `routes` in place via `mergeRoutes`.
*/
async function discoverExtensionRoutes(ignoredRouteFiles, routes) {
	const extensionsDir = path.join(".", APP_SRC_DIR, EXTENSIONS_DIR);
	const extensions = await fs.readdir(extensionsDir).then((entries) => entries.sort(), () => []);
	for (const ext of extensions) {
		const routesDir = `${EXTENSIONS_DIR}/${ext}/routes`;
		const routesDirFull = path.join(".", APP_SRC_DIR, EXTENSIONS_DIR, ext, "routes");
		try {
			await fs.access(routesDirFull);
			mergeRoutes(routes, await flatRoutes$1({
				ignoredRouteFiles,
				rootDirectory: routesDir
			}), `${EXTENSIONS_DIR}/${ext}/`);
		} catch {}
	}
}
/**
* Scans `src/verticals/${VERTICAL}/routes/` for per-vertical route overrides and
* merges them into the route tree. The `VERTICAL` env var selects which overlay
* to apply; when unset or pointing at a directory that doesn't exist, the
* function is a no-op. Routes whose stripped IDs match an existing route swap
* the file pointer (vertical wins); novel IDs are added as new routes.
*
* Runs after `discoverExtensionRoutes` so a vertical can override extension
* routes when needed (extensions ship as canonical, verticals are the highest
* layer in the precedence chain).
*
* Files inside the verticals tree that aren't routes (components, hooks, etc.)
* are picked up at dev time by Vite's vertical-first `@/X` alias chain (in the
* template's `vite.config.ts`) and at mirror time by `overlayVerticalSrcTree()`
* in `scripts/internal/mirror.mjs`. Routes are special because React Router's
* `flatRoutes` walks the filesystem directly and bypasses the Vite resolver,
* so they need this explicit merge step.
*/
async function discoverVerticalRoutes(ignoredRouteFiles, routes) {
	const vertical = process.env.VERTICAL;
	if (!vertical) return;
	const routesDir = `${VERTICALS_DIR}/${vertical}/routes`;
	const routesDirFull = path.join(".", APP_SRC_DIR, VERTICALS_DIR, vertical, "routes");
	try {
		await fs.access(routesDirFull);
	} catch {
		return;
	}
	mergeRoutes(routes, await flatRoutes$1({
		ignoredRouteFiles,
		rootDirectory: routesDir
	}), `${VERTICALS_DIR}/${vertical}/`);
}
/**
* Discovers all file-based routes, merges extension routes, merges any per-vertical
* route overrides, and applies site context URL configuration if defined in the
* project's `config.server.ts`.
*
* 1. Discover routes from the filesystem using React Router's `flatRoutes`.
* 2. Scan `src/extensions/` for extension routes and merge them into the route tree.
* 3. If `process.env.VERTICAL` is set, scan `src/verticals/${VERTICAL}/routes/` and
*    merge any matching overrides on top (vertical wins on file-id collision).
* 4. Load `config.server.ts` from the project root and, if `app.url` is configured,
*    wrap routes under the URL prefix (e.g. `/:siteId/:localeId`).
*
* @param options.ignoredRouteFiles - Glob patterns for files to ignore. Defaults to test files.
* @param options.rootDirectory - Root directory for route discovery, relative to appDirectory.
* @returns The final route config entries for React Router.
*/
async function flatRoutes(options) {
	const { ignoredRouteFiles = ["**/*.test.{ts,tsx}"], rootDirectory } = options ?? {};
	const routes = await flatRoutes$1({
		ignoredRouteFiles,
		rootDirectory
	});
	await discoverExtensionRoutes(ignoredRouteFiles, routes);
	await discoverVerticalRoutes(ignoredRouteFiles, routes);
	const { app } = await loadConfig();
	const urlConfig = app?.url;
	if (urlConfig?.prefix) {
		try {
			await fs.access(path.join(".", APP_SRC_DIR, APP_WRAPPER_FILE));
		} catch {
			throw new Error(`[storefront-next-runtime] URL prefix "${urlConfig.prefix}" is configured but "${APP_SRC_DIR}/${APP_WRAPPER_FILE}" does not exist. Create this file with: export { default } from '@salesforce/storefront-next-runtime/routing/app-wrapper';`);
		}
		return applyUrlConfig({
			routes,
			urlConfig,
			wrapperFile: APP_WRAPPER_FILE
		});
	}
	return routes;
}

//#endregion
export { flatRoutes, mergeRoutes };
//# sourceMappingURL=routing.js.map