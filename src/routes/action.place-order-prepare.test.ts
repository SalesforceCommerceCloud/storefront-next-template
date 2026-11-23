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

import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { InventoryQuantityError } from '@/scapi';
import { LocalInventoryError } from '@/lib/product/local-inventory-error';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action as actionImpl } from './action.place-order-prepare';

const action = actionImpl as unknown as (args: {
    request: Request;
    context: never;
    params: object;
}) => Promise<Response>;

const validatePlaceOrderPreconditionsMock = vi.fn();
const calculateBasketForOrderMock = vi.fn();
const syncPaymentInstrumentAmountMock = vi.fn();
const getBasketMock = vi.fn();
// @sfdc-extension-line SFDC_EXT_MULTISHIP
const resolveEmptyShipmentsMock = vi.fn();

vi.mock('@/lib/checkout/place-order-orchestration.server', () => ({
    validatePlaceOrderPreconditions: (...args: unknown[]) => validatePlaceOrderPreconditionsMock(...args),
    calculateBasketForOrder: (...args: unknown[]) => calculateBasketForOrderMock(...args),
    syncPaymentInstrumentAmount: (...args: unknown[]) => syncPaymentInstrumentAmountMock(...args),
}));

vi.mock('@/middlewares/basket.server', () => ({
    getBasket: (...args: unknown[]) => getBasketMock(...args),
}));

// @sfdc-extension-block-start SFDC_EXT_MULTISHIP
vi.mock('@/extensions/multiship/lib/api/basket.server', () => ({
    resolveEmptyShipments: (...args: unknown[]) => resolveEmptyShipmentsMock(...args),
}));
// @sfdc-extension-block-end SFDC_EXT_MULTISHIP

vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

const buildRequest = (method = 'POST'): Request => new Request('https://test/action/place-order-prepare', { method });

const ctx = {} as never;

describe('action.place-order-prepare', () => {
    beforeEach(() => {
        validatePlaceOrderPreconditionsMock.mockReset();
        calculateBasketForOrderMock.mockReset();
        syncPaymentInstrumentAmountMock.mockReset();
        getBasketMock.mockReset();
        // @sfdc-extension-line SFDC_EXT_MULTISHIP
        resolveEmptyShipmentsMock.mockReset();

        getBasketMock.mockResolvedValue({ current: { basketId: 'b-1' } });
        validatePlaceOrderPreconditionsMock.mockReturnValue({
            ok: true,
            basket: { basketId: 'b-1' },
        });
        // @sfdc-extension-line SFDC_EXT_MULTISHIP
        resolveEmptyShipmentsMock.mockResolvedValue(undefined);
        calculateBasketForOrderMock.mockResolvedValue({ basketId: 'b-1' });
        syncPaymentInstrumentAmountMock.mockResolvedValue({ basketId: 'b-1' });
    });

    it('returns 405 for non-POST methods', async () => {
        const response = await action({ request: buildRequest('GET'), context: ctx, params: {} });
        expect(response.status).toBe(405);
        expect(getBasketMock).not.toHaveBeenCalled();
    });

    it('returns 200 success when basket validates and recalculates', async () => {
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(validatePlaceOrderPreconditionsMock).toHaveBeenCalledOnce();
        expect(calculateBasketForOrderMock).toHaveBeenCalledOnce();
        expect(syncPaymentInstrumentAmountMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when payment-amount sync fails (pre-extension createOrder safety)', async () => {
        syncPaymentInstrumentAmountMock.mockRejectedValue(new Error('SCAPI update failed'));
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(500);
    });

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    it('runs multiship resolution before calculating totals', async () => {
        await action({ request: buildRequest(), context: ctx, params: {} });
        expect(resolveEmptyShipmentsMock).toHaveBeenCalledOnce();
    });
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    it('forwards the validator response when validation fails', async () => {
        const failureResponse = Response.json(
            { success: false, error: 'no-basket', step: 'placeOrder' },
            { status: 400 }
        );
        validatePlaceOrderPreconditionsMock.mockReturnValue({ ok: false, response: failureResponse });

        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(400);
        expect(calculateBasketForOrderMock).not.toHaveBeenCalled();
    });

    it.each([
        [new InventoryQuantityError(), 400, 'INVALID_INPUT'],
        [new LocalInventoryError('LOCAL_STOCK_UNAVAILABLE', 422), 422, 'OUT_OF_STOCK'],
        [new LocalInventoryError('INVALID_INVENTORY_LIST'), 503, 'OPERATION_FAILED'],
        [
            new CommerceContextError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409),
            409,
            'STORE_CHANGE_CONFIRMATION_REQUIRED',
        ],
    ])('preserves %s as HTTP %s', async (error, status, code) => {
        calculateBasketForOrderMock.mockRejectedValueOnce(error);
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(status);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ success: false, error: { code }, step: 'placeOrder' });
        expect(syncPaymentInstrumentAmountMock).not.toHaveBeenCalled();
    });

    it('preserves the shared store-change confirmation payload', async () => {
        const change = {
            success: false as const,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' as const,
            current: { storeId: 'A' },
            candidate: { storeId: 'B' },
        };
        calculateBasketForOrderMock.mockRejectedValueOnce(new CommerceContextError(change.code, 409, { change }));
        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body).toMatchObject({ ...change, error: { code: change.code } });
        expect(body).not.toHaveProperty('recovery');
    });

    it('returns 500 when calculate throws', async () => {
        calculateBasketForOrderMock.mockRejectedValue(new Error('SCAPI down'));

        const response = await action({ request: buildRequest(), context: ctx, params: {} });
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toEqual(expect.objectContaining({ code: 'OPERATION_FAILED' }));
    });
});
