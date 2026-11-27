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

// Mock dependencies
const mockExistsSync = vi.fn();
const mockImportTypescript = vi.fn();

vi.mock('node:fs', () => ({
    existsSync: mockExistsSync,
}));

vi.mock('./ts-import', () => ({
    importTypescript: mockImportTypescript,
}));

// Import after mocks are set up
const { loadConfigFromEnv, loadProjectConfig } = await import('./config');

describe('server config', () => {
    describe('loadConfigFromEnv', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should successfully load config from environment variables', () => {
            process.env.PUBLIC__app__commerce__api__shortCode = 'test-short-code';
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            const config = loadConfigFromEnv();

            expect(config).toEqual({
                commerce: {
                    api: {
                        shortCode: 'test-short-code',
                        organizationId: 'test-org-id',
                        clientId: 'test-client-id',
                    },
                },
            });
        });

        it('should ignore the retired proxy environment variable', () => {
            process.env.PUBLIC__app__commerce__api__shortCode = 'test-short-code';
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            process.env.PUBLIC__app__commerce__api__proxy = '/legacy/proxy';

            const config = loadConfigFromEnv();

            expect(config.commerce.api).not.toHaveProperty('proxy');
        });

        it('should include proxyHost when SCAPI_PROXY_HOST is set', () => {
            process.env.PUBLIC__app__commerce__api__shortCode = 'test-short-code';
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            process.env.SCAPI_PROXY_HOST = 'https://scw:25010';

            const config = loadConfigFromEnv();

            expect(config.commerce.api.proxyHost).toBe('https://scw:25010');
        });

        it('should not require shortCode when SCAPI_PROXY_HOST is set', () => {
            delete process.env.PUBLIC__app__commerce__api__shortCode;
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            process.env.SCAPI_PROXY_HOST = 'https://scw:25010';

            const config = loadConfigFromEnv();

            expect(config.commerce.api.shortCode).toBe('');
            expect(config.commerce.api.proxyHost).toBe('https://scw:25010');
        });

        it('should throw error when PUBLIC__app__commerce__api__shortCode is missing', () => {
            delete process.env.PUBLIC__app__commerce__api__shortCode;
            delete process.env.SCAPI_PROXY_HOST;
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            expect(() => loadConfigFromEnv()).toThrow(
                'Missing PUBLIC__app__commerce__api__shortCode environment variable'
            );
        });

        it('should throw error when PUBLIC__app__commerce__api__organizationId is missing', () => {
            process.env.PUBLIC__app__commerce__api__shortCode = 'test-short-code';
            delete process.env.PUBLIC__app__commerce__api__organizationId;
            process.env.PUBLIC__app__commerce__api__clientId = 'test-client-id';

            expect(() => loadConfigFromEnv()).toThrow(
                'Missing PUBLIC__app__commerce__api__organizationId environment variable'
            );
        });

        it('should throw error when PUBLIC__app__commerce__api__clientId is missing', () => {
            process.env.PUBLIC__app__commerce__api__shortCode = 'test-short-code';
            process.env.PUBLIC__app__commerce__api__organizationId = 'test-org-id';
            delete process.env.PUBLIC__app__commerce__api__clientId;

            expect(() => loadConfigFromEnv()).toThrow(
                'Missing PUBLIC__app__commerce__api__clientId environment variable'
            );
        });
    });

    describe('loadProjectConfig', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should throw error when config.server.ts does not exist', async () => {
            mockExistsSync.mockReturnValue(false);

            await expect(loadProjectConfig('/test/project')).rejects.toThrow('config.server.ts not found at');
        });

        it('should successfully load config from config.server.ts', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                shortCode: 'config-short-code',
                                organizationId: 'config-org-id',
                                clientId: 'config-client-id',

                                proxy: '/config/proxy',
                            },
                        },
                    },
                },
            });

            const config = await loadProjectConfig('/test/project');

            expect(config).toEqual({
                commerce: {
                    api: {
                        shortCode: 'config-short-code',
                        organizationId: 'config-org-id',
                        clientId: 'config-client-id',
                    },
                },
            });

            expect(mockImportTypescript).toHaveBeenCalledWith(
                expect.stringContaining('config.server.ts'),
                expect.objectContaining({
                    projectDirectory: '/test/project',
                    tsconfigPath: expect.stringContaining('tsconfig.json'),
                })
            );
        });

        it('should load API configuration without a proxy setting', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                shortCode: 'config-short-code',
                                organizationId: 'config-org-id',
                                clientId: 'config-client-id',
                            },
                        },
                    },
                },
            });

            const config = await loadProjectConfig('/test/project');

            expect(config.commerce.api).not.toHaveProperty('proxy');
        });

        it('should throw error when config.server.ts is missing commerce.api', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {},
                },
            });

            await expect(loadProjectConfig('/test/project')).rejects.toThrow(
                'Invalid config.server.ts: missing app.commerce.api configuration'
            );
        });

        it('should throw error when config.server.ts has no default export', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({});

            await expect(loadProjectConfig('/test/project')).rejects.toThrow(
                'Invalid config.server.ts: missing app.commerce.api configuration'
            );
        });

        it('should not require shortCode when SCAPI_PROXY_HOST is set', async () => {
            process.env.SCAPI_PROXY_HOST = 'https://scw:25010';
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                organizationId: 'config-org-id',
                                clientId: 'config-client-id',
                            },
                        },
                    },
                },
            });

            const config = await loadProjectConfig('/test/project');

            expect(config.commerce.api.shortCode).toBe('');
            expect(config.commerce.api.proxyHost).toBe('https://scw:25010');
            delete process.env.SCAPI_PROXY_HOST;
        });

        it('should throw error when shortCode is missing', async () => {
            delete process.env.SCAPI_PROXY_HOST;
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                organizationId: 'config-org-id',
                                clientId: 'config-client-id',
                            },
                        },
                    },
                },
            });

            await expect(loadProjectConfig('/test/project')).rejects.toThrow(
                'Missing shortCode in config.server.ts commerce.api configuration'
            );
        });

        it('should throw error when organizationId is missing', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                shortCode: 'config-short-code',
                                clientId: 'config-client-id',
                            },
                        },
                    },
                },
            });

            await expect(loadProjectConfig('/test/project')).rejects.toThrow(
                'Missing organizationId in config.server.ts commerce.api configuration'
            );
        });

        it('should throw error when clientId is missing', async () => {
            mockExistsSync.mockReturnValue(true);
            mockImportTypescript.mockResolvedValue({
                default: {
                    app: {
                        commerce: {
                            api: {
                                shortCode: 'config-short-code',
                                organizationId: 'config-org-id',
                            },
                        },
                    },
                },
            });

            await expect(loadProjectConfig('/test/project')).rejects.toThrow(
                'Missing clientId in config.server.ts commerce.api configuration'
            );
        });
    });
});
