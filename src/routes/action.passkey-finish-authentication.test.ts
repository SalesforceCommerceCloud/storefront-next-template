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

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { action } from './action.passkey-finish-authentication';
import { createApiClients } from '@/lib/api-clients.server';
import { finishPasskeyAuthentication, getAuth, updateAuth } from '@/middlewares/auth.server';
import { calculateBasket, getBasketCurrency, mergeBasket } from '@/lib/api/basket.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { captureGuestWishlistSnapshot, mergeWishlist } from '@/lib/api/wishlist.server';
import { getCustomerProfileForCheckout } from '@/lib/api/customer.server';
import { expectStatus } from '@/lib/test-utils';

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: vi.fn(() => ({ features: { passkey: { enabled: true } } })),
    };
});
vi.mock('@/lib/api-clients.server');
vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/api/basket.server');
vi.mock('@/middlewares/basket.server');
vi.mock('@/lib/api/wishlist.server');
vi.mock('@/lib/api/customer.server');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockCreateApiClients = vi.mocked(createApiClients);
const mockFinishPasskeyAuthentication = vi.mocked(finishPasskeyAuthentication);
const mockGetAuth = vi.mocked(getAuth);
const mockUpdateAuth = vi.mocked(updateAuth);
const mockCalculateBasket = vi.mocked(calculateBasket);
const mockGetBasketCurrency = vi.mocked(getBasketCurrency);
const mockMergeBasket = vi.mocked(mergeBasket);
const mockGetBasket = vi.mocked(getBasket);
const mockUpdateBasketResource = vi.mocked(updateBasketResource);
const mockCaptureGuestWishlistSnapshot = vi.mocked(captureGuestWishlistSnapshot);
const mockMergeWishlist = vi.mocked(mergeWishlist);
const mockGetCustomerProfileForCheckout = vi.mocked(getCustomerProfileForCheckout);
const mockGetConfig = vi.mocked(getConfig);

describe('action.passkey-finish-authentication', () => {
    let mockContext: ActionFunctionArgs['context'];
    let mockUpdateCustomerForBasket: ReturnType<typeof vi.fn>;

    const createActionArgs = (
        body?: { credential?: Record<string, unknown> },
        { method = 'POST' }: { method?: string } = {}
    ): ActionFunctionArgs => {
        return {
            request: new Request('http://localhost/action/passkey-finish-authentication', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
            }),
            params: {},
            context: mockContext,
            pattern: '/action/passkey-finish-authentication',
        } as ActionFunctionArgs;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: true } } } as never);

        mockContext = {} as ActionFunctionArgs['context'];
        mockUpdateCustomerForBasket = vi.fn();

        mockCreateApiClients.mockReturnValue({
            shopperBasketsV2: {
                updateCustomerForBasket: mockUpdateCustomerForBasket,
            },
        } as any);

        mockGetAuth.mockReturnValue({ customerId: undefined } as any);

        mockGetBasket.mockResolvedValue({
            current: { basketId: 'basket-1', currency: 'USD' },
        } as any);
        mockGetBasketCurrency.mockReturnValue('USD');
        mockCalculateBasket.mockResolvedValue({ basketId: 'basket-1', currency: 'USD' } as any);

        mockGetCustomerProfileForCheckout.mockResolvedValue(null);

        mockUpdateCustomerForBasket.mockResolvedValue({
            data: { basketId: 'basket-1', currency: 'USD' },
        });

        mockCaptureGuestWishlistSnapshot.mockResolvedValue(null);
        mockMergeBasket.mockResolvedValue(undefined as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('throws a 404 Response when the passkey feature is disabled', async () => {
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: false } } } as never);

        await expect(action(createActionArgs({ credential: { id: 'c1' } }))).rejects.toMatchObject({ status: 404 });
        expect(mockFinishPasskeyAuthentication).not.toHaveBeenCalled();
    });

    it('rejects non-POST methods with a 405', async () => {
        const result = await action(createActionArgs(undefined, { method: 'GET' }));

        expectStatus(result, 405);
        expect(result.data).toEqual({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        });
        expect(mockFinishPasskeyAuthentication).not.toHaveBeenCalled();
    });

    it('returns error when credential is missing', async () => {
        const result = await action(createActionArgs({}));

        expect(result.data).toEqual({
            success: false,
            error: { code: 'REQUIRED_FIELD', message: 'credential is required' },
        });
        expectStatus(result, 400);
        expect(mockFinishPasskeyAuthentication).not.toHaveBeenCalled();
    });

    it('returns success, updates auth, merges basket, and recalculates on a valid credential', async () => {
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
        const mergedBasket = { basketId: 'basket-1', currency: 'USD', productItems: [{ id: 'item-1' }] } as any;

        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
        mockMergeBasket.mockResolvedValue(mergedBasket);

        const credential = { id: 'cred-1', type: 'public-key' };
        const result = await action(createActionArgs({ credential }));

        expect(mockFinishPasskeyAuthentication).toHaveBeenCalledWith(mockContext, { credential });
        expect(mockUpdateAuth).toHaveBeenCalledTimes(1);
        expect(mockUpdateAuth).toHaveBeenCalledWith(mockContext, mockTokenResponse);

        // Login (never a "registration" case) always attempts a basket merge.
        expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);
        expect(mockUpdateBasketResource).toHaveBeenCalledWith(mockContext, mergedBasket);

        expect(mockGetBasket).toHaveBeenCalledWith(mockContext);
        expect(mockGetBasketCurrency).toHaveBeenCalledWith(mockContext, { basketId: 'basket-1', currency: 'USD' });
        expect(mockCalculateBasket).toHaveBeenCalledWith(mockContext, 'basket-1', 'USD');

        expect(result.data).toEqual({
            success: true,
            message: 'Login successful',
            tokenResponse: mockTokenResponse,
        });
    });

    it('snapshots the guest wishlist before the token swap and merges it after', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        const snapshot = { listId: 'guest-list-1', items: [] } as any;

        mockCaptureGuestWishlistSnapshot.mockResolvedValue(snapshot);
        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
        mockMergeWishlist.mockResolvedValue({ merged: 2, failed: 0 } as any);

        const result = await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(mockCaptureGuestWishlistSnapshot).toHaveBeenCalledWith(mockContext);
        expect(mockMergeWishlist).toHaveBeenCalledWith(mockContext, snapshot);
        expect(result.data).toMatchObject({ success: true, wishlistMerge: 'success' });
    });

    it('reports a partial wishlist merge when some items fail', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        const snapshot = { listId: 'guest-list-1', items: [] } as any;

        mockCaptureGuestWishlistSnapshot.mockResolvedValue(snapshot);
        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
        mockMergeWishlist.mockResolvedValue({ merged: 1, failed: 1 } as any);

        const result = await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(result.data).toMatchObject({ success: true, wishlistMerge: 'partial' });
    });

    it('reconciles basket email when it differs from the authenticated customer email', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
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

        await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(mockUpdateCustomerForBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-1' } },
            body: { email: 'customer@x.com' },
        });
    });

    it('does not reconcile basket email when it matches (case-insensitive)', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
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

        await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(mockUpdateCustomerForBasket).not.toHaveBeenCalled();
    });

    it('returns success even when basket email reconciliation fails', async () => {
        const mockTokenResponse = { access_token: 'access-token', token_type: 'Bearer' as const } as any;
        mockFinishPasskeyAuthentication.mockResolvedValue(mockTokenResponse);
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

        const result = await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(result.data.success).toBe(true);
        expect(result.data.message).toBe('Login successful');
    });

    it('returns a generic 500 error when finishPasskeyAuthentication throws', async () => {
        mockFinishPasskeyAuthentication.mockRejectedValue(new Error('Invalid assertion'));

        const result = await action(createActionArgs({ credential: { id: 'cred-1' } }));

        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('OPERATION_FAILED');
        expect(result.data.error?.message).toBe('Invalid assertion');
        expectStatus(result, 500);
        expect(mockUpdateAuth).not.toHaveBeenCalled();
    });
});
