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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => vi.stubGlobal('window', undefined));
afterEach(() => vi.unstubAllGlobals());
import { createStaticHandler, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { authStorageContext, AUTH_TOKEN_INVALID_ERROR } from '@/middlewares/auth.utils';
import { validateAuthRecoveryDestination } from '@/lib/auth/auth-recovery.server';
import { setRecoveryManifest } from '@/test-utils/__mocks__/compiled-routes';
beforeEach(() => setRecoveryManifest());
import { loader } from './resource.auth-recovery';

const config = {
    ...mockConfig,
    commerce: {
        ...mockConfig.commerce,
        sites: [...mockConfig.commerce.sites, { ...mockConfig.commerce.sites[1], id: 'MarketStreet' }],
    },
};
function recoveryContext() {
    const context = new RouterContextProvider();
    context.set(appConfigContext, config);
    context.set(authStorageContext, new Map());
    return context;
}
afterEach(() => vi.unstubAllEnvs());

it.each([
    'https://elsewhere.example/',
    '//elsewhere.example/',
    '//shop.example/category',
    '///shop.example/category',
    '/MarketStreet/en-US/AcTiOn/login',
    '/MarketStreet/en-US/%61ction/login',
    '/marketstreet/EN-us/%61ction/login',
    '/MarketStreet/en-US/%72esource/basket',
    '/MarketStreet/en-US/action',
    '/category/%ZZ',
    '/%ZZ/../cart',
    '/category/%E0%A4',
    '/category/%5c/../cart',
    '/category/%0a/../cart',
    '/a/..//elsewhere.example',
    '/\\shop.example/cart',
    ' https://elsewhere.example/',
    ' //shop.example/cart',
    '/cart\n',
    '/category.data',
    '/category%2edata',
    '/_root.data',
    '/action/login',
    '/resource/auth-recovery',
])('rejects unsafe recovery destination %s', (returnTo) => {
    const context = recoveryContext();
    expect(() =>
        loader({
            context,
            request: new Request(
                `https://shop.example/resource/auth-recovery?returnTo=${encodeURIComponent(returnTo)}`
            ),
        } as never)
    ).toThrow();
    expect(context.get(authStorageContext).has('error')).toBe(false);
});

it.each([
    '/',
    '/?site=global&lng=en-GB',
    '/MarketStreet/en-US/category?q=red%20shirt&refine=a&refine=b',
    '/category/action%2Fdetails',
    '/search?q=50%off',
    '/search?q=C:\\foo',
    '/search?q=%ZZ&refine=a&refine=b',
    '/c/resource',
    '/c/action',
    'https://shop.example/MarketStreet/en-US/cart?q=shirt',
])('preserves safe document destination %s', (returnTo) => {
    const context = recoveryContext();
    const response = loader({
        context,
        request: new Request(`https://shop.example/resource/auth-recovery?returnTo=${encodeURIComponent(returnTo)}`),
    } as never);
    const target = new URL(returnTo, 'https://shop.example');
    expect(response.headers.get('Location')).toBe(target.href);
});

it('requests auth recovery and a no-store document redirect to the same-origin page', () => {
    const context = recoveryContext();
    const response = loader({
        context,
        request: new Request(
            'https://shop.example/resource/auth-recovery?returnTo=%2FMarketStreet%2Fen-US%2Fcategory%3Fq%3Dshirt'
        ),
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://shop.example/MarketStreet/en-US/category?q=shirt');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(context.get(authStorageContext).get('error')).toBe(AUTH_TOKEN_INVALID_ERROR);
});

it.each([
    '/MarketStreet/en-US/cart?q=50%off',
    '/site-a/MarketStreet/en-US/cart?q=50%off',
])('redirects once under basename and revalidates idempotently: %s', async (returnTo) => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    const context = recoveryContext();
    const handler = createStaticHandler([{ path: '/resource/auth-recovery', loader }], { basename: '/site-a' });
    const response = await handler.query(
        new Request(`https://shop.example/site-a/resource/auth-recovery?returnTo=${encodeURIComponent(returnTo)}`),
        { requestContext: context }
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('Location')).toBe(
        'https://shop.example/site-a/MarketStreet/en-US/cart?q=50%off'
    );
    const canonical = validateAuthRecoveryDestination(returnTo, 'https://shop.example/site-a/resource/auth-recovery');
    expect(validateAuthRecoveryDestination(canonical, 'https://shop.example/site-a/resource/auth-recovery')).toBe(
        canonical
    );
});

it.each([
    '/:siteId/:localeId',
    '/shop/:localeId/:siteId',
    '',
])('checks the functional route after configured aliases (%s)', (prefix) => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    const aliasedConfig = { ...config, url: { ...config.url, prefix }, localeAliasMap: { 'en-GB': 'uk' } };
    setRecoveryManifest(aliasedConfig.url);
    const path =
        prefix === ''
            ? '/%72esource/basket'
            : prefix.startsWith('/shop')
              ? '/shop/uk/global/%72esource/basket'
              : '/global/uk/%72esource/basket';
    expect(() =>
        validateAuthRecoveryDestination(
            `/site-a${path}`,
            'https://shop.example/site-a/resource/auth-recovery?site=global&lng=uk'
        )
    ).toThrow();
    expect(
        validateAuthRecoveryDestination(
            prefix.startsWith('/shop') ? '/site-a/shop/uk/global/c/resource' : '/site-a/c/resource',
            'https://shop.example/site-a/resource/auth-recovery'
        )
    ).toBe(prefix.startsWith('/shop') ? '/site-a/shop/uk/global/c/resource' : '/site-a/c/resource');
});

it('checks functional routes for query-based context without consuming category segments', () => {
    const queryConfig = {
        ...config,
        url: { ...config.url, prefix: '', search: '?store=:siteId&language=:localeId' },
        siteDetectionConfig: { order: ['querystring'] as ['querystring'], lookupQuerystring: 'store' },
        localeDetectionConfig: { order: ['querystring'] as ['querystring'], lookupQuerystring: 'language' },
    };
    setRecoveryManifest(queryConfig.url);
    expect(() =>
        validateAuthRecoveryDestination(
            '/%61ction/login?store=global&language=en-GB',
            'https://shop.example/resource/auth-recovery'
        )
    ).toThrow();
    expect(
        validateAuthRecoveryDestination(
            '/c/resource?store=global&language=en-GB',
            'https://shop.example/resource/auth-recovery'
        )
    ).toBe('/c/resource?store=global&language=en-GB');
});

it('fails before auth mutation when the destination has no matching route', () => {
    const context = new RouterContextProvider();
    context.set(authStorageContext, new Map());
    expect(() =>
        loader({
            context,
            request: new Request(
                'https://shop.example/resource/auth-recovery?returnTo=%2Fglobal%2Fen-GB%2Fno-such-page'
            ),
        } as never)
    ).toThrow();
    expect(context.get(authStorageContext).has('error')).toBe(false);
});

it.each([
    ['/:siteId/:localeId', '/unknown/xx/%61ction/login'],
    ['/shop/:localeId/:siteId', '/shop/xx/unknown/%72esource/basket'],
    ['/:siteId/:localeId?', '/unknown/%72esource/basket'],
    ['/:siteId/:localeId?', '/unknown/xx/%61ction/login'],
])('rejects functional routes using dynamic router grammar %s: %s', (prefix, path) => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    const routeConfig = { ...config, url: { ...config.url, prefix, excludeRoutes: [] } };
    setRecoveryManifest(routeConfig.url);
    expect(() =>
        validateAuthRecoveryDestination(`/site-a${path}`, 'https://shop.example/site-a/resource/auth-recovery')
    ).toThrow();
});

it('retains an optional-prefix category slug when resources are excluded and rejects the bare resource', () => {
    const routeConfig = { ...config, url: { ...config.url, prefix: '/:siteId/:localeId?' } };
    setRecoveryManifest(routeConfig.url);
    expect(validateAuthRecoveryDestination('/c/resource', 'https://shop.example/resource/auth-recovery')).toBe(
        '/c/resource'
    );
    expect(() =>
        validateAuthRecoveryDestination('/%72esource/basket', 'https://shop.example/resource/auth-recovery')
    ).toThrow();
});

it.each([
    '/global/cart',
    '/global/c/resource',
    '/GLOBAL/c/AcTiOn',
    '/global/c/resource/basket',
    '/global/c/%72esource',
    '/global/c/%2572esource',
    '/',
    '/global/error-page',
])('accepts the winning document route without reserving category segments: %s', (destination) => {
    setRecoveryManifest({ prefix: '/:siteId/:localeId?', excludeRoutes: ['/resource/**', '/action/**'] });
    expect(validateAuthRecoveryDestination(destination, 'https://shop.example/resource/auth-recovery')).toBe(
        destination
    );
});

it.each([
    '/global/en-GB/no-such-page',
    '/RESOURCE/basket',
    '/%72esource/basket',
])('rejects the unknown or resource winning route: %s', (destination) => {
    expect(() => validateAuthRecoveryDestination(destination, 'https://shop.example/resource/auth-recovery')).toThrow();
});

it('accepts an unknown path when the app has a document catch-all, but still rejects resource winners', () => {
    setRecoveryManifest(undefined, { catchAll: true });
    const requestUrl = 'https://shop.example/resource/auth-recovery';
    expect(validateAuthRecoveryDestination('/MarketStreet/en-US/no-such-page', requestUrl)).toBe(
        '/MarketStreet/en-US/no-such-page'
    );
    expect(() => validateAuthRecoveryDestination('/resource/basket', requestUrl)).toThrow();
    expect(() => validateAuthRecoveryDestination('/%72esource/basket', requestUrl)).toThrow();
});
