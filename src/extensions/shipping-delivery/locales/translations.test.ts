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
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const localeDirectory = resolve(__dirname);

describe('Shipping & Delivery translations', () => {
    it('defines the estimated-delivery-date heading in every locale', () => {
        const translationFiles = readdirSync(localeDirectory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(localeDirectory, entry.name, 'translations.json'));

        for (const translationFile of translationFiles) {
            const translations = JSON.parse(readFileSync(translationFile, 'utf-8')) as Record<string, unknown>;
            expect(translations.cardTitle).toEqual(expect.any(String));
        }
    });

    it('defines neutral delivery-date failure guidance in every locale', () => {
        const translationFiles = readdirSync(localeDirectory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(localeDirectory, entry.name, 'translations.json'));

        for (const translationFile of translationFiles) {
            const translations = JSON.parse(readFileSync(translationFile, 'utf-8')) as Record<string, unknown>;
            expect(translations.deliveryDatesUnavailable).toEqual(expect.any(String));
        }
    });

    it('defines the destination-change label in every locale', () => {
        const translationFiles = readdirSync(localeDirectory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(localeDirectory, entry.name, 'translations.json'));

        for (const translationFile of translationFiles) {
            const translations = JSON.parse(readFileSync(translationFile, 'utf-8')) as Record<string, unknown>;
            expect(translations.changeDestinationAriaLabel).toEqual(expect.any(String));
        }
    });
});
