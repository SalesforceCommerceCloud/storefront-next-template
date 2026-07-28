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

// TODO: Delete this test file alongside `logger-context.ts` once the SDK-level
// `loggerContext` lifted from the storefront template lands.

import { describe, it, expect, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { type DataStoreLogger, dataStoreLoggerContext, getDataStoreLogger } from './logger-context';

function makeContext(initial?: Map<unknown, unknown>): RouterContextProvider {
    const store = initial ?? new Map<unknown, unknown>();
    return {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        get: (ctx: unknown) => store.get(ctx) ?? null,
    } as unknown as RouterContextProvider;
}

describe('getDataStoreLogger', () => {
    it('returns the injected logger when context is populated', () => {
        const injected: DataStoreLogger = {
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        };
        const context = makeContext();
        context.set(dataStoreLoggerContext, injected);

        const logger = getDataStoreLogger(context);
        logger.warn('test message', { foo: 'bar' });

        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(injected.warn).toHaveBeenCalledWith('test message', { foo: 'bar' });
    });

    it('returns a console-backed default when context is null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const context = makeContext();

        const logger = getDataStoreLogger(context);
        logger.warn('warn from default');

        expect(warnSpy).toHaveBeenCalledWith('warn from default');
        warnSpy.mockRestore();
    });
});

describe('console fallback logger', () => {
    it('warn() formats metadata as JSON appended to the message', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const logger = getDataStoreLogger(makeContext());
        logger.warn('something happened', { entryKey: 'gcp' });

        expect(warnSpy).toHaveBeenCalledWith('something happened {"entryKey":"gcp"}');
        warnSpy.mockRestore();
    });

    it('warn() serializes Error metadata so JSON.stringify does not produce {}', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const logger = getDataStoreLogger(makeContext());
        logger.warn('boom', { error: new Error('cause') });

        const call = warnSpy.mock.calls[0]?.[0] as string;
        expect(call).toContain('"name":"Error"');
        expect(call).toContain('"message":"cause"');
        warnSpy.mockRestore();
    });

    it('warn() does not throw when metadata contains a cycle', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const cyclic: Record<string, unknown> = { name: 'cyclic' };
        cyclic.self = cyclic;
        const logger = getDataStoreLogger(makeContext());

        expect(() => logger.warn('cyclic case', cyclic)).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[unserializable metadata]'));
        warnSpy.mockRestore();
    });

    it('error() routes to console.error', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = getDataStoreLogger(makeContext());
        logger.error('failed');

        expect(errorSpy).toHaveBeenCalledWith('failed');
        errorSpy.mockRestore();
    });

    it('info() and debug() are no-ops on the default logger', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

        const logger = getDataStoreLogger(makeContext());
        logger.info('not visible');
        logger.debug('also not visible');

        expect(logSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
        expect(debugSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        infoSpy.mockRestore();
        debugSpy.mockRestore();
    });
});
