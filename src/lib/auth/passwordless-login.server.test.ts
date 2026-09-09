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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'react-router';
import {
    handlePasswordlessCallback,
    handlePasswordlessLanding,
    resetMarketingCloudTokenCache,
} from './passwordless-login.server';
import { getErrorMessage } from '@/lib/utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { mockSiteObject } from '@/test-utils/config';

// Hoist dependencies for use in vi.mock (avoids async imports which fail on Windows)
const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

const { t } = getTranslation();

vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
        redirect: vi.fn(),
    };
});

// Hoist notify mocks so vi.mock() factory can reference them (avoids TDZ error)
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
    getErrorMessage: vi.fn(),
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
            sites: [
                {
                    defaultSiteId: mockSiteObject.id,
                    defaultLocale: mockSiteObject.defaultLocale,
                    defaultCurrency: mockSiteObject.defaultCurrency,
                    supportedLocales: mockSiteObject.supportedLocales,
                    supportedCurrencies: mockSiteObject.supportedCurrencies,
                    cookies: {},
                },
            ],
        },
        features: {
            passwordlessLogin: {
                mode: 'callback',
                callbackUri: '/passwordless-login-callback',
                landingUri: '/passwordless-login-landing',
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
const mockGetErrorMessage = vi.mocked(getErrorMessage);

const createMockHeaders = (slasCallbackToken?: string) => ({
    get: vi.fn((header: string) => {
        if (header === 'x-slas-callback-token') {
            return slasCallbackToken || null;
        }
        return null;
    }),
});

describe('passwordless-login', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // No-op but kept to verify the export still exists
        resetMarketingCloudTokenCache();

        // Set up default mocks
        mockSendNotification.mockResolvedValue(undefined);
        mockValidateSlasCallbackToken.mockResolvedValue({ iss: 'https://zzrf_001/anything' });

        // Mock getErrorMessage to return error message string
        mockGetErrorMessage.mockImplementation((error) => {
            if (error instanceof Error) {
                return error.message;
            }
            return String(error);
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('handlePasswordlessCallback', () => {
        describe('mode guard', () => {
            it('returns early without sending email when mode is not callback', async () => {
                const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
                vi.mocked(getConfig).mockReturnValueOnce({
                    features: { passwordlessLogin: { mode: 'email' } },
                } as any);

                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders('some-token'),
                    json: vi.fn(),
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result.success).toBe(false);
                expect(mockSendNotification).not.toHaveBeenCalled();
                expect(mockValidateSlasCallbackToken).not.toHaveBeenCalled();
            });
        });

        describe('successful passwordless login callback', () => {
            it('should handle successful callback with valid token and email data', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'magic-link-token',
                    }),
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result).toEqual({
                    success: true,
                    data: {},
                });

                // Verify JWT validation was called
                expect(mockValidateSlasCallbackToken).toHaveBeenCalledWith(mockContext, mockSlasToken);

                // Verify B2C email was sent with token and email in magic link path
                expect(mockSendNotification).toHaveBeenCalledTimes(1);
                const [, payload] = mockSendNotification.mock.calls[0];
                expect(payload.type).toBe('passwordless-magic-link');
                expect(payload.recipient).toBe('test@example.com');
                expect(payload.data.magicLinkPath).toContain('magic-link-token');
                expect(payload.data.magicLinkPath).toContain('test%40example.com');
            });

            it('should handle callback with redirect URL', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback?redirectUrl=%2Fdashboard',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'magic-link-token',
                    }),
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result.success).toBe(true);

                // Verify the magic link includes the token, email, and redirect URL
                expect(mockSendNotification).toHaveBeenCalledTimes(1);
                const [, payload] = mockSendNotification.mock.calls[0];
                expect(payload.data.magicLinkPath).toContain('magic-link-token');
                expect(payload.data.magicLinkPath).toContain('test%40example.com');
                expect(payload.data.magicLinkPath).toContain('redirectUrl=%2Fdashboard');
            });

            it('should normalize double-encoded redirectUrl from SLAS callback', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    // SLAS double-encodes query params: %2Fdashboard becomes %252Fdashboard
                    url: 'https://example.com/passwordless-callback?redirectUrl=%252Fdashboard',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'magic-link-token',
                    }),
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result.success).toBe(true);

                const [, payload] = mockSendNotification.mock.calls[0];
                expect(payload.data.magicLinkPath).toContain('magic-link-token');
                expect(payload.data.magicLinkPath).toContain('test%40example.com');
                // redirectUrl should be single-encoded, not double-encoded
                expect(payload.data.magicLinkPath).toContain('redirectUrl=%2Fdashboard');
                expect(payload.data.magicLinkPath).not.toContain('redirectUrl=%252Fdashboard');
            });
        });

        describe('error handling', () => {
            it('should return error when SLAS callback token is missing', async () => {
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders(), // No token
                    json: vi.fn(),
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingCallbackToken'),
                });
            });

            it('should return error when email data is missing', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({}), // Missing email_id and token
                } as any;

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result).toEqual({
                    success: false,
                    error: t('errors:passwordless.missingRequiredFields'),
                });
            });

            it('should handle JWT validation errors', async () => {
                const mockSlasToken = 'invalid-token';
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'magic-link-token',
                    }),
                } as any;

                // Mock JWT validation failure
                mockValidateSlasCallbackToken.mockRejectedValueOnce(new Error('Invalid token format'));

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result.success).toBe(false);
                expect(result.error).toContain('Invalid token format');
            });

            it('should handle B2C API errors', async () => {
                const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
                const mockRequest = {
                    url: 'https://example.com/passwordless-callback',
                    headers: createMockHeaders(mockSlasToken),
                    json: vi.fn().mockResolvedValue({
                        email_id: 'test@example.com',
                        token: 'magic-link-token',
                    }),
                } as any;

                // Mock B2C API failure
                mockSendNotification.mockRejectedValueOnce(new Error('B2C notification send failed'));

                const result = await handlePasswordlessCallback({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    context: mockContext,
                    params: {},
                    pattern: {} as any,
                });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            });
        });
    });

    describe('handlePasswordlessLanding', () => {
        it('should pass through token and email to /login', () => {
            const mockRequest = {
                url: 'https://example.com/passwordless-landing?token=valid-token&email=user%40example.com',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handlePasswordlessLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(mockRedirect).toHaveBeenCalledWith('/login?token=valid-token&email=user%40example.com');
            expect(result).toBe('redirect-response');
        });

        it('should pass through redirectUrl as returnUrl', () => {
            const mockRequest = {
                url: 'https://example.com/passwordless-landing?token=valid-token&email=user%40example.com&redirectUrl=%2Fdashboard',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handlePasswordlessLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(mockRedirect).toHaveBeenCalledWith(
                '/login?token=valid-token&email=user%40example.com&returnUrl=%2Fdashboard'
            );
            expect(result).toBe('redirect-response');
        });

        it('should redirect to /login with empty token when token is missing', () => {
            const mockRequest = {
                url: 'https://example.com/passwordless-landing',
            } as any;

            mockRedirect.mockReturnValue('redirect-response' as any);

            const result = handlePasswordlessLanding({
                request: mockRequest,
                url: new URL(mockRequest.url),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(mockRedirect).toHaveBeenCalledWith('/login?token=&email=');
            expect(result).toBe('redirect-response');
        });
    });
});
