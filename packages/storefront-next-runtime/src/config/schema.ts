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
import { deepMerge, mergeEnvConfig } from './utils';

/**
 * Base configuration type for storefront-next projects.
 *
 * Generic parameter `App` represents the template's application config shape.
 * The SDK does not prescribe what fields `app` must contain — templates define
 * their own `AppConfig` type and pass it as `BaseConfig<AppConfig>`.
 *
 * Validation of `app` (e.g., required credentials, required collections) is
 * the template's responsibility, typically handled in its server middleware.
 *
 * @typeParam App - The template's application config shape (defaults to `Record<string, unknown>`)
 *
 * @example
 * // In the template's types file:
 * type AppConfig = { ... };
 * type Config = BaseConfig<AppConfig>;
 *
 * // In config.server.ts:
 * export default defineConfig<Config>({ metadata: {...}, app: {...} });
 */
export type BaseConfig<App extends Record<string, unknown> = Record<string, unknown>> = {
    metadata: {
        projectName: string;
        projectSlug: string;
    };
    runtime?: {
        defaultMrtProject?: string;
        defaultMrtTarget?: string;
        ssrOnly?: string[];
        ssrShared?: string[];
        ssrParameters?: Record<string, string | number | boolean>;
    };
    app: App;
};

export interface DefineConfigOptions {
    /**
     * Config paths that cannot be overridden by environment variables.
     * Paths use double underscore separators and are matched case-insensitively.
     * Any env var targeting a protected path, its descendants, or an ancestor
     * object containing it will throw.
     *
     * @example ['app__analytics'] — prevents PUBLIC__app__analytics__* from being set via env
     */
    protectedPaths?: string[];
}

/**
 * Define a type-safe storefront configuration with IDE autocomplete.
 *
 * Reads `process.env` at call time and merges any `PUBLIC__`-prefixed
 * variables into the config (validated against the base config structure —
 * env vars targeting paths that don't exist in the base config are ignored
 * with a warning). This is a server-only side effect by design; calling
 * `defineConfig` from a browser bundle silently no-ops because `PUBLIC__`
 * vars are not present in the client environment.
 *
 * Environment variables:
 * - `PUBLIC__<path>` (optional): Override any config path using double underscore separators.
 *   e.g. `PUBLIC__app__some__nested__value=abc123` maps to `config.app.some.nested.value`
 * - JSON values are parsed optimistically: numbers, booleans, arrays, and objects all work.
 *   `PUBLIC__app__features__providers=["A","B"]` parses to an array.
 *
 * @param config - The base configuration object with all defaults
 * @param options - Optional settings (e.g., protectedPaths to prevent env var overrides)
 * @returns The config with environment variable overrides merged in
 *
 * @example
 * // In config.server.ts:
 * import { defineConfig } from '@salesforce/storefront-next-runtime/config';
 *
 * export default defineConfig({
 *     metadata: { projectName: 'My Store', projectSlug: 'my-store' },
 *     app: {
 *         // template-specific shape
 *     },
 * }, { protectedPaths: ['app__analytics'] });
 */
export function defineConfig<T extends BaseConfig>(config: T, options?: DefineConfigOptions): T {
    const envOverrides = mergeEnvConfig(process.env, config as unknown as Record<string, unknown>, {
        protectedPaths: options?.protectedPaths,
    });
    return deepMerge(config, envOverrides);
}
