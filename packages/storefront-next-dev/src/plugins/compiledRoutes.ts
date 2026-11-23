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
import { resolve } from 'node:path';
import { normalizePath, type Plugin } from 'vite';

const publicId = 'virtual:storefront-next/compiled-routes';
const resolvedId = `\0${publicId}`;
const manifestResolvedId = '\0virtual:react-router/server-manifest';

// Only this SDK adapter depends on the private manifest. No route modules or server
// build are imported, so middleware can match metadata without a server-build cycle.
const source = `
import manifest from 'virtual:react-router/server-manifest';
const fail = () => { throw new Error('Unsupported React Router compiled route manifest shape'); };
if (!manifest || !manifest.routes || typeof manifest.routes !== 'object' || Array.isArray(manifest.routes)) fail();
const routes = Object.create(null);
for (const [key, entry] of Object.entries(manifest.routes)) {
    if (!entry || typeof entry.id !== 'string' || entry.id !== key ||
        typeof entry.hasDefaultExport !== 'boolean' || typeof entry.hasErrorBoundary !== 'boolean') fail();
    for (const name of ['parentId', 'path']) {
        if (entry[name] !== undefined && typeof entry[name] !== 'string') fail();
    }
    for (const name of ['index', 'caseSensitive']) {
        if (entry[name] !== undefined && typeof entry[name] !== 'boolean') fail();
    }
    routes[key] = Object.freeze({ id: entry.id, parentId: entry.parentId, path: entry.path,
        index: entry.index, caseSensitive: entry.caseSensitive,
        isDocument: entry.hasDefaultExport || entry.hasErrorBoundary });
}
// Validate parent references and cycles in linear time before a tree can be cached.
const visited = new Set();
for (const route of Object.values(routes)) {
    const chain = new Set();
    let current = route;
    while (current && !visited.has(current.id)) {
        if (chain.has(current.id)) fail();
        chain.add(current.id);
        if (current.parentId !== undefined && !routes[current.parentId]) fail();
        current = routes[current.parentId];
    }
    for (const id of chain) visited.add(id);
}
export default Object.freeze({ routes: Object.freeze(routes) });
`;

/** Expose server-only, semantic compiled metadata across React Router dev and build. */
export function compiledRoutesPlugin(): Plugin {
    let serverBundles: unknown;
    let routeFiles = new Set<string>();
    return {
        name: 'storefront-next:compiled-routes',
        configResolved(config) {
            const context = (
                config as typeof config & {
                    __reactRouterPluginContext?: {
                        reactRouterConfig: {
                            serverBundles?: unknown;
                            appDirectory?: string;
                            routes?: Record<string, { file: string }>;
                        };
                    };
                }
            ).__reactRouterPluginContext;
            serverBundles = context?.reactRouterConfig.serverBundles;
            const { appDirectory, routes } = context?.reactRouterConfig ?? {};
            routeFiles = new Set(
                appDirectory && routes
                    ? Object.values(routes).map((route) => normalizePath(resolve(appDirectory, route.file)))
                    : []
            );
        },
        resolveId(id, _importer, options) {
            if (id !== publicId) return;
            if (serverBundles) {
                throw new Error('Storefront Next compiled routes do not support React Router serverBundles');
            }
            // The dep optimizer scan walks `.server` modules as raw source in the client
            // environment. It only collects imports and never serves the module, so allow it.
            // Vite passes `scan` at runtime but omits it from the public hook types.
            const scan = (options as { scan?: boolean } | undefined)?.scan;
            if (!(options?.ssr || scan || this.environment?.config.consumer === 'server')) {
                throw new Error(`${publicId} is server-only`);
            }
            return resolvedId;
        },
        load(id) {
            if (id === resolvedId) return source;
        },
        hotUpdate({ file }) {
            if (this.environment.config.consumer !== 'server') return;
            // Only route modules (exports, default export) feed the manifest; skip every other save.
            if (!routeFiles.has(file)) return;
            const { moduleGraph, hot } = this.environment;
            const adapter = moduleGraph.getModuleById(resolvedId);
            if (!adapter) return;
            // RR's HMR comparison omits hasDefaultExport. Recompute the private
            // manifest too, including changes to re-exported route dependencies.
            const manifest = moduleGraph.getModuleById(manifestResolvedId);
            if (manifest) moduleGraph.invalidateModule(manifest);
            moduleGraph.invalidateModule(adapter);
            // Environment API runners cache evaluated exports separately. The
            // changed route need not be imported by this metadata-only adapter,
            // so a file-scoped reload would leave its evaluated entrypoint stale.
            hot.send({ type: 'full-reload' });
        },
    };
}
