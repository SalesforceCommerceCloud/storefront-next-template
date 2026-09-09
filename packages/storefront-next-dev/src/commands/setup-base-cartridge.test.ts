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
import SetupBaseCartridge from './setup-base-cartridge';

const { mockGet, mockPut } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPut: vi.fn(),
}));

vi.mock('@salesforce/b2c-tooling-sdk/clients', () => ({
    createSlasClient: vi.fn(() => ({ GET: mockGet, PUT: mockPut })),
}));

vi.mock('@salesforce/b2c-tooling-sdk/cli', () => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const { Command } = require('@oclif/core');
    class OAuthCommand extends Command {
        static baseFlags = {};
        resolvedConfig = {
            values: {
                shortCode: 'kv7kzm78',
                tenantId: 'f_ecom_zzrf_001',
            },
        };
        getOAuthStrategy() {
            return 'mock-auth';
        }
    }
    return { OAuthCommand };
});

const EXISTING_CLIENT = {
    clientId: 'my-slas-client',
    scopes: ['openid', 'profile'],
    redirectUri: ['https://example.com/callback'],
    callbackUri: null,
    isPrivateClient: false,
};

function createCommand(flagOverrides: Record<string, unknown> = {}) {
    const cmd = new SetupBaseCartridge([], {} as any);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({
        flags: { 'slas-client-id': 'my-slas-client', ...flagOverrides },
        args: {},
        argv: [],
        raw: [],
        metadata: {},
    });
    vi.spyOn(cmd as any, 'log').mockImplementation(() => {});
    vi.spyOn(cmd as any, 'debug').mockImplementation(() => {});
    return cmd;
}

describe('setup-base-cartridge command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { ...EXISTING_CLIENT }, error: undefined });
        mockPut.mockResolvedValue({ error: undefined, response: { status: 200, statusText: 'OK' } });
    });

    describe('prerequisite validation', () => {
        it('errors when shortCode is missing', async () => {
            const cmd = createCommand();
            (cmd as any).resolvedConfig = { values: { shortCode: undefined, tenantId: 'f_ecom_zzrf_001' } };
            const errorSpy = vi.spyOn(cmd as any, 'error').mockImplementation((msg: unknown) => {
                throw new Error(String(msg));
            });

            await expect(cmd.run()).rejects.toThrow('short code');
            expect(errorSpy).toHaveBeenCalled();
        });

        it('errors when tenantId is missing', async () => {
            const cmd = createCommand();
            (cmd as any).resolvedConfig = { values: { shortCode: 'kv7kzm78', tenantId: undefined } };
            vi.spyOn(cmd as any, 'error').mockImplementation((msg: unknown) => {
                throw new Error(String(msg));
            });

            await expect(cmd.run()).rejects.toThrow('Tenant ID');
        });
    });

    describe('GET failure', () => {
        it('errors when the SLAS GET returns an error', async () => {
            mockGet.mockResolvedValue({
                data: undefined,
                error: { message: 'Not Found' },
                response: { status: 404, statusText: 'Not Found', text: vi.fn().mockResolvedValue('') },
            });
            const cmd = createCommand();
            vi.spyOn(cmd as any, 'error').mockImplementation((msg: unknown) => {
                throw new Error(String(msg));
            });

            await expect(cmd.run()).rejects.toThrow('Failed to fetch SLAS client');
        });

        it('errors when GET returns no data', async () => {
            mockGet.mockResolvedValue({
                data: undefined,
                error: undefined,
                response: { status: 200, statusText: 'OK', text: vi.fn().mockResolvedValue('') },
            });
            const cmd = createCommand();
            vi.spyOn(cmd as any, 'error').mockImplementation((msg: unknown) => {
                throw new Error(String(msg));
            });

            await expect(cmd.run()).rejects.toThrow('Failed to fetch SLAS client');
        });
    });

    describe('scope already registered', () => {
        it('exits early without PUT when scope is already present as an array entry', async () => {
            mockGet.mockResolvedValue({
                data: { ...EXISTING_CLIENT, scopes: ['openid', 'c_sfnext_notify'] },
                error: undefined,
            });
            const cmd = createCommand();
            const logSpy = vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

            await cmd.run();

            expect(mockPut).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'));
        });

        it('exits early when scope is present in a pipe-delimited string', async () => {
            mockGet.mockResolvedValue({
                data: { ...EXISTING_CLIENT, scopes: 'openid|c_sfnext_notify|profile' },
                error: undefined,
            });
            const cmd = createCommand();
            await cmd.run();

            expect(mockPut).not.toHaveBeenCalled();
        });

        it('exits early when scope is present in a whitespace-delimited string', async () => {
            mockGet.mockResolvedValue({
                data: { ...EXISTING_CLIENT, scopes: 'openid c_sfnext_notify profile' },
                error: undefined,
            });
            const cmd = createCommand();
            await cmd.run();

            expect(mockPut).not.toHaveBeenCalled();
        });
    });

    describe('successful scope registration', () => {
        it('sends a PUT that includes the new scope', async () => {
            const cmd = createCommand();
            await cmd.run();

            expect(mockPut).toHaveBeenCalledOnce();
            const putBody = mockPut.mock.calls[0][1].body;
            expect(putBody.scopes).toContain('c_sfnext_notify');
        });

        it('preserves existing scopes when adding the new one', async () => {
            const cmd = createCommand();
            await cmd.run();

            const putBody = mockPut.mock.calls[0][1].body;
            expect(putBody.scopes).toContain('openid');
            expect(putBody.scopes).toContain('profile');
        });

        it('normalises pipe-delimited redirectUri to an array', async () => {
            mockGet.mockResolvedValue({
                data: { ...EXISTING_CLIENT, redirectUri: 'https://a.com|https://b.com' },
                error: undefined,
            });
            const cmd = createCommand();
            await cmd.run();

            const putBody = mockPut.mock.calls[0][1].body;
            expect(Array.isArray(putBody.redirectUri)).toBe(true);
            expect(putBody.redirectUri).toContain('https://a.com');
        });

        it('omits callbackUri in PUT body when it is null', async () => {
            const cmd = createCommand();
            await cmd.run();

            const putBody = mockPut.mock.calls[0][1].body;
            expect(putBody.callbackUri).toBeUndefined();
        });

        it('normalises callbackUri to array when present', async () => {
            mockGet.mockResolvedValue({
                data: { ...EXISTING_CLIENT, callbackUri: 'https://a.com|https://b.com' },
                error: undefined,
            });
            const cmd = createCommand();
            await cmd.run();

            const putBody = mockPut.mock.calls[0][1].body;
            expect(Array.isArray(putBody.callbackUri)).toBe(true);
        });

        it('logs a success message after the PUT', async () => {
            const cmd = createCommand();
            const logSpy = vi.spyOn(cmd as any, 'log').mockImplementation(() => {});

            await cmd.run();

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Done!'));
        });
    });

    describe('PUT failure', () => {
        it('errors when PUT returns an error', async () => {
            mockPut.mockResolvedValue({
                error: { message: 'Bad Request' },
                response: { status: 400, statusText: 'Bad Request' },
            });
            const cmd = createCommand();
            vi.spyOn(cmd as any, 'error').mockImplementation((msg: unknown) => {
                throw new Error(String(msg));
            });

            await expect(cmd.run()).rejects.toThrow('Failed to update SLAS client');
        });
    });
});
