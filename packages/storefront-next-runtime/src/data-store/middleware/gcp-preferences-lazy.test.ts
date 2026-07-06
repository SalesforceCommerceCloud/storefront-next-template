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
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { DataStore, DataStoreServiceError } from '@salesforce/mrt-utilities/middleware';
import { gcpPreferencesMiddlewareLazy, getGcpApiKeyLazy, getGcpPreferencesLazy } from './gcp-preferences';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

function makeContext(): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    return {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        get: (ctx: unknown) => store.get(ctx),
    } as unknown as RouterContextProvider;
}

describe('gcp lazy data-store middleware', () => {
    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        delete process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('defers the fetch until read, then reads the plain (non-site-scoped) gcp key', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { 'api-key': 'gcp-ootb-key' } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        expect(sendMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();

        const value = await getGcpPreferencesLazy(context);
        expect(value).toEqual({ apiKey: 'gcp-ootb-key' });
        expect(sendMock.mock.calls[0][0].input.Key.key).toBe('gcp');
    });

    it('getGcpApiKeyLazy triggers the fetch and returns the api key', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { 'api-key': 'gcp-ootb-key' } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getGcpApiKeyLazy(context)).toBe('gcp-ootb-key');
    });

    it('dedups concurrent reads within a request into a single fetch', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { 'api-key': 'gcp-ootb-key' } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        const [a, b] = await Promise.all([getGcpApiKeyLazy(context), getGcpApiKeyLazy(context)]);
        expect(a).toBe('gcp-ootb-key');
        expect(b).toBe('gcp-ootb-key');
        expect(sendMock).toHaveBeenCalledOnce();
    });

    it('getGcpPreferencesLazy returns null when the lazy middleware never ran', async () => {
        expect(await getGcpPreferencesLazy(makeContext())).toBeNull();
    });

    it('getGcpApiKeyLazy returns an empty string when the lazy middleware never ran', async () => {
        expect(await getGcpApiKeyLazy(makeContext())).toBe('');
    });

    it('getGcpApiKeyLazy returns an empty string when the entry is missing', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({}),
        } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getGcpApiKeyLazy(context)).toBe('');
        warnSpy.mockRestore();
    });

    it('falls back to an empty api key on service error when the unavailable mode is unset', async () => {
        delete process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE;
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        vi.resetModules();
        const fresh = await import('./gcp-preferences');
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await fresh.gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await fresh.getGcpApiKeyLazy(context)).toBe('');
        warnSpy.mockRestore();
    });

    it('rejects at read time on service error when SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw', async () => {
        process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE = 'throw';
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();

        vi.resetModules();
        const fresh = await import('./gcp-preferences');
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        // Middleware itself does not fetch, so it does not throw.
        await fresh.gcpPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        expect(next).toHaveBeenCalledOnce();

        await expect(fresh.getGcpApiKeyLazy(context)).rejects.toThrow(`Data store request failed for 'gcp'.`);
    });
});
