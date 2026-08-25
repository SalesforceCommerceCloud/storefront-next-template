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
import { describe, it, expect } from 'vitest';
import { storefrontNextTargets, type StorefrontNextTargetsConfig } from './storefront-next-targets';

describe('storefrontNextTargets', () => {
    // TODO: Refactor these tests to be less fragile by:
    // - Removing most count assertions and checking for specific plugin names instead
    // - Only testing order if plugin order actually matters for functionality
    // - Testing presence/absence of specific plugins rather than exact counts
    // Base plugin count without SCAPI_PROXY_HOST (workspace plugin excluded):
    // baseConfig, i18n, managedRuntimeBundle, fixReactRouterManifestUrls, patchReactRouter,
    // platformEntry, transformTargetPlaceholder, actionHooks, watchConfigFiles,
    // buildMiddlewareRegistry, ssrSourcemapFix, eventInstrumentationValidator
    const BASE_PLUGIN_COUNT = 12;

    it('should return an array of targets with default config', () => {
        const targets = storefrontNextTargets();
        expect(Array.isArray(targets)).toBe(true);
        expect(targets.length).toBe(BASE_PLUGIN_COUNT);
        targets.forEach((target) => {
            expect(target).toHaveProperty('name');
        });
    });

    it('should return an array of targets with empty config', () => {
        const targets = storefrontNextTargets({});
        expect(Array.isArray(targets)).toBe(true);
        expect(targets.length).toBe(BASE_PLUGIN_COUNT);
    });

    it('should include workspace plugin when SCAPI_PROXY_HOST is set', () => {
        process.env.SCAPI_PROXY_HOST = 'https://scw:25010';
        const targets = storefrontNextTargets();
        expect(targets.length).toBe(BASE_PLUGIN_COUNT + 1);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).toContain('storefront-next-workspace');
        delete process.env.SCAPI_PROXY_HOST;
    });

    it('should not include workspace plugin when SCAPI_PROXY_HOST is not set', () => {
        delete process.env.SCAPI_PROXY_HOST;
        const targets = storefrontNextTargets();
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).not.toContain('storefront-next-workspace');
    });

    it('should not install a fulfillment contributors plugin', () => {
        const targetNames = storefrontNextTargets().map((target) => target.name);

        expect(targetNames).not.toContain('storefront-next:fulfillment-contributors');
    });

    it('should not include readableChunkFileNames when readableChunkNames is false', () => {
        const targets = storefrontNextTargets({ readableChunkNames: false });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).not.toContain('storefront-next:readable-chunk-file-names');
    });

    it('should include readableChunkFileNames when readableChunkNames is true', () => {
        const targets = storefrontNextTargets({ readableChunkNames: true });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT + 1);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).toContain('storefront-next:readable-chunk-file-names');
    });

    it('should have all required targets in correct order', () => {
        const targets = storefrontNextTargets({ readableChunkNames: true });
        const targetNames = targets.map((t) => t.name);

        // Check order and presence (workspace plugin excluded without SCAPI_PROXY_HOST)
        expect(targetNames[0]).toBe('storefront-next:base-config');
        expect(targetNames[1]).toBe('storefront-next:i18n');
        expect(targetNames[2]).toBe('storefront-next:managed-runtime-bundle');
        expect(targetNames[3]).toBe('storefront-next:fix-react-router-manifest-urls');
        expect(targetNames[4]).toBe('storefront-next:patch-react-router');
        expect(targetNames[5]).toBe('storefront-next:platform-entry');
        expect(targetNames[6]).toBe('storefront-next:transform-target-placeholder');
        expect(targetNames[7]).toBe('storefront-next:action-hooks');
        expect(targetNames[8]).toBe('storefront-next:watch-config-files');
        expect(targetNames[9]).toBe('storefront-next:build-middleware-registry');
        expect(targetNames[10]).toBe('storefront-next:ssr-sourcemap-fix');
        expect(targetNames[11]).toBe('storefrontnext:event-instrumentation-validator');
        expect(targetNames[12]).toBe('storefront-next:readable-chunk-file-names');
    });

    it('should accept StorefrontNextTargetsConfig type with readableChunkNames', () => {
        const config: StorefrontNextTargetsConfig = {
            readableChunkNames: true,
        };
        const targets = storefrontNextTargets(config);
        expect(targets.length).toBe(BASE_PLUGIN_COUNT + 1);
    });

    it('should not include eventInstrumentationValidator when explicitly disabled', () => {
        const targets = storefrontNextTargets({ eventInstrumentationValidator: false });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT - 1);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).not.toContain('storefrontnext:event-instrumentation-validator');
    });

    it('should include staticRegistry when staticRegistry config is provided', () => {
        const targets = storefrontNextTargets({
            staticRegistry: {
                componentPath: '/path/to/components',
                registryPath: '/path/to/registry',
            },
        });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT + 2);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).toContain('storefrontnext:static-registry');
        expect(targetNames).toContain('storefrontnext:component-loaders');
    });

    it('should not include staticRegistry when only componentPath is provided', () => {
        const targets = storefrontNextTargets({
            staticRegistry: {
                componentPath: '/path/to/components',
            } as any,
        });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).not.toContain('storefrontnext:static-registry');
    });

    it('should not include staticRegistry when only registryPath is provided', () => {
        const targets = storefrontNextTargets({
            staticRegistry: {
                registryPath: '/path/to/registry',
            } as any,
        });
        expect(targets.length).toBe(BASE_PLUGIN_COUNT);
        const targetNames = targets.map((t) => t.name);
        expect(targetNames).not.toContain('storefrontnext:static-registry');
    });
});
