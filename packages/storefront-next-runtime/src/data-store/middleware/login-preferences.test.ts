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
import { DataStore } from '@salesforce/mrt-utilities/middleware';
import { siteContext } from '../../site-context';
import { loginPreferencesMiddlewareLazy, getLoginPreferencesLazy } from './login-preferences';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

describe('loginPreferencesMiddlewareLazy', () => {
    let context: RouterContextProvider;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';

        const store = new Map<unknown, unknown>();
        context = {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;
        // Site id is needed for the prefixed entry key.
        context.set(siteContext, { site: { id: 'acme' } } as never);

        next = vi.fn().mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('does not fetch during middleware execution — only on read', async () => {
        const sendMock = vi.fn().mockResolvedValue({
            Item: { value: { data: { emailVerificationEnabled: true } } },
        });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await loginPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(sendMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();
    });

    it('reads the site-prefixed entry and unwraps the { data } envelope on demand', async () => {
        const sendMock = vi.fn().mockResolvedValue({
            Item: { value: { data: { emailVerificationEnabled: true } } },
        });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await loginPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        const value = await getLoginPreferencesLazy(context);
        expect(value).toEqual({ emailVerificationEnabled: true });
        // Entry key is site-prefixed.
        expect(sendMock).toHaveBeenCalledOnce();
        const sentKey = sendMock.mock.calls[0][0].input.Key.key;
        expect(sentKey).toBe('acme-login-preferences');
    });

    it('coalesces concurrent reads into a single fetch', async () => {
        const sendMock = vi.fn().mockResolvedValue({
            Item: { value: { data: { emailVerificationEnabled: true } } },
        });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await loginPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        await Promise.all([
            getLoginPreferencesLazy(context),
            getLoginPreferencesLazy(context),
            getLoginPreferencesLazy(context),
        ]);

        expect(sendMock).toHaveBeenCalledOnce();
    });

    it('falls back to { emailVerificationEnabled: false } when the data store errors', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new Error('DDB throttled')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await loginPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        const value = await getLoginPreferencesLazy(context);
        expect(value).toEqual({ emailVerificationEnabled: false });
        warnSpy.mockRestore();
    });

    it('returns null when the lazy middleware never ran', async () => {
        const value = await getLoginPreferencesLazy(context);
        expect(value).toBeNull();
    });
});
