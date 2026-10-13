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
import { createLogger, setLogLevel, getLogLevel } from './logger';

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('createLogger', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        setLogLevel(undefined);
    });

    afterEach(() => {
        process.env = originalEnv;
        setLogLevel(undefined);
    });

    describe('level resolution', () => {
        it('defaults to info in non-production', () => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.NODE_ENV;
            expect(getLogLevel()).toBe('info');
        });

        it('respects SFCC_LOG_LEVEL env var', () => {
            process.env.SFCC_LOG_LEVEL = 'debug';
            expect(getLogLevel()).toBe('debug');
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
        ] as const)('maps numeric MRT_LOG_LEVEL=%s to %s', (mrtValue, expected) => {
            delete process.env.SFCC_LOG_LEVEL;
            process.env.NODE_ENV = 'production';
            process.env.MRT_LOG_LEVEL = mrtValue;
            expect(getLogLevel()).toBe(expected);
        });

        it('MRT_LOG_LEVEL takes precedence over SFCC_LOG_LEVEL', () => {
            process.env.MRT_LOG_LEVEL = '1'; // DEBUG
            process.env.SFCC_LOG_LEVEL = 'error';
            expect(getLogLevel()).toBe('debug');
        });

        it('falls back to SFCC_LOG_LEVEL when MRT_LOG_LEVEL is unrecognized', () => {
            process.env.MRT_LOG_LEVEL = '99';
            process.env.SFCC_LOG_LEVEL = 'error';
            expect(getLogLevel()).toBe('error');
        });

        it('defaults to warn in production', () => {
            delete process.env.SFCC_LOG_LEVEL;
            delete process.env.MRT_LOG_LEVEL;
            process.env.NODE_ENV = 'production';
            expect(getLogLevel()).toBe('warn');
        });

        it('setLogLevel overrides env-based resolution', () => {
            process.env.NODE_ENV = 'production';
            setLogLevel('debug');
            expect(getLogLevel()).toBe('debug');
        });
    });

    describe('level gating', () => {
        it('logs error at default info level', () => {
            const logger = createLogger();
            logger.error('fail');
            expect(mockConsoleError).toHaveBeenCalledWith('ERROR fail');
        });

        it('logs warn at default info level', () => {
            const logger = createLogger();
            logger.warn('caution');
            expect(mockConsoleWarn).toHaveBeenCalledWith('WARN caution');
        });

        it('logs info at default info level', () => {
            const logger = createLogger();
            logger.info('hello');
            expect(mockConsoleLog).toHaveBeenCalledWith('INFO hello');
        });

        it('suppresses debug at default info level', () => {
            const logger = createLogger();
            logger.debug('trace');
            expect(mockConsoleLog).not.toHaveBeenCalled();
        });

        it('logs debug when level is debug', () => {
            setLogLevel('debug');
            const logger = createLogger();
            logger.debug('trace');
            expect(mockConsoleLog).toHaveBeenCalledWith('DEBUG trace');
        });

        it('suppresses info and debug when level is warn', () => {
            setLogLevel('warn');
            const logger = createLogger();
            logger.info('hidden');
            logger.debug('hidden');
            expect(mockConsoleLog).not.toHaveBeenCalled();
        });

        it('suppresses all except error when level is error', () => {
            setLogLevel('error');
            const logger = createLogger();
            logger.info('hidden');
            logger.warn('hidden');
            logger.debug('hidden');
            expect(mockConsoleLog).not.toHaveBeenCalled();
            expect(mockConsoleWarn).not.toHaveBeenCalled();

            logger.error('visible');
            expect(mockConsoleError).toHaveBeenCalledWith('ERROR visible');
        });
    });

    describe('metadata', () => {
        it('appends JSON metadata when provided', () => {
            const logger = createLogger();
            logger.info('Basket merged', { basketId: 'abc123' });
            expect(mockConsoleLog).toHaveBeenCalledWith('INFO Basket merged', JSON.stringify({ basketId: 'abc123' }));
        });

        it('does not append metadata when not provided', () => {
            const logger = createLogger();
            logger.info('Product loaded');
            expect(mockConsoleLog).toHaveBeenCalledWith('INFO Product loaded');
        });

        it('serializes Error instances in metadata', () => {
            const logger = createLogger();
            const err = new Error('token expired');
            err.name = 'TokenError';
            logger.error('Auth failed', { error: err });

            expect(mockConsoleError).toHaveBeenCalledTimes(1);
            const metadataArg = mockConsoleError.mock.calls[0][1] as string;
            const parsed = JSON.parse(metadataArg);
            expect(parsed.error.name).toBe('TokenError');
            expect(parsed.error.message).toBe('token expired');
            expect(parsed.error.stack).toBeDefined();
        });
    });

    describe('baseMetadata', () => {
        it('includes base metadata in every log entry', () => {
            const logger = createLogger({ correlationId: 'req-123' });
            logger.info('Token refreshed');
            expect(mockConsoleLog).toHaveBeenCalledWith(
                'INFO Token refreshed',
                JSON.stringify({ correlationId: 'req-123' })
            );
        });

        it('merges base and call-site metadata', () => {
            const logger = createLogger({ correlationId: 'req-123' });
            logger.info('Token refreshed', { userId: 'u-456' });
            expect(mockConsoleLog).toHaveBeenCalledWith(
                'INFO Token refreshed',
                JSON.stringify({ correlationId: 'req-123', userId: 'u-456' })
            );
        });

        it('call-site metadata does not overwrite base metadata', () => {
            const logger = createLogger({ correlationId: 'req-123' });
            logger.info('Token refreshed', { correlationId: 'override', extra: true });
            const metadataArg = mockConsoleLog.mock.calls[0][1] as string;
            const parsed = JSON.parse(metadataArg);
            expect(parsed.correlationId).toBe('override');
            expect(parsed.extra).toBe(true);
        });
    });

    describe('immutability', () => {
        it('returns a frozen logger instance', () => {
            const logger = createLogger();
            expect(Object.isFrozen(logger)).toBe(true);
        });
    });
});
