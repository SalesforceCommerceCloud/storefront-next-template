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
import { RouterContextProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';

import { createTestContext } from '@/lib/test-utils';
import { buildUrlFromContext, stripMrtBasePathFromUrl } from './url.server';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function createUrlContext(siteAlias = 'global'): RouterContextProvider {
    const context = createTestContext({
        locale: 'en-US',
        appConfig: { url: { prefix: '/:siteId/:localeId' } },
    }) as RouterContextProvider;
    const currentSiteContext = context.get(siteContext);
    if (!currentSiteContext) throw new Error('Expected site context');
    context.set(siteContext, {
        ...currentSiteContext,
        site: { ...currentSiteContext.site, alias: siteAlias },
    });
    return context;
}

describe('buildUrlFromContext', () => {
    it('keeps the MRT base path when the site alias matches it', () => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(buildUrlFromContext('/login', createUrlContext('shop'))).toBe('/shop/shop/en-US/login');
    });

    it.each([
        ['/shop', '/shop/global/en-US/shop'],
        ['/shop/sale', '/shop/global/en-US/shop/sale'],
    ])('keeps the MRT base path when the application route %s collides with it', (to, expected) => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(buildUrlFromContext(to, createUrlContext())).toBe(expected);
    });

    it('applies the MRT base path to the application root', () => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(buildUrlFromContext('/', createUrlContext())).toBe('/shop/');
    });

    it.each([
        'https://example.com/sale',
        '//example.com/sale',
    ])('does not apply the MRT base path to external target %s', (to) => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(buildUrlFromContext(to, createUrlContext())).toBe(to);
    });
});

describe('stripMrtBasePathFromUrl', () => {
    it('removes an MRT base path while preserving query parameters and fragments', () => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(stripMrtBasePathFromUrl('/shop/cart?coupon=fall#summary')).toBe('/cart?coupon=fall#summary');
    });

    it('normalizes the exact MRT base path to the application root', () => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(stripMrtBasePathFromUrl('/shop?source=login')).toBe('/?source=login');
    });

    it('leaves unrelated and external URLs unchanged', () => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');

        expect(stripMrtBasePathFromUrl('/shopping/cart')).toBe('/shopping/cart');
        expect(stripMrtBasePathFromUrl('https://example.com/shop/cart')).toBe('https://example.com/shop/cart');
        expect(stripMrtBasePathFromUrl('//example.com/shop/cart')).toBe('//example.com/shop/cart');
    });
});
