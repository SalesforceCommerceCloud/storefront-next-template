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
import { correlationContext } from '@/lib/correlation';

// Dynamic import so we can manipulate env before module evaluation
async function importModule() {
    return import('./logging.server');
}

describe('logging.server', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    describe('pinoLogger', () => {
        it('creates a pino logger with info level in development', async () => {
            process.env.NODE_ENV = 'development';
            delete process.env.SFCC_LOG_LEVEL;
            const { pinoLogger } = await importModule();
            expect(pinoLogger).toBeDefined();
            expect(pinoLogger.level).toBe('info');
        });

        it('creates a pino logger with warn level in production', async () => {
            process.env.NODE_ENV = 'production';
            delete process.env.SFCC_LOG_LEVEL;
            const { pinoLogger } = await importModule();
            expect(pinoLogger.level).toBe('warn');
        });

        it('respects SFCC_LOG_LEVEL env var', async () => {
            process.env.SFCC_LOG_LEVEL = 'debug';
            const { pinoLogger } = await importModule();
            expect(pinoLogger.level).toBe('debug');
        });

        it('ignores invalid SFCC_LOG_LEVEL values', async () => {
            process.env.NODE_ENV = 'production';
            process.env.SFCC_LOG_LEVEL = 'verbose';
            const { pinoLogger } = await importModule();
            expect(pinoLogger.level).toBe('warn');
        });
    });

    describe('loggingMiddleware', () => {
        it('sets a wrapped pino logger on loggerContext and dataStoreLoggerContext', async () => {
            process.env.NODE_ENV = 'development';
            const { loggingMiddleware } = await importModule();
            // Resolve context refs from the same module graph as the middleware, since vi.resetModules
            // gives fresh symbol identities each iteration.
            const { loggerContext } = await import('@/lib/logger.server');
            const { dataStoreLoggerContext, dataStoreTracerContext } = await import(
                '@salesforce/storefront-next-runtime/data-store'
            );

            const mockContext = {
                get: vi.fn((ctx: unknown) => {
                    if (ctx === correlationContext) return 'corr-123';
                    return undefined;
                }),
                set: vi.fn(),
            };
            const next = vi.fn().mockResolvedValue(new Response());

            await loggingMiddleware({ context: mockContext, request: new Request('http://localhost/') } as any, next);

            // logger, data-store logger, and data-store tracer.
            expect(mockContext.set).toHaveBeenCalledTimes(3);
            expect(next).toHaveBeenCalled();

            const calls = mockContext.set.mock.calls;
            const loggerCall = calls.find((c) => c[0] === loggerContext);
            const sdkCall = calls.find((c) => c[0] === dataStoreLoggerContext);
            const tracerCall = calls.find((c) => c[0] === dataStoreTracerContext);
            if (!loggerCall || !sdkCall) {
                throw new Error('expected loggingMiddleware to set both loggerContext and dataStoreLoggerContext');
            }
            // The tracer seam is always set (to null when OTel is disabled) so the runtime SDK
            // reads a defined value rather than throwing on an unset context.
            if (!tracerCall) {
                throw new Error('expected loggingMiddleware to set dataStoreTracerContext');
            }
            expect(tracerCall[1]).toBeNull();
            // Same wrapped object handed to both contexts so SDK warnings flow through pino with the request bindings.
            expect(loggerCall[1]).toBe(sdkCall[1]);

            const logger = loggerCall[1] as Record<string, unknown>;
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.debug).toBe('function');
        });

        it('works without a correlation ID', async () => {
            process.env.NODE_ENV = 'development';
            const { loggingMiddleware } = await importModule();

            const mockContext = {
                get: vi.fn(() => undefined),
                set: vi.fn(),
            };
            const next = vi.fn().mockResolvedValue(new Response());

            await loggingMiddleware({ context: mockContext, request: new Request('http://localhost/') } as any, next);

            expect(mockContext.set).toHaveBeenCalledTimes(3);
            const logger = mockContext.set.mock.calls[0][1] as Record<string, unknown>;
            expect(typeof logger.info).toBe('function');
        });

        it('wrapped logger is frozen (immutable)', async () => {
            process.env.NODE_ENV = 'development';
            const { loggingMiddleware } = await importModule();

            const mockContext = {
                get: vi.fn(() => 'corr-456'),
                set: vi.fn(),
            };
            const next = vi.fn().mockResolvedValue(new Response());

            await loggingMiddleware({ context: mockContext, request: new Request('http://localhost/') } as any, next);

            const injectedLogger = mockContext.set.mock.calls[0][1];
            expect(Object.isFrozen(injectedLogger)).toBe(true);
        });
    });

    describe('log line format', () => {
        it('excludes pid and hostname, and uses string level labels', async () => {
            process.env.NODE_ENV = 'production';
            process.env.SFCC_LOG_LEVEL = 'info';

            const pino = await import('pino');
            const { Writable } = await import('stream');

            // Create a writable stream that captures output
            let output = '';
            const stream = new Writable({
                write(chunk, _encoding, callback) {
                    output += chunk.toString();
                    callback();
                },
            });

            // Re-import to get resolveLevel with our env
            const { resolveLevel } = await import('@/lib/logger');
            const logger = pino.default(
                {
                    level: resolveLevel(),
                    base: undefined,
                    formatters: {
                        level: (label) => ({ level: label }),
                    },
                },
                stream
            );

            logger.info({ correlationId: 'test-123' }, 'test message');

            const parsed = JSON.parse(output.trim());
            expect(parsed).toEqual(
                expect.objectContaining({
                    level: 'info',
                    correlationId: 'test-123',
                    msg: 'test message',
                })
            );
            expect(parsed).not.toHaveProperty('pid');
            expect(parsed).not.toHaveProperty('hostname');
            // level should be a string, not a number
            expect(typeof parsed.level).toBe('string');
        });
    });

    describe('error serialization', () => {
        it('serializes Error instances in metadata', async () => {
            process.env.NODE_ENV = 'development';
            process.env.SFCC_LOG_LEVEL = 'error';
            const { pinoLogger } = await importModule();

            // Verify that pinoLogger can log with Error metadata without throwing
            expect(() => pinoLogger.error({ error: new Error('test') }, 'fail')).not.toThrow();
        });
    });
});
