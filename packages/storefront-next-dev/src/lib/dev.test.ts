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
/* oxlint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Express } from 'express';
import type { ViteDevServer } from 'vite';
import type { ServerConfig } from '../server/config';
import { pathsEqual } from '../test-utils';

// Mock node:http — created before Vite so it can be passed as hmr.server
const mockHttpServer = {
    on: vi.fn(),
    listen: vi.fn((port: number, callback?: () => void) => {
        if (callback) callback();
        return mockHttpServer;
    }),
    close: vi.fn((cb?: () => void) => {
        if (cb) cb();
    }),
};

const mockCreateNodeHttpServer = vi.fn(() => mockHttpServer);

vi.mock('node:http', () => ({
    createServer: mockCreateNodeHttpServer,
}));

// Mock dependencies
const mockViteServer = {
    middlewares: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
} as unknown as ViteDevServer;

const mockCreateViteServer = vi.fn(() => Promise.resolve(mockViteServer));

vi.mock('vite', () => ({
    createServer: mockCreateViteServer,
}));

const mockApp = {} as unknown as Express;

const mockCreateServer = vi.fn(() => mockApp);

vi.mock('../server/index', () => ({
    createServer: mockCreateServer,
    initBasePathEnv: vi.fn().mockResolvedValue(undefined),
}));

const mockConfig: ServerConfig = {
    commerce: {
        api: {
            shortCode: 'test-short-code',
            organizationId: 'test-org-id',
            clientId: 'test-client-id',
            proxy: '/mobify/proxy/api',
        },
    },
};

const mockLoadProjectConfig = vi.fn(() => Promise.resolve(mockConfig));

vi.mock('../server/config', () => ({
    loadProjectConfig: mockLoadProjectConfig,
}));

const mockGetCommerceCloudApiUrl = vi.fn(() => 'https://test-short-code.api.commercecloud.salesforce.com');

vi.mock('../utils/paths', () => ({
    getCommerceCloudApiUrl: mockGetCommerceCloudApiUrl,
    getBasePath: vi.fn().mockReturnValue(''),
}));

const mockPrintServerInfo = vi.fn();
const mockPrintServerConfig = vi.fn();
const mockPrintShutdownMessage = vi.fn();

vi.mock('../utils/logger', () => ({
    printServerInfo: mockPrintServerInfo,
    printServerConfig: mockPrintServerConfig,
    printShutdownMessage: mockPrintShutdownMessage,
}));

describe('dev command', () => {
    const originalEnv = process.env;
    const originalExecArgv = process.execArgv;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        process.execArgv = [];
        delete process.env.NODE_ENV;
        delete process.env.EXTERNAL_DOMAIN_NAME;
        delete process.env.NODE_OPTIONS;
    });

    afterEach(() => {
        process.env = originalEnv;
        process.execArgv = originalExecArgv;
        vi.restoreAllMocks();
    });

    describe('dev', () => {
        it('should start the development server with default options', async () => {
            const { dev } = await import('./dev');

            await dev();

            // Verify Vite server was created with no HMR config (localhost = no workspace proxy)
            expect(mockCreateViteServer).toHaveBeenCalledWith({
                root: expect.any(String),
                server: {
                    middlewareMode: true,
                },
            });

            // Verify loadProjectConfig was called
            expect(mockLoadProjectConfig).toHaveBeenCalledWith(expect.any(String));

            // Verify createServer was called with correct options
            expect(mockCreateServer).toHaveBeenCalledWith({
                mode: 'development',
                projectDirectory: expect.any(String),
                config: mockConfig,
                port: 5173,
                vite: mockViteServer,
            });

            // Verify Express app was attached to the HTTP server
            expect(mockHttpServer.on).toHaveBeenCalledWith('request', mockApp);

            // Verify the HTTP server was started on the correct port
            expect(mockHttpServer.listen).toHaveBeenCalledWith(5173, expect.anything());

            // Verify printServerInfo was called
            expect(mockPrintServerInfo).toHaveBeenCalledWith(
                'development',
                5173,
                expect.any(Number),
                expect.any(String)
            );

            // Verify printServerConfig was called
            expect(mockPrintServerConfig).toHaveBeenCalledWith({
                mode: 'development',
                port: 5173,
                enableProxy: true,
                enableStaticServing: false,
                enableCompression: false,
                proxyPath: '/mobify/proxy/api',
                proxyHost: 'https://test-short-code.api.commercecloud.salesforce.com',
                shortCode: 'test-short-code',
                organizationId: 'test-org-id',
                clientId: 'test-client-id',
            });
        });

        it('should start the development server with custom port', async () => {
            const { dev } = await import('./dev');

            await dev({ port: 3000 });

            expect(mockCreateServer).toHaveBeenCalledWith({
                mode: 'development',
                projectDirectory: expect.any(String),
                config: mockConfig,
                port: 3000,
                vite: mockViteServer,
            });

            expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, expect.anything());
        });

        it('should start the development server with custom project directory', async () => {
            const { dev } = await import('./dev');

            const customDir = '/custom/project/dir';
            await dev({ projectDirectory: customDir });

            expect(mockCreateViteServer).toHaveBeenCalled();
            const viteCall = (
                mockCreateViteServer.mock.calls[0] as unknown as [{ root: string; server: { middlewareMode: boolean } }]
            )[0];
            expect(pathsEqual(viteCall.root, customDir)).toBe(true);
            expect(viteCall.server).toEqual({ middlewareMode: true });

            expect(mockLoadProjectConfig).toHaveBeenCalled();
            const configCall = mockLoadProjectConfig.mock.calls[0] as unknown as [string];
            expect(pathsEqual(configCall[0], customDir)).toBe(true);

            expect(mockCreateServer).toHaveBeenCalled();
            const serverCall = (
                mockCreateServer.mock.calls[0] as unknown as [
                    { mode: string; projectDirectory: string; config: ServerConfig; port: number; vite: ViteDevServer },
                ]
            )[0];
            expect(serverCall.mode).toBe('development');
            expect(pathsEqual(serverCall.projectDirectory, customDir)).toBe(true);
            expect(serverCall.config).toEqual(mockConfig);
            expect(serverCall.port).toBe(5173);
            expect(serverCall.vite).toBe(mockViteServer);
        });

        it('should set NODE_ENV to development if not already set', async () => {
            const { dev } = await import('./dev');

            delete process.env.NODE_ENV;
            await dev();

            expect(process.env.NODE_ENV).toBe('development');
        });

        it('should not override existing NODE_ENV', async () => {
            const { dev } = await import('./dev');

            process.env.NODE_ENV = 'production';
            await dev();

            expect(process.env.NODE_ENV).toBe('production');
        });

        it('should set EXTERNAL_DOMAIN_NAME if not already set', async () => {
            const { dev } = await import('./dev');

            delete process.env.EXTERNAL_DOMAIN_NAME;
            await dev({ port: 4000 });

            expect(process.env.EXTERNAL_DOMAIN_NAME).toBe('localhost:4000');
        });

        it('should not override existing EXTERNAL_DOMAIN_NAME', async () => {
            const { dev } = await import('./dev');

            process.env.EXTERNAL_DOMAIN_NAME = 'custom-domain.com';
            await dev();

            expect(process.env.EXTERNAL_DOMAIN_NAME).toBe('custom-domain.com');
        });

        it('should configure HMR through the main server when using a workspace proxy', async () => {
            const { dev } = await import('./dev');

            process.env.EXTERNAL_DOMAIN_NAME = 'i-abc123-port-5173.dataplane.example.aws.sfdc.cl';
            await dev();

            expect(mockCreateViteServer).toHaveBeenCalledWith({
                root: expect.any(String),
                server: {
                    middlewareMode: true,
                    hmr: {
                        protocol: 'wss',
                        host: 'i-abc123-port-5173.dataplane.example.aws.sfdc.cl',
                        clientPort: 443,
                        server: mockHttpServer,
                    },
                },
            });
        });

        it('should pass node resolution conditions from process.execArgv into Vite', async () => {
            const { dev } = await import('./dev');

            process.execArgv = ['--conditions=dev-data-store', '--conditions', 'custom-condition'];
            await dev();

            expect(mockCreateViteServer).toHaveBeenCalledWith({
                root: expect.any(String),
                resolve: {
                    conditions: ['dev-data-store', 'custom-condition'],
                },
                optimizeDeps: {
                    esbuildOptions: {
                        conditions: ['dev-data-store', 'custom-condition'],
                    },
                },
                ssr: {
                    resolve: {
                        conditions: ['dev-data-store', 'custom-condition'],
                        externalConditions: ['dev-data-store', 'custom-condition'],
                    },
                },
                server: {
                    middlewareMode: true,
                },
            });
        });

        it('should merge and dedupe node resolution conditions from execArgv and NODE_OPTIONS', async () => {
            const { dev } = await import('./dev');

            process.execArgv = ['--conditions=dev-data-store', '--conditions', 'custom-condition'];
            process.env.NODE_OPTIONS =
                '--conditions=dev-data-store --trace-warnings --conditions another-condition --conditions=';

            await dev();

            expect(mockCreateViteServer).toHaveBeenCalledWith({
                root: expect.any(String),
                resolve: {
                    conditions: ['dev-data-store', 'custom-condition', 'another-condition'],
                },
                optimizeDeps: {
                    esbuildOptions: {
                        conditions: ['dev-data-store', 'custom-condition', 'another-condition'],
                    },
                },
                ssr: {
                    resolve: {
                        conditions: ['dev-data-store', 'custom-condition', 'another-condition'],
                        externalConditions: ['dev-data-store', 'custom-condition', 'another-condition'],
                    },
                },
                server: {
                    middlewareMode: true,
                },
            });
        });

        it('should handle SIGTERM signal for graceful shutdown', async () => {
            const { dev } = await import('./dev');

            const processOnce = vi.spyOn(process, 'once');
            const processExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

            await dev();

            const sigtermCall = processOnce.mock.calls.find((call) => call[0] === 'SIGTERM');
            const sigtermHandler = sigtermCall?.[1];
            expect(sigtermHandler).toBeDefined();

            if (sigtermHandler && typeof sigtermHandler === 'function') {
                sigtermHandler();
            }

            expect(mockPrintShutdownMessage).toHaveBeenCalled();
            expect(mockHttpServer.close).toHaveBeenCalled();

            const viteClose = mockViteServer.close as ReturnType<typeof vi.fn>;
            expect(viteClose).toHaveBeenCalled();
            expect(processExit).toHaveBeenCalledWith(0);
        });

        it('should handle SIGINT signal for graceful shutdown', async () => {
            const { dev } = await import('./dev');

            const processOnce = vi.spyOn(process, 'once');
            const processExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

            await dev();

            const sigintCall = processOnce.mock.calls.find((call) => call[0] === 'SIGINT');
            const sigintHandler = sigintCall?.[1];
            expect(sigintHandler).toBeDefined();

            if (sigintHandler && typeof sigintHandler === 'function') {
                sigintHandler();
            }

            expect(mockPrintShutdownMessage).toHaveBeenCalled();
            expect(mockHttpServer.close).toHaveBeenCalled();

            const viteClose = mockViteServer.close as ReturnType<typeof vi.fn>;
            expect(viteClose).toHaveBeenCalled();
            expect(processExit).toHaveBeenCalledWith(0);
        });

        it('should use default project directory when not provided', async () => {
            const { dev } = await import('./dev');

            const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');

            await dev({});

            expect(mockLoadProjectConfig).toHaveBeenCalled();
            const firstCall = mockLoadProjectConfig.mock.calls[0] as unknown as [string];
            expect(pathsEqual(firstCall[0], '/mock/cwd')).toBe(true);

            cwdSpy.mockRestore();
        });
    });
});
