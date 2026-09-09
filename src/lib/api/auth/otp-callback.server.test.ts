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
import { handleOtpCallback } from './otp-callback.server';
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
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

// Hoist notify module mocks and t() so they are available inside vi.mock factories
const { mockSendNotification, mockValidateSlasCallbackToken, mockT } = vi.hoisted(() => ({
    mockSendNotification: vi.fn(),
    mockValidateSlasCallbackToken: vi.fn(),
    mockT: vi.fn((key: string) => key),
}));

vi.mock('@/lib/notify/notify.server', () => ({
    sendNotification: mockSendNotification,
    validateSlasCallbackToken: mockValidateSlasCallbackToken,
}));

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({ t: mockT })),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        features: { otpRequest: { mode: 'callback' } },
    })),
}));

// Mock utility functions
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn(),
}));

// Create mock context
const mockContext = {
    get: vi.fn(),
    set: vi.fn(),
} as any;

// Get mocked functions
const mockExtractResponseError = vi.mocked(extractResponseError);

const createMockHeaders = (slasCallbackToken?: string) => ({
    get: vi.fn((header: string) => {
        if (header === 'x-slas-callback-token') {
            return slasCallbackToken || null;
        }
        return null;
    }),
});

describe('handleOtpCallback', () => {
    describe('mode guard', () => {
        it('returns early without sending email when mode is not callback', async () => {
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValueOnce({
                features: { otpRequest: { mode: 'email' } },
            } as any);

            const mockRequest = {
                headers: createMockHeaders('some-token'),
                json: vi.fn(),
            } as any;

            const result = await handleOtpCallback({ request: mockRequest, context: mockContext } as any);

            expect(result.success).toBe(false);
            expect(mockSendNotification).not.toHaveBeenCalled();
            expect(mockValidateSlasCallbackToken).not.toHaveBeenCalled();
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();

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

    describe('happy path', () => {
        it('should send OTP email and return success when token and fields are valid', async () => {
            const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({
                    email_id: 'test@example.com',
                    token: 'otp-token-123',
                }),
            } as any;

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result).toEqual({ success: true });

            // Verify JWT validation was called
            expect(mockValidateSlasCallbackToken).toHaveBeenCalledWith(mockContext, mockSlasToken);

            // Verify B2C email was sent with correct payload
            expect(mockSendNotification).toHaveBeenCalledTimes(1);
            expect(mockSendNotification).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    type: 'otp',
                    recipient: 'test@example.com',
                    data: expect.objectContaining({ token: 'otp-token-123' }),
                })
            );
        });
    });

    describe('error handling', () => {
        it('should return error when SLAS callback token is missing', async () => {
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(), // No token
                json: vi.fn(),
            } as any;

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result).toEqual({
                success: false,
                error: 'errors:passwordless.missingCallbackToken',
            });

            // sendNotification must not be called when token is absent
            expect(mockSendNotification).not.toHaveBeenCalled();
        });

        it('should return error and not call sendNotification when token validation fails', async () => {
            const mockSlasToken = 'invalid-token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({
                    email_id: 'test@example.com',
                    token: 'otp-token-123',
                }),
            } as any;

            mockValidateSlasCallbackToken.mockRejectedValueOnce(new Error('Invalid token format'));

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid token format');

            // sendNotification must not be called when validation throws
            expect(mockSendNotification).not.toHaveBeenCalled();
        });

        it('should return error when email_id is missing', async () => {
            const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({
                    token: 'otp-token-123',
                    // email_id is missing
                }),
            } as any;

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result).toEqual({
                success: false,
                error: 'errors:passwordless.missingRequiredFields',
            });
        });

        it('should return error when token is missing', async () => {
            const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({
                    email_id: 'test@example.com',
                    // token is missing
                }),
            } as any;

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result).toEqual({
                success: false,
                error: 'errors:passwordless.missingRequiredFields',
            });
        });

        it('should return error when both email_id and token are missing', async () => {
            const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({}), // Empty body
            } as any;

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result).toEqual({
                success: false,
                error: 'errors:passwordless.missingRequiredFields',
            });
        });

        it('should return error when sendNotification throws', async () => {
            const mockSlasToken = 'eyJhbGciOiJSUzI1NiJ9.test.token';
            const mockRequest = {
                url: 'https://example.com/otp-callback',
                headers: createMockHeaders(mockSlasToken),
                json: vi.fn().mockResolvedValue({
                    email_id: 'test@example.com',
                    token: 'otp-token-123',
                }),
            } as any;

            mockSendNotification.mockRejectedValueOnce(new Error('B2C send failed'));

            const result = await handleOtpCallback({
                request: mockRequest,
                url: new URL(mockRequest.url as string),
                context: mockContext,
                params: {},
                pattern: {} as any,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
});
