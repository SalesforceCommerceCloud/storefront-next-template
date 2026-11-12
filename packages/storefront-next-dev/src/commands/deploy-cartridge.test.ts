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
import DeployCartridge from './deploy-cartridge';
import fs from 'fs-extra';
import path from 'path';
import { SFNEXT_BASE_CARTRIDGE_NAME, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR } from '../config';

const namedCartridge = {
    name: 'app_storefrontnext_refarch',
    src: path.join('/test/project', 'cartridges', 'app_storefrontnext_refarch'),
    dest: 'app_storefrontnext_refarch',
};

const defaultCartridges = [
    {
        name: SFNEXT_BASE_CARTRIDGE_NAME,
        src: path.join('/test/project', 'cartridges', SFNEXT_BASE_CARTRIDGE_NAME),
        dest: SFNEXT_BASE_CARTRIDGE_NAME,
    },
];

const defaultMetadataDir = path.join('/test/project', 'cartridges', SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);

// Hoisted mocks must be declared before vi.mock calls due to hoisting
const {
    mockUploadCartridges,
    mockDeleteCartridges,
    mockFindCartridges,
    mockGetActiveCodeVersion,
    mockReloadCodeVersion,
    mockScriptsBackend,
    mockCreateScriptsBackend,
} = vi.hoisted(() => {
    const getActiveCodeVersion = vi.fn(() => Promise.resolve({ id: 'discovered-version' }));
    const scriptsBackend = { getActiveCodeVersion };
    return {
        mockUploadCartridges: vi.fn(() => Promise.resolve()),
        mockDeleteCartridges: vi.fn(() => Promise.resolve()),
        mockFindCartridges: vi.fn(() => [
            {
                name: 'app_storefrontnext_base',
                src: path.join('/test/project', 'cartridges', 'app_storefrontnext_base'),
                dest: 'app_storefrontnext_base',
            },
        ]),
        mockGetActiveCodeVersion: getActiveCodeVersion,
        mockReloadCodeVersion: vi.fn(() => Promise.resolve()),
        mockScriptsBackend: scriptsBackend,
        mockCreateScriptsBackend: vi.fn(() => scriptsBackend),
    };
});

// Mock dependencies
vi.mock('fs-extra', () => ({
    default: {
        existsSync: vi.fn(() => true),
    },
}));

vi.mock('@salesforce/b2c-tooling-sdk/operations/code', () => ({
    uploadCartridges: mockUploadCartridges,
    deleteCartridges: mockDeleteCartridges,
    reloadCodeVersion: mockReloadCodeVersion,
}));

vi.mock('@salesforce/b2c-tooling-sdk/cli', () => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const { Command } = require('@oclif/core');
    class CartridgeCommand extends Command {
        static baseFlags = {};
        static cartridgeFlags = {};
        resolvedConfig: { values: { codeVersion?: string; cartridges?: string[] } } = {
            values: {
                codeVersion: 'test-version',
            },
        };
        flags: Record<string, unknown> = {};
        instance = { config: { codeVersion: 'test-version' } };
        get cartridgeOptions() {
            return {
                include: this.flags?.cartridge ?? this.resolvedConfig?.values.cartridges,
                exclude: this.flags?.['exclude-cartridge'],
            };
        }
        requireServer() {}
        requireCodeVersion() {}
        requireWebDavCredentials() {}
        hasOAuthCredentials() {
            return true;
        }
        createScriptsBackend() {
            return mockCreateScriptsBackend();
        }
        // oxlint-disable-next-line @typescript-eslint/require-await
        async findCartridgesWithProviders() {
            return mockFindCartridges();
        }
    }
    return { CartridgeCommand };
});

function createCommand(flagOverrides: Record<string, unknown> = {}) {
    const cmd = new DeployCartridge([], {} as never);
    const flags = {
        'project-directory': '/test/project',
        delete: false,
        reload: false,
        ...flagOverrides,
    };
    (cmd as any).flags = flags;
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({
        flags,
        args: {},
        argv: [],
        raw: [],
        metadata: {},
    });
    vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'requireServer').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'requireCodeVersion').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'requireWebDavCredentials').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'hasOAuthCredentials').mockReturnValue(true);
    vi.spyOn(cmd as any, 'findCartridgesWithProviders').mockResolvedValue(mockFindCartridges());
    return cmd;
}

describe('deploy-cartridge command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockFindCartridges.mockReturnValue(defaultCartridges);
    });

    it('should discover and upload cartridges', async () => {
        const cmd = createCommand();
        await cmd.run();

        const findSpy = vi.spyOn(cmd as any, 'findCartridgesWithProviders');
        expect(findSpy).toHaveBeenCalledWith(path.join('/test/project', 'cartridges'));
        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), defaultCartridges, {
            ignoreDirs: undefined,
        });
    });

    it('should pass configured cartridge ignore dirs to the upload', async () => {
        const cmd = createCommand();
        (cmd as any).resolvedConfig = {
            values: { codeVersion: 'test-version', cartridgeIgnoreDirs: ['node_modules'] },
        };
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), defaultCartridges, {
            ignoreDirs: ['node_modules'],
        });
    });

    it('should error when no cartridges are found', async () => {
        const cmd = createCommand();
        vi.spyOn(cmd as any, 'findCartridgesWithProviders').mockResolvedValue([]);
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('No cartridges found');
    });

    it('should list discovered cartridges', async () => {
        const cmd = createCommand();
        const logSpy = vi.spyOn(cmd as any, 'log');
        await cmd.run();

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(SFNEXT_BASE_CARTRIDGE_NAME));
    });

    it('should error if project directory does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const cmd = createCommand({ 'project-directory': '/nonexistent/project' });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow("doesn't exist");
    });

    it('should error if metadata directory does not exist', async () => {
        // First call (project dir) returns true, second call (metadata dir) returns false
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true).mockReturnValueOnce(false);

        const cmd = createCommand();
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow("Metadata directory doesn't exist");
    });

    it('should suggest generate-cartridge command in error message', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true).mockReturnValueOnce(false);

        const cmd = createCommand();
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('sfnext generate-cartridge');
    });

    it('should log success message after deployment', async () => {
        const cmd = createCommand();
        const logSpy = vi.spyOn(cmd as any, 'log');

        await cmd.run();

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('successfully'));
    });

    it('should call require methods for validation', async () => {
        const cmd = createCommand();
        const requireServerSpy = vi.spyOn(cmd as any, 'requireServer');
        const requireWebDavCredentialsSpy = vi.spyOn(cmd as any, 'requireWebDavCredentials');

        await cmd.run();

        expect(requireServerSpy).toHaveBeenCalled();
        expect(requireWebDavCredentialsSpy).toHaveBeenCalled();
    });

    it('should call deleteCartridges before uploadCartridges when --delete is set', async () => {
        const cmd = createCommand({ delete: true });
        const callOrder: string[] = [];
        mockDeleteCartridges.mockImplementation(() => {
            callOrder.push('delete');
            return Promise.resolve();
        });
        mockUploadCartridges.mockImplementation(() => {
            callOrder.push('upload');
            return Promise.resolve();
        });

        await cmd.run();

        expect(mockDeleteCartridges).toHaveBeenCalledWith(expect.anything(), defaultCartridges);
        expect(callOrder).toEqual(['delete', 'upload']);
    });

    it('should not call deleteCartridges when --delete is not set', async () => {
        const cmd = createCommand({ delete: false });
        await cmd.run();

        expect(mockDeleteCartridges).not.toHaveBeenCalled();
    });

    it('should call reloadCodeVersion after upload when --reload is set', async () => {
        const cmd = createCommand({ reload: true });
        await cmd.run();

        expect(mockCreateScriptsBackend).toHaveBeenCalled();
        expect(mockReloadCodeVersion).toHaveBeenCalledWith(mockScriptsBackend, 'test-version');
    });

    it('should not call reloadCodeVersion when --reload is not set', async () => {
        const cmd = createCommand({ reload: false });
        await cmd.run();

        expect(mockReloadCodeVersion).not.toHaveBeenCalled();
    });

    it('should gracefully handle reload failure', async () => {
        mockReloadCodeVersion.mockRejectedValueOnce(new Error('reload failed'));

        const cmd = createCommand({ reload: true });
        const warnSpy = vi.spyOn(cmd as any, 'warn');

        await cmd.run();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('reload failed'));
    });

    it('should auto-discover active code version when none specified', async () => {
        const cmd = createCommand();
        (cmd as any).resolvedConfig = { values: { codeVersion: undefined } };

        await cmd.run();

        expect(mockGetActiveCodeVersion).toHaveBeenCalled();
        expect((cmd as any).instance.config.codeVersion).toBe('discovered-version');
    });

    it('should auto-discover active code version over WebDAV without OAuth credentials', async () => {
        const cmd = createCommand();
        (cmd as any).resolvedConfig = { values: { codeVersion: undefined } };
        vi.spyOn(cmd as any, 'hasOAuthCredentials').mockReturnValue(false);

        await cmd.run();

        expect(mockGetActiveCodeVersion).toHaveBeenCalled();
        expect(mockUploadCartridges).toHaveBeenCalled();
        expect((cmd as any).instance.config.codeVersion).toBe('discovered-version');
    });

    it('should error when --reload is set without OAuth credentials', async () => {
        const cmd = createCommand({ reload: true });
        vi.spyOn(cmd as any, 'hasOAuthCredentials').mockReturnValue(false);
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('--reload flag requires OAuth credentials');
    });

    it('should error when auto-discovery finds no active version', async () => {
        mockGetActiveCodeVersion.mockResolvedValueOnce(undefined as any);

        const cmd = createCommand();
        (cmd as any).resolvedConfig = { values: { codeVersion: undefined } };
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('No active code version found');
    });

    it('should error with helpful message when OCAPI discovery fails', async () => {
        mockGetActiveCodeVersion.mockRejectedValueOnce(new Error('401 Unauthorized'));

        const cmd = createCommand();
        (cmd as any).resolvedConfig = { values: { codeVersion: undefined } };
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('Failed to discover active code version');
    });

    it('should deploy a named cartridge when the local base metadata directory is missing', async () => {
        mockFindCartridges.mockReturnValue([namedCartridge]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand({ cartridge: [namedCartridge.name] });
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [namedCartridge], {
            ignoreDirs: undefined,
        });
    });

    it('should error when an explicit selected base cartridge is missing metadata', async () => {
        const selectedBaseMetadata = path.join(defaultCartridges[0].src, 'cartridge', 'experience');
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== selectedBaseMetadata
        );

        const cmd = createCommand({ cartridge: [SFNEXT_BASE_CARTRIDGE_NAME] });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow("Metadata directory doesn't exist");
        expect(mockUploadCartridges).not.toHaveBeenCalled();
    });

    it('should skip the early base check when dw.json include selects a named cartridge', async () => {
        mockFindCartridges.mockReturnValue([namedCartridge]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand();
        (cmd as any).resolvedConfig = {
            values: { codeVersion: 'test-version', cartridges: [namedCartridge.name] },
        };
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [namedCartridge], {
            ignoreDirs: undefined,
        });
    });

    it('should skip the early base check when exclude omits the base cartridge', async () => {
        mockFindCartridges.mockReturnValue([namedCartridge]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand({ 'exclude-cartridge': [SFNEXT_BASE_CARTRIDGE_NAME] });
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [namedCartridge], {
            ignoreDirs: undefined,
        });
    });

    it('should honor the SDK returned mappings for include plus exclude', async () => {
        mockFindCartridges.mockReturnValue([namedCartridge]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand({
            cartridge: [SFNEXT_BASE_CARTRIDGE_NAME, namedCartridge.name],
            'exclude-cartridge': [SFNEXT_BASE_CARTRIDGE_NAME],
        });
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [namedCartridge], {
            ignoreDirs: undefined,
        });
    });

    it('should not upload or delete when a filtered selection is empty', async () => {
        mockFindCartridges.mockReturnValue([]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand({ cartridge: ['missing_cartridge'], delete: true });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmd.run()).rejects.toThrow('No cartridges found');
        expect(mockUploadCartridges).not.toHaveBeenCalled();
        expect(mockDeleteCartridges).not.toHaveBeenCalled();
    });

    it('should check selected base metadata on the provider mapping src', async () => {
        const providerSrc = path.join('/provider/root', SFNEXT_BASE_CARTRIDGE_NAME);
        const providerBase = {
            name: SFNEXT_BASE_CARTRIDGE_NAME,
            src: providerSrc,
            dest: SFNEXT_BASE_CARTRIDGE_NAME,
        };
        mockFindCartridges.mockReturnValue([providerBase]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((target: string) => {
            if (target === defaultMetadataDir) {
                return false;
            }
            return target !== path.join(providerSrc, 'does-not-exist');
        });

        const cmd = createCommand({ cartridge: [SFNEXT_BASE_CARTRIDGE_NAME] });
        await cmd.run();

        expect(fs.existsSync).toHaveBeenCalledWith(path.join(providerSrc, 'cartridge', 'experience'));
        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [providerBase], { ignoreDirs: undefined });
    });

    it('should deploy an ordinary selected cartridge that has no experience metadata', async () => {
        const ordinary = {
            name: 'app_custom',
            src: path.join('/test/project', 'cartridges', 'app_custom'),
            dest: 'app_custom',
        };
        mockFindCartridges.mockReturnValue([ordinary]);
        (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
            (target: string) => target !== defaultMetadataDir
        );

        const cmd = createCommand({ cartridge: [ordinary.name] });
        await cmd.run();

        expect(mockUploadCartridges).toHaveBeenCalledWith(expect.anything(), [ordinary], { ignoreDirs: undefined });
    });
});
