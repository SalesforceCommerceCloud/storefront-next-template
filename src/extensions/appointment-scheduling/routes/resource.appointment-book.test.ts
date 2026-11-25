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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { createActionArgs, expectStatus, ROUTE_PATTERN } from '@/lib/test-utils';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import { action } from './resource.appointment-book';

// vi.mock is hoisted — use vi.hoisted() so the spy ref is available inside the factory
const mockBookAppointment = vi.hoisted(() =>
    vi.fn(() => Promise.resolve({ success: true, serviceAppointmentId: 'SA-test-001' }))
);

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    siteContext: Symbol('siteContext'),
}));
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: 'test-customer-id', userType: 'registered' })),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@/lib/api/customer.server', () => ({
    getCurrentCustomer: vi.fn(() =>
        Promise.resolve({ firstName: 'Jane', lastName: 'Smith', email: 'shopper@example.com' })
    ),
}));
vi.mock('@/lib/appointment-scheduler/get-provider.server', () => ({
    getAppointmentProvider: vi.fn(() => ({
        bookAppointment: mockBookAppointment,
    })),
}));

const BOOK_URL = 'http://localhost/resource/appointment-book';

/** Valid ISO slot bounds that pass the format and email validation in the action. */
const VALID_FORM_DATA = {
    schedStartTime: '2026-12-01T10:00:00Z',
    schedEndTime: '2026-12-01T10:30:00Z',
    email: 'shopper@example.com',
};

/** Default context stub — returns undefined for all context keys (locale will be ''). */
const DEFAULT_CONTEXT = { get: () => undefined } as never;

describe('resource.appointment-book action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ customerId: 'test-customer-id', userType: 'registered' } as never);
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: true } } } as never);
        mockBookAppointment.mockResolvedValue({ success: true, serviceAppointmentId: 'SA-test-001' });
    });

    test('returns 404 when appointment feature is disabled', async () => {
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: false } } } as never);

        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 404);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Appointment booking is not enabled');
    });

    test('returns 405 for non-POST methods', async () => {
        const request = new Request(BOOK_URL, { method: 'GET' });
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 405);
        expect(result.data.success).toBe(false);
    });

    test('returns 401 when guest (non-registered) session tries to book', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-123', userType: 'guest' } as never);

        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
    });

    test('returns 401 when no shopper session is present', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: null } as never);

        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
    });

    test('returns 400 when schedStartTime is not valid ISO 8601', async () => {
        const request = createFormDataRequest(BOOK_URL, 'POST', {
            ...VALID_FORM_DATA,
            schedStartTime: 'not-a-date',
        });
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
    });

    test('returns 400 when email is invalid and no customer profile email', async () => {
        const { getCurrentCustomer } = await import('@/lib/api/customer.server');
        // No email on profile — form email is used, which is invalid
        vi.mocked(getCurrentCustomer).mockResolvedValueOnce({ firstName: 'Jane', lastName: 'Smith' } as never);

        const request = createFormDataRequest(BOOK_URL, 'POST', {
            ...VALID_FORM_DATA,
            email: 'not-an-email',
        });
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
    });

    test('passes firstName, lastName, and locale to bookAppointment for registered shopper', async () => {
        const { siteContext } = await import('@salesforce/storefront-next-runtime/site-context');
        // Build a context that returns en-US locale via context.get(siteContext).
        // /resource/** routes have no URL prefix, so locale must come from site context, not params.
        const contextWithLocale = {
            get: (key: symbol) =>
                key === siteContext ? { locale: { id: 'en-US' }, site: { id: 'Luxury' } } : undefined,
        };
        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, contextWithLocale as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 200);
        expect(mockBookAppointment).toHaveBeenCalledWith(
            expect.objectContaining({
                firstName: 'Jane',
                lastName: 'Smith',
                locale: 'en_US',
            })
        );
    });

    test('falls back to empty name when getCurrentCustomer fails', async () => {
        const { getCurrentCustomer } = await import('@/lib/api/customer.server');
        vi.mocked(getCurrentCustomer).mockRejectedValueOnce(new Error('network'));

        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 200);
        expect(mockBookAppointment).toHaveBeenCalledWith(expect.objectContaining({ firstName: '', lastName: '' }));
    });

    test('guest session is blocked at 401 guard before name fetch', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-123', userType: 'guest' } as never);

        const request = createFormDataRequest(BOOK_URL, 'POST', VALID_FORM_DATA);
        const result = await action(createActionArgs(request, DEFAULT_CONTEXT, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(mockBookAppointment).not.toHaveBeenCalled();
    });
});
