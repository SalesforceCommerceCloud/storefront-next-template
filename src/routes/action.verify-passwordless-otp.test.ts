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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

import { action } from './action.verify-passwordless-otp';
import { createApiClients } from '@/lib/api-clients.server';
import { getAuth, updateAuth } from '@/middlewares/auth.server';
import { calculateBasket, getBasketCurrency, mergeBasket } from '@/lib/api/basket.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { expectStatus } from '@/lib/test-utils';
import { getCustomerProfileForCheckout } from '@/lib/api/customer.server';

vi.mock('@/lib/api-clients.server');
vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/api/basket.server');
vi.mock('@/middlewares/basket.server');
vi.mock('@salesforce/storefront-next-runtime/i18n');
vi.mock('@/middlewares/auth.utils');
vi.mock('@/lib/api/customer.server');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockCreateApiClients = vi.mocked(createApiClients);
const mockGetAuth = vi.mocked(getAuth);
const mockUpdateAuth = vi.mocked(updateAuth);
const mockCalculateBasket = vi.mocked(calculateBasket);
const mockGetBasketCurrency = vi.mocked(getBasketCurrency);
const mockMergeBasket = vi.mocked(mergeBasket);
const mockGetBasket = vi.mocked(getBasket);
const mockUpdateBasketResource = vi.mocked(updateBasketResource);
const mockGetTranslation = vi.mocked(getTranslation);
const mockIsTrackingConsentEnabled = vi.mocked(isTrackingConsentEnabled);
const mockGetCustomerProfileForCheckout = vi.mocked(getCustomerProfileForCheckout);

describe('action.verify-passwordless-otp', () => {
    let mockContext: ActionFunctionArgs['context'];
    let mockExchangeToken: ReturnType<typeof vi.fn>;
    let mockUpdateCustomerForBasket: ReturnType<typeof vi.fn>;

    const createActionArgs = ({
        otpCode,
        email,
        isRegistration,
    }: { otpCode?: string; email?: string; isRegistration?: boolean } = {}): ActionFunctionArgs => {
        const formData = new FormData();
        if (otpCode !== undefined) {
            formData.append('otpCode', otpCode);
        }
        if (email !== undefined) {
            formData.append('email', email);
        }
        if (isRegistration) {
            formData.append('isRegistration', 'true');
        }

        return {
            request: new Request('http://localhost/action/verify-passwordless-otp', {
                method: 'POST',
                body: formData,
            }),
            params: {},
            context: mockContext,
            pattern: '/action/verify-passwordless-otp',
        } as ActionFunctionArgs;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {} as ActionFunctionArgs['context'];
        mockExchangeToken = vi.fn();
        mockUpdateCustomerForBasket = vi.fn();

        mockCreateApiClients.mockReturnValue({
            auth: {
                passwordless: {
                    exchangeToken: mockExchangeToken,
                },
            },
            shopperBasketsV2: {
                updateCustomerForBasket: mockUpdateCustomerForBasket,
            },
        } as any);

        // Return translation key as-is so tests can assert exact keys
        mockGetTranslation.mockReturnValue({
            t: ((key: string) => key) as any,
        } as any);

        // By default, tracking consent is treated as disabled in tests
        mockIsTrackingConsentEnabled.mockReturnValue(false);

        // By default, auth session has no customerId - reconciliation tests set this explicitly
        mockGetAuth.mockReturnValue({ customerId: undefined } as any);

        mockGetBasket.mockResolvedValue({
            current: { basketId: 'basket-1', currency: 'USD' },
        } as any);
        mockGetBasketCurrency.mockReturnValue('USD');
        mockCalculateBasket.mockResolvedValue({ basketId: 'basket-1', currency: 'USD' } as any);

        // By default, customer profile is not loaded - reconciliation tests set this explicitly
        mockGetCustomerProfileForCheckout.mockResolvedValue(null);

        // By default, updateCustomerForBasket returns the updated basket
        mockUpdateCustomerForBasket.mockResolvedValue({
            data: { basketId: 'basket-1', currency: 'USD' },
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when otpCode is missing', async () => {
        const result = await action(createActionArgs({ email: 'test@example.com' }));

        expect(result.data).toEqual({
            success: false,
            error: { code: 'REQUIRED_FIELD', message: 'OTP code is required' },
        });
        expectStatus(result, 400);
        expect(mockExchangeToken).not.toHaveBeenCalled();
    });

    it('returns error when email is missing', async () => {
        const result = await action(createActionArgs({ otpCode: '12345678' }));

        expect(result.data).toEqual({
            success: false,
            error: { code: 'REQUIRED_FIELD', message: 'Email is required' },
        });
        expectStatus(result, 400);
        expect(mockExchangeToken).not.toHaveBeenCalled();
    });

    it('returns success, updates auth, and recalculates basket on valid OTP', async () => {
        const mockTokenResponse = {
            access_token: 'access-token',
            id_token: 'id-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            refresh_token_expires_in: 7200,
            token_type: 'Bearer' as const,
            usid: 'test-usid',
            customer_id: 'customer-id',
            enc_user_id: 'enc-user-id',
            idp_access_token: 'idp-token',
            dwsid: 'dwsid',
        } as any;

        mockExchangeToken.mockResolvedValue(mockTokenResponse);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(mockExchangeToken).toHaveBeenCalledTimes(1);
        expect(mockExchangeToken).toHaveBeenCalledWith({
            pwdlessLoginToken: '12345678',
        });

        // Single updateAuth call: userType derives from the JWT inside updateAuth — no follow-up.
        expect(mockUpdateAuth).toHaveBeenCalledTimes(1);
        expect(mockUpdateAuth).toHaveBeenCalledWith(mockContext, mockTokenResponse);

        expect(mockGetBasket).toHaveBeenCalledWith(mockContext);
        expect(mockGetBasketCurrency).toHaveBeenCalledWith(mockContext, { basketId: 'basket-1', currency: 'USD' });
        expect(mockCalculateBasket).toHaveBeenCalledWith(mockContext, 'basket-1', 'USD');
        expect(mockUpdateBasketResource).toHaveBeenCalledWith(mockContext, { basketId: 'basket-1', currency: 'USD' });

        expect(result.data).toEqual({
            success: true,
            message: 'Login successful',
            tokenResponse: mockTokenResponse,
        });
    });

    it('recalculates basket after OTP auth swap to apply registered pricing', async () => {
        const mockTokenResponse = {
            access_token: 'access-token',
            id_token: 'id-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            refresh_token_expires_in: 7200,
            token_type: 'Bearer' as const,
            usid: 'test-usid',
            customer_id: 'customer-id',
            enc_user_id: 'enc-user-id',
            idp_access_token: 'idp-token',
            dwsid: 'dwsid',
        } as any;

        const basket = { basketId: 'basket-1', currency: 'USD' } as any;
        const recalculated = { basketId: 'basket-1', currency: 'USD', orderTotal: 99 } as any;

        mockExchangeToken.mockResolvedValue(mockTokenResponse);
        mockGetBasket.mockResolvedValue({ current: basket } as any);
        mockCalculateBasket.mockResolvedValue(recalculated);

        await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(mockUpdateBasketResource).toHaveBeenCalledTimes(1);
        expect(mockUpdateBasketResource).toHaveBeenCalledWith(mockContext, recalculated);
    });

    it('extracts error message from ApiError.rawBody JSON', async () => {
        const apiError = {
            rawBody: JSON.stringify({ message: 'Invalid or expired OTP code' }),
        } as any;

        mockExchangeToken.mockRejectedValue(apiError);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(result.data.success).toBe(false);
        expect(result.data.error?.message).toBe('Invalid or expired OTP code');
        expectStatus(result, 500);
    });

    it('falls back to error.message when rawBody is not present', async () => {
        const apiError = {
            message: 'Some plain error from backend',
        } as any;

        mockExchangeToken.mockRejectedValue(apiError);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(result.data.success).toBe(false);
        expect(result.data.error?.message).toBe('Some plain error from backend');
        expectStatus(result, 500);
    });

    it('uses default error message when rawBody is not valid JSON', async () => {
        const apiError = {
            rawBody: 'not-json',
        } as any;

        mockExchangeToken.mockRejectedValue(apiError);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(result.data.success).toBe(false);
        expect(result.data.error?.message).toBe('Unknown error');
        expectStatus(result, 500);
    });

    it('uses error.message as-is when it contains JSON', async () => {
        const apiError = {
            message: JSON.stringify({ message: 'OTP service temporarily unavailable' }),
        } as any;

        mockExchangeToken.mockRejectedValue(apiError);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(result.data.success).toBe(false);
        expect(result.data.error?.message).toBe('{"message":"OTP service temporarily unavailable"}');
        expectStatus(result, 500);
    });

    it('calls mergeBasket for returning users (isRegistration not set)', async () => {
        const mockTokenResponse = {
            access_token: 'access-token',
            id_token: 'id-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            refresh_token_expires_in: 7200,
            token_type: 'Bearer' as const,
            usid: 'test-usid',
            customer_id: 'customer-id',
            enc_user_id: 'enc-user-id',
            idp_access_token: 'idp-token',
            dwsid: 'dwsid',
        } as any;

        const mergedBasket = { basketId: 'basket-123', currency: 'USD', productItems: [{ id: 'item-1' }] } as any;

        mockExchangeToken.mockResolvedValue(mockTokenResponse);
        mockMergeBasket.mockResolvedValue(mergedBasket);

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'test@example.com' }));

        expect(mockMergeBasket).toHaveBeenCalledTimes(1);
        expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);
        expect(mockUpdateBasketResource).toHaveBeenCalledWith(mockContext, mergedBasket);
        expect(result.data.success).toBe(true);
    });

    it('skips mergeBasket for new registrations (isRegistration=true)', async () => {
        const mockTokenResponse = {
            access_token: 'access-token',
            id_token: 'id-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            refresh_token_expires_in: 7200,
            token_type: 'Bearer' as const,
            usid: 'test-usid',
            customer_id: 'customer-id',
            enc_user_id: 'enc-user-id',
            idp_access_token: 'idp-token',
        } as any;

        mockExchangeToken.mockResolvedValue(mockTokenResponse);

        const result = await action(
            createActionArgs({ otpCode: '12345678', email: 'test@example.com', isRegistration: true })
        );

        expect(mockMergeBasket).not.toHaveBeenCalled();
        expect(result.data.success).toBe(true);
    });

    it('reconciles basket email when basket email differs from authenticated customer email', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockExchangeToken.mockResolvedValue(mockTokenResponse);
        mockGetAuth.mockReturnValue({ customerId: 'customer-id' } as any);
        mockGetCustomerProfileForCheckout.mockResolvedValue({
            customer: { customerId: 'customer-id', email: 'customer@x.com' },
            addresses: [],
            paymentInstruments: [],
        } as any);
        mockGetBasket.mockResolvedValue({
            current: { basketId: 'basket-1', currency: 'USD', customerInfo: { email: 'guest@x.com' } },
        } as any);
        mockCalculateBasket.mockResolvedValue({
            basketId: 'basket-1',
            currency: 'USD',
            customerInfo: { email: 'guest@x.com' },
        } as any);

        await action(createActionArgs({ otpCode: '12345678', email: 'guest@x.com' }));

        expect(mockUpdateCustomerForBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-1' } },
            body: { email: 'customer@x.com' },
        });
    });

    it('does not reconcile basket email when basket email matches authenticated customer email (case-insensitive)', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockExchangeToken.mockResolvedValue(mockTokenResponse);
        mockGetAuth.mockReturnValue({ customerId: 'customer-id' } as any);
        mockGetCustomerProfileForCheckout.mockResolvedValue({
            customer: { customerId: 'customer-id', email: 'abc@x.com' },
            addresses: [],
            paymentInstruments: [],
        } as any);
        mockGetBasket.mockResolvedValue({
            current: { basketId: 'basket-1', currency: 'USD', customerInfo: { email: 'ABC@x.com' } },
        } as any);
        mockCalculateBasket.mockResolvedValue({
            basketId: 'basket-1',
            currency: 'USD',
            customerInfo: { email: 'ABC@x.com' },
        } as any);

        await action(createActionArgs({ otpCode: '12345678', email: 'ABC@x.com' }));

        expect(mockUpdateCustomerForBasket).not.toHaveBeenCalled();
    });

    it('returns success even when basket email reconciliation fails', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockExchangeToken.mockResolvedValue(mockTokenResponse);
        mockGetAuth.mockReturnValue({ customerId: 'customer-id' } as any);
        mockGetCustomerProfileForCheckout.mockResolvedValue({
            customer: { customerId: 'customer-id', email: 'customer@x.com' },
            addresses: [],
            paymentInstruments: [],
        } as any);
        mockGetBasket.mockResolvedValue({
            current: { basketId: 'basket-1', currency: 'USD', customerInfo: { email: 'guest@x.com' } },
        } as any);
        mockCalculateBasket.mockResolvedValue({
            basketId: 'basket-1',
            currency: 'USD',
            customerInfo: { email: 'guest@x.com' },
        } as any);
        mockUpdateCustomerForBasket.mockRejectedValue(new Error('SCAPI error'));

        const result = await action(createActionArgs({ otpCode: '12345678', email: 'guest@x.com' }));

        expect(result.data.success).toBe(true);
        expect(result.data.message).toBe('Login successful');
    });
});
