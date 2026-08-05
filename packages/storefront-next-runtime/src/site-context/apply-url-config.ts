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
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { createPatternMatcher } from '../utils';
import type { Url } from '../config/types';

const DEFAULT_EXCLUDED_ROUTES = ['/resource/**', '/action/**'];

/**
 * Separates routes into excluded (stay at root) and included (go under prefix).
 */
export function partitionRoutes(
    routes: RouteConfigEntry[],
    excludePatterns: string[]
): { excludedRoutes: RouteConfigEntry[]; includedRoutes: RouteConfigEntry[] } {
    const isExcluded = createPatternMatcher(excludePatterns);
    const excludedRoutes: RouteConfigEntry[] = [];
    const includedRoutes: RouteConfigEntry[] = [];

    for (const route of routes) {
        // Normalize path for matching — ensure leading slash so patterns like '/resource/**' work
        // regardless of whether the route path comes with or without a leading slash.
        // E.g Some routes comes from React Router flatRoutes objects where the path has no leading splash
        const matchPath = route.path?.startsWith('/') ? route.path : `/${route.path}`;
        if (route.path && isExcluded(matchPath)) {
            excludedRoutes.push(route);
        } else {
            includedRoutes.push(route);
        }
    }

    return { excludedRoutes, includedRoutes };
}

/**
 * Normalizes route paths by stripping leading `/` so they're relative under a
 * parent route (React Router requirement).
 */
export function normalizeRoutePaths(routes: RouteConfigEntry[]): RouteConfigEntry[] {
    return routes.map((route) => ({
        ...route,
        // Check for leading splash because React Router route object can contain no leading splash for a child route
        // E.g Some routes comes from React Router flatRoutes objects where the path has no leading splash
        path: route.path?.startsWith('/') ? route.path.slice(1) : route.path,
    }));
}

/**
 * Creates the `site-context-wrapper` parent route entry with the given prefix.
 */
export function createPrefixWrapper(
    prefix: string,
    children: RouteConfigEntry[],
    wrapperFile: string
): RouteConfigEntry {
    return {
        id: 'site-context-wrapper',
        file: wrapperFile,
        path: prefix.slice(1),
        children,
    };
}

/**
 * Finds the root index route (`/`) and duplicates it with its parent layout.
 * Looks at the top level for pathless layouts whose direct children include an index route.
 * e.g. _app (pathless) → _app._index (index: true)
 * Returns: _app--root-duplicate → _app._index--root-duplicate
 */
export function cloneRootIndexRoutes(routes: RouteConfigEntry[]): RouteConfigEntry[] {
    const duplicates: RouteConfigEntry[] = [];

    for (const route of routes) {
        if (route.index === true) {
            duplicates.push({
                ...route,
                id: `${route.id}--root-duplicate`,
            });
        } else if (!route.path && route.children) {
            // Only the pathless homepage index route (no `path`) represents `/`. An index
            // route with a `path` (e.g. `_app.order-lookup._index` at `order-lookup`) is the
            // index of its own subpath, not the site root, and must not be duplicated here.
            const indexChild = route.children.find((child) => child.index === true && !child.path);
            if (indexChild) {
                duplicates.push({
                    ...route,
                    id: `${route.id}--root-duplicate`,
                    children: [{ ...indexChild, id: `${indexChild.id}--root-duplicate` }],
                });
            }
        }
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
export function applyUrlConfig(options: {
    routes: RouteConfigEntry[];
    urlConfig?: Url;
    wrapperFile: string;
}): RouteConfigEntry[] {
    const { routes, urlConfig, wrapperFile } = options;
    if (!urlConfig) return routes;
    if (!urlConfig.prefix?.startsWith('/')) {
        throw new Error(`urlConfig.prefix must start with a leading slash ("/"). Received: "${urlConfig.prefix}"`);
    }
    if (urlConfig.prefix === '/') return routes;

    const excludePatterns = urlConfig.excludeRoutes ?? DEFAULT_EXCLUDED_ROUTES;

    const { excludedRoutes, includedRoutes } = partitionRoutes(routes, excludePatterns);

    const wrappableRoutes = normalizeRoutePaths(includedRoutes);
    // the route that wraps the included routes under prefix
    const wrapperRoute = createPrefixWrapper(urlConfig.prefix, wrappableRoutes, wrapperFile);

    // duplicate the app root index to keep app homepage to server at '/'
    const rootDuplicates = cloneRootIndexRoutes(includedRoutes);

    return [...rootDuplicates, wrapperRoute, ...excludedRoutes];
}
