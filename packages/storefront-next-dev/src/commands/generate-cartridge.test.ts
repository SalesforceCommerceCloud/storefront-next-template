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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import GenerateCartridge from './generate-cartridge';
import fs from 'fs-extra';
import { generateMetadata } from '../cartridge-services/generate-cartridge';
import { validateCartridgeMetadata } from '../cartridge-services/validate-cartridge';
import { initializeNamedCartridge } from '../cartridge-services/initialize-cartridge';

// Mock dependencies
vi.mock('fs-extra', () => ({
    default: {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
    },
}));

vi.mock('../cartridge-services/initialize-cartridge', () => ({
    initializeNamedCartridge: vi.fn(() => Promise.resolve()),
}));

vi.mock('../cartridge-services/generate-cartridge', () => ({
    generateMetadata: vi.fn(() => Promise.resolve()),
}));

vi.mock('../cartridge-services/validate-cartridge', () => ({
    validateCartridgeMetadata: vi.fn(() =>
        Promise.resolve({
            results: [],
            totalFiles: 0,
            validFiles: 0,
            totalErrors: 0,
            skippedFiles: [],
        })
    ),
}));

const projectDir = '/test/project';
const baseExperience = path.join(projectDir, 'cartridges', 'app_storefrontnext_base', 'cartridge', 'experience');
const namedExperience = path.join(projectDir, 'cartridges', 'app_storefrontnext_refarch', 'cartridge', 'experience');

function createCommand(flags: Record<string, string> = {}, throwOnError = false) {
    const cmd = new GenerateCartridge([], {} as never);
    vi.spyOn(cmd as never as { parse: () => Promise<unknown> }, 'parse').mockResolvedValue({
        flags: { 'project-directory': projectDir, ...flags },
        args: {},
        argv: [],
        raw: [],
        metadata: {},
    });
    vi.spyOn(cmd, 'log').mockImplementation(() => {});
    if (throwOnError) {
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });
    }
    return cmd;
}

describe('generate-cartridge command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it.each([
        ['does not scaffold when --cartridge-name is omitted', {}, false, baseExperience, undefined],
        [
            'does not scaffold when --cartridge-name is the base cartridge',
            { 'cartridge-name': 'app_storefrontnext_base' },
            false,
            baseExperience,
            undefined,
        ],
        [
            'forwards a custom cartridge name and site ID to generation and validation',
            { 'site-id': 'RefArch', 'cartridge-name': 'app_storefrontnext_refarch' },
            'app_storefrontnext_refarch',
            namedExperience,
            'RefArch',
        ],
        [
            'uses default site selection when only --cartridge-name is set',
            { 'cartridge-name': 'app_storefrontnext_refarch' },
            'app_storefrontnext_refarch',
            namedExperience,
            undefined,
        ],
        [
            'accepts ordinary dots and punctuation in a single cartridge name',
            { 'cartridge-name': 'custom.cartridge-name_v2' },
            'custom.cartridge-name_v2',
            path.join(projectDir, 'cartridges', 'custom.cartridge-name_v2', 'cartridge', 'experience'),
            undefined,
        ],
        [
            'keeps the base cartridge when only --site-id is set',
            { 'site-id': 'RefArch' },
            false,
            baseExperience,
            'RefArch',
        ],
    ] as const)('%s', async (_name, flags, cartridgeName, experienceDir, siteId) => {
        await createCommand({ ...flags }).run();

        if (cartridgeName) {
            expect(initializeNamedCartridge).toHaveBeenCalledWith(projectDir, cartridgeName);
        } else {
            expect(initializeNamedCartridge).not.toHaveBeenCalled();
        }
        expect(generateMetadata).toHaveBeenCalledWith(projectDir, experienceDir, { siteId });
        expect(validateCartridgeMetadata).toHaveBeenCalledWith(experienceDir);
    });

    it('should error if project directory does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await expect(createCommand({ 'project-directory': '/nonexistent/project' }, true).run()).rejects.toThrow(
            "doesn't exist"
        );
    });

    it('should create metadata directory if it does not exist', async () => {
        // First call (project dir) returns true, second call (metadata dir) returns false
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true).mockReturnValueOnce(false);

        await createCommand().run();

        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('app_storefrontnext_base'), {
            recursive: true,
        });
    });

    it('should log success message after generation', async () => {
        const cmd = createCommand();
        const logSpy = vi.spyOn(cmd, 'log');

        await cmd.run();

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('generated successfully'));
    });

    it('should run validation after generation', async () => {
        await createCommand().run();

        expect(validateCartridgeMetadata).toHaveBeenCalledWith(expect.stringContaining('app_storefrontnext_base'));
    });

    it('should display validation errors at root path without location', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [
                {
                    valid: false,
                    filePath: `${projectDir}/cartridges/bad.json`,
                    schemaType: null,
                    errors: [{ path: '/', message: 'invalid format' }],
                },
            ],
            totalFiles: 1,
            validFiles: 0,
            totalErrors: 1,
            skippedFiles: [],
        });

        const cmd = createCommand({}, true);
        const logSpy = vi.spyOn(cmd, 'log');

        await expect(cmd.run()).rejects.toThrow('Generated metadata has validation errors');
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
    });

    it('should error when validation finds errors', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [
                {
                    valid: false,
                    filePath: `${projectDir}/cartridges/bad.json`,
                    schemaType: 'componenttype',
                    errors: [{ path: '/name', message: 'is required' }],
                },
            ],
            totalFiles: 1,
            validFiles: 0,
            totalErrors: 1,
            skippedFiles: [],
        });

        await expect(createCommand({}, true).run()).rejects.toThrow('Generated metadata has validation errors');
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
    ])('rejects invalid --cartridge-name %j before initialize or writes', async (cartridgeName) => {
        await expect(createCommand({ 'cartridge-name': cartridgeName }, true).run()).rejects.toThrow(
            '--cartridge-name'
        );

        expect(initializeNamedCartridge).not.toHaveBeenCalled();
        expect(fs.mkdirSync).not.toHaveBeenCalled();
        expect(generateMetadata).not.toHaveBeenCalled();
        expect(validateCartridgeMetadata).not.toHaveBeenCalled();
    });
});
