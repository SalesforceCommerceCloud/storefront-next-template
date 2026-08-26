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
import type { RouterContextProvider } from 'react-router';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getAuth } from '@/middlewares/auth.server';
import { getCustomerAddresses } from '@/lib/api/customer.server';
import { getLogger } from '@/lib/logger.server';
import type { ShippingDestination } from '@/lib/shipping-estimate/types';
import { normalizeCountryCode } from '@/lib/shipping-estimate/country-code';
import { normalizePostalCode } from '@/lib/shipping-estimate/postal-code';

const COOKIE_DELIVERY_ZIP = 'deliveryZipCode';

const normalizeDestination = (value: unknown): ShippingDestination | null => {
    if (!value || typeof value !== 'object') return null;
    const { postalCode, countryCode } = value as Record<string, unknown>;
    if (typeof postalCode !== 'string') return null;
    const normalizedPostalCode = normalizePostalCode(postalCode);
    if (!normalizedPostalCode) return null;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (countryCode !== undefined && !normalizedCountryCode) return null;
    return {
        postalCode: normalizedPostalCode,
        ...(normalizedCountryCode ? { countryCode: normalizedCountryCode } : {}),
    };
};

export const createDeliveryDestinationCookie = (context: Readonly<RouterContextProvider>) => {
    const cookie = createCookie<string>(
        COOKIE_DELIVERY_ZIP,
        getCookieConfig(
            {
                path: '/',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                sameSite: 'lax',
                httpOnly: false,
            },
            context
        ),
        context
    );
    return {
        parse: cookie.parse,
        serialize: (destination: ShippingDestination) => {
            const normalized = normalizeDestination(destination);
            if (!normalized) throw new Error('Invalid shipping destination');
            return cookie.serialize(encodeURIComponent(JSON.stringify(normalized)));
        },
    };
};

/**
 * Reads the delivery postal code from the request cookie header.
 * Returns the value or null if not set or fails a generic sanity check.
 */
export async function getDeliveryDestinationFromCookie(
    context: Readonly<RouterContextProvider>,
    request: Request
): Promise<ShippingDestination | null> {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;

    const destinationCookie = createDeliveryDestinationCookie(context);
    const value = await destinationCookie.parse(cookieHeader);
    if (typeof value !== 'string') return null;
    const legacyPostalCode = normalizePostalCode(value);
    if (legacyPostalCode) {
        return { postalCode: legacyPostalCode };
    }
    try {
        return normalizeDestination(JSON.parse(decodeURIComponent(value)));
    } catch {
        return null;
    }
}

/**
 * Resolves the initial delivery postal code for shipping estimates.
 * Priority:
 *   1) cookie value
 *   2) registered customer's preferred shipping, shipping, billing, preferred, or first address
 * Returns null if neither is available or plausible.
 */
export async function getInitialDeliveryDestination(
    context: Readonly<RouterContextProvider>,
    request: Request
): Promise<ShippingDestination | null> {
    const cookieDestination = await getDeliveryDestinationFromCookie(context, request);
    if (cookieDestination) return cookieDestination;

    try {
        const auth = getAuth(context);
        if (auth.userType !== 'registered' || !auth.customerId) return null;

        const addresses = await getCustomerAddresses(context, auth.customerId);
        const shippingAddresses = addresses.filter((address) => address.addressId?.toLowerCase().includes('shipping'));
        const billingAddress = addresses.find((address) => address.addressId?.toLowerCase().includes('billing'));
        const preferred =
            shippingAddresses.find((address) => address.preferred) ??
            shippingAddresses[0] ??
            billingAddress ??
            addresses.find((address) => address.preferred) ??
            addresses[0];
        const postalCode = normalizePostalCode(preferred?.postalCode);
        if (postalCode) {
            const countryCode = normalizeCountryCode(preferred?.countryCode);
            return { postalCode, ...(countryCode ? { countryCode } : {}) };
        }
    } catch (error) {
        const logger = getLogger(context);
        logger.debug('DeliveryZip: failed to resolve from customer address', { error });
    }

    return null;
}
