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
import { describe, test, expect } from 'vitest';
import { isCouponApplied, getCouponStatusError } from './coupon-status';
import { ErrorCode } from '@/lib/error-codes';

describe('isCouponApplied', () => {
    test.each(['applied', 'adhoc'] as const)('treats %s as applied', (statusCode) => {
        expect(isCouponApplied({ statusCode })).toBe(true);
    });

    test.each([
        'no_applicable_promotion',
        'no_active_promotion',
        'coupon_code_unknown',
        'coupon_disabled',
        'coupon_already_in_basket',
        'coupon_code_already_in_basket',
        'coupon_code_already_redeemed',
        'redemption_limit_exceeded',
        'customer_redemption_limit_exceeded',
        'timeframe_redemption_limit_exceeded',
    ] as const)('treats %s as not applied', (statusCode) => {
        expect(isCouponApplied({ statusCode })).toBe(false);
    });

    test('treats a missing statusCode as not applied', () => {
        expect(isCouponApplied({})).toBe(false);
    });
});

describe('getCouponStatusError', () => {
    test.each(['applied', 'adhoc'] as const)('returns null (no error) for %s', (statusCode) => {
        expect(getCouponStatusError(statusCode)).toBeNull();
    });

    // Valid-but-ineligible, unknown, and disabled codes must be indistinguishable
    // so the form can't be used to enumerate which codes exist (same 400 + same
    // invalidCode message for all three — the same message the action returns
    // when SCAPI throws a 4xx for a code it rejects outright).
    test.each([
        'no_applicable_promotion',
        'coupon_code_unknown',
        'coupon_disabled',
    ] as const)('maps %s to an INVALID_INPUT invalidCode error (no enumeration oracle)', (statusCode) => {
        expect(getCouponStatusError(statusCode)).toEqual({
            code: ErrorCode.INVALID_INPUT,
            messageKey: 'cart:promoCode.errors.invalidCode',
        });
    });

    test('maps no_active_promotion to an EXPIRED error', () => {
        expect(getCouponStatusError('no_active_promotion')).toEqual({
            code: ErrorCode.EXPIRED,
            messageKey: 'cart:promoCode.errors.expiredCode',
        });
    });

    test.each([
        'coupon_already_in_basket',
        'coupon_code_already_in_basket',
    ] as const)('maps %s to an already-applied CONFLICT error', (statusCode) => {
        expect(getCouponStatusError(statusCode)).toEqual({
            code: ErrorCode.CONFLICT,
            messageKey: 'cart:promoCode.errors.alreadyApplied',
        });
    });

    test.each([
        'coupon_code_already_redeemed',
        'redemption_limit_exceeded',
        'customer_redemption_limit_exceeded',
        'timeframe_redemption_limit_exceeded',
    ] as const)('maps redemption-limit status %s to a generic CONFLICT error', (statusCode) => {
        expect(getCouponStatusError(statusCode)).toEqual({
            code: ErrorCode.CONFLICT,
            messageKey: 'cart:promoCode.errors.generic',
        });
    });

    test('maps an unknown statusCode to a generic INVALID_INPUT error (4xx, never a 500)', () => {
        // Cast through the parameter type to exercise the `default` branch for a
        // status outside the known SCAPI union (e.g. a future/unmapped code).
        const unknownStatus = 'some_future_status' as Parameters<typeof getCouponStatusError>[0];
        expect(getCouponStatusError(unknownStatus)).toEqual({
            code: ErrorCode.INVALID_INPUT,
            messageKey: 'cart:promoCode.errors.generic',
        });
    });
});
