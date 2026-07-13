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
import { flatRoutes as _flatRoutes } from '@react-router/fs-routes';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeRoutes } from './merge-routes';
import { applyUrlConfig } from '../site-context/apply-url-config';
import { loadConfig } from '../config/load-config';
import type { Url } from '../config/types';

const APP_SRC_DIR = 'src';
const EXTENSIONS_DIR = 'extensions';
const VERTICALS_DIR = 'verticals';
// This file must live at the root of `appDirectory` (src/app-wrapper.tsx) and must NOT
// be moved into a subdirectory. React Router's typegen resolves route module types using
// paths relative to `appDirectory` — placing it elsewhere breaks generated type references.
const APP_WRAPPER_FILE = 'app-wrapper.tsx';

/**
 * Scans `src/extensions/` for extension route directories and merges any discovered
 * routes into the base route tree. Mutates `routes` in place via `mergeRoutes`.
 */
async function discoverExtensionRoutes(ignoredRouteFiles: string[], routes: RouteConfigEntry[]): Promise<void> {
    const extensionsDir = path.join('.', APP_SRC_DIR, EXTENSIONS_DIR);

    // Sort to ensure deterministic route order across platforms (readdir order is filesystem-dependent)
    const extensions = await fs.readdir(extensionsDir).then(
        (entries) => entries.sort(),
        () => []
    );
    for (const ext of extensions) {
        // React Router rootDirectory uses forward slashes regardless of OS
        const routesDir = `${EXTENSIONS_DIR}/${ext}/routes`;
        const routesDirFull = path.join('.', APP_SRC_DIR, EXTENSIONS_DIR, ext, 'routes');
        try {
            await fs.access(routesDirFull);
            const extensionRoutes = await _flatRoutes({
                ignoredRouteFiles,
                rootDirectory: routesDir,
            });
            mergeRoutes(routes, extensionRoutes, `${EXTENSIONS_DIR}/${ext}/`);
        } catch {
            // Extension has no routes directory — skip
        }
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
async function discoverVerticalRoutes(ignoredRouteFiles: string[], routes: RouteConfigEntry[]): Promise<void> {
    const vertical = process.env.VERTICAL;
    if (!vertical) return;
    const routesDir = `${VERTICALS_DIR}/${vertical}/routes`;
    const routesDirFull = path.join('.', APP_SRC_DIR, VERTICALS_DIR, vertical, 'routes');
    try {
        await fs.access(routesDirFull);
    } catch {
        // Vertical has no routes overlay — skip
        return;
    }
    const verticalRoutes = await _flatRoutes({
        ignoredRouteFiles,
        rootDirectory: routesDir,
    });
    mergeRoutes(routes, verticalRoutes, `${VERTICALS_DIR}/${vertical}/`);
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
export async function flatRoutes(options?: {
    ignoredRouteFiles?: string[];
    rootDirectory?: string;
}): Promise<RouteConfigEntry[]> {
    const { ignoredRouteFiles = ['**/*.test.{ts,tsx}'], rootDirectory } = options ?? {};

    // 1. Discover base routes from filesystem
    const routes = await _flatRoutes({ ignoredRouteFiles, rootDirectory });

    // 2. Discover and merge extension routes
    await discoverExtensionRoutes(ignoredRouteFiles, routes);

    // 3. Discover and merge per-vertical route overrides (no-op when VERTICAL is unset
    //    or the vertical has no routes/ overlay — i.e. in the flattened customer artifact)
    await discoverVerticalRoutes(ignoredRouteFiles, routes);

    // 4. Try to load URL config from template's config file
    const { app } = await loadConfig();
    const urlConfig = app?.url as Url | undefined;
    if (urlConfig?.prefix) {
        try {
            await fs.access(path.join('.', APP_SRC_DIR, APP_WRAPPER_FILE));
        } catch {
            throw new Error(
                `[storefront-next-runtime] URL prefix "${urlConfig.prefix}" is configured but ` +
                    `"${APP_SRC_DIR}/${APP_WRAPPER_FILE}" does not exist. ` +
                    `Create this file with: export { default } from '@salesforce/storefront-next-runtime/routing/app-wrapper';`
            );
        }

        return applyUrlConfig({
            routes,
            urlConfig,
            wrapperFile: APP_WRAPPER_FILE,
        });
    }

    return routes;
}
