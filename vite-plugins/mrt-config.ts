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
import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { buildMrtSsrConfig } from '@salesforce/storefront-next-dev/mrt/config';
import { loadConfig } from '@salesforce/storefront-next-runtime/config/load-config';
import type { Config } from '@/types/config';

/** Path of the MRT bundle config, relative to the build directory. Read by `b2c mrt bundle deploy`. */
export const MRT_CONFIG_PATH = '.mrt/config.json';

/** SDK package whose installed version is recorded in the bundle metadata. */
const SDK_PACKAGE = '@salesforce/storefront-next-dev';

/** Keys of `runtime.ssrParameters` in `config.server.ts` mapped to the names the MRT bundle config expects. */
const SSR_PARAMETER_KEYS: Record<string, string> = {
    ssrFunctionNodeVersion: 'SSRFunctionNodeVersion',
    envBasePath: 'EnvBasePath',
};

/**
 * Build the MRT bundle config from the `runtime` section of `config.server.ts`.
 *
 * The default `ssrOnly`/`ssrShared` patterns and their merge with `config.server.ts` overrides come
 * from the SDK, so they stay identical to what `sfnext push` deploys. This only renames
 * `ssrParameters` keys to the names the bundle config expects.
 */
export function buildMrtConfig(runtime: Config['runtime'], mode: string) {
    const { ssrOnly, ssrShared, ssrParameters } = buildMrtSsrConfig(runtime, mode);

    return {
        ssrOnly,
        ssrShared,
        ssrParameters: Object.fromEntries(
            Object.entries(ssrParameters).map(([key, value]) => [SSR_PARAMETER_KEYS[key] ?? key, value])
        ),
    };
}

/**
 * Drops patterns that match no file in the build directory. The v2 bundler's default `strict`
 * match mode rejects such patterns (e.g. an `.eot` font glob when the build has no such fonts). Negations are kept.
 */
export async function keepMatchingPatterns(patterns: string[], buildDirectory: string): Promise<string[]> {
    const matches = await Promise.all(
        patterns.map(async (pattern) => {
            if (pattern.startsWith('!')) return true;
            for await (const _ of glob(pattern, { cwd: buildDirectory })) return true;
            return false;
        })
    );
    return patterns.filter((_, i) => matches[i]);
}

/**
 * Dependencies recorded in the bundle metadata: the project's declared dependencies plus the
 * installed version of the SDK, which MRT uses to identify the framework version.
 */
export async function readBundleDependencies(projectDirectory: string): Promise<Record<string, string>> {
    const readJson = async (path: string) => {
        try {
            return JSON.parse(await readFile(path, 'utf8'));
        } catch (error) {
            throw new Error(
                `[mrt-config] Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
                {
                    cause: error,
                }
            );
        }
    };

    const [{ dependencies, devDependencies }, installed] = await Promise.all([
        readJson(resolve(projectDirectory, 'package.json')),
        readJson(resolve(projectDirectory, 'node_modules', SDK_PACKAGE, 'package.json')).then(
            ({ version }) => ({ [SDK_PACKAGE]: version }),
            (error) => {
                // Not installed at this path (e.g. hoisted elsewhere); fall back to the declared range.
                if ((error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
                    return {};
                }
                throw error;
            }
        ),
    ]);

    return { ...dependencies, ...devDependencies, ...installed };
}

/**
 * Writes the MRT bundle config to `<buildDirectory>/.mrt/config.json` after the build, so
 * `b2c mrt bundle deploy` can deploy the build without being handed the config.
 *
 * SSR values come from the `runtime` section of `config.server.ts`; `bundleMetadata.dependencies` from `package.json`.
 *
 * Env vars:
 * - MRT_BUNDLE_TYPE: optional; set to `ssr` to use the non-streaming `ssr` entry point instead of `streamingHandler`
 *   Example: MRT_BUNDLE_TYPE=ssr
 */
export function mrtConfig(): Plugin {
    let resolvedConfig: ResolvedConfig;
    let buildDirectory: string;

    return {
        name: 'storefront-next:mrt-config',
        apply: 'build',
        configResolved(config) {
            resolvedConfig = config;
            // react-router ignores vite's build.outDir and uses its own buildDirectory option.
            const reactRouterContext = (
                config as { __reactRouterPluginContext?: { reactRouterConfig?: { buildDirectory?: string } } }
            ).__reactRouterPluginContext;
            const reactRouterBuildDirectory = reactRouterContext?.reactRouterConfig?.buildDirectory;
            buildDirectory = reactRouterBuildDirectory ?? resolve(config.root, 'build');
        },
        buildApp: {
            order: 'post',
            async handler() {
                const { runtime } = await loadConfig<Config>();
                const configPath = resolve(buildDirectory, MRT_CONFIG_PATH);
                await mkdir(resolve(configPath, '..'), { recursive: true });
                const bundleMetadata = { dependencies: await readBundleDependencies(resolvedConfig.root) };
                const { ssrOnly, ssrShared, ssrParameters } = buildMrtConfig(runtime, resolvedConfig.mode);
                const config = {
                    ssrOnly: await keepMatchingPatterns(ssrOnly, buildDirectory),
                    ssrShared: await keepMatchingPatterns(ssrShared, buildDirectory),
                    ssrParameters,
                    bundleMetadata,
                };
                await writeFile(configPath, JSON.stringify(config, null, 2));
            },
        },
    };
}
