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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCookie, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import {
    siteContextMiddleware,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    projectRecoveryCookies,
} from './site-context.server';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { isAuthRecoveryRequest } from '@/lib/auth/auth-recovery.server';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { setRecoveryManifest } from '@/test-utils/__mocks__/compiled-routes';

beforeEach(() => {
    vi.stubGlobal('window', undefined);
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    setRecoveryManifest();
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    setRecoveryManifest();
});

async function resolve(path: string, prefix = '', excludeRoutes = ['/resource/**', '/action/**']) {
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    setRecoveryManifest({ prefix, excludeRoutes });
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    const config = {
        ...mockConfig,
        defaultSiteId: 'RefArch',
        url: { ...mockConfig.url, prefix, excludeRoutes },
        localeAliasMap: { 'en-GB': 'uk' },
        siteAliasMap: { ...mockConfig.siteAliasMap },
        siteDetectionConfig: {
            order: ['cookie', 'path'] as NonNullable<AppConfig['siteDetectionConfig']>['order'],
            lookupQuerystring: 'store',
        },
        localeDetectionConfig: {
            order: ['cookie', 'path'] as NonNullable<AppConfig['localeDetectionConfig']>['order'],
            lookupQuerystring: 'language',
        },
    };
    const context = new RouterContextProvider();
    context.set(appConfigContext, config);
    const siteCookie = await createCookie('site_id').serialize('RefArch');
    const localeCookie = await createCookie('lng').serialize('en-US');
    const request = new Request(`https://example.com/site-a${path}`, {
        headers: { Cookie: `${siteCookie.split(';')[0]}; ${localeCookie.split(';')[0]}` },
    });
    const authSetup = vi.fn(() => Promise.resolve(new Response('OK')));
    const invoke = () =>
        siteContextMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, authSetup);
    return { context, authSetup, invoke, request, config };
}

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
it.each([
    ['/resource/auth-recovery///', '', ['/resource/**']],
    ['/unknown/xx/resource/auth-recovery//', '/:siteId/:localeId', []],
    ['/unknown/resource/auth-recovery///', '/:siteId/:localeId?', []],
    ['/shop/xx/unknown/resource/auth-recovery//', '/shop/:localeId/:siteId', []],
    ['/shop/resource/auth-recovery', '/shop/:merchant?/:siteId?', []],
    ['/shop/resource/auth-recovery', '/shop/:merchant.json?/:siteId?', []],
    ['/shop/.json/resource/auth-recovery', '/shop/:merchant?.json/:siteId?', []],
] as const)('pins explicit active aliases before auth setup on %s', async (path, prefix, exclusions) => {
    const run = await resolve(`${path}?store=global&language=uk`, prefix, [...exclusions]);
    expect(isAuthRecoveryRequest(run.request)).toBe(true);
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArchGlobal');
    expect(run.context.get(siteContext)?.locale.id).toBe('en-GB');
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it.each([
    'store=global&language=en-US',
    'store=global',
    'language=uk',
    'store=global&store=RefArch&language=uk',
    'store=&language=uk',
    'store=global&language=',
    'store=global&language=uk&language=uk',
    'store=%ZZ&language=uk',
    'store=%FF&language=uk',
    'store=global%2Fbad&language=uk',
    'store=global%5Cbad&language=uk',
    'store=global%00&language=uk',
    'store=global%0A&language=uk',
    'store=global&language=%ZZ',
])('rejects invalid explicit context before auth: %s', async (query) => {
    const run = await resolve(`/resource/auth-recovery///?${query}`);
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it.each([
    'store=unknown&language=uk',
    'store=global&language=unknown',
    'store=unknown&language=unknown',
])('redirects a well-formed unknown context to deployment root before auth: %s', async (query) => {
    const run = await resolve(`/resource/auth-recovery?${query}`);
    const response = await run.invoke();
    expect(response).toMatchObject({ status: 303 });
    expect(response?.headers.get('Location')).toBe('https://example.com/site-a/');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.getSetCookie()).toEqual([]);
    expect(run.authSetup).not.toHaveBeenCalled();
});

it.each([
    400, 409,
] as const)('delivers standalone %s HTML through the React Router resource middleware pipeline', async (status) => {
    const run = await resolve(
        `/resource/auth-recovery?store=${status === 400 ? '%ZZ' : 'global'}&language=uk&returnTo=%2Fcart`
    );
    if (status === 409) {
        run.context.set(appConfigContext, {
            ...run.config,
            siteDetectionConfig: { ...run.config.siteDetectionConfig, caches: [] },
            localeDetectionConfig: { ...run.config.localeDetectionConfig, caches: [] },
        });
    }
    const { createStaticHandler } = await import('react-router');
    const loader = vi.fn(() => new Response('Recovered'));
    const handler = createStaticHandler([
        {
            id: 'root',
            middleware: [
                (args, next) => siteContextMiddleware(args, async () => (await next()) as Response),
                run.authSetup,
            ],
            children: [{ id: 'recovery', path: '/site-a/resource/auth-recovery', loader }],
        },
    ]);
    const response = (await handler.queryRoute(run.request, {
        routeId: 'recovery',
        requestContext: run.context,
        generateMiddlewareResponse: async (queryRoute) => (await queryRoute(run.request)) as Response,
    })) as Response;
    expect(response.status).toBe(status);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    const html = await response.text();
    expect(html).toContain('<!doctype html><html lang="en-GB">');
    expect(html).toContain('href="/site-a/"');
    expect(html).not.toContain('<script');
    expect(run.authSetup).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
});

it('rejects ambiguous site aliases before auth', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk');
    run.config.siteAliasMap = { ...run.config.siteAliasMap, RefArch: 'global' };
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it.each([
    ['returnTo', 'language'],
    ['store', 'returnTo'],
    ['same', 'same'],
    ['', 'language'],
] as const)('rejects colliding or empty query keys %s / %s before auth', async (siteKey, localeKey) => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk');
    run.config.siteDetectionConfig.lookupQuerystring = siteKey;
    run.config.localeDetectionConfig.lookupQuerystring = localeKey;
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it.each([
    '/cart?store=RefArch',
    '/cart?language=en-US',
    '/RefArch/en-US/cart',
])('rejects destination identity disagreement before auth: %s', async (destination) => {
    const run = await resolve(
        `/resource/auth-recovery?store=global&language=uk&returnTo=${encodeURIComponent(destination)}`,
        '/:siteId/:localeId'
    );
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it('rejects an alias colliding with another site ID before auth', async () => {
    const run = await resolve('/resource/auth-recovery?store=RefArch&language=uk');
    run.config.siteAliasMap = { ...run.config.siteAliasMap, RefArchGlobal: 'RefArch' };
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it('rejects continuity conflict with cookie caches disabled before auth', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk&returnTo=%2Fcart');
    run.context.set(appConfigContext, {
        ...run.config,
        siteDetectionConfig: { ...run.config.siteDetectionConfig, caches: [] },
        localeDetectionConfig: { ...run.config.localeDetectionConfig, caches: [] },
    });
    await expect(run.invoke()).rejects.toMatchObject({ status: 409 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it('validates destination identity after legacy cookie-first detection before auth', async () => {
    const run = await resolve('/resource/auth-recovery?returnTo=%2Fcart%3Fstore%3Dglobal%26language%3Duk');
    run.config.siteDetectionConfig.order = ['querystring', 'cookie'];
    run.config.localeDetectionConfig.order = ['querystring', 'cookie'];
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it('recovers with the first cookie when differing duplicate context cookies are present', async () => {
    const run = await resolve('/resource/auth-recovery?returnTo=%2Fcart');
    const otherSite = (await createCookie('site_id').serialize('RefArchGlobal')).split(';')[0];
    const otherLocale = (await createCookie('lng').serialize('en-GB')).split(';')[0];
    run.request.headers.set('Cookie', `${run.request.headers.get('Cookie')}; ${otherSite}; ${otherLocale}`);
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArch');
    expect(run.context.get(siteContext)?.locale.id).toBe('en-US');
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it.each(['', 'store=RefArch&language=en-US&'])('allows identical duplicate context cookies: %s', async (query) => {
    const run = await resolve(`/resource/auth-recovery?${query}returnTo=%2Fcart`);
    const original = run.request.headers.get('Cookie');
    run.request.headers.set('Cookie', `${original}; ${original}`);
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArch');
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it('retains ordinary first-cookie detection for differing duplicate cookies outside recovery', async () => {
    const run = await resolve('/cart');
    const other = (await createCookie('site_id').serialize('RefArchGlobal')).split(';')[0];
    run.request.headers.set('Cookie', `${run.request.headers.get('Cookie')}; ${other}`);
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArch');
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it('preserves first-cookie semantics when projecting no writes', () => {
    const request = new Request('https://example.com/resource/auth-recovery', {
        headers: { Cookie: 'site_id=first; site_id=last; unrelated=keep' },
    });
    expect(projectRecoveryCookies(request, [])).toBe('site_id=first; unrelated=keep');
});

it('drops valueless cookie entries instead of mangling their names when projecting writes', () => {
    const request = new Request('https://example.com/resource/auth-recovery', {
        headers: { Cookie: 'site_id=old; flag; lng=en-US' },
    });
    expect(projectRecoveryCookies(request, ['site_id=new; Path=/'])).toBe('site_id=new; lng=en-US');
});

it('treats explicitly undefined cookie caches as disabled', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk&returnTo=%2Fcart');
    run.context.set(appConfigContext, {
        ...run.config,
        siteDetectionConfig: { ...run.config.siteDetectionConfig, caches: undefined },
        localeDetectionConfig: { ...run.config.localeDetectionConfig, caches: undefined },
    });
    await expect(run.invoke()).rejects.toMatchObject({ status: 409 });
    expect(run.authSetup).not.toHaveBeenCalled();
});

it('overlays context cookie writes on the request cookies without browser acceptance rules', () => {
    const request = new Request('https://example.com/resource/auth-recovery', {
        headers: { Cookie: 'site_id=old; lng=en-US; unrelated=keep' },
    });
    expect(projectRecoveryCookies(request, ['site_id=new; Path=/; Domain=com; Secure', 'extra=1; Path=/'])).toBe(
        'site_id=new; lng=en-US; unrelated=keep; extra=1'
    );
});

it('uses the SDK root path override and Max-Age precedence for context continuity', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk&returnTo=%2Fcart');
    run.context.set(appConfigContext, {
        ...run.config,
        siteContext: {
            ...run.config.siteContext,
            cookieOptions: { path: '/other', maxAge: 60, expires: new Date('2000-01-01T00:00:00Z') },
        },
    });
    const response = await run.invoke();
    expect(
        response?.headers
            .getSetCookie()
            .filter((cookie) => cookie.startsWith('site_id=') || cookie.startsWith('lng='))
            .every((cookie) => cookie.includes('Path=/;'))
    ).toBe(true);
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it('publishes configured context cookies and preserves identity on the ordinary next request', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk&returnTo=%2Fcart');
    const response = await run.invoke();
    const cookie = response?.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
    const context = new RouterContextProvider();
    context.set(appConfigContext, run.config);
    const request = new Request('https://example.com/site-a/cart', { headers: { Cookie: cookie ?? '' } });
    await siteContextMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, () => {
        expect(context.get(siteContext)?.site.id).toBe('RefArchGlobal');
        expect(context.get(siteContext)?.locale.id).toBe('en-GB');
        return Promise.resolve(new Response('OK'));
    });
});

it.each([
    '/global/cart',
    '/global/c/resource',
    '/global/c/action',
])('uses winning optional-prefix params for context continuity: %s', async (destination) => {
    const run = await resolve(
        `/resource/auth-recovery?store=global&language=uk&returnTo=${encodeURIComponent(destination)}`,
        '/:siteId/:localeId?'
    );
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArchGlobal');
    expect(run.context.get(siteContext)?.locale.id).toBe('en-GB');
    expect(run.authSetup).toHaveBeenCalledOnce();
});

it('rejects a locale alias colliding with a supported locale ID before auth', async () => {
    const run = await resolve('/resource/auth-recovery?store=global&language=uk');
    run.config.commerce = {
        ...run.config.commerce,
        sites: run.config.commerce.sites.map((site) =>
            site.id === 'RefArchGlobal'
                ? {
                      ...site,
                      supportedLocales: [
                          ...site.supportedLocales,
                          { id: 'uk', preferredCurrency: site.defaultCurrency },
                      ],
                  }
                : site
        ),
    };
    await expect(run.invoke()).rejects.toMatchObject({ status: 400 });
    expect(run.authSetup).not.toHaveBeenCalled();
});
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

it.each([
    '/resource/auth-recovery',
    '/cart?store=global&language=uk',
    '/c/resource/auth-recovery?store=global&language=uk',
])('retains cookie-first baseline outside explicit recovery: %s', async (path) => {
    const run = await resolve(path);
    await run.invoke();
    expect(run.context.get(siteContext)?.site.id).toBe('RefArch');
    expect(run.context.get(siteContext)?.locale.id).toBe('en-US');
});
