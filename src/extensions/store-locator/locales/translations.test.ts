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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('has preference and account key parity with truthful checking in all 17 source locales', () => {
    const locales = readdirSync(__dirname, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(locales).toHaveLength(17);
    for (const locale of locales) {
        const extension = JSON.parse(readFileSync(resolve(__dirname, locale.name, 'translations.json'), 'utf8'));
        const feedback = extension.storeLocator.selection;
        expect(Object.keys(feedback).sort()).toEqual(['checking', 'clearing', 'error', 'retry', 'saving', 'unknown']);
        expect(feedback.checking).not.toBe(feedback.saving);
        for (const text of Object.values(feedback)) expect(String(text).trim()).not.toBe('');
        const account = JSON.parse(
            readFileSync(resolve(__dirname, '../../../locales', locale.name, 'translations.json'), 'utf8')
        ).account.storePreferences.preferredStore;
        expect(Object.keys(account)).not.toContain('clearStore');
        expect(account.savedStoreUnavailable.trim()).not.toBe('');
        expect(Object.keys(account)).not.toContain('sharedProfile' + 'ClearWarning');
    }
});
