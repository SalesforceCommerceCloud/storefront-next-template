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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
    resolveAssetUrl,
    isAbsoluteURL,
    ensureExternalUrl,
    getSafeReturnUrl,
    getErrorMessage,
    parseJsonToStringRecord,
    getBasePath,
} from './utils';
import { ApiError } from '@/scapi';

describe('isAbsoluteURL', () => {
    it('should return true for http URLs', () => {
        expect(isAbsoluteURL('http://example.com/image.jpg')).toBe(true);
        expect(isAbsoluteURL('http://example.com')).toBe(true);
        expect(isAbsoluteURL('http://example.com/path?query=value')).toBe(true);
        expect(isAbsoluteURL('http://example.com/path#hash')).toBe(true);
    });

    it('should return true for https URLs', () => {
        expect(isAbsoluteURL('https://example.com/image.jpg')).toBe(true);
        expect(isAbsoluteURL('https://www.example.com/api/v1/data')).toBe(true);
        expect(isAbsoluteURL('https://subdomain.example.com:8080/path')).toBe(true);
    });

    it('should return true for protocol-relative URLs', () => {
        expect(isAbsoluteURL('//example.com/image.jpg')).toBe(true);
    });

    it('should return false for relative URLs', () => {
        expect(isAbsoluteURL('/images/hero.png')).toBe(false);
        expect(isAbsoluteURL('images/hero.png')).toBe(false);
        expect(isAbsoluteURL('./relative/path')).toBe(false);
        expect(isAbsoluteURL('../parent/path')).toBe(false);
        expect(isAbsoluteURL('file.html')).toBe(false);
    });

    it('should return false for query-only and hash-only URLs', () => {
        expect(isAbsoluteURL('?query=value')).toBe(false);
        expect(isAbsoluteURL('#section')).toBe(false);
        expect(isAbsoluteURL('?query=value#section')).toBe(false);
    });

    it('should return false for empty or invalid URLs', () => {
        expect(isAbsoluteURL('')).toBe(false);
        expect(isAbsoluteURL('not-a-url')).toBe(false);
        expect(isAbsoluteURL('://')).toBe(false);
        expect(isAbsoluteURL('http:')).toBe(false);
        expect(isAbsoluteURL('http:example.com')).toBe(false);
    });

    it('handles edge cases with valid protocol schemes', () => {
        expect(isAbsoluteURL('a://example.com')).toBe(true);
        expect(isAbsoluteURL('data+xml://example.com')).toBe(true);
        expect(isAbsoluteURL('custom-scheme://example.com')).toBe(true);
        expect(isAbsoluteURL('scheme.v2://example.com')).toBe(true);
    });
});

describe('ensureExternalUrl', () => {
    it('normalizes external URLs to an absolute https href', () => {
        // scheme-less host → prepend https:// (the carrier-tracking bug)
        expect(ensureExternalUrl('www.testingtracking.com')).toBe('https://www.testingtracking.com/');
        expect(ensureExternalUrl('fedex.com/track?n=123')).toBe('https://fedex.com/track?n=123');
        // protocol-relative, host:port (URL would mis-read as a scheme), and a PUBLIC IPv4 host
        expect(ensureExternalUrl('//carrier.com/track')).toBe('https://carrier.com/track');
        expect(ensureExternalUrl('carrier.com:8080/track')).toBe('https://carrier.com:8080/track');
        expect(ensureExternalUrl('8.8.8.8/track')).toBe('https://8.8.8.8/track');
        // already-absolute http(s): kept; scheme + host lowercased by the URL parser
        expect(ensureExternalUrl('https://www.carrier.com/track?n=1')).toBe('https://www.carrier.com/track?n=1');
        expect(ensureExternalUrl('http://carrier.com')).toBe('http://carrier.com/');
        expect(ensureExternalUrl('HTTPS://Carrier.COM/Path')).toBe('https://carrier.com/Path');
        // control characters stripped, surrounding whitespace trimmed
        expect(ensureExternalUrl('  www.carrier.com  ')).toBe('https://www.carrier.com/');
        expect(ensureExternalUrl('https://carrier.com\t/track\n')).toBe('https://carrier.com/track');
    });

    it('returns undefined (never throws) for unsafe, internal, or unusable input', () => {
        // dangerous / non-web schemes (XSS + non-tracking)
        expect(ensureExternalUrl('javascript:alert(1)')).toBeUndefined();
        expect(ensureExternalUrl('javascript:alert(1)//')).toBeUndefined();
        expect(ensureExternalUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
        expect(ensureExternalUrl('vbscript:msgbox(1)')).toBeUndefined();
        expect(ensureExternalUrl('file:///etc/passwd')).toBeUndefined();
        expect(ensureExternalUrl('mailto:a@b.com')).toBeUndefined();
        expect(ensureExternalUrl('tel:+15551234')).toBeUndefined();
        // app-internal / relative paths (must not become external links)
        expect(ensureExternalUrl('/account/orders/123')).toBeUndefined();
        expect(ensureExternalUrl('track')).toBeUndefined();
        expect(ensureExternalUrl('./relative')).toBeUndefined();
        // empty / whitespace / nullish
        expect(ensureExternalUrl('')).toBeUndefined();
        expect(ensureExternalUrl('   ')).toBeUndefined();
        expect(ensureExternalUrl(null)).toBeUndefined();
        expect(ensureExternalUrl(undefined)).toBeUndefined();
    });

    // Security/correctness regressions from PR review — each asserts the RESOLVED host
    // so a refactor can't silently reopen a bypass. Grouped by failure class.
    it('rejects host-confusion bypasses (the href would navigate to a different host than it reads)', () => {
        // userinfo `@` — "www.ups.com" is the username, real host is evil.com — on BOTH branches
        expect(ensureExternalUrl('https://www.ups.com@evil.com/track')).toBeUndefined();
        expect(ensureExternalUrl('www.ups.com@evil.com/track')).toBeUndefined();
        expect(ensureExternalUrl('ups.com:@evil.com/track')).toBeUndefined();
        expect(ensureExternalUrl('carrier.com:user@evil.com/track')).toBeUndefined();
        // backslash authority (WHATWG treats `\` as `/`)
        expect(ensureExternalUrl('https:\\\\evil.com')).toBeUndefined();
        expect(ensureExternalUrl('\\\\evil.com')).toBeUndefined();
        // control char between slashes must NOT collapse a relative path into //host
        expect(ensureExternalUrl('/\x00/evil.com')).toBeUndefined();
        // leading whitespace/control chars must NOT let a relative "/\x00/host" payload skip
        // the relative-path guard and then collapse into "//host" once stripped+trimmed
        expect(ensureExternalUrl(' /\x00/evil.com')).toBeUndefined();
        expect(ensureExternalUrl('\t/\x00/evil.com')).toBeUndefined();
        expect(ensureExternalUrl('\n/evil.com')).toBeUndefined();
        expect(ensureExternalUrl('\x00\x00/evil.com')).toBeUndefined();
        expect(ensureExternalUrl('  /\x00\x00/evil.com')).toBeUndefined();
        // dotted-"protocol" WITH an authority (`label.tld://host`) — parses to a dotted
        // protocol so it skips the dot-less validation, and the real host is the part after
        // `//` (`ups.com`/`evil.com`), not the leading label. Must NOT fall through to be
        // re-prepended into `https://attacker.com//ups.com/...`.
        expect(ensureExternalUrl('attacker.com://ups.com/track/12345')).toBeUndefined();
        expect(ensureExternalUrl('foo.bar://evil.com')).toBeUndefined();
    });

    it('rejects private / loopback / link-local IPv4 literals (a carrier link must not target the internal network)', () => {
        // these all contain dots, so the generic dot-based host check does NOT catch them —
        // a scheme-less or fully-qualified value pointed at an internal address must be rejected
        expect(ensureExternalUrl('127.0.0.1/track')).toBeUndefined();
        expect(ensureExternalUrl('http://127.0.0.1/track')).toBeUndefined();
        expect(ensureExternalUrl('192.168.0.1/track')).toBeUndefined();
        expect(ensureExternalUrl('192.168.1.254')).toBeUndefined();
        expect(ensureExternalUrl('10.0.0.5/track')).toBeUndefined();
        expect(ensureExternalUrl('172.16.0.1')).toBeUndefined();
        expect(ensureExternalUrl('172.31.255.255')).toBeUndefined();
        // cloud instance-metadata endpoint (link-local) — the highest-value SSRF target
        expect(ensureExternalUrl('http://169.254.169.254/latest/meta-data/')).toBeUndefined();
        expect(ensureExternalUrl('0.0.0.0/track')).toBeUndefined();
        expect(ensureExternalUrl('100.64.0.1')).toBeUndefined(); // carrier-grade NAT
        expect(ensureExternalUrl('224.0.0.1')).toBeUndefined(); // multicast
        // ...but a genuine PUBLIC IPv4 host must still externalize, and a public address that
        // merely borders a private range must not be over-rejected
        expect(ensureExternalUrl('8.8.8.8/track')).toBe('https://8.8.8.8/track');
        expect(ensureExternalUrl('172.15.0.1')).toBe('https://172.15.0.1/'); // just below 172.16/12
        expect(ensureExternalUrl('172.32.0.1')).toBe('https://172.32.0.1/'); // just above 172.31
        expect(ensureExternalUrl('192.169.0.1')).toBe('https://192.169.0.1/'); // not 192.168
    });

    it('still externalizes a genuine scheme-less host:port (no // authority — must not be over-rejected)', () => {
        // The dotted-protocol-authority guard must NOT catch a real `host:port`, whose parse
        // has an EMPTY host (the part after `:` is the port), unlike the `label.tld://…` spoof.
        expect(ensureExternalUrl('carrier.com:8080')).toBe('https://carrier.com:8080/');
        expect(ensureExternalUrl('carrier.com:8080/track')).toBe('https://carrier.com:8080/track');
        // the leading-whitespace hardening must NOT over-reject a genuine protocol-relative
        // (`//host`) or scheme-less value that merely has surrounding whitespace
        expect(ensureExternalUrl('  //carrier.com/track')).toBe('https://carrier.com/track');
        expect(ensureExternalUrl('  www.carrier.com/track  ')).toBe('https://www.carrier.com/track');
    });

    it('rejects junk / non-host values that would become dead external links', () => {
        // bare filenames and degenerate-dot hosts (contradict the relative→undefined contract)
        expect(ensureExternalUrl('data.html')).toBeUndefined();
        expect(ensureExternalUrl('index.html')).toBeUndefined();
        expect(ensureExternalUrl('a..b')).toBeUndefined();
        // non-string input must not throw (never-throws contract)
        expect(ensureExternalUrl(1234 as unknown as string)).toBeUndefined();
        expect(ensureExternalUrl({} as unknown as string)).toBeUndefined();
        expect(ensureExternalUrl([] as unknown as string)).toBeUndefined();
    });

    it('does NOT reject legit carrier URLs that merely contain @ in the path/query', () => {
        // no false positives: `@` outside the authority leaves username empty
        expect(ensureExternalUrl('https://tracking.dhl.com/track?email=a@b.com')).toBe(
            'https://tracking.dhl.com/track?email=a@b.com'
        );
    });
});

describe('stringToBase64', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('uses btoa in browser-like env and encodes correctly', async () => {
        vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
        const util = await import('@/lib/utils');
        expect(util.stringToBase64('hello')).toBe('aGVsbG8=');
    });

    it('falls back to Buffer in non-browser env', async () => {
        vi.stubGlobal('window', undefined);
        const util = await import('@/lib/utils');
        expect(util.stringToBase64('hello')).toBe('aGVsbG8=');
    });
});

describe('validatePassword', () => {
    it('returns all true for a strong password', async () => {
        const util = await import('@/lib/utils');
        expect(util.validatePassword('Abcdef1!')).toEqual({
            minLength: true,
            hasUppercase: true,
            hasLowercase: true,
            hasNumber: true,
            hasSpecialChar: true,
        });
    });

    it('returns correct flags for a weak password', async () => {
        const util = await import('@/lib/utils');
        expect(util.validatePassword('abcdefg')).toEqual({
            minLength: false,
            hasUppercase: false,
            hasLowercase: true,
            hasNumber: false,
            hasSpecialChar: false,
        });
    });
});

describe('resolveAssetUrl', () => {
    describe('with absolute URLs', () => {
        it('should return http URLs unchanged', () => {
            const url = 'http://example.com/image.jpg';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should return https URLs unchanged', () => {
            const url = 'https://example.com/image.jpg';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should return protocol-relative URLs unchanged', () => {
            const url = '//example.com/image.jpg';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should return data URLs unchanged', () => {
            const url =
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            expect(resolveAssetUrl(url)).toBe(url);
        });
    });

    describe('with URLs already containing bundle path', () => {
        it('should return URLs with bundle path unchanged', () => {
            const url = '/mobify/bundle/60/client/images/hero.png';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should handle bundle path in the middle of URL', () => {
            const url = 'https://cdn.example.com/mobify/bundle/60/client/images/hero.png';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should not double-transform static imports', () => {
            const staticImportUrl = '/mobify/bundle/local/client/images/hero-abc123.png';
            expect(resolveAssetUrl(staticImportUrl)).toBe(staticImportUrl);
        });
    });

    describe('in local development environment (BUNDLE_ID=local)', () => {
        beforeEach(() => {
            // Mock browser environment with local bundle ID
            (window as { _BUNDLE_ID: string })._BUNDLE_ID = 'local';
        });

        afterEach(() => {
            delete (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
        });

        it('should return absolute paths as-is', () => {
            expect(resolveAssetUrl('/images/hero.png')).toBe('/images/hero.png');
        });

        it('should prepend slash to relative paths', () => {
            expect(resolveAssetUrl('images/hero.png')).toBe('/images/hero.png');
        });

        it('should handle nested paths', () => {
            expect(resolveAssetUrl('/assets/images/products/hero.png')).toBe('/assets/images/products/hero.png');
        });

        it('should handle paths with query parameters', () => {
            expect(resolveAssetUrl('/images/hero.png?w=100')).toBe('/images/hero.png?w=100');
        });
    });

    describe('in MRT environment (BUNDLE_ID=60)', () => {
        beforeEach(() => {
            // Mock browser environment with MRT bundle ID
            (window as { _BUNDLE_ID: string })._BUNDLE_ID = '60';
        });

        afterEach(() => {
            delete (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
        });

        it('should prepend bundle path to absolute local paths', () => {
            expect(resolveAssetUrl('/images/hero.png')).toBe('/mobify/bundle/60/client/images/hero.png');
        });

        it('should prepend bundle path to relative local paths', () => {
            expect(resolveAssetUrl('images/hero.png')).toBe('/mobify/bundle/60/client/images/hero.png');
        });

        it('should handle nested directory paths', () => {
            expect(resolveAssetUrl('/assets/images/products/hero.png')).toBe(
                '/mobify/bundle/60/client/assets/images/products/hero.png'
            );
        });

        it('should handle paths with special characters', () => {
            expect(resolveAssetUrl('/images/hero-image_v2.png')).toBe(
                '/mobify/bundle/60/client/images/hero-image_v2.png'
            );
        });

        it('should handle paths with query parameters', () => {
            expect(resolveAssetUrl('/images/hero.png?w=100&h=200')).toBe(
                '/mobify/bundle/60/client/images/hero.png?w=100&h=200'
            );
        });

        it('should handle paths with hash fragments', () => {
            expect(resolveAssetUrl('/images/hero.png#section')).toBe(
                '/mobify/bundle/60/client/images/hero.png#section'
            );
        });
    });

    describe('on server side', () => {
        let originalWindow: typeof globalThis.window;

        beforeEach(() => {
            // Save original window and mock Node.js environment
            originalWindow = globalThis.window;
            vi.stubGlobal('window', undefined);
            // Clear base path so it doesn't leak from .env into tests that don't expect it
            delete process.env.MRT_ENV_BASE_PATH;
        });

        afterEach(() => {
            // Restore window and clean up env
            vi.stubGlobal('window', originalWindow);
            delete process.env.BUNDLE_ID;
            delete process.env.MRT_ENV_BASE_PATH;
        });

        it('should use process.env.BUNDLE_ID in MRT', () => {
            process.env.BUNDLE_ID = '140';
            expect(resolveAssetUrl('/images/hero.png')).toBe('/mobify/bundle/140/client/images/hero.png');
        });

        it('should default to "local" when BUNDLE_ID is not set', () => {
            delete process.env.BUNDLE_ID;
            expect(resolveAssetUrl('/images/hero.png')).toBe('/images/hero.png');
        });

        it('should treat BUNDLE_ID=local as local development', () => {
            process.env.BUNDLE_ID = 'local';
            expect(resolveAssetUrl('/images/hero.png')).toBe('/images/hero.png');
            expect(resolveAssetUrl('images/hero.png')).toBe('/images/hero.png');
        });

        it('should handle relative paths on server', () => {
            process.env.BUNDLE_ID = '200';
            expect(resolveAssetUrl('images/hero.png')).toBe('/mobify/bundle/200/client/images/hero.png');
        });

        it('should include base path in bundle path on server', () => {
            process.env.BUNDLE_ID = '140';
            process.env.MRT_ENV_BASE_PATH = '/shop';
            expect(resolveAssetUrl('/images/hero.png')).toBe('/shop/mobify/bundle/140/client/images/hero.png');
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            (window as { _BUNDLE_ID: string })._BUNDLE_ID = '60';
        });

        afterEach(() => {
            delete (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
        });

        it('should handle empty string', () => {
            expect(resolveAssetUrl('')).toBe('/mobify/bundle/60/client/');
        });

        it('should handle paths with multiple slashes', () => {
            expect(resolveAssetUrl('//images//hero.png')).toBe('//images//hero.png');
        });

        it('should handle paths with dots', () => {
            expect(resolveAssetUrl('/images/../assets/hero.png')).toBe(
                '/mobify/bundle/60/client/images/../assets/hero.png'
            );
        });

        it('should handle paths starting with dot', () => {
            expect(resolveAssetUrl('./images/hero.png')).toBe('/mobify/bundle/60/client/./images/hero.png');
        });
    });

    describe('compatibility with ContentCard usage', () => {
        beforeEach(() => {
            (window as { _BUNDLE_ID: string })._BUNDLE_ID = '60';
        });

        afterEach(() => {
            delete (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
        });

        it('should handle dynamic Page Designer image URLs', () => {
            const pageDesignerUrl = 'https://cdn.commercecloud.salesforce.com/on/demandware.static/images/product.jpg';
            expect(resolveAssetUrl(pageDesignerUrl)).toBe(pageDesignerUrl);
        });

        it('should handle static import fallbacks', () => {
            const staticImport = '/mobify/bundle/60/client/images/hero-abc123.png';
            expect(resolveAssetUrl(staticImport)).toBe(staticImport);
        });

        it('should handle local asset paths from Page Designer', () => {
            expect(resolveAssetUrl('images/hero-cube.webp')).toBe('/mobify/bundle/60/client/images/hero-cube.webp');
        });
    });
});

describe('getBasePath', () => {
    describe('client-side (window defined)', () => {
        afterEach(() => {
            delete (window as { _BASE_PATH?: string })._BASE_PATH;
        });

        it('should return empty string when _BASE_PATH is not set', () => {
            delete (window as { _BASE_PATH?: string })._BASE_PATH;
            expect(getBasePath()).toBe('');
        });

        it('should return base path from _BASE_PATH', () => {
            (window as { _BASE_PATH: string })._BASE_PATH = '/shop';
            expect(getBasePath()).toBe('/shop');
        });

        it('should return empty string when _BASE_PATH is empty', () => {
            (window as { _BASE_PATH: string })._BASE_PATH = '';
            expect(getBasePath()).toBe('');
        });
    });

    describe('server-side (window undefined)', () => {
        let originalWindow: typeof globalThis.window;

        beforeEach(() => {
            originalWindow = globalThis.window;
            vi.stubGlobal('window', undefined);
        });

        afterEach(() => {
            vi.stubGlobal('window', originalWindow);
            delete process.env.MRT_ENV_BASE_PATH;
        });

        it('should return empty string when MRT_ENV_BASE_PATH is not set', () => {
            delete process.env.MRT_ENV_BASE_PATH;
            expect(getBasePath()).toBe('');
        });

        it('should return valid base path', () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            expect(getBasePath()).toBe('/shop');
        });

        it('should throw when leading slash is missing', () => {
            process.env.MRT_ENV_BASE_PATH = 'shop';
            expect(() => getBasePath()).toThrow('Invalid base path');
        });

        it('should throw on trailing slashes', () => {
            process.env.MRT_ENV_BASE_PATH = '/shop/';
            expect(() => getBasePath()).toThrow('Invalid base path');
        });

        it('should throw on invalid base path', () => {
            process.env.MRT_ENV_BASE_PATH = '/shop/nested';
            expect(() => getBasePath()).toThrow('Invalid base path');
        });
    });
});

describe('resolveAssetUrl with base path', () => {
    describe('in MRT environment with base path', () => {
        beforeEach(() => {
            (window as { _BUNDLE_ID: string })._BUNDLE_ID = '60';
            (window as { _BASE_PATH: string })._BASE_PATH = '/shop';
        });

        afterEach(() => {
            delete (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
            delete (window as { _BASE_PATH?: string })._BASE_PATH;
        });

        it('should prepend base path and bundle path to local assets', () => {
            expect(resolveAssetUrl('/images/hero.png')).toBe('/shop/mobify/bundle/60/client/images/hero.png');
        });

        it('should return URLs with base path and bundle path unchanged', () => {
            const url = '/shop/mobify/bundle/60/client/images/hero.png';
            expect(resolveAssetUrl(url)).toBe(url);
        });

        it('should return URLs containing /mobify/bundle/ without base path unchanged', () => {
            const url = '/mobify/bundle/60/client/images/hero.png';
            expect(resolveAssetUrl(url)).toBe(url);
        });
    });
});

describe('getErrorMessage', () => {
    describe('with ApiError', () => {
        it('should extract message from rawBody JSON when available', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'POST',
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                    title: 'Bad Request',
                    detail: 'Error detail',
                },
                rawBody: JSON.stringify({ message: 'Invalid email format' }),
            });

            expect(getErrorMessage(error)).toBe('Invalid email format');
        });

        it('should fall back to body.detail when rawBody has no message', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'POST',
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                    title: 'Bad Request',
                    detail: 'Detailed error description',
                },
                rawBody: JSON.stringify({ error: 'some error' }),
            });

            expect(getErrorMessage(error)).toBe('Detailed error description');
        });

        it('should fall back to statusText when rawBody has no message and body.detail is missing', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'GET',
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/unauthorized',
                    title: 'Unauthorized',
                    detail: 'Unauthorized',
                },
                rawBody: JSON.stringify({ error: 'some error' }),
            });

            expect(getErrorMessage(error)).toBe('Unauthorized');
        });

        it('should return default message when all fallbacks fail', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'GET',
                status: 500,
                statusText: '',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/server-error',
                    title: 'Server Error',
                    detail: '',
                },
                rawBody: JSON.stringify({ error: 'some error' }),
            });

            expect(getErrorMessage(error)).toBe('An error occurred');
        });

        it('should handle invalid JSON in rawBody and fall back to body.detail', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'POST',
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                    title: 'Bad Request',
                    detail: 'Detailed error from body',
                },
                rawBody: 'invalid json {',
            });

            expect(getErrorMessage(error)).toBe('Detailed error from body');
        });

        it('should handle invalid JSON in rawBody and fall back to statusText', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'POST',
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                    title: 'Bad Request',
                    detail: '',
                },
                rawBody: 'invalid json {',
            });

            expect(getErrorMessage(error)).toBe('Bad Request');
        });

        it('should handle empty rawBody', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'GET',
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/not-found',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
            });

            expect(getErrorMessage(error)).toBe('Resource not found');
        });

        it('should handle rawBody with message as empty string', () => {
            const error = new ApiError({
                url: 'https://api.example.com/test',
                method: 'POST',
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: {
                    type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                    title: 'Bad Request',
                    detail: 'Fallback detail',
                },
                rawBody: JSON.stringify({ message: '' }),
            });

            expect(getErrorMessage(error)).toBe('Fallback detail');
        });
        it('should extract message from standard Error instance', () => {
            const error = new Error('Something went wrong');
            expect(getErrorMessage(error)).toBe('Something went wrong');
        });
        it('should return default message for unknown error type', () => {
            expect(getErrorMessage(404)).toBe('An error occurred');
        });
    });
});

describe('parseJsonToStringRecord', () => {
    it('should return {} for null or undefined', () => {
        expect(parseJsonToStringRecord(null)).toEqual({});
        expect(parseJsonToStringRecord(undefined)).toEqual({});
    });

    it('should return {} for empty string', () => {
        expect(parseJsonToStringRecord('')).toEqual({});
    });

    it('should return {} for invalid JSON', () => {
        expect(parseJsonToStringRecord('not json')).toEqual({});
        expect(parseJsonToStringRecord('{')).toEqual({});
        expect(parseJsonToStringRecord('}')).toEqual({});
        expect(parseJsonToStringRecord('undefined')).toEqual({});
    });

    it('should return {} for non-object JSON (array, number, string, boolean)', () => {
        expect(parseJsonToStringRecord('[]')).toEqual({});
        expect(parseJsonToStringRecord('[1,2]')).toEqual({});
        expect(parseJsonToStringRecord('123')).toEqual({});
        expect(parseJsonToStringRecord('"hello"')).toEqual({});
        expect(parseJsonToStringRecord('true')).toEqual({});
    });

    it('should return empty object for empty object JSON', () => {
        expect(parseJsonToStringRecord('{}')).toEqual({});
    });

    it('should include entries with string values', () => {
        expect(parseJsonToStringRecord('{"device":"mobile","src":"124"}')).toEqual({
            device: 'mobile',
            src: '124',
        });
        expect(parseJsonToStringRecord('{"src":"email"}')).toEqual({ src: 'email' });
    });

    it('should coerce null values to string "null"', () => {
        expect(parseJsonToStringRecord('{"a":null}')).toEqual({ a: 'null' });
        expect(parseJsonToStringRecord('{"x":null,"y":"ok"}')).toEqual({ x: 'null', y: 'ok' });
    });

    it('should omit number, boolean, object, and array values', () => {
        expect(parseJsonToStringRecord('{"s":"ok","n":1}')).toEqual({ s: 'ok' });
        expect(parseJsonToStringRecord('{"s":"ok","b":true}')).toEqual({ s: 'ok' });
        expect(parseJsonToStringRecord('{"s":"ok","o":{}}')).toEqual({ s: 'ok' });
        expect(parseJsonToStringRecord('{"s":"ok","a":[]}')).toEqual({ s: 'ok' });
    });

    it('should handle mixed valid and invalid value types', () => {
        expect(parseJsonToStringRecord('{"device":"mobile","count":2,"active":true}')).toEqual({
            device: 'mobile',
        });
    });
});

describe('getSafeReturnUrl', () => {
    it('returns fallback for null', () => {
        expect(getSafeReturnUrl(null)).toBe('/');
    });

    it('returns fallback for undefined', () => {
        expect(getSafeReturnUrl(undefined)).toBe('/');
    });

    it('returns fallback for empty string', () => {
        expect(getSafeReturnUrl('')).toBe('/');
    });

    it('returns fallback for absolute https URL', () => {
        expect(getSafeReturnUrl('https://evil.com')).toBe('/');
    });

    it('returns fallback for protocol-relative URL', () => {
        expect(getSafeReturnUrl('//evil.com')).toBe('/');
    });

    it('returns relative path as-is', () => {
        expect(getSafeReturnUrl('/checkout')).toBe('/checkout');
    });

    it('returns locale-prefixed relative path as-is', () => {
        expect(getSafeReturnUrl('/en-US/checkout')).toBe('/en-US/checkout');
    });

    it('uses custom fallback when provided', () => {
        expect(getSafeReturnUrl(null, '')).toBe('');
        expect(getSafeReturnUrl('https://evil.com', '')).toBe('');
    });
});
