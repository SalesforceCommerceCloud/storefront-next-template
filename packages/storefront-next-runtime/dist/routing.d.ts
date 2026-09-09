import { RouteConfigEntry } from "@react-router/dev/routes";

//#region src/routing/flat-routes.d.ts

/**
 * Discovers all file-based routes, merges extension routes, merges any per-vertical
 * route overrides, and applies site context URL configuration if defined in the
 * project's `config.server.ts`.
 *
 * 1. Discover routes from the filesystem using React Router's `flatRoutes`.
 * 2. Scan `src/extensions/` for extension routes and merge them into the route tree.
 * 3. If `process.env.VERTICAL` is set, scan `src/verticals/${VERTICAL}/routes/` and
 *    merge any matching overrides on top (vertical wins on file-id collision).
 * 4. Load `config.server.ts` from the project root and compile configured SEO aliases.
 * 5. If `app.url.prefix` is configured, wrap routes under the URL prefix
 *    (e.g. `/:siteId/:localeId`).
 *
 * @param options.ignoredRouteFiles - Glob patterns for files to ignore. Defaults to test files.
 * @param options.rootDirectory - Root directory for route discovery, relative to appDirectory.
 * @returns The final route config entries for React Router.
 */
declare function flatRoutes(options?: {
  ignoredRouteFiles?: string[];
  rootDirectory?: string;
}): Promise<RouteConfigEntry[]>;
//#endregion
//#region src/routing/merge-routes.d.ts

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
declare function mergeRoutes(routes: RouteConfigEntry[], extensionRoutes: RouteConfigEntry[], extensionIdPrefix: string): void;
//#endregion
export { flatRoutes, mergeRoutes };
//# sourceMappingURL=routing.d.ts.map