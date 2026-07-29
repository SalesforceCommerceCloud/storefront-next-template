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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { action } from './action.promo-code-add';
import { ApiError } from '@/scapi';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';

vi.mock('@/middlewares/basket.server');

const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

vi.mock('@/lib/api-clients.server');
// `t` echoes the key so message assertions read as `cart:promoCode.errors.*`,
// and is a stable spy so tests can assert the action interpolates the shopper's
// own code (the `{{code}}` arg) without coupling to the localized template text.
// `getTranslationMock` is spied too, so we can assert the action passes the
// request `context` through — bare `getTranslation()` returns the uninitialized
// module-global instance and shopper-facing keys resolve to a generic fallback
// (W-23127951 follow-up).
const tMock = vi.fn((key: string, _options?: Record<string, unknown>) => key);
const getTranslationMock = vi.fn((_context?: unknown) => ({ t: tMock }));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: (context?: unknown) => getTranslationMock(context),
}));
vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
    };
});
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

import { createFormDataRequest } from '@/test-utils/request-helpers';
import { createActionArgs, expectStatus } from '@/lib/test-utils';
import { resourceRoutes } from '@/route-paths';

describe('action.promo-code-add', () => {
    const emptyBasket = { basketId: 'test-basket-123', couponItems: [] };

    const mockClients = {
        shopperBasketsV2: {
            addCouponToBasket: vi.fn(),
        },
    };

    const submit = (code: string) =>
        action(
            createActionArgs(
                createFormDataRequest(`http://localhost${resourceRoutes.promoCodeAdd}`, 'POST', { promoCode: code }),
                {} as any,
                { pattern: resourceRoutes.promoCodeAdd }
            )
        );

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: emptyBasket, snapshot: null } as any);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
        vi.mocked(createApiClients).mockReturnValue(mockClients as any);
    });

    test('succeeds when SCAPI returns an applied coupon', async () => {
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [{ couponItemId: 'ci-1', code: 'SAVE10', statusCode: 'applied', valid: true }],
            },
        });

        const result = await submit('SAVE10');

        expect(result.data.success).toBe(true);
        expect(updateBasketResource).toHaveBeenCalledTimes(1);
    });

    test('succeeds for an adhoc (CSR-issued) coupon', async () => {
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [{ couponItemId: 'ci-1', code: 'CSR50', statusCode: 'adhoc', valid: true }],
            },
        });

        const result = await submit('CSR50');

        expect(result.data.success).toBe(true);
    });

    test('fails generically when the coupon is valid but no cart item qualifies', async () => {
        // SCAPI returns HTTP 200 and parks the coupon on the basket, but no discount applies.
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [
                    { couponItemId: 'ci-1', code: 'PRODUCT', statusCode: 'no_applicable_promotion', valid: true },
                ],
            },
        });

        const result = await submit('PRODUCT');

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('INVALID_INPUT');
        // A valid-but-ineligible code must return the SAME message as an unknown
        // code — whether SCAPI parks it (this test) or throws a 4xx (see the
        // SCAPI-throws test below) — so the form can't be used to enumerate which
        // coupon codes exist.
        expect(result.data.error?.message).toBe('cart:promoCode.errors.invalidCode');
        // The shopper's own submitted code is interpolated into the message
        // (the `{{code}}` placeholder), not SCAPI's raw detail.
        expect(tMock).toHaveBeenCalledWith('cart:promoCode.errors.invalidCode', { code: 'PRODUCT' });
        // The basket is NOT committed as a success.
        expect(updateBasketResource).not.toHaveBeenCalled();
        // Translations must resolve against the request-scoped i18next instance,
        // so the action must pass `context` to getTranslation (not call it bare).
        expect(getTranslationMock).toHaveBeenCalledWith(expect.anything());
    });

    test('fails with the same message for a parked unknown coupon (no enumeration oracle)', async () => {
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [{ couponItemId: 'ci-1', code: 'BOGUS', statusCode: 'coupon_code_unknown', valid: false }],
            },
        });

        const result = await submit('BOGUS');

        expectStatus(result, 400);
        expect(result.data.error?.code).toBe('INVALID_INPUT');
        expect(result.data.error?.message).toBe('cart:promoCode.errors.invalidCode');
    });

    test('fails with the same message when SCAPI throws a 4xx for the code (no enumeration oracle)', async () => {
        // SCAPI doesn't park every bad code — for an unknown code it can throw a
        // 400 whose `detail` names the code verbatim. The action must convert
        // that into the SAME invalidCode message a parked ineligible code returns,
        // interpolating the shopper's OWN submitted code — never SCAPI's raw
        // `detail` — so the two paths are indistinguishable.
        const apiError = new ApiError({
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            body: {
                type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/coupon-code-invalid',
                title: 'Coupon Code Invalid',
                detail: "Coupon code 'BOGUS' is invalid.",
            },
            rawBody: JSON.stringify({ detail: "Coupon code 'BOGUS' is invalid." }),
            url: 'https://example.com/baskets/test-basket-123/coupons',
            method: 'POST',
        });
        mockClients.shopperBasketsV2.addCouponToBasket.mockRejectedValue(apiError);

        const result = await submit('BOGUS');

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('INVALID_INPUT');
        expect(result.data.error?.message).toBe('cart:promoCode.errors.invalidCode');
        // The message is built from the localized template + the shopper's own
        // code, NOT from SCAPI's raw `detail`.
        expect(tMock).toHaveBeenCalledWith('cart:promoCode.errors.invalidCode', { code: 'BOGUS' });
        expect(updateBasketResource).not.toHaveBeenCalled();
    });

    test('lets a SCAPI 5xx propagate (still surfaced as a server error)', async () => {
        // A server-side fault is NOT a coupon-rejection oracle concern — it must
        // not be masked as an invalid-code 400. The basket-action wrapper maps it
        // to a 500.
        const apiError = new ApiError({
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            body: { type: '', title: 'Internal Server Error', detail: 'boom' },
            rawBody: JSON.stringify({ detail: 'boom' }),
            url: 'https://example.com/baskets/test-basket-123/coupons',
            method: 'POST',
        });
        mockClients.shopperBasketsV2.addCouponToBasket.mockRejectedValue(apiError);

        const result = await submit('SAVE10');

        expectStatus(result, 500);
        expect(result.data.success).toBe(false);
    });

    test('fails with a 410 (not a 500) for an expired coupon', async () => {
        // Regression: no_active_promotion -> EXPIRED previously fell through to a
        // 500, misreporting an expired-coupon business outcome as a server fault.
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [
                    { couponItemId: 'ci-1', code: 'EXPIRED', statusCode: 'no_active_promotion', valid: true },
                ],
            },
        });

        const result = await submit('EXPIRED');

        expectStatus(result, 410);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('EXPIRED');
        expect(result.data.error?.message).toBe('cart:promoCode.errors.expiredCode');
    });

    test('fails with a 409 (not a 500) when a redemption limit is exceeded', async () => {
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [
                    { couponItemId: 'ci-1', code: 'MAXED', statusCode: 'redemption_limit_exceeded', valid: true },
                ],
            },
        });

        const result = await submit('MAXED');

        expectStatus(result, 409);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('CONFLICT');
    });

    test('identifies the newly-added coupon when the basket already has applied coupons', async () => {
        // An applied coupon is already on the basket; the new one is ineligible.
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'test-basket-123',
                couponItems: [{ couponItemId: 'ci-existing', code: 'OLD', statusCode: 'applied', valid: true }],
            },
            snapshot: null,
        } as any);
        mockClients.shopperBasketsV2.addCouponToBasket.mockResolvedValue({
            data: {
                basketId: 'test-basket-123',
                couponItems: [
                    { couponItemId: 'ci-existing', code: 'OLD', statusCode: 'applied', valid: true },
                    { couponItemId: 'ci-new', code: 'PRODUCT', statusCode: 'no_applicable_promotion', valid: true },
                ],
            },
        });

        const result = await submit('PRODUCT');

        expect(result.data.success).toBe(false);
        expect(result.data.error?.message).toBe('cart:promoCode.errors.invalidCode');
    });

    test('rejects an empty promo code before calling SCAPI', async () => {
        const result = await submit('');

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
        expect(mockClients.shopperBasketsV2.addCouponToBasket).not.toHaveBeenCalled();
    });
});
