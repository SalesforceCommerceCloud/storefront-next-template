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
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { storefrontNextPreset } from './react-router.config';

// Helper to create a mock resolved config with all required properties
const createMockResolvedConfig = (overrides: Record<string, any> = {}) => {
    return {
        appDirectory: '/absolute/path/to/src',
        basename: '/',
        buildDirectory: '/absolute/path/to/build',
        serverBuildFile: 'index.js',
        routes: {},
        unstable_routeConfig: [],
        future: {
            v8_middleware: true,
            v8_viteEnvironmentApi: true,
            unstable_optimizeDeps: true,
            v8_splitRouteModules: false,
            subResourceIntegrity: false,
            v8_trailingSlashAwareDataRequests: false,
            v8_passThroughRequests: false,
        },
        routeDiscovery: { mode: 'initial' as const },
        serverModuleFormat: 'cjs' as const,
        ssr: true,
        subResourceIntegrity: false,
        prerender: false,
        allowedActionOrigins: [],
        ...overrides,
    };
};

describe('react-router.config', () => {
    describe('storefrontNextPreset', () => {
        const originalSfwFalconInstance = process.env.SFW_FALCON_INSTANCE;
        const originalSfwFunctionalDomain = process.env.SFW_FUNCTIONAL_DOMAIN;

        beforeEach(() => {
            // Clear workspace env vars so tests get deterministic config
            delete process.env.SFW_FALCON_INSTANCE;
            delete process.env.SFW_FUNCTIONAL_DOMAIN;
        });

        afterEach(() => {
            vi.restoreAllMocks();
            // Restore original values
            if (originalSfwFalconInstance !== undefined) {
                process.env.SFW_FALCON_INSTANCE = originalSfwFalconInstance;
            } else {
                delete process.env.SFW_FALCON_INSTANCE;
            }
            if (originalSfwFunctionalDomain !== undefined) {
                process.env.SFW_FUNCTIONAL_DOMAIN = originalSfwFunctionalDomain;
            } else {
                delete process.env.SFW_FUNCTIONAL_DOMAIN;
            }
        });

        it('should return a preset with correct name', () => {
            const preset = storefrontNextPreset();
            expect(preset.name).toBe('storefront-next-preset');
        });

        it('should have reactRouterConfig function', () => {
            const preset = storefrontNextPreset();
            expect(preset.reactRouterConfig).toBeDefined();
            expect(typeof preset.reactRouterConfig).toBe('function');
        });

        it('should have reactRouterConfigResolved function', () => {
            const preset = storefrontNextPreset();
            expect(preset.reactRouterConfigResolved).toBeDefined();
            expect(typeof preset.reactRouterConfigResolved).toBe('function');
        });

        describe('reactRouterConfig', () => {
            it('should return correct configuration values', () => {
                const preset = storefrontNextPreset();
                const mockUserConfig = {
                    appDirectory: './app',
                    buildDirectory: 'dist',
                };
                const config = preset.reactRouterConfig?.({ reactRouterUserConfig: mockUserConfig });

                expect(config).toEqual({
                    appDirectory: './src',
                    buildDirectory: 'build',
                    routeDiscovery: { mode: 'initial' },
                    serverModuleFormat: 'cjs',
                    ssr: true,
                    basename: '/',
                    future: {
                        v8_middleware: true,
                        v8_viteEnvironmentApi: true,
                        unstable_optimizeDeps: true,
                    },
                });
            });

            it('should return consistent config on multiple calls', () => {
                const preset = storefrontNextPreset();
                const mockUserConfig = {};
                const config1 = preset.reactRouterConfig?.({ reactRouterUserConfig: mockUserConfig });
                const config2 = preset.reactRouterConfig?.({ reactRouterUserConfig: mockUserConfig });

                expect(config1).toEqual(config2);
            });

            it('should include allowedActionOrigins when SFW_FALCON_INSTANCE and SFW_FUNCTIONAL_DOMAIN are set', () => {
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                const preset = storefrontNextPreset();
                const config = preset.reactRouterConfig?.({ reactRouterUserConfig: {} });

                expect(config).toEqual(
                    expect.objectContaining({
                        allowedActionOrigins: [
                            '*.dataplane.cvw-dataplane-test.aws-dev2-uswest2.aws.sfdc.cl',
                            '*.platform.a.cvw-dataplane-test.aws-dev2-uswest2.aws.sfdc.cl',
                        ],
                    })
                );
            });

            it('should not include allowedActionOrigins when SFW_FALCON_INSTANCE is not set', () => {
                const preset = storefrontNextPreset();
                const config = preset.reactRouterConfig?.({ reactRouterUserConfig: {} });

                expect(config).not.toHaveProperty('allowedActionOrigins');
            });

            it('should not include allowedActionOrigins when SFW_FUNCTIONAL_DOMAIN is not set', () => {
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                const preset = storefrontNextPreset();
                const config = preset.reactRouterConfig?.({ reactRouterUserConfig: {} });

                expect(config).not.toHaveProperty('allowedActionOrigins');
            });

            it('should not include allowedActionOrigins when only SFW_FUNCTIONAL_DOMAIN is set', () => {
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                const preset = storefrontNextPreset();
                const config = preset.reactRouterConfig?.({ reactRouterUserConfig: {} });

                expect(config).not.toHaveProperty('allowedActionOrigins');
            });

            it('should warn when SFW_FALCON_INSTANCE is set without SFW_FUNCTIONAL_DOMAIN', () => {
                vi.spyOn(console, 'warn').mockImplementation(() => {});
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                storefrontNextPreset();

                expect(console.warn).toHaveBeenCalledWith(
                    expect.stringContaining('SFW_FALCON_INSTANCE is set but SFW_FUNCTIONAL_DOMAIN is not')
                );
            });

            it('should warn when SFW_FUNCTIONAL_DOMAIN is set without SFW_FALCON_INSTANCE', () => {
                vi.spyOn(console, 'warn').mockImplementation(() => {});
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                storefrontNextPreset();

                expect(console.warn).toHaveBeenCalledWith(
                    expect.stringContaining('SFW_FUNCTIONAL_DOMAIN is set but SFW_FALCON_INSTANCE is not')
                );
            });

            it('should not warn when both env vars are set', () => {
                vi.spyOn(console, 'warn').mockImplementation(() => {});
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                storefrontNextPreset();

                expect(console.warn).not.toHaveBeenCalled();
            });

            it('should not warn when neither env var is set', () => {
                vi.spyOn(console, 'warn').mockImplementation(() => {});
                storefrontNextPreset();

                expect(console.warn).not.toHaveBeenCalled();
            });
        });

        describe('reactRouterConfigResolved', () => {
            it('should not throw error when config matches preset values', () => {
                const preset = storefrontNextPreset();
                const validConfig = createMockResolvedConfig();

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: validConfig });
                }).not.toThrow();
            });

            it('should not warn when routeDiscovery.mode matches the preset default', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const preset = storefrontNextPreset();
                const validConfig = createMockResolvedConfig();

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: validConfig });
                }).not.toThrow();

                expect(warnSpy).not.toHaveBeenCalled();
            });

            it('should warn (not throw) when routeDiscovery.mode is overridden', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const preset = storefrontNextPreset();
                const overriddenConfig = createMockResolvedConfig({
                    routeDiscovery: { mode: 'lazy' as const },
                });

                // routeDiscovery.mode is the one relaxed pin: overriding it warns instead of throwing.
                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: overriddenConfig });
                }).not.toThrow();

                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('routeDiscovery.mode is "lazy"'));
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pins it to "initial"'));
            });

            it('should throw error when serverModuleFormat is overridden', () => {
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    serverModuleFormat: 'esm' as const,
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('serverModuleFormat: expected "cjs", got "esm"');
            });

            it('should throw error when ssr is overridden', () => {
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    ssr: false,
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('ssr: expected true, got false');
            });

            it('should throw error when future.v8_middleware is overridden', () => {
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    future: {
                        v8_middleware: false,
                        v8_viteEnvironmentApi: true,
                        unstable_optimizeDeps: true,
                        v8_splitRouteModules: false,
                        subResourceIntegrity: false,
                        v8_trailingSlashAwareDataRequests: false,
                        v8_passThroughRequests: false,
                    },
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('future.v8_middleware: expected true, got false');
            });

            it('should throw error when future.v8_viteEnvironmentApi is overridden', () => {
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    future: {
                        v8_middleware: true,
                        v8_viteEnvironmentApi: false,
                        unstable_optimizeDeps: true,
                        v8_splitRouteModules: false,
                        subResourceIntegrity: false,
                        v8_trailingSlashAwareDataRequests: false,
                        v8_passThroughRequests: false,
                    },
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('future.v8_viteEnvironmentApi: expected true, got false');
            });

            it('should throw error with all validation errors when multiple values are overridden', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    routeDiscovery: { mode: 'lazy' as const },
                    serverModuleFormat: 'esm' as const,
                    ssr: false,
                    future: {
                        v8_middleware: false,
                        v8_viteEnvironmentApi: false,
                        unstable_optimizeDeps: true,
                        v8_splitRouteModules: false,
                        subResourceIntegrity: false,
                        v8_trailingSlashAwareDataRequests: false,
                        v8_passThroughRequests: false,
                    },
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                let errorMessage = '';
                try {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                } catch (error) {
                    errorMessage = (error as Error).message;
                }

                // routeDiscovery.mode is relaxed to a warning, so it must NOT appear in the thrown error.
                expect(errorMessage).not.toContain('routeDiscovery.mode');
                expect(errorMessage).toContain('serverModuleFormat: expected "cjs", got "esm"');
                expect(errorMessage).toContain('ssr: expected true, got false');
                expect(errorMessage).toContain('future.v8_middleware: expected true, got false');
                expect(errorMessage).toContain('future.v8_viteEnvironmentApi: expected true, got false');

                // …but it is still surfaced to the customer as a warning.
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('routeDiscovery.mode is "lazy"'));
            });

            it('should warn (not throw) when routeDiscovery object is missing', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const preset = storefrontNextPreset();
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { routeDiscovery, ...configWithoutRouteDiscovery } = createMockResolvedConfig();

                // A missing routeDiscovery is treated like any other override of the default 'initial' mode:
                // it warns rather than failing the build.
                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: configWithoutRouteDiscovery as any });
                }).not.toThrow();

                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('routeDiscovery.mode is "undefined"'));
            });

            it('should handle missing future object', () => {
                const preset = storefrontNextPreset();
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { future, ...configWithoutFuture } = createMockResolvedConfig();

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: configWithoutFuture as any });
                }).toThrow('future.v8_middleware: expected true, got undefined');

                let errorMessage = '';
                try {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: configWithoutFuture as any });
                } catch (error) {
                    errorMessage = (error as Error).message;
                }

                expect(errorMessage).toContain('future.v8_middleware: expected true, got undefined');
                expect(errorMessage).toContain('future.v8_viteEnvironmentApi: expected true, got undefined');
            });

            it('should throw error when basename is overridden', () => {
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    basename: '/custom-path',
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('basename: expected /, got /custom-path');
            });

            it('should throw error when allowedActionOrigins is overridden', () => {
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                const preset = storefrontNextPreset();
                const invalidConfig = createMockResolvedConfig({
                    allowedActionOrigins: ['https://evil.example.com'],
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('Storefront Next preset configuration was overridden');

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: invalidConfig });
                }).toThrow('allowedActionOrigins');
            });

            it('should not throw when allowedActionOrigins matches preset (workspace env)', () => {
                process.env.SFW_FALCON_INSTANCE = 'aws-dev2-uswest2';
                process.env.SFW_FUNCTIONAL_DOMAIN = 'cvw-dataplane-test';
                const preset = storefrontNextPreset();
                const validConfig = createMockResolvedConfig({
                    allowedActionOrigins: [
                        '*.dataplane.cvw-dataplane-test.aws-dev2-uswest2.aws.sfdc.cl',
                        '*.platform.a.cvw-dataplane-test.aws-dev2-uswest2.aws.sfdc.cl',
                    ],
                });

                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: validConfig });
                }).not.toThrow();
            });

            it('should not validate allowedActionOrigins when workspace env vars are not set', () => {
                const preset = storefrontNextPreset();
                const configWithCustomOrigins = createMockResolvedConfig({
                    allowedActionOrigins: ['https://custom.example.com'],
                });

                // Customers are free to set their own allowedActionOrigins in prod
                expect(() => {
                    void preset.reactRouterConfigResolved?.({ reactRouterConfig: configWithCustomOrigins });
                }).not.toThrow();
            });

            it('should not validate appDirectory and buildDirectory', () => {
                const preset = storefrontNextPreset();
                const configWithDifferentPaths = createMockResolvedConfig({
                    appDirectory: '/absolute/path/to/different/src',
                    buildDirectory: '/absolute/path/to/different/build',
                });

                // Should not throw because appDirectory and buildDirectory are not validated
                expect(() => {
                    void preset.reactRouterConfigResolved?.({
                        reactRouterConfig: configWithDifferentPaths,
                    });
                }).not.toThrow();
            });
        });
    });
});
