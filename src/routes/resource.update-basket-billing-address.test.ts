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
import { action as actionImpl } from './resource.update-basket-billing-address';

const action = actionImpl as unknown as (args: {
    request: Request;
    context: never;
    params: object;
}) => Promise<Response>;

const getBasketMock = vi.fn();
const updateBillingAddressForBasketMock = vi.fn();

vi.mock('@/middlewares/basket.server', () => ({
    getBasket: (...args: unknown[]) => getBasketMock(...args),
}));

vi.mock('@/lib/api/basket.server', () => ({
    updateBillingAddressForBasket: (...args: unknown[]) => updateBillingAddressForBasketMock(...args),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

const validAddress = {
    firstName: 'Jane',
    lastName: 'Smith',
    address1: '456 Billing Ave',
    city: 'Los Angeles',
    stateCode: 'CA',
    postalCode: '90001',
    countryCode: 'US',
};

const buildRequest = (method = 'POST', body: unknown = validAddress): Request => {
    const isBodyMethod = method !== 'GET' && method !== 'HEAD';
    return new Request('https://test/resource/update-basket-billing-address', {
        method,
        ...(isBodyMethod && {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    });
};

const ctx = {} as never;

describe('resource.update-basket-billing-address', () => {
    beforeEach(() => {
        getBasketMock.mockReset();
        updateBillingAddressForBasketMock.mockReset();

        getBasketMock.mockResolvedValue({
            current: { basketId: 'b-1' },
            snapshot: { basketId: 'b-1' },
        });
        updateBillingAddressForBasketMock.mockResolvedValue({ basketId: 'b-1' });
    });

    it('returns 405 for non-POST methods', async () => {
        const response = await action({ request: buildRequest('GET'), context: ctx, params: {} });
        expect(response.status).toBe(405);
        expect(getBasketMock).not.toHaveBeenCalled();
    });

    it('returns 200 on valid POST', async () => {
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(updateBillingAddressForBasketMock).toHaveBeenCalledWith(
            ctx,
            'b-1',
            expect.objectContaining({ firstName: 'Jane', city: 'Los Angeles' })
        );
    });

    it('returns 400 on invalid payload (missing required fields)', async () => {
        const badBody = { firstName: 'Jane' }; // missing lastName, address1, city, stateCode, postalCode, countryCode
        const response = await action({ request: buildRequest('POST', badBody), context: ctx, params: {} });
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.step).toBe('billingAddress');
        expect(updateBillingAddressForBasketMock).not.toHaveBeenCalled();
    });

    it('returns 400 when basket is not available', async () => {
        getBasketMock.mockResolvedValue({ current: null, snapshot: null });
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.step).toBe('billingAddress');
        expect(updateBillingAddressForBasketMock).not.toHaveBeenCalled();
    });

    it('returns 500 when updateBillingAddressForBasket throws', async () => {
        updateBillingAddressForBasketMock.mockRejectedValue(new Error('SCAPI unavailable'));
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.step).toBe('billingAddress');
        expect(body.error).toEqual(expect.objectContaining({ code: 'OPERATION_FAILED' }));
    });
});
