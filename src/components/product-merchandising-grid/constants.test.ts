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
import { describe, expect, test } from 'vitest';
import { resolveMerchandisingGridLayout } from './constants';

describe('resolveMerchandisingGridLayout', () => {
    test('derives the product limit from valid rows and columns', () => {
        expect(resolveMerchandisingGridLayout({ columns: 3, rows: 2 })).toEqual({
            columns: 3,
            rows: 2,
            limit: 6,
        });
    });

    test('normalizes untrusted Page Designer values to a bounded layout', () => {
        expect(resolveMerchandisingGridLayout({ columns: '5', rows: 999 })).toEqual({
            columns: 4,
            rows: 6,
            limit: 24,
        });
    });

    test('falls back for fractional and non-numeric values', () => {
        expect(resolveMerchandisingGridLayout({ columns: 2.5, rows: 'two' })).toEqual({
            columns: 4,
            rows: 2,
            limit: 8,
        });
    });
});
