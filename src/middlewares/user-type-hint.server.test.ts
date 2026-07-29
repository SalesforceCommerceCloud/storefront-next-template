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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { getAuth } from '@/middlewares/auth.server';
import { getUserTypeCookieName } from '@/lib/auth/user-type-hint';
import { userTypeHintMiddleware } from './user-type-hint.server';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));

// The site id `createTestContext` resolves from config (first configured site) — used to assert the
// namespaced cookie name.
const SITE_ID = 'RefArchGlobal';

describe('user-type-hint.server middleware', () => {
    let mockRequest: Request;
    let mockContext: ReturnType<typeof createTestContext>;
    let mockNext: Parameters<MiddlewareFunction<Response>>[1];
    const createArgs = (request: Request, context: Readonly<RouterContextProvider>) =>
        createLoaderArgs(request, context, { pattern: '' });

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequest = new Request('https://example.com');
        mockContext = createTestContext();
        mockNext = vi.fn().mockResolvedValue(new Response('ok')) as unknown as Parameters<
            MiddlewareFunction<Response>
        >[1];
    });

    const cookieName = getUserTypeCookieName(SITE_ID);

    // The hint is serialized as base64(JSON) — the shared `parseCookie` reader's inverse — so assert
    // against the encoded value on the wire, matching the currency/basket companion cookies.
    const encode = (value: unknown) => btoa(JSON.stringify(value));

    test('runs downstream first, then writes the hint in the response phase', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered' } as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(mockNext).toHaveBeenCalledOnce();
        // getAuth is read after next() resolves, so a downstream login is reflected.
        expect(getAuth).toHaveBeenCalledWith(mockContext);
        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain(`${cookieName}=${encode('registered')}`);
    });

    test('writes guest hint for a guest session', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(response.headers.get('Set-Cookie')).toContain(`${cookieName}=${encode('guest')}`);
    });

    test('writes the hint httpOnly:false so the client can read it, and never emits HttpOnly', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered' } as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;
        const setCookie = response.headers.get('Set-Cookie') ?? '';

        expect(setCookie).not.toMatch(/HttpOnly/i);
        expect(setCookie).toMatch(/SameSite=Lax/i);
    });

    test('expires a stale hint when the session resolved without a userType (logout / destroyed)', async () => {
        // After logout, `destroyAuth()` leaves the session with no userType. A previously-written
        // year-long `registered` hint must be actively expired, not left in place — otherwise a
        // cached app shell would mis-restore the signed-in header for a now-guest shopper.
        vi.mocked(getAuth).mockReturnValue({} as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;
        const setCookie = response.headers.get('Set-Cookie') ?? '';

        // Deletion cookie: same name, empty value, expired in the past (mirrors the auth middleware).
        expect(setCookie).toContain(`${cookieName}=;`);
        expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        // No forward-dated max-age that would keep the hint alive.
        expect(setCookie).not.toMatch(/Max-Age=\d/);
    });

    test('expires a stale hint for a tampered/invalid userType value', async () => {
        // Defense in depth: even if some upstream produced a bad value, the validator drops it and the
        // hint is treated as "no userType" — expire any stale hint rather than persist a bad one.
        vi.mocked(getAuth).mockReturnValue({ userType: 'admin' as never } as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;
        const setCookie = response.headers.get('Set-Cookie') ?? '';

        expect(setCookie).toContain(`${cookieName}=;`);
        expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });

    test('does not touch the hint when auth context is unavailable', async () => {
        // getAuth throwing means we can't tell what the session is (early error response). Leave any
        // existing hint untouched rather than clobber a valid one on a transient error.
        vi.mocked(getAuth).mockImplementation(() => {
            throw new Error('getAuth must be used within the Commerce API middleware');
        });

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(response.status).toBe(200);
        expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    test('never writes a token cookie — only the userType hint', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            usid: 'secret-usid',
            customerId: 'secret-customer',
            accessToken: 'secret-token',
        } as ReturnType<typeof getAuth>);

        const response = (await userTypeHintMiddleware(createArgs(mockRequest, mockContext), mockNext)) as Response;
        const setCookie = response.headers.get('Set-Cookie') ?? '';

        expect(setCookie).toContain(`${cookieName}=${encode('registered')}`);
        // The hint carries userType ONLY — no session correlator or identity leaks into a JS-readable cookie.
        expect(setCookie).not.toContain('secret-usid');
        expect(setCookie).not.toContain('secret-customer');
        expect(setCookie).not.toContain('secret-token');
        expect(setCookie).not.toContain('usid=');
    });
});
