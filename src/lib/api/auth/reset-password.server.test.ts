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
import { decodeJwt, createRemoteJWKSet, jwtVerify } from 'jose';
import {
    handleResetPasswordCallback,
    handleResetPasswordLanding,
    resetMarketingCloudTokenCache,
} from './reset-password.server';
import { extractResponseError } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';

// Hoist dependencies for use in vi.mock (avoids async imports which fail on Windows)
const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
const mockRandomUUID = vi.fn();
vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });

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

// Mock jose library
vi.mock('jose', () => ({
    decodeJwt: vi.fn(),
    createRemoteJWKSet: vi.fn(),
    jwtVerify: vi.fn(),
}));

// Mock utility functions
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn(),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(),
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
const mockDecodeJwt = vi.mocked(decodeJwt);
const mockCreateRemoteJWKSet = vi.mocked(createRemoteJWKSet);
const mockJwtVerify = vi.mocked(jwtVerify);
const mockGetAppOrigin = vi.mocked(getAppOrigin);
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

        // Reset Marketing Cloud token cache to prevent test interference
        resetMarketingCloudTokenCache();

        // Properly stub environment variables instead of mutating process.env
        vi.stubEnv('MARKETING_CLOUD_CLIENT_ID', 'test-client-id');
        vi.stubEnv('MARKETING_CLOUD_CLIENT_SECRET', 'test-client-secret');
        vi.stubEnv('MARKETING_CLOUD_SUBDOMAIN', 'test-subdomain');
        vi.stubEnv('MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE', 'test-template-id');

        // Set up default mocks
        mockGetAppOrigin.mockReturnValue('https://example.com');
        mockRandomUUID.mockReturnValue('123456781234123412341234567');

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
        vi.unstubAllEnvs();
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

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

                // Mock successful Marketing Cloud API calls
                mockFetch
                    .mockResolvedValueOnce({
                        ok: true,
                        json: vi.fn().mockResolvedValue({
                            access_token: 'mc-access-token',
                        }),
                    } as any)
                    .mockResolvedValueOnce({
                        ok: true,
                        json: vi.fn().mockResolvedValue({
                            messageKey: 'test-message-key',
                        }),
                    } as any);

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result).toEqual({
                    success: true,
                    result: { messageKey: 'test-message-key' },
                });

                // Verify JWT validation was called
                expect(mockDecodeJwt).toHaveBeenCalledWith(mockSlasToken);
                expect(mockJwtVerify).toHaveBeenCalled();

                // Verify Marketing Cloud API calls
                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(mockFetch).toHaveBeenNthCalledWith(
                    1,
                    'https://test-subdomain.auth.marketingcloudapis.com/v2/token',
                    expect.objectContaining({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            grant_type: 'client_credentials',
                            client_id: 'test-client-id',
                            client_secret: 'test-client-secret',
                        }),
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

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

                // Mock successful Marketing Cloud API calls
                mockFetch
                    .mockResolvedValueOnce({
                        ok: true,
                        json: vi.fn().mockResolvedValue({
                            access_token: 'mc-access-token',
                        }),
                    } as any)
                    .mockResolvedValueOnce({
                        ok: true,
                        json: vi.fn().mockResolvedValue({
                            messageKey: 'test-message-key',
                        }),
                    } as any);

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result.success).toBe(true);

                // Verify the magic link includes the correct path for reset password
                const emailSendCall = mockFetch.mock.calls.find((call) => call[0].includes('/email/messages/'));
                expect(emailSendCall).toBeDefined();
                if (emailSendCall) {
                    expect(emailSendCall[1]).toEqual(
                        expect.objectContaining({
                            body: expect.stringContaining('/reset-password-landing'),
                        })
                    );
                    expect(emailSendCall[1]).toEqual(
                        expect.objectContaining({
                            body: expect.stringContaining('token=reset-token-123'),
                        })
                    );
                    expect(emailSendCall[1]).toEqual(
                        expect.objectContaining({
                            body: expect.stringContaining('email=test%40example.com'),
                        })
                    );
                }
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

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

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

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

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

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

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
                mockDecodeJwt.mockImplementation(() => {
                    throw new Error('Invalid token format');
                });

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

            it('should handle Marketing Cloud API errors', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

                // Mock Marketing Cloud API failure
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    json: vi.fn().mockResolvedValue({
                        message: 'Invalid credentials',
                    }),
                } as any);

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

            it('should handle missing Marketing Cloud template ID', async () => {
                // Clear the environment variable
                vi.unstubAllEnvs();
                vi.stubEnv('MARKETING_CLOUD_CLIENT_ID', 'test-client-id');
                vi.stubEnv('MARKETING_CLOUD_CLIENT_SECRET', 'test-client-secret');
                vi.stubEnv('MARKETING_CLOUD_SUBDOMAIN', 'test-subdomain');
                // Don't stub MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE

                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/reset-password-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'reset-token-123',
                    }),
                } as any;

                // Mock JWT validation
                mockDecodeJwt.mockReturnValue({
                    iss: 'https://zzrf_001/anything',
                });
                mockCreateRemoteJWKSet.mockReturnValue({} as any);
                mockJwtVerify.mockResolvedValue({
                    payload: { iss: 'https://zzrf_001/anything', aud: 'test-audience' },
                } as any);

                const result = await handleResetPasswordCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: '/reset-password-callback',
                });

                expect(result.success).toBe(false);
                expect(result.error).toContain(
                    'MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE is not set in the environment variables'
                );
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
