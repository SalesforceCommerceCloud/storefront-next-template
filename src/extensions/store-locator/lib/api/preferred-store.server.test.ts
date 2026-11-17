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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getPreferredStoreId, updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';

const mocks = vi.hoisted(() => ({ getCustomer: vi.fn(), updateCustomer: vi.fn() }));

vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({ shopperCustomers: mocks })),
}));

describe('preferred store profile API', () => {
    let context: RouterContextProvider;

    beforeEach(() => {
        vi.resetAllMocks();
        context = new RouterContextProvider();
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'session-customer' });
        mocks.getCustomer.mockResolvedValue({ data: {} });
        mocks.updateCustomer.mockResolvedValue({ data: { preferredStoreId: 'ignored-response' } });
    });

    it.each([
        { userType: 'guest' as const },
        { userType: 'guest' as const, customerId: 'guest-customer' },
        {},
    ])('skips reads for a nonregistered session %j', async (session) => {
        vi.mocked(getAuth).mockReturnValue(session);
        await expect(getPreferredStoreId(context)).resolves.toBeNull();
        expect(getAuth).toHaveBeenCalledExactlyOnceWith(context);
        expect(createApiClients).not.toHaveBeenCalled();
    });

    it.each([
        { userType: 'guest' as const },
        { userType: 'guest' as const, customerId: 'guest-customer' },
        {},
    ])('rejects writes for a nonregistered session %j before creating clients', async (session) => {
        vi.mocked(getAuth).mockReturnValue(session);
        await expect(updatePreferredStoreId(context, 'store-1')).rejects.toMatchObject({ status: 401 });
        expect(getAuth).toHaveBeenCalledExactlyOnceWith(context);
        expect(createApiClients).not.toHaveBeenCalled();
    });

    it.each([undefined, '', ' \t\n'])('rejects registered sessions with invalid customerId %j', async (customerId) => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId });
        await expect(getPreferredStoreId(context)).rejects.toBeInstanceOf(Response);
        await expect(getPreferredStoreId(context)).rejects.toMatchObject({ status: 401 });
        await expect(updatePreferredStoreId(context, null)).rejects.toBeInstanceOf(Response);
        await expect(updatePreferredStoreId(context, null)).rejects.toMatchObject({ status: 401 });
        expect(createApiClients).not.toHaveBeenCalled();
    });

    it.each([
        {},
        { preferredStoreId: undefined },
        { preferredStoreId: null },
        { preferredStoreId: '' },
        { c_preferredStoreId: 'legacy-store' },
        { preferredStoreId: undefined, c_preferredStoreId: 'legacy-store' },
        { preferredStoreId: null, c_preferredStoreId: 'legacy-store' },
        { preferredStoreId: '', c_preferredStoreId: 'legacy-store' },
    ])('reads an unset preference as null %j', async (profile) => {
        mocks.getCustomer.mockResolvedValue({ data: profile });
        await expect(getPreferredStoreId(context)).resolves.toBeNull();
        expect(createApiClients).toHaveBeenCalledExactlyOnceWith(context);
        expect(mocks.getCustomer).toHaveBeenCalledExactlyOnceWith({
            params: { path: { customerId: 'session-customer' }, query: { expand: ['none'] } },
        });
        expect(mocks.updateCustomer).not.toHaveBeenCalled();
    });

    it.each([
        'deleted-store',
        ' Store-ID ',
        'a'.repeat(256),
    ])('returns ID %j unchanged without writes or lookup', async (storeId) => {
        mocks.getCustomer.mockResolvedValue({
            data: { preferredStoreId: storeId, c_preferredStoreId: 'legacy-store' },
        });
        await expect(getPreferredStoreId(context)).resolves.toBe(storeId);
        expect(mocks.getCustomer).toHaveBeenCalledExactlyOnceWith({
            params: { path: { customerId: 'session-customer' }, query: { expand: ['none'] } },
        });
        expect(mocks.updateCustomer).not.toHaveBeenCalled();
    });

    it.each(
        [0, false, {}, [], ['store-1'], ' \t\n', 'a'.repeat(257)].map((value) => ({ value }))
    )('rejects malformed stored value %j', async ({ value }) => {
        mocks.getCustomer.mockResolvedValue({ data: { preferredStoreId: value, c_preferredStoreId: 'legacy-store' } });
        await expect(getPreferredStoreId(context)).rejects.toBeInstanceOf(TypeError);
        expect(mocks.getCustomer).toHaveBeenCalledTimes(1);
        expect(mocks.updateCustomer).not.toHaveBeenCalled();
    });

    it.each([
        'store-1',
        ' Store-ID ',
        'a'.repeat(256),
        null,
    ])('patches only the preference for value %j', async (storeId) => {
        await expect(updatePreferredStoreId(context, storeId)).resolves.toBeUndefined();
        expect(getAuth).toHaveBeenCalledExactlyOnceWith(context);
        expect(createApiClients).toHaveBeenCalledExactlyOnceWith(context);
        expect(mocks.updateCustomer).toHaveBeenCalledExactlyOnceWith({
            params: { path: { customerId: 'session-customer' } },
            body: { preferredStoreId: storeId },
        });
        expect(mocks.getCustomer).not.toHaveBeenCalled();
    });

    it.each(
        ['', ' \t\n', 'a'.repeat(257), undefined, 0, false, {}, [], ['store-1']].map((value) => ({ value }))
    )('rejects invalid write value %j before creating clients', async ({ value }) => {
        await expect(updatePreferredStoreId(context, value as string)).rejects.toBeInstanceOf(TypeError);
        expect(createApiClients).not.toHaveBeenCalled();
        expect(mocks.getCustomer).not.toHaveBeenCalled();
        expect(mocks.updateCustomer).not.toHaveBeenCalled();
    });

    it.each([
        new Error('network'),
        new Response('Unauthorized', { status: 401 }),
        new Error('metadata missing'),
    ])('propagates client rejection unchanged: %j', async (error) => {
        mocks.getCustomer.mockRejectedValue(error);
        await expect(getPreferredStoreId(context)).rejects.toBe(error);
        mocks.updateCustomer.mockRejectedValue(error);
        await expect(updatePreferredStoreId(context, 'store-1')).rejects.toBe(error);
    });

    it('propagates auth middleware errors without creating clients', async () => {
        const error = new Error('getAuth must be used within the Commerce API middleware');
        vi.mocked(getAuth).mockImplementation(() => {
            throw error;
        });
        await expect(getPreferredStoreId(context)).rejects.toBe(error);
        await expect(updatePreferredStoreId(context, null)).rejects.toBe(error);
        expect(createApiClients).not.toHaveBeenCalled();
    });

    it('propagates client creation errors', async () => {
        const error = new Error('Site context not initialized');
        vi.mocked(createApiClients).mockImplementation(() => {
            throw error;
        });
        await expect(getPreferredStoreId(context)).rejects.toBe(error);
        await expect(updatePreferredStoreId(context, null)).rejects.toBe(error);
        expect(mocks.getCustomer).not.toHaveBeenCalled();
        expect(mocks.updateCustomer).not.toHaveBeenCalled();
    });
});
