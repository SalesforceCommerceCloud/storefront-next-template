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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBasketAction, BasketAction } from './basket-action.server';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import { createActionArgs, expectStatus } from '@/lib/test-utils';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { ApiError } from '@/scapi';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';

vi.mock('@/middlewares/basket.server');
vi.mock('@/lib/api-clients.server');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockBasket = { basketId: 'basket-123', productItems: [] };
const mockClients = { shopperBasketsV2: {} };

describe('createBasketAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: mockBasket, snapshot: null } as any);
        vi.mocked(createApiClients).mockReturnValue(mockClients as any);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
    });

    /** Create a POST action with a simple string parser and the given handler. */
    function buildAction(handler: (params: any) => Promise<any>) {
        return createBasketAction(
            {
                method: 'POST',
                action: BasketAction.CartItemRemove,
                parse: (fd) => ({ itemId: fd.get('itemId') as string }),
            },
            handler
        );
    }

    /** Send a POST request to the action with the given form data. */
    function postFormData(action: ReturnType<typeof buildAction>, data: Record<string, string> = { itemId: '123' }) {
        const request = createFormDataRequest('http://localhost/test', 'POST', data);
        return action(createActionArgs(request, {} as any, { pattern: '/test' }));
    }

    it('returns 405 when request method does not match', async () => {
        const action = buildAction(() => Promise.resolve(mockBasket as any));
        const request = createFormDataRequest('http://localhost/test', 'PATCH', { itemId: '123' });
        const result = await action(createActionArgs(request, {} as any, { pattern: '/test' }));

        expectStatus(result, 405);
        expect(result.data.success).toBe(false);
        expect(getBasket).not.toHaveBeenCalled();
    });

    it('returns 404 when no basket is found', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: null, snapshot: null } as any);
        const result = await postFormData(buildAction(() => Promise.resolve(mockBasket as any)));

        expectStatus(result, 404);
        expect(result.data.success).toBe(false);
        expect(createApiClients).not.toHaveBeenCalled();
    });

    it('calls updateBasketResource and wraps Basket result as success', async () => {
        const updatedBasket = { basketId: 'basket-123', productItems: [{ itemId: 'item-1' }] };
        const handler = vi.fn(() => Promise.resolve(updatedBasket as any));
        const result = await postFormData(buildAction(handler));

        expect(result.init).toBeNull();
        expect(result.data).toEqual({ success: true, basket: updatedBasket });
        expect(updateBasketResource).toHaveBeenCalledWith(expect.anything(), updatedBasket);
        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({ input: { itemId: '123' }, basketId: 'basket-123' })
        );
    });

    it('passes through data() returned by handler', async () => {
        const { data } = await import('react-router');
        const result = await postFormData(
            buildAction(() =>
                Promise.resolve(data({ success: false, error: { message: 'custom' } } as any, { status: 422 }))
            )
        );

        expectStatus(result, 422);
        expect(result.data).toEqual({ success: false, error: { message: 'custom' } });
        expect(updateBasketResource).not.toHaveBeenCalled();
    });

    it('returns 500 when handler throws a non-API error', async () => {
        const result = await postFormData(buildAction(() => Promise.reject(new Error('API failure'))));

        expectStatus(result, 500);
        expect(result.data.success).toBe(false);
    });

    it('preserves a real shared confirmation handoff without fabricating auth recovery', async () => {
        const change = {
            success: false as const,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' as const,
            current: { storeId: 'A' },
            candidate: { storeId: 'B' },
        };
        const result = await postFormData(
            buildAction(() => Promise.reject(new CommerceContextError(change.code, 409, { change })))
        );
        expectStatus(result, 409);
        expect(result.data).toMatchObject(change);
        expect(result.data.error?.code).toBe(change.code);
        expect(result.data.error?.message).not.toBe(change.code);
        expect(result.data).not.toHaveProperty('recovery');
        expect(result.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' });
        expect(updateBasketResource).not.toHaveBeenCalled();
    });

    /** Build an ApiError with the given HTTP status. */
    const apiError = (status: number) =>
        new ApiError({
            status,
            statusText: 'Test Error',
            headers: new Headers(),
            body: { type: '', title: '', detail: 'boom' },
            rawBody: '{}',
            url: 'https://api.example.com/test',
            method: 'POST',
        });

    it('passes a thrown SCAPI 4xx status through instead of masking it as 500', async () => {
        // Regression: an unknown coupon code makes SCAPI throw a 400, which the
        // catch-all previously reported as a 500 in error-rate monitoring.
        const result = await postFormData(buildAction(() => Promise.reject(apiError(400))));

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
    });

    it('still returns 500 when SCAPI throws a 5xx', async () => {
        const result = await postFormData(buildAction(() => Promise.reject(apiError(503))));

        expectStatus(result, 500);
        expect(result.data.success).toBe(false);
    });

    it('returns 400 when parse throws on malformed input', async () => {
        const action = createBasketAction(
            {
                method: 'POST',
                action: BasketAction.CartItemRemove,
                parse: () => JSON.parse('not valid json'),
            },
            () => Promise.resolve(mockBasket as any)
        );
        const result = await postFormData(action);

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
    });
});
