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
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { mockSiteObject } from '@/test-utils/config';

const { t } = getTranslation();
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'react-router';
import {
    handleResetPasswordCallback,
    handleResetPasswordLanding,
    resetMarketingCloudTokenCache,
} from './reset-password.server';
import { extractResponseError } from '@/lib/utils';

// Hoist dependencies for use in vi.mock (avoids async imports which fail on Windows)
const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
        redirect: vi.fn(),
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

// Hoist notify module mocks to avoid initialization-order errors in vi.mock factory
const { mockSendNotification, mockValidateSlasCallbackToken } = vi.hoisted(() => ({
    mockSendNotification: vi.fn(),
    mockValidateSlasCallbackToken: vi.fn(),
}));
vi.mock('@/lib/notify/notify.server', () => ({
    sendNotification: mockSendNotification,
    validateSlasCallbackToken: mockValidateSlasCallbackToken,
}));

// Mock utility functions
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn(),
}));

// Mock config module
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        commerce: {
            api: {
                organizationId: 'f_ecom_zzrf_001',
                clientId: 'c9c45bfd-0ed3-4aa2-9971-40f88962b836',
                shortCode: 'kv7kzm78',
                siteId: mockSiteObject.id,
            },
        },
        features: {
            resetPassword: {
                enabled: true,
                mode: 'callback',
                callbackUri: '/reset-password-callback',
                landingUri: '/reset-password-landing',
            },
        },
    })),
}));

// Create mock context
const mockContext = {
    get: vi.fn(),
    set: vi.fn(),
} as any;

// Get mocked functions
const mockRedirect = vi.mocked(redirect);
const mockExtractResponseError = vi.mocked(extractResponseError);

const createMockHeaders = (slasCallbackToken?: string) => ({
    get: vi.fn((header: string) => {
        if (header === 'x-slas-callback-token') {
            return slasCallbackToken || null;
        }
        return null;
    }),
});

describe('reset-password', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // No-op but kept to verify the export still exists
        resetMarketingCloudTokenCache();

        // Set up default mocks
        mockSendNotification.mockResolvedValue(undefined);
        mockValidateSlasCallbackToken.mockResolvedValue({ iss: 'https://zzrf_001/anything' });

        // Mock extractResponseError to return the error message
        mockExtractResponseError.mockImplementation((error) =>
            Promise.resolve({
                responseMessage: error instanceof Error ? error.message : String(error),
                status_code: '500',
            })
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('handleResetPasswordCallback', () => {
        describe('successful reset password callback', () => {
            it('should handle successful callback with valid token and email data', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: true,
                    result: {},
                });

                // Verify JWT validation was called
                expect(mockValidateSlasCallbackToken).toHaveBeenCalledWith(mockContext, mockSlasToken);

                // Verify B2C email was sent
                expect(mockSendNotification).toHaveBeenCalledTimes(1);
                expect(mockSendNotification).toHaveBeenCalledWith(
                    mockContext,
                    expect.objectContaining({
                        type: 'password-reset',
                        recipient: 'test@example.com',
                        data: expect.objectContaining({ magicLinkPath: expect.stringContaining('reset-token-123') }),
                    })
                );
            });

            it('should include correct reset password landing path in magic link', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result.success).toBe(true);

                // Verify the magic link includes the correct path and params
                expect(mockSendNotification).toHaveBeenCalledTimes(1);
                const [, payload] = mockSendNotification.mock.calls[0];
                expect(payload.data.magicLinkPath).toContain('/reset-password-landing');
                expect(payload.data.magicLinkPath).toContain('token=reset-token-123');
                expect(payload.data.magicLinkPath).toContain('email=test%40example.com');
            });
        });

        describe('error handling', () => {
            it('should return error when SLAS callback token is missing', async () => {
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(), // No token
                    json: vi.fn(),
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingCallbackToken'),
                });
            });

            it('should return error when email_id is missing', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        token: 'reset-token-123',
                        // email_id is missing
                    }),
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingRequiredFields'),
                });
            });

            it('should return error when token is missing', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        // token is missing
                    }),
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingRequiredFields'),
                });
            });

            it('should return error when both email_id and token are missing', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({}), // Empty body
                } as any;

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingRequiredFields'),
                });
            });

            it('should handle JWT validation errors', async () => {
                const mockSlasToken = 'invalid-token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                // Mock JWT validation failure
                mockValidateSlasCallbackToken.mockRejectedValueOnce(new Error('Invalid token format'));

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result.success).toBe(false);
                expect(result.error).toContain('Invalid token format');
            });

            it('should handle B2C API errors', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                // Mock B2C API failure
                mockSendNotification.mockRejectedValueOnce(new Error('B2C send failed'));

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            });
        });
    });

    describe('handleResetPasswordLanding', () => {
        it('should redirect to /reset-password with token and email parameters', () => {
            const mockRequest = {
                url: 'https://example.com/reset-password-landing?token=valid-token&email=test%40example.com',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handleResetPasswordLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: '/reset-password-landing',
            });

            expect(mockRedirect).toHaveBeenCalledWith('/reset-password?token=valid-token&email=test%40example.com');
            expect(result).toBe('redirect-response');
        });

        it('should handle missing token parameter', () => {
            const mockRequest = {
                url: 'https://example.com/reset-password-landing?email=test%40example.com',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handleResetPasswordLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: '/reset-password-landing',
            });

            expect(mockRedirect).toHaveBeenCalledWith('/reset-password?token=&email=test%40example.com');
            expect(result).toBe('redirect-response');
        });

        it('should handle missing email parameter', () => {
            const mockRequest = {
                url: 'https://example.com/reset-password-landing?token=valid-token',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handleResetPasswordLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: '/reset-password-landing',
            });

            expect(mockRedirect).toHaveBeenCalledWith('/reset-password?token=valid-token&email=');
            expect(result).toBe('redirect-response');
        });

        it('should handle both token and email missing', () => {
            const mockRequest = {
                url: 'https://example.com/reset-password-landing',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handleResetPasswordLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: '/reset-password-landing',
            });

            expect(mockRedirect).toHaveBeenCalledWith('/reset-password?token=&email=');
            expect(result).toBe('redirect-response');
        });

        it('should properly encode special characters in parameters', () => {
            const mockRequest = {
                url: 'https://example.com/reset-password-landing?token=abc%2Bdef&email=test%2Buser%40example.com',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handleResetPasswordLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: '/reset-password-landing',
            });

            // The parameters should be properly encoded
            expect(mockRedirect).toHaveBeenCalledWith(
                '/reset-password?token=abc%2Bdef&email=test%2Buser%40example.com'
            );
            expect(result).toBe('redirect-response');
        });
    });
});
