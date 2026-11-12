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
import ValidateCartridge from './validate-cartridge';
import fs from 'fs-extra';
import { validateCartridgeMetadata } from '../cartridge-services/validate-cartridge';

vi.mock('fs-extra', () => ({
    default: {
        existsSync: vi.fn(() => true),
    },
}));

vi.mock('../cartridge-services/validate-cartridge', () => ({
    validateCartridgeMetadata: vi.fn(() =>
        Promise.resolve({
            results: [
                {
                    valid: true,
                    filePath:
                        '/test/project/cartridges/app_storefrontnext_base/cartridge/experience/components/hero.json',
                    schemaType: 'componenttype',
                    errors: [],
                },
            ],
            totalFiles: 1,
            validFiles: 1,
            totalErrors: 0,
            skippedFiles: [],
        })
    ),
}));

function createCommand(flags: Record<string, string> = {}) {
    const cmd = new ValidateCartridge([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({
        flags: { 'project-directory': '/test/project', ...flags },
        args: {},
        argv: [],
        raw: [],
        metadata: {},
    });
    vi.spyOn(cmd, 'log').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
    return cmd;
}

describe('validate-cartridge command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it('should call validateCartridgeMetadata with correct path', async () => {
        const cmd = createCommand();
        await cmd.run();

        expect(validateCartridgeMetadata).toHaveBeenCalledWith(expect.stringContaining('app_storefrontnext_base'));
    });

    it('validates a custom cartridge when --cartridge-name is set', async () => {
        const cmd = createCommand({ 'cartridge-name': 'app_storefrontnext_refarch' });
        await cmd.run();

        expect(validateCartridgeMetadata).toHaveBeenCalledWith(
            path.join('/test/project', 'cartridges', 'app_storefrontnext_refarch', 'cartridge', 'experience')
        );
    });

    it('accepts ordinary dots and punctuation in a single cartridge name', async () => {
        const cartridgeName = 'custom.cartridge-name_v2';
        const cmd = createCommand({ 'cartridge-name': cartridgeName });
        await cmd.run();

        expect(validateCartridgeMetadata).toHaveBeenCalledWith(
            path.join('/test/project', 'cartridges', cartridgeName, 'cartridge', 'experience')
        );
    });

    it('validates the base cartridge when --cartridge-name is the base name', async () => {
        const cmd = createCommand({ 'cartridge-name': 'app_storefrontnext_base' });
        await cmd.run();

        expect(validateCartridgeMetadata).toHaveBeenCalledWith(
            path.join('/test/project', 'cartridges', 'app_storefrontnext_base', 'cartridge', 'experience')
        );
    });

    it('should error if project directory does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const cmd = createCommand();
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });

        await expect(cmd.run()).rejects.toThrow("doesn't exist");
    });

    it('should error if metadata directory does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true).mockReturnValueOnce(false);

        const cmd = createCommand();
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });

        await expect(cmd.run()).rejects.toThrow('generate-cartridge');
    });

    it('should warn when no metadata files are found', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [],
            totalFiles: 0,
            validFiles: 0,
            totalErrors: 0,
            skippedFiles: [],
        });

        const cmd = createCommand();
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmd.run();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No metadata files'));
    });

    it('should warn about skipped files', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [{ valid: true, filePath: '/test/ok.json', schemaType: 'componenttype', errors: [] }],
            totalFiles: 1,
            validFiles: 1,
            totalErrors: 0,
            skippedFiles: ['unknown.json'],
        });

        const cmd = createCommand();
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmd.run();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.json'));
    });

    it('should handle errors at root path', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [
                {
                    valid: false,
                    filePath: '/test/bad.json',
                    schemaType: null,
                    errors: [{ path: '/', message: 'invalid format' }],
                },
            ],
            totalFiles: 1,
            validFiles: 0,
            totalErrors: 1,
            skippedFiles: [],
        });

        const cmd = createCommand();
        const logSpy = vi.spyOn(cmd, 'log').mockImplementation(() => {});
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });

        await expect(cmd.run()).rejects.toThrow('Validation failed');
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
    });

    it('should error when validation finds errors', async () => {
        (validateCartridgeMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            results: [
                {
                    valid: false,
                    filePath: '/test/bad.json',
                    schemaType: 'componenttype',
                    errors: [{ path: '/name', message: 'is required' }],
                },
            ],
            totalFiles: 1,
            validFiles: 0,
            totalErrors: 1,
            skippedFiles: [],
        });

        const cmd = createCommand();
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });

        await expect(cmd.run()).rejects.toThrow('Validation failed');
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
    ])('rejects invalid --cartridge-name %j before reading metadata', async (cartridgeName) => {
        const cmd = createCommand({ 'cartridge-name': cartridgeName });
        vi.spyOn(cmd, 'error').mockImplementation((msg) => {
            throw new Error(msg as string);
        });

        await expect(cmd.run()).rejects.toThrow('--cartridge-name');
        expect(validateCartridgeMetadata).not.toHaveBeenCalled();
        expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });
});
