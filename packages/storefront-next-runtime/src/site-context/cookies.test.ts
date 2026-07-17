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

import { describe, it, expect } from 'vitest';
import { createCurrencyCookie, createSiteContextCookie } from './cookies';

// BUNDLE_ID is unset in the test env, so isRemote() is false and no `Secure`
// attribute is emitted — HttpOnly is the only attribute under test here.
describe('site-context cookies httpOnly posture', () => {
    it('currency cookie is JS-readable (no HttpOnly) when created with httpOnly:false', async () => {
        const cookie = createCurrencyCookie('currency', { httpOnly: false });
        const header = await cookie.serialize('GBP');
        expect(header).not.toMatch(/HttpOnly/i);
    });

    it('site and locale cookies remain HttpOnly by default', async () => {
        const siteHeader = await createSiteContextCookie('site').serialize('site-us');
        const localeHeader = await createSiteContextCookie('locale').serialize('en-GB');
        expect(siteHeader).toMatch(/HttpOnly/i);
        expect(localeHeader).toMatch(/HttpOnly/i);
    });
});
