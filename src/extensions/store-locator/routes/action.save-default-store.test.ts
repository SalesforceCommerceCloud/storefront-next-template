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
import { AuthTokenInvalidError } from '@/scapi';
import { action } from './action.save-default-store';
import type { Route } from './+types/action.save-default-store';
import { createActionArgs } from '@/lib/test-utils';
import { getPreferredStoreId, updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { lookupStoreFresh, rememberStoreMetadata } from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { selectStore } from '@/extensions/store-locator/lib/store-selection.server';
import { getAuth } from '@/middlewares/auth.server';

vi.mock('@/extensions/store-locator/lib/api/preferred-store.server', () => ({
    getPreferredStoreId: vi.fn(),
    updatePreferredStoreId: vi.fn(),
}));
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({
    lookupStoreFresh: vi.fn(),
    rememberStoreMetadata: vi.fn(),
}));
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({ selectStore: vi.fn() }));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('save-default-store action', () => {
    let context: RouterContextProvider;
    const args = (fields: Record<string, string> = {}, headers: HeadersInit = { Origin: 'https://example.com' }) => {
        const body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.set(key, value);
        return createActionArgs<Route.ActionArgs>(
            new Request('https://example.com/action/save-default-store', { method: 'POST', headers, body }),
            context,
            { pattern: '' }
        );
    };

    beforeEach(() => {
        vi.resetAllMocks();
        context = new RouterContextProvider();
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered' } as never);
        vi.mocked(lookupStoreFresh).mockResolvedValue({
            store: { id: 'Store-1', inventoryId: 'inv' },
            eligible: true,
        } as never);
        vi.mocked(getPreferredStoreId).mockResolvedValue('Store-1');
    });

    test('saves, reads back and never touches the active selection', async () => {
        const result = await action(args({ storeId: 'Store-1' }));
        expect(updatePreferredStoreId).toHaveBeenCalledWith(context, 'Store-1');
        expect(result.data).toEqual({ success: true, preferredStoreId: 'Store-1' });
        expect(selectStore).not.toHaveBeenCalled();
    });

    test('rejects a foreign origin before any work', async () => {
        const result = await action(args({ storeId: 'Store-1' }, { Origin: 'https://foreign.example' }));
        expect(result.init?.status).toBe(403);
        expect(updatePreferredStoreId).not.toHaveBeenCalled();
    });

    test('guests get 401 SIGN_IN_REQUIRED', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
        const result = await action(args({ storeId: 'Store-1' }));
        expect(result.init?.status).toBe(401);
        expect(result.data).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
        expect(updatePreferredStoreId).not.toHaveBeenCalled();
    });

    test.each([undefined, ' ', 'a,b', ' Store-1'])('rejects invalid store id %j', async (id) => {
        const result = await action(args(id === undefined ? {} : { storeId: id }));
        expect(result.init?.status).toBe(400);
        expect(updatePreferredStoreId).not.toHaveBeenCalled();
    });

    test('unknown store answers 404 without writing', async () => {
        vi.mocked(lookupStoreFresh).mockResolvedValue({ store: null, eligible: false });
        const result = await action(args({ storeId: 'Store-1' }));
        expect(result.init?.status).toBe(404);
        expect(updatePreferredStoreId).not.toHaveBeenCalled();
    });

    test('existing store that cannot serve pickup answers 422 without writing', async () => {
        vi.mocked(lookupStoreFresh).mockResolvedValue({ store: { id: 'Store-1' }, eligible: false } as never);
        const result = await action(args({ storeId: 'Store-1' }));
        expect(result.init?.status).toBe(422);
        expect(result.data).toMatchObject({ success: false, code: 'STORE_NOT_ELIGIBLE' });
        expect(updatePreferredStoreId).not.toHaveBeenCalled();
    });

    test('warms the store metadata cache after a confirmed save', async () => {
        await action(args({ storeId: 'Store-1' }));
        expect(rememberStoreMetadata).toHaveBeenCalledWith(context, { id: 'Store-1', inventoryId: 'inv' });
    });

    test('a failed write answers 502 and never reports success', async () => {
        vi.mocked(updatePreferredStoreId).mockRejectedValue(new Error('boom'));
        const result = await action(args({ storeId: 'Store-1' }));
        expect(result.init?.status).toBe(502);
        expect(result.data).toMatchObject({ success: false, code: 'DEFAULT_SAVE_FAILED' });
    });

    test('a readback that does not match answers 502', async () => {
        vi.mocked(getPreferredStoreId).mockResolvedValue('Other');
        const result = await action(args({ storeId: 'Store-1' }));
        expect(result.init?.status).toBe(502);
    });

    test('rethrows token invalidation', async () => {
        vi.mocked(updatePreferredStoreId).mockRejectedValue(new AuthTokenInvalidError());
        await expect(action(args({ storeId: 'Store-1' }))).rejects.toBeInstanceOf(AuthTokenInvalidError);
    });
});
