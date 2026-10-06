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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The inline cart quantity control reports an optimistic-update failure with
 * `quantityUpdateFailed` or `insufficientStock`. Locale modules are typed as
 * partial English resources, so missing strings silently fall back to English
 * at runtime. Keep those shopper-visible errors translated in every locale.
 */
const LOCALES_DIR = resolve(__dirname);
const KEYS = ['quantityUpdateFailed', 'insufficientStock'] as const;

const supportedLocales = readdirSync(LOCALES_DIR).filter((name) => statSync(resolve(LOCALES_DIR, name)).isDirectory());
const nonEnglishLocales = supportedLocales.filter((locale) => !locale.startsWith('en-'));

const quantitySelectorOf = (locale: string): Record<string, unknown> => {
    const json = JSON.parse(readFileSync(resolve(LOCALES_DIR, locale, 'translations.json'), 'utf-8'));
    return (json.quantitySelector ?? {}) as Record<string, unknown>;
};

const englishQuantitySelector = quantitySelectorOf('en-US');

describe('quantitySelector inline-cart error locale completeness', () => {
    it('discovers the supported locales and English reference values', () => {
        expect(supportedLocales).toEqual(expect.arrayContaining(['en-US', 'en-GB']));
        expect(nonEnglishLocales.length).toBeGreaterThan(0);

        for (const key of KEYS) {
            expect(typeof englishQuantitySelector[key]).toBe('string');
            expect((englishQuantitySelector[key] as string).trim()).not.toBe('');
        }
    });

    it.each(supportedLocales)('%s defines each inline-cart error message', (locale) => {
        const quantitySelector = quantitySelectorOf(locale);

        for (const key of KEYS) {
            const value = quantitySelector[key];
            expect(typeof value, `quantitySelector.${key} is missing from ${locale}`).toBe('string');
            expect((value as string).trim(), `quantitySelector.${key} is empty in ${locale}`).not.toBe('');
        }
    });

    it.each(nonEnglishLocales)('%s translates each inline-cart error message', (locale) => {
        const quantitySelector = quantitySelectorOf(locale);

        for (const key of KEYS) {
            expect(quantitySelector[key], `quantitySelector.${key} in ${locale} is still the English string`).not.toBe(
                englishQuantitySelector[key]
            );
        }
    });
});
