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
import type { Plugin } from 'vite';
import { fixReactRouterManifestUrlsPlugin } from './plugins/fixReactRouterManifestUrls';
import { readableChunkFileNamesPlugin } from './plugins/readableChunkFileNames';
import { managedRuntimeBundlePlugin } from './plugins/managedRuntimeBundle';
import { patchReactRouterPlugin } from './plugins/patchReactRouter';
import { transformTargetPlaceholderPlugin } from './plugins/transformTargets';
import { actionHooksPlugin } from './plugins/actionHooks';
import { watchConfigFilesPlugin } from './plugins/watchConfigFiles';
import { staticRegistryPlugin, type StaticRegistryPluginConfig } from './plugins/staticRegistry';
import {
    eventInstrumentationValidatorPlugin,
    type EventInstrumentationValidatorConfig,
} from './plugins/eventInstrumentationValidator';
import { buildMiddlewareRegistryPlugin } from './plugins/buildMiddlewareRegistry';
import { platformEntryPlugin } from './plugins/platformEntry';
import { workspacePlugin } from './plugins/workspace';
import { componentLoadersPlugin } from './plugins/componentLoaders';
import { ssrSourcemapFixPlugin } from './plugins/ssrSourcemapFix';
import { i18nPlugin } from './plugins/i18n';
import { baseConfigPlugin } from './plugins/baseConfig';
import { compiledRoutesPlugin } from './plugins/compiledRoutes';

/**
 * Configuration options for the Storefront Next Vite plugin.
 */
export interface StorefrontNextTargetsConfig {
    /**
     * Enable human-readable chunk file names for easier debugging in production builds.
     * When enabled, chunk files will be named based on their source location
     * rather than just the file name and random hashes.
     *
     * This is useful to identify the chunk files and is usually used in development,
     * in conjunction with the bundle analyzer.
     *
     * Example:
     *
     * ```
     * (package)-(pkg-name)-index.[hash].js
     * (components)-(ui)-(inputs)-(TextField)-index.[hash].js
     * ```
     *
     * Instead of:
     *
     * ```
     * index.[hash].js
     * ```
     *
     * @default false
     */
    readableChunkNames?: boolean;

    /**
     * Configuration for the static registry plugin that automatically generates
     * component registrations based on @Component decorators.
     *
     * Set to `false` to disable the static registry plugin entirely.
     *
     * @default { componentPath: 'src/components', registryPath: 'src/lib/registry.ts' }
     */
    staticRegistry?: StaticRegistryPluginConfig;

    /**
     * Configuration for the event instrumentation validator plugin that validates
     * all enabled analytics event toggles have corresponding trackEvent() calls.
     *
     * Set to `false` to disable the validator entirely.
     *
     * @default { configPath: 'config.server.ts', scanPaths: ['src'], failOnMissing: false }
     */
    eventInstrumentationValidator?: EventInstrumentationValidatorConfig | false;
}

/**
 * Storefront Next Vite plugin that powers the React Router app.
 * Supports building and optimizing for the managed runtime environment.
 *
 * @param config - Configuration options for the plugin
 * @returns {Plugin[]} An array of Vite plugins for Storefront Next functionality
 *
 * @example
 * // With default options
 * export default defineConfig({
 *   plugins: [storefrontNextTargets()]
 * })
 *
 * @example
 * // Disable readable chunk names
 * export default defineConfig({
 *   plugins: [storefrontNextTargets({ readableChunkNames: false })]
 * })
 */
export function storefrontNextTargets(config: StorefrontNextTargetsConfig = {}): Plugin[] {
    const {
        readableChunkNames = false,
        staticRegistry = {
            componentPath: '',
            registryPath: '',
        },
        eventInstrumentationValidator = {
            configPath: 'config.server.ts',
            scanPaths: ['src'],
            failOnMissing: false,
        },
    } = config;

    const plugins: Plugin[] = [
        baseConfigPlugin(),
        ...(process.env.SCAPI_PROXY_HOST ? [workspacePlugin()] : []),
        i18nPlugin(),
        managedRuntimeBundlePlugin(),
        fixReactRouterManifestUrlsPlugin(),
        patchReactRouterPlugin(),
        platformEntryPlugin(),
        transformTargetPlaceholderPlugin(),
        actionHooksPlugin(),
        watchConfigFilesPlugin(),
        buildMiddlewareRegistryPlugin(),
        ssrSourcemapFixPlugin(),
        compiledRoutesPlugin(),
    ];

    // Add static registry plugin if enabled
    if (staticRegistry?.componentPath && staticRegistry?.registryPath) {
        plugins.push(staticRegistryPlugin(staticRegistry));

        // Strip server-only `loader` exports from the client bundle and client-only `clientLoader` exports from the
        // server bundle
        plugins.push(
            componentLoadersPlugin({
                componentPath: staticRegistry.componentPath,
            })
        );
    }

    // Add event instrumentation validator plugin if not explicitly disabled
    if (eventInstrumentationValidator !== false) {
        plugins.push(eventInstrumentationValidatorPlugin(eventInstrumentationValidator));
    }

    if (readableChunkNames) {
        plugins.push(readableChunkFileNamesPlugin());
    }

    return plugins;
}
