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
import { action } from './action.request-password-reset';
import { getAuth, getPasswordResetToken } from '@/middlewares/auth.server';
import { getVerifiedLoginFromAccessToken } from '@/lib/auth/verified-session-login.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';

vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/auth/verified-session-login.server');
vi.mock('@salesforce/storefront-next-runtime/i18n');
vi.mock('@/lib/logger.server');
vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    serializePasswordResetEmailCookie: vi.fn((_context: unknown, email: string) =>
        Promise.resolve(`cc-pwreset-email_Site=${encodeURIComponent(email)}; HttpOnly`)
    ),
}));

// The response-time floor is covered in its own tests; here it would only slow every case by a second.
vi.mock('@/lib/auth/response-time-floor.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/auth/response-time-floor.server')>()),
    withMinimumDuration: vi.fn(<T>(_minMs: number, work: () => Promise<T>) => work()),
}));

describe('action.request-password-reset', () => {
    const mockContext = {} as any;
    const mockT = vi.fn((key: string) => key);
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getTranslation).mockReturnValue({ t: mockT } as any);
        vi.mocked(getLogger).mockReturnValue(mockLogger as any);
        // Default: anonymous caller (no session email). Tests opt in to a registered session.
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', accessToken: undefined } as any);
        // Default: the token does not verify, so nothing counts as "own account".
        vi.mocked(getVerifiedLoginFromAccessToken).mockResolvedValue(null);
    });

    /** Registered session whose access token verifies (signature checked against the SLAS JWKS) as this login. */
    const signInAs = (loginEmail: string) => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            accessToken: 'jwt',
            customerId: 'cust-1',
        } as any);
        vi.mocked(getVerifiedLoginFromAccessToken).mockResolvedValue(loginEmail);
    };

    it('returns error when email is missing', async () => {
        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({}),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ error: 'resetPassword:emailRequired' });
        expect(mockT).toHaveBeenCalledWith('resetPassword:emailRequired');
    });

    it('returns success when password reset token is sent successfully', async () => {
        vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: 'test@example.com' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ success: true });
        expect(getPasswordResetToken).toHaveBeenCalledWith(mockContext, {
            email: 'test@example.com',
        });
        // The logged email is redacted (hashed local part)
        expect(mockLogger.info).toHaveBeenCalledWith('RequestPasswordReset: reset token sent', {
            email: expect.stringMatching(/^[0-9a-f]{8}@example\.com$/),
        });
        expect(result.headers.get('Set-Cookie')).toBe('cc-pwreset-email_Site=test%40example.com; HttpOnly');
    });

    describe('account enumeration', () => {
        const submit = (email: string) =>
            action({
                request: new Request('http://localhost/action/request-password-reset', {
                    method: 'POST',
                    body: new URLSearchParams({ email }),
                }),
                context: mockContext,
                params: {},
            } as any);

        // Every way the send can end for an account that is not (or cannot be) reset
        const suppressedFailures: Array<[string, Error]> = [
            ['unknown account', new Error('Email not found')],
            ['generic API error', new Error('API Error')],
            ['network failure', new Error('Network timeout')],
            ['invalid token style error', new Error('Invalid authentication token provided.')],
            ['rate limit', new Error('Too many password reset requests. Please try again later.')],
            ['monthly quota', new Error('Monthly quota exceeded for password resets')],
        ];

        it.each(
            suppressedFailures
        )('returns the same status, body and Set-Cookie as a successful send for %s', async (_label, failure) => {
            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);
            const known = await submit('someone@example.com');

            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(failure);
            const suppressed = await submit('someone@example.com');

            expect(suppressed.status).toBe(known.status);
            expect(await suppressed.json()).toEqual(await known.clone().json());
            expect(suppressed.headers.get('Set-Cookie')).toBe('cc-pwreset-email_Site=someone%40example.com; HttpOnly');
            expect(suppressed.headers.get('Set-Cookie')).toBe(known.headers.get('Set-Cookie'));
            expect(suppressed.headers.get('Content-Type')).toBe(known.headers.get('Content-Type'));
        });

        it('does not surface any error to the client when the send fails', async () => {
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));

            const data = await (await submit('nonexistent@example.com')).json();

            expect(data).toEqual({ success: true });
        });

        it('still logs the suppressed failure server-side with a redacted email', async () => {
            const failure = new Error('API Error');
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(failure);

            await submit('test@example.com');

            expect(mockLogger.error).toHaveBeenCalledWith('RequestPasswordReset: failed', {
                error: failure,
                email: expect.stringMatching(/^[0-9a-f]{8}@example\.com$/),
            });
            expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('test@example.com');
        });

        it.each([
            ['no callback_uri is registered', 'No callback_uri is registered for this client'],
            ['callback_uri mismatch', "Callback_uri doesn't match the registered value"],
        ])('still surfaces feature-unavailable (%s) because it is a client-level configuration check', async (_l, msg) => {
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error(msg));

            const result = await submit('someone@example.com');

            expect(await result.json()).toEqual({ error: 'errors:featureUnavailable' });
            // No remembered-email cookie for a request that could not be sent for any account
            expect(result.headers.get('Set-Cookie')).toBeNull();
        });
    });

    describe('signed-in shopper resetting their own password', () => {
        const submit = (email: string) =>
            action({
                request: new Request('http://localhost/action/request-password-reset', {
                    method: 'POST',
                    body: new URLSearchParams({ email }),
                }),
                context: mockContext,
                params: {},
            } as any);

        it.each([
            [
                'rate limit',
                'Too many password reset requests. Please try again later.',
                'errors:tooManyPasswordResetAttempts',
            ],
            ['backend error', 'Some unexpected error from backend', 'errors:genericTryAgain'],
            ['network failure', 'Network timeout', 'errors:genericTryAgain'],
            ['feature unavailable', 'No callback_uri is registered for this client', 'errors:featureUnavailable'],
        ])('shows the real error for %s so the toast is not a false success', async (_l, message, key) => {
            signInAs('me@example.com');
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error(message));

            const result = await submit('me@example.com');

            expect(await result.json()).toEqual({ error: key });
            expect(result.headers.get('Set-Cookie')).toBeNull();
        });

        it('treats the session email case-insensitively', async () => {
            signInAs('Me@Example.com');
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Network timeout'));

            const result = await submit('me@example.com');

            expect(await result.json()).toEqual({ error: 'errors:genericTryAgain' });
        });

        it('still returns success and the cookie when the send works', async () => {
            signInAs('me@example.com');
            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

            const result = await submit('me@example.com');

            expect(await result.json()).toEqual({ success: true });
            expect(result.headers.get('Set-Cookie')).toBe('cc-pwreset-email_Site=me%40example.com; HttpOnly');
        });

        it("stays neutral when a signed-in shopper submits somebody else's email (no oracle for registered attackers)", async () => {
            signInAs('me@example.com');
            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);
            const known = await submit('victim@example.com');

            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));
            const unknown = await submit('victim@example.com');

            expect(await unknown.json()).toEqual(await known.clone().json());
            expect(unknown.headers.get('Set-Cookie')).toBe(known.headers.get('Set-Cookie'));
        });

        it('stays neutral for a guest session', async () => {
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest', accessToken: 'jwt', customerId: 'g-1' } as any);
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Network timeout'));

            const result = await submit('me@example.com');

            expect(await result.json()).toEqual({ success: true });
            expect(getVerifiedLoginFromAccessToken).not.toHaveBeenCalled();
        });

        describe('forged or unverifiable session (the access token cookie is only decoded elsewhere, not verified)', () => {
            const forgedSession = () =>
                vi.mocked(getAuth).mockReturnValue({
                    userType: 'registered',
                    accessToken: 'forged.unsigned.token',
                    customerId: 'forged-rcid',
                } as any);

            it('stays neutral when the token signature does not verify, even if it claims the submitted email', async () => {
                // Decoding the cookie would say "victim@example.com"; verification refuses it (null), so it must not count.
                forgedSession();
                vi.mocked(getVerifiedLoginFromAccessToken).mockResolvedValue(null);
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(
                    new Error('Too many password reset requests. Please try again later.')
                );

                const result = await submit('victim@example.com');

                expect(await result.json()).toEqual({ success: true });
                expect(result.headers.get('Set-Cookie')).toBe('cc-pwreset-email_Site=victim%40example.com; HttpOnly');
            });

            it('gives a forged session the same response for known and unknown emails', async () => {
                forgedSession();

                vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);
                const known = await submit('victim@example.com');
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));
                const unknown = await submit('victim@example.com');

                expect(await unknown.json()).toEqual(await known.clone().json());
                expect(unknown.headers.get('Set-Cookie')).toBe(known.headers.get('Set-Cookie'));
            });

            it('stays neutral when the session has no access token to verify', async () => {
                vi.mocked(getAuth).mockReturnValue({ userType: 'registered' } as any);
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Network timeout'));

                const result = await submit('me@example.com');

                expect(await result.json()).toEqual({ success: true });
                expect(getVerifiedLoginFromAccessToken).not.toHaveBeenCalled();
            });
        });

        it('verifies the session token itself, never anything taken from the request', async () => {
            signInAs('me@example.com');
            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

            await submit('someone-else@example.com');

            expect(getVerifiedLoginFromAccessToken).toHaveBeenCalledTimes(1);
            expect(getVerifiedLoginFromAccessToken).toHaveBeenCalledWith(mockContext, 'jwt');
        });

        it('starts the send without waiting for the ownership check (they run concurrently)', async () => {
            signInAs('me@example.com');
            let releaseVerification!: (login: string) => void;
            vi.mocked(getVerifiedLoginFromAccessToken).mockReturnValue(
                new Promise<string>((resolve) => {
                    releaseVerification = resolve;
                })
            );
            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

            const pending = submit('me@example.com');
            // Verification is still unresolved here, so the send being issued proves it did not wait for it.
            await vi.waitFor(() => expect(getPasswordResetToken).toHaveBeenCalledTimes(1));

            releaseVerification('me@example.com');
            expect(await (await pending).json()).toEqual({ success: true });
        });
    });

    describe('response time', () => {
        it('runs every email-dependent outcome inside the response-time floor', async () => {
            const { withMinimumDuration, PASSWORD_RESET_MIN_RESPONSE_MS } = await import(
                '@/lib/auth/response-time-floor.server'
            );
            const submit = (email: string) =>
                action({
                    request: new Request('http://localhost/action/request-password-reset', {
                        method: 'POST',
                        body: new URLSearchParams({ email }),
                    }),
                    context: mockContext,
                    params: {},
                } as any);

            vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);
            await submit('known@example.com');
            vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));
            await submit('unknown@example.com');

            expect(withMinimumDuration).toHaveBeenCalledTimes(2);
            expect(withMinimumDuration).toHaveBeenCalledWith(PASSWORD_RESET_MIN_RESPONSE_MS, expect.any(Function));
        });

        it('does not pad a request that has no email (it reveals nothing about any account)', async () => {
            const { withMinimumDuration } = await import('@/lib/auth/response-time-floor.server');

            await action({
                request: new Request('http://localhost/action/request-password-reset', {
                    method: 'POST',
                    body: new URLSearchParams({}),
                }),
                context: mockContext,
                params: {},
            } as any);

            expect(withMinimumDuration).not.toHaveBeenCalled();
        });
    });

    it('handles empty email string', async () => {
        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: '' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ error: 'resetPassword:emailRequired' });
    });

    it('trims and validates email', async () => {
        vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: '  test@example.com  ' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ success: true });
        expect(getPasswordResetToken).toHaveBeenCalledWith(mockContext, {
            email: '  test@example.com  ',
        });
    });
});
