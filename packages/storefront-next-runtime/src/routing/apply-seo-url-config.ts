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
import type { SeoRoutesConfig } from '../config/types';
import { visitRouteTree } from './route-tree';
import { collectSeoRouteAliases, normalizeSeoRoutePrefix, type SeoRouteAliases } from './seo-route-config';

export type ApplySeoUrlConfigOptions = {
    routes: RouteConfigEntry[];
    config?: SeoRoutesConfig;
    routeIds: {
        product: string;
        category: string;
    };
    wrapperFile: string;
};

function findRouteMatches(routes: RouteConfigEntry[], routeId: string): RouteConfigEntry[] {
    const matches: RouteConfigEntry[] = [];
    visitRouteTree(routes, (route) => {
        if (route.id === routeId) matches.push(route);
    });
    return matches;
}

function collectExistingStaticPrefixes(
    routes: RouteConfigEntry[],
    excludedRouteIds: ReadonlySet<string>
): Map<string, string> {
    const prefixes = new Map<string, string>();
    visitRouteTree(routes, (route, fullPath) => {
        if (!excludedRouteIds.has(route.id ?? '')) {
            const firstSegment = fullPath.split('/').find(Boolean);
            if (firstSegment && !firstSegment.startsWith(':') && firstSegment !== '*') {
                const seoPrefix = normalizeSeoRoutePrefix(firstSegment.replace(/\?$/, ''));
                // Keep the first (shallowest) match so a collision error names the branch root,
                // not a deeper descendant that happens to share the segment.
                if (!prefixes.has(seoPrefix)) prefixes.set(seoPrefix, fullPath);
            }
        }
    });
    return prefixes;
}

function validateNoStaticCollisions(
    routes: RouteConfigEntry[],
    routeIds: ApplySeoUrlConfigOptions['routeIds'],
    aliases: SeoRouteAliases
): void {
    const existingPrefixes = collectExistingStaticPrefixes(routes, new Set(Object.values(routeIds)));

    for (const prefix of [...aliases.product, ...aliases.category]) {
        const existingPath = existingPrefixes.get(normalizeSeoRoutePrefix(prefix));
        if (existingPath) {
            throw new Error(
                `[storefront-next-runtime] SEO route prefix "${prefix}" collides with existing route "${existingPath}".`
            );
        }
    }
}

function createAliasRoutes(routeId: string, aliases: string[], wrapperFile: string): RouteConfigEntry[] {
    return aliases.map((prefix) => ({
        id: `${routeId}--seo-alias--${normalizeSeoRoutePrefix(prefix)}`,
        file: wrapperFile,
        path: `${prefix}/*`,
    }));
}

function transformTargetRoutes(
    routes: RouteConfigEntry[],
    routeIds: ApplySeoUrlConfigOptions['routeIds'],
    aliases: SeoRouteAliases,
    wrapperFile: string
): RouteConfigEntry[] {
    const aliasesByRouteId = new Map([
        [routeIds.product, aliases.product],
        [routeIds.category, aliases.category],
    ]);

    return routes.map((route) => {
        const routeAliases = route.id ? aliasesByRouteId.get(route.id) : undefined;
        if (route.id && routeAliases) {
            return {
                ...route,
                path: undefined,
                children: createAliasRoutes(route.id, routeAliases, wrapperFile),
            };
        }

        return {
            ...route,
            children: route.children
                ? transformTargetRoutes(route.children, routeIds, aliases, wrapperFile)
                : route.children,
        };
    });
}

/**
 * Compiles per-site SEO prefixes into static React Router route aliases.
 *
 * The canonical product and category route modules become pathless parents so
 * their IDs remain stable for `useRouteLoaderData()` and extension consumers.
 * Pass-through alias children own the configured static-prefix splats.
 */
export function applySeoUrlConfig({
    routes,
    config,
    routeIds,
    wrapperFile,
}: ApplySeoUrlConfigOptions): RouteConfigEntry[] {
    if (!config) return routes;

    const aliases = collectSeoRouteAliases(config);

    for (const routeId of Object.values(routeIds)) {
        const matches = findRouteMatches(routes, routeId);
        if (matches.length === 0) {
            throw new Error(`[storefront-next-runtime] SEO target route ID "${routeId}" was not found.`);
        }
        if (matches.length > 1) {
            throw new Error(`[storefront-next-runtime] SEO target route ID "${routeId}" was found more than once.`);
        }
        if (matches[0].children?.length) {
            throw new Error(`[storefront-next-runtime] SEO target route ID "${routeId}" must be a leaf route.`);
        }
    }

    validateNoStaticCollisions(routes, routeIds, aliases);

    return transformTargetRoutes(routes, routeIds, aliases, wrapperFile);
}
