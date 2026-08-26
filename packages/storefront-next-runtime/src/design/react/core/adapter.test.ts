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
import React from 'react';
import { ReactAdapter, createReactAdapter, type ReactComponentModule } from './adapter';
import { createReactComponentDesignDecorator } from './ComponentDecorator';

vi.mock('./ComponentDecorator', () => ({
    createReactComponentDesignDecorator: vi.fn(),
}));

type TestProps = { title: string };

// Mock components for testing
const MockReactComponent: React.ComponentType<TestProps> = ({ title }: TestProps) =>
    React.createElement('div', { 'data-testid': 'mock-component' }, title);

const MockDecoratedComponent: React.ComponentType<TestProps> = ({ title }: TestProps) =>
    React.createElement('div', { 'data-testid': 'decorated-component' }, title);

const MockLazyComponent = {
    $$typeof: Symbol.for('react.lazy'),
    _payload: null,
    _init: vi.fn(),
} as unknown as React.LazyExoticComponent<React.ComponentType<TestProps>>;

describe('ReactAdapter', () => {
    let adapter: ReactAdapter<TestProps>;
    let mockCreateReactComponentDesignDecorator: ReturnType<typeof vi.fn>;
    let mockReactLazy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockCreateReactComponentDesignDecorator = vi.mocked(createReactComponentDesignDecorator);

        // Mock React.lazy using vi.spyOn with proper type casting
        mockReactLazy = vi.spyOn(React, 'lazy').mockReturnValue(MockLazyComponent) as any;

        mockCreateReactComponentDesignDecorator.mockReturnValue(MockDecoratedComponent);

        adapter = new ReactAdapter<TestProps>();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        test('creates adapter instance', () => {
            expect(adapter).toBeInstanceOf(ReactAdapter);
        });

        test('creates new instance each time', () => {
            const adapter1 = createReactAdapter<TestProps>();
            const adapter2 = createReactAdapter<TestProps>();

            expect(adapter1).not.toBe(adapter2);
            expect(adapter1).toBeInstanceOf(ReactAdapter);
            expect(adapter2).toBeInstanceOf(ReactAdapter);
        });
    });

    describe('createLazyComponent', () => {
        test('creates React lazy component from importer', async () => {
            const mockModule: ReactComponentModule<TestProps> = {
                default: MockReactComponent,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            const result = adapter.createLazyComponent(importer);

            expect(mockReactLazy).toHaveBeenCalledTimes(1);
            expect(result).toBe(MockLazyComponent);

            // Test the lazy wrapper function
            const lazyWrapperFn = mockReactLazy.mock.calls[0][0];
            const wrappedResult = await lazyWrapperFn();

            expect(wrappedResult).toEqual({ default: MockReactComponent });
            expect(importer).toHaveBeenCalledTimes(1);
        });

        test('handles importer that returns React component', async () => {
            const mockModule: ReactComponentModule<TestProps> = {
                default: MockReactComponent,
                fallback: MockReactComponent,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            adapter.createLazyComponent(importer);

            // Verify the lazy wrapper extracts the default component correctly
            const lazyWrapperFn = mockReactLazy.mock.calls[0][0];
            const wrappedResult = await lazyWrapperFn();

            expect(wrappedResult.default).toBe(MockReactComponent);
        });

        test('handles importer rejection', async () => {
            const importError = new Error('Import failed');
            const importer = vi.fn(() => Promise.reject(importError));

            adapter.createLazyComponent(importer);

            // Test that the lazy wrapper propagates the error
            const lazyWrapperFn = mockReactLazy.mock.calls[0][0];

            await expect(lazyWrapperFn()).rejects.toThrow('Import failed');
        });

        test('returns lazy component with correct type branding', () => {
            const importer = vi.fn(() => Promise.resolve({ default: MockReactComponent }));

            const result = adapter.createLazyComponent(importer);

            expect(result).toBe(MockLazyComponent);
            // Verify it has the lazy component branding (React.lazy adds $$typeof)
            expect((result as any).$$typeof).toBe(Symbol.for('react.lazy'));
        });
    });

    describe('decorateComponent', () => {
        test('decorates component with React design decorator', () => {
            const component = MockReactComponent;

            const result = adapter.decorateComponent(component);

            expect(mockCreateReactComponentDesignDecorator).toHaveBeenCalledWith(MockReactComponent);
            expect(result).toBe(MockDecoratedComponent);
        });

        test('returns the same decorated component type across renders', () => {
            const first = adapter.decorateComponent(MockReactComponent);
            const second = adapter.decorateComponent(MockReactComponent);

            expect(second).toBe(first);
            expect(mockCreateReactComponentDesignDecorator).toHaveBeenCalledOnce();
        });

        test('handles component type casting correctly', () => {
            const component = MockReactComponent;

            adapter.decorateComponent(component);

            // Verify the component was passed to the decorator as React.ComponentType
            expect(mockCreateReactComponentDesignDecorator).toHaveBeenCalledWith(
                expect.any(Function) // MockReactComponent
            );
        });

        test('returns decorated component as generic Component type', () => {
            const component = MockReactComponent;

            const result = adapter.decorateComponent(component);

            // Result should be castable back to generic Component
            expect(result).toBe(MockDecoratedComponent);
            expect(typeof result).toBe('function');
        });
    });

    describe('integration scenarios', () => {
        test('full component lifecycle with decoration', () => {
            const mockModule: ReactComponentModule<TestProps> = {
                default: MockReactComponent,
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            // Create lazy component
            const lazyComponent = adapter.createLazyComponent(importer);
            expect(lazyComponent).toBe(MockLazyComponent);

            // Decorate component
            const decoratedComponent = adapter.decorateComponent(MockReactComponent);
            expect(decoratedComponent).toBe(MockDecoratedComponent);
        });

        test('handles complex component module with multiple exports', async () => {
            const fallbackComponent = MockReactComponent;
            const mockModule: ReactComponentModule<TestProps> = {
                default: MockReactComponent,
                fallback: fallbackComponent,
                loader: vi.fn(),
                clientLoader: vi.fn(),
                customExport: 'test',
            };
            const importer = vi.fn(() => Promise.resolve(mockModule));

            adapter.createLazyComponent(importer);

            // Verify only the default export is used for the lazy component
            const lazyWrapperFn = mockReactLazy.mock.calls[0][0];
            const wrappedResult = await lazyWrapperFn();

            expect(wrappedResult).toEqual({ default: MockReactComponent });
            expect(wrappedResult.fallback).toBeUndefined();
            expect(wrappedResult.loader).toBeUndefined();
        });
    });

    describe('error handling', () => {
        test('handles decorator errors gracefully', () => {
            const decoratorError = new Error('Decorator failed');
            mockCreateReactComponentDesignDecorator.mockImplementation(() => {
                throw decoratorError;
            });

            const component = MockReactComponent;

            expect(() => adapter.decorateComponent(component)).toThrow('Decorator failed');
        });
    });
});
