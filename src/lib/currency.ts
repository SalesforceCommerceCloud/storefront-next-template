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

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string): Intl.NumberFormat {
    const key = `${locale}:${currency}`;
    if (!formatterCache.has(key)) {
        formatterCache.set(
            key,
            new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                // this will keep the currency to use symbol for currency (e.g., $113 instead of USD 113) for all locales
                currencyDisplay: 'narrowSymbol',
            })
        );
    }
    return formatterCache.get(key) as Intl.NumberFormat;
}

/**
 * Format a number as a currency string
 * @param price - The price to format
 * @param locale - The locale to use for formatting
 * @param currency - The currency code to use
 * @returns Formatted currency string
 */
export function formatCurrency(price: number, locale: string, currency: string): string {
    return getFormatter(locale, currency).format(price);
}

/**
 * Return the number of decimal places used when displaying a currency.
 * @param currency - The ISO 4217 currency code to inspect
 * @returns The currency's maximum number of fractional digits
 */
export function getCurrencyFractionDigits(currency: string): number {
    return getFormatter('en', currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Extract the currency symbol for a given locale and currency code.
 * Uses the same narrowSymbol display as formatCurrency for consistency.
 * @param locale - The locale to use (e.g. "en-US", "de-DE")
 * @param currency - The ISO 4217 currency code (e.g. "USD", "EUR", "GBP")
 * @returns The narrow currency symbol (e.g. "$", "€", "£", "¥")
 */
export function getCurrencySymbol(locale: string, currency: string): string {
    return (
        getFormatter(locale, currency)
            .formatToParts(0)
            .find((part) => part.type === 'currency')?.value ?? currency
    );
}
