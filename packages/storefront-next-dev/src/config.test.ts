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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMrtEntryFile } from './mrt/utils';

const mockExistsSync = vi.fn();
const mockJitiImport = vi.fn();

vi.mock('node:fs', () => ({
    existsSync: mockExistsSync,
}));

vi.mock('jiti', () => ({
    createJiti: vi.fn(() => ({
        import: mockJitiImport,
    })),
}));

const { assertValidCartridgeName, buildMrtConfig } = await import('./config');

describe('buildMrtConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        mockExistsSync.mockReset();
        mockJitiImport.mockReset();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('returns defaults when no project directory is provided', async () => {
        const config = await buildMrtConfig('/build');

        expect(config.ssrOnly).toContain('server/**/*');
        expect(config.ssrOnly).toContain('package.json');
        expect(config.ssrOnly).toContain('loader.js');
        expect(config.ssrShared).toContain('client/**/*');
        expect(config.ssrShared).toContain('static/**/*');
        expect(config.ssrParameters.ssrFunctionNodeVersion).toBe('24.x');
    });

    it('returns defaults when config.server.ts does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        const config = await buildMrtConfig('/build', '/project');

        expect(config.ssrOnly).toContain('loader.js');
        expect(config.ssrShared).toContain('client/**/*');
        expect(mockJitiImport).not.toHaveBeenCalled();
    });

    it('merges runtime overrides while preserving required defaults', async () => {
        mockExistsSync.mockReturnValue(true);
        mockJitiImport.mockResolvedValue({
            default: {
                runtime: {
                    ssrOnly: ['custom/**', 'loader.js'],
                    ssrShared: ['shared/**'],
                    ssrParameters: { customFlag: true },
                },
            },
        });

        const config = await buildMrtConfig('/build', '/project');
        const ssrEntryPoint = getMrtEntryFile('production');

        expect(config.ssrOnly[0]).toBe('custom/**');
        expect(config.ssrOnly).toContain('loader.js');
        expect(config.ssrOnly).toContain(`${ssrEntryPoint}.{js,mjs,cjs}`);
        expect(config.ssrShared[0]).toBe('shared/**');
        expect(config.ssrShared).toContain('client/**/*');
        expect(config.ssrParameters).toEqual({
            ssrFunctionNodeVersion: '24.x',
            customFlag: true,
        });

        const loaderCount = config.ssrOnly.filter((pattern) => pattern === 'loader.js').length;
        expect(loaderCount).toBe(1);
    });

    it('should omit envBasePath from ssrParameters when it is empty', async () => {
        mockExistsSync.mockReturnValue(true);
        mockJitiImport.mockResolvedValue({
            default: {
                runtime: {
                    ssrParameters: { envBasePath: '' },
                },
            },
        });

        const config = await buildMrtConfig('/build', '/project');

        expect(config.ssrParameters).not.toHaveProperty('envBasePath');
    });

    it('should keep envBasePath in ssrParameters when it has a value', async () => {
        mockExistsSync.mockReturnValue(true);
        mockJitiImport.mockResolvedValue({
            default: {
                runtime: {
                    ssrParameters: { envBasePath: '/shop' },
                },
            },
        });

        const config = await buildMrtConfig('/build', '/project');

        expect(config.ssrParameters.envBasePath).toBe('/shop');
    });
});

describe('assertValidCartridgeName', () => {
    it.each([
        'app_storefrontnext_base',
        'app_storefrontnext_refarch',
        'app_storefrontnext_beauty',
        'plugin_applepay',
        'a',
        'A1-b_2',
        'custom.cartridge-name_v2',
        'café-storefront',
    ])('accepts %j', (name) => {
        expect(() => assertValidCartridgeName(name)).not.toThrow();
    });

    it.each([
        '',
        '.',
        '..',
        '../outside',
        '../../outside',
        'nested/name',
        'nested\\name',
        '/absolute',
        'C:\\outside',
        'C:outside',
        ' ',
        '\t \n',
        '\0',
    ])('rejects %j', (name) => {
        expect(() => assertValidCartridgeName(name)).toThrow('--cartridge-name');
    });
});
