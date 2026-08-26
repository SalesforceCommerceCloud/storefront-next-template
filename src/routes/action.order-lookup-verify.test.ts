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
import { action } from './action.order-lookup-verify';
import type { ActionFunctionArgs } from 'react-router';
import { ErrorCode } from '@/lib/error-codes';

vi.mock('@/lib/order/scapi.server');
vi.mock('@/lib/order/session.server');
vi.mock('@/lib/order/verify-attempts.server');
vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@salesforce/storefront-next-runtime/site-context');

const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
};
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

const mockCookie = {
    parse: vi.fn().mockResolvedValue('signed-order-state'),
    serialize: vi.fn().mockResolvedValue('mock-set-cookie'),
};
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(() => mockCookie),
    getCookieConfig: vi.fn((overrides = {}) => ({
        httpOnly: true,
        secure: true,
        sameSite: 'lax' as const,
        path: '/order-lookup',
        ...overrides,
    })),
}));

describe('action.order-lookup-verify', () => {
    let mockContext: ActionFunctionArgs['context'];
    let mockGuestOrderLookup: ReturnType<typeof vi.fn>;
    let mockSignOrderState: ReturnType<typeof vi.fn>;
    let mockVerifyOrderState: ReturnType<typeof vi.fn>;
    let mockHashOrderNumber: ReturnType<typeof vi.fn>;
    let mockGetServerVerifyAttempts: ReturnType<typeof vi.fn>;
    let mockRecordFailedVerifyAttempt: ReturnType<typeof vi.fn>;
    let mockClearServerVerifyAttempts: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: {
                enabled: true,
                turnstile: {
                    enabled: false,
                    failOpen: false,
                },
            },
        } as ReturnType<typeof getConfig>);

        const { siteContext } = await import('@salesforce/storefront-next-runtime/site-context');
        mockContext = {
            get: vi.fn((key) => {
                if (key === siteContext) {
                    return {
                        site: { id: 'RefArch' },
                        locale: 'en-US',
                    };
                }
                return undefined;
            }),
        } as unknown as ActionFunctionArgs['context'];

        const { guestOrderLookup } = await import('@/lib/order/scapi.server');
        mockGuestOrderLookup = vi.mocked(guestOrderLookup);
        mockGuestOrderLookup.mockReset();

        const { signOrderState, verifyOrderState, hashOrderNumber } = await import('@/lib/order/session.server');
        mockSignOrderState = vi.mocked(signOrderState);
        mockVerifyOrderState = vi.mocked(verifyOrderState);
        mockHashOrderNumber = vi.mocked(hashOrderNumber);
        mockSignOrderState.mockReturnValue('signed-order-state');
        mockHashOrderNumber.mockReturnValue('hashed-order');
        // Default: a valid, matching order-state cookie is present — most tests exercise
        // behavior downstream of the cookie gate, not the gate itself.
        mockVerifyOrderState.mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-order',
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const { getServerVerifyAttempts, recordFailedVerifyAttempt, clearServerVerifyAttempts } = await import(
            '@/lib/order/verify-attempts.server'
        );
        mockGetServerVerifyAttempts = vi.mocked(getServerVerifyAttempts);
        mockRecordFailedVerifyAttempt = vi.mocked(recordFailedVerifyAttempt);
        mockClearServerVerifyAttempts = vi.mocked(clearServerVerifyAttempts);
        mockGetServerVerifyAttempts.mockReturnValue(0);
        mockRecordFailedVerifyAttempt.mockReturnValue(1);
    });

    it('returns CONFIGURATION_ERROR when signing fails on the failed-attempt path', async () => {
        const { GuestOrderLookupSigningSecretMissingError } = await import('@/lib/order/session.server');
        mockSignOrderState.mockImplementation(() => {
            throw new GuestOrderLookupSigningSecretMissingError();
        });
        mockGuestOrderLookup.mockResolvedValue({
            code: 'INVALID_CODE',
            status: 401,
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(response.init?.status).toBe(500);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('CONFIGURATION_ERROR');
        }
    });

    it('returns CONFIGURATION_ERROR when signing fails on the verified success path', async () => {
        const { GuestOrderLookupSigningSecretMissingError } = await import('@/lib/order/session.server');
        mockSignOrderState.mockImplementation(() => {
            throw new GuestOrderLookupSigningSecretMissingError();
        });
        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER123' },
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(response.init?.status).toBe(500);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('CONFIGURATION_ERROR');
        }
    });

    it('rejects non-POST requests', async () => {
        const request = new Request('http://localhost/action/order-lookup-verify', { method: 'GET' });
        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
        }
    });

    it('rejects when feature is disabled', async () => {
        const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: {
                enabled: false,
            },
        } as ReturnType<typeof getConfig>);

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('FEATURE_DISABLED');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('validates order number', async () => {
        const formData = new FormData();
        formData.append('orderNumber', ''); // Invalid
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('VALIDATION');
            expect(result.field).toBe('orderNumber');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('validates email', async () => {
        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'invalid-email'); // Invalid
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('VALIDATION');
            expect(result.field).toBe('email');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('validates OTP code', async () => {
        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '12345'); // Invalid: must be 6 digits

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('VALIDATION');
            expect(result.field).toBe('code');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('rejects with NOT_AUTHORIZED when no order-state cookie is present', async () => {
        // orderStateCookie.parse() resolving to null means verifyOrderState is never called
        // (the action short-circuits) — no need to stub its return value here.
        mockCookie.parse.mockResolvedValueOnce(null);

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(response.init?.status).toBe(401);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('NOT_AUTHORIZED');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('rejects with NOT_AUTHORIZED when the order-state cookie is for a different order', async () => {
        mockVerifyOrderState.mockReturnValueOnce({
            siteId: 'RefArch',
            orderNumberHash: 'some-other-order-hash',
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(response.init?.status).toBe(401);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('NOT_AUTHORIZED');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('rejects when attempts exceed limit', async () => {
        // The server-side counter (not the client-supplied cookie) is the real gate.
        mockGetServerVerifyAttempts.mockReturnValueOnce(5); // MAX_ATTEMPTS

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('ATTEMPTS_EXCEEDED');
        }
        expect(mockGuestOrderLookup).not.toHaveBeenCalled();
    });

    it('handles SCAPI_UNSUPPORTED error', async () => {
        mockGuestOrderLookup.mockRejectedValue(
            Object.assign(new Error('SCAPI version unsupported'), { code: ErrorCode.SCAPI_UNSUPPORTED })
        );

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('SCAPI_UNSUPPORTED');
        }
    });

    it('handles RATE_LIMITED from SCAPI', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            code: ErrorCode.RATE_LIMITED,
            status: 429,
            retryAfterSeconds: 60,
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RATE_LIMITED');
            expect(result.retryAfterSeconds).toBe(60);
        }
    });

    it('handles INVALID_CODE from SCAPI and increments attempt counter', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            code: 'INVALID_CODE',
            status: 401,
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('INVALID_CODE');
        }
        expect(mockSignOrderState).toHaveBeenCalledWith(
            expect.objectContaining({
                siteId: 'RefArch',
                orderNumberHash: 'hashed-order',
                verified: false,
                verifiedCode: null,
                attempts: 1,
            })
        );
        expect(mockCookie.serialize).toHaveBeenCalledWith('signed-order-state');
    });

    it('treats "order not found" as INVALID_CODE (enumeration defense)', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            code: 'LOOKUP_FAILED',
            status: 404,
        });

        const formData = new FormData();
        formData.append('orderNumber', 'NOTFOUND123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('INVALID_CODE');
        }
    });

    it('succeeds and sets the order-state cookie on valid code', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER123' },
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(true);
        expect(mockSignOrderState).toHaveBeenCalledWith({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-order',
            issuedAt: expect.any(Number),
            email: 'user@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });
        expect(mockCookie.serialize).toHaveBeenCalledWith('signed-order-state');
    });

    it('scopes the order-state cookie name by order hash', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER123' },
        });

        const { createCookie } = await import('@/lib/cookie-utils.server');
        const mockCreateCookie = vi.mocked(createCookie);

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        // The order-state cookie must be named per-order (glo_order_<hash>) — never a fixed
        // global name.
        expect(mockCreateCookie).toHaveBeenCalledWith('glo_order_hashed-order', expect.anything(), mockContext);
        expect(mockCreateCookie).not.toHaveBeenCalledWith('glo_order', expect.anything(), mockContext);
    });

    it('response body never contains order data on success', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: {
                orderNo: 'ORDER123',
                productItems: [],
                total: 100,
            },
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        const response = await action({ request, context: mockContext } as ActionFunctionArgs);
        const result = response.data;

        expect(result.ok).toBe(true);
        expect(result).toEqual({ ok: true });
        expect(result).not.toHaveProperty('order');
    });

    it('clears attempt counter on success', async () => {
        mockCookie.parse.mockResolvedValueOnce('signed-order-state-with-3-attempts');
        mockVerifyOrderState.mockReturnValueOnce({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-order',
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 3,
        });

        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER123' },
        });

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        // Single order-state cookie write on success (replaces old 3-cookie write).
        expect(mockCookie.serialize).toHaveBeenCalledTimes(1);
        expect(mockSignOrderState).toHaveBeenCalledWith(
            expect.objectContaining({
                attempts: 0,
                verified: true,
            })
        );
        expect(mockClearServerVerifyAttempts).toHaveBeenCalledWith('RefArch', 'hashed-order');
    });

    it('sets order-state cookie with correct attributes', async () => {
        mockGuestOrderLookup.mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER123' },
        });

        const { getCookieConfig } = await import('@/lib/cookie-utils.server');

        const formData = new FormData();
        formData.append('orderNumber', 'ORDER123');
        formData.append('email', 'user@example.com');
        formData.append('code', '123456');

        const request = new Request('http://localhost/action/order-lookup-verify', {
            method: 'POST',
            body: formData,
        });

        await action({ request, context: mockContext } as ActionFunctionArgs);

        expect(getCookieConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                httpOnly: true,
                maxAge: 900,
                path: '/',
            }),
            mockContext
        );
    });
});
