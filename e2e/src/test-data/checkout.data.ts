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

const TEST_CARDS = {
    VISA: '4242424242424242',
    /** MasterCard BIN; BM id must stay MasterCard (no space), not Master Card. */
    MASTERCARD: '5555555555554444',
} as const;

export const TEST_PAYMENT = {
    cardNumber: TEST_CARDS.VISA,
    cardholderName: 'Test Shopper',
    expiryDate: '01/30',
    cvv: '123',
} as const;

/** Guest / new-card MasterCard payment — exercises BIN detect → wire cardType MasterCard. */
export const TEST_PAYMENT_MASTERCARD = {
    cardNumber: TEST_CARDS.MASTERCARD,
    cardholderName: 'Test Shopper',
    expiryDate: '01/30',
    cvv: '123',
} as const;

export const TEST_SHIPPING_ADDRESS = {
    firstName: 'Test',
    lastName: 'Shopper',
    address1: '123 Main Street',
    city: 'Boston',
    stateCode: 'MA',
    postalCode: '02101',
    phone: '617-555-0123',
} as const;

export const TEST_SHIPPING_ADDRESS_ALT = {
    firstName: 'Jane',
    lastName: 'Smith',
    address1: '456 Oak Avenue',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    phone: '415-555-0199',
} as const;

const TEST_EMAIL_DOMAIN = '@test.com' as const;

export function generateTestEmail(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}${TEST_EMAIL_DOMAIN}`;
}

export const INVALID_TEST_DATA = {
    EMAIL: 'not-an-email',
    PHONE: '123',
    EXPIRED_CARD_DATE: '01/20',
    CVV: 'ab',
    SHORT_PROMO_CODE: 'X',
    FAKE_PROMO_CODE: 'FAKECODE123',
    SHORT_CARD_NUMBER: '4111',
} as const;

export const TEST_PRODUCT_CATEGORIES = {
    MENS_JACKETS: 'category/mens-clothing-jackets',
    WOMENS_DRESSES: 'category/womens-clothing-dresses',
    WOMENS_TOPS: 'category/womens-clothing-tops',
    MENS_CLOTHING: 'category/mens',
} as const;

/** RefArch variant IDs used by apiCartSetupFlow for direct SCAPI basket creation. */
export const TEST_VARIANT_PRODUCTS = {
    WOMENS_DRESS_VARIANT: '701642868279M',
    MENS_JACKET_VARIANT: '883360520599M',
} as const;

export const TEST_LOCALE_CURRENCIES = [
    {
        label: 'USD',
        siteAlias: 'us',
        locale: 'en-US',
        currencyPattern: /\$[\d,.]+/,
        shippingAddress: TEST_SHIPPING_ADDRESS,
    },
    {
        label: 'GBP',
        siteAlias: 'global',
        locale: 'en-GB',
        currencyPattern: /£[\d,.]+/,
        shippingAddress: TEST_SHIPPING_ADDRESS,
    },
] as const;
