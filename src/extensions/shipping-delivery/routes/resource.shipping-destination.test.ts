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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getInitialDeliveryDestination } from '@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server';
import { loader } from './resource.shipping-destination';

const logger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server', () => ({
    getInitialDeliveryDestination: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));

const ORIGIN = 'https://example.com';

function invoke(origin = ORIGIN) {
    return loader({
        request: new Request(`${ORIGIN}/resource/shipping-destination`, { headers: { Origin: origin } }),
        context: new RouterContextProvider(),
        params: {},
    } as never);
}

describe('resource.shipping-destination', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns the current shopper destination without allowing the response to be cached', async () => {
        vi.mocked(getInitialDeliveryDestination).mockResolvedValue({ postalCode: 'M5V 3A8', countryCode: 'CA' });

        const response = await invoke();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Set-Cookie')).toBeNull();
        await expect(response.json()).resolves.toEqual({
            success: true,
            destination: { postalCode: 'M5V 3A8', countryCode: 'CA' },
        });
    });

    test('rejects cross-origin requests before reading shopper data', async () => {
        const response = await invoke('https://evil.example');

        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({ success: false });
        expect(getInitialDeliveryDestination).not.toHaveBeenCalled();
    });
});
