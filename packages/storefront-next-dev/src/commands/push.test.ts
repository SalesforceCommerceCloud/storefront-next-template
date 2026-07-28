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
import Push from './push';
import fs from 'fs-extra';
import path from 'path';

// Hoisted mocks must be declared before vi.mock calls due to hoisting
const {
    mockCreateBundle,
    mockUploadBundle,
    mockWaitForEnv,
    mockCreateMrtClient,
    mockGetMrtAuth,
    mockRequireMrtCredentials,
    mockGenerateMetadata,
    mockUploadCartridges,
} = vi.hoisted(() => ({
    mockCreateBundle: vi.fn(() => Promise.resolve({ data: 'test-bundle' })),
    mockUploadBundle: vi.fn(() =>
        Promise.resolve({ bundleId: 123, projectSlug: 'my-project', deployed: false, message: 'Test' })
    ),
    mockWaitForEnv: vi.fn(() => Promise.resolve({ state: 'ACTIVE' })),
    mockCreateMrtClient: vi.fn(() => ({
        /* mock client */
    })),
    mockGetMrtAuth: vi.fn(() => ({
        /* mock auth */
    })),
    mockRequireMrtCredentials: vi.fn(),
    mockGenerateMetadata: vi.fn(() => Promise.resolve()),
    mockUploadCartridges: vi.fn(() => Promise.resolve()),
}));

// Mock dependencies
vi.mock('fs-extra', () => ({
    default: {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
    },
}));

vi.mock('../bundle', () => ({
    createBundle: mockCreateBundle,
}));

vi.mock('@salesforce/b2c-tooling-sdk/operations/mrt', () => ({
    uploadBundle: mockUploadBundle,
    waitForEnv: mockWaitForEnv,
}));

vi.mock('@salesforce/b2c-tooling-sdk/clients', () => ({
    createMrtClient: mockCreateMrtClient,
    DEFAULT_MRT_ORIGIN: 'https://cloud.mobify.com',
}));

vi.mock('../cartridge-services/generate-cartridge', () => ({
    generateMetadata: mockGenerateMetadata,
}));

vi.mock('@salesforce/b2c-tooling-sdk/operations/code', () => ({
    uploadCartridges: mockUploadCartridges,
}));

vi.mock('@salesforce/b2c-tooling-sdk/cli', () => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const { Command } = require('@oclif/core');
    class MrtCommand extends Command {
        static baseFlags = {};
        resolvedConfig = {
            values: {
                mrtProject: undefined,
                mrtEnvironment: undefined,
                mrtApiKey: undefined,
                mrtOrigin: undefined,
            },
        };
        getMrtAuth = mockGetMrtAuth;
        requireMrtCredentials = mockRequireMrtCredentials;
    }
    return { MrtCommand };
});

vi.mock('../utils', () => ({
    getDefaultBuildDir: vi.fn(() => '/test/project/build'),
    getDefaultMessage: vi.fn(() => 'main:abc123'),
}));

vi.mock('../config', () => ({
    buildMrtConfig: vi.fn(() => ({
        ssrParameters: {},
        ssrOnly: [],
        ssrShared: [],
    })),
    CARTRIDGES_BASE_DIR: 'cartridges',
    SFNEXT_BASE_CARTRIDGE_NAME: 'app_storefrontnext_base',
    SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR: 'app_storefrontnext_base/cartridge/experience',
    GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH: false,
}));

describe('push command', () => {
    const originalMrtProject = process.env.MRT_PROJECT;
    const originalMrtTarget = process.env.MRT_TARGET;

    beforeEach(() => {
        vi.clearAllMocks();
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        delete process.env.MRT_PROJECT;
        delete process.env.MRT_TARGET;
    });

    afterEach(() => {
        if (originalMrtProject === undefined) {
            delete process.env.MRT_PROJECT;
        } else {
            process.env.MRT_PROJECT = originalMrtProject;
        }

        if (originalMrtTarget === undefined) {
            delete process.env.MRT_TARGET;
        } else {
            process.env.MRT_TARGET = originalMrtTarget;
        }
    });

    it('should push bundle with correct project slug', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': '/test/build',
                project: 'my-project',
                environment: 'staging',
                message: 'Test push',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmdAny.run();

        expect(mockRequireMrtCredentials).toHaveBeenCalled();
        expect(mockCreateBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                projectSlug: 'my-project',
                message: 'Test push',
            })
        );
        expect(mockCreateMrtClient).toHaveBeenCalled();
        expect(mockUploadBundle).toHaveBeenCalled();
    });

    it('should print non-blocking warnings returned from the push', async () => {
        const warning = 'x86 support ends January 31, 2027. Switch to ARM in environment settings to avoid disruptions';
        mockUploadBundle.mockResolvedValueOnce({
            bundleId: 123,
            projectSlug: 'my-project',
            target: 'staging',
            deployed: true,
            message: 'Test',
            warnings: [warning],
        } as any);

        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': '/test/build',
                project: 'my-project',
                environment: 'staging',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmdAny.run();

        expect(warnSpy).toHaveBeenCalledWith(warning);
    });

    it('should not print any warnings when the push returns none', async () => {
        // Default mock returns no `warnings` field
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': '/test/build',
                project: 'my-project',
                environment: 'staging',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmdAny.run();

        const warning = 'x86 support ends January 31, 2027. Switch to ARM in environment settings to avoid disruptions';
        expect(warnSpy).not.toHaveBeenCalledWith(warning);
    });

    it('should error if project directory does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/nonexistent/project',
                project: 'my-project',
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmdAny.run()).rejects.toThrow('does not exist');
    });

    it('should error if build directory does not exist', async () => {
        // First call (project dir) returns true, second call (build dir) returns false
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true).mockReturnValueOnce(false);

        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'build-directory': '/nonexistent/build',
                project: 'my-project',
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmdAny.run()).rejects.toThrow('does not exist');
    });

    it('should error if wait is true but no environment specified', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as {
            run: () => Promise<void>;
            resolvedConfig: { values: { mrtProject: string; mrtEnvironment: undefined } };
        };

        // Override resolvedConfig to have no mrtEnvironment
        cmdAny.resolvedConfig = {
            values: {
                mrtProject: 'test-project',
                mrtEnvironment: undefined,
            },
        };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: 'my-project',
                environment: undefined,
                wait: true,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmdAny.run()).rejects.toThrow('target environment');
    });

    it('should require MRT credentials before push', async () => {
        mockRequireMrtCredentials.mockImplementationOnce(() => {
            throw new Error('MRT API key is required');
        });

        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: 'my-project',
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmdAny.run()).rejects.toThrow('MRT API key is required');
    });

    it('should error if project slug is not provided', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as {
            run: () => Promise<void>;
            resolvedConfig: { values: { mrtProject: undefined; mrtEnvironment: undefined } };
        };

        // Override resolvedConfig to have no mrtProject
        cmdAny.resolvedConfig = {
            values: {
                mrtProject: undefined,
                mrtEnvironment: undefined,
            },
        };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: undefined,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'error').mockImplementation((msg: any) => {
            throw new Error(msg);
        });

        await expect(cmdAny.run()).rejects.toThrow('Project slug is required');
    });

    it('should wait for deployment when wait flag is true', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: 'my-project',
                environment: 'staging',
                wait: true,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmdAny.run();

        expect(mockWaitForEnv).toHaveBeenCalledWith(
            expect.objectContaining({
                projectSlug: 'my-project',
                slug: 'staging',
            }),
            expect.anything()
        );
    });

    it('should support deprecated --project-slug and --target flags', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                'project-slug': 'legacy-project',
                target: 'legacy-target',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        await cmdAny.run();

        expect(warnSpy).toHaveBeenCalledWith('Flag --project-slug is deprecated. Use --project instead.');
        expect(warnSpy).toHaveBeenCalledWith('Flag --target is deprecated. Use --environment instead.');
        expect(mockCreateBundle).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'legacy-project' }));
        expect(mockUploadBundle).toHaveBeenCalledWith(
            expect.anything(),
            'legacy-project',
            expect.anything(),
            'legacy-target'
        );
    });

    it('should resolve MRT_PROJECT and MRT_TARGET env vars as primary', async () => {
        // SDK 0.5.5+ resolves MRT_PROJECT/MRT_TARGET as primary env vars,
        // so they appear in flags.project/flags.environment after parsing
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: 'env-project',
                environment: 'env-target',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});

        await cmdAny.run();

        expect(mockCreateBundle).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'env-project' }));
        expect(mockUploadBundle).toHaveBeenCalledWith(
            expect.anything(),
            'env-project',
            expect.anything(),
            'env-target'
        );
        expect(process.env.DEPLOY_TARGET).toBe('env-target');
    });

    it('should prefer canonical flags over deprecated aliases', async () => {
        const cmd = new Push([], {} as never);
        const cmdAny = cmd as unknown as { run: () => Promise<void> };

        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {
                'project-directory': '/test/project',
                project: 'canonical-project',
                'project-slug': 'legacy-project',
                environment: 'canonical-env',
                target: 'legacy-env',
                wait: false,
            },
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        await cmdAny.run();

        // Deprecated flags still warn
        expect(warnSpy).toHaveBeenCalledWith('Flag --project-slug is deprecated. Use --project instead.');
        expect(warnSpy).toHaveBeenCalledWith('Flag --target is deprecated. Use --environment instead.');
        // Canonical flags win over deprecated aliases
        expect(mockCreateBundle).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'canonical-project' }));
        expect(mockUploadBundle).toHaveBeenCalledWith(
            expect.anything(),
            'canonical-project',
            expect.anything(),
            'canonical-env'
        );
    });

    it('should skip cartridge deployment when B2C config is missing', async () => {
        const cmd = new Push([], {} as never);
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        (cmd as any).resolvedConfig = {
            hasB2CInstanceConfig: () => false,
            values: {},
        };

        await (cmd as any).generateAndDeployCartridge('/test/project');

        expect(warnSpy).toHaveBeenCalledWith('B2C instance not configured, skipping cartridge deployment');
        expect(mockUploadCartridges).not.toHaveBeenCalled();
    });

    it('should skip cartridge deployment when code version is missing', async () => {
        const cmd = new Push([], {} as never);
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        (cmd as any).resolvedConfig = {
            hasB2CInstanceConfig: () => true,
            values: {
                codeVersion: undefined,
            },
            createB2CInstance: vi.fn(() => ({})),
        };

        await (cmd as any).generateAndDeployCartridge('/test/project');

        expect(warnSpy).toHaveBeenCalledWith('Code version not configured, skipping cartridge deployment');
        expect(mockUploadCartridges).not.toHaveBeenCalled();
    });

    it('should generate and upload cartridges when B2C config is complete', async () => {
        const cmd = new Push([], {} as never);
        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        const instance = { id: 'instance' };
        (cmd as any).resolvedConfig = {
            hasB2CInstanceConfig: () => true,
            values: {
                codeVersion: 'test-version',
            },
            createB2CInstance: vi.fn(() => instance),
        };

        await (cmd as any).generateAndDeployCartridge('/test/project');

        expect(mockGenerateMetadata).toHaveBeenCalledWith(
            '/test/project',
            path.join('/test/project', 'cartridges', 'app_storefrontnext_base', 'cartridge', 'experience')
        );
        expect(mockUploadCartridges).toHaveBeenCalledWith(instance, [
            {
                name: 'app_storefrontnext_base',
                src: path.join('/test/project', 'cartridges', 'app_storefrontnext_base'),
                dest: 'app_storefrontnext_base',
            },
        ]);
    });

    it('should create metadata directory when it is missing', async () => {
        const cmd = new Push([], {} as never);
        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
        (cmd as any).resolvedConfig = {
            hasB2CInstanceConfig: () => false,
            values: {},
        };

        await (cmd as any).generateAndDeployCartridge('/test/project');

        expect(fs.mkdirSync).toHaveBeenCalledWith(
            path.join('/test/project', 'cartridges', 'app_storefrontnext_base', 'cartridge', 'experience'),
            { recursive: true }
        );
    });

    it('should warn and continue when cartridge generation throws', async () => {
        const cmd = new Push([], {} as never);
        const warnSpy = vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

        mockGenerateMetadata.mockRejectedValueOnce(new Error('generation failed'));

        await (cmd as any).generateAndDeployCartridge('/test/project');

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to generate or deploy cartridge: generation failed')
        );
    });
});
