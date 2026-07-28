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
import { resolve } from 'node:path';
import { ux } from '@oclif/core';
import ConfigInspect from './inspect.js';

const { mockListEnvVars, mockGetMrtAuth, mockRequireMrtCredentials } = vi.hoisted(() => ({
    mockListEnvVars: vi.fn(),
    mockGetMrtAuth: vi.fn(() => ({})),
    mockRequireMrtCredentials: vi.fn(),
}));

vi.mock('@salesforce/b2c-tooling-sdk/cli', () => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const { Command } = require('@oclif/core');
    class MrtCommand extends Command {
        static baseFlags = {};
        resolvedConfig = {
            values: {
                mrtProject: undefined as string | undefined,
                mrtEnvironment: undefined as string | undefined,
                mrtOrigin: undefined as string | undefined,
            },
        };
        getMrtAuth = mockGetMrtAuth;
        requireMrtCredentials = mockRequireMrtCredentials;
    }
    return { MrtCommand };
});

vi.mock('@salesforce/b2c-tooling-sdk/operations/mrt', () => ({
    listEnvVars: mockListEnvVars,
}));

describe('config inspect command', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let chdirSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {});
        chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        chdirSpy.mockRestore();
    });

    function createCommand(): any {
        return new ConfigInspect([], {} as never);
    }

    function stubParse(cmd: any, flags: Record<string, unknown>, explicitFlagNames: string[] = []): void {
        vi.spyOn(cmd, 'parse').mockResolvedValue({
            flags,
            args: {},
            argv: [],
            raw: explicitFlagNames.map((flag) => ({ type: 'flag', flag, input: `--${flag}` })),
            metadata: {},
        });
    }

    it('displays resolved config without MRT when project/environment not configured', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({}),
            loadConfig: vi.fn().mockResolvedValue({ app: { site: { locale: 'en-US' } } }),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: undefined, mrtEnvironment: undefined, mrtOrigin: undefined },
        };

        await cmd.run();

        const allOutput = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
        expect(allOutput).toContain('config.server.ts');
    });

    it('fetches MRT vars and shows comparison when project and environment are configured', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        mockListEnvVars.mockResolvedValue({ variables: [{ name: 'PUBLIC__app__site__locale', value: 'en-US' }] });

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({ PUBLIC__app__site__locale: 'en-US' }),
            loadConfig: vi.fn().mockResolvedValue({ app: { site: { locale: 'en-US' } } }),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: 'my-project', mrtEnvironment: 'staging', mrtOrigin: 'https://example.com' },
        };

        await cmd.run();

        expect(mockRequireMrtCredentials).toHaveBeenCalled();
        expect(mockListEnvVars).toHaveBeenCalledWith(
            expect.objectContaining({ projectSlug: 'my-project', environment: 'staging' }),
            expect.anything()
        );

        const allOutput = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
        expect(allOutput).toContain('MRT Overrides');
    });

    it('warns but continues when no .env file is found', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({}),
            loadConfig: vi.fn().mockResolvedValue({}),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: undefined, mrtEnvironment: undefined, mrtOrigin: undefined },
        };

        await cmd.run();

        const warnMessages = warnSpy.mock.calls.map((c) => c[0]).join(' ');
        expect(warnMessages).toMatch(/\.env|not found|missing|No env/i);
    });

    it('warns but continues when loadConfig throws', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({}),
            loadConfig: vi.fn().mockRejectedValue(new Error('Cannot find module')),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: undefined, mrtEnvironment: undefined, mrtOrigin: undefined },
        };

        await cmd.run();

        const warnMessages = warnSpy.mock.calls.map((c) => c[0]).join(' ');
        expect(warnMessages).toMatch(/config|Cannot find/i);
    });

    it('warns but continues when MRT API call fails', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        mockListEnvVars.mockRejectedValue(new Error('API error'));

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({ PUBLIC__foo: 'bar' }),
            loadConfig: vi.fn().mockResolvedValue({}),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: 'my-project', mrtEnvironment: 'staging', mrtOrigin: 'https://example.com' },
        };

        await cmd.run();

        const warnMessages = warnSpy.mock.calls.map((c) => c[0]).join(' ');
        expect(warnMessages).toMatch(/MRT|API error/i);
    });

    it('uses MRT_PROJECT/MRT_TARGET from .env, overriding stale resolvedConfig', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        mockListEnvVars.mockResolvedValue({ variables: [] });

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({
                MRT_PROJECT: 'env-project',
                MRT_TARGET: 'env-env',
            }),
            loadConfig: vi.fn().mockResolvedValue({}),
        };

        // resolvedConfig has stale values from an earlier read
        cmd.resolvedConfig = {
            values: { mrtProject: 'stale-project', mrtEnvironment: 'stale-env', mrtOrigin: undefined },
        };

        await cmd.run();

        expect(mockListEnvVars).toHaveBeenCalledWith(
            expect.objectContaining({ projectSlug: 'env-project', environment: 'env-env' }),
            expect.anything()
        );
    });

    it('explicit --project/--environment CLI flags take priority over .env values', async () => {
        const cmd = new ConfigInspect(['--project', 'cli-project', '--environment', 'cli-env'], {} as never) as any;
        stubParse(cmd, { 'project-directory': '/test/project', project: 'cli-project', environment: 'cli-env' }, [
            'project',
            'environment',
        ]);

        vi.spyOn(cmd, 'warn').mockImplementation(() => {});
        mockListEnvVars.mockResolvedValue({ variables: [] });

        cmd.operations = {
            ...cmd.operations,
            readEnvFile: vi.fn().mockReturnValue({ MRT_PROJECT: 'env-project', MRT_TARGET: 'env-env' }),
            loadConfig: vi.fn().mockResolvedValue({}),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: 'stale-project', mrtEnvironment: 'stale-env', mrtOrigin: undefined },
        };

        await cmd.run();

        expect(mockListEnvVars).toHaveBeenCalledWith(
            expect.objectContaining({ projectSlug: 'cli-project', environment: 'cli-env' }),
            expect.anything()
        );
    });

    it('reads .env from the resolved project directory', async () => {
        const cmd = createCommand();
        stubParse(cmd, { 'project-directory': '/test/project' });

        vi.spyOn(cmd, 'warn').mockImplementation(() => {});

        const mockReadEnvFile = vi.fn().mockReturnValue({});
        cmd.operations = {
            ...cmd.operations,
            readEnvFile: mockReadEnvFile,
            loadConfig: vi.fn().mockResolvedValue({}),
        };

        cmd.resolvedConfig = {
            values: { mrtProject: undefined, mrtEnvironment: undefined, mrtOrigin: undefined },
        };

        await cmd.run();

        expect(mockReadEnvFile).toHaveBeenCalledWith(resolve('/test/project'));
    });
});
