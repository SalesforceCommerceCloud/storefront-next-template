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

export type RouteTreeVisitor = (route: RouteConfigEntry, resolvedPath: string) => void;

function resolveRoutePath(parentPath: string, routePath: string | undefined): string {
    if (!routePath) return parentPath;
    if (routePath.startsWith('/')) return routePath.slice(1);
    return [parentPath, routePath].filter(Boolean).join('/');
}

/**
 * Visits a nested React Router config depth-first and resolves each route's
 * complete path relative to the route tree root.
 */
export function visitRouteTree(routes: RouteConfigEntry[], visitor: RouteTreeVisitor, parentPath: string = ''): void {
    for (const route of routes) {
        const resolvedPath = resolveRoutePath(parentPath, route.path);
        visitor(route, resolvedPath);
        if (route.children) visitRouteTree(route.children, visitor, resolvedPath);
    }
}
