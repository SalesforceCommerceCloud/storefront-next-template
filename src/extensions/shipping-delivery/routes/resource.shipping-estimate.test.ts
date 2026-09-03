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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/scapi';
import { createDeliveryDestinationCookie } from '@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server';
import {
    getFallbackDeliveryDescription,
    getShippingEstimates,
} from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';
import { action, loader, shouldRevalidate } from './resource.shipping-estimate';

const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock('@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server', () => ({
    createDeliveryDestinationCookie: vi.fn(),
}));
vi.mock('@/extensions/shipping-delivery/lib/api/shipping-delivery.server', () => ({
    getFallbackDeliveryDescription: vi.fn(),
    getEstimateCountryCode: vi.fn(() => 'US'),
    getShippingEstimates: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => logger,
}));

const ORIGIN = 'https://example.com';
const serialize = vi.fn();

function request(
    params: Record<string, string> = {},
    headers: Record<string, string> = {},
    includeOrigin = true
): Request {
    const url = new URL(`${ORIGIN}/resource/shipping-estimate`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return new Request(url, { headers: { ...(includeOrigin ? { Origin: ORIGIN } : {}), ...headers } });
}

function invoke(requestToInvoke: Request) {
    return loader({ request: requestToInvoke, context: new RouterContextProvider(), params: {} } as never);
}

function createApiError(status: number) {
    return new ApiError({
        status,
        statusText: 'Upstream error',
        headers: new Headers(),
        body: { type: '', title: 'Upstream error', detail: 'provider detail' },
        rawBody: 'provider detail',
        url: 'https://example.test/delivery-estimates',
        method: 'GET',
    });
}

describe('resource.shipping-estimate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        serialize.mockResolvedValue('deliveryZipCode=94105');
        vi.mocked(createDeliveryDestinationCookie).mockReturnValue({ serialize } as never);
    });

    it('rejects cross-origin requests before calling SCAPI', async () => {
        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105' }, { Origin: 'https://evil.example' })
        );

        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({ success: false });
        expect(getShippingEstimates).not.toHaveBeenCalled();
    });

    it('accepts a same-origin Referer when Origin is unavailable', async () => {
        vi.mocked(getShippingEstimates).mockResolvedValue({
            deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
            shippingOptions: [],
        });

        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105' }, { Referer: `${ORIGIN}/product/product-1` }, false)
        );

        expect(response.status).toBe(200);
    });

    it('rejects a cross-origin Referer when Origin is unavailable', async () => {
        const response = await invoke(
            request(
                { productId: 'product-1', zipcode: '94105' },
                { Referer: 'https://evil.example/product/product-1' },
                false
            )
        );

        expect(response.status).toBe(403);
        expect(getShippingEstimates).not.toHaveBeenCalled();
    });

    it.each([
        [{ zipcode: '94105' }],
        [{ productId: 'product-1' }],
        [{ productId: 'product-1', zipcode: '1234567890123' }],
        [{ productId: 'product-1', zipcode: '-94105' }],
        [{ productId: 'product-1', zipcode: '94105-' }],
        [{ productId: 'product-1', zipcode: '94/105' }],
        [{ productId: 'product-1', zipcode: '94\n105' }],
        [{ productId: 'product-1', zipcode: 'ABCDE', countryCode: 'US' }],
        [{ productId: 'product-1', zipcode: 'M5V A8', countryCode: 'CA' }],
        [{ productId: 'x'.repeat(101), zipcode: '94105' }],
    ])('rejects malformed input without calling SCAPI', async (params) => {
        const response = await invoke(request(params));

        expect(response.status).toBe(400);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Set-Cookie')).toBeNull();
        await expect(response.json()).resolves.toEqual({ success: false });
        expect(getShippingEstimates).not.toHaveBeenCalled();
        expect(serialize).not.toHaveBeenCalled();
    });

    it('does not persist a destination from an automatic successful lookup', async () => {
        vi.mocked(getShippingEstimates).mockResolvedValue({
            deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
            shippingOptions: [],
        });

        const response = await invoke(request({ productId: 'product-1', zipcode: '94105' }));

        expect(response.status).toBe(200);
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(serialize).not.toHaveBeenCalled();
    });

    it('returns every deliverable method and stores an explicitly submitted postal code after a successful lookup', async () => {
        vi.mocked(getShippingEstimates).mockResolvedValue({
            deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
            shippingOptions: [
                {
                    shippingMethodId: 'ground',
                    price: 5,
                    currency: 'USD',
                    deliveryWindow: { startAt: '2027-01-02T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
                },
                {
                    shippingMethodId: 'express',
                    price: 15,
                    currency: 'USD',
                    deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-02T00:00:00Z' },
                },
            ],
        });

        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105', persistDestination: 'true' })
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({
            success: true,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
            estimate: {
                deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
                shippingOptions: [
                    {
                        shippingMethodId: 'ground',
                        price: 5,
                        currency: 'USD',
                        deliveryWindow: {
                            startAt: '2027-01-02T00:00:00Z',
                            endAt: '2027-01-03T00:00:00Z',
                        },
                    },
                    {
                        shippingMethodId: 'express',
                        price: 15,
                        currency: 'USD',
                        deliveryWindow: {
                            startAt: '2027-01-01T00:00:00Z',
                            endAt: '2027-01-02T00:00:00Z',
                        },
                    },
                ],
            },
        });
        expect(serialize).toHaveBeenCalledWith({ postalCode: '94105', countryCode: 'US' });
    });

    it('normalizes, forwards, echoes, and persists an explicit country', async () => {
        vi.mocked(getShippingEstimates).mockResolvedValue({
            deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
            shippingOptions: [],
        });

        const response = await invoke(
            request({ productId: 'product-1', zipcode: 'M5V 3A8', countryCode: ' ca ', persistDestination: 'true' })
        );

        expect(getShippingEstimates).toHaveBeenCalledWith(expect.anything(), 'product-1', 'M5V 3A8', 'CA');
        await expect(response.json()).resolves.toEqual({
            success: true,
            productId: 'product-1',
            zipcode: 'M5V 3A8',
            countryCode: 'CA',
            estimate: {
                deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
                shippingOptions: [],
            },
        });
        expect(serialize).toHaveBeenCalledWith({ postalCode: 'M5V 3A8', countryCode: 'CA' });
    });

    it.each(['C', 'CAN', '1A', 'ZZ', 'QQ'])('rejects malformed or unassigned country %s', async (countryCode) => {
        const response = await invoke(request({ productId: 'product-1', zipcode: '94105', countryCode }));

        expect(response.status).toBe(400);
        expect(getShippingEstimates).not.toHaveBeenCalled();
    });

    it('returns a neutral empty estimate without persisting the postal code', async () => {
        vi.mocked(getShippingEstimates).mockResolvedValue(null);

        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105', persistDestination: 'true' })
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: false,
            empty: true,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
        });
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(serialize).not.toHaveBeenCalled();
        expect(getFallbackDeliveryDescription).not.toHaveBeenCalled();
    });

    it('returns an opaque failure without persisting a failed postal-code lookup', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(new Error('provider token leaked'));

        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105', persistDestination: 'true' })
        );

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
        });
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(serialize).not.toHaveBeenCalled();
    });

    it('preserves an upstream 403, remembers the postal code, and returns catalog delivery guidance', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(createApiError(403));
        vi.mocked(getFallbackDeliveryDescription).mockResolvedValue('Arrives in 7–10 business days');

        const response = await invoke(
            request({ productId: 'product-1', zipcode: 'M5V 3A8', countryCode: 'CA', persistDestination: 'true' })
        );

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: 'M5V 3A8',
            countryCode: 'CA',
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
        });
        expect(response.headers.get('Set-Cookie')).toBe('deliveryZipCode=94105');
        expect(serialize).toHaveBeenCalledWith({ postalCode: 'M5V 3A8', countryCode: 'CA' });
        expect(getFallbackDeliveryDescription).toHaveBeenCalledWith(expect.anything(), 'product-1');
    });

    it('preserves an upstream 500, remembers the postal code, and returns catalog delivery guidance', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(createApiError(500));
        vi.mocked(getFallbackDeliveryDescription).mockResolvedValue('Arrives in 7–10 business days');

        const response = await invoke(
            request({ productId: 'product-1', zipcode: '94105', persistDestination: 'true' })
        );

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
        });
        expect(response.headers.get('Set-Cookie')).toBe('deliveryZipCode=94105');
        expect(serialize).toHaveBeenCalledWith({ postalCode: '94105', countryCode: 'US' });
        expect(getFallbackDeliveryDescription).toHaveBeenCalledWith(expect.anything(), 'product-1');
    });

    it.each([400, 404, 503])('preserves upstream %i without catalog delivery guidance', async (status) => {
        vi.mocked(getShippingEstimates).mockRejectedValue(createApiError(status));

        const response = await invoke(request({ productId: 'product-1', zipcode: '94105' }));

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
        });
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(serialize).not.toHaveBeenCalled();
        expect(getFallbackDeliveryDescription).not.toHaveBeenCalled();
    });

    it('keeps an unclassified lookup failure opaque without catalog guidance', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(new Error('No delivery estimates available'));

        const response = await invoke(request({ productId: 'product-1', zipcode: '94105' }));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
        });
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(serialize).not.toHaveBeenCalled();
        expect(getFallbackDeliveryDescription).not.toHaveBeenCalled();
    });

    it('keeps upstream 403 failures opaque when catalog fallback is unavailable', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(createApiError(403));
        vi.mocked(getFallbackDeliveryDescription).mockResolvedValue(undefined);

        const response = await invoke(request({ productId: 'product-1', zipcode: '94105' }));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            success: false,
            productId: 'product-1',
            zipcode: '94105',
            countryCode: 'US',
        });
        expect(getFallbackDeliveryDescription).toHaveBeenCalledWith(expect.anything(), 'product-1');
    });

    it('logs only a failure classification and upstream status for failed lookups', async () => {
        vi.mocked(getShippingEstimates).mockRejectedValue(createApiError(503));

        await invoke(request({ productId: 'product-1', zipcode: '94105' }));

        expect(logger.error).toHaveBeenCalledWith('ShippingEstimate: lookup failed', {
            failureType: 'upstream',
            upstreamStatus: 503,
        });
    });

    it('rejects non-GET methods and skips action-driven revalidation', () => {
        expect(action().status).toBe(405);
        expect(action().headers.get('Allow')).toBe('GET');
        expect(
            shouldRevalidate({ formAction: '/resource/cart-item-add', defaultShouldRevalidate: true } as never)
        ).toBe(false);
        expect(shouldRevalidate({ defaultShouldRevalidate: true } as never)).toBe(true);
    });
});
