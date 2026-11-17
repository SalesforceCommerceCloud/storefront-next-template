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
import { matchRoutes, type RouteObject } from 'react-router';

/** SDK-owned metadata contract, independent of React Router's private manifest. */
export interface CompiledRouteMetadata {
    id: string;
    parentId?: string;
    path?: string;
    index?: boolean;
    caseSensitive?: boolean;
    isDocument: boolean;
}

/** Treat route records as immutable; replace their identity when metadata changes. */
export type CompiledRoutes = Readonly<Record<string, CompiledRouteMetadata>>;
export interface CompiledRouteManifest {
    routes: CompiledRoutes;
}

const trees = new WeakMap<CompiledRoutes, RouteObject[]>();

function getTree(routes: CompiledRoutes): RouteObject[] {
    const cached = trees.get(routes);
    if (cached) return cached;
    const children = new Map<string | undefined, RouteObject[]>();
    const entries = Object.values(routes);
    // Two linear passes preserve manifest sibling order, including equal-ranked routes.
    for (const entry of entries) {
        if (!children.has(entry.parentId)) children.set(entry.parentId, []);
    }
    for (const entry of entries) {
        const common = { id: entry.id, path: entry.path, caseSensitive: entry.caseSensitive };
        const route: RouteObject = entry.index
            ? { ...common, index: true }
            : { ...common, children: children.get(entry.id) };
        children.get(entry.parentId)?.push(route);
    }
    const tree = children.get(undefined) ?? [];
    trees.set(routes, tree);
    return tree;
}

/** Match the compiled tree using React Router's public ranking, decoding and basename rules. */
export function matchCompiledRoute(routes: CompiledRoutes, pathname: string, basename = '/') {
    const winner = matchRoutes(getTree(routes), pathname, basename)?.at(-1);
    if (!winner?.route.id) return null;
    return { metadata: routes[winner.route.id], params: winner.params };
}
