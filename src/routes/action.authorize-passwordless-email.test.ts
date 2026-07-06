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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './action.authorize-passwordless-email';
import type { ActionFunctionArgs } from 'react-router';
import { expectStatus } from '@/lib/test-utils';

vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/auth/error-handler');
vi.mock('@salesforce/storefront-next-runtime/i18n');
// Stable logger instance so tests can assert on warn/info calls. Reset in beforeEach.
const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
};
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: vi.fn(() => ({
        features: {
            passwordlessLogin: {},
        },
    })),
}));
vi.mock('@/lib/login-preferences.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/login-preferences.server')>()),
    getLoginPreferences: vi.fn(() => Promise.resolve({ emailVerificationEnabled: true })),
}));
vi.mock('@/lib/turnstile/enforce.server', () => ({
    enforceTurnstile: vi.fn(),
}));
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(() => ({
        parse: vi.fn().mockResolvedValue(null),
        serialize: vi.fn().mockResolvedValue('cc-tv=1'),
    })),
    getCookieConfig: vi.fn((overrides = {}) => ({
        httpOnly: false,
        secure: true,
        sameSite: 'lax' as const,
        path: '/',
        ...overrides,
    })),
}));

describe('action.authorize-passwordless-email', () => {
    let mockContext: ActionFunctionArgs['context'];
    let mockAuthorizePasswordless: ReturnType<typeof vi.fn>;
    let mockEnforceTurnstile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        mockAuthorizePasswordless = vi.fn().mockResolvedValue(undefined);
        const { authorizePasswordless } = await import('@/middlewares/auth.server');
        vi.mocked(authorizePasswordless).mockImplementation(mockAuthorizePasswordless as typeof authorizePasswordless);

        const { extractErrorMessage, getPasswordlessErrorMessageKey } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('error');
        vi.mocked(getPasswordlessErrorMessageKey).mockReturnValue('errors:genericTryAgain');

        mockEnforceTurnstile = vi.mocked((await import('@/lib/turnstile/enforce.server')).enforceTurnstile);
        mockEnforceTurnstile.mockResolvedValue(true);

        mockContext = {} as ActionFunctionArgs['context'];
    });

    it('rejects non-POST requests', async () => {
        const request = new Request('http://localhost/action/authorize-passwordless-email', { method: 'GET' });
        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error?.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('rejects request when email is missing', async () => {
        const formData = new FormData();
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error?.code).toBe('REQUIRED_FIELD');
        expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
    });

    it('blocks request when enforceTurnstile returns false', async () => {
        mockEnforceTurnstile.mockResolvedValue(false);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error?.code).toBe('NOT_AUTHORIZED');
        expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
    });

    it('succeeds when enforceTurnstile allows and email is valid', async () => {
        mockEnforceTurnstile.mockResolvedValue(true);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        formData.append('turnstileToken', 'valid-token');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result).toEqual({ success: true, email: 'user@example.com' });
        expect(mockAuthorizePasswordless).toHaveBeenCalledWith(mockContext, {
            userid: 'user@example.com',
            strictVerify: true,
        });
    });

    it('skips SLAS and returns requiresLogin when emailVerificationEnabled is false', async () => {
        const { getLoginPreferences } = await import('@/lib/login-preferences.server');
        vi.mocked(getLoginPreferences).mockResolvedValueOnce({ emailVerificationEnabled: false });

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(false);
        expect(result.requiresLogin).toBe(true);
        expect(result.email).toBe('user@example.com');
        expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
        // The early return fires before enforceTurnstile; no Turnstile check is performed.
        expect(mockEnforceTurnstile).not.toHaveBeenCalled();
    });

    it('returns standard-login route (not 403) when email verification is disabled and no Turnstile token is sent', async () => {
        // When the Turnstile widget is gated off (email verification disabled), the client
        // sends no token. The action must route to standard login before enforcement so the
        // missing token does not produce a spurious 403.
        const { getLoginPreferences } = await import('@/lib/login-preferences.server');
        vi.mocked(getLoginPreferences).mockResolvedValueOnce({ emailVerificationEnabled: false });

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        // No turnstileToken appended — widget was not shown to the user.
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.requiresLogin).toBe(true);
        expect(result.email).toBe('user@example.com');
        expect(result.error).toBeUndefined();
        expect(mockEnforceTurnstile).not.toHaveBeenCalled();
        expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
    });

    it('forwards strictVerify=true to authorizePasswordless when caller sets it', async () => {
        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
            mockContext,
            expect.objectContaining({ strictVerify: true })
        );
    });

    it('forwards strictVerify=false to authorizePasswordless when caller omits it (e.g. My Account reauth)', async () => {
        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
            mockContext,
            expect.objectContaining({ strictVerify: false })
        );
    });

    it('passes turnstileToken to enforceTurnstile', async () => {
        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('turnstileToken', 'my-token');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        expect(mockEnforceTurnstile).toHaveBeenCalledWith(
            expect.objectContaining({
                turnstileToken: 'my-token',
                actionName: 'authorize-passwordless-email',
                email: 'user@example.com',
            })
        );
    });

    it('handles authorizePasswordless failure gracefully', async () => {
        mockAuthorizePasswordless.mockRejectedValue(new Error('SLAS error'));

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('dispatches OTP and returns success when SLAS 400 message indicates email not verified', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            body: { type: 'error', title: 'Bad Request', detail: 'Email not verified' },
            rawBody: '{"message":"Email not verified"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValueOnce(apiError).mockResolvedValueOnce(undefined);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result).toEqual({ success: true, email: 'user@example.com' });
        expect(mockAuthorizePasswordless).toHaveBeenCalledTimes(2);
        expect(mockAuthorizePasswordless).toHaveBeenNthCalledWith(1, mockContext, {
            userid: 'user@example.com',
            strictVerify: true,
        });
        expect(mockAuthorizePasswordless).toHaveBeenNthCalledWith(2, mockContext, {
            userid: 'user@example.com',
            strictVerify: false,
        });
    });

    it('does not emit an error log when the recovery dispatch succeeds', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            body: { type: 'error', title: 'Bad Request', detail: 'Email not verified' },
            rawBody: '{"message":"Email not verified"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValueOnce(apiError).mockResolvedValueOnce(undefined);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        const recoveryErrorCalls = mockLogger.error.mock.calls.filter(
            (call: unknown[]) => call[0] === 'AuthorizePasswordlessEmail: verify-email recovery dispatch failed'
        );
        expect(recoveryErrorCalls).toHaveLength(0);
    });

    it('falls back to requiresLogin when the recovery OTP dispatch also fails', async () => {
        const { ApiError } = await import('@/scapi');
        const probeError = new ApiError({
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            body: { type: 'error', title: 'Bad Request', detail: 'Email not verified' },
            rawBody: '{"message":"Email not verified"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        const recoveryError = new Error('SLAS upstream timeout');
        mockAuthorizePasswordless.mockRejectedValueOnce(probeError).mockRejectedValueOnce(recoveryError);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        formData.append('strictVerify', 'true');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.requiresLogin).toBe(true);
        expect(result.email).toBe('user@example.com');
        expect(mockAuthorizePasswordless).toHaveBeenCalledTimes(2);
        expect(mockLogger.error).toHaveBeenCalledWith(
            'AuthorizePasswordlessEmail: verify-email recovery dispatch failed',
            expect.objectContaining({
                email: expect.stringMatching(/^[a-f0-9]{8}@example\.com$/),
                recoveryMessage: 'SLAS upstream timeout',
                recoveryStatus: undefined,
            })
        );
    });

    it('returns requiresLogin for SLAS 400 even when the error detail is not "email not verified"', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            body: { type: 'error', title: 'Bad Request', detail: 'Invalid request parameters' },
            rawBody: '{"message":"Invalid request parameters"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValue(apiError);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Invalid request parameters');

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.requiresLogin).toBe(true);
        expect(result.email).toBe('user@example.com');
        expect(result.error).toBeUndefined();
    });

    it('treats SLAS 403 (not authorized for passwordless) as a guest path: success=false, no error, no requiresLogin', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 403,
            statusText: 'Forbidden',
            headers: new Headers(),
            body: { type: 'error', title: 'Forbidden', detail: 'Not authorized for passwordless login' },
            rawBody: '{"message":"Not authorized"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValue(apiError);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.email).toBe('user@example.com');
        expect(result.error).toBeUndefined();
        expect(result.requiresLogin).toBeUndefined();
    });

    it('treats SLAS 404 (unknown user) as a guest path: success=false, no error, no requiresLogin', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 404,
            statusText: 'Not Found',
            headers: new Headers(),
            body: { type: 'error', title: 'Not Found', detail: 'User not found' },
            rawBody: '{"message":"User not found"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValue(apiError);

        const formData = new FormData();
        formData.append('email', 'unknown@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.email).toBe('unknown@example.com');
        expect(result.error).toBeUndefined();
        expect(result.requiresLogin).toBeUndefined();
    });

    it('treats SLAS 5xx upstream unavailability as requires-login fallback: HTTP 200 with requiresLogin=true', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 502,
            statusText: 'Bad Gateway',
            headers: new Headers(),
            body: { type: 'error', title: 'Bad Gateway', detail: 'Upstream timeout' },
            rawBody: '{"type":"error","title":"Bad Gateway","detail":"Upstream timeout"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockAuthorizePasswordless.mockRejectedValue(apiError);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        const request = new Request('http://localhost/action/authorize-passwordless-email', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.requiresLogin).toBe(true);
        expect(result.email).toBe('user@example.com');
        expect(result.error).toBeUndefined();
    });

    describe('cc-tv cookie placement', () => {
        // Cookie attests "this client cleared the Turnstile gate" — nothing more. It is
        // set on every response path where enforceTurnstile returned true, regardless of
        // what SCAPI returns afterward (success / 400 / 404 / 5xx / generic 500). SCAPI's
        // verdict is about the email/account, not about whether the client is a bot;
        // conditioning the cookie on SCAPI success would force a fresh challenge for
        // events (typed unrecognized email, transient SLAS blip) that have nothing to do
        // with bot detection. The only case where the cookie is NOT set is when
        // enforceTurnstile itself rejected the request (NOT_AUTHORIZED).

        function getSetCookie(response: { init?: ResponseInit | null }): string | undefined {
            const headers = response.init?.headers;
            if (!headers) return undefined;
            // headers may be a plain object or a Headers instance
            if (headers instanceof Headers) return headers.get('Set-Cookie') ?? undefined;
            const record = headers as Record<string, string>;
            return record['Set-Cookie'];
        }

        it('sets cc-tv cookie on success', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expect(response.data).toEqual({ success: true, email: 'user@example.com' });
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('does NOT set cc-tv cookie when Turnstile rejects', async () => {
            mockEnforceTurnstile.mockResolvedValue(false);

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expect(response.data.error?.code).toBe('NOT_AUTHORIZED');
            expect(getSetCookie(response)).toBeUndefined();
        });

        it('does NOT set cc-tv cookie when email verification is disabled (early return before Turnstile)', async () => {
            // No Turnstile gate was cleared, so no attestation cookie is issued.
            const { getLoginPreferences } = await import('@/lib/login-preferences.server');
            vi.mocked(getLoginPreferences).mockResolvedValueOnce({ emailVerificationEnabled: false });

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data.requiresLogin).toBe(true);
            expect(getSetCookie(response)).toBeUndefined();
        });

        it('still sets cc-tv cookie when SCAPI returns 400 (requiresLogin path)', async () => {
            const { ApiError } = await import('@/scapi');
            const apiError = new ApiError({
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: { type: 'error', title: 'Bad Request', detail: 'Invalid request parameters' },
                rawBody: '{"message":"Invalid request parameters"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockAuthorizePasswordless.mockRejectedValue(apiError);
            const { extractErrorMessage } = await import('@/lib/auth/error-handler');
            vi.mocked(extractErrorMessage).mockReturnValue('Invalid request parameters');

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data.requiresLogin).toBe(true);
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('still sets cc-tv cookie on the email-not-verified recovery path (success after second authorize call)', async () => {
            const { ApiError } = await import('@/scapi');
            const apiError = new ApiError({
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: { type: 'error', title: 'Bad Request', detail: 'Email not verified' },
                rawBody: '{"message":"Email not verified"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockAuthorizePasswordless.mockRejectedValueOnce(apiError).mockResolvedValueOnce(undefined);
            const { extractErrorMessage } = await import('@/lib/auth/error-handler');
            vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('strictVerify', 'true');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data).toEqual({ success: true, email: 'user@example.com' });
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('still sets cc-tv cookie when SCAPI returns 403 (guest path)', async () => {
            const { ApiError } = await import('@/scapi');
            const apiError = new ApiError({
                status: 403,
                statusText: 'Forbidden',
                headers: new Headers(),
                body: { type: 'error', title: 'Forbidden', detail: 'Not authorized' },
                rawBody: '{"message":"Not authorized"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockAuthorizePasswordless.mockRejectedValue(apiError);

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data.success).toBe(false);
            expect(response.data.requiresLogin).toBeUndefined();
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('still sets cc-tv cookie when SCAPI throws a non-ApiError', async () => {
            mockAuthorizePasswordless.mockRejectedValue(new Error('network failure'));

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 500);
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('still sets cc-tv cookie when SCAPI returns a 5xx (5xx → requiresLogin fallback)', async () => {
            // 5xx ApiError flows to the SLAS-upstream-unavailable branch which returns
            // HTTP 200 + requiresLogin: true. The shopper has cleared Turnstile already;
            // a transient SLAS blip is not a bot signal, so the cookie still attaches.
            const { ApiError } = await import('@/scapi');
            const apiError = new ApiError({
                status: 502,
                statusText: 'Bad Gateway',
                headers: new Headers(),
                body: { type: 'error', title: 'Bad Gateway', detail: 'upstream timeout' },
                rawBody: '{"type":"error","title":"Bad Gateway","detail":"upstream timeout"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockAuthorizePasswordless.mockRejectedValue(apiError);

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data.requiresLogin).toBe(true);
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });

        it('still sets cc-tv cookie when SCAPI returns 404 (unknown-user → guest path)', async () => {
            // 404 ApiError flows to the unknown-user branch which returns HTTP 200 +
            // success: false. The shopper proceeds as guest. They cleared Turnstile, so
            // subsequent actions in the same session can trust the cookie.
            const { ApiError } = await import('@/scapi');
            const apiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: { type: 'error', title: 'Not Found', detail: 'User not found' },
                rawBody: '{"message":"User not found"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockAuthorizePasswordless.mockRejectedValue(apiError);

            const formData = new FormData();
            formData.append('email', 'unknown@example.com');
            const request = new Request('http://localhost/action/authorize-passwordless-email', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 200);
            expect(response.data.success).toBe(false);
            expect(response.data.requiresLogin).toBeUndefined();
            expect(getSetCookie(response)).toContain('cc-tv=1');
        });
    });
});
