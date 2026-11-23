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

import { describe, expect, it } from 'vitest';
import { resolveAnalyticsCurrency } from './currency';

const encode = (value: unknown) => encodeURIComponent(btoa(JSON.stringify(value)));

describe('resolveAnalyticsCurrency', () => {
    it.each([undefined, 'currency.v2'])('decodes cookie %s and prefers it to site context', (cookieName) => {
        expect(
            resolveAnalyticsCurrency(
                `currency=${encode(cookieName ? 'USD' : 'EUR')}; currency.v2=${encode('EUR')}`,
                cookieName,
                ['USD', 'EUR'],
                'USD'
            )
        ).toBe('EUR');
    });

    it.each([
        '',
        'currency=',
        'currency=%%%bad',
        ...[null, 42, {}, '', 'JPY', 'eur'].map((value) => `currency=${encode(value)}`),
    ])('falls back for unusable cookie %s', (header) => {
        expect(resolveAnalyticsCurrency(header, 'currency', ['USD', 'EUR'], 'EUR')).toBe('EUR');
    });
});
