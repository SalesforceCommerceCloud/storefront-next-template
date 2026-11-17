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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { ApiError, AuthTokenInvalidError } from '@/scapi';
import { action } from './action.set-selected-store';
import type { Route } from './+types/action.set-selected-store';
import { createActionArgs } from '@/lib/test-utils';
import { selectStore, StoreSelectionError } from '@/extensions/store-locator/lib/store-selection.server';
import { updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { getAuth } from '@/middlewares/auth.server';
import {
    invalidateSelectedStoreResolution,
    resolveSelectedStore,
} from '@/extensions/store-locator/lib/resolve-selected-store.server';

vi.mock('@/extensions/store-locator/lib/store-selection.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/extensions/store-locator/lib/store-selection.server')>()),
    selectStore: vi.fn(),
}));
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({
    resolveSelectedStore: vi.fn(),
    invalidateSelectedStoreResolution: vi.fn(),
}));
vi.mock('@/extensions/store-locator/lib/api/preferred-store.server', () => ({ updatePreferredStoreId: vi.fn() }));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

/** Route-level contract. Selection, reconciliation and persistence semantics live in `store-selection.server.test.ts`. */
describe('set-selected-store action', () => {
    let context: RouterContextProvider;
    const form = (fields: Record<string, string> = {}) => {
        const body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.set(key, value);
        return body;
    };
    const args = (body: FormData, headers: HeadersInit = { Origin: 'https://example.com' }, method = 'POST') =>
        createActionArgs<Route.ActionArgs>(
            new Request('https://example.com/action/set-selected-store', {
                method,
                headers,
                ...(method === 'GET' ? {} : { body }),
            }),
            context,
            { pattern: '' }
        );

    beforeEach(() => {
        vi.resetAllMocks();
        context = new RouterContextProvider();
        vi.mocked(selectStore).mockResolvedValue({ success: true, selectedStoreInfo: { id: 'Store-1' } } as never);
        vi.mocked(resolveSelectedStore).mockResolvedValue({ selectedStoreInfo: { id: 'Store-1' } } as never);
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
    });

    describe('account default persistence', () => {
        beforeEach(() => {
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered' } as never);
        });

        test('registered set saves the store as the account default after selection', async () => {
            const result = await action(args(form({ intent: 'set', storeId: 'Store-1' })));
            expect(updatePreferredStoreId).toHaveBeenCalledWith(context, 'Store-1');
            expect(result.init?.status).toBe(200);
        });

        test('registered clear removes the account default', async () => {
            await action(args(form({ intent: 'clear' })));
            expect(updatePreferredStoreId).toHaveBeenCalledWith(context, null);
        });

        test('guest selection never writes the profile', async () => {
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
            await action(args(form({ intent: 'set', storeId: 'Store-1' })));
            expect(updatePreferredStoreId).not.toHaveBeenCalled();
        });

        test('a 409 confirmation refusal does not touch the profile', async () => {
            vi.mocked(selectStore).mockResolvedValue({
                success: false,
                code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            } as never);
            await action(args(form({ intent: 'set', storeId: 'Store-2' })));
            expect(updatePreferredStoreId).not.toHaveBeenCalled();
        });

        test('a failed profile write answers 502 with a structured code', async () => {
            vi.mocked(updatePreferredStoreId).mockRejectedValue(new Error('boom'));
            const result = await action(args(form({ intent: 'set', storeId: 'Store-1' })));
            expect(result.init?.status).toBe(502);
            expect(result.data).toMatchObject({ success: false, code: 'PREFERRED_STORE_PERSISTENCE_FAILED' });
        });
    });

    test.each([
        {},
        { Origin: 'null' },
        { Origin: 'malformed' },
        { Origin: 'https://foreign.example' },
        { Origin: 'https://sibling.example.com' },
        { Referer: 'malformed' },
        { Origin: 'https://foreign.example', 'x-forwarded-host': 'foreign.example' },
    ])('rejects direct POST headers %j before any read or write', async (headers) => {
        for (const fields of [
            { intent: 'set', storeId: 'Store-1' },
            { intent: 'clear' },
            { intent: 'reconcile' },
        ] as Record<string, string>[]) {
            const result = await action(args(form(fields), headers as HeadersInit));
            expect(result.init?.status).toBe(403);
            expect(result.data).toMatchObject({ success: false, code: 'FORBIDDEN_ORIGIN' });
        }
        expect(selectStore).not.toHaveBeenCalled();
        expect(resolveSelectedStore).not.toHaveBeenCalled();
    });

    test('accepts a same-origin Referer fallback', async () => {
        const result = await action(
            args(form({ intent: 'set', storeId: 'Store-1' }), { Referer: 'https://example.com/account' })
        );
        expect(result.data.success).toBe(true);
    });

    test.each(['GET', 'PUT', 'PATCH', 'DELETE'])('rejects %s with Allow POST', async (method) => {
        const result = await action(args(form(), undefined, method));
        expect(result.init?.status).toBe(405);
        expect(new Headers(result.init?.headers).get('Allow')).toBe('POST');
        expect(selectStore).not.toHaveBeenCalled();
    });

    test('set passes an opaque store ID to the shared service and invalidates the resolution', async () => {
        const result = await action(args(form({ intent: 'set', storeId: 'Store-1' })));
        expect(selectStore).toHaveBeenCalledWith(context, { id: 'Store-1' });
        expect(invalidateSelectedStoreResolution).toHaveBeenCalledWith(context);
        expect(result.init?.status).toBe(200);
        expect(result.data).toEqual({ success: true, selectedStoreInfo: { id: 'Store-1' } });
    });

    test('clear passes null to the shared service', async () => {
        await action(args(form({ intent: 'clear' })));
        expect(selectStore).toHaveBeenCalledWith(context, null);
    });

    test('reconcile re-resolves without writing', async () => {
        const result = await action(args(form({ intent: 'reconcile' })));
        expect(selectStore).not.toHaveBeenCalled();
        expect(invalidateSelectedStoreResolution).toHaveBeenCalledWith(context);
        expect(result.data).toEqual({ success: true, selectedStoreInfo: { id: 'Store-1' } });
    });

    test.each([{ error: 'x' }, { authError: true }])('reconcile maps a failed resolution %j to 503', async (failed) => {
        vi.mocked(resolveSelectedStore).mockResolvedValue(failed as never);
        const result = await action(args(form({ intent: 'reconcile' })));
        expect(result.init?.status).toBe(503);
        expect(result.data).toMatchObject({ success: false, code: 'RESOLUTION_FAILED' });
    });

    test('answers a change needing confirmation with 409 and the service result', async () => {
        const refused = { success: false, code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' };
        vi.mocked(selectStore).mockResolvedValue(refused as never);
        const result = await action(args(form({ intent: 'set', storeId: 'Store-2' })));
        expect(result.init?.status).toBe(409);
        expect(result.data).toEqual(refused);
    });

    test.each([
        ['missing', undefined],
        ['blank', '  '],
        ['list', 'a,b'],
        ['control character', 'a\nb'],
        ['too long', 'x'.repeat(257)],
    ])('rejects a %s store ID before any write', async (_name, id) => {
        const result = await action(args(form({ intent: 'set', ...(id === undefined ? {} : { storeId: id }) })));
        expect(result.init?.status).toBe(400);
        expect(result.data).toMatchObject({ success: false, code: 'INVALID_STORE_ID' });
        expect(selectStore).not.toHaveBeenCalled();
    });

    test('accepts an exact 256-character ID', async () => {
        const id = 'x'.repeat(256);
        await action(args(form({ intent: 'set', storeId: id })));
        expect(selectStore).toHaveBeenCalledWith(context, { id });
    });

    test.each([
        ['unknown intent', { intent: 'delete' }],
        ['clear with an ID', { intent: 'clear', storeId: 'Store-1' }],
        ['reconcile with an ID', { intent: 'reconcile', storeId: 'Store-1' }],
    ])('rejects %s', async (_name, fields) => {
        const result = await action(args(form(fields)));
        expect(result.init?.status).toBe(400);
        expect(selectStore).not.toHaveBeenCalled();
    });

    test('rejects duplicate intents', async () => {
        const body = form({ intent: 'set', storeId: 'Store-1' });
        body.append('intent', 'clear');
        expect((await action(args(body))).init?.status).toBe(400);
        expect(selectStore).not.toHaveBeenCalled();
    });

    test('routes the legacy storeInfo field through the same service', async () => {
        await action(args(form({ storeInfo: JSON.stringify({ id: 'Store-1', inventoryId: 'inv-1' }) })));
        expect(selectStore).toHaveBeenCalledWith(context, { id: 'Store-1', inventoryId: 'inv-1' });
        await action(args(form({ storeInfo: '' })));
        expect(selectStore).toHaveBeenLastCalledWith(context, null);
    });

    test.each([
        ['malformed JSON', '{', 'INVALID_STORE_INFO', 400],
        ['invalid store', JSON.stringify({ id: ' ' }), 'INVALID_STORE', undefined],
        [
            'non-string inventory',
            JSON.stringify({ id: 'Store-1', inventoryId: 1 }),
            'INVALID_STORE_INVENTORY',
            undefined,
        ],
    ])('rejects legacy storeInfo with %s', async (_name, storeInfo, code, status) => {
        const result = await action(args(form({ storeInfo })));
        expect(result.data).toMatchObject({ success: false, code });
        if (status) expect(result.init?.status).toBe(status);
        expect(selectStore).not.toHaveBeenCalled();
    });

    test.each([
        [new StoreSelectionError('INVALID_STORE'), 'INVALID_STORE'],
        [
            new ApiError({
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers(),
                body: {},
                rawBody: '',
                url: 'https://example.com',
            } as never),
            'STORE_CONTEXT_UNAVAILABLE',
        ],
        [new Error('boom'), 'STORE_SELECTION_FAILED'],
    ])('maps a service failure to a classified code', async (error, code) => {
        vi.mocked(selectStore).mockRejectedValue(error);
        const result = await action(args(form({ intent: 'set', storeId: 'Store-1' })));
        expect(result.data).toMatchObject({ success: false, code, error: code });
    });

    test('rethrows token invalidation so the auth middleware can recover', async () => {
        vi.mocked(selectStore).mockRejectedValue(new AuthTokenInvalidError());
        await expect(action(args(form({ intent: 'set', storeId: 'Store-1' })))).rejects.toBeInstanceOf(
            AuthTokenInvalidError
        );
    });
});
