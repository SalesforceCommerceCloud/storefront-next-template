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
import type { ActionFunctionArgs } from 'react-router';
import { registerCustomer } from './register.server';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { loginRegisteredUser } from './standard-login.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));

// Mock standard-login module
vi.mock('./standard-login.server', () => ({
    loginRegisteredUser: vi.fn(),
}));

// Mock shopperCustomers client
const mockRegisterCustomer = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperCustomers: {
            registerCustomer: mockRegisterCustomer,
        },
    })),
}));

describe('registerCustomer', () => {
    it.each([
        ['ACCOUNT_DEFAULT_UNAVAILABLE', 503],
        ['STORE_CHANGE_CONFIRMATION_REQUIRED', 409],
    ] as const)('propagates %s after account creation and auto-login', async (code, status) => {
        const error = new CommerceContextError(code, status);
        mockRegisterCustomer.mockResolvedValue({ data: { customerId: 'created-customer' } });
        mockLoginRegisteredUser.mockRejectedValueOnce(error);

        await expect(
            registerCustomer(mockContext, {
                customer: { login: 'shopper@example.com', firstName: 'Jane', lastName: 'Doe' },
                password: 'SecurePassword123!',
            })
        ).rejects.toBe(error);
        expect(mockRegisterCustomer).toHaveBeenCalledOnce();
        expect(mockLoginRegisteredUser).toHaveBeenCalledOnce();
        expect(logger.info).toHaveBeenCalledWith(
            'Account created',
            expect.objectContaining({
                actor: 'created-customer',
                action: 'register_customer',
                target: 'created-customer',
                outcome: 'success',
            })
        );
        expect(logger.info).toHaveBeenCalledBefore(mockLoginRegisteredUser);
    });

    const mockContext = {} as unknown as ActionFunctionArgs['context'];
    const mockLoginRegisteredUser = vi.mocked(loginRegisteredUser);
    const mockCreateApiClients = vi.mocked(createApiClients);

    beforeEach(() => {
        vi.clearAllMocks();
        mockRegisterCustomer.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('successful registration', () => {
        it('should successfully register a customer and auto-login', async () => {
            const registrationData = {
                customer: {
                    login: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                },
                password: 'SecurePassword123!',
            };

            mockRegisterCustomer.mockResolvedValue({ data: { customerId: 'created-customer' } });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });

            const result = await registerCustomer(mockContext, registrationData);

            // Verify client creation
            expect(mockCreateApiClients).toHaveBeenCalledWith(mockContext);

            // Verify registerCustomer was called with correct data
            expect(mockRegisterCustomer).toHaveBeenCalledWith({
                params: {},
                body: {
                    customer: {
                        login: 'test@example.com',
                        firstName: 'John',
                        lastName: 'Doe',
                    },
                    password: 'SecurePassword123!',
                },
            });

            // Verify auto-login was called
            expect(mockLoginRegisteredUser).toHaveBeenCalledWith(
                mockContext,
                {
                    email: 'test@example.com',
                    password: 'SecurePassword123!',
                },
                { customParameters: {} }
            );

            expect(result).toEqual({ success: true });
        });

        it('should successfully register a customer with custom parameters and pass them to login', async () => {
            const registrationData = {
                customer: {
                    login: 'test@example.com',
                    firstName: 'Jane',
                    lastName: 'Smith',
                },
                password: 'SecurePassword456!',
                c_customField1: 'value1',
                c_customField2: 123,
                c_customField3: true,
                c_customArray: ['item1', 'item2'],
            };

            mockRegisterCustomer.mockResolvedValue({ data: { customerId: 'created-customer' } });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });

            const result = await registerCustomer(mockContext, registrationData);

            // Verify registerCustomer doesn't receive custom parameters
            expect(mockRegisterCustomer).toHaveBeenCalledWith({
                params: {},
                body: {
                    customer: {
                        login: 'test@example.com',
                        firstName: 'Jane',
                        lastName: 'Smith',
                    },
                    password: 'SecurePassword456!',
                },
            });

            // Verify custom parameters are passed to login
            expect(mockLoginRegisteredUser).toHaveBeenCalledWith(
                mockContext,
                {
                    email: 'test@example.com',
                    password: 'SecurePassword456!',
                },
                {
                    customParameters: {
                        c_customField1: 'value1',
                        c_customField2: 123,
                        c_customField3: true,
                        c_customArray: ['item1', 'item2'],
                    },
                }
            );

            expect(result).toEqual({ success: true });
        });
    });

    describe('validation errors', () => {
        it('should return error when login (email) is missing', async () => {
            const registrationData = {
                customer: {
                    login: '',
                    firstName: 'John',
                    lastName: 'Doe',
                },
                password: 'SecurePassword123!',
            };

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).not.toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });

        it('should return error when firstName is missing', async () => {
            const registrationData = {
                customer: {
                    login: 'test@example.com',
                    firstName: '',
                    lastName: 'Doe',
                },
                password: 'SecurePassword123!',
            };

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).not.toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });

        it('should return error when lastName is missing', async () => {
            const registrationData = {
                customer: {
                    login: 'test@example.com',
                    firstName: 'John',
                    lastName: '',
                },
                password: 'SecurePassword123!',
            };

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).not.toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });

        it('should return error when all required fields are missing', async () => {
            const registrationData = {
                customer: {
                    login: '',
                    firstName: '',
                    lastName: '',
                },
                password: 'SecurePassword123!',
            };

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).not.toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });

        it('should return error when login is undefined', async () => {
            const registrationData = {
                customer: {
                    firstName: 'John',
                    lastName: 'Doe',
                },
                password: 'SecurePassword123!',
            } as any;

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).not.toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });
    });

    describe('registration API errors', () => {
        it('should handle registration API failure', async () => {
            const registrationData = {
                customer: {
                    login: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                },
                password: 'SecurePassword123!',
            };

            mockRegisterCustomer.mockRejectedValue(new Error('Registration failed'));

            const result = await registerCustomer(mockContext, registrationData);

            expect(mockRegisterCustomer).toHaveBeenCalled();
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
            expect(result).toEqual({
                success: false,
                error: t('errors:genericTryAgain'),
            });
        });
    });
});
