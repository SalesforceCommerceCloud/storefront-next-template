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

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComponentRegistry } from './registry';
import type { LoaderNames, ComponentModule, FrameworkAdapter } from './types';

// Test types
type TestProps = { title: string };

// Mock components for testing
const MockComponent = {
    __componentBrand: Symbol('component') as any,
};

const MockLazyComponent = {
    __componentBrand: Symbol('component') as any,
    __lazyBrand: Symbol('lazy') as any,
};

const MockDecoratedComponent = {
    __componentBrand: Symbol('decorated') as any,
};

// Mock framework adapter
class MockFrameworkAdapter implements FrameworkAdapter<TestProps, object> {
    private designModeActive = false;

    createLazyComponent = vi.fn((): object => {
        return MockLazyComponent;
    });

    isDesignModeActive = vi.fn((): boolean => {
        return this.designModeActive;
    });

    decorateComponent = vi.fn((component: object): object => {
        return this.designModeActive ? MockDecoratedComponent : component;
    });

    toFrameworkComponent = vi.fn((component: object): unknown => {
        return component;
    });

    // Test helper methods
    setDesignMode(active: boolean): void {
        this.designModeActive = active;
    }
}

describe('ComponentRegistry', () => {
    let registry: ComponentRegistry<TestProps>;
    let mockAdapter: MockFrameworkAdapter;

    beforeEach(() => {
        mockAdapter = new MockFrameworkAdapter();
        registry = new ComponentRegistry<TestProps>({ adapter: mockAdapter });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        test('creates registry with adapter', () => {
            const adapter = new MockFrameworkAdapter();
            const reg = new ComponentRegistry<TestProps>({ adapter });
            expect(reg).toBeInstanceOf(ComponentRegistry);
        });
    });

    describe('registerComponent', () => {
        test('registers a component with an id', () => {
            registry.registerComponent('test-id', MockComponent);

            const component = registry.getComponent('test-id');
            expect(component).toBe(MockComponent);
        });

        test('overwrites existing component with same id', () => {
            const Component1 = { __componentBrand: Symbol() as any };
            const Component2 = { __componentBrand: Symbol() as any };

            registry.registerComponent('test-id', Component1);
            registry.registerComponent('test-id', Component2);

            const component = registry.getComponent('test-id');
            expect(component).toBe(Component2);
        });

        test('registers multiple components with different ids', () => {
            const Component1 = { __componentBrand: Symbol() as any };
            const Component2 = { __componentBrand: Symbol() as any };

            registry.registerComponent('id-1', Component1);
            registry.registerComponent('id-2', Component2);

            expect(registry.getComponent('id-1')).toBe(Component1);
            expect(registry.getComponent('id-2')).toBe(Component2);
        });

        test('preserves existing importer when registering raw component', () => {
            const mockImporter = vi.fn(() => Promise.resolve({ default: MockComponent }));
            const loaderNames: LoaderNames = { loader: 'loader' };

            registry.registerImporter('test-id', mockImporter, loaderNames);
            registry.registerComponent('test-id', MockComponent);

            expect(registry.getLoaderNames('test-id')).toEqual(loaderNames);
        });
    });

    describe('registerImporter', () => {
        test('registers a dynamic importer for a component', () => {
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            registry.registerImporter('test-id', importer);
            expect(registry.has('test-id')).toBe(true);
        });

        test('registers importer with loader names', () => {
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
                loader: vi.fn(),
                clientLoader: vi.fn(),
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));
            const loaderNames: LoaderNames = {
                loader: 'loader',
                clientLoader: 'clientLoader',
            };

            registry.registerImporter('test-id', importer, loaderNames);

            expect(registry.getLoaderNames('test-id')).toEqual(loaderNames);
        });

        test('overwrites existing importer with same id', () => {
            const importer1 = vi.fn(() => Promise.resolve({ default: MockComponent }));
            const importer2 = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer1);
            registry.registerImporter('test-id', importer2);

            expect(registry.has('test-id')).toBe(true);
        });

        test('preserves existing raw component when registering importer', () => {
            registry.registerComponent('test-id', MockComponent);
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer);

            expect(registry.getComponent('test-id')).toBe(MockComponent);
        });
    });

    describe('getComponent', () => {
        test('returns null for non-existent component', () => {
            const component = registry.getComponent('non-existent');
            expect(component).toBeNull();
        });

        test('returns registered raw component', () => {
            registry.registerComponent('test-id', MockComponent);

            const component = registry.getComponent('test-id');
            expect(component).toBe(MockComponent);
        });

        test('returns lazy component when registered via importer', async () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('lazy-id', importer);
            await registry.preload('lazy-id');

            const component = registry.getComponent('lazy-id');
            expect(component).toBe(MockLazyComponent);
            expect(mockAdapter.createLazyComponent).toHaveBeenCalledWith(importer);
        });

        test('prefers raw component over lazy component', async () => {
            mockAdapter.setDesignMode(false); // Ensure design mode is off
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer);
            await registry.preload('test-id'); // This creates lazy component
            registry.registerComponent('test-id', MockComponent); // This adds raw component

            const component = registry.getComponent('test-id');
            expect(component).toBe(MockComponent); // Should return raw, not lazy
        });

        test('does not apply decorator when not in design mode', () => {
            mockAdapter.setDesignMode(false);
            registry.registerComponent('test-id', MockComponent);

            const component = registry.getComponent('test-id');

            expect(mockAdapter.decorateComponent).toHaveBeenCalledWith(MockComponent);
            expect(component).toBe(MockComponent);
        });

        test('handles null component gracefully', () => {
            // Manually set a null component in registry
            (registry as any).registry.set('null-id', { id: 'null-id', raw: null });

            const component = registry.getComponent('null-id');
            expect(component).toBeNull();
        });

        test('reports whether a concrete component export is registered', async () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));
            registry.registerImporter('test-id', importer);

            expect(registry.hasConcreteComponent('test-id')).toBe(false);
            await registry.preload('test-id');
            expect(registry.hasConcreteComponent('test-id')).toBe(false);

            await registry.loadAndRegister('test-id');
            expect(registry.hasConcreteComponent('test-id')).toBe(true);
        });
    });

    describe('preload', () => {
        test('resolves immediately for registered raw component', async () => {
            registry.registerComponent('test-id', MockComponent);

            await expect(registry.preload('test-id')).resolves.toBeUndefined();
        });

        test('calls importer when preloading lazy component', async () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('lazy-id', importer);
            await registry.preload('lazy-id');

            expect(importer).toHaveBeenCalledTimes(1);
            expect(mockAdapter.createLazyComponent).toHaveBeenCalledWith(importer);
        });

        test('throws error for non-existent component', async () => {
            await expect(registry.preload('non-existent')).rejects.toThrow(
                'Component "non-existent" could not be discovered'
            );
        });

        test('deduplicates concurrent preload calls', async () => {
            const importer = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { default: MockComponent };
            });

            registry.registerImporter('lazy-id', importer);

            // Call preload multiple times concurrently
            await Promise.all([registry.preload('lazy-id'), registry.preload('lazy-id'), registry.preload('lazy-id')]);

            // Importer should only be called once due to deduplication
            expect(importer).toHaveBeenCalledTimes(1);
        });

        test('handles importer that returns fallback component', async () => {
            const FallbackComponent = { __componentBrand: Symbol() as any };
            const importer = vi.fn(() =>
                Promise.resolve({
                    default: MockComponent,
                    fallback: FallbackComponent,
                })
            );

            registry.registerImporter('test-id', importer);
            await registry.preload('test-id');

            expect(registry.getFallback('test-id')).toBe(FallbackComponent);
        });
    });

    describe('loadAndRegister', () => {
        test('registers the concrete component and preserves importer metadata', async () => {
            const FallbackComponent = { __componentBrand: Symbol() as any };
            const importer = vi.fn(() =>
                Promise.resolve({
                    default: MockComponent,
                    fallback: FallbackComponent,
                })
            );
            const loaderNames: LoaderNames = { loader: 'loader' };
            registry.registerImporter('test-id', importer, loaderNames);

            await registry.loadAndRegister('test-id');

            expect(registry.getComponent('test-id')).toBe(MockComponent);
            expect(registry.getFallback('test-id')).toBe(FallbackComponent);
            expect(registry.getLoaderNames('test-id')).toEqual(loaderNames);
            expect(mockAdapter.createLazyComponent).not.toHaveBeenCalled();

            await registry.loadAndRegister('test-id');
            expect(importer).toHaveBeenCalledTimes(1);
        });

        test('ignores unknown component IDs', async () => {
            await expect(registry.loadAndRegister('unknown-id')).resolves.toBeUndefined();
            expect(registry.has('unknown-id')).toBe(false);
        });

        test('deduplicates concurrent load-and-register calls', async () => {
            const importer = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { default: MockComponent };
            });
            registry.registerImporter('test-id', importer);

            await Promise.all([
                registry.loadAndRegister('test-id'),
                registry.loadAndRegister('test-id'),
                registry.loadAndRegister('test-id'),
            ]);

            expect(importer).toHaveBeenCalledTimes(1);
        });

        test('does not restore a component removed while its import is in flight', async () => {
            let resolveImporter!: (module: ComponentModule<TestProps>) => void;
            const importer = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveImporter = resolve;
                    })
            );
            registry.registerImporter('test-id', importer);

            const registration = registry.loadAndRegister('test-id');
            registry.clear();
            resolveImporter({ default: MockComponent });
            await registration;

            expect(registry.has('test-id')).toBe(false);
        });

        test('does not overwrite a replacement importer', async () => {
            let resolveImporter!: (module: ComponentModule<TestProps>) => void;
            const importer = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveImporter = resolve;
                    })
            );
            const replacement = vi.fn(() => Promise.resolve({ default: MockComponent }));
            registry.registerImporter('test-id', importer);

            const registration = registry.loadAndRegister('test-id');
            registry.registerImporter('test-id', replacement);
            resolveImporter({ default: MockComponent });
            await registration;

            await registry.loadAndRegister('test-id');
            expect(replacement).toHaveBeenCalledOnce();
        });

        test('preserves a concrete component when lazy discovery finishes later', async () => {
            let resolveDiscovery!: (module: ComponentModule<TestProps>) => void;
            let resolveRegistration!: (module: ComponentModule<TestProps>) => void;
            const importer = vi
                .fn()
                .mockImplementationOnce(
                    () =>
                        new Promise<ComponentModule<TestProps>>((resolve) => {
                            resolveDiscovery = resolve;
                        })
                )
                .mockImplementationOnce(
                    () =>
                        new Promise<ComponentModule<TestProps>>((resolve) => {
                            resolveRegistration = resolve;
                        })
                );
            registry.registerImporter('test-id', importer);

            const discovery = registry.preload('test-id');
            const registration = registry.loadAndRegister('test-id');

            resolveRegistration({ default: MockComponent });
            await registration;
            resolveDiscovery({ default: MockComponent });
            await discovery;

            expect(registry.getComponent('test-id')).toBe(MockComponent);
            expect(mockAdapter.createLazyComponent).toHaveBeenCalledOnce();
        });

        test('does not overwrite an importer replaced during lazy discovery', async () => {
            let resolveImporter!: (module: ComponentModule<TestProps>) => void;
            const importer = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveImporter = resolve;
                    })
            );
            const replacement = vi.fn(() => Promise.resolve({ default: MockComponent }));
            registry.registerImporter('test-id', importer);

            const discovery = registry.preload('test-id');
            registry.registerImporter('test-id', replacement);
            resolveImporter({ default: MockComponent });

            await expect(discovery).rejects.toThrow('could not be discovered');
            await registry.loadAndRegister('test-id');
            expect(replacement).toHaveBeenCalledOnce();
        });
    });

    describe('hasLoaders', () => {
        test('reports whether a component has at least one configured loader', () => {
            expect(registry.hasLoaders('missing')).toBe(false);
            registry.registerImporter(
                'without-loader',
                vi.fn(() => Promise.resolve({ default: MockComponent }))
            );
            registry.registerImporter(
                'with-loader',
                vi.fn(() => Promise.resolve({ default: MockComponent })),
                {
                    loader: 'loader',
                }
            );

            expect(registry.hasLoaders('without-loader')).toBe(false);
            expect(registry.hasLoaders('with-loader')).toBe(true);
        });
    });

    describe('getLoaderNames', () => {
        test('returns undefined for component without loader names', () => {
            registry.registerComponent('test-id', MockComponent);

            const loaderNames = registry.getLoaderNames('test-id');
            expect(loaderNames).toBeUndefined();
        });

        test('returns loader names from registration', () => {
            const loaderNames: LoaderNames = {
                loader: 'serverLoader',
                clientLoader: 'clientLoader',
            };
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer, loaderNames);

            expect(registry.getLoaderNames('test-id')).toEqual(loaderNames);
        });

        test('returns undefined for non-existent component', () => {
            const loaderNames = registry.getLoaderNames('non-existent');
            expect(loaderNames).toBeUndefined();
        });
    });

    describe('callLoader', () => {
        test('calls server loader function successfully', async () => {
            const mockLoaderResult = { data: 'test' };
            const serverLoader = vi.fn().mockResolvedValue(mockLoaderResult);
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
                loader: serverLoader,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));
            const loaderNames: LoaderNames = { loader: 'loader' };
            const loaderArgs = { request: 'test-request' };

            registry.registerImporter('test-id', importer, loaderNames);

            const result = await registry.callLoader('test-id', loaderArgs);

            expect(importer).toHaveBeenCalledTimes(1);
            expect(serverLoader).toHaveBeenCalledWith(loaderArgs);
            expect(result).toBe(mockLoaderResult);
        });

        test('calls client loader function successfully', async () => {
            const mockLoaderResult = { clientData: 'test' };
            const clientLoader = vi.fn().mockResolvedValue(mockLoaderResult);
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
                clientLoader,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));
            const loaderNames: LoaderNames = { clientLoader: 'clientLoader' };
            const loaderArgs = { serverLoader: vi.fn() };

            registry.registerImporter('test-id', importer, loaderNames);

            const result = await registry.callLoader('test-id', loaderArgs, 'clientLoader');

            expect(importer).toHaveBeenCalledTimes(1);
            expect(clientLoader).toHaveBeenCalledWith(loaderArgs);
            expect(result).toBe(mockLoaderResult);
        });

        test('returns undefined when loader name not found', async () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer); // No loader names

            const result = await registry.callLoader('test-id', {});
            expect(result).toBeUndefined();
        });

        test('returns undefined when component has no loader names', async () => {
            registry.registerComponent('test-id', MockComponent);

            const result = await registry.callLoader('test-id', {});
            expect(result).toBeUndefined();
        });

        test('returns undefined when loader function not found in module', async () => {
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
                // No loader function
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));
            const loaderNames: LoaderNames = { loader: 'nonExistentLoader' };

            registry.registerImporter('test-id', importer, loaderNames);

            const result = await registry.callLoader('test-id', {});
            expect(result).toBeUndefined();
        });

        test('throws when loader metadata has no importer', async () => {
            (registry as any).registry.set('test-id', {
                id: 'test-id',
                raw: MockComponent,
                loaderNames: { loader: 'loader' },
            });

            await expect(registry.callLoader('test-id', {})).rejects.toThrow('No importer found');
        });

        test('wraps importer and loader failures with component context', async () => {
            registry.registerImporter(
                'import-failure',
                vi.fn(() => Promise.reject(new Error('import failed'))),
                {
                    loader: 'loader',
                }
            );
            registry.registerImporter(
                'loader-failure',
                vi.fn(() =>
                    Promise.resolve({
                        default: MockComponent,
                        loader: vi.fn(() => Promise.reject(new Error('loader failed'))),
                    })
                ),
                { loader: 'loader' }
            );

            await expect(registry.callLoader('import-failure', {})).rejects.toThrow(
                "Failed to call loader for component 'import-failure': import failed"
            );
            await expect(registry.callLoader('loader-failure', {})).rejects.toThrow(
                "Failed to call loader for component 'loader-failure': loader failed"
            );
        });
    });

    describe('getFallback', () => {
        test('returns undefined for component without fallback', () => {
            registry.registerComponent('test-id', MockComponent);

            const fallback = registry.getFallback('test-id');
            expect(fallback).toBeUndefined();
        });

        test('returns fallback from module after preload', async () => {
            const FallbackComponent = { __componentBrand: Symbol() as any };
            const importer = vi.fn(() =>
                Promise.resolve({
                    default: MockComponent,
                    fallback: FallbackComponent,
                })
            );

            registry.registerImporter('test-id', importer);
            await registry.preload('test-id');

            const fallback = registry.getFallback('test-id');
            expect(fallback).toBe(FallbackComponent);
        });

        test('returns undefined for non-existent component', () => {
            const fallback = registry.getFallback('non-existent');
            expect(fallback).toBeUndefined();
        });
    });

    describe('getRegisteredIds', () => {
        test('returns empty array for new registry', () => {
            const ids = registry.getRegisteredIds();
            expect(ids).toEqual([]);
        });

        test('returns all registered component ids', () => {
            registry.registerComponent('id-1', MockComponent);
            registry.registerComponent('id-2', MockComponent);
            registry.registerComponent('id-3', MockComponent);

            const ids = registry.getRegisteredIds();
            expect(ids).toHaveLength(3);
            expect(ids).toContain('id-1');
            expect(ids).toContain('id-2');
            expect(ids).toContain('id-3');
        });

        test('includes components registered via importer', () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerComponent('raw-id', MockComponent);
            registry.registerImporter('lazy-id', importer);

            const ids = registry.getRegisteredIds();
            expect(ids).toHaveLength(2);
            expect(ids).toContain('raw-id');
            expect(ids).toContain('lazy-id');
        });
    });

    describe('has', () => {
        test('returns false for non-existent component', () => {
            expect(registry.has('non-existent')).toBe(false);
        });

        test('returns true for registered component', () => {
            registry.registerComponent('test-id', MockComponent);
            expect(registry.has('test-id')).toBe(true);
        });

        test('returns true for component with registered importer', () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));
            registry.registerImporter('lazy-id', importer);
            expect(registry.has('lazy-id')).toBe(true);
        });
    });

    describe('clear', () => {
        test('removes all registered components', () => {
            registry.registerComponent('id-1', MockComponent);
            registry.registerComponent('id-2', MockComponent);

            registry.clear();

            expect(registry.getRegisteredIds()).toEqual([]);
            expect(registry.has('id-1')).toBe(false);
            expect(registry.has('id-2')).toBe(false);
        });

        test('cancels pending discoveries when cleared', async () => {
            const importer = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { default: MockComponent };
            });

            registry.registerImporter('lazy-id', importer);

            // Start preload but don't await
            const preloadPromise = registry.preload('lazy-id');

            // Clear immediately (cancels in-flight discoveries)
            registry.clear();

            // The preload promise should reject with cancellation error
            await expect(preloadPromise).rejects.toThrow('Component discovery for "lazy-id" was cancelled');

            // The component should not be in the registry
            expect(registry.has('lazy-id')).toBe(false);
            expect(registry.getRegisteredIds()).toEqual([]);
        });

        test('cancels all concurrent pending discoveries', async () => {
            const importer = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { default: MockComponent };
            });

            registry.registerImporter('lazy-id', importer);

            // Start multiple concurrent preloads
            const promise1 = registry.preload('lazy-id');
            const promise2 = registry.preload('lazy-id');
            const promise3 = registry.preload('lazy-id');

            // Clear should cancel all of them
            registry.clear();

            // All promises should reject with the same error
            await expect(promise1).rejects.toThrow('Component discovery for "lazy-id" was cancelled');
            await expect(promise2).rejects.toThrow('Component discovery for "lazy-id" was cancelled');
            await expect(promise3).rejects.toThrow('Component discovery for "lazy-id" was cancelled');

            expect(registry.has('lazy-id')).toBe(false);
        });
    });

    describe('async behavior and error handling', () => {
        test('does not let a post-clear discovery consume an earlier discovery cancellation', async () => {
            let resolveImporter!: (value: ComponentModule<TestProps>) => void;
            const importer = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveImporter = resolve;
                    })
            );
            registry.registerImporter('cancelled-id', importer);

            const cancelledDiscovery = registry.preload('cancelled-id');
            registry.clear();
            const postClearDiscovery = registry.preload('cancelled-id');
            resolveImporter({ default: MockComponent });

            const [cancelledResult, postClearResult] = await Promise.allSettled([
                cancelledDiscovery,
                postClearDiscovery,
            ]);

            expect(cancelledResult).toMatchObject({
                status: 'rejected',
                reason: expect.objectContaining({ message: 'Component discovery for "cancelled-id" was cancelled' }),
            });
            expect(postClearResult).toMatchObject({
                status: 'rejected',
                reason: expect.objectContaining({
                    message: expect.stringContaining('Component "cancelled-id" could not be discovered'),
                }),
            });
        });

        test('keeps a post-clear discovery pending when the cancelled operation settles first', async () => {
            let resolveCancelledImporter!: (value: ComponentModule<TestProps>) => void;
            let resolveReplacementImporter!: (value: ComponentModule<TestProps>) => void;
            const cancelledImporter = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveCancelledImporter = resolve;
                    })
            );
            const replacementImporter = vi.fn(
                () =>
                    new Promise<ComponentModule<TestProps>>((resolve) => {
                        resolveReplacementImporter = resolve;
                    })
            );
            registry.registerImporter('cancelled-id', cancelledImporter);

            const cancelledDiscovery = registry.preload('cancelled-id');
            registry.clear();
            registry.registerImporter('cancelled-id', replacementImporter);
            const replacementDiscovery = registry.preload('cancelled-id');

            resolveCancelledImporter({ default: MockComponent });
            await expect(cancelledDiscovery).rejects.toThrow('Component discovery for "cancelled-id" was cancelled');

            const concurrentReplacementDiscovery = registry.preload('cancelled-id');
            expect(replacementImporter).toHaveBeenCalledOnce();

            resolveReplacementImporter({ default: MockComponent });
            await expect(Promise.all([replacementDiscovery, concurrentReplacementDiscovery])).resolves.toEqual([
                undefined,
                undefined,
            ]);

            expect(registry.getComponent('cancelled-id')).toBe(MockLazyComponent);
        });

        test('handles importer rejection gracefully', async () => {
            const importError = new Error('Import failed');
            const importer = vi.fn(() => Promise.reject(importError));

            registry.registerImporter('failing-id', importer);

            await expect(registry.preload('failing-id')).rejects.toThrow('Import failed');
        });

        test('handles concurrent access to same component', async () => {
            const importer = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return { default: MockComponent };
            });

            registry.registerImporter('concurrent-id', importer);

            // Start preload and wait for it to complete
            await registry.preload('concurrent-id');

            // Now test concurrent getComponent calls
            const [component1, component2] = await Promise.all([
                Promise.resolve(registry.getComponent('concurrent-id')),
                Promise.resolve(registry.getComponent('concurrent-id')),
            ]);

            expect(component1).toBeTruthy();
            expect(component2).toBeTruthy();
            expect(importer).toHaveBeenCalledTimes(1); // Should be deduplicated
        });

        test('handles component discovery cancellation during async operation', async () => {
            let resolveImporter!: (value: ComponentModule<TestProps>) => void;
            const importerPromise = new Promise<ComponentModule<TestProps>>((resolve) => {
                resolveImporter = resolve;
            });
            const importer = vi.fn(() => importerPromise);

            registry.registerImporter('async-id', importer);

            // Start preload
            const preloadPromise = registry.preload('async-id');

            // Clear registry while import is in progress
            registry.clear();

            // Resolve the importer after clear
            resolveImporter({ default: MockComponent });

            // Should reject due to cancellation
            await expect(preloadPromise).rejects.toThrow('Component discovery for "async-id" was cancelled');
        });
    });

    describe('adapter integration', () => {
        test('calls adapter methods with correct parameters', async () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockComponent }));

            registry.registerImporter('test-id', importer);
            await registry.preload('test-id');

            // Check lazy component creation
            expect(mockAdapter.createLazyComponent).toHaveBeenCalledWith(importer);
        });

        test('respects adapter design mode state changes', () => {
            registry.registerComponent('test-id', MockComponent);

            // First call - design mode off
            mockAdapter.setDesignMode(false);
            const component1 = registry.getComponent('test-id');
            expect(component1).toBe(MockComponent);
            expect(mockAdapter.decorateComponent).toHaveBeenCalledWith(MockComponent);

            // Clear mocks for second call
            vi.clearAllMocks();

            // Second call - design mode on
            mockAdapter.setDesignMode(true);
            const component2 = registry.getComponent('test-id');
            expect(component2).toBe(MockDecoratedComponent);
            expect(mockAdapter.decorateComponent).toHaveBeenCalledWith(MockComponent);
        });
    });

    describe('edge cases', () => {
        test('handles empty component id', () => {
            registry.registerComponent('', MockComponent);
            expect(registry.has('')).toBe(true);
            expect(registry.getComponent('')).toBe(MockComponent);
        });

        test('handles special characters in component id', () => {
            const specialId = 'test-id_with.special@chars#123';
            registry.registerComponent(specialId, MockComponent);
            expect(registry.has(specialId)).toBe(true);
            expect(registry.getComponent(specialId)).toBe(MockComponent);
        });

        test('handles very long component id', () => {
            const longId = 'a'.repeat(1000);
            registry.registerComponent(longId, MockComponent);
            expect(registry.has(longId)).toBe(true);
            expect(registry.getComponent(longId)).toBe(MockComponent);
        });

        test('handles module with additional exports', async () => {
            const additionalExport = vi.fn();
            const mockModule: ComponentModule<TestProps> = {
                default: MockComponent,
                additionalExport,
                someOtherProperty: 'value',
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            registry.registerImporter('test-id', importer);
            await registry.preload('test-id');

            expect(registry.getComponent('test-id')).toBeTruthy();
        });
    });
});
