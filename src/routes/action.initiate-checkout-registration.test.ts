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
import { action } from './action.initiate-checkout-registration';
import type { ActionFunctionArgs } from 'react-router';
import { expectStatus } from '@/lib/test-utils';

/** Deterministic HMAC-bound cookie value returned by the mocked enforceTurnstile. */
const TEST_COOKIE_VALUE = 'b'.repeat(64);

// Mock dependencies
vi.mock('@/lib/api-clients.server');
vi.mock('@/middlewares/auth.server');
vi.mock('@salesforce/storefront-next-runtime/i18n');
vi.mock('@/middlewares/auth.utils');
vi.mock('@/types/tracking-consent');
vi.mock('@/middlewares/basket.server');
vi.mock('@/lib/auth/error-handler');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: vi.fn(() => ({})),
}));
vi.mock('@/lib/turnstile/enforce.server', () => ({
    enforceTurnstile: vi.fn(),
    resolveVerificationMode: vi.fn(() => 'enforce'),
}));
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn((name: string) => ({
        parse: vi.fn().mockResolvedValue('some-prev-cookie-value'),
        // Reflect the serialized value so tests can assert on the actual cookie value
        // written by the action (HMAC-bound hex string, or fallback '1').
        serialize: vi.fn().mockImplementation((val: string) => Promise.resolve(`${name}_TestSite=${val}`)),
    })),
    // Returns the site-namespaced name that production callers pass into
    // `enforceTurnstile.turnstileCookieName`.
    getCookieNameWithSiteId: vi.fn((name: string) => `${name}_TestSite`),
    getCookieConfig: vi.fn((overrides = {}) => ({
        httpOnly: false,
        secure: true,
        sameSite: 'lax' as const,
        path: '/',
        ...overrides,
    })),
}));

const mockCreateApiClients = vi.fn();
const mockGetAuth = vi.fn();
const mockGetTranslation = vi.fn();
const mockIsTrackingConsentEnabled = vi.fn();
const mockTrackingConsentToBoolean = vi.fn();
const mockGetBasket = vi.fn();

describe('action.initiate-checkout-registration', () => {
    let mockRequest: Request;
    let mockContext: ActionFunctionArgs['context'];
    let mockPasswordlessAuthorize: ReturnType<typeof vi.fn>;
    let mockEnforceTurnstile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('error');

        const { enforceTurnstile } = await import('@/lib/turnstile/enforce.server');
        mockEnforceTurnstile = vi.mocked(enforceTurnstile);
        mockEnforceTurnstile.mockResolvedValue({ allowed: true, cookieValue: TEST_COOKIE_VALUE });

        // Setup default mocks
        mockPasswordlessAuthorize = vi.fn().mockResolvedValue({});

        mockCreateApiClients.mockReturnValue({
            auth: {
                passwordless: {
                    authorize: mockPasswordlessAuthorize,
                },
            },
        });

        mockGetAuth.mockReturnValue({
            usid: 'test-usid',
            trackingConsent: null,
        });

        mockGetTranslation.mockReturnValue({
            t: (key: string) => key,
        });

        mockIsTrackingConsentEnabled.mockReturnValue(false);

        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: {
                    email: 'test@example.com',
                },
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                        },
                    },
                ],
            },
        });

        const { createApiClients } = await import('@/lib/api-clients.server');
        vi.mocked(createApiClients).mockImplementation(mockCreateApiClients);

        const { getAuth } = await import('@/middlewares/auth.server');
        vi.mocked(getAuth).mockImplementation(mockGetAuth);

        const { getTranslation, getLocale } = await import('@salesforce/storefront-next-runtime/i18n');
        vi.mocked(getTranslation).mockImplementation(mockGetTranslation);
        vi.mocked(getLocale).mockReturnValue('en-US');

        const { isTrackingConsentEnabled } = await import('@/middlewares/auth.utils');
        vi.mocked(isTrackingConsentEnabled).mockImplementation(mockIsTrackingConsentEnabled);

        const { getBasket } = await import('@/middlewares/basket.server');
        vi.mocked(getBasket).mockImplementation(mockGetBasket);

        mockContext = {
            get: vi.fn(() => ({ getLocale: () => 'en-US' })),
        } as unknown as ActionFunctionArgs['context'];
    });

    it('should successfully initiate registration with email from form data', async () => {
        const formData = new FormData();
        formData.append('email', 'user@example.com');

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        const result = response.data;
        expect(result).toEqual({
            success: true,
            email: 'user@example.com',
        });

        expect(mockPasswordlessAuthorize).toHaveBeenCalledWith({
            userId: 'user@example.com',
            mode: 'email',
            locale: 'en-US',
            usid: 'test-usid',
            registerCustomer: true,
            firstName: 'John',
            lastName: 'Doe',
            email: 'user@example.com',
        });
    });

    it('returns 405 METHOD_NOT_ALLOWED for non-POST requests', async () => {
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'GET',
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
        expectStatus(response, 405);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should successfully initiate registration with email from basket', async () => {
        const formData = new FormData();

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        const result = response.data;
        expect(result).toEqual({
            success: true,
            email: 'test@example.com',
        });

        expect(mockPasswordlessAuthorize).toHaveBeenCalledWith({
            userId: 'test@example.com',
            mode: 'email',
            locale: 'en-US',
            usid: 'test-usid',
            registerCustomer: true,
            firstName: 'John',
            lastName: 'Doe',
            email: 'test@example.com',
        });
    });

    it('should return error when email is not found in form data or basket', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: {},
            },
        });

        const formData = new FormData();

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        const result = response.data;
        expect(result.success).toBe(false);
        expect(result.error).toEqual({ code: 'REQUIRED_FIELD', message: 'Email is required' });

        expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
    });

    it('should include dnt parameter when tracking consent is enabled', async () => {
        mockIsTrackingConsentEnabled.mockReturnValue(true);
        mockGetAuth.mockReturnValue({
            usid: 'test-usid',
            trackingConsent: 'optedOut',
        });
        mockTrackingConsentToBoolean.mockReturnValue(true);

        const { trackingConsentToBoolean } = await import('@/types/tracking-consent');
        vi.mocked(trackingConsentToBoolean).mockImplementation(mockTrackingConsentToBoolean);

        const formData = new FormData();
        formData.append('email', 'user@example.com');

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        const result = response.data;
        expect(result.success).toBe(true);

        expect(mockPasswordlessAuthorize).toHaveBeenCalledWith({
            userId: 'user@example.com',
            mode: 'email',
            locale: 'en-US',
            usid: 'test-usid',
            registerCustomer: true,
            firstName: 'John',
            lastName: 'Doe',
            email: 'user@example.com',
            dnt: true,
        });
    });

    it('should handle API errors gracefully', async () => {
        mockPasswordlessAuthorize.mockRejectedValue(new Error('API Error'));

        const formData = new FormData();
        formData.append('email', 'user@example.com');

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 500);
        const result = response.data;
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('should parse error message from API response rawBody', async () => {
        const apiError = {
            rawBody: JSON.stringify({ message: 'Email already registered' }),
        };
        mockPasswordlessAuthorize.mockRejectedValue(apiError);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Email already registered');

        const formData = new FormData();
        formData.append('email', 'user@example.com');

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 500);
        const result = response.data;
        expect(result).toEqual({
            success: false,
            error: { code: 'OPERATION_FAILED', message: 'Email already registered' },
        });
    });

    it('should include customer info from basket when available', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: {
                    email: 'john@example.com',
                },
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                        },
                    },
                ],
            },
        });

        const formData = new FormData();

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        const result = response.data;
        expect(result.success).toBe(true);

        expect(mockPasswordlessAuthorize).toHaveBeenCalledWith(
            expect.objectContaining({
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
            })
        );
    });

    it('should skip turnstile when verification is disabled', async () => {
        const { createCookie } = await import('@/lib/cookie-utils.server');
        vi.mocked(createCookie).mockReturnValue({
            parse: vi.fn().mockResolvedValue(null),
            serialize: vi.fn().mockResolvedValue(''),
        } as never);

        const formData = new FormData();
        formData.append('email', 'user@example.com');

        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.success).toBe(true);
        expect(mockEnforceTurnstile).not.toHaveBeenCalled();
        expect(mockPasswordlessAuthorize).toHaveBeenCalled();
    });

    describe('when turnstile verification is enabled', () => {
        beforeEach(async () => {
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValue({
                security: { turnstile: { enabled: true, verification: { enabled: true } } },
            } as never);
        });

        afterEach(async () => {
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValue({} as never);
        });

        it('should block request when enforceTurnstile returns false', async () => {
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'bad-token');

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
            const result = response.data;

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('NOT_AUTHORIZED');
            expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
        });

        it('should pass turnstileToken to enforceTurnstile', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'test-token');

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(mockEnforceTurnstile).toHaveBeenCalledWith(
                expect.objectContaining({
                    turnstileToken: 'test-token',
                    actionName: 'initiate-checkout-registration',
                    email: 'user@example.com',
                })
            );
        });

        it('calls enforceTurnstile even when a verification cookie is present', async () => {
            // The pre-check bypass was removed: enforceTurnstile is always invoked so
            // its HMAC email-binding check always runs. When the cookie matches the
            // current email, enforceTurnstile short-circuits internally and returns
            // { allowed: true, cookieValue: null }.
            mockEnforceTurnstile.mockResolvedValue({ allowed: true, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'user@example.com');

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
            const result = response.data;

            expect(result.success).toBe(true);
            expect(mockEnforceTurnstile).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.com' }));
            expect(mockPasswordlessAuthorize).toHaveBeenCalled();
        });

        it('blocks when cookie is for a different email (enumeration attack)', async () => {
            // Attacker solved Turnstile for attacker@example.com, now replays that
            // cookie against victim@example.com with no fresh token. Without the
            // email-binding check this would short-circuit; with it, enforceTurnstile
            // must be consulted so it can compare cookie vs current email.
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'victim@example.com');
            // No turnstileToken - attacker is reusing the cookie.

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
            const result = response.data;

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('NOT_AUTHORIZED');
            expect(mockEnforceTurnstile).toHaveBeenCalledWith(expect.objectContaining({ email: 'victim@example.com' }));
            expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
        });

        it('should block when no token and no cookie', async () => {
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

            const { createCookie } = await import('@/lib/cookie-utils.server');
            vi.mocked(createCookie).mockReturnValue({
                parse: vi.fn().mockResolvedValue(null),
                serialize: vi.fn().mockResolvedValue(''),
            } as never);

            const formData = new FormData();
            formData.append('email', 'user@example.com');

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
            const result = response.data;

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('NOT_AUTHORIZED');
            expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
        });

        it('should not call SCAPI when Turnstile blocks the request', async () => {
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'bad-token');

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
            expect(mockGetBasket).not.toHaveBeenCalled();
        });

        it('rejects when no cc-tv cookie and no fresh token', async () => {
            // Edge case: a client (e.g., a bot probing /initiate-checkout-registration
            // directly) hits this endpoint with no Turnstile token AND no cc-tv cookie
            // from a prior session. enforceTurnstile is consulted, which we expect to
            // reject the missing-token-and-platform-healthy case in production. The
            // request must NOT reach SCAPI's authorize.
            const { createCookie } = await import('@/lib/cookie-utils.server');
            vi.mocked(createCookie).mockReturnValue({
                parse: vi.fn().mockResolvedValue(null), // no cc-tv cookie present
                serialize: vi.fn().mockResolvedValue(''),
            } as never);
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null }); // simulates the missing-token-and-platform-healthy block path

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            // Deliberately no turnstileToken — bot would also lack one.

            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
            const result = response.data;

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('NOT_AUTHORIZED');
            expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
            expect(mockEnforceTurnstile).toHaveBeenCalledWith(
                expect.objectContaining({
                    turnstileToken: undefined,
                    actionName: 'initiate-checkout-registration',
                    email: 'user@example.com',
                })
            );
        });
    });

    // ── Basket-email path: missing names ──────────────────────────────────────

    it('returns REQUIRED_FIELD 400 when basket has email but shipping address lacks firstName', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: { email: 'test@example.com' },
                shipments: [
                    {
                        shippingAddress: {
                            // firstName intentionally missing
                            lastName: 'Doe',
                        },
                    },
                ],
            },
        });

        const formData = new FormData(); // no email in form → basket path
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('REQUIRED_FIELD');
        expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
    });

    it('returns REQUIRED_FIELD 400 when basket has email but shipping address lacks lastName', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: { email: 'test@example.com' },
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'Jane',
                            // lastName intentionally missing
                        },
                    },
                ],
            },
        });

        const formData = new FormData();
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('REQUIRED_FIELD');
        expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
    });

    it('returns REQUIRED_FIELD 400 when basket has email but no shipments/shippingAddress', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: { email: 'test@example.com' },
                // no shipments
            },
        });

        const formData = new FormData();
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('REQUIRED_FIELD');
    });

    // ── Basket-email path: trackingConsent ────────────────────────────────────

    it('includes dnt in basket-email path when tracking consent is enabled', async () => {
        mockIsTrackingConsentEnabled.mockReturnValue(true);
        mockGetAuth.mockReturnValue({ usid: 'test-usid', trackingConsent: 'optedOut' });
        mockTrackingConsentToBoolean.mockReturnValue(true);

        const { trackingConsentToBoolean } = await import('@/types/tracking-consent');
        vi.mocked(trackingConsentToBoolean).mockImplementation(mockTrackingConsentToBoolean);

        const formData = new FormData(); // no email → basket path
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expect(response.data.success).toBe(true);
        expect(mockPasswordlessAuthorize).toHaveBeenCalledWith(expect.objectContaining({ dnt: true }));
    });

    // ── Form-email path: missing names ────────────────────────────────────────

    it('returns REQUIRED_FIELD 400 when form email provided but shipping address lacks firstName', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: { email: 'other@example.com' },
                shipments: [
                    {
                        shippingAddress: {
                            // firstName intentionally missing
                            lastName: 'Smith',
                        },
                    },
                ],
            },
        });

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('REQUIRED_FIELD');
        expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
    });

    it('returns REQUIRED_FIELD 400 when form email provided but shipping address lacks lastName', async () => {
        mockGetBasket.mockResolvedValue({
            current: {
                customerInfo: { email: 'other@example.com' },
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'Bob',
                            // lastName intentionally missing
                        },
                    },
                ],
            },
        });

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

        expectStatus(response, 400);
        expect(response.data.success).toBe(false);
        expect(response.data.error?.code).toBe('REQUIRED_FIELD');
        expect(mockPasswordlessAuthorize).not.toHaveBeenCalled();
    });

    // ── respondWithCookie: Headers instance branch (line 98) ──────────────────

    // The `existingHeaders instanceof Headers` branch inside respondWithCookie is a
    // defensive guard: no call-site within this action passes a Headers instance for
    // `init.headers` (every call uses either no init or `{ status: N }`). It is
    // therefore unreachable from the current codebase. The branch exists so the
    // helper is correct if a future caller does pass a Headers instance.
    // No test is added for it; this comment documents the gap.

    it('should return unavailable when SLAS responds with 400 email not verified', async () => {
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
        mockPasswordlessAuthorize.mockRejectedValue(apiError);
        const { extractErrorMessage } = await import('@/lib/auth/error-handler');
        vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 200);
        expect(result.success).toBe(false);
        expect(result.unavailable).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('should not return unavailable for 400 with a different error message', async () => {
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
        mockPasswordlessAuthorize.mockRejectedValue(apiError);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 400);
        expect(result.success).toBe(false);
        expect(result.unavailable).toBeUndefined();
        expect(result.error).toBeTruthy();
    });

    it('should not return unavailable for non-400 ApiErrors', async () => {
        const { ApiError } = await import('@/scapi');
        const apiError = new ApiError({
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            body: { type: 'error', title: 'Server Error', detail: 'Something went wrong' },
            rawBody: '{"type":"error","title":"Server Error","detail":"Something went wrong"}',
            url: 'https://api.example.com/authorize-passwordless',
            method: 'POST',
        });
        mockPasswordlessAuthorize.mockRejectedValue(apiError);

        const formData = new FormData();
        formData.append('email', 'user@example.com');
        mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expectStatus(response, 500);
        expect(result.success).toBe(false);
        expect(result.unavailable).toBeUndefined();
        expect(result.error).toBeTruthy();
    });

    describe('cc-tv cookie placement', () => {
        // Cookie attests "this client cleared the Turnstile gate" — nothing more. It
        // is set on every response path where enforceTurnstile freshly verified the
        // request, regardless of what SCAPI returns afterward (success / 400 unavailable
        // / 400 generic / 500). SCAPI's verdict is about the email/account, not about
        // whether the client is a bot. The only case where the cookie is NOT set is
        // when enforceTurnstile rejected the request, OR when the request was already
        // covered by a prior valid cookie (no point re-emitting).

        function getSetCookie(response: { init?: ResponseInit | null }): string | undefined {
            const headers = response.init?.headers;
            if (!headers) return undefined;
            if (headers instanceof Headers) return headers.get('Set-Cookie') ?? undefined;
            const record = headers as Record<string, string>;
            return record['Set-Cookie'];
        }

        beforeEach(async () => {
            // Turnstile verification must be enabled in config for the action's
            // shouldSetCookie path to execute at all (without it, the action skips
            // enforceTurnstile entirely and never sets shouldSetCookie).
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValue({
                security: { turnstile: { enabled: true, verification: { enabled: true } } },
            } as never);

            // Force the no-prior-cookie path so shouldSetCookie becomes true after the
            // fresh enforceTurnstile pass. The default mock in the outer describe sets
            // parse → '1' (i.e., cookie already valid), which would short-circuit
            // shouldSetCookie to false and is already covered by other tests.
            const { createCookie } = await import('@/lib/cookie-utils.server');
            vi.mocked(createCookie).mockReturnValue({
                parse: vi.fn().mockResolvedValue(null),
                serialize: vi.fn().mockImplementation((val: string) => Promise.resolve(`cc-tv_TestSite=${val}`)),
            } as never);
            mockEnforceTurnstile.mockResolvedValue({ allowed: true, cookieValue: TEST_COOKIE_VALUE });
        });

        it('sets cc-tv cookie on success', async () => {
            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'fresh-token');
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(response.data.success).toBe(true);
            expect(getSetCookie(response)).toContain(`cc-tv_TestSite=${TEST_COOKIE_VALUE}`);
        });

        it('still sets cc-tv cookie when SCAPI returns 400 email-not-verified (unavailable)', async () => {
            // oxlint-disable-next-line no-restricted-imports -- oxlint flags dynamic await import(); core eslint no-restricted-imports ignores dynamic imports
            const { ApiError } = await import('@salesforce/storefront-next-runtime/scapi');
            const apiError = new ApiError({
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: { type: 'error', title: 'Bad Request', detail: 'Email not verified' },
                rawBody: '{"message":"Email not verified"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockPasswordlessAuthorize.mockRejectedValue(apiError);
            const { extractErrorMessage } = await import('@/lib/auth/error-handler');
            vi.mocked(extractErrorMessage).mockReturnValue('Email not verified');

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'fresh-token');
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(response.data.unavailable).toBe(true);
            expect(getSetCookie(response)).toContain(`cc-tv_TestSite=${TEST_COOKIE_VALUE}`);
        });

        it('still sets cc-tv cookie when SCAPI returns a different 400 error', async () => {
            // oxlint-disable-next-line no-restricted-imports -- oxlint flags dynamic await import(); core eslint no-restricted-imports ignores dynamic imports
            const { ApiError } = await import('@salesforce/storefront-next-runtime/scapi');
            const apiError = new ApiError({
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: { type: 'error', title: 'Bad Request', detail: 'Some other error' },
                rawBody: '{"message":"Some other error"}',
                url: 'https://api.example.com/authorize-passwordless',
                method: 'POST',
            });
            mockPasswordlessAuthorize.mockRejectedValue(apiError);
            const { extractErrorMessage } = await import('@/lib/auth/error-handler');
            vi.mocked(extractErrorMessage).mockReturnValue('Some other error');

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'fresh-token');
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 400);
            expect(getSetCookie(response)).toContain(`cc-tv_TestSite=${TEST_COOKIE_VALUE}`);
        });

        it('still sets cc-tv cookie when SCAPI throws a non-ApiError', async () => {
            mockPasswordlessAuthorize.mockRejectedValue(new Error('network failure'));

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'fresh-token');
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expectStatus(response, 500);
            expect(getSetCookie(response)).toContain(`cc-tv_TestSite=${TEST_COOKIE_VALUE}`);
        });

        it('does NOT set cc-tv cookie when Turnstile rejects', async () => {
            mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            formData.append('turnstileToken', 'fresh-token');
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(response.data.error?.code).toBe('NOT_AUTHORIZED');
            expect(getSetCookie(response)).toBeUndefined();
        });

        it('does NOT re-emit cc-tv cookie when prior valid cookie was already present', async () => {
            // Cookie short-circuit lives inside enforceTurnstile: a matching HMAC-bound
            // cookie returns { allowed: true, cookieValue: null }, so shouldSetCookie
            // stays false and the response carries no Set-Cookie.
            mockEnforceTurnstile.mockResolvedValue({ allowed: true, cookieValue: null });

            const formData = new FormData();
            formData.append('email', 'user@example.com');
            // No fresh turnstileToken; cookie is the only credential.
            mockRequest = new Request('http://localhost/action/initiate-checkout-registration', {
                method: 'POST',
                body: formData,
            });

            const response = await action({ request: mockRequest, context: mockContext } as ActionFunctionArgs);

            expect(response.data.success).toBe(true);
            expect(mockEnforceTurnstile).toHaveBeenCalled();
            expect(getSetCookie(response)).toBeUndefined();
        });
    });
});
