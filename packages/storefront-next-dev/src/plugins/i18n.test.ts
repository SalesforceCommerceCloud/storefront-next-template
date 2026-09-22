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
import { describe, it, expect, vi } from 'vitest';
import type { UserConfig, ConfigEnv, ConfigPluginContext, Rollup } from 'vite';
import { i18nPlugin } from './i18n';

function callConfigHook(plugin: ReturnType<typeof i18nPlugin>, userConfig: UserConfig = {}): UserConfig | void {
    const configHook = plugin.config;
    if (typeof configHook === 'function') {
        const mockContext: Partial<ConfigPluginContext> = {
            meta: { rollupVersion: '4.0.0', viteVersion: '7.0.0' },
        };
        const mockEnv: ConfigEnv = {
            command: 'build',
            mode: 'production',
            isSsrBuild: false,
            isPreview: false,
        };
        return configHook.call(mockContext as ConfigPluginContext, userConfig, mockEnv) as UserConfig | void;
    }
}

function getManualChunks(
    plugin: ReturnType<typeof i18nPlugin>,
    userConfig: UserConfig = {},
    environment: 'client' | 'ssr' = 'client'
) {
    const config = callConfigHook(plugin, userConfig);
    const viteConfig = config as UserConfig | undefined;
    return (viteConfig?.environments?.[environment]?.build?.rollupOptions?.output ??
        viteConfig?.build?.rollupOptions?.output) as
        | (Rollup.OutputOptions & { manualChunks: Rollup.GetManualChunk })
        | undefined;
}

describe('i18nPlugin', () => {
    it('should return a plugin with correct name', () => {
        const plugin = i18nPlugin();
        expect(plugin.name).toBe('storefront-next:i18n');
    });

    it('should apply only to build', () => {
        const plugin = i18nPlugin();
        expect(plugin.apply).toBe('build');
    });

    it('should return a manualChunks function', () => {
        const plugin = i18nPlugin();
        const output = getManualChunks(plugin);
        expect(typeof output?.manualChunks).toBe('function');
    });

    describe('locale matching', () => {
        it('should match en-GB locale files', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/en-GB/translations.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-en-GB');
        });

        it('should match it-IT locale files', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/it-IT/index.ts',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-it-IT');
        });

        it('should match zh-CN locale files', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/zh-CN/translations.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-zh-CN');
        });

        it('should match extension locale files', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/en-GB/product.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-en-GB');
        });

        it('should not match non-locale files', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/components/Button.tsx',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBeUndefined();
        });
    });

    describe('delegation to existing manualChunks', () => {
        it('should delegate to existing manualChunks function for non-locale IDs', () => {
            const existingFn = vi.fn().mockReturnValue('checkout-components');
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin, {
                build: { rollupOptions: { output: { manualChunks: existingFn } } },
            });
            const mockContext = {} as Rollup.PluginContext;
            const mockMeta = {} as Rollup.ManualChunkMeta;
            const result = output?.manualChunks.call(
                mockContext,
                '/Users/project/src/components/checkout/index.tsx',
                mockMeta
            );
            expect(result).toBe('checkout-components');
            expect(existingFn).toHaveBeenCalledWith('/Users/project/src/components/checkout/index.tsx', mockMeta);
        });

        it('should preserve this context when delegating to existing function', () => {
            const capturedContexts: unknown[] = [];
            const existingFn: Rollup.GetManualChunk = vi.fn(function (this: Rollup.PluginContext) {
                capturedContexts.push(this);
                return undefined;
            });
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin, {
                build: { rollupOptions: { output: { manualChunks: existingFn } } },
            });
            const mockContext = { getModuleInfo: vi.fn() } as unknown as Rollup.PluginContext;
            output?.manualChunks.call(mockContext, '/some/id', {} as Rollup.ManualChunkMeta);
            expect(capturedContexts[0]).toBe(mockContext);
        });

        it('should delegate to existing manualChunks object for non-locale IDs', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin, {
                build: {
                    rollupOptions: {
                        output: {
                            manualChunks: {
                                vendor: ['/node_modules/react/index.js'],
                            },
                        },
                    },
                },
            });
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/node_modules/react/index.js',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('vendor');
        });

        it('should return undefined when no existing manualChunks and ID does not match locale', () => {
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/components/Button.tsx',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBeUndefined();
        });

        it('should prioritize locale match over existing manualChunks', () => {
            const existingFn = vi.fn().mockReturnValue('other-chunk');
            const plugin = i18nPlugin();
            const output = getManualChunks(plugin, {
                build: { rollupOptions: { output: { manualChunks: existingFn } } },
            });
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/en-GB/translations.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-en-GB');
            expect(existingFn).not.toHaveBeenCalled();
        });
    });

    it('should configure manual chunks for both environments when the Vite Environment API is enabled', () => {
        const clientManualChunks = vi.fn().mockReturnValue('image-gallery');
        const rootManualChunks = vi.fn().mockReturnValue('server-components');
        const plugin = i18nPlugin();
        const userConfig = {
            build: { rollupOptions: { output: { manualChunks: rootManualChunks } } },
            environments: {
                client: {
                    build: {
                        rollupOptions: {
                            output: { manualChunks: clientManualChunks, onlyExplicitManualChunks: true },
                        },
                    },
                },
            },
        } satisfies UserConfig;
        const clientOutput = getManualChunks(plugin, userConfig);
        const ssrOutput = getManualChunks(plugin, userConfig, 'ssr');
        const clientResult = clientOutput?.manualChunks.call(
            {} as Rollup.PluginContext,
            '/Users/project/src/components/image-gallery/index.tsx',
            {} as Rollup.ManualChunkMeta
        );
        const ssrLocaleResult = ssrOutput?.manualChunks.call(
            {} as Rollup.PluginContext,
            '/Users/project/src/locales/en-GB/translations.json',
            {} as Rollup.ManualChunkMeta
        );
        const ssrNonLocaleResult = ssrOutput?.manualChunks.call(
            {} as Rollup.PluginContext,
            '/Users/project/src/components/server-only.tsx',
            {} as Rollup.ManualChunkMeta
        );

        expect(clientResult).toBe('image-gallery');
        expect(clientManualChunks).toHaveBeenCalled();
        expect(ssrLocaleResult).toBe('locales-en-GB');
        expect(ssrNonLocaleResult).toBe('server-components');
        expect(rootManualChunks).toHaveBeenCalled();
        expect(clientOutput?.onlyExplicitManualChunks).toBe(true);
    });

    it('should preserve an SSR output array when the Vite Environment API is enabled', () => {
        const plugin = i18nPlugin();
        const userConfig = {
            environments: {
                client: {
                    build: { rollupOptions: { output: { format: 'es' } } },
                },
                ssr: {
                    build: { rollupOptions: { output: [{ format: 'es' }, { format: 'cjs' }] } },
                },
            },
        } satisfies UserConfig;
        const config = callConfigHook(plugin, userConfig);

        expect(config?.environments?.ssr).toBeUndefined();
        expect(getManualChunks(plugin, userConfig)?.manualChunks).toBeTypeOf('function');
    });

    describe('custom locale pattern', () => {
        it('should use custom pattern when provided', () => {
            const plugin = i18nPlugin({ localePattern: /\/i18n\/([^/]+)\// });
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/i18n/en-US/messages.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBe('locales-en-US');
        });

        it('should not match default pattern when custom pattern is provided', () => {
            const plugin = i18nPlugin({ localePattern: /\/i18n\/([^/]+)\// });
            const output = getManualChunks(plugin);
            const result = output?.manualChunks.call(
                {} as Rollup.PluginContext,
                '/Users/project/src/locales/en-GB/translations.json',
                {} as Rollup.ManualChunkMeta
            );
            expect(result).toBeUndefined();
        });
    });

    describe('array output handling', () => {
        it('should return nothing when output is an array', () => {
            const plugin = i18nPlugin();
            const config = callConfigHook(plugin, {
                build: { rollupOptions: { output: [{ format: 'es' }, { format: 'cjs' }] } },
            });
            expect(config).toBeUndefined();
        });
    });
});
