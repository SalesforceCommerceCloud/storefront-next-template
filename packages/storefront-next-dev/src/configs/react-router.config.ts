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
import type { Preset } from '@react-router/dev/config';
import { getBasePath } from '../utils/paths';

/**
 * Storefront Next preset for React Router configuration.
 * This preset enforces standard configuration for SFCC Storefront Next applications.
 * Most pinned values (`serverModuleFormat`, `ssr`, the `v8` future flags, `basename`, and — in
 * workspace environments — `allowedActionOrigins`) cannot be overridden: they are validated and an
 * error is thrown if modified. `routeDiscovery.mode` is the one exception — it defaults to
 * `'initial'` but may be overridden (e.g. to `'lazy'`); overriding it emits a warning rather than
 * throwing, so customers can opt into other modes at their own risk.
 *
 * Environment variables:
 * - `SFW_FALCON_INSTANCE` — (Optional) The Falcon instance identifier (e.g., `aws-dev2-uswest2`).
 *   When set together with `SFW_FUNCTIONAL_DOMAIN`, adds workspace proxy domains to
 *   `allowedActionOrigins` for CSRF protection on form actions.
 * - `SFW_FUNCTIONAL_DOMAIN` — (Optional) The functional domain name (e.g., `cvw-dataplane-test`).
 *   Required alongside `SFW_FALCON_INSTANCE` to construct workspace origin patterns.
 */
export function storefrontNextPreset(): Preset {
    const sfwFalconInstance = process.env.SFW_FALCON_INSTANCE;
    const sfwFunctionalDomain = process.env.SFW_FUNCTIONAL_DOMAIN;

    if (sfwFalconInstance && !sfwFunctionalDomain) {
        console.warn(
            '[storefront-next] SFW_FALCON_INSTANCE is set but SFW_FUNCTIONAL_DOMAIN is not. ' +
                'allowedActionOrigins will not include workspace domains. ' +
                'Set both env vars to enable CSRF protection for workspace proxy origins.'
        );
    }

    if (sfwFunctionalDomain && !sfwFalconInstance) {
        console.warn(
            '[storefront-next] SFW_FUNCTIONAL_DOMAIN is set but SFW_FALCON_INSTANCE is not. ' +
                'allowedActionOrigins will not include workspace domains. ' +
                'Set both env vars to enable CSRF protection for workspace proxy origins.'
        );
    }

    // Read base path from env var for basename configuration
    // This sets the base path for all React Router routes (e.g., '/site-a')
    // In dev: reads from .env at build time
    // In production: baked into the build, but can be overridden at runtime via patchReactRouterBuild
    const basePath = getBasePath();

    const presetConfig = {
        appDirectory: './src',
        buildDirectory: 'build',
        routeDiscovery: { mode: 'initial' as const },
        serverModuleFormat: 'cjs' as const,
        ssr: true,
        future: {
            v8_middleware: true,
            v8_viteEnvironmentApi: true,
            unstable_optimizeDeps: true,
        },
        // Set basename from base path for CDN routing
        // When set, all routes are served under this base path (e.g., /site-a/category/womens)
        // React Router automatically handles Link, navigate, .data requests, and redirects
        basename: basePath || '/',
        // Allow workspace proxy domains for CSRF protection on form actions
        // Both the legacy port-based dataplane format and the Pomerium reverse proxy format are supported
        ...(sfwFalconInstance &&
            sfwFunctionalDomain && {
                allowedActionOrigins: [
                    `*.dataplane.${sfwFunctionalDomain}.${sfwFalconInstance}.aws.sfdc.cl`,
                    `*.platform.a.${sfwFunctionalDomain}.${sfwFalconInstance}.aws.sfdc.cl`,
                ],
            }),
    };

    return {
        name: 'storefront-next-preset',
        reactRouterConfig: () => presetConfig,
        reactRouterConfigResolved: ({ reactRouterConfig }) => {
            // Validate that critical config values have not been overridden
            // Note: We don't validate appDirectory and buildDirectory because they get resolved
            // to absolute paths and we can't reliably determine the correct absolute path
            const errors: string[] = [];

            // routeDiscovery.mode defaults to 'initial' but, unlike the values below, overriding it
            // is NOT a hard error. Customers may opt into another mode (e.g. 'lazy' route discovery)
            // to reduce the initial route-manifest payload on large route trees. This is unsupported
            // and may behave unexpectedly, so we warn instead of throwing.
            if (reactRouterConfig.routeDiscovery?.mode !== presetConfig.routeDiscovery.mode) {
                console.warn(
                    `[storefront-next] routeDiscovery.mode is "${reactRouterConfig.routeDiscovery?.mode}", but Storefront Next pins it to "${presetConfig.routeDiscovery.mode}". ` +
                        'Overriding it is unsupported and may cause unexpected behavior — test thoroughly before deploying.'
                );
            }

            if (reactRouterConfig.serverModuleFormat !== presetConfig.serverModuleFormat) {
                errors.push(
                    `serverModuleFormat: expected "${presetConfig.serverModuleFormat}", got "${reactRouterConfig.serverModuleFormat}"`
                );
            }

            if (reactRouterConfig.ssr !== presetConfig.ssr) {
                errors.push(`ssr: expected ${presetConfig.ssr}, got ${reactRouterConfig.ssr}`);
            }

            if (reactRouterConfig.future?.v8_middleware !== presetConfig.future.v8_middleware) {
                errors.push(
                    `future.v8_middleware: expected ${presetConfig.future.v8_middleware}, got ${reactRouterConfig.future?.v8_middleware}`
                );
            }

            if (reactRouterConfig.future?.v8_viteEnvironmentApi !== presetConfig.future.v8_viteEnvironmentApi) {
                errors.push(
                    `future.v8_viteEnvironmentApi: expected ${presetConfig.future.v8_viteEnvironmentApi}, got ${reactRouterConfig.future?.v8_viteEnvironmentApi}`
                );
            }

            if (reactRouterConfig.basename !== presetConfig.basename) {
                errors.push(`basename: expected ${presetConfig.basename}, got ${reactRouterConfig.basename}`);
            }

            // Only validate allowedActionOrigins when the preset sets it (workspace env).
            // In prod builds (no workspace env vars), customers are free to configure their own origins.
            if (
                presetConfig.allowedActionOrigins &&
                JSON.stringify(reactRouterConfig.allowedActionOrigins) !==
                    JSON.stringify(presetConfig.allowedActionOrigins)
            ) {
                errors.push(
                    `allowedActionOrigins: expected ${JSON.stringify(presetConfig.allowedActionOrigins)}, got ${JSON.stringify(reactRouterConfig.allowedActionOrigins)}`
                );
            }

            if (errors.length > 0) {
                throw new Error(
                    `Storefront Next preset configuration was overridden. The following values must not be modified:\n${errors.map((e) => `  - ${e}`).join('\n')}`
                );
            }
        },
    };
}
