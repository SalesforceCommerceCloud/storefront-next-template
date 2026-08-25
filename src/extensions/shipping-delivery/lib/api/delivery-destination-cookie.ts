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
import { normalizeCountryCode } from '@/lib/shipping-estimate/country-code';
import { normalizePostalCode } from '@/lib/shipping-estimate/postal-code';
import type { ShippingDestination } from '@/lib/shipping-estimate/types';

export const DELIVERY_DESTINATION_COOKIE = 'deliveryZipCode';

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDeliveryDestinationCookie(cookieHeader: string, cookieName: string): ShippingDestination | null {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapeRegExp(cookieName)}=([^;]+)`));
    if (!match) return null;

    try {
        const value = decodeURIComponent(match[1]);
        const legacyPostalCode = normalizePostalCode(value);
        if (legacyPostalCode) return { postalCode: legacyPostalCode };

        const destination = JSON.parse(value) as Record<string, unknown>;
        if (typeof destination.postalCode !== 'string') return null;
        const postalCode = normalizePostalCode(destination.postalCode);
        const countryCode = normalizeCountryCode(destination.countryCode);
        if (!postalCode || (destination.countryCode !== undefined && !countryCode)) return null;
        return { postalCode, ...(countryCode ? { countryCode } : {}) };
    } catch {
        return null;
    }
}
