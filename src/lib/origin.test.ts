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
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { resolveRequestOrigin, getAppOrigin, isSameOrigin } from './origin';
import { getRequestFromContext } from '@/middlewares/request-origin';

vi.mock('@/middlewares/request-origin', () => ({
    getRequestFromContext: vi.fn(),
}));

const mockGetRequestFromContext = vi.mocked(getRequestFromContext);

const buildRequest = (headers: Record<string, string> = {}, url = 'http://internal.lambda/path'): Request =>
    new Request(url, { headers });

describe('resolveRequestOrigin', () => {
    describe('x-forwarded-host', () => {
        it('uses x-forwarded-host with x-forwarded-proto when both present', () => {
            const request = buildRequest({
                'x-forwarded-host': 'shop.example.com',
                'x-forwarded-proto': 'https',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('defaults to https when x-forwarded-proto is missing', () => {
            const request = buildRequest({ 'x-forwarded-host': 'shop.example.com' });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('respects x-forwarded-proto=http for an exact-match localhost host', () => {
            const request = buildRequest({
                'x-forwarded-host': 'localhost:5173',
                'x-forwarded-proto': 'http',
            });
            expect(resolveRequestOrigin(request)).toBe('http://localhost:5173');
        });

        it('takes the leftmost entry from a comma-separated x-forwarded-host (multi-proxy chain)', () => {
            const request = buildRequest({
                'x-forwarded-host': 'shop.example.com, internal.alb, internal.lambda',
                'x-forwarded-proto': 'https',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('takes the leftmost entry from a comma-separated x-forwarded-proto', () => {
            const request = buildRequest({
                'x-forwarded-host': 'shop.example.com',
                'x-forwarded-proto': 'https,http',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('rejects a leading-empty x-forwarded-host as if missing', () => {
            // ", real.example.com" must not produce "https://" with no host.
            const request = buildRequest({
                'x-forwarded-host': ', real.example.com',
                host: 'real.example.com',
            });
            expect(resolveRequestOrigin(request)).toBe('https://real.example.com');
        });

        it('treats an empty x-forwarded-proto as missing (does not produce "://host")', () => {
            const request = buildRequest({
                'x-forwarded-host': 'shop.example.com',
                'x-forwarded-proto': '',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('treats a leading-empty x-forwarded-proto as missing', () => {
            const request = buildRequest({
                'x-forwarded-host': 'shop.example.com',
                'x-forwarded-proto': ',https',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('does NOT downgrade vanity hosts containing the literal "localhost" to http', () => {
            // Substring match would have flipped the protocol — these are public hostnames.
            const cases = ['localhost.staging.example.com', 'mylocalhost.com'];
            for (const host of cases) {
                expect(resolveRequestOrigin(buildRequest({ 'x-forwarded-host': host }))).toBe(`https://${host}`);
            }
        });

        it('downgrades to http for an exact-match localhost (no port)', () => {
            const request = buildRequest({ 'x-forwarded-host': 'localhost' });
            expect(resolveRequestOrigin(request)).toBe('http://localhost');
        });

        it('downgrades to http for localhost with a port', () => {
            const request = buildRequest({ 'x-forwarded-host': 'localhost:5173' });
            expect(resolveRequestOrigin(request)).toBe('http://localhost:5173');
        });
    });

    describe('precedence', () => {
        it('prefers x-forwarded-host over host when both are present', () => {
            // Pins the trust model: forwarded value comes from a stripping proxy
            // (eCDN), the raw host header is whatever the runtime saw and on MRT
            // is the lambda-internal hostname. A future refactor that reorders
            // the checks would silently emit the internal host on every callback.
            const request = buildRequest({
                'x-forwarded-host': 'public.example.com',
                host: 'internal.lambda',
            });
            expect(resolveRequestOrigin(request)).toBe('https://public.example.com');
        });
    });

    describe('host fallback', () => {
        it('uses host header when x-forwarded-host is missing', () => {
            const request = buildRequest({
                host: 'shop.example.com',
                'x-forwarded-proto': 'https',
            });
            expect(resolveRequestOrigin(request)).toBe('https://shop.example.com');
        });

        it('downgrades to http for an exact-match localhost host fallback', () => {
            const request = buildRequest({ host: 'localhost:5173' });
            expect(resolveRequestOrigin(request)).toBe('http://localhost:5173');
        });

        it('does NOT downgrade host-fallback for vanity hosts containing "localhost"', () => {
            const request = buildRequest({ host: 'localhost.staging.example.com' });
            expect(resolveRequestOrigin(request)).toBe('https://localhost.staging.example.com');
        });
    });

    describe('no headers', () => {
        it('returns null when neither x-forwarded-host nor host is set', () => {
            // Request always sets host from URL; clear it explicitly to simulate absence.
            const request = new Request('http://x/');
            request.headers.delete('host');
            expect(resolveRequestOrigin(request)).toBeNull();
        });
    });
});

describe('getAppOrigin', () => {
    const ORIGINAL_ENV = process.env.EXTERNAL_DOMAIN_NAME;

    beforeEach(() => {
        mockGetRequestFromContext.mockReset();
    });

    afterEach(() => {
        if (ORIGINAL_ENV === undefined) {
            delete process.env.EXTERNAL_DOMAIN_NAME;
        } else {
            process.env.EXTERNAL_DOMAIN_NAME = ORIGINAL_ENV;
        }
        vi.unstubAllGlobals();
    });

    it('parses the request lazily and only when called', () => {
        // Fresh per-test context object so the WeakMap cache doesn't leak across cases.
        const context = {} as Readonly<import('react-router').RouterContextProvider>;
        mockGetRequestFromContext.mockReturnValue(buildRequest({ 'x-forwarded-host': 'shop.example.com' }));

        // Not called yet — middleware ran but no consumer asked for the origin.
        expect(mockGetRequestFromContext).not.toHaveBeenCalled();

        expect(getAppOrigin(context)).toBe('https://shop.example.com');
        expect(mockGetRequestFromContext).toHaveBeenCalledTimes(1);
    });

    it('memoizes per context — repeat calls within the same request do not re-parse', () => {
        const context = {} as Readonly<import('react-router').RouterContextProvider>;
        mockGetRequestFromContext.mockReturnValue(buildRequest({ 'x-forwarded-host': 'shop.example.com' }));

        getAppOrigin(context);
        getAppOrigin(context);
        getAppOrigin(context);

        expect(mockGetRequestFromContext).toHaveBeenCalledTimes(1);
    });

    it('returns window.location.origin on the client', () => {
        // Default jsdom window — context has no request, so client path is taken.
        const context = {} as Readonly<import('react-router').RouterContextProvider>;
        mockGetRequestFromContext.mockReturnValue(null);
        expect(getAppOrigin(context)).toBe(window.location.origin);
    });

    describe('server-side env-var fallback (no window)', () => {
        beforeEach(() => {
            // Simulate the server environment by removing the global `window`.
            vi.stubGlobal('window', undefined);
        });

        it('falls back to EXTERNAL_DOMAIN_NAME when context has no request', () => {
            const context = {} as Readonly<import('react-router').RouterContextProvider>;
            mockGetRequestFromContext.mockReturnValue(null);
            process.env.EXTERNAL_DOMAIN_NAME = 'fallback.example.com';

            expect(getAppOrigin(context)).toBe('https://fallback.example.com');
        });

        it('falls back to EXTERNAL_DOMAIN_NAME when called without a context', () => {
            process.env.EXTERNAL_DOMAIN_NAME = 'fallback.example.com';
            expect(getAppOrigin()).toBe('https://fallback.example.com');
        });

        it('uses http for an exact-match localhost in the env-var fallback', () => {
            process.env.EXTERNAL_DOMAIN_NAME = 'localhost:5173';
            expect(getAppOrigin()).toBe('http://localhost:5173');
        });

        it('does NOT downgrade vanity hosts containing "localhost" in the env-var fallback', () => {
            process.env.EXTERNAL_DOMAIN_NAME = 'localhost.staging.example.com';
            expect(getAppOrigin()).toBe('https://localhost.staging.example.com');
        });

        it('returns http://localhost:5173 when EXTERNAL_DOMAIN_NAME is unset on server', () => {
            // Pre-PR code threw here; the new behavior silently falls back to a
            // local-dev default. Lock that in so a future contributor can't
            // reintroduce the throw without updating the test.
            delete process.env.EXTERNAL_DOMAIN_NAME;
            expect(getAppOrigin()).toBe('http://localhost:5173');
        });
    });
});

describe('isSameOrigin', () => {
    const buildReq = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

    it('returns true when Origin header matches the server origin', () => {
        const request = buildReq('http://shop.example.com/resource/ordered-products', {
            'x-forwarded-host': 'shop.example.com',
            'x-forwarded-proto': 'https',
            origin: 'https://shop.example.com',
        });
        expect(isSameOrigin(request)).toBe(true);
    });

    it('returns false when Origin header is a different domain', () => {
        const request = buildReq('http://shop.example.com/resource/ordered-products', {
            'x-forwarded-host': 'shop.example.com',
            'x-forwarded-proto': 'https',
            origin: 'https://evil.example.com',
        });
        expect(isSameOrigin(request)).toBe(false);
    });

    it('returns true when Referer matches (no Origin header)', () => {
        const request = buildReq('http://shop.example.com/resource/ordered-products', {
            'x-forwarded-host': 'shop.example.com',
            'x-forwarded-proto': 'https',
            referer: 'https://shop.example.com/buy-it-again',
        });
        expect(isSameOrigin(request)).toBe(true);
    });

    it('returns false when neither Origin nor Referer is present', () => {
        const request = buildReq('http://shop.example.com/resource/ordered-products', {
            'x-forwarded-host': 'shop.example.com',
            'x-forwarded-proto': 'https',
        });
        expect(isSameOrigin(request)).toBe(false);
    });

    it('returns true when Origin matches the request URL origin (no forwarded headers)', () => {
        const request = buildReq('https://shop.example.com/resource/ordered-products', {
            origin: 'https://shop.example.com',
        });
        expect(isSameOrigin(request)).toBe(true);
    });
});
