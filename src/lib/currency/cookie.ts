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

import { parseCookie } from '@/lib/cookie';

/** Read the currency cookie the site-context middleware writes; currency codes are plain strings. */
export function parseCurrencyCookie(cookieHeader: string, cookieName: string): string | null {
    const value = parseCookie(cookieHeader, cookieName);
    return typeof value === 'string' ? value : null;
}

/** Return the value only if it is a supported currency for this site; else null. */
export function validateCurrency(value: string | null, supportedCurrencies: string[]): string | null {
    return value !== null && value !== '' && supportedCurrencies.includes(value) ? value : null;
}
