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
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The header mega-menu renders a "Shop all {category}" link at the top of every
 * open desktop panel (see navigation-menu-mega). Locale files are typed
 * `satisfies DeepPartial<typeof enGB>`, so a missing key is NOT a type error —
 * it silently falls back to English at runtime. A translation that is only added
 * to en-US/en-GB therefore ships English text on every other localized
 * storefront with no compile-time or snapshot signal.
 *
 * This guard fails loudly if any supported locale is missing `header.shopAllCategory`,
 * drops its `{{category}}` interpolation, or still carries the untranslated
 * English string, so the parent-category link is always shown in the shopper's
 * language.
 */
const LOCALES_DIR = resolve(__dirname);
const KEY = 'shopAllCategory';

const supportedLocales = readdirSync(LOCALES_DIR).filter((name) => statSync(resolve(LOCALES_DIR, name)).isDirectory());

const headerOf = (locale: string): Record<string, unknown> => {
    const json = JSON.parse(readFileSync(resolve(LOCALES_DIR, locale, 'translations.json'), 'utf-8'));
    return (json.header ?? {}) as Record<string, unknown>;
};

const englishValue = headerOf('en-US')[KEY] as string;
const nonEnglishLocales = supportedLocales.filter((locale) => !locale.startsWith('en-'));

describe(`header.${KEY} locale completeness`, () => {
    it('discovers the supported locales and the English reference string', () => {
        // Sanity: en-US and en-GB must both exist and define the key so the
        // comparisons below are meaningful.
        expect(supportedLocales).toEqual(expect.arrayContaining(['en-US', 'en-GB']));
        expect(nonEnglishLocales.length).toBeGreaterThan(0);
        expect(typeof englishValue).toBe('string');
        expect(englishValue).toContain('{{category}}');
    });

    it.each(supportedLocales)(`%s defines header.${KEY} with the {{category}} placeholder`, (locale) => {
        const value = headerOf(locale)[KEY];
        expect(typeof value, `header.${KEY} is missing from ${locale}`).toBe('string');
        expect((value as string).trim(), `header.${KEY} is empty in ${locale}`).not.toBe('');
        expect(value as string, `header.${KEY} dropped the {{category}} placeholder in ${locale}`).toContain(
            '{{category}}'
        );
    });

    it.each(nonEnglishLocales)(`%s translates header.${KEY} rather than falling back to English`, (locale) => {
        expect(headerOf(locale)[KEY], `header.${KEY} in ${locale} is still the English string`).not.toBe(englishValue);
    });
});
