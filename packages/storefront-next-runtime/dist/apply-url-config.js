//#region src/utils/index.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
/**
* Creates a matcher function from an array of path patterns.
* Supports `/**` suffix wildcards (e.g. '/resource/**', '/action/**').
* Exact paths without wildcards are matched literally.
*/
function createPatternMatcher(patterns) {
	const exactMatches = /* @__PURE__ */ new Set();
	const prefixPatterns = [];
	for (const pattern of patterns) if (pattern.endsWith("/**")) prefixPatterns.push(pattern.slice(0, -3));
	else exactMatches.add(pattern);
	return (path) => {
		if (exactMatches.has(path)) return true;
		return prefixPatterns.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
	};
}

//#endregion
//#region src/site-context/apply-url-config.ts
const DEFAULT_EXCLUDED_ROUTES = ["/resource/**", "/action/**"];
/**
* Separates routes into excluded (stay at root) and included (go under prefix).
*/
function partitionRoutes(routes, excludePatterns) {
	const isExcluded = createPatternMatcher(excludePatterns);
	const excludedRoutes = [];
	const includedRoutes = [];
	for (const route of routes) {
		const matchPath = route.path?.startsWith("/") ? route.path : `/${route.path}`;
		if (route.path && isExcluded(matchPath)) excludedRoutes.push(route);
		else includedRoutes.push(route);
	}
	return {
		excludedRoutes,
		includedRoutes
	};
}
/**
* Normalizes route paths by stripping leading `/` so they're relative under a
* parent route (React Router requirement).
*/
function normalizeRoutePaths(routes) {
	return routes.map((route) => ({
		...route,
		path: route.path?.startsWith("/") ? route.path.slice(1) : route.path
	}));
}
/**
* Creates the `site-context-wrapper` parent route entry with the given prefix.
*/
function createPrefixWrapper(prefix, children, wrapperFile) {
	return {
		id: "site-context-wrapper",
		file: wrapperFile,
		path: prefix.slice(1),
		children
	};
}
/**
* Finds the root index route (`/`) and duplicates it with its parent layout.
* Looks at the top level for pathless layouts whose direct children include an index route.
* e.g. _app (pathless) → _app._index (index: true)
* Returns: _app--root-duplicate → _app._index--root-duplicate
*/
function cloneRootIndexRoutes(routes) {
	const duplicates = [];
	for (const route of routes) if (route.index === true) duplicates.push({
		...route,
		id: `${route.id}--root-duplicate`
	});
	else if (!route.path && route.children) {
		const indexChild = route.children.find((child) => child.index === true && !child.path);
		if (indexChild) duplicates.push({
			...route,
			id: `${route.id}--root-duplicate`,
			children: [{
				...indexChild,
				id: `${indexChild.id}--root-duplicate`
			}]
		});
	}
	return duplicates;
}
/**
* Applies site context URL configuration to a set of route entries.
*
* Wraps non-excluded routes under a parent route with the configured URL prefix
* (e.g. `/:siteId/:localeId`), while keeping excluded routes (action/resource by default)
* at the root level. The homepage index route (and its parent layout) is always
* duplicated at `/` so the root URL still serves content.
*
* @param options - Configuration for URL customisation.
* @param options.routes - The flat route entries discovered from the filesystem.
* @param options.urlConfig - URL customisation configuration (prefix, excludeRoutes).
* @param options.wrapperFile - Path to the wrapper component file, relative to appDirectory.
* @returns The transformed route entries with prefix wrapping applied.
*/
function applyUrlConfig(options) {
	const { routes, urlConfig, wrapperFile } = options;
	if (!urlConfig) return routes;
	if (!urlConfig.prefix?.startsWith("/")) throw new Error(`urlConfig.prefix must start with a leading slash ("/"). Received: "${urlConfig.prefix}"`);
	if (urlConfig.prefix === "/") return routes;
	const { excludedRoutes, includedRoutes } = partitionRoutes(routes, urlConfig.excludeRoutes ?? DEFAULT_EXCLUDED_ROUTES);
	const wrappableRoutes = normalizeRoutePaths(includedRoutes);
	const wrapperRoute = createPrefixWrapper(urlConfig.prefix, wrappableRoutes, wrapperFile);
	return [
		...cloneRootIndexRoutes(includedRoutes),
		wrapperRoute,
		...excludedRoutes
	];
}

//#endregion
export { applyUrlConfig as t };
//# sourceMappingURL=apply-url-config.js.map