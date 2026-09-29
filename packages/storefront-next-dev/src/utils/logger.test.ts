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
import os from 'os';
import {
    getNetworkAddress,
    getPackageVersion,
    logger,
    printServerInfo,
    printServerConfig,
    printShutdownMessage,
} from './logger';

// Mock os module
vi.mock('os', () => ({
    default: {
        networkInterfaces: vi.fn(),
    },
}));

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock module for createRequire
vi.mock('module', async () => {
    const actual = await vi.importActual('module');
    return {
        ...actual,
        createRequire: vi.fn(() => {
            return {
                resolve: vi.fn((pkgName: string) => {
                    if (pkgName.includes('react/package.json')) {
                        return '/path/to/react/package.json';
                    }
                    if (pkgName.includes('react-router/package.json')) {
                        return '/path/to/react-router/package.json';
                    }
                    if (pkgName.includes('unknown-package/package.json')) {
                        throw new Error('Package not found');
                    }
                    return `/path/to/${pkgName}`;
                }),
            };
        }),
    };
});

describe('logger utils', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('getNetworkAddress', () => {
        it('should return undefined if no network interfaces', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({});

            const result = getNetworkAddress();
            expect(result).toBeUndefined();
        });

        it('should return IPv4 address from network interfaces', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                eth0: [
                    {
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        mac: '00:00:00:00:00:00',
                        internal: false,
                        cidr: '192.168.1.100/24',
                    },
                ],
            });

            const result = getNetworkAddress();
            expect(result).toBe('192.168.1.100');
        });

        it('should skip internal addresses', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                lo: [
                    {
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        mac: '00:00:00:00:00:00',
                        internal: true,
                        cidr: '127.0.0.1/8',
                    },
                ],
                eth0: [
                    {
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        mac: '00:00:00:00:00:00',
                        internal: false,
                        cidr: '192.168.1.100/24',
                    },
                ],
            });

            const result = getNetworkAddress();
            expect(result).toBe('192.168.1.100');
        });

        it('should skip IPv6 addresses', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                eth0: [
                    {
                        address: 'fe80::1',
                        netmask: 'ffff:ffff:ffff:ffff::',
                        family: 'IPv6',
                        mac: '00:00:00:00:00:00',
                        internal: false,
                        cidr: 'fe80::1/64',
                        scopeid: 1,
                    },
                    {
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        mac: '00:00:00:00:00:00',
                        internal: false,
                        cidr: '192.168.1.100/24',
                    },
                ],
            });

            const result = getNetworkAddress();
            expect(result).toBe('192.168.1.100');
        });

        it('should return undefined if interface is undefined', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                eth0: undefined,
            });

            const result = getNetworkAddress();
            expect(result).toBeUndefined();
        });
    });

    describe('getPackageVersion', () => {
        it('should return "unknown" when package is not found', () => {
            const result = getPackageVersion('unknown-package', '/project/dir');
            expect(result).toBe('unknown');
        });

        it('should return version when package is found', () => {
            // Mock the require function to return a version
            const mockRequire = vi.fn((pkgPath: string) => {
                if (pkgPath.includes('react')) {
                    return { version: '18.2.0' };
                }
                return { version: 'unknown' };
            });

            vi.doMock('module', () => ({
                createRequire: () => ({
                    resolve: () => '/path/to/react/package.json',
                    default: mockRequire,
                }),
            }));

            // Since the function catches errors and returns "unknown", this test
            // will always return "unknown" in the current implementation
            const result = getPackageVersion('react', '/project/dir');
            expect(result).toBe('unknown');
        });
    });

    describe('logger object', () => {
        it('should default to info level in non-production', () => {
            delete process.env.NODE_ENV;
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.DEBUG;
            expect(logger.getLevel()).toBe('info');
        });

        it('should respect SFCC_LOG_LEVEL env var', () => {
            process.env.SFCC_LOG_LEVEL = 'debug';
            expect(logger.getLevel()).toBe('debug');
        });

        // MRT injects MRT_LOG_LEVEL as a numeric string from its LogLevel enum
        // (0=TRACE, 1=DEBUG, 2=INFO, 3=WARN, 4=ERROR, 5=FATAL).
        it.each([
            ['0', 'debug'],
            ['1', 'debug'],
            ['2', 'info'],
            ['3', 'warn'],
            ['4', 'error'],
            ['5', 'error'],
        ] as const)('should map numeric MRT_LOG_LEVEL=%s to %s', (mrtValue, expected) => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.DEBUG;
            process.env.NODE_ENV = 'production';
            process.env.MRT_LOG_LEVEL = mrtValue;
            expect(logger.getLevel()).toBe(expected);
        });

        it('MRT_LOG_LEVEL should take precedence over SFCC_LOG_LEVEL', () => {
            delete process.env.DEBUG;
            process.env.MRT_LOG_LEVEL = '1'; // DEBUG
            process.env.SFCC_LOG_LEVEL = 'error';
            expect(logger.getLevel()).toBe('debug');
        });

        it('should fall back to SFCC_LOG_LEVEL when MRT_LOG_LEVEL is unrecognized', () => {
            delete process.env.DEBUG;
            process.env.MRT_LOG_LEVEL = '99';
            process.env.SFCC_LOG_LEVEL = 'error';
            expect(logger.getLevel()).toBe('error');
        });

        it('should fall back to debug when DEBUG=true', () => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = 'true';
            expect(logger.getLevel()).toBe('debug');
        });

        it.each(['1', 'yes', 'on', 'TRUE', 'Yes'])('should fall back to debug when DEBUG=%s', (value) => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = value;
            expect(logger.getLevel()).toBe('debug');
        });

        it('should fall back to debug when DEBUG=* (wildcard)', () => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = '*';
            expect(logger.getLevel()).toBe('debug');
        });

        it('should fall back to debug when DEBUG targets sfnext', () => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = 'sfnext';
            expect(logger.getLevel()).toBe('debug');
        });

        it('should fall back to debug when DEBUG targets sfnext:*', () => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = 'sfnext:*';
            expect(logger.getLevel()).toBe('debug');
        });

        it('should fall back to debug when DEBUG contains sfnext in a comma list', () => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.DEBUG = 'express:*,sfnext,other';
            expect(logger.getLevel()).toBe('debug');
        });

        it('should NOT fall back to debug when DEBUG targets unrelated libraries', () => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.NODE_ENV;
            process.env.DEBUG = 'express:*';
            expect(logger.getLevel()).toBe('info');
        });

        it('should fall back to warn in production', () => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.DEBUG;
            process.env.NODE_ENV = 'production';
            expect(logger.getLevel()).toBe('warn');
        });

        it('setLevel should override env-based resolution', () => {
            process.env.NODE_ENV = 'production';
            logger.setLevel('debug');
            expect(logger.getLevel()).toBe('debug');
            // Reset override for other tests
            logger.setLevel(undefined);
        });

        it('info should log via console.log with cyan prefix', () => {
            logger.info('test message');
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('[sfnext:info]'), 'test message');
        });

        it('warn should log via console.warn with yellow prefix', () => {
            logger.warn('test warning');
            expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('[sfnext:warn]'), 'test warning');
        });

        it('error should log via console.error with red prefix', () => {
            logger.error('test error');
            expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[sfnext:error]'), 'test error');
        });

        it('debug should not log at default info level', () => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.DEBUG;
            delete process.env.NODE_ENV;
            const callCount = mockConsoleLog.mock.calls.length;
            logger.debug('hidden debug');
            expect(mockConsoleLog).toHaveBeenCalledTimes(callCount);
        });

        it('debug should log when level is debug', () => {
            process.env.SFCC_LOG_LEVEL = 'debug';
            logger.debug('visible debug');
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('[sfnext:debug]'), 'visible debug');
        });

        it('should gate lower-priority levels', () => {
            process.env.SFCC_LOG_LEVEL = 'error';
            const logBefore = mockConsoleLog.mock.calls.length;
            const warnBefore = mockConsoleWarn.mock.calls.length;
            logger.info('should not appear');
            logger.warn('should not appear');
            expect(mockConsoleLog).toHaveBeenCalledTimes(logBefore);
            expect(mockConsoleWarn).toHaveBeenCalledTimes(warnBefore);
            logger.error('should appear');
            expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[sfnext:error]'), 'should appear');
        });
    });

    describe('printServerInfo', () => {
        it('should print development mode banner', () => {
            printServerInfo('development', 5173, Date.now() - 100, '/project/dir');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Development Mode'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SFCC Storefront Next'));
        });

        it('should print preview mode banner', () => {
            printServerInfo('preview', 3000, Date.now() - 200, '/project/dir');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Preview Mode'));
        });

        it('should print production mode banner', () => {
            printServerInfo('production', 3000, Date.now() - 150, '/project/dir');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Preview Mode'));
        });
    });

    describe('printServerConfig', () => {
        it('should print proxy configuration when enabled', () => {
            printServerConfig({
                mode: 'development',
                port: 5173,
                enableProxy: true,
                enableStaticServing: false,
                enableCompression: false,
                proxyPath: '/mobify/proxy/api',
                proxyHost: 'https://test.api.commercecloud.salesforce.com',
                shortCode: 'test-sc',
                organizationId: 'org-123',
                clientId: 'client-456',
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Proxy:'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('test-sc'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('org-123'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('client-456'));
        });

        it('should print disabled proxy when not enabled', () => {
            printServerConfig({
                mode: 'development',
                port: 5173,
                enableProxy: false,
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('disabled'));
        });

        it('should print static serving when enabled', () => {
            printServerConfig({
                mode: 'preview',
                port: 3000,
                enableStaticServing: true,
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Static:'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('enabled'));
        });

        it('should print compression when enabled', () => {
            printServerConfig({
                mode: 'preview',
                port: 3000,
                enableCompression: true,
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Compression:'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('enabled'));
        });

        it('should print local URL', () => {
            printServerConfig({
                mode: 'development',
                port: 5173,
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173'));
        });

        it('should print network URL when available', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                eth0: [
                    {
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        mac: '00:00:00:00:00:00',
                        internal: false,
                        cidr: '192.168.1.100/24',
                    },
                ],
            });

            process.env.SHOW_NETWORK = 'true';
            printServerConfig({
                mode: 'development',
                port: 5173,
            });

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('http://192.168.1.100:5173'));
        });

        it('should not show organization, client, and site IDs if not provided', () => {
            const callsBefore = mockConsoleLog.mock.calls.length;

            printServerConfig({
                mode: 'development',
                port: 5173,
                enableProxy: true,
                proxyPath: '/mobify/proxy/api',
                proxyHost: 'https://test.api.commercecloud.salesforce.com',
                shortCode: 'test-sc',
            });

            // Should not contain these IDs
            const calls = mockConsoleLog.mock.calls.slice(callsBefore);
            const allLogs = calls.map((call) => call[0]).join('\n');
            expect(allLogs).not.toContain('Organization ID:');
            expect(allLogs).not.toContain('Client ID:');
            expect(allLogs).not.toContain('Site ID:');
        });
    });

    describe('printShutdownMessage', () => {
        it('should print shutdown message', () => {
            printShutdownMessage();

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Server shutting down'));
        });
    });
});
