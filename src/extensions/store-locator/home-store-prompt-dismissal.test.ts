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
import {
    getHomeStorePromptDismissalCookieName,
    isHomeStorePromptDismissed,
    serializeHomeStorePromptDismissalCookie,
} from './home-store-prompt-dismissal';

describe('home-store-prompt dismissal cookie', () => {
    test('uses a site-namespaced cookie name', () => {
        expect(getHomeStorePromptDismissalCookieName('RefArchGlobal')).toBe(
            'store-locator-home-prompt-dismissed_RefArchGlobal'
        );
    });

    test('accepts only the dismissal marker for the current site', () => {
        const cookieHeader =
            'store-locator-home-prompt-dismissed_RefArch=1; store-locator-home-prompt-dismissed_RefArchGlobal=0';

        expect(isHomeStorePromptDismissed(cookieHeader, 'RefArch')).toBe(true);
        expect(isHomeStorePromptDismissed(cookieHeader, 'RefArchGlobal')).toBe(false);
    });

    test('serializes a session cookie with the configured domain', () => {
        expect(
            serializeHomeStorePromptDismissalCookie({
                siteId: 'RefArchGlobal',
                cookieDomain: '.example.com',
                secure: true,
            })
        ).toBe(
            'store-locator-home-prompt-dismissed_RefArchGlobal=1; Path=/; SameSite=Lax; Domain=.example.com; Secure'
        );
    });
});
