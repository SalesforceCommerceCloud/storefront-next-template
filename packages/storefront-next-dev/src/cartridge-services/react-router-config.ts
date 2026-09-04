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
import { join } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { npmRunPathEnv } from 'npm-run-path';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { logger } from '../logger';

let isCliAvailable: boolean | null = null;

function filePathEndsWithRoute(filePath: string, routeFile: string): boolean {
    const routeFileNormalized = routeFile.replace(/^\.\//, '');
    return filePath === routeFileNormalized || filePath.endsWith(`/${routeFileNormalized}`);
}

/**
 * Match the selected vertical route shadow to its canonical route module.
 *
 * `VERTICAL` is optional and selects the overlay directory reported by React Router,
 * for example `furniture` for `verticals/furniture/routes/_app._index.tsx`.
 */
function routeFileMatches(filePath: string, routeFile: string): boolean {
    if (filePathEndsWithRoute(filePath, routeFile)) {
        return true;
    }

    const vertical = process.env.VERTICAL;
    const verticalRoutePrefix = vertical ? `verticals/${vertical}/routes/` : undefined;
    if (!verticalRoutePrefix || !routeFile.startsWith(verticalRoutePrefix)) {
        return false;
    }

    const canonicalRouteFile = `routes/${routeFile.slice(verticalRoutePrefix.length)}`;
    return filePathEndsWithRoute(filePath, canonicalRouteFile);
}

function checkReactRouterCli(projectDirectory: string): boolean {
    if (isCliAvailable !== null) {
        return isCliAvailable;
    }

    try {
        execSync('react-router --version', {
            cwd: projectDirectory,
            env: npmRunPathEnv(),
            stdio: 'pipe',
        });
        isCliAvailable = true;
    } catch {
        isCliAvailable = false;
    }
    return isCliAvailable;
}

/**
 * Get the fully resolved routes from React Router by invoking its CLI.
 * This ensures we get the exact same route resolution as React Router uses internally,
 * including all presets, file-system routes, and custom route configurations.
 * @param projectDirectory - The project root directory
 * @returns Array of resolved route config entries
 * @example
 * const routes = getReactRouterRoutes('/path/to/project');
 * // Returns the same structure as `react-router routes --json`
 */
function getReactRouterRoutes(projectDirectory: string): RouteConfigEntry[] {
    if (!checkReactRouterCli(projectDirectory)) {
        throw new Error(
            'React Router CLI is not available. Please make sure @react-router/dev is installed and accessible.'
        );
    }

    // Use a temp file to avoid Node.js buffer limits (8KB default)
    const tempFile = join(tmpdir(), `react-router-routes-${randomUUID()}.json`);

    try {
        // Redirect output to temp file to avoid buffer truncation
        execSync(`react-router routes --json > "${tempFile}"`, {
            cwd: projectDirectory,
            env: npmRunPathEnv(),
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const output = readFileSync(tempFile, 'utf-8');
        return JSON.parse(output) as RouteConfigEntry[];
    } catch (error) {
        throw new Error(`Failed to get routes from React Router CLI: ${(error as Error).message}`);
    } finally {
        // Clean up temp file
        try {
            if (existsSync(tempFile)) {
                unlinkSync(tempFile);
            }
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Convert a file path to its corresponding route path using React Router's CLI.
 * This ensures we get the exact same route resolution as React Router uses internally.
 * @param filePath - Absolute path to the route file
 * @param projectRoot - The project root directory
 * @returns The route path (e.g., '/cart', '/product/:productId')
 * @example
 * const route = filePathToRoute('/path/to/project/src/routes/_app.cart.tsx', '/path/to/project');
 * // Returns: '/cart'
 */
export function filePathToRoute(filePath: string, projectRoot: string): string {
    // Normalize paths to POSIX-style
    const filePathPosix = filePath.replace(/\\/g, '/');

    // Get all routes from React Router CLI
    const routes = getReactRouterRoutes(projectRoot);
    const flatRoutes = flattenRoutes(routes);

    // Skip root-duplicate routes — these are convenience clones created by applyUrlConfig
    // so the bare "/" URL still works. The canonical route (under the site-context prefix)
    // is the one that should appear in cartridge metadata.
    const canonicalRoutes = flatRoutes.filter((route) => !route.id.endsWith('--root-duplicate'));

    // Find the route that matches this file
    for (const route of canonicalRoutes) {
        // Normalize the route file path for comparison
        const routeFilePosix = route.file.replace(/\\/g, '/');

        if (routeFileMatches(filePathPosix, routeFilePosix)) {
            return route.path;
        }
    }

    // Fallback: if no match found, return a warning path
    logger.warn(`Could not find route for file: ${filePath}`);
    return '/unknown';
}

/**
 * Flatten a nested route tree into a flat array with computed paths.
 * Each route will have its full path computed from parent paths.
 * @param routes - The nested route config entries
 * @param parentPath - The parent path prefix (used internally for recursion)
 * @returns Flat array of routes with their full paths
 */
function flattenRoutes(
    routes: RouteConfigEntry[],
    parentPath = ''
): Array<{ id: string; path: string; file: string; index?: boolean }> {
    const result: Array<{ id: string; path: string; file: string; index?: boolean }> = [];

    for (const route of routes) {
        // Compute the full path
        let fullPath: string;
        if (route.index) {
            fullPath = parentPath || '/';
        } else if (route.path) {
            // Handle paths that already start with / (absolute paths from extensions)
            const pathSegment = route.path.startsWith('/') ? route.path : `/${route.path}`;
            fullPath = parentPath ? `${parentPath}${pathSegment}`.replace(/\/+/g, '/') : pathSegment;
        } else {
            // Layout route without path - use parent path
            fullPath = parentPath || '/';
        }

        // Add this route if it has an id
        if (route.id) {
            result.push({
                id: route.id,
                path: fullPath,
                file: route.file,
                index: route.index,
            });
        }

        // Recursively process children
        if (route.children && route.children.length > 0) {
            const childPath = route.path ? fullPath : parentPath;
            result.push(...flattenRoutes(route.children, childPath));
        }
    }

    return result;
}
