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
import { describe, expect, it } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { createLoaderArgs } from '@/lib/test-utils';
import { authPrivacyMiddleware } from '@/middlewares/auth-privacy.server';
import { errorCacheControlMiddleware } from '@/middlewares/error-cache-control.server';
import { applyAuthPrivacyHeaders, hasProtectedAuthCookies } from '@/lib/auth/privacy.server';

describe('outer authentication privacy policy', () => {
    it.each([
        'cc-taob-session_Site=active',
        'cc-taob-tx_Site=pending',
        'cc-auth-fence-2-id_Site=ended',
        'cc-auth-provenance_Site=provenance',
    ])('keeps documents, data, and transient errors non-storable with %s', async (cookie) => {
        for (const path of ['/cart', '/checkout.data']) {
            for (const status of [200, 401, 409, 503]) {
                const request = new Request(`https://store.example${path}`, { headers: { cookie } });
                const args = createLoaderArgs(request, new RouterContextProvider(), { pattern: '/' });
                const result = (await authPrivacyMiddleware(
                    args,
                    async () =>
                        (await errorCacheControlMiddleware(args, () =>
                            Promise.resolve(
                                new Response('original outcome', {
                                    status,
                                    headers: { 'Cache-Control': 'public, max-age=600' },
                                })
                            )
                        )) as Response
                )) as Response;
                expect(result.status).toBe(status);
                expect(result.headers.get('Cache-Control')).toBe('private, no-store');
                expect(result.headers.get('CDN-Cache-Control')).toBe('no-store');
                expect(result.headers.get('Surrogate-Control')).toBe('no-store');
                expect(result.headers.get('X-Robots-Tag')).toBeNull();
                expect(await result.text()).toBe('original outcome');
            }
        }
    });

    it('protects the first ordinary generation response as well as cookie-less agent launch and callback failures', () => {
        const ordinary = new Headers({ 'Set-Cookie': 'cc-auth-fence-0-new_Site=opaque; HttpOnly' });
        applyAuthPrivacyHeaders(new Request('https://store.example/product/1'), ordinary);
        expect(ordinary.get('Cache-Control')).toBe('private, no-store');
        for (const [path, referrerPolicy] of [
            // The entry form posts back to itself, so it needs a same-origin Origin header instead of `Origin: null`.
            ['/Site/en-GB/login/agent?loginId=private@example.com', 'same-origin'],
            ['/Site/en-GB/login/agent/callback.data?code=secret', 'no-referrer'],
            ['/Site/en-GB/Login/Agent/Callback', 'no-referrer'],
            ['/Site/en-GB/login/%61gent/callback', 'no-referrer'],
            ['/Site/en-GB//login//agent/complete', 'no-referrer'],
        ]) {
            const headers = new Headers();
            applyAuthPrivacyHeaders(new Request(`https://store.example${path}`), headers);
            expect(headers.get('Cache-Control')).toBe('private, no-store');
            expect(headers.get('Referrer-Policy')).toBe(referrerPolicy);
            expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
        }
    });

    it('also protects thrown lifecycle responses without changing their status or body', async () => {
        const request = new Request('https://store.example/login/agent');
        const failure = new Response('denied', { status: 403 });
        await expect(
            authPrivacyMiddleware(createLoaderArgs(request, new RouterContextProvider(), { pattern: '/' }), () =>
                // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- React Router propagates thrown HTTP responses.
                Promise.reject(failure)
            )
        ).rejects.toBe(failure);
        expect(failure.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('leaves unfenced public pages and normal overload backoff intact, and inspects names rather than cookie values', async () => {
        expect(hasProtectedAuthCookies('analytics=cc-taob-session_fake')).toBe(false);
        const request = new Request('https://store.example/search.data', {
            headers: { cookie: 'analytics=cc-taob-session_fake' },
        });
        const args = createLoaderArgs(request, new RouterContextProvider(), { pattern: '/' });
        const result = (await authPrivacyMiddleware(
            args,
            async () =>
                (await errorCacheControlMiddleware(args, () =>
                    Promise.resolve(new Response(null, { status: 503 }))
                )) as Response
        )) as Response;
        expect(result.headers.get('Cache-Control')).toBe('max-age=2');
    });
});
