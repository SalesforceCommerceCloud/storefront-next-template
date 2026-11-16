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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { getShopperContextHelpers } from './shopper-context.server';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { invalidateAuthenticatedCommerce } from '@/lib/auth/commerce-context.server';
import { ApiError } from '@/scapi';

vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));

const patch = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    patch.mockResolvedValueOnce({ data: { customerGroupIds: ['registered-only'] } }).mockResolvedValue({ data: {} });
    vi.mocked(createApiClients).mockReturnValue({
        shopperContext: { updateShopperContext: patch },
    } as unknown as ReturnType<typeof createApiClients>);
    vi.mocked(getAuth).mockReturnValue({
        usid: 'first-usid',
        customerId: 'first-shopper',
        userType: 'registered',
        accessToken: 'first-token',
    } as ReturnType<typeof getAuth>);
});

describe('native context authentication scope', () => {
    it('preserves validated creation defaults when the native context is missing', async () => {
        patch.mockReset().mockRejectedValueOnce(
            new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: { type: 'https://example.com/shopper-context-not-found', title: 'Missing', detail: 'Missing' },
                rawBody: '',
                url: 'https://example.com',
                method: 'PATCH',
            })
        );
        const native = { sourceCode: 'campaign', assignmentQualifiers: { store: 'store-a' } };
        const create = vi.fn().mockResolvedValue({});
        vi.mocked(createApiClients).mockReturnValue({
            shopperContext: {
                updateShopperContext: patch,
                createShopperContext: create,
                getShopperContext: vi.fn().mockResolvedValue({ data: native }),
            },
        } as unknown as ReturnType<typeof createApiClients>);

        const helpers = getShopperContextHelpers(new RouterContextProvider(), 'first-usid');
        expect(
            await helpers.update(
                { assignmentQualifiers: { store: 'store-a' } },
                { initialContext: { sourceCode: 'campaign' } }
            )
        ).toEqual(native);
        expect(create).toHaveBeenCalledWith({ params: { path: { usid: 'first-usid' } }, body: native });
    });

    it.each([
        'usid',
        'customerId',
        'userType',
        'accessToken',
    ] as const)('discards the snapshot when %s changes', async (key) => {
        const ctx = new RouterContextProvider();
        const first = getShopperContextHelpers(ctx, 'first-usid');
        expect((await first.resolve()).customerGroupIds).toEqual(['registered-only']);
        const next = { ...getAuth(ctx), [key]: key === 'userType' ? 'guest' : 'second-value' };
        vi.mocked(getAuth).mockReturnValue(next);
        const second = getShopperContextHelpers(ctx, next.usid ?? '');
        expect(second).not.toBe(first);
        expect(await second.resolve()).toEqual({});
        await expect(first.update({ assignmentQualifiers: { store: 'old' } })).rejects.toMatchObject({
            code: 'STORE_CONTEXT_IDENTITY_CHANGED',
        });
        expect(patch).toHaveBeenCalledTimes(2);
        expect(patch.mock.calls[1][0].params.path.usid).toBe(next.usid);
    });

    it('clears native helper state synchronously on auth destruction', async () => {
        const ctx = new RouterContextProvider();
        const first = getShopperContextHelpers(ctx, 'first-usid');
        await first.resolve();
        invalidateAuthenticatedCommerce(ctx);
        const second = getShopperContextHelpers(ctx, 'first-usid');
        expect(second).not.toBe(first);
        expect(await second.resolve()).toEqual({});
    });
});
