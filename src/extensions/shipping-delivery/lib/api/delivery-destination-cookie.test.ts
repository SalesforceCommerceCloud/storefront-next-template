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
import { describe, expect, test } from 'vitest';
import { DELIVERY_DESTINATION_COOKIE, parseDeliveryDestinationCookie } from './delivery-destination-cookie';

const COOKIE_NAME = 'deliveryZipCode_RefArchGlobal';

describe('parseDeliveryDestinationCookie', () => {
    test('uses the delivery destination cookie name', () => {
        expect(DELIVERY_DESTINATION_COOKIE).toBe('deliveryZipCode');
    });

    test('returns a structured destination from the browser-readable cookie', () => {
        const value = encodeURIComponent(JSON.stringify({ postalCode: 'M5V 3A8', countryCode: 'ca' }));

        expect(parseDeliveryDestinationCookie(`${COOKIE_NAME}=${value}`, COOKIE_NAME)).toEqual({
            postalCode: 'M5V 3A8',
            countryCode: 'CA',
        });
    });

    test('returns null for an absent or malformed destination', () => {
        expect(parseDeliveryDestinationCookie('', COOKIE_NAME)).toBeNull();
        expect(parseDeliveryDestinationCookie(`${COOKIE_NAME}=%7Bbad`, COOKIE_NAME)).toBeNull();
    });
});
