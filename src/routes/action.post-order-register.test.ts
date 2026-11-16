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
import type { ActionFunctionArgs } from 'react-router';
import { action } from './action.post-order-register';
import { registerCustomer } from '@/lib/api/auth/register.server';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { createApiClients } from '@/lib/api-clients.server';
import { isPasswordValid } from '@/lib/utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

vi.mock('@/lib/api/auth/register.server', () => ({
    registerCustomer: vi.fn(),
}));

vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        isPasswordValid: vi.fn(),
    };
});

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: 'cust-123' })),
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperOrders: {
            getOrder: vi.fn(() => ({ data: null })),
        },
    })),
}));

vi.mock('@/lib/api/customer.server', () => ({
    saveShippingAddressToCustomer: vi.fn(),
    saveBillingAddressToCustomer: vi.fn(),
    savePaymentMethodToCustomer: vi.fn(),
    updateCustomerContactInfo: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockRegisterCustomer = vi.mocked(registerCustomer);
const mockIsPasswordValid = vi.mocked(isPasswordValid);

function createRequest(formFields: Record<string, string>): Request {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(formFields)) {
        formData.append(key, value);
    }
    return new Request('http://localhost/action/post-order-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
    });
}

const mockContext = { get: vi.fn(), set: vi.fn() } as any;

function createArgs(formFields: Record<string, string>): ActionFunctionArgs {
    return {
        request: createRequest(formFields),
        url: new URL('http://localhost/action/post-order-register'),
        params: {},
        context: mockContext,
        pattern: 'action/post-order-register',
    };
}

async function submitRegistration(formFields: Record<string, string>) {
    const result = await action(createArgs(formFields));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error('Expected registration form result');
    return result;
}

const validFormData = {
    email: 'guest@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    password: 'StrongPass1!',
    confirmPassword: 'StrongPass1!',
    orderNo: '00012345',
};

describe('action.post-order-register', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsPasswordValid.mockReturnValue(true);
    });

    describe('validation', () => {
        it('returns error when email is missing', async () => {
            const result = await submitRegistration({ password: 'x', confirmPassword: 'x' });

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('signup:allFieldsRequired'));
            expect(mockRegisterCustomer).not.toHaveBeenCalled();
        });

        it('returns error when password is missing', async () => {
            const result = await submitRegistration({ email: 'a@b.com', confirmPassword: 'x' });

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('signup:allFieldsRequired'));
        });

        it('returns error when confirmPassword is missing', async () => {
            const result = await submitRegistration({ email: 'a@b.com', password: 'x' });

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('signup:allFieldsRequired'));
        });

        it('returns error when passwords do not match', async () => {
            const result = await submitRegistration({ ...validFormData, confirmPassword: 'Different1!' });

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('signup:passwordsDoNotMatch'));
        });

        it('returns error when password is not secure', async () => {
            mockIsPasswordValid.mockReturnValue(false);

            const result = await submitRegistration(validFormData);

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('signup:passwordNotSecure'));
        });
    });

    describe('registration', () => {
        it.each([
            ['ACCOUNT_DEFAULT_UNAVAILABLE', 503],
            ['STORE_CHANGE_CONFIRMATION_REQUIRED', 409],
        ] as const)('preserves the %s handoff after registration', async (code, status) => {
            const change =
                status === 409
                    ? {
                          success: false as const,
                          code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' as const,
                          current: { id: 'A' },
                          candidate: { id: 'B' },
                      }
                    : undefined;
            mockRegisterCustomer.mockRejectedValueOnce(new CommerceContextError(code, status, { change }));

            const args = createArgs(validFormData);
            const result = await action(args);

            expect(result).toBeInstanceOf(Response);
            if (!(result instanceof Response)) throw new Error('Expected commerce reconciliation response');
            expect(result.status).toBe(status);
            expect(result.headers.get('Cache-Control')).toBe('private, no-store');
            expect(await result.json()).toEqual(change ?? { success: false, code });
            expect(createApiClients).not.toHaveBeenCalled();
        });

        it('calls registerCustomer with correct parameters', async () => {
            mockRegisterCustomer.mockResolvedValue({ success: true });

            await action(createArgs(validFormData));

            expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                customer: {
                    firstName: 'Jane',
                    lastName: 'Doe',
                    login: 'guest@example.com',
                    email: 'guest@example.com',
                },
                password: 'StrongPass1!',
            });
        });

        it('returns success when registration succeeds', async () => {
            mockRegisterCustomer.mockResolvedValue({ success: true });

            const result = await submitRegistration(validFormData);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns error when registration fails', async () => {
            mockRegisterCustomer.mockResolvedValue({
                success: false,
                error: 'Email already exists',
            });

            const result = await submitRegistration(validFormData);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Email already exists');
        });

        it('returns generic error when registration fails without message', async () => {
            mockRegisterCustomer.mockResolvedValue({ success: false });

            const result = await submitRegistration(validFormData);

            expect(result.success).toBe(false);
            expect(result.error).toBe(t('errors:genericTryAgain'));
        });

        it('uses empty strings for missing firstName and lastName', async () => {
            mockRegisterCustomer.mockResolvedValue({ success: true });

            await action(createArgs({ email: 'a@b.com', password: 'StrongPass1!', confirmPassword: 'StrongPass1!' }));

            expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                customer: {
                    firstName: '',
                    lastName: '',
                    login: 'a@b.com',
                    email: 'a@b.com',
                },
                password: 'StrongPass1!',
            });
        });
    });
});
