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
import { ApiError, type ErrorDetail } from '../ApiError';
import { createBasketHelpers } from './index';
import type { BasketHelpersConfig } from './types';

const createApiError = (status: number, body: Partial<ErrorDetail> = {}): ApiError =>
    new ApiError({
        status,
        statusText: 'Error',
        headers: new Headers(),
        body: {
            type: 'about:blank',
            title: 'Error',
            detail: 'Error',
            ...body,
        },
        rawBody: '',
        url: 'https://test.api.commercecloud.salesforce.com',
        method: 'GET',
    });

describe('getOrCreateBasket', () => {
    const mockBasket = { basketId: 'basket-123' };
    const mockFallbackBasket = { basketId: 'basket-fallback' };
    const mockShopperBasketsClient = {
        createBasket: vi.fn(),
        getBasket: vi.fn(),
    };

    const config: BasketHelpersConfig = {
        shopperBasketsClient: mockShopperBasketsClient as unknown as BasketHelpersConfig['shopperBasketsClient'],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a basket when no basketId is provided', async () => {
        mockShopperBasketsClient.createBasket.mockResolvedValue({ data: mockBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: {},
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.createBasket).toHaveBeenCalledWith({
            params: {
                query: {
                    populateCustomerDetails: true,
                },
            },
            body: { currency: 'USD' },
        });
        expect(result).toEqual(mockBasket);
    });

    it('returns an existing basket when getBasket succeeds', async () => {
        mockShopperBasketsClient.getBasket.mockResolvedValue({ data: mockBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'basket-123' } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-123' } },
        });
        expect(mockShopperBasketsClient.createBasket).not.toHaveBeenCalled();
        expect(result).toEqual(mockBasket);
    });

    it('forwards a caller-supplied query (e.g. expand) onto getBasket', async () => {
        mockShopperBasketsClient.getBasket.mockResolvedValue({ data: mockBasket });

        const basketHelpers = createBasketHelpers(config);
        await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'basket-123' }, query: { expand: ['approaching_discounts'] } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-123' }, query: { expand: ['approaching_discounts'] } },
        });
    });

    it('forwards the query onto the fallback getBasket after a quota error', async () => {
        mockShopperBasketsClient.getBasket
            .mockRejectedValueOnce(createApiError(429, { basketIds: ['basket-fallback'] }))
            .mockResolvedValue({ data: mockFallbackBasket });

        const basketHelpers = createBasketHelpers(config);
        await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'basket-123' }, query: { expand: ['approaching_discounts'] } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenLastCalledWith({
            params: { path: { basketId: 'basket-fallback' }, query: { expand: ['approaching_discounts'] } },
        });
    });

    it('creates a basket when getBasket returns 404', async () => {
        mockShopperBasketsClient.getBasket.mockRejectedValue(createApiError(404));
        mockShopperBasketsClient.createBasket.mockResolvedValue({ data: mockBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'missing' } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.createBasket).toHaveBeenCalledWith({
            params: {
                query: {
                    populateCustomerDetails: true,
                },
            },
            body: { currency: 'USD' },
        });
        expect(result).toEqual(mockBasket);
    });

    it('uses fallback basket when createBasket returns quota error', async () => {
        mockShopperBasketsClient.createBasket.mockRejectedValue(
            createApiError(429, { basketIds: ['basket-fallback'] })
        );
        mockShopperBasketsClient.getBasket.mockResolvedValue({ data: mockFallbackBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: {},
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-fallback' } },
        });
        expect(result).toEqual(mockFallbackBasket);
    });

    it('uses fallback basket when getBasket returns quota error with basketIds', async () => {
        mockShopperBasketsClient.getBasket
            .mockRejectedValueOnce(createApiError(429, { basketIds: ['basket-fallback'] }))
            .mockResolvedValue({ data: mockFallbackBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'basket-123' } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-fallback' } },
        });
        expect(result).toEqual(mockFallbackBasket);
    });

    it('creates a basket when getBasket returns 400', async () => {
        mockShopperBasketsClient.getBasket.mockRejectedValue(createApiError(400));
        mockShopperBasketsClient.createBasket.mockResolvedValue({ data: mockBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: { path: { basketId: 'bad-request' } },
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.createBasket).toHaveBeenCalledWith({
            params: {
                query: {
                    populateCustomerDetails: true,
                },
            },
            body: { currency: 'USD' },
        });
        expect(result).toEqual(mockBasket);
    });

    it('rethrows non-ApiError from getBasket', async () => {
        const error = new Error('network');
        mockShopperBasketsClient.getBasket.mockRejectedValue(error);

        const basketHelpers = createBasketHelpers(config);
        await expect(
            basketHelpers.getOrCreateBasket({
                params: { path: { basketId: 'basket-123' } },
                body: { currency: 'USD' },
            })
        ).rejects.toBe(error);
    });

    it('uses fallback basket when createBasket returns quota error with single basketId', async () => {
        mockShopperBasketsClient.createBasket.mockRejectedValue(createApiError(429, { basketIds: 'basket-fallback' }));
        mockShopperBasketsClient.getBasket.mockResolvedValue({ data: mockFallbackBasket });

        const basketHelpers = createBasketHelpers(config);
        const result = await basketHelpers.getOrCreateBasket({
            params: {},
            body: { currency: 'USD' },
        });

        expect(mockShopperBasketsClient.getBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-fallback' } },
        });
        expect(result).toEqual(mockFallbackBasket);
    });
});
