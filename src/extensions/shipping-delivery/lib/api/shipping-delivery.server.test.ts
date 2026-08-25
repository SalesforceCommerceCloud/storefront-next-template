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
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createApiClients } from '@/lib/api-clients.server';
import { fetchProductById } from '@/lib/api/products.server';
import { getFallbackDeliveryDescription, getShippingEstimates } from './shipping-delivery.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));
vi.mock('@/lib/api/products.server', () => ({
    fetchProductById: vi.fn(),
}));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(),
}));

const getDeliveryEstimates = vi.fn();

function createContext(localeId?: string) {
    return {
        get: vi.fn((key: unknown) => (key === siteContext && localeId ? { locale: { id: localeId } } : null)),
    } as never;
}

describe('getShippingEstimates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'standard',
                                deliveryWindow: { startAt: '2027-01-02T00:00:00Z', endAt: '2027-01-05T00:00:00Z' },
                            },
                        ],
                    },
                ],
            },
        });
        vi.mocked(createApiClients).mockReturnValue({
            shopperDeliveryEstimates: { getDeliveryEstimates },
        } as never);
    });

    it('uses the country from the active locale', async () => {
        await getShippingEstimates(createContext('en-CA'), 'product-1', 'M5V 3A8');

        expect(getDeliveryEstimates).toHaveBeenCalledWith({
            params: {
                query: { productIds: ['product-1'], postalCode: 'M5V 3A8', countryCode: 'CA' },
            },
        });
    });

    it('uses an explicit country ahead of the active locale', async () => {
        await getShippingEstimates(createContext('en-US'), 'product-1', 'M5V 3A8', 'CA');

        expect(getDeliveryEstimates).toHaveBeenCalledWith({
            params: {
                query: { productIds: ['product-1'], postalCode: 'M5V 3A8', countryCode: 'CA' },
            },
        });
    });

    it('falls back to US when the locale has no country', async () => {
        await getShippingEstimates(createContext('en'), 'product-1', '90210');

        expect(getDeliveryEstimates).toHaveBeenCalledWith({
            params: {
                query: { productIds: ['product-1'], postalCode: '90210', countryCode: 'US' },
            },
        });
    });

    it('keeps every deliverable option and uses the lowest-price option for the summary', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'express',
                                name: 'Express',
                                description: 'Fast delivery',
                                carrier: 'UPS',
                                price: 15,
                                currency: 'USD',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-03T00:00:00Z',
                                },
                                orderCutoffAt: '2027-01-01T12:00:00Z',
                            },
                            {
                                shippingMethodId: 'ground',
                                name: 'Ground',
                                carrier: 'USPS',
                                price: 5,
                                currency: 'USD',
                                deliveryWindow: {
                                    startAt: '2027-01-03T00:00:00Z',
                                    endAt: '2027-01-06T00:00:00Z',
                                },
                            },
                            { shippingMethodId: 'overnight', nonDeliverableReason: 'INSUFFICIENT_INVENTORY' },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext('en-US'), 'product-1', '94105')).resolves.toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-03T00:00:00Z',
                endAt: '2027-01-06T00:00:00Z',
            },
            shippingOptions: [
                {
                    shippingMethodId: 'ground',
                    name: 'Ground',
                    carrier: 'USPS',
                    price: 5,
                    currency: 'USD',
                    deliveryWindow: {
                        startAt: '2027-01-03T00:00:00Z',
                        endAt: '2027-01-06T00:00:00Z',
                    },
                },
                {
                    shippingMethodId: 'express',
                    name: 'Express',
                    description: 'Fast delivery',
                    carrier: 'UPS',
                    price: 15,
                    currency: 'USD',
                    deliveryWindow: {
                        startAt: '2027-01-02T00:00:00Z',
                        endAt: '2027-01-03T00:00:00Z',
                    },
                    orderCutoffAt: '2027-01-01T12:00:00Z',
                },
            ],
        });
    });

    it('uses the first sorted option for the summary when some options have no price', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'unpriced-late',
                                deliveryWindow: {
                                    startAt: '2027-01-04T00:00:00Z',
                                    endAt: '2027-01-07T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'priced',
                                price: 10,
                                deliveryWindow: {
                                    startAt: '2027-01-03T00:00:00Z',
                                    endAt: '2027-01-06T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'unpriced-early',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-05T00:00:00Z',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-03T00:00:00Z',
                endAt: '2027-01-06T00:00:00Z',
            },
            shippingOptions: [
                { shippingMethodId: 'priced' },
                { shippingMethodId: 'unpriced-early' },
                { shippingMethodId: 'unpriced-late' },
            ],
        });
    });

    it.each([
        {
            name: 'the response has no entry for the requested product',
            productDeliveryEstimates: [],
        },
        {
            name: 'the product has no shipping options',
            productDeliveryEstimates: [{ productId: 'product-1', shippingOptions: [] }],
        },
        {
            name: 'no shipping option has a delivery window',
            productDeliveryEstimates: [
                {
                    productId: 'product-1',
                    shippingOptions: [{ shippingMethodId: 'ground', nonDeliverableReason: 'INSUFFICIENT_INVENTORY' }],
                },
            ],
        },
    ])('returns no estimate when $name', async ({ productDeliveryEstimates }) => {
        getDeliveryEstimates.mockResolvedValue({ data: { productDeliveryEstimates } });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toBeNull();
    });
});

describe('getFallbackDeliveryDescription', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the first merchant-authored delivery-method description', async () => {
        vi.mocked(fetchProductById).mockResolvedValue({
            shippingMethods: [
                { id: 'pickup', c_storePickupEnabled: true, description: 'Curbside Pickup' },
                { id: '005', description: 'Store Pickup' },
                { id: 'ground', description: '   ' },
                { id: 'express', description: 'Delivered in 2-3 business days' },
            ],
        } as never);

        await expect(getFallbackDeliveryDescription(createContext(), 'product-1')).resolves.toBe(
            'Delivered in 2-3 business days'
        );
        expect(fetchProductById).toHaveBeenCalledWith(expect.anything(), 'product-1', {
            expand: ['shipping_methods'],
        });
    });

    it('returns no fallback when catalog lookup does not provide a description', async () => {
        vi.mocked(fetchProductById).mockResolvedValue({ shippingMethods: [{ id: 'ground' }] } as never);

        await expect(getFallbackDeliveryDescription(createContext(), 'product-1')).resolves.toBeUndefined();
    });

    it('keeps delivery-estimate failures opaque when catalog fallback lookup fails', async () => {
        vi.mocked(fetchProductById).mockRejectedValue(new Error('Catalog unavailable'));

        await expect(getFallbackDeliveryDescription(createContext(), 'product-1')).resolves.toBeUndefined();
    });
});
