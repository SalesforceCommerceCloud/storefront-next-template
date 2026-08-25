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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCookie } from '@/lib/cookie-utils.server';
import { getAuth } from '@/middlewares/auth.server';
import { getCustomerAddresses } from '@/lib/api/customer.server';
import {
    createDeliveryDestinationCookie,
    getDeliveryDestinationFromCookie,
    getInitialDeliveryDestination,
} from './delivery-destination-cookie.server';

vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(),
    getCookieConfig: vi.fn((config) => config),
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api/customer.server', () => ({ getCustomerAddresses: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ debug: vi.fn() }) }));

const parse = vi.fn();
const serialize = vi.fn();
const context = {} as never;
describe('delivery destination cookie', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createCookie).mockReturnValue({ parse, serialize } as never);
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
        serialize.mockImplementation((value) => Promise.resolve(`deliveryZipCode=${value}`));
    });

    it('round-trips a structured destination with explicit JSON URI encoding', async () => {
        expect(createDeliveryDestinationCookie).toBeTypeOf('function');
        const cookie = createDeliveryDestinationCookie(context);

        expect(createCookie).toHaveBeenCalledWith('deliveryZipCode', expect.anything(), context);
        await expect(cookie.serialize({ postalCode: 'M5V 3A8', countryCode: ' ca ' })).resolves.toBe(
            `deliveryZipCode=${encodeURIComponent(JSON.stringify({ postalCode: 'M5V 3A8', countryCode: 'CA' }))}`
        );

        parse.mockResolvedValue(encodeURIComponent(JSON.stringify({ postalCode: 'M5V 3A8', countryCode: 'ca' })));
        await expect(
            getDeliveryDestinationFromCookie(
                context,
                new Request('https://example.com', { headers: { Cookie: 'x=y' } })
            )
        ).resolves.toEqual({
            postalCode: 'M5V 3A8',
            countryCode: 'CA',
        });
    });

    it('reads a legacy scalar postal-code cookie', async () => {
        parse.mockResolvedValue('94105');
        await expect(
            getDeliveryDestinationFromCookie(
                context,
                new Request('https://example.com', { headers: { Cookie: 'x=y' } })
            )
        ).resolves.toEqual({
            postalCode: '94105',
        });
    });

    it('rejects malformed structured cookie data', async () => {
        parse.mockResolvedValue(encodeURIComponent('{"postalCode":42,"countryCode":"USA"}'));
        await expect(
            getDeliveryDestinationFromCookie(
                context,
                new Request('https://example.com', { headers: { Cookie: 'x=y' } })
            )
        ).resolves.toBeNull();
    });

    it.each(['-94105', '94105-', '94/105', '94\n105'])('rejects malformed postal code %p', async (postalCode) => {
        parse.mockResolvedValue(encodeURIComponent(JSON.stringify({ postalCode, countryCode: 'US' })));

        await expect(
            getDeliveryDestinationFromCookie(
                context,
                new Request('https://example.com', { headers: { Cookie: 'x=y' } })
            )
        ).resolves.toBeNull();
    });

    it('trims a plausible postal code before persistence', async () => {
        const cookie = createDeliveryDestinationCookie(context);

        await cookie.serialize({ postalCode: ' M5V 3A8 ', countryCode: 'CA' });

        expect(serialize).toHaveBeenCalledWith(
            encodeURIComponent(JSON.stringify({ postalCode: 'M5V 3A8', countryCode: 'CA' }))
        );
    });

    it.each(['ZZ', 'QQ'])('rejects unassigned country %s in structured cookie data', async (countryCode) => {
        parse.mockResolvedValue(encodeURIComponent(JSON.stringify({ postalCode: '94105', countryCode })));

        await expect(
            getDeliveryDestinationFromCookie(
                context,
                new Request('https://example.com', { headers: { Cookie: 'x=y' } })
            )
        ).resolves.toBeNull();
    });

    it('uses and normalizes the preferred foreign address country', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-1' } as never);
        vi.mocked(getCustomerAddresses).mockResolvedValue([
            { addressId: 'preferred', preferred: true, postalCode: 'sw1a 1aa', countryCode: 'gb' },
        ] as never);

        await expect(getInitialDeliveryDestination(context, new Request('https://example.com'))).resolves.toEqual({
            postalCode: 'sw1a 1aa',
            countryCode: 'GB',
        });
    });

    it('prefers a shipping address over a preferred billing address', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-1' } as never);
        vi.mocked(getCustomerAddresses).mockResolvedValue([
            { addressId: 'Billing_Main', preferred: true, postalCode: '10001', countryCode: 'US' },
            { addressId: 'SHIPPING_Home', postalCode: '94105', countryCode: 'US' },
        ] as never);

        await expect(getInitialDeliveryDestination(context, new Request('https://example.com'))).resolves.toEqual({
            postalCode: '94105',
            countryCode: 'US',
        });
    });

    it('prefers a preferred shipping address over another shipping address', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-1' } as never);
        vi.mocked(getCustomerAddresses).mockResolvedValue([
            { addressId: 'shipping_work', postalCode: '10001', countryCode: 'US' },
            { addressId: 'shipping_home', preferred: true, postalCode: '94105', countryCode: 'US' },
        ] as never);

        await expect(getInitialDeliveryDestination(context, new Request('https://example.com'))).resolves.toEqual({
            postalCode: '94105',
            countryCode: 'US',
        });
    });

    it.each([
        undefined,
        '',
        'USA',
    ])('falls back later to locale when the preferred address country is %p', async (countryCode) => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-1' } as never);
        vi.mocked(getCustomerAddresses).mockResolvedValue([
            { addressId: 'preferred', preferred: true, postalCode: '94105', countryCode },
        ] as never);

        await expect(getInitialDeliveryDestination(context, new Request('https://example.com'))).resolves.toEqual({
            postalCode: '94105',
        });
    });
});
