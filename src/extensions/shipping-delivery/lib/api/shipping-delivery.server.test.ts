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

const logger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));
vi.mock('@/lib/api/products.server', () => ({
    fetchProductById: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));
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

    it('keeps every deliverable option and uses the slowest option for the summary', async () => {
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

        const estimate = await getShippingEstimates(createContext('en-US'), 'product-1', '94105');

        expect(estimate).toMatchObject({
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
        expect(estimate?.deliveryWindow).toEqual(estimate?.shippingOptions[0]?.deliveryWindow);
    });

    it('ranks delivery windows by their latest start time', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'later-start',
                                deliveryWindow: {
                                    startAt: '2027-01-03T00:00:00Z',
                                    endAt: '2027-01-05T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'earlier-start',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-05T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'later-arrival',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00Z',
                                    endAt: '2027-01-06T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'z-method',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-05T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'a-method',
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
                endAt: '2027-01-05T00:00:00Z',
            },
            shippingOptions: [
                { shippingMethodId: 'later-start' },
                { shippingMethodId: 'a-method' },
                { shippingMethodId: 'earlier-start' },
                { shippingMethodId: 'z-method' },
                { shippingMethodId: 'later-arrival' },
            ],
        });
    });

    it('breaks equal start times by the latest exact delivery-window end time', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'later',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00.0001Z',
                                    endAt: '2027-01-03T00:00:00.0009Z',
                                },
                            },
                            {
                                shippingMethodId: 'earlier',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00.0001Z',
                                    endAt: '2027-01-03T00:00:00.0001Z',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-02T00:00:00.0001Z',
                endAt: '2027-01-03T00:00:00.0009Z',
            },
            shippingOptions: [{ shippingMethodId: 'later' }, { shippingMethodId: 'earlier' }],
        });
    });

    it('excludes delivery options with invalid delivery windows', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'invalid-date',
                                deliveryWindow: {
                                    startAt: 'not-a-date',
                                    endAt: '2027-01-02T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'invalid-calendar-date',
                                deliveryWindow: {
                                    startAt: '2027-02-30T00:00:00Z',
                                    endAt: '2027-03-03T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'reversed-window',
                                deliveryWindow: {
                                    startAt: '2027-01-04T00:00:00Z',
                                    endAt: '2027-01-03T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'unknown-offset',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00-00:00',
                                    endAt: '2027-01-02T00:00:00-00:00',
                                },
                            },
                            {
                                shippingMethodId: 'express',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00Z',
                                    endAt: '2027-01-02T00:00:00Z',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        const estimate = await getShippingEstimates(createContext(), 'product-1', '94105');

        expect(estimate).toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-01T00:00:00Z',
                endAt: '2027-01-02T00:00:00Z',
            },
            shippingOptions: [{ shippingMethodId: 'express' }],
        });
        expect(estimate?.shippingOptions).toHaveLength(1);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('keeps valid RFC 3339 offsets and casing that cross a UTC date boundary', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'express',
                                deliveryWindow: {
                                    startAt: '2027-01-01t00:30:00+01:00',
                                    endAt: '2027-01-01t01:30:00z',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-01t00:30:00+01:00',
                endAt: '2027-01-01t01:30:00z',
            },
            shippingOptions: [{ shippingMethodId: 'express' }],
        });
    });

    it('ranks delivery windows by their UTC time rather than offset-local time', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'later-in-utc',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00-02:00',
                                    endAt: '2027-01-01T01:00:00-02:00',
                                },
                            },
                            {
                                shippingMethodId: 'earlier-in-utc',
                                deliveryWindow: {
                                    startAt: '2027-01-01T01:30:00+02:00',
                                    endAt: '2027-01-01T02:30:00+02:00',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toMatchObject({
            deliveryWindow: {
                startAt: '2027-01-01T00:00:00-02:00',
                endAt: '2027-01-01T01:00:00-02:00',
            },
            shippingOptions: [{ shippingMethodId: 'later-in-utc' }, { shippingMethodId: 'earlier-in-utc' }],
        });
    });

    it('breaks equivalent delivery-window timestamps by shipping method ID', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'z-method',
                                deliveryWindow: {
                                    startAt: '2027-01-01T19:00:00-05:00',
                                    endAt: '2027-01-02T19:00:00-05:00',
                                },
                            },
                            {
                                shippingMethodId: 'a-method',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-03T00:00:00Z',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toMatchObject({
            shippingOptions: [{ shippingMethodId: 'a-method' }, { shippingMethodId: 'z-method' }],
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
        {
            name: 'every shipping option has an invalid delivery window',
            productDeliveryEstimates: [
                {
                    productId: 'product-1',
                    shippingOptions: [
                        {
                            shippingMethodId: 'ground',
                            deliveryWindow: { startAt: '2027-01-04T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
                        },
                    ],
                },
            ],
        },
    ])('returns no estimate when $name', async ({ productDeliveryEstimates }) => {
        getDeliveryEstimates.mockResolvedValue({ data: { productDeliveryEstimates } });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toBeNull();
    });

    it('logs when every returned delivery window is invalid', async () => {
        getDeliveryEstimates.mockResolvedValue({
            data: {
                productDeliveryEstimates: [
                    {
                        productId: 'product-1',
                        shippingOptions: [
                            {
                                shippingMethodId: 'unknown-offset',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00-00:00',
                                    endAt: '2027-01-02T00:00:00-00:00',
                                },
                            },
                        ],
                    },
                ],
            },
        });

        await expect(getShippingEstimates(createContext(), 'product-1', '94105')).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledWith('ShippingEstimate: no valid delivery windows', {
            invalidDeliveryWindowCount: 1,
        });
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
