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
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMrtEntryFile } from './mrt/utils';
import type { MrtSsrConfig } from './types';

export const CARTRIDGES_BASE_DIR = 'cartridges';
export const SFNEXT_BASE_CARTRIDGE_NAME = 'app_storefrontnext_base';
export const SFNEXT_BASE_CARTRIDGE_VERSION = '0.0.1';

/**
 * Reject path-like `--cartridge-name` values before they are joined under `cartridges/`.
 * Invalid input is rejected as-is; it is not trimmed or sanitized.
 */
export function assertValidCartridgeName(cartridgeName: string): void {
    if (
        cartridgeName.trim().length === 0 ||
        cartridgeName === '.' ||
        cartridgeName === '..' ||
        /[\\/]/.test(cartridgeName) ||
        cartridgeName.includes('\0') ||
        /^[a-zA-Z]:/.test(cartridgeName)
    ) {
        throw new Error('Invalid --cartridge-name: must be a single cartridge name, not a path.');
    }
}

/** Metadata directory relative to `cartridges/`, for the given cartridge name. */
export function cartridgeExperienceDir(cartridgeName = SFNEXT_BASE_CARTRIDGE_NAME): string {
    return `${cartridgeName}/cartridge/experience`;
}

export const SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR = cartridgeExperienceDir();

/**
 * When enabled, automatically generates and deploys cartridge metadata before an MRT push.
 * This is useful for keeping Page Designer metadata in sync with component changes.
 *
 * When enabled:
 * 1. Generates cartridge metadata from decorated components
 * 2. Deploys the cartridge to Commerce Cloud (requires dw.json configuration)
 * 3. Proceeds with the MRT push
 *
 * To enable: Set this to `true` in your local config.ts
 * Default: false (manual cartridge generation/deployment via `sfnext generate-cartridge` and `sfnext deploy-cartridge`)
 */
export const GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH = false;

/**
 * Build MRT SSR configuration for bundle deployment
 *
 * Defines which files should be:
 * - Server-only (ssrOnly): Deployed only to Lambda functions
 * - Shared (ssrShared): Deployed to both Lambda and CDN
 *
 * @param buildDirectory - Path to the build output directory
 * @param projectDirectory - Path to the project root (reserved for future use)
 * @returns MRT SSR configuration with glob patterns
 */
type RuntimeConfig = {
    runtime?: {
        ssrOnly?: string[];
        ssrShared?: string[];
        ssrParameters?: Record<string, string | number | boolean>;
    };
};

/**
 * Merge override patterns with defaults while preserving required defaults.
 *
 * Overrides are prepended so they can add additional globs or exclusions, while
 * defaults remain in the list to prevent breaking essential artifacts.
 *
 * @example
 * const defaults = ['server/**', 'loader.js'];
 * const overrides = ['custom/**', '!static/**'];
 * mergePatterns(defaults, overrides);
 * // => ['custom/**', '!static/**', 'server/**', 'loader.js']
 */
const mergePatterns = (defaults: string[], overrides?: string[]): string[] => {
    if (!overrides?.length) {
        return defaults;
    }

    return Array.from(new Set([...overrides, ...defaults]));
};

/**
 * Load runtime config from config.server.ts for MRT bundle settings.
 *
 * Keep in sync with @salesforce/storefront-next-runtime/src/config/load-config.ts.
 */
export async function loadRuntimeConfig(projectDirectory?: string): Promise<RuntimeConfig['runtime'] | undefined> {
    if (!projectDirectory) {
        return undefined;
    }

    const configPath = resolve(projectDirectory, 'config.server.ts');
    if (!existsSync(configPath)) {
        return undefined;
    }

    try {
        const { createJiti } = await import('jiti');

        const jiti = createJiti(import.meta.url, {
            fsCache: false,
            interopDefault: true,
        });

        const mod = await jiti.import(configPath);
        const config = (mod as Record<string, unknown>).default ?? mod;
        return (config as RuntimeConfig).runtime;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `[storefront-next-dev] Found config.server.ts at ${configPath} but failed to import it.\n${reason}`,
            {
                cause: error,
            }
        );
    }
}

export const buildMrtConfig = async (_buildDirectory: string, projectDirectory?: string): Promise<MrtSsrConfig> => {
    // SSR-only files: Server bundles and entry points
    // These are deployed only to Lambda functions, not to CDN
    const ssrEntryPoint = getMrtEntryFile('production');

    const defaultSsrOnly = [
        'server/**/*', // All server-side code
        'package.json', // Build root package.json
        'loader.js', // SSR entry point
        `${ssrEntryPoint}.{js,mjs,cjs}`, // SSR entry point (supports CJS and ESM formats)
        `${ssrEntryPoint}.{js,mjs,cjs}.map`, // SSR source maps
        '!static/**/*', // Exclude static assets from server
        // Include any shared server chunks prefixed with sfnext-server- (generated by the build process)
        'sfnext-server-*.mjs',
        'sfnext-server-*.mjs.map',
    ];

    // Shared files: Client bundles and static assets
    // These are deployed to both Lambda (for SSR) and CDN (for client)
    const defaultSsrShared = [
        'client/**/*', // All client-side bundles (with content hashes)
        'static/**/*', // Static assets (images, fonts, etc.)
        '**/*.css', // Stylesheets
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
        '**/*.svg',
        '**/*.ico',
        '**/*.woff',
        '**/*.woff2',
        '**/*.ttf',
        '**/*.eot',
    ];

    // SSR function parameters
    const defaultSsrParameters = {
        ssrFunctionNodeVersion: '24.x',
    };

    const runtimeConfig = await loadRuntimeConfig(projectDirectory);
    const ssrOnly = mergePatterns(defaultSsrOnly, runtimeConfig?.ssrOnly);
    const ssrShared = mergePatterns(defaultSsrShared, runtimeConfig?.ssrShared);
    const ssrParameters: MrtSsrConfig['ssrParameters'] = {
        ...defaultSsrParameters,
        ...(runtimeConfig?.ssrParameters ?? {}),
    };

    // Remove envBasePath if empty — MRT rejects empty string as invalid.
    // When not set, the key should be absent so MRT doesn't configure a base path.
    if (!ssrParameters.envBasePath) {
        delete ssrParameters.envBasePath;
    }

    return {
        ssrOnly,
        ssrShared,
        ssrParameters,
    };
};
