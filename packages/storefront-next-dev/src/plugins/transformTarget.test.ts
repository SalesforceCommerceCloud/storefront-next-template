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
import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import type { ResolvedConfig } from 'vite';

import { transformTargetPlaceholderPlugin } from './transformTargets';
import { pathEndsWith } from '../test-utils';

// mock vite config
const viteConfig = {
    resolve: {
        alias: [{ find: '@', replacement: 'src' }],
    },
} as unknown as ResolvedConfig;

// Mock the target-utils module
vi.mock('../extensibility/target-utils', () => ({
    buildTargetRegistry: vi.fn(),
    transformTargets: vi.fn(),
    collectUITargetIds: vi.fn(),
    validateTargetRegistry: vi.fn(),
}));

import {
    buildTargetRegistry,
    collectUITargetIds,
    validateTargetRegistry,
    type TargetComponentRegistry,
    type TargetContextProviderConfig,
    transformTargets,
} from '../extensibility/target-utils';

describe('transformTargetPlaceholderPlugin', () => {
    let buildTargetRegistryMock: any;
    let transformTargetsMock: any;
    let vitePlugin: ReturnType<typeof transformTargetPlaceholderPlugin>;
    const mockComponentRegistry: TargetComponentRegistry = {
        'test.target': [
            {
                targetId: 'test.target',
                path: 'extensions/bar.tsx',
                namespace: 'Bar',
                componentName: 'Bar_Foo',
                order: 0,
            },
        ],
    };
    const mockContextProviders: TargetContextProviderConfig[] = [
        {
            path: 'extensions/store-locator/providers/store-locator.tsx',
            namespace: 'StoreLocator',
            componentName: 'StoreLocator_StoreLocator',
            order: 0,
        },
    ];
    const mockCode: string = '<div>Hello</div>';
    const mockId = '/project/src/SomeComponent.tsx';
    const rootId = join('src', 'root.tsx');

    beforeEach(() => {
        // Mock target-utils methods
        buildTargetRegistryMock = vi.mocked(buildTargetRegistry).mockImplementation(() => ({
            componentRegistry: mockComponentRegistry,
            contextProviders: mockContextProviders,
            actionHookRegistry: {},
        }));
        transformTargetsMock = vi.mocked(transformTargets);
        vi.mocked(collectUITargetIds).mockReturnValue(new Set(['test.target']));
        vi.mocked(validateTargetRegistry).mockReturnValue([]);
        vi.spyOn(process, 'cwd').mockReturnValue('/project');

        vitePlugin = transformTargetPlaceholderPlugin();
        vitePlugin.configResolved(viteConfig);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should use src as default when no alias is found in the vite config', () => {
        const viteConfig2 = {
            resolve: {
                alias: [{ find: '+', replacement: 'foobar' }],
            },
        } as unknown as ResolvedConfig;
        vitePlugin.configResolved(viteConfig2);
        vitePlugin.buildStart();
        // Use pathEndsWith for cross-platform path comparison (handles Windows absolute paths)
        const actualPath = buildTargetRegistryMock.mock.calls[0][0] as string;
        expect(pathEndsWith(actualPath, '/src')).toBe(true);
    });

    it('should build registry at buildStart()', () => {
        vitePlugin.buildStart();
        expect(buildTargetRegistryMock).toHaveBeenCalledWith('src', { isProduction: false });
    });

    it('should pass isProduction: true when config.mode is production', () => {
        const productionConfig = {
            ...viteConfig,
            mode: 'production',
        } as unknown as ResolvedConfig;
        vitePlugin.configResolved(productionConfig);
        vitePlugin.buildStart();
        expect(buildTargetRegistryMock).toHaveBeenCalledWith('src', { isProduction: true });
    });

    it('should transform root.tsx with injectTargetContextProviders', () => {
        vitePlugin.buildStart();
        transformTargetsMock.mockReturnValue('transformed-root-code');
        const res = vitePlugin.transform(mockCode, `/project/${rootId}`);
        expect(transformTargetsMock).toHaveBeenCalledWith(mockCode, mockComponentRegistry, mockContextProviders);
        expect(res).toEqual({ code: 'transformed-root-code', map: null });
    });

    it('should transform other components with transformTargetComponent', () => {
        vitePlugin.buildStart();
        transformTargetsMock.mockReturnValue('transformed-nonroot');
        const res = vitePlugin.transform(mockCode, mockId);
        expect(transformTargetsMock).toHaveBeenCalledWith(mockCode, mockComponentRegistry, mockContextProviders);
        expect(res).toEqual({ code: 'transformed-nonroot', map: null });
    });

    it('should return null if transformedCode is null or undefined', () => {
        vitePlugin.buildStart();
        transformTargetsMock.mockReturnValue(null);
        const res = vitePlugin.transform(mockCode, mockId);
        expect(res).toBeNull();
    });

    it('should log and throw on transform error', () => {
        vitePlugin.buildStart();
        const error = new Error('test error');
        transformTargetsMock.mockImplementation(() => {
            throw error;
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => vitePlugin.transform(mockCode, mockId)).toThrow(error);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('UITarget replace ERROR in /project/src/SomeComponent.tsx: Error: test error')
        );
        errorSpy.mockRestore();
    });

    it('should log and throw on transform error that is not an Error', () => {
        vitePlugin.buildStart();
        const error = 'test error';
        transformTargetsMock.mockImplementation(() => {
            // oxlint-disable-next-line @typescript-eslint/only-throw-error
            throw error;
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => vitePlugin.transform(mockCode, mockId)).toThrow(error);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('UITarget replace ERROR in /project/src/SomeComponent.tsx: test error')
        );
        errorSpy.mockRestore();
    });

    it('should throw when extensions target non-existent UITarget IDs', () => {
        vi.mocked(validateTargetRegistry).mockReturnValue([
            {
                targetId: 'sfcc.nonexistent.target',
                extension: 'MyExt',
                componentPath: 'extensions/my-ext/comp.tsx',
            },
        ]);

        expect(() => vitePlugin.buildStart()).toThrow(
            /1 extension component\(s\) target UITarget IDs that do not exist/
        );
        expect(() => vitePlugin.buildStart()).toThrow(/sfcc\.nonexistent\.target/);
    });

    it('should not throw when all extension targets are valid', () => {
        vi.mocked(validateTargetRegistry).mockReturnValue([]);

        expect(() => vitePlugin.buildStart()).not.toThrow();
    });

    it('should call collectUITargetIds with sourceDir and validateTargetRegistry with registry', () => {
        vitePlugin.buildStart();

        expect(collectUITargetIds).toHaveBeenCalledWith('src');
        expect(validateTargetRegistry).toHaveBeenCalledWith(mockComponentRegistry, new Set(['test.target']));
    });
});
