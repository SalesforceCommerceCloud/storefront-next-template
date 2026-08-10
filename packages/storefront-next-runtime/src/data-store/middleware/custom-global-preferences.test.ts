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
import {
    customGlobalPreferencesMiddleware,
    customGlobalPreferencesContext,
    getCustomGlobalPreferences,
} from './custom-global-preferences';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

describe('customGlobalPreferencesMiddleware (eager)', () => {
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

        next = vi.fn().mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('fetches immediately and stores the flattened preferences map in context', async () => {
        const sendMock = vi.fn().mockResolvedValue({
            Item: { value: { data: [{ c_myFlag: true, id: 'groupId' }], total: 1 } },
        });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await customGlobalPreferencesMiddleware({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(sendMock).toHaveBeenCalledOnce();
        expect(sendMock.mock.calls[0][0].input.Key.key).toBe('custom-global-preferences');
        expect(context.get(customGlobalPreferencesContext)).toEqual({ c_myFlag: true, id: 'groupId' });
        expect(getCustomGlobalPreferences(context)).toEqual({ c_myFlag: true, id: 'groupId' });
        expect(next).toHaveBeenCalledOnce();
    });

    it('returns {} when the data array is empty', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({
                Item: { value: { data: [], total: 0 } },
            }),
        } as unknown as typeof DataStore._testDocumentClient;

        await customGlobalPreferencesMiddleware({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(context.get(customGlobalPreferencesContext)).toEqual({});
        expect(getCustomGlobalPreferences(context)).toEqual({});
        expect(next).toHaveBeenCalledOnce();
    });

    it('merges multiple preference group objects into a single flat map', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({
                Item: {
                    value: {
                        data: [{ c_flagA: true }, { c_flagB: 'hello' }],
                        total: 2,
                    },
                },
            }),
        } as unknown as typeof DataStore._testDocumentClient;

        await customGlobalPreferencesMiddleware({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(getCustomGlobalPreferences(context)).toEqual({ c_flagA: true, c_flagB: 'hello' });
        expect(next).toHaveBeenCalledOnce();
    });

    it('falls back to {} when the data store errors', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new Error('DDB throttled')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await customGlobalPreferencesMiddleware({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(getCustomGlobalPreferences(context)).toEqual({});
        expect(next).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });
});
