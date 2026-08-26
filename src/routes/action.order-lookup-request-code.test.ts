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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action } from './action.order-lookup-request-code';
import type { Route } from './+types/action.order-lookup-request-code';
import { ErrorCode } from '@/lib/error-codes';
import { hashOrderNumber, verifyOrderState } from '@/lib/order/session.server';

// Mock modules
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

vi.mock('@/lib/order/scapi.server', () => ({
    requestOrderAccessCode: vi.fn(),
}));

vi.mock('@/lib/turnstile/enforce.server', () => ({
    enforceTurnstile: vi.fn(),
}));

vi.mock('@/lib/utils.server', () => ({
    getSite: vi.fn(() => ({ siteId: 'test-site', locale: 'en-US' })),
}));

vi.mock('@/lib/order/session.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/order/session.server')>();
    return {
        ...actual,
        verifyOrderState: vi.fn(() => null),
    };
});

vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn((name: string) => ({
        serialize: vi.fn((value: string) => Promise.resolve(`${name}=${value}; HttpOnly; Secure`)),
        // Real parse behavior, scoped to this cookie's name — mirrors createCookie().parse()
        // reading the (unmocked-namespacing-aside) name out of the raw Cookie header, so tests
        // exercise the same read path the fixed cooldown-cookie code now uses instead of raw
        // string matching.
        parse: vi.fn((cookieHeader: string | null) => {
            if (!cookieHeader) return Promise.resolve(null);
            const match = cookieHeader
                .split(';')
                .map((c) => c.trim())
                .find((c) => c.startsWith(`${name}=`));
            return Promise.resolve(match ? match.slice(name.length + 1) : null);
        }),
    })),
    getCookieConfig: vi.fn((opts) => opts),
    getCookieNameWithSiteId: vi.fn((name: string) => name),
}));

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { requestOrderAccessCode } from '@/lib/order/scapi.server';
import { enforceTurnstile } from '@/lib/turnstile/enforce.server';
import { createCookie } from '@/lib/cookie-utils.server';

const mockGetConfig = vi.mocked(getConfig);
const mockRequestOrderAccessCode = vi.mocked(requestOrderAccessCode);
const mockEnforceTurnstile = vi.mocked(enforceTurnstile);
const mockVerifyOrderState = vi.mocked(verifyOrderState);
const mockCreateCookie = vi.mocked(createCookie);

function createRequest(data: Record<string, string>, cookies = ''): Request {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));

    return new Request('https://example.com/action/order-lookup-request-code', {
        method: 'POST',
        body: formData,
        headers: {
            cookie: cookies,
        },
    });
}

function createContext(): Route.ActionArgs['context'] {
    return {
        scapi: {} as any,
    } as any;
}

const defaultConfig = {
    guestOrderLookup: {
        enabled: true,
        orderNumberPattern: '^[A-Z0-9]{8,}$',
        cooldownSeconds: 60,
        allowedFields: ['orderTotal', 'status'],
        turnstile: {
            enabled: false,
            failOpen: false,
        },
    },
};

describe('action.order-lookup-request-code', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue(defaultConfig as any);
        // The success path now signs a real order-state cookie via signOrderState (not mocked
        // here — only verifyOrderState is mocked) which requires a signing secret.
        process.env = { ...originalEnv, GUEST_ORDER_LOOKUP_COOKIE_SECRET: 'test-secret-32-chars-minimum!!' };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('returns 405 for non-POST requests', async () => {
        const request = new Request('https://example.com/action/order-lookup-request-code', {
            method: 'GET',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(405);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
    });

    it('returns 404 when guest order lookup is disabled', async () => {
        mockGetConfig.mockReturnValue({
            ...defaultConfig,
            guestOrderLookup: { ...defaultConfig.guestOrderLookup, enabled: false },
        } as any);

        const request = createRequest({
            orderNumber: 'ORDER123',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(404);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('validates order number and returns error for invalid format', async () => {
        const request = createRequest({
            orderNumber: 'bad!@#',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(400);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('VALIDATION');
        expect(wrapped.data.field).toBe('orderNumber');
    });

    it('validates email and returns error for invalid format', async () => {
        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'not-an-email',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(400);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('VALIDATION');
        expect(wrapped.data.field).toBe('email');
    });

    it('enforces Turnstile when enabled and blocks on failure', async () => {
        mockGetConfig.mockReturnValue({
            ...defaultConfig,
            guestOrderLookup: {
                ...defaultConfig.guestOrderLookup,
                turnstile: { enabled: true, failOpen: false },
            },
        } as any);
        mockEnforceTurnstile.mockResolvedValue({ allowed: false, cookieValue: null });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
            turnstileToken: 'fake-token',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(403);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('BOT_CHECK');
        expect(mockEnforceTurnstile).toHaveBeenCalled();
    });

    it('allows request when Turnstile passes', async () => {
        mockGetConfig.mockReturnValue({
            ...defaultConfig,
            guestOrderLookup: {
                ...defaultConfig.guestOrderLookup,
                turnstile: { enabled: true, failOpen: false },
            },
        } as any);
        mockEnforceTurnstile.mockResolvedValue({ allowed: true, cookieValue: null });
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
            turnstileToken: 'valid-token',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(mockEnforceTurnstile).toHaveBeenCalled();
        expect(mockRequestOrderAccessCode).toHaveBeenCalled();
    });

    it('proceeds when Turnstile throws and failOpen is true', async () => {
        mockGetConfig.mockReturnValue({
            ...defaultConfig,
            guestOrderLookup: {
                ...defaultConfig.guestOrderLookup,
                turnstile: { enabled: true, failOpen: true },
            },
        } as any);
        mockEnforceTurnstile.mockRejectedValue(new Error('Turnstile service unavailable'));
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
            turnstileToken: 'token',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(mockRequestOrderAccessCode).toHaveBeenCalled();
    });

    it('blocks when Turnstile throws and failOpen is false', async () => {
        mockGetConfig.mockReturnValue({
            ...defaultConfig,
            guestOrderLookup: {
                ...defaultConfig.guestOrderLookup,
                turnstile: { enabled: true, failOpen: false },
            },
        } as any);
        mockEnforceTurnstile.mockRejectedValue(new Error('Turnstile service unavailable'));

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
            turnstileToken: 'token',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(403);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('BOT_CHECK');
    });

    it('enforces cooldown when cookie is present', async () => {
        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);
        const timestamp = Date.now() - 30000; // 30 seconds ago
        const cookies = `glo_cd_${orderHash}=${timestamp}`;

        const request = createRequest(
            {
                orderNumber,
                email: 'test@example.com',
            },
            cookies
        );
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(429);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('COOLDOWN');
        expect(wrapped.data.retryAfterSeconds).toBeGreaterThan(0);
        expect(mockRequestOrderAccessCode).not.toHaveBeenCalled();
    });

    it('returns alreadyVerified:true when browser has a valid, verified order-state cookie for the order', async () => {
        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);

        // Make the cookie parse return an order-state value
        mockCreateCookie.mockReturnValueOnce({
            serialize: vi.fn(() => Promise.resolve('')),
            parse: vi.fn(() => Promise.resolve('valid-order-state')),
        } as any);

        // Make verifyOrderState confirm it matches and is verified
        mockVerifyOrderState.mockReturnValueOnce({
            siteId: 'test-site',
            orderNumberHash: orderHash,
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        } as any);

        const request = createRequest({
            orderNumber,
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init?: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(wrapped.data.alreadyVerified).toBe(true);
        expect(mockRequestOrderAccessCode).not.toHaveBeenCalled();
    });

    it('does not short-circuit when the order state belongs to a different order', async () => {
        const orderNumber = 'ORDER12345';

        // Make the cookie parse return an order-state value
        mockCreateCookie.mockReturnValueOnce({
            serialize: vi.fn(() => Promise.resolve('')),
            parse: vi.fn(() => Promise.resolve('valid-order-state')),
        } as any);

        // State is for a different order hash
        mockVerifyOrderState.mockReturnValueOnce({
            siteId: 'test-site',
            orderNumberHash: 'different-hash',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        } as any);

        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber,
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init?: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(wrapped.data.alreadyVerified).toBeUndefined();
        expect(mockRequestOrderAccessCode).toHaveBeenCalled();
    });

    it('does not short-circuit when a valid order-state cookie exists but is not yet verified', async () => {
        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);

        mockCreateCookie.mockReturnValueOnce({
            serialize: vi.fn(() => Promise.resolve('')),
            parse: vi.fn(() => Promise.resolve('valid-order-state')),
        } as any);

        // Matches this order, but verification hasn't happened yet — must not short-circuit.
        mockVerifyOrderState.mockReturnValueOnce({
            siteId: 'test-site',
            orderNumberHash: orderHash,
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        } as any);

        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber,
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init?: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(wrapped.data.alreadyVerified).toBeUndefined();
        // This is a repeat request (unverified state already existed for this order), so it's
        // reported as a resend rather than a first-time send.
        expect(wrapped.data.codeResent).toBe(true);
        expect(mockRequestOrderAccessCode).toHaveBeenCalled();
    });

    it('allows request when cooldown has expired', async () => {
        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);
        const timestamp = Date.now() - 120000; // 2 minutes ago (> 60s cooldown)
        const cookies = `glo_cd_${orderHash}=${timestamp}`;

        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest(
            {
                orderNumber,
                email: 'test@example.com',
            },
            cookies
        );
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.data.ok).toBe(true);
        expect(mockRequestOrderAccessCode).toHaveBeenCalled();
    });

    it('returns success and sets cooldown cookie when SCAPI succeeds', async () => {
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };
        const headers = new Headers(wrapped.init.headers);

        expect(wrapped.data.ok).toBe(true);
        expect(headers.get('Set-Cookie')).toContain('glo_cd_');
        expect(mockRequestOrderAccessCode).toHaveBeenCalledWith({
            orderNo: 'ORDER12345',
            email: 'test@example.com',
            context,
        });
    });

    it('sets a glo_order_<orderHash> order-state cookie on success so /order-lookup/results can render the OTP form', async () => {
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);

        const request = createRequest({
            orderNumber,
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };
        const setCookieHeaders = new Headers(wrapped.init.headers).getSetCookie();

        expect(wrapped.data.ok).toBe(true);
        expect(setCookieHeaders.some((h) => h.startsWith(`glo_order_${orderHash}=`))).toBe(true);
    });

    it('stores the email in the glo_order cookie payload so the results page never needs it in the URL', async () => {
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const orderNumber = 'ORDER12345';
        const orderHash = hashOrderNumber(orderNumber);
        const email = 'shopper@example.com';

        const request = createRequest({ orderNumber, email });
        const result = await action({ request, context: createContext(), params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };
        const setCookieHeaders = new Headers(wrapped.init.headers).getSetCookie();

        const orderStateCookieHeader = setCookieHeaders.find((h) => h.startsWith(`glo_order_${orderHash}=`));
        expect(orderStateCookieHeader).toBeDefined();

        // Decode the signed cookie payload and verify email is present
        const cookieValue = (orderStateCookieHeader ?? '').split(`glo_order_${orderHash}=`)[1].split(';')[0];
        const payloadBase64 = cookieValue.split('.')[0];
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
        expect(payload.email).toBe(email);
    });

    it('maps SCAPI rate limit to RATE_LIMITED response', async () => {
        mockRequestOrderAccessCode.mockResolvedValue({
            code: 'REQUEST_CODE_FAILED',
            status: 429,
            message: 'Rate limited',
            retryAfterSeconds: 120,
        });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(429);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe(ErrorCode.RATE_LIMITED);
        expect(wrapped.data.retryAfterSeconds).toBe(120);
    });

    it('returns SCAPI_UNSUPPORTED when wrapper throws unsupported error', async () => {
        const error = new Error('Guest order lookup requires SCAPI v26.8 or later');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        mockRequestOrderAccessCode.mockRejectedValue(error);

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(501);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe(ErrorCode.SCAPI_UNSUPPORTED);
    });

    it('returns generic REQUEST_FAILED for other SCAPI errors (enumeration defense)', async () => {
        mockRequestOrderAccessCode.mockResolvedValue({
            code: 'REQUEST_CODE_FAILED',
            status: 404,
            message: 'Order not found', // Should not leak this
        });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(500);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('REQUEST_FAILED');
        expect(wrapped.data.message).toBe('Unable to send access code');
        // Verify the raw SCAPI message is NOT in the response
        expect(wrapped.data.message).not.toContain('Order not found');
    });

    it('returns generic REQUEST_FAILED for unknown errors', async () => {
        mockRequestOrderAccessCode.mockRejectedValue(new Error('Network failure'));

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(500);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe('REQUEST_FAILED');
    });

    it('returns CONFIGURATION_ERROR when no signing secret is set', async () => {
        delete process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET;
        delete process.env.CLIENT_SECRET;
        mockRequestOrderAccessCode.mockResolvedValue({ ok: true });

        const request = createRequest({
            orderNumber: 'ORDER12345',
            email: 'test@example.com',
        });
        const context = createContext();

        const result = await action({ request, context, params: {} } as any);
        const wrapped = result as { data: any; init: ResponseInit };

        expect(wrapped.init.status).toBe(500);
        expect(wrapped.data.ok).toBe(false);
        expect(wrapped.data.code).toBe(ErrorCode.CONFIGURATION_ERROR);
    });
});
