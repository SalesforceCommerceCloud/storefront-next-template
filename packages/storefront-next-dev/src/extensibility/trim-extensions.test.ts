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
/* oxlint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { Volume, type Volume as VolumeType } from 'memfs';
import path from 'path';
import { createPathRegex } from '../test-utils';

// Mock extension config to simulate different extension states
const mockedExtensionConfig: Record<string, { name: string; description: string; folder?: string }> = {
    extensions: {
        SFDC_EXT_featureA: {
            name: 'Feature A',
            description: 'Feature A description',
            folder: 'feature-a',
        },
        SFDC_EXT_featureB: {
            name: 'Feature B',
            description: 'Feature B description',
            folder: 'feature-b',
        },
        SFDC_EXT_featureC: {
            name: 'Feature C',
            description: 'Feature C description',
            // No folder property - should not attempt to delete
        },
    },
};

// In-memory file system
let vol: VolumeType;

// Helper to create in-memory file system with test files
const createTestFileSystem = (fileContents: any = {}) => {
    vol = new Volume();

    const defaultFiles: Record<string, string> = {
        '/mock/dir/src/extensions/config.json': fileContents.extensionConfig || JSON.stringify(mockedExtensionConfig),
        '/mock/dir/src/components/test.tsx': fileContents.testComponent || 'export const Test = "test";',
        ...(fileContents.additional || {}),
    };

    vol.fromJSON(defaultFiles);

    // Mock fs module with memfs volume
    vi.doMock('fs', () => ({
        default: vol,
        ...vol,
    }));

    return vol;
};

// Helper to read file content from memory
const readFile = (filePath: string) => {
    try {
        return vol.readFileSync(filePath, 'utf8') as string;
    } catch {
        return null;
    }
};

// Helper to check if file exists
const fileExists = (filePath: string) => {
    try {
        vol.statSync(filePath);
        return true;
    } catch {
        return false;
    }
};

// Mock console methods
const mockConsole = (method: 'log' | 'error' | 'warn' = 'error') => {
    const spy = vi.spyOn(console, method).mockImplementation(() => vi.fn() as any);
    return spy;
};

// Custom matcher to compare strings line by line with trimming
expect.extend({
    toEqualTrimmedLines(received: string, expected: string) {
        const clean = (str: string) =>
            str
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);

        const receivedLines = clean(received);
        const expectedLines = clean(expected);

        const pass = this.equals(receivedLines, expectedLines);

        if (pass) {
            return {
                pass: true,
                message: () =>
                    `✅ Expected strings not to match line by line (but they did).\n\nExpected: ${this.utils.printExpected(
                        expectedLines
                    )}\nReceived: ${this.utils.printReceived(receivedLines)}`,
            };
        } else {
            return {
                pass: false,
                message: () =>
                    `❌ Expected strings to match line by line (with trimming).\n\nExpected: ${this.utils.printExpected(
                        expectedLines
                    )}\nReceived: ${this.utils.printReceived(receivedLines)}`,
            };
        }
    },
} as any);

// Import after fs is mocked
const reloadModule = async () => {
    vi.resetModules();
    return await import('./trim-extensions');
};

describe('trim-extensions', () => {
    let trimExtensions: (dir: string, ext: Record<string, boolean>, config?: any) => Promise<void>;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        createTestFileSystem();
        const mod = await reloadModule();
        trimExtensions = mod.default || mod;
    });

    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('formats only files changed by extension removal', async () => {
        const formatFilesWithBundledBiome = vi.fn();
        vi.doMock('../utils/format-with-project-biome', () => ({
            formatFilesWithBundledBiome,
        }));
        const { default: trimExtensionsWithFormatter } = await reloadModule();

        await trimExtensionsWithFormatter('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig as never);

        expect(formatFilesWithBundledBiome).toHaveBeenCalledWith('/mock/dir', [
            path.join('/mock/dir', 'src', 'extensions', 'config.json'),
        ]);
    });

    it('does not format files in an extension folder that was removed', async () => {
        const formatFilesWithBundledBiome = vi.fn();
        vi.doMock('../utils/format-with-project-biome', () => ({
            formatFilesWithBundledBiome,
        }));
        const { default: trimExtensionsWithFormatter } = await reloadModule();
        vol.mkdirSync('/mock/dir/src/extensions/feature-a', { recursive: true });
        vol.writeFileSync(
            '/mock/dir/src/extensions/feature-a/test.ts',
            '// @sfdc-extension-line SFDC_EXT_featureA\nconst featureA = true;'
        );

        await trimExtensionsWithFormatter('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig as never);

        expect(formatFilesWithBundledBiome).toHaveBeenCalledWith('/mock/dir', [
            path.join('/mock/dir', 'src', 'extensions', 'config.json'),
        ]);
    });

    describe('single line markers', () => {
        it('removes single lines marked with @sfdc-extension-line when extension is disabled', async () => {
            const code = `
                const test = () => {
                    // @sfdc-extension-line SFDC_EXT_featureA
                    const featureA = 'Feature A';
                    const categories = flatten(categoriesTree || {}, 'categories');
                    return [locale?.id || appConfig.defaultAppLocale];
                };
            `;

            const expected = `
                const test = () => {
                    const categories = flatten(categoriesTree || {}, 'categories');
                    return [locale?.id || appConfig.defaultAppLocale];
                };
            `;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig);

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toEqualTrimmedLines(expected);
        });

        it('preserves single lines when extension is enabled', async () => {
            const code = `
                const test = () => {
                    // @sfdc-extension-line SFDC_EXT_featureA
                    const featureA = 'Feature A';
                    const other = 'other';
                };
            `;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig);

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toContain('featureA');
            expect(result).toContain('Feature A');
        });

        it('handles multiple single line markers', async () => {
            const code = `
                MyClass.PropTypes = {
                    name: PropTypes.string,
                    // @sfdc-extension-line SFDC_EXT_featureA
                    featureAProp: PropTypes.string,
                    // @sfdc-extension-line SFDC_EXT_featureB
                    featureBProp: PropTypes.string,
                };
            `;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig
            );

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toContain('featureAProp');
            expect(result).not.toContain('featureBProp');
        });

        it('handles tsx elements in return statements', async () => {
            const code = `
                function test() {
                    return (
                        <div>
                            {/* @sfdc-extension-line SFDC_EXT_featureA */}
                            <ComponentA />
                            {/* @sfdc-extension-line SFDC_EXT_featureB */}
                            <ComponentB />
                        </div>
                    );
                }
            `;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig
            );

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toContain('<ComponentA />');
            expect(result).not.toContain('<ComponentB />');
        });
    });

    describe('block markers', () => {
        it('removes code blocks guarded by block markers when extension is disabled', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar1 = 'Feature A variable 1';
                const featureAVar2 = 'Feature A variable 2';
                // @sfdc-extension-block-end SFDC_EXT_featureA
                const anotherVar = 'Another variable';
            `;
            const expected = `
                const anotherVar = 'Another variable';
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig);
            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toEqualTrimmedLines(expected);
        });

        it('preserves code blocks when extension is enabled', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureA = 'Feature A';
                // @sfdc-extension-block-end SFDC_EXT_featureA
                const other = 'other';
            `;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig);

            const content = readFile('/mock/dir/src/components/test.tsx');
            expect(content).toContain('featureA');
            expect(content).toContain('Feature A');
        });

        it('handles nested code blocks correctly', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-block-start SFDC_EXT_featureB
                const featureBVar = 'Feature B variable 1';
                // @sfdc-extension-block-end SFDC_EXT_featureB
                // @sfdc-extension-block-end SFDC_EXT_featureA
            `;
            const expected = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-block-end SFDC_EXT_featureA
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );
            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toEqualTrimmedLines(expected);
        });

        it('keeps skipping a disabled outer block after a disabled nested block ends', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureA = 'Feature A variable';
                // @sfdc-extension-block-start SFDC_EXT_featureB
                const featureB = 'Feature B variable';
                // @sfdc-extension-block-end SFDC_EXT_featureB
                const leakedAfterNestedBlock = 'must be removed';
                // @sfdc-extension-block-end SFDC_EXT_featureA
                const retained = 'retained';
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);

            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: false, SFDC_EXT_featureB: false },
                mockedExtensionConfig
            );

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).not.toContain('featureA');
            expect(result).not.toContain('featureB');
            expect(result).not.toContain('leakedAfterNestedBlock');
            expect(result).toContain('retained');
        });

        it('keeps skipping a disabled outer block after an enabled nested block ends', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureA = 'Feature A variable';
                // @sfdc-extension-block-start SFDC_EXT_featureB
                const featureB = 'Feature B variable';
                // @sfdc-extension-block-end SFDC_EXT_featureB
                const leakedAfterNestedBlock = 'must be removed';
                // @sfdc-extension-block-end SFDC_EXT_featureA
                const retained = 'retained';
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);

            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: false, SFDC_EXT_featureB: true },
                mockedExtensionConfig
            );

            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).not.toContain('featureA');
            expect(result).not.toContain('featureB');
            expect(result).not.toContain('leakedAfterNestedBlock');
            expect(result).toContain('retained');
        });

        it('handles nested line markers within blocks', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-line SFDC_EXT_featureB
                const featureBVar = 'Feature B variable 2';
                // @sfdc-extension-block-end SFDC_EXT_featureA
            `;
            const expected = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-block-end SFDC_EXT_featureA
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );
            const result = readFile('/mock/dir/src/components/test.tsx') as string;
            expect(result).toEqualTrimmedLines(expected);
        });

        it('throws error when mismatching block markers are found', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-block-end SFDC_EXT_featureB
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            const filePath = path.join(path.sep, 'mock', 'dir', 'src', 'components', 'test.tsx');
            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false }, mockedExtensionConfig, true)
            ).rejects.toThrow(
                `Block marker mismatch in ${filePath}, expected end marker for SFDC_EXT_featureA but got SFDC_EXT_featureB`
            );
        });

        it('throws error when block marker is not closed', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            const filePath = path.join(path.sep, 'mock', 'dir', 'src', 'components', 'test.tsx');
            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true)
            ).rejects.toThrow(`Unclosed end marker found in ${filePath}: SFDC_EXT_featureA`);
        });

        it('throws error when start marker is missing', async () => {
            const code = `
                // @sfdc-extension-block-end SFDC_EXT_featureA
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            const filePath = path.join(path.sep, 'mock', 'dir', 'src', 'components', 'test.tsx');
            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true)
            ).rejects.toThrow(
                `Block marker mismatch in ${filePath}, encountered end marker SFDC_EXT_featureA without a matching start marker`
            );
        });

        it('throws error when nested block markers are not closed in the correct order', async () => {
            const code = `
                // @sfdc-extension-block-start SFDC_EXT_featureA
                const featureAVar = 'Feature A variable 1';
                // @sfdc-extension-block-start SFDC_EXT_featureB
                const featureBVar = 'Feature B variable 1';
                // @sfdc-extension-block-end SFDC_EXT_featureA
                // @sfdc-extension-block-end SFDC_EXT_featureB
            `;
            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            const filePath = path.join(path.sep, 'mock', 'dir', 'src', 'components', 'test.tsx');
            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false }, mockedExtensionConfig, true)
            ).rejects.toThrow(
                `Block marker mismatch in ${filePath}, expected end marker for SFDC_EXT_featureB but got SFDC_EXT_featureA`
            );
        });

        it('warns when block marker has unknown extension', async () => {
            const consoleSpy = mockConsole('warn');
            vol.writeFileSync(
                '/mock/dir/src/components/test.tsx',
                `// @sfdc-extension-block-start UNKNOWN_EXTENSION_NOT_IN_CONFIG
                const test = 'test';
                // @sfdc-extension-block-end UNKNOWN_EXTENSION_NOT_IN_CONFIG
                // @sfdc-extension-line SFDC_EXT_featureA
                const featureA = 'Feature A';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig, true);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('Unknown marker found')
            );
            consoleSpy.mockRestore();
        });
    });

    describe('file markers', () => {
        it('removes entire file when marked by @sfdc-extension-file marker and extension is disabled', async () => {
            const consoleSpy = mockConsole('log');
            const originalLogLevel = process.env.SFCC_LOG_LEVEL;
            process.env.SFCC_LOG_LEVEL = 'debug';
            vol.mkdirSync('/mock/dir/src/routes', { recursive: true });
            vol.writeFileSync(
                '/mock/dir/src/routes/featureARoute.tsx',
                `// @sfdc-extension-file SFDC_EXT_featureA
                const feature = Feature_A;`
            );
            vol.writeFileSync(
                '/mock/dir/src/routes/featureBRoute.tsx',
                `// @sfdc-extension-file SFDC_EXT_featureB
                const feature = Feature_B;`
            );
            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: false, SFDC_EXT_featureB: true },
                mockedExtensionConfig,
                true
            );
            expect(fileExists('/mock/dir/src/routes/featureARoute.tsx')).toBe(false);
            expect(fileExists('/mock/dir/src/routes/featureBRoute.tsx')).toBe(true);
            // logger.debug outputs two args: [sfnext:debug] prefix + message
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringMatching(createPathRegex('Deleted file /mock/dir/src/routes/featureARoute.tsx'))
            );
            process.env.SFCC_LOG_LEVEL = originalLogLevel || '';
            consoleSpy.mockRestore();
        });

        it('preserves files when extension is enabled', async () => {
            vol.writeFileSync(
                '/mock/dir/src/components/enabledExt.tsx',
                `// @sfdc-extension-file SFDC_EXT_featureA
                const test = 'test';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig, true);

            // File should still exist
            expect(fileExists('/mock/dir/src/components/enabledExt.tsx')).toBe(true);
        });

        it('warns when file marker has unknown extension', async () => {
            const consoleSpy = mockConsole('warn');
            vol.writeFileSync(
                '/mock/dir/src/components/unknownExt.tsx',
                `// @sfdc-extension-file UNKNOWN_EXTENSION
                const test = 'test';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig, true);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringMatching(/is marked with.*but it does not match any known extensions/)
            );
            consoleSpy.mockRestore();
        });

        it('handles errors when deleting marked files', async () => {
            const consoleSpy = mockConsole('error');
            vol.writeFileSync(
                '/mock/dir/src/components/toDelete.tsx',
                `// @sfdc-extension-file SFDC_EXT_featureA
                const test = 'test';`
            );

            const originalUnlinkSync = vol.unlinkSync;
            vol.unlinkSync = () => {
                throw new Error('Simulated delete error');
            };

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true)
            ).rejects.toThrow('Simulated delete error');

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringMatching(/Error deleting file.*Simulated delete error/)
            );

            vol.unlinkSync = originalUnlinkSync;
            consoleSpy.mockRestore();
        });
    });

    describe('extension folder deletion', () => {
        it('deletes extension folder when extension is disabled and has folder property', async () => {
            const consoleSpy = mockConsole('log');
            const originalLogLevel = process.env.SFCC_LOG_LEVEL;
            process.env.SFCC_LOG_LEVEL = 'debug';
            vol.mkdirSync('/mock/dir/src/extensions/feature-a/components', { recursive: true });
            vol.mkdirSync('/mock/dir/src/extensions/feature-a/pages', { recursive: true });
            vol.writeFileSync(
                '/mock/dir/src/extensions/feature-a/components/component.tsx',
                `export const Component = 'Component';`
            );
            vol.writeFileSync('/mock/dir/src/extensions/feature-a/pages/page.tsx', `export const Page = 'Page';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: false, SFDC_EXT_featureB: true },
                mockedExtensionConfig,
                true
            );

            // The entire disabled extension directory should be removed
            expect(fileExists('/mock/dir/src/extensions/feature-a')).toBe(false);
            expect(fileExists('/mock/dir/src/extensions/feature-a/components/component.tsx')).toBe(false);
            expect(fileExists('/mock/dir/src/extensions/feature-a/pages/page.tsx')).toBe(false);
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining('Deleted extension folder')
            );
            process.env.SFCC_LOG_LEVEL = originalLogLevel || '';
            consoleSpy.mockRestore();
        });

        it('preserves extension folder when extension is enabled', async () => {
            vol.mkdirSync('/mock/dir/src/extensions/feature-a/components', { recursive: true });
            vol.writeFileSync(
                '/mock/dir/src/extensions/feature-a/components/component.tsx',
                `export const Component = 'Component';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );

            // The enabled extension directory should be preserved
            expect(fileExists('/mock/dir/src/extensions/feature-a')).toBe(true);
            expect(fileExists('/mock/dir/src/extensions/feature-a/components/component.tsx')).toBe(true);
        });

        it('handles multiple extension folders correctly', async () => {
            vol.mkdirSync('/mock/dir/src/extensions/feature-a', { recursive: true });
            vol.mkdirSync('/mock/dir/src/extensions/feature-b', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/feature-a/index.tsx', `export const A = 'A';`);
            vol.writeFileSync('/mock/dir/src/extensions/feature-b/index.tsx', `export const B = 'B';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );

            // Feature A should be preserved, Feature B should be removed
            expect(fileExists('/mock/dir/src/extensions/feature-a')).toBe(true);
            expect(fileExists('/mock/dir/src/extensions/feature-b')).toBe(false);
        });

        it('does not delete extension folder if folder property is missing', async () => {
            vol.mkdirSync('/mock/dir/src/extensions/feature-c', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/feature-c/index.tsx', `export const C = 'C';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureC: false }, mockedExtensionConfig, true);

            // Feature C has no folder property, so folder should not be deleted
            expect(fileExists('/mock/dir/src/extensions/feature-c')).toBe(true);
        });

        it('handles EPERM error when deleting extension folders', async () => {
            const consoleSpy = mockConsole('error');

            vol.mkdirSync('/mock/dir/src/extensions/feature-b', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/feature-b/index.tsx', `export const B = 'B';`);

            const originalRmSync = vol.rmSync;
            vol.rmSync = (_dirPath: any) => {
                const error = new Error('Permission denied') as Error & { code?: string };
                error.code = 'EPERM';
                throw error;
            };

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Permission denied')
            );

            vol.rmSync = originalRmSync;
            consoleSpy.mockRestore();
        });

        it('handles general error when deleting extension folders', async () => {
            const consoleSpy = mockConsole('error');

            vol.mkdirSync('/mock/dir/src/extensions/feature-b', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/feature-b/index.tsx', `export const B = 'B';`);

            const originalRmSync = vol.rmSync;
            vol.rmSync = (_dirPath: any) => {
                throw new Error('Some other deletion error');
            };

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false },
                mockedExtensionConfig,
                true
            );

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Some other deletion error')
            );

            vol.rmSync = originalRmSync;
            consoleSpy.mockRestore();
        });

        it('aborts before deleting any folder when the config rewrite throws', async () => {
            // Regression (W-23074938): updateExtensionConfig reads and rewrites config.json, then
            // Biome-formats the result. The config rewrite must run BEFORE folder deletion so a
            // write failure leaves the project untouched rather than half-trimmed (folders gone,
            // config.json still listing them). Biome formatting itself is fail-safe (it logs and
            // returns the content unformatted rather than throwing), so we force the throw at the
            // config.json write — the step that would corrupt state if it ran after deletion.
            const consoleSpy = mockConsole('warn');

            vol.mkdirSync('/mock/dir/src/extensions/feature-a/components', { recursive: true });
            vol.writeFileSync(
                '/mock/dir/src/extensions/feature-a/components/component.tsx',
                `export const Component = 'Component';`
            );

            // Force the config.json rewrite to throw — simulates an unwritable file on the
            // customer's disk. Any other write (e.g. trimmed component files) passes through.
            const originalWriteFileSync = vol.writeFileSync.bind(vol);
            vi.spyOn(vol, 'writeFileSync').mockImplementation((file: any, ...rest: any[]) => {
                if (typeof file === 'string' && file.endsWith('config.json')) {
                    throw new Error('EACCES: permission denied, open config.json');
                }
                return originalWriteFileSync(file, ...rest);
            });

            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            try {
                await expect(
                    trimExt(
                        '/mock/dir',
                        { SFDC_EXT_featureA: false, SFDC_EXT_featureB: true },
                        mockedExtensionConfig,
                        true
                    )
                ).rejects.toThrow('EACCES');

                // The disabled extension's folder must still be on disk — deletion never ran.
                expect(fileExists('/mock/dir/src/extensions/feature-a')).toBe(true);
                expect(fileExists('/mock/dir/src/extensions/feature-a/components/component.tsx')).toBe(true);
            } finally {
                consoleSpy.mockRestore();
            }
        });

        it('handles missing extension folders gracefully', async () => {
            // Test that deleteExtensionFolders doesn't throw when extension folder doesn't exist
            vol.mkdirSync('/mock/dir/src/extensions', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/config.json', JSON.stringify(mockedExtensionConfig));

            // Don't create the extension folder - deleteExtensionFolders should handle this gracefully
            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            // Should not throw error when extension folder doesn't exist
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true)
            ).resolves.not.toThrow();
        });

        it('handles extensionConfig with undefined extensions property', async () => {
            // Test that deleteExtensionFolders handles extensionConfig?.extensions || {} (line 221)
            // when extensionConfig.extensions is undefined or extensionConfig is null
            vol.mkdirSync('/mock/dir/src/extensions', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/config.json', JSON.stringify(mockedExtensionConfig));

            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            // Test with extensionConfig that has undefined extensions property
            // This should trigger the || {} fallback on line 221
            // @ts-expect-error - Testing defensive code path
            const configWithUndefinedExtensions = { extensions: undefined };
            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: false }, configWithUndefinedExtensions, true)
            ).resolves.not.toThrow();

            // Also test with null extensionConfig to ensure optional chaining works
            await expect(trimExt('/mock/dir', { SFDC_EXT_featureA: false }, null, true)).resolves.not.toThrow();
        });

        it('returns early when extensions directory does not exist', async () => {
            // Test that deleteExtensionFolders returns early when extensions directory doesn't exist
            // This covers the early return path (lines 217-219)
            vol.mkdirSync('/mock/dir/src', { recursive: true });
            // Don't create extensions directory - deleteExtensionFolders should return early

            // Create config.json so updateExtensionConfig can work
            // We need to create the directory and file, then remove just the directory
            // to test the early return in deleteExtensionFolders
            vol.mkdirSync('/mock/dir/src/extensions', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/config.json', JSON.stringify(mockedExtensionConfig));

            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            // Remove extensions directory to test early return in deleteExtensionFolders
            // This ensures the directory doesn't exist when deleteExtensionFolders checks
            vol.rmSync('/mock/dir/src/extensions', { recursive: true, force: true });

            // Verify directory doesn't exist
            expect(fileExists('/mock/dir/src/extensions')).toBe(false);

            // This will fail at updateExtensionConfig (because config.json is gone),
            // but deleteExtensionFolders should have returned early without error (lines 218-219)
            try {
                await trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true);
                // Should not reach here
                expect(true).toBe(false);
            } catch (error: unknown) {
                // Expected to fail at updateExtensionConfig, but deleteExtensionFolders should have returned early
                expect((error as Error).message).toContain('ENOENT');
                expect((error as Error).message).toContain('config.json');
            }
        });
    });

    describe('extension config updates', () => {
        it('updates extension config to only include selected extensions', async () => {
            const extensionConfig = {
                extensions: {
                    SFDC_EXT_featureA: {
                        name: 'Feature A',
                        description: 'Feature A description',
                        folder: 'feature-a',
                    },
                    SFDC_EXT_featureB: {
                        name: 'Feature B',
                        description: 'Feature B description',
                        folder: 'feature-b',
                    },
                    SFDC_EXT_featureC: {
                        name: 'Feature C',
                        description: 'Feature C description',
                        folder: 'feature-c',
                    },
                },
            };

            vol.writeFileSync('/mock/dir/src/extensions/config.json', JSON.stringify(extensionConfig));
            vol.writeFileSync('/mock/dir/src/components/test.tsx', `export const Test = 'test';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt(
                '/mock/dir',
                { SFDC_EXT_featureA: true, SFDC_EXT_featureB: false, SFDC_EXT_featureC: false },
                extensionConfig,
                true
            );

            const updatedConfig = JSON.parse(readFile('/mock/dir/src/extensions/config.json') as string);
            expect(updatedConfig.extensions).toHaveProperty('SFDC_EXT_featureA');
            expect(updatedConfig.extensions).not.toHaveProperty('SFDC_EXT_featureB');
            expect(updatedConfig.extensions).not.toHaveProperty('SFDC_EXT_featureC');
        });
    });

    describe('file processing', () => {
        it('skips node_modules directory', async () => {
            vol.mkdirSync('/mock/dir/node_modules/some-package', { recursive: true });
            vol.writeFileSync(
                '/mock/dir/node_modules/some-package/index.tsx',
                `// @sfdc-extension-line SFDC_EXT_featureA
                const test = 'test';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true);

            expect(fileExists('/mock/dir/node_modules/some-package/index.tsx')).toBe(true);
        });

        it('skips files with unsupported extensions', async () => {
            vol.writeFileSync(
                '/mock/dir/src/components/test.txt',
                `// @sfdc-extension-line SFDC_EXT_featureA
                const test = 'test';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true);

            expect(fileExists('/mock/dir/src/components/test.txt')).toBe(true);
            const content = readFile('/mock/dir/src/components/test.txt');
            expect(content).toContain('@sfdc-extension-line');
        });

        it('only writes file if content changed', async () => {
            const consoleSpy = mockConsole('log');
            const code = `export const Test = 'test';`;

            vol.writeFileSync('/mock/dir/src/components/test.tsx', code);
            await trimExtensions('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig, true);

            // Should not log "Updated file" if content didn't change
            const logCalls = (console.log as any).mock.calls.map((call: any[]) => call.join(' ')).join('\n');
            expect(logCalls).not.toContain('Updated file /mock/dir/src/components/test.tsx');

            consoleSpy.mockRestore();
        });

        it('reports error when updating file fails', async () => {
            const consoleSpy = mockConsole('error');

            vol.writeFileSync(
                '/mock/dir/src/components/test.tsx',
                `// @sfdc-extension-line SFDC_EXT_featureA
                const feature = Feature_A;`
            );
            const originalWriteFileSync = vol.writeFileSync;
            vol.writeFileSync = (..._args: unknown[]) => {
                throw new Error('Simulated write error');
            };

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            try {
                await trimExt('/mock/dir', { SFDC_EXT_featureA: false }, mockedExtensionConfig, true);
            } catch (error: unknown) {
                expect((error as Error).message).toContain('Simulated write error');
            }

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Error updating file')
            );
            vol.writeFileSync = originalWriteFileSync;
            consoleSpy.mockRestore();
        });
    });

    describe('edge cases and error handling', () => {
        it('skips processing when no extensions configured', async () => {
            const consoleSpy = mockConsole('log');
            const originalLogLevel = process.env.SFCC_LOG_LEVEL;
            process.env.SFCC_LOG_LEVEL = 'debug';
            vol.writeFileSync(
                '/mock/dir/src/components/test.tsx',
                `// @sfdc-extension-line SFDC_EXT_featureA
                const test = 'test';`
            );

            const mod = await reloadModule();
            const trimExt = mod.default || mod;
            await trimExt('/mock/dir', {}, { extensions: {} }, true);

            // Should log early return message via logger.debug
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                'No targets found, skipping trim'
            );
            const content = readFile('/mock/dir/src/components/test.tsx');
            expect(content).toContain('@sfdc-extension-line SFDC_EXT_featureA');
            process.env.SFCC_LOG_LEVEL = originalLogLevel || '';
            consoleSpy.mockRestore();
        });

        it('handles missing or incomplete extension configuration gracefully', async () => {
            vol.writeFileSync('/mock/dir/src/components/test.tsx', `export const Test = 'test';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            // Test with undefined extensionConfig
            await expect(trimExt('/mock/dir', {}, undefined, false)).resolves.not.toThrow();

            // Test with extensionConfig but undefined extensions property
            await expect(
                // @ts-expect-error - Testing defensive code path
                trimExt('/mock/dir', {}, { extensions: undefined })
            ).resolves.not.toThrow();
        });

        it('emits debug logs when SFCC_LOG_LEVEL=debug', async () => {
            const consoleSpy = mockConsole('log');
            const originalLogLevel = process.env.SFCC_LOG_LEVEL;
            process.env.SFCC_LOG_LEVEL = 'debug';

            vol.writeFileSync('/mock/dir/src/components/test.tsx', `export const Test = 'test';`);

            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            await trimExt('/mock/dir', {}, mockedExtensionConfig);
            expect(fileExists('/mock/dir/src/components/test.tsx')).toBe(true);
            expect(console.log).toHaveBeenCalled();

            process.env.SFCC_LOG_LEVEL = originalLogLevel || '';
            consoleSpy.mockRestore();
        });

        it('handles file instead of directory in isEmptyDirectory check', async () => {
            const mod = await reloadModule();
            const trimExt = mod.default || mod;

            vol.mkdirSync('/mock/dir/src/extensions', { recursive: true });
            vol.writeFileSync('/mock/dir/src/extensions/file.txt', 'not a directory');

            await expect(
                trimExt('/mock/dir', { SFDC_EXT_featureA: true }, mockedExtensionConfig, true)
            ).resolves.not.toThrow();
            expect(fileExists('/mock/dir/src/extensions/file.txt')).toBe(true);
        });
    });
});
