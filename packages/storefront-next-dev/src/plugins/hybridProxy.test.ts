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
import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import type { ViteDevServer } from 'vite';
import {
    shouldSkipProxy,
    rewriteCookieForLocalhost,
    rewriteLocationForProxy,
    rewriteToSfraPath,
    hybridProxyPlugin,
} from './hybridProxy';

describe('shouldSkipProxy', () => {
    describe('Vite internals — always skip', () => {
        it.each([
            '/@vite/client',
            '/@fs/Users/dev/src/app.tsx',
            '/@id/virtual:react-router/browser-manifest',
            '/__vite_ping',
            '/__open-in-editor',
        ])('skips %s', (path) => {
            expect(shouldSkipProxy(path)).toBe(true);
        });
    });

    describe('source and asset files — skip', () => {
        it.each([
            '/src/components/header/index.tsx',
            '/node_modules/react/index.js',
            '/route.data',
            '/product/123.data',
            '/mobify/proxy/api/shopper-products',
            '/bundle.js',
            '/styles.css',
            '/logo.svg',
            '/font.woff2',
            '/image.png',
            '/image.jpg',
            '/image.jpeg',
            '/image.webp',
            '/favicon.ico',
            '/data.json',
            '/sourcemap.js.map',
        ])('skips %s', (path) => {
            expect(shouldSkipProxy(path)).toBe(true);
        });
    });

    describe('SFRA paths — never skip (must proxy to SFCC)', () => {
        it.each([
            '/on/demandware.static/Sites-RefArchGlobal-Site/default/styles.css',
            '/on/demandware.static/Sites-RefArchGlobal-Site/default/logo.png',
            '/on/demandware.store/Sites-RefArchGlobal-Site/en_GB/Cart-Show',
            '/on/demandware.store/Sites-RefArchGlobal-Site/en_GB/Product-Show',
        ])('does not skip %s', (path) => {
            expect(shouldSkipProxy(path)).toBe(false);
        });
    });

    describe('app routes — do not skip (proxy decision deferred to routing rules)', () => {
        it.each([
            '/cart',
            '/checkout',
            '/s/RefArchGlobal/en_GB/Cart-Show',
            '/my-account',
        ])('does not skip %s', (path) => {
            expect(shouldSkipProxy(path)).toBe(false);
        });
    });
});

describe('rewriteCookieForLocalhost', () => {
    it('rewrites SFCC domain to localhost', () => {
        const input = 'dwsid=abc123; Domain=.salesforce.com; Path=/; HttpOnly';
        expect(rewriteCookieForLocalhost(input)).toBe('dwsid=abc123; Domain=localhost; Path=/; HttpOnly');
    });

    it('preserves the Secure flag (localhost is a secure context)', () => {
        const input = 'dwsid=abc123; Path=/; Secure; HttpOnly';
        expect(rewriteCookieForLocalhost(input)).toContain('Secure');
    });

    it('rewrites domain and preserves Secure and SameSite', () => {
        const input = 'dwsid=abc123; Domain=.salesforce.com; Path=/; Secure; SameSite=None; HttpOnly';
        const result = rewriteCookieForLocalhost(input);
        expect(result).toContain('Domain=localhost');
        expect(result).toContain('Secure');
        expect(result).toContain('SameSite=None');
        expect(result).not.toContain('.salesforce.com');
    });

    it('adds Domain=localhost when no Domain attribute is present', () => {
        const input = 'dwsid=abc123; Path=/; HttpOnly';
        expect(rewriteCookieForLocalhost(input)).toContain('Domain=localhost');
    });

    it('handles Domain= case-insensitively', () => {
        const input = 'sid=xyz; DOMAIN=.example.com; Path=/';
        const result = rewriteCookieForLocalhost(input);
        expect(result).toContain('Domain=localhost');
        expect(result).not.toContain('.example.com');
    });

    it('does not double-add Domain when it is already localhost', () => {
        const input = 'sid=xyz; Domain=localhost; Path=/';
        const result = rewriteCookieForLocalhost(input);
        expect(result.match(/Domain=/gi)).toHaveLength(1);
    });

    it('rewrites the full SFCC cookie pattern: only Domain changes', () => {
        const input = 'dwsid=abc123; Domain=.salesforce.com; Path=/; Secure; SameSite=None; HttpOnly';
        const result = rewriteCookieForLocalhost(input);
        expect(result).toBe('dwsid=abc123; Domain=localhost; Path=/; Secure; SameSite=None; HttpOnly');
    });

    it('leaves SameSite=Lax, SameSite=Strict, and SameSite=None unchanged', () => {
        expect(rewriteCookieForLocalhost('sid=xyz; SameSite=Lax')).toContain('SameSite=Lax');
        expect(rewriteCookieForLocalhost('sid=xyz; SameSite=Strict')).toContain('SameSite=Strict');
        expect(rewriteCookieForLocalhost('sid=xyz; SameSite=None; Secure')).toContain('SameSite=None');
    });
});

/**
 * Integration tests for the proxyRes handler. The plugin's response handling is too
 * stateful to mock cleanly — http-proxy emits real events on real streams — so we
 * boot a one-shot upstream HTTP server, point the plugin at it, and run the plugin's
 * configureServer middleware as a real reverse proxy. Each test owns its lifecycle
 * (kept under afterEach) so failures don't leak sockets between tests.
 */
describe('proxyRes handler — SFRA plugin_redirect 200+Location normalization', () => {
    const servers: http.Server[] = [];

    afterEach(async () => {
        await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    });

    type ProxyContext = {
        proxyUrl: string;
        proxyHost: string;
        upstreamUrl: string;
    };

    /**
     * Boot an upstream HTTP server with `upstreamHandler`, then a proxy server backed
     * by `hybridProxyPlugin` pointing at it. `routeMatcher` returns false for everything
     * so the plugin always proxies — we're exercising the proxyRes path, not routing.
     */
    async function startProxy(
        upstreamHandler: (req: http.IncomingMessage, res: http.ServerResponse, ctx: { upstreamUrl: string }) => void,
        pluginOverrides: Partial<Parameters<typeof hybridProxyPlugin>[0]> = {}
    ): Promise<ProxyContext> {
        // Stand the upstream up first so we know its port before the handler runs
        let upstreamUrl = '';
        const upstream = http.createServer((req, res) => upstreamHandler(req, res, { upstreamUrl }));
        servers.push(upstream);
        await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
        const upstreamPort = (upstream.address() as AddressInfo).port;
        upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

        const plugin = hybridProxyPlugin({
            enabled: true,
            targetOrigin: upstreamUrl,
            routingRules: '',
            routeMatcher: () => false,
            defaultSiteId: 'RefArchGlobal',
            locale: 'en-GB',
            ...pluginOverrides,
        });

        // Mimic Vite's middleware registration so the plugin attaches its handler
        let middleware: http.RequestListener | undefined;
        const fakeServer = {
            middlewares: {
                use: (handler: http.RequestListener) => {
                    middleware = handler;
                },
            },
        } as unknown as ViteDevServer;
        const configure = plugin.configureServer as (server: ViteDevServer) => void;
        configure(fakeServer);
        if (!middleware) throw new Error('hybridProxyPlugin did not register a middleware');

        const proxy = http.createServer(middleware);
        servers.push(proxy);
        await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const proxyPort = (proxy.address() as AddressInfo).port;
        return {
            proxyUrl: `http://127.0.0.1:${proxyPort}`,
            proxyHost: `127.0.0.1:${proxyPort}`,
            upstreamUrl,
        };
    }

    /**
     * Issue a request through the proxy without following redirects so we can assert
     * on the 302 directly. Node's `http.request` with no redirect handling is enough.
     */
    function request(
        url: string,
        path: string
    ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
        return new Promise((resolve, reject) => {
            const req = http.request(`${url}${path}`, { method: 'GET' }, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        statusCode: res.statusCode || 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                    })
                );
            });
            req.on('error', reject);
            req.end();
        });
    }

    it('converts upstream 200+Location into a 302 with localhost-rewritten Location', async () => {
        // Upstream simulates SFRA plugin_redirect: 200 OK + Location header pointing at itself
        const ctx = await startProxy((_req, res, { upstreamUrl }) => {
            res.writeHead(200, {
                'content-type': 'text/html',
                location: `${upstreamUrl}/`,
            });
            res.end('<html>blank page that the browser would render</html>');
        });

        const response = await request(ctx.proxyUrl, '/cart');

        expect(response.statusCode).toBe(302);
        // Location must point at the proxy host, not the upstream
        expect(response.headers.location).toContain(ctx.proxyHost);
        expect(response.headers.location).not.toContain(new URL(ctx.upstreamUrl).host);
        // 302 short-circuit body should be empty — the SFRA blank page was discarded
        expect(response.body).toBe('');
    });

    it('preserves Set-Cookie headers when normalizing 200+Location → 302', async () => {
        const ctx = await startProxy((_req, res, { upstreamUrl }) => {
            res.writeHead(200, {
                'content-type': 'text/html',
                location: `${upstreamUrl}/`,
                'set-cookie': ['dwsid=xyz; Domain=.salesforce.com; Path=/'],
            });
            res.end('blank');
        });

        const response = await request(ctx.proxyUrl, '/cart');

        expect(response.statusCode).toBe(302);
        const setCookie = response.headers['set-cookie'];
        expect(setCookie).toBeDefined();
        // Cookie rewrite still applied — sessions must survive the 200→302 conversion
        expect((setCookie ?? []).join(';')).toContain('Domain=localhost');
    });

    it('leaves a plain 200 (no Location) on the body-rewrite path unchanged', async () => {
        const ctx = await startProxy((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<html><head></head><body>real page content</body></html>');
        });

        const response = await request(ctx.proxyUrl, '/cart');

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('real page content');
        expect(response.headers.location).toBeUndefined();
    });

    it('leaves a 3xx redirect alone (does not double-normalize)', async () => {
        const ctx = await startProxy((_req, res, { upstreamUrl }) => {
            res.writeHead(301, {
                location: `${upstreamUrl}/elsewhere`,
            });
            res.end();
        });

        const response = await request(ctx.proxyUrl, '/cart');

        // Status preserved as 301 — the 200→302 normalization must not touch real 3xx
        expect(response.statusCode).toBe(301);
        expect(response.headers.location).toContain(ctx.proxyHost);
    });

    it('does not convert 200+Location when Location points outside targetOrigin', async () => {
        // 200+external-Location is not the plugin_redirect case — flow through unchanged
        // so the proxy never coerces the browser to follow an arbitrary external URL.
        const ctx = await startProxy((_req, res) => {
            res.writeHead(200, {
                'content-type': 'text/html',
                location: 'https://example.com/elsewhere',
            });
            res.end('<html>body</html>');
        });

        const response = await request(ctx.proxyUrl, '/cart');

        expect(response.statusCode).toBe(200);
        expect(response.headers.location).toBe('https://example.com/elsewhere');
        expect(response.body).toContain('body');
    });

    it('strips Set-Cookie when upstream returns 200+Location pointing at /404', async () => {
        // SFRA `plugin_redirect` 200+Location aimed at the SFCC 404 page would otherwise
        // forward SFRA's session-clear cookies to the browser as a "real" redirect —
        // wiping the hybrid session over what is just a missing route. The safety-net
        // gate must catch this shape so the cookie strip happens *before* the
        // 200→302 normalization runs. The 302 still fires (so the shopper lands on
        // the 404 page rather than on a blank-rendered 200 body), just without the
        // session-clearing Set-Cookie.
        const ctx = await startProxy((_req, res, { upstreamUrl }) => {
            res.writeHead(200, {
                'content-type': 'text/html',
                location: `${upstreamUrl}/on/demandware.store/Sites-Site/default/404`,
                'set-cookie': ['dwsid=; Domain=.salesforce.com; Path=/; Max-Age=0'],
            });
            res.end('blank');
        });

        const response = await request(ctx.proxyUrl, '/missing-route');

        expect(response.statusCode).toBe(302);
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    describe('path rewrite — wiring through proxyReq', () => {
        /** Capture the path the upstream receives, echo it back so the test can assert on it. */
        const echoPath = (req: http.IncomingMessage, res: http.ServerResponse) => {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(`<html>${req.url}</html>`);
        };

        it('does not double-stack the locale for a /:localeId-prefixed path (the escalation repro)', async () => {
            const ctx = await startProxy(echoPath, {
                urlPrefix: '/:localeId',
                localeAliases: ['en-GB', 'uk'],
                siteAliases: ['RefArchGlobal', 'global'],
            });

            const response = await request(ctx.proxyUrl, '/uk/cart');

            // Reuses the path's own locale instead of /s/RefArchGlobal/en-GB/uk/cart.
            expect(response.body).toContain('/s/RefArchGlobal/uk/cart');
        });

        it('preserves the query string across the SFRA rewrite', async () => {
            const ctx = await startProxy(echoPath, {
                urlPrefix: '/:localeId',
                localeAliases: ['en-GB', 'uk'],
                siteAliases: ['RefArchGlobal', 'global'],
            });

            const response = await request(ctx.proxyUrl, '/uk/cart?foo=bar&baz=1');

            expect(response.body).toContain('/s/RefArchGlobal/uk/cart?foo=bar&baz=1');
        });

        it('honors the rewritePath escape hatch when provided', async () => {
            const ctx = await startProxy(echoPath, {
                rewritePath: (pathname) => `/custom${pathname}`,
            });

            const response = await request(ctx.proxyUrl, '/cart?x=1');

            expect(response.body).toContain('/custom/cart?x=1');
        });

        it('falls back to the built-in rewrite when rewritePath returns null', async () => {
            const ctx = await startProxy(echoPath, {
                rewritePath: () => null,
            });

            const response = await request(ctx.proxyUrl, '/cart');

            expect(response.body).toContain('/s/RefArchGlobal/en-GB/cart');
        });
    });
});

describe('rewriteLocationForProxy', () => {
    const targetOrigin = 'https://zzrf-001.dx.commercecloud.salesforce.com';
    const proxyOrigin = 'http://localhost:5173';

    it('rewrites SFCC origin in absolute Location URLs to the proxy origin', () => {
        const result = rewriteLocationForProxy({
            locationHeader: `${targetOrigin}/s/RefArchGlobal/en-GB/cart`,
            requestUrl: '/cart',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({ kind: 'rewritten', url: `${proxyOrigin}/s/RefArchGlobal/en-GB/cart` });
    });

    it('preserves the original request query params when SFCC strips them on redirect', () => {
        // Repro for W-22582530: user visits /cart?foo=bar; SFCC redirects to its
        // canonical Cart-Show URL without the user's query string. The proxy must
        // carry foo=bar through so the destination page receives it.
        const result = rewriteLocationForProxy({
            locationHeader: `${targetOrigin}/s/RefArchGlobal/en-GB/Cart-Show`,
            requestUrl: '/cart?foo=bar',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({
            kind: 'rewritten',
            url: `${proxyOrigin}/s/RefArchGlobal/en-GB/Cart-Show?foo=bar`,
        });
    });

    it('preserves multi-value request query keys when the redirect target has none', () => {
        // SFRA refinements and promo lists commonly repeat the same key
        // (e.g. ?pmid=PROMO1&pmid=PROMO2). All values must survive the merge.
        const result = rewriteLocationForProxy({
            locationHeader: `${targetOrigin}/s/RefArchGlobal/en-GB/Cart-Show`,
            requestUrl: '/cart?pmid=PROMO1&pmid=PROMO2',
            targetOrigin,
            proxyOrigin,
        });
        expect(result.kind).toBe('rewritten');
        const parsed = new URL((result as { kind: 'rewritten'; url: string }).url);
        expect(parsed.searchParams.getAll('pmid')).toEqual(['PROMO1', 'PROMO2']);
    });

    it('lets the redirect target win on key collisions', () => {
        // If SFCC intentionally sets ?step=2 on the redirect, that wins over the
        // user's ?step=1 — SFCC owns the destination page semantics.
        const result = rewriteLocationForProxy({
            locationHeader: `${targetOrigin}/s/RefArchGlobal/en-GB/checkout?step=2`,
            requestUrl: '/checkout?step=1&foo=bar',
            targetOrigin,
            proxyOrigin,
        });
        expect(result.kind).toBe('rewritten');
        const parsed = new URL((result as { kind: 'rewritten'; url: string }).url);
        expect(parsed.searchParams.get('step')).toBe('2');
        expect(parsed.searchParams.get('foo')).toBe('bar');
    });

    it('preserves the hash fragment from the redirect target', () => {
        const result = rewriteLocationForProxy({
            locationHeader: `${targetOrigin}/s/RefArchGlobal/en-GB/cart#summary`,
            requestUrl: '/cart?foo=bar',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({
            kind: 'rewritten',
            url: `${proxyOrigin}/s/RefArchGlobal/en-GB/cart?foo=bar#summary`,
        });
    });

    it('handles relative Location headers as same-origin', () => {
        // SFCC sometimes returns relative paths in Location.
        const result = rewriteLocationForProxy({
            locationHeader: '/s/RefArchGlobal/en-GB/Cart-Show',
            requestUrl: '/cart?foo=bar',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({
            kind: 'rewritten',
            url: `${proxyOrigin}/s/RefArchGlobal/en-GB/Cart-Show?foo=bar`,
        });
    });

    it('returns off-origin for Location headers pointing elsewhere', () => {
        const result = rewriteLocationForProxy({
            locationHeader: 'https://example.com/somewhere',
            requestUrl: '/cart?foo=bar',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({ kind: 'off-origin' });
    });

    it('returns malformed for unparseable Location headers', () => {
        const result = rewriteLocationForProxy({
            locationHeader: 'http://[::bad-url',
            requestUrl: '/cart',
            targetOrigin,
            proxyOrigin,
        });
        expect(result).toEqual({ kind: 'malformed' });
    });
});

describe('rewriteToSfraPath', () => {
    const SITE = 'RefArchGlobal';
    const LOCALE = 'en-GB';

    describe('no url.prefix (bare functional paths)', () => {
        const base = { defaultSiteId: SITE, defaultLocale: LOCALE };

        it('decorates a bare path with /s/{site}/{locale}', () => {
            expect(rewriteToSfraPath('/cart', base)).toBe('/s/RefArchGlobal/en-GB/cart');
        });

        it('maps "/" to the locale-less site root', () => {
            expect(rewriteToSfraPath('/', base)).toBe('/s/RefArchGlobal');
        });

        it('leaves already-SFCC-shaped paths untouched', () => {
            expect(rewriteToSfraPath('/s/RefArchGlobal/en-GB/Cart-Show', base)).toBe(
                '/s/RefArchGlobal/en-GB/Cart-Show'
            );
            expect(rewriteToSfraPath('/on/demandware.static/x.css', base)).toBe('/on/demandware.static/x.css');
        });
    });

    describe('url.prefix = /:localeId (locale-prefixed shopper URLs)', () => {
        const base = {
            defaultSiteId: SITE,
            defaultLocale: LOCALE,
            urlPrefix: '/:localeId',
            localeAliases: ['en-GB', 'uk', 'de-DE'],
            siteAliases: ['RefArchGlobal', 'global'],
        };

        it('reuses the locale the path carries instead of double-stacking — the escalation repro', () => {
            // Before the fix this produced /s/RefArchGlobal/en-GB/uk/cart → 404.
            expect(rewriteToSfraPath('/uk/cart', base)).toBe('/s/RefArchGlobal/uk/cart');
        });

        it('passes a canonical locale id straight through', () => {
            expect(rewriteToSfraPath('/de-DE/checkout', base)).toBe('/s/RefArchGlobal/de-DE/checkout');
        });

        it('treats a locale home (just the locale segment) as the SFRA site root for that locale', () => {
            expect(rewriteToSfraPath('/uk', base)).toBe('/s/RefArchGlobal/uk/');
        });

        it('does NOT mis-strip a bare legacy path that is not a known locale', () => {
            // `/cart` fits the single-segment prefix structurally, but `cart` is not a known
            // locale — so it must be treated as a bare path and decorated with the fallback locale.
            expect(rewriteToSfraPath('/cart', base)).toBe('/s/RefArchGlobal/en-GB/cart');
        });

        it('matches the locale alias case-insensitively and forwards the canonical casing', () => {
            // Mixed-case segments (`/en-gb`, `/UK`) are common in hand-typed/linked URLs. They
            // must match the catalog and be normalized to the canonical-cased alias rather than
            // falling through to the double-stack (`/s/RefArchGlobal/en-GB/en-gb/cart`).
            expect(rewriteToSfraPath('/en-gb/cart', base)).toBe('/s/RefArchGlobal/en-GB/cart');
            expect(rewriteToSfraPath('/UK/cart', base)).toBe('/s/RefArchGlobal/uk/cart');
        });
    });

    describe('url.prefix = /:siteId/:localeId (site + locale prefix)', () => {
        const base = {
            defaultSiteId: SITE,
            defaultLocale: LOCALE,
            urlPrefix: '/:siteId/:localeId',
            localeAliases: ['en-GB', 'uk'],
            siteAliases: ['RefArchGlobal', 'global'],
        };

        it('reuses both the site and locale the path carries (no double site, no double locale)', () => {
            expect(rewriteToSfraPath('/global/uk/cart', base)).toBe('/s/global/uk/cart');
        });

        it('falls back to defaults when the leading segments are not a known site/locale', () => {
            // `/cart/foo` → siteId=cart, localeId=foo; neither is known, so treat the whole
            // path as bare and decorate with the fallbacks rather than emitting /s/cart/foo/…
            expect(rewriteToSfraPath('/cart/foo', base)).toBe('/s/RefArchGlobal/en-GB/cart/foo');
        });

        it('falls back when the site half matches but the locale half is unknown (partial match)', () => {
            // `/global/cart` → siteId=global (known), localeId=cart (NOT a known locale). The
            // gate requires BOTH halves, so a known site alone must not be honored — the whole
            // path is treated as bare. Guards the `siteOk && localeOk` (not `||`) contract.
            expect(rewriteToSfraPath('/global/cart', base)).toBe('/s/RefArchGlobal/en-GB/global/cart');
        });
    });
});
