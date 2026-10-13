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

import { expect } from 'chai';

Feature('SEO URL contracts').tag('@core').tag('@seo').tag('@desktop-only');

const { seoUrlPage } = inject();

const productPath = process.env.SEO_TEST_PRODUCT_PATH || '/p/25591227M';
const categoryPath = process.env.SEO_TEST_CATEGORY_PATH || '/c/womens';
const googlebotUserAgent = 'Googlebot/2.1 (+http://www.google.com/bot.html)';

const canonicalCases = [
    { name: 'product', path: productPath, ssrMarker: 'id="product-schema"' },
    { name: 'category', path: categoryPath, ssrMarker: 'id="category-schema"' },
] as const;

for (const testCase of canonicalCases) {
    Scenario(`${testCase.name} URL is canonical and crawler-readable`, async () => {
        const getResponse = await seoUrlPage.request(testCase.path, { userAgent: googlebotUserAgent });
        const headResponse = await seoUrlPage.request(testCase.path, {
            method: 'HEAD',
            userAgent: googlebotUserAgent,
        });

        expect(getResponse.status, `${testCase.name} GET status`).to.equal(200);
        expect(headResponse.status, `${testCase.name} HEAD status`).to.equal(getResponse.status);
        expect(getResponse.canonicalUrl, `${testCase.name} canonical URL`).to.equal(getResponse.requestUrl);
        expect(getResponse.body, `${testCase.name} SSR title`).to.include('<title');
        expect(getResponse.body, `${testCase.name} resource-specific SSR content`).to.include(testCase.ssrMarker);
    }).tag(`@seo-${testCase.name}`);
}

Scenario('stale SEO paths converge in one redirect', async () => {
    // A slug-path category needs an actual Business Manager URL mapping to make a stale slug resolvable.
    // Config-only CI legs use __NONE__ when no deterministic stale category URL exists in their fixture.
    const redirectCases = [
        {
            name: 'product',
            source: process.env.SEO_TEST_STALE_PRODUCT_PATH || '/p/outdated/25591227M',
            destination: productPath,
        },
        ...(process.env.SEO_TEST_STALE_CATEGORY_PATH === '__NONE__'
            ? []
            : [
                  {
                      name: 'category',
                      source: process.env.SEO_TEST_STALE_CATEGORY_PATH || '/c/outdated/womens',
                      destination: categoryPath,
                  },
              ]),
    ] as const;

    for (const testCase of redirectCases) {
        const response = await seoUrlPage.request(testCase.source);

        expect(response.status, `${testCase.name} redirect status`).to.equal(301);
        expect(response.locationPath, `${testCase.name} redirect location`).to.equal(
            seoUrlPage.sitePath(testCase.destination)
        );
    }
}).tag('@seo-redirect');

export {};
