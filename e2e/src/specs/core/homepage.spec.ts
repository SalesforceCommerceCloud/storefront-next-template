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

Feature('Storefront Core Tests').tag('@core');

const { storefrontPage } = inject();
import { expect } from 'chai';

Scenario('Homepage loads and sets SFCC cookies', async () => {
    // Navigate to the storefront homepage
    storefrontPage.navigate();

    // Verify page has loaded (waits for nav), then check the title resolved.
    // This spec ships flattened into every vertical mirror (fashion →
    // "Storefront Next: Market Street", cosmetic → "Beauty Next") and into
    // customer projects that rebrand the store, so we assert brand-agnostically:
    // the title must resolve to a real store name — we do NOT couple to any
    // prefix or specific brand, which would break the other mirrors.
    storefrontPage.validatePageLoaded();

    const title = await storefrontPage.getTitle();
    // (a) non-empty, and (b) an actually-resolved name rather than an unresolved
    // i18next key. When the site-name namespace fails to load, i18next echoes the
    // raw dotted key (e.g. "meta.title" / "common.defaultSiteName"); a bare /\S/
    // check would pass on that. Rejecting the dotted-key shape restores the
    // "the site name actually resolved" guarantee without coupling to a brand.
    expect(title, 'Homepage title should resolve a non-empty store name').to.match(/\S/);
    expect(title, 'Homepage title should be a resolved store name, not an unresolved i18n key').to.not.match(
        /^[a-z][\w-]*(?:\.[\w-]+)+$/
    );

    // Validate that SFCC cookies are properly set (storefront domain only)
    await storefrontPage.validateSFCCCookies();
})
    .tag('@homepage')
    .tag('@cookies')
    .tag('@smoke');

Scenario('Homepage displays product tiles', async () => {
    // Navigate to the storefront homepage
    storefrontPage.navigate();

    // Verify page has loaded successfully
    storefrontPage.validatePageLoaded();

    // Check that product tiles are displayed
    const productCount = await storefrontPage.getProductCount();

    // Verify we have at least some products displayed
    expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);
})
    .tag('@homepage')
    .tag('@products')
    .tag('@smoke');
