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
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createLoaderArgs } from '@/lib/test-utils';
import {
    createSelectedStoreCookie,
    homeStorePromptDismissedContext,
    selectedStoreContext,
    selectedStoreMiddleware,
    updateSelectedStore,
} from './selected-store.server';

const cookie = {
    parse: vi.fn(),
    serialize: vi.fn(),
};
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(() => cookie),
    getCookieConfig: vi.fn((options) => options),
}));

const createContext = () => {
    const values = new Map();
    const context = {
        get: vi.fn((key) => values.get(key)),
        set: vi.fn((key, value) => values.set(key, value)),
    } as unknown as RouterContextProvider;
    return { context, values };
};

const createArgs = (request: Request, context: Readonly<RouterContextProvider>) =>
    createLoaderArgs(request, context, { pattern: '' }) as Parameters<MiddlewareFunction<Response>>[0];

describe('createSelectedStoreCookie', () => {
    const run = async (rawValue: unknown, headers: Record<string, string> = { Cookie: 'selectedStoreInfo=value' }) => {
        const { context, values } = createContext();
        cookie.parse.mockResolvedValue(rawValue);
        const response = await selectedStoreMiddleware(
            createArgs(new Request('https://example.com', { headers }), context),
            (() => Promise.resolve(new Response())) as Parameters<MiddlewareFunction<Response>>[1]
        );
        return { values, response };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        cookie.parse.mockResolvedValue(null);
        cookie.serialize.mockResolvedValue('selectedStoreInfo=; Max-Age=0');
    });

    test('keeps the readable one-year cookie that hydrates the client', async () => {
        const { createCookie, getCookieConfig } = await import('@/lib/cookie-utils.server');
        const context = {} as never;

        createSelectedStoreCookie(context);

        expect(getCookieConfig).toHaveBeenCalledWith(
            expect.objectContaining({ httpOnly: false, maxAge: 60 * 60 * 24 * 365 }),
            context
        );
        expect(createCookie).toHaveBeenCalledWith('selectedStoreInfo', expect.anything(), context);
    });

    test('reads the candidate ID and inventory only, dropping unknown and malformed optional fields', async () => {
        const { values } = await run(
            encodeURIComponent(JSON.stringify({ id: 'store-1', inventoryId: 'inv-1', name: 'Untrusted', extra: 1 }))
        );
        expect(values.get(selectedStoreContext)).toEqual({ id: 'store-1', inventoryId: 'inv-1' });
        const malformed = await run(encodeURIComponent(JSON.stringify({ id: 'store-1', inventoryId: 7 })));
        expect(malformed.values.get(selectedStoreContext)).toEqual({ id: 'store-1' });
    });

    test('does not write a cookie on an ordinary read', async () => {
        const { response } = await run(encodeURIComponent(JSON.stringify({ id: 'store-1' })));
        expect(response?.headers.get('Set-Cookie')).toBeNull();
        expect(cookie.serialize).not.toHaveBeenCalled();
    });

    test('writes the cookie only after an explicit selection in the request', async () => {
        const { context } = createContext();
        cookie.serialize.mockResolvedValue('selectedStoreInfo=written');
        const response = await selectedStoreMiddleware(createArgs(new Request('https://example.com'), context), (() => {
            updateSelectedStore(context, { id: 'store-1' });
            return Promise.resolve(new Response());
        }) as Parameters<MiddlewareFunction<Response>>[1]);
        expect(cookie.serialize).toHaveBeenCalledTimes(1);
        expect(response?.headers.get('Set-Cookie')).toBe('selectedStoreInfo=written');
    });

    test.each([
        'not-json',
        encodeURIComponent(JSON.stringify({ id: ' ' })),
        encodeURIComponent(JSON.stringify({ id: 'a,b' })),
    ])('drops an invalid payload %s and clears the cookie', async (payload) => {
        const { values, response } = await run(payload);
        expect(values.get(selectedStoreContext)).toBeNull();
        expect(response?.headers.get('Set-Cookie')).toBe('selectedStoreInfo=; Max-Age=0');
    });

    test('exposes a home-prompt dismissal from the session cookie', async () => {
        const { context, values } = createContext();
        values.set(siteContext, { site: { id: 'RefArchGlobal' } });
        const next = vi.fn(() => Promise.resolve(new Response()));

        await selectedStoreMiddleware(
            createArgs(
                new Request('https://example.com', {
                    headers: { Cookie: 'store-locator-home-prompt-dismissed_RefArchGlobal=1' },
                }),
                context
            ),
            next as Parameters<MiddlewareFunction<Response>>[1]
        );

        expect(values.get(homeStorePromptDismissedContext)).toBe(true);
    });
});
