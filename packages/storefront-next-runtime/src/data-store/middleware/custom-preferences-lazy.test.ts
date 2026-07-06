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
import { customSitePreferencesMiddlewareLazy, getSitePreferencesLazy } from './custom-site-preferences';
import { customGlobalPreferencesMiddlewareLazy, getCustomGlobalPreferencesLazy } from './custom-global-preferences';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

function makeContext(withSite = true): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    const context = {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        get: (ctx: unknown) => store.get(ctx),
    } as unknown as RouterContextProvider;
    if (withSite) context.set(siteContext, { site: { id: 'acme' } } as never);
    return context;
}

describe('custom-site / custom-global lazy data-store middleware', () => {
    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('customSitePreferencesMiddlewareLazy defers the fetch until read, then reads the site-prefixed key', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { theme: 'dark' } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await customSitePreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        expect(sendMock).not.toHaveBeenCalled();

        const value = await getSitePreferencesLazy(context);
        expect(value).toEqual({ theme: 'dark' });
        expect(sendMock.mock.calls[0][0].input.Key.key).toBe('acme-custom-site-preferences');
    });

    it('getSitePreferencesLazy returns null when the lazy middleware never ran', async () => {
        const value = await getSitePreferencesLazy(makeContext());
        expect(value).toBeNull();
    });

    it('customGlobalPreferencesMiddlewareLazy defers the fetch until read, then reads the global key', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { flag: true } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;
        const context = makeContext(false);
        const next = vi.fn().mockResolvedValue(new Response('ok'));

        await customGlobalPreferencesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        expect(sendMock).not.toHaveBeenCalled();

        const value = await getCustomGlobalPreferencesLazy(context);
        expect(value).toEqual({ flag: true });
        expect(sendMock.mock.calls[0][0].input.Key.key).toBe('custom-global-preferences');
    });

    it('getCustomGlobalPreferencesLazy returns null when the lazy middleware never ran', async () => {
        const value = await getCustomGlobalPreferencesLazy(makeContext(false));
        expect(value).toBeNull();
    });
});
