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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { staticRegistryPlugin } from './staticRegistry';
import type { Plugin } from 'vite';
import { normalizePath } from '../test-utils';

// Global console mocking to prevent test output noise
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
};

// Mock console methods globally for cleaner test output
beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
});

afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    delete process.env.SFCC_LOG_LEVEL;
});

// Mock fs to use memfs but keep some functions mockable
vi.mock('fs', async () => {
    const memfs = await import('memfs');
    return {
        ...memfs.fs,
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(true),
    };
});

vi.mock('glob', () => ({
    glob: vi.fn(),
}));

import { writeFileSync, existsSync } from 'fs';
import { glob } from 'glob';

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockGlob = vi.mocked(glob);

function callHook(hook: any, context: any, ...args: any[]) {
    if (typeof hook === 'function') {
        return hook.call(context, ...args);
    }
    if (hook && typeof hook.handler === 'function') {
        return hook.handler.call(context, ...args);
    }
}
async function callPluginHooks(plugin: Plugin, projectRoot: string, errorCallback?: ReturnType<typeof vi.fn>) {
    callHook(plugin.configResolved, null, { root: projectRoot });
    const context = { error: errorCallback || vi.fn() };
    await callHook(plugin.buildStart, context, {});
}

// Helper function to properly call handleHotUpdate hook
async function callHandleHotUpdate(plugin: Plugin, file: string) {
    const mockServer = { moduleGraph: { getModuleById: vi.fn() }, reloadModule: vi.fn() };
    return await callHook(plugin.handleHotUpdate, null, { file, server: mockServer });
}

describe('staticRegistryPlugin', { timeout: 15_000 }, () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vol.reset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Plugin Configuration', () => {
        it('creates plugin with default configuration', () => {
            const plugin = staticRegistryPlugin();

            expect(plugin).toBeDefined();
            expect(plugin.name).toBe('storefrontnext:static-registry');
        });

        it('creates plugin with custom configuration', () => {
            const config = {
                componentPath: 'custom/components',
                registryPath: 'custom/static-registry.ts',
            };

            const plugin = staticRegistryPlugin(config);

            expect(plugin).toBeDefined();
            expect(plugin.name).toBe('storefrontnext:static-registry');
        });
    });

    describe('Component Scanning', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        interface TestCase {
            description: string;
            files: Record<string, string>;
            expectedRegistrations: string[];
        }

        const testCases: TestCase[] = [
            {
                description: 'basic component with single quotes',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                },
                expectedRegistrations: ["targetRegistry.registerImporter('storefrontnext_base.hero'"],
            },
            {
                description: 'component with double quotes',
                files: {
                    '/test/project/src/components/test/index.tsx': `@Component("doubleQuote", {})
export default class Test {}`,
                },
                expectedRegistrations: ["targetRegistry.registerImporter('storefrontnext_base.doubleQuote'"],
            },
            {
                description: 'component with backticks',
                files: {
                    '/test/project/src/components/test/index.tsx':
                        '@Component(`backtick`, {})\nexport default class Test {}',
                },
                expectedRegistrations: ["targetRegistry.registerImporter('storefrontnext_base.backtick'"],
            },
            {
                description: 'component with spaces around quotes',
                files: {
                    '/test/project/src/components/test/index.tsx': `@Component( 'withSpaces' , {})
export default class Test {}`,
                },
                expectedRegistrations: ["targetRegistry.registerImporter('storefrontnext_base.withSpaces'"],
            },
            {
                description: 'multiple components',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                    '/test/project/src/components/carousel/index.tsx': `@Component('carousel', {})
export default class Carousel {}`,
                },
                expectedRegistrations: [
                    "targetRegistry.registerImporter('storefrontnext_base.hero'",
                    "targetRegistry.registerImporter('storefrontnext_base.carousel'",
                ],
            },
            {
                description: 'component with server loader only',
                files: {
                    '/test/project/src/components/server-only/index.tsx': `@Component('serverOnly', {})
export default class ServerOnly {}
export function loader() { return {}; }`,
                },
                expectedRegistrations: [
                    "targetRegistry.registerImporter('storefrontnext_base.serverOnly', () => import('../components/server-only/index'), { loader: 'loader' });",
                ],
            },
            {
                description: 'component with both loaders',
                files: {
                    '/test/project/src/components/with-loaders/index.tsx': `@Component('withLoaders', {})
export default class WithLoaders {}
export function loader() { return {}; }
export const clientLoader = () => {};`,
                },
                expectedRegistrations: [
                    "targetRegistry.registerImporter('storefrontnext_base.withLoaders', () => import('../components/with-loaders/index'), { loader: 'loader', clientLoader: 'clientLoader' });",
                ],
            },
            {
                description: 'nested component path',
                files: {
                    '/test/project/src/components/nested/deep/component/index.tsx': `@Component('deepComponent', {})
export default class DeepComponent {}`,
                },
                expectedRegistrations: ["import('../components/nested/deep/component/index')"],
            },
        ];

        it.each(testCases)('handles $description', async ({ files, expectedRegistrations }) => {
            const componentFiles = Object.keys(files);

            // Create files in memfs
            vol.fromJSON({
                ...files,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            expectedRegistrations.forEach((expectedRegistration) => {
                expect(generatedCode).toContain(expectedRegistration);
            });
        });

        it('skips files without @Component decorators', async () => {
            const componentFiles = ['/test/project/src/components/utils/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/utils/index.tsx': 'export const utilityFunction = () => {};',
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            expect(writeCall[1]).toContain('// No components found with @Component decorators');
        });

        it('calls glob with correct parameters', async () => {
            vol.fromJSON({
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue([]);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            expect(mockGlob).toHaveBeenCalledWith('src/components/**/*.{ts,tsx}', {
                cwd: mockProjectRoot,
                absolute: true,
            });
        });

        it('emits registrations and header in stable sorted order', async () => {
            const files = {
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/components/product-carousel/index.tsx': `@Component('productCarousel', {})
export default class ProductCarousel {}`,
                '/test/project/src/components/popular-categories/index.tsx': `@Component('popularCategories', {})
export default class PopularCategories {}`,
                '/test/project/src/components/hero-carousel/index.tsx': `@Component('heroCarousel', {})
export default class HeroCarousel {}`,
                '/test/project/src/components/grid/index.tsx': `@Component('grid', {})
export default class Grid {}`,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            };

            // Intentionally provide files in random order
            const componentFiles = [
                '/test/project/src/components/product-carousel/index.tsx',
                '/test/project/src/components/hero/index.tsx',
                '/test/project/src/components/grid/index.tsx',
                '/test/project/src/components/hero-carousel/index.tsx',
                '/test/project/src/components/popular-categories/index.tsx',
            ];

            vol.fromJSON(files);
            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            // Assert header list is sorted by id
            const expectedHeader =
                'Components registered: storefrontnext_base.grid, storefrontnext_base.hero, storefrontnext_base.heroCarousel, storefrontnext_base.popularCategories, storefrontnext_base.productCarousel';
            expect(generatedCode).toContain(expectedHeader);

            // Assert registration calls appear in sorted order
            const order = [
                "targetRegistry.registerImporter('storefrontnext_base.grid'",
                "targetRegistry.registerImporter('storefrontnext_base.hero'",
                "targetRegistry.registerImporter('storefrontnext_base.heroCarousel'",
                "targetRegistry.registerImporter('storefrontnext_base.popularCategories'",
                "targetRegistry.registerImporter('storefrontnext_base.productCarousel'",
            ];
            const positions = order.map((snippet) => generatedCode.indexOf(snippet));
            // All snippets should exist and be in ascending order
            expect(positions.every((p) => p !== -1)).toBe(true);
            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeGreaterThan(positions[i - 1]);
            }
        });
    });

    describe('Registry File Updates', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it.each([
            {
                description: 'removes existing initializeRegistry function before adding new one',
                existingRegistry: `
import { ComponentRegistry } from '@salesforce/storefront-next-runtime/design';

export const registry = new ComponentRegistry({});

// STATIC_REGISTRY_START
/* eslint-disable */
/**
 * Old function comment
 */
export function initializeRegistry(): void {
    targetRegistry.registerImporter('oldComponent', () => import('./old'));
}
// STATIC_REGISTRY_END
`,
                componentContent: `@Component('newComponent', {})
export default class NewComponent {}`,
                shouldNotContain: ['oldComponent', 'Old function comment'],
                shouldContain: ['newComponent', 'auto-generated by the staticRegistry Vite plugin'],
            },
        ])('$description', async ({ existingRegistry, componentContent, shouldNotContain, shouldContain }) => {
            const componentFiles = ['/test/project/src/components/new/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/new/index.tsx': componentContent,
                '/test/project/src/lib/static-registry.ts': existingRegistry,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const updatedContent = writeCall[1] as string;

            shouldNotContain.forEach((text) => {
                expect(updatedContent).not.toContain(text);
            });

            shouldContain.forEach((text) => {
                expect(updatedContent).toContain(text);
            });
        });

        it('creates registry file when it does not exist', async () => {
            mockExistsSync.mockReturnValue(false);
            mockGlob.mockResolvedValue([]);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            // Should create the registry file
            expect(mockWriteFileSync).toHaveBeenCalledTimes(2); // Once for creation, once for update
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining('Creating new registry file')
            );
        });
    });

    describe('Hot Module Replacement', () => {
        it.each([
            {
                description: 'triggers regeneration when component files change',
                config: { componentPath: 'src/components' },
                filePath: '/test/project/src/components/hero/index.tsx',
                expectedResult: [],
            },
            {
                description: 'ignores non-component file changes',
                config: { componentPath: 'src/components' },
                filePath: '/test/project/src/utils/helper.ts',
                expectedResult: undefined,
            },
        ])('$description', async ({ config, filePath, expectedResult }) => {
            const plugin = staticRegistryPlugin(config);
            const result = await callHandleHotUpdate(plugin, filePath);
            expect(result).toEqual(expectedResult);
        });
    });

    describe('Error Handling', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it.each([
            {
                description: 'handles file read errors gracefully',
                setup: () => {
                    const componentFiles = ['/test/project/src/components/missing/index.tsx'];
                    vol.fromJSON({
                        '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
                    });
                    mockGlob.mockResolvedValue(componentFiles);
                    return {
                        expectConsoleWarn: true,
                        expectError: undefined,
                        expectConsoleError: undefined,
                        mockGlobError: undefined,
                    };
                },
            },
            {
                description: 'logs error when registry generation fails',
                setup: () => {
                    return {
                        expectConsoleWarn: undefined,
                        expectConsoleError: '❌ Static registry generation failed: Glob error',
                        expectError: undefined,
                        mockGlobError: true,
                    };
                },
            },
        ])('$description', async ({ setup }) => {
            const { expectConsoleWarn, expectError, expectConsoleError, mockGlobError } = setup();

            // Set up glob mock if needed
            if (mockGlobError) {
                mockGlob.mockRejectedValue(new Error('Glob error'));
            }

            const consoleSpy = expectConsoleWarn ? vi.spyOn(console, 'warn').mockImplementation(() => {}) : null;
            const consoleErrorSpy = expectConsoleError ? vi.spyOn(console, 'error').mockImplementation(() => {}) : null;
            const mockError = expectError ? vi.fn() : undefined;

            const plugin = staticRegistryPlugin({ failOnError: false });
            await callPluginHooks(plugin, mockProjectRoot, mockError);

            if (expectConsoleWarn && consoleSpy) {
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[sfnext:warn]'),
                    expect.stringContaining('Could not process')
                );
                consoleSpy.mockRestore();
            }

            if (expectConsoleError && consoleErrorSpy) {
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[sfnext:error]'),
                    expect.stringContaining('Static registry generation failed: Glob error')
                );
                consoleErrorSpy.mockRestore();
            }

            if (expectError && mockError) {
                expect(mockError).toHaveBeenCalledWith(expectError);
            }
        });
    });

    describe('Debug Logging', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it.each([
            {
                description: 'logs detailed information at debug level',
                logLevel: 'debug',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                },
                expectedLogs: [
                    'Starting static registry generation...',
                    'Found component: storefrontnext_base.hero',
                    'Static registry generation complete',
                ],
                shouldLog: true,
            },
            {
                description: 'does not log debug messages at info level',
                logLevel: 'info',
                files: {},
                expectedLogs: [],
                shouldLog: false,
            },
            {
                description: 'logs clientLoader export at debug level',
                logLevel: 'debug',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}
export const clientLoader = () => {};`,
                },
                expectedLogs: ['Found component: storefrontnext_base.hero', '(with clientLoader)'],
                shouldLog: true,
            },
            {
                description: 'logs fallback export at debug level',
                logLevel: 'debug',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}
export const fallback = () => <div>Loading...</div>;`,
                },
                expectedLogs: ['Found component: storefrontnext_base.hero', '(with fallback)'],
                shouldLog: true,
            },
            {
                description: 'logs multiple exports at debug level',
                logLevel: 'debug',
                files: {
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}
export function loader() { return {}; }
export const clientLoader = () => {};
export const fallback = () => <div>Loading...</div>;`,
                },
                expectedLogs: ['Found component: storefrontnext_base.hero', '(with loader, clientLoader, fallback)'],
                shouldLog: true,
            },
        ])('$description', async ({ logLevel, files, expectedLogs, shouldLog }) => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            process.env.SFCC_LOG_LEVEL = logLevel;
            const componentFiles = Object.keys(files);

            const fileSystem: Record<string, string> = {
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            };
            // Add files, filtering out any undefined values
            Object.entries(files).forEach(([path, content]) => {
                if (content !== undefined) {
                    fileSystem[path] = content;
                }
            });
            vol.fromJSON(fileSystem);

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            if (shouldLog) {
                expectedLogs.forEach((expectedLog) => {
                    expect(consoleSpy).toHaveBeenCalledWith(
                        expect.stringContaining('[sfnext:debug]'),
                        expect.stringContaining(expectedLog)
                    );
                });
            } else {
                // At info level, debug messages should not appear
                const debugCalls = consoleSpy.mock.calls.filter(
                    (call) => typeof call[0] === 'string' && call[0].includes('[sfnext:debug]')
                );
                expect(debugCalls).toHaveLength(0);
            }

            consoleSpy.mockRestore();
        });
    });

    describe('Advanced Component Features', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        describe('Component Groups', () => {
            it.each([
                {
                    description: 'extracts custom group from component metadata',
                    componentContent: `@Component('hero', { group: 'custom_group' })
export default class Hero {}`,
                    expectedId: 'custom_group.hero',
                },
                {
                    description: 'uses default group when no group specified',
                    componentContent: `@Component('hero', {})
export default class Hero {}`,
                    expectedId: 'storefrontnext_base.hero',
                },
                {
                    description: 'uses default group when metadata is not an object',
                    componentContent: `@Component('hero', 'not-an-object')
export default class Hero {}`,
                    expectedId: 'storefrontnext_base.hero',
                },
                {
                    description: 'uses default group when group property is not a string',
                    componentContent: `@Component('hero', { group: 123 })
export default class Hero {}`,
                    expectedId: 'storefrontnext_base.hero',
                },
            ])('$description', async ({ componentContent, expectedId }) => {
                const componentFiles = ['/test/project/src/components/hero/index.tsx'];

                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx': componentContent,
                    '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
                });

                mockGlob.mockResolvedValue(componentFiles);

                const plugin = staticRegistryPlugin();
                await callPluginHooks(plugin, mockProjectRoot);

                const writeCall = mockWriteFileSync.mock.calls[0];
                const generatedCode = writeCall[1] as string;

                expect(generatedCode).toContain(`targetRegistry.registerImporter('${expectedId}'`);
            });
        });

        describe('Template Literal Error Handling', () => {
            it('throws error for template literals with interpolation', async () => {
                const componentFiles = ['/test/project/src/components/hero/index.tsx'];

                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx':
                        '@Component(`hero-${variable}`, {})\nexport default class Hero {}',
                    '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
                });

                mockGlob.mockResolvedValue(componentFiles);

                const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
                const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

                const plugin = staticRegistryPlugin({ failOnError: false });
                await callPluginHooks(plugin, mockProjectRoot);

                // The error should be caught and logged as a warning during file processing
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[sfnext:warn]'),
                    expect.stringContaining('Could not process')
                );

                consoleErrorSpy.mockRestore();
                consoleWarnSpy.mockRestore();
            });

            it('handles template literals without interpolation', async () => {
                const componentFiles = ['/test/project/src/components/hero/index.tsx'];

                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx':
                        '@Component(`hero`, {})\nexport default class Hero {}',
                    '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
                });

                mockGlob.mockResolvedValue(componentFiles);

                const plugin = staticRegistryPlugin();
                await callPluginHooks(plugin, mockProjectRoot);

                const writeCall = mockWriteFileSync.mock.calls[0];
                const generatedCode = writeCall[1] as string;

                expect(generatedCode).toContain("targetRegistry.registerImporter('storefrontnext_base.hero'");
            });
        });

        describe('Fallback Export Detection', () => {
            it.each([
                {
                    description: 'detects named fallback export',
                    componentContent: `@Component('hero', {})
export default class Hero {}
export const fallback = () => <div>Loading...</div>;`,
                    shouldHaveFallback: true,
                },
                {
                    description: 'detects component with all export types',
                    componentContent: `@Component('hero', {})
export default class Hero {}
export function loader() { return {}; }
export const clientLoader = () => {};
export const fallback = () => <div>Loading...</div>;`,
                    shouldHaveFallback: true,
                    shouldHaveLoader: true,
                    shouldHaveClientLoader: true,
                },
                {
                    description: 'handles component without fallback',
                    componentContent: `@Component('hero', {})
export default class Hero {}`,
                    shouldHaveFallback: false,
                },
            ])('$description', async ({
                componentContent,
                shouldHaveFallback,
                shouldHaveLoader,
                shouldHaveClientLoader,
            }) => {
                const componentFiles = ['/test/project/src/components/hero/index.tsx'];

                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx': componentContent,
                    '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
                });

                mockGlob.mockResolvedValue(componentFiles);

                const plugin = staticRegistryPlugin();
                await callPluginHooks(plugin, mockProjectRoot);

                const writeCall = mockWriteFileSync.mock.calls[0];
                const generatedCode = writeCall[1] as string;

                if (shouldHaveFallback) {
                    expect(generatedCode).toContain("fallback: 'fallback'");
                }
                if (shouldHaveLoader) {
                    expect(generatedCode).toContain("loader: 'loader'");
                }
                if (shouldHaveClientLoader) {
                    expect(generatedCode).toContain("clientLoader: 'clientLoader'");
                }
                if (!shouldHaveFallback && !shouldHaveLoader && !shouldHaveClientLoader) {
                    expect(generatedCode).toContain(
                        "targetRegistry.registerImporter('storefrontnext_base.hero', () => import('../components/hero/index'));"
                    );
                }
            });
        });
    });

    describe('Registry File Error Scenarios', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it.each([
            {
                description: 'throws error when registry file is missing start marker',
                registryContent: `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// Missing start marker
// STATIC_REGISTRY_END
`,
                expectedError: 'missing static registry markers',
            },
            {
                description: 'throws error when registry file is missing end marker',
                registryContent: `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Missing end marker
`,
                expectedError: 'missing static registry markers',
            },
            {
                description: 'handles registry file read errors',
                registryContent: null, // Will cause read error
                expectedError: 'Failed to read registry file',
                mockReadError: true,
            },
        ])('$description', async ({ registryContent, expectedError, mockReadError }) => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            if (registryContent) {
                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                    '/test/project/src/lib/static-registry.ts': registryContent,
                });
            } else if (mockReadError) {
                vol.fromJSON({
                    '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                });
                // Mock readFileSync to throw an error
                const originalReadFileSync = vol.readFileSync;
                vol.readFileSync = vi.fn().mockImplementation((path) => {
                    if (path.includes('static-registry.ts')) {
                        throw new Error('File read error');
                    }
                    return originalReadFileSync.call(vol, path);
                });
            }

            mockGlob.mockResolvedValue(componentFiles);

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const plugin = staticRegistryPlugin({ failOnError: false });
            await callPluginHooks(plugin, mockProjectRoot);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining(expectedError)
            );

            consoleErrorSpy.mockRestore();
        });

        it('throws error when failOnError is true', async () => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `// Missing markers`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const mockError = vi.fn();
            const plugin = staticRegistryPlugin({ failOnError: true });

            await expect(async () => {
                await callPluginHooks(plugin, mockProjectRoot, mockError);
            }).rejects.toThrow('missing static registry markers');
        });
    });

    describe('Hot Module Replacement Advanced Scenarios', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it('handles hot reload regeneration errors gracefully', async () => {
            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `// Missing markers`,
            });

            mockGlob.mockResolvedValue(['/test/project/src/components/hero/index.tsx']);

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const plugin = staticRegistryPlugin({ failOnError: false });

            // Initialize plugin first - this should fail but not throw due to failOnError: false
            await callPluginHooks(plugin, mockProjectRoot);

            // Now test hot reload - this should also fail gracefully
            const result = await callHandleHotUpdate(plugin, '/test/project/src/components/hero/index.tsx');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Failed to regenerate registry:')
            );
            expect(result).toEqual([]);

            consoleErrorSpy.mockRestore();
        });

        it('reloads module when registry regeneration succeeds', async () => {
            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(['/test/project/src/components/hero/index.tsx']);

            const mockModule = { id: '/test/project/src/lib/static-registry.ts' };
            const mockServer = {
                moduleGraph: { getModuleById: vi.fn().mockReturnValue(mockModule) },
                reloadModule: vi.fn(),
            };

            const plugin = staticRegistryPlugin();

            // Initialize plugin first
            await callPluginHooks(plugin, mockProjectRoot);

            // Test hot reload with custom server mock
            const result = await callHook(plugin.handleHotUpdate, null, {
                file: '/test/project/src/components/hero/index.tsx',
                server: mockServer,
            });

            // Use normalizePath for cross-platform comparison
            const actualPath = normalizePath(mockServer.moduleGraph.getModuleById.mock.calls[0][0] as string);
            expect(actualPath).toBe('/test/project/src/lib/static-registry.ts');
            expect(mockServer.reloadModule).toHaveBeenCalledWith(mockModule);
            expect(result).toEqual([]);
        });
    });

    describe('Custom Registry Identifier', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it('uses custom registry identifier in generated code', async () => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const customRegistry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin({ registryIdentifier: 'customRegistry' });
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            expect(generatedCode).toContain('targetRegistry = customRegistry');
            expect(generatedCode).toContain('targetRegistry.registerImporter');
        });
    });

    describe('File System Error Handling', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
        });

        it('handles writeFileSync errors gracefully', async () => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            // Mock writeFileSync to throw an error
            mockWriteFileSync.mockImplementation(() => {
                throw new Error('Write permission denied');
            });

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const plugin = staticRegistryPlugin({ failOnError: false });
            await callPluginHooks(plugin, mockProjectRoot);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining(
                    'Static registry generation failed: Failed to write registry file: Write permission denied'
                )
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('AST Parsing Edge Cases', () => {
        const mockProjectRoot = '/test/project';

        beforeEach(() => {
            // Reset mocks to clear any state from previous tests (especially the error-throwing mock)
            mockWriteFileSync.mockReset();
            mockExistsSync.mockReset();
            mockGlob.mockReset();
            mockExistsSync.mockReturnValue(true);
        });

        it.each([
            {
                description: 'handles @Component decorator without arguments',
                componentContent: `@Component()
export default class Hero {}`,
                expectedRegistrations: 0,
            },
            {
                description: 'handles @Component decorator with non-string first argument',
                componentContent: `@Component(123, {})
export default class Hero {}`,
                expectedRegistrations: 0,
            },
            {
                description: 'handles class without decorators',
                componentContent: `export default class Hero {}`,
                expectedRegistrations: 0,
            },
            {
                description: 'handles different decorator names',
                componentContent: `@OtherDecorator('hero', {})
export default class Hero {}`,
                expectedRegistrations: 0,
            },
            {
                description: 'handles multiple classes in one file',
                componentContent: `@Component('hero', {})
export default class Hero {}

@Component('banner', {})
export class Banner {}`,
                expectedRegistrations: 2,
            },
            {
                description: 'handles variable export statements',
                componentContent: `@Component('hero', {})
export default class Hero {}
export const loader = async () => {};
export const clientLoader = () => {};`,
                expectedRegistrations: 1,
                expectedMetadata: "loader: 'loader', clientLoader: 'clientLoader'",
            },
            {
                description: 'handles export declarations with multiple exports',
                componentContent: `@Component('hero', {})
export default class Hero {}
const HeroLoader = () => {};
const HeroFallback = () => {};
export { HeroLoader as loader, HeroFallback as fallback };`,
                expectedRegistrations: 1,
            },
        ])('$description', async ({ componentContent, expectedRegistrations, expectedMetadata }) => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': componentContent,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            if (expectedRegistrations === 0) {
                expect(generatedCode).toContain('// No components found with @Component decorators');
            } else if (expectedRegistrations > 0) {
                const registrationMatches = generatedCode.match(/targetRegistry\.registerImporter/g);
                expect(registrationMatches).toHaveLength(expectedRegistrations);
            }

            if (expectedMetadata) {
                expect(generatedCode).toContain(expectedMetadata);
            }
        });

        it('handles Windows path normalization', async () => {
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/lib/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin();
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            // Should use forward slashes in import paths regardless of platform
            expect(generatedCode).toContain("import('../components/hero/index')");
            expect(generatedCode).not.toContain("import('..\\components\\hero\\index')");
        });

        it('handles path normalization for relative paths without dot prefix', async () => {
            // Test scenario where registry is in same directory as components
            const componentFiles = ['/test/project/src/components/hero/index.tsx'];

            vol.fromJSON({
                '/test/project/src/components/hero/index.tsx': `@Component('hero', {})
export default class Hero {}`,
                '/test/project/src/components/static-registry.ts': `import { ComponentRegistry } from '@/lib/component-registry';

export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`,
            });

            mockGlob.mockResolvedValue(componentFiles);

            const plugin = staticRegistryPlugin({ registryPath: 'src/components/static-registry.ts' });
            await callPluginHooks(plugin, mockProjectRoot);

            const writeCall = mockWriteFileSync.mock.calls[0];
            const generatedCode = writeCall[1] as string;

            // Should add './' prefix to relative paths that don't start with '.'
            expect(generatedCode).toContain("import('./hero/index')");
        });
    });
});
