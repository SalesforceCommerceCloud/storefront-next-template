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
import {
    sendMarketingCloudEmail,
    validateSlasCallbackToken,
    resetMarketingCloudTokenCache,
} from './marketing-cloud.server';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock jose functions
vi.mock('jose', async () => {
    const actual = await vi.importActual('jose');
    return {
        ...actual,
        decodeJwt: vi.fn(() => ({
            iss: 'https://zzrf_001/anything',
            sub: 'test-subject',
            email: 'test@example.com',
        })),
        jwtVerify: vi.fn(() =>
            Promise.resolve({
                payload: {
                    iss: 'https://zzrf_001/anything',
                    sub: 'test-subject',
                    email: 'test@example.com',
                },
            })
        ),
        createRemoteJWKSet: vi.fn(() => vi.fn()),
    };
});

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        commerce: {
            api: {
                organizationId: 'f_ecom_zzrf_001',
                shortCode: '8o7m175y',
            },
        },
    })),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://example.com'),
}));

describe('marketing-cloud', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetMarketingCloudTokenCache();

        // Set up Marketing Cloud environment variables
        vi.stubEnv('MARKETING_CLOUD_CLIENT_ID', 'test-mc-client-id');
        vi.stubEnv('MARKETING_CLOUD_CLIENT_SECRET', 'test-mc-client-secret');
        vi.stubEnv('MARKETING_CLOUD_SUBDOMAIN', 'test-subdomain');
        vi.stubEnv('MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE', 'test-passwordless-template');
        vi.stubEnv('MARKETING_CLOUD_RESET_PASSWORD_TEMPLATE', 'test-reset-template');

        // Don't setup default mock responses here - let each test configure them
    });

    describe('sendMarketingCloudEmail', () => {
        it('should request token and send email successfully', async () => {
            // Set the client secret in the environment
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';

            // Ensure token cache is cleared before test
            resetMarketingCloudTokenCache();
            mockFetch.mockClear();
            mockFetch.mockReset();

            // Queue up responses: token response first, then email response
            const responses = [
                {
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'test-token', hasErrors: false }),
                    text: () => Promise.resolve(''),
                },
                {
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'test-token', hasErrors: false }),
                    text: () => Promise.resolve(''),
                },
            ];
            let callIndex = 0;
            mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]));

            const result = await sendMarketingCloudEmail(
                'test@example.com',
                'https://example.com/magic-link',
                'test-passwordless-template'
            );

            // Should have called fetch twice: once for token, once for email
            expect(mockFetch).toHaveBeenCalledTimes(2);

            // First call should be for token
            expect(mockFetch.mock.calls[0][0]).toContain('auth.marketingcloudapis.com/v2/token');

            // Second call should be for email
            const emailCall = mockFetch.mock.calls.find((call) => call[0].includes('/email/messages/'));
            expect(emailCall).toBeDefined();
            expect(emailCall?.[0]).toContain('test-subdomain.rest.marketingcloudapis.com');

            expect(result).toEqual({ access_token: 'test-token', hasErrors: false });
        });

        it('should throw error if MARKETING_CLOUD_CLIENT_ID is missing', async () => {
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';
            vi.stubEnv('MARKETING_CLOUD_CLIENT_ID', '');

            await expect(
                sendMarketingCloudEmail('test@example.com', 'https://example.com/magic-link', 'test-template')
            ).rejects.toThrow('MARKETING_CLOUD_CLIENT_ID is not set in the environment variables.');
        });

        it('should throw error if MARKETING_CLOUD_CLIENT_SECRET is missing', async () => {
            vi.stubEnv('MARKETING_CLOUD_CLIENT_SECRET', '');

            await expect(
                sendMarketingCloudEmail('test@example.com', 'https://example.com/magic-link', 'test-template')
            ).rejects.toThrow('MARKETING_CLOUD_CLIENT_SECRET is not set in the environment variables.');
        });

        it('should throw error if MARKETING_CLOUD_SUBDOMAIN is missing', async () => {
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';
            vi.stubEnv('MARKETING_CLOUD_SUBDOMAIN', '');

            await expect(
                sendMarketingCloudEmail('test@example.com', 'https://example.com/magic-link', 'test-template')
            ).rejects.toThrow('MARKETING_CLOUD_SUBDOMAIN is not set in the environment variables.');
        });

        it('should throw error if token request fails', async () => {
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';

            // Reset token cache to force a token request
            resetMarketingCloudTokenCache();
            mockFetch.mockClear();
            mockFetch.mockReset();

            // Token request will fail
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Invalid credentials'),
            });

            await expect(
                sendMarketingCloudEmail(
                    'test@example.com',
                    'https://example.com/magic-link',
                    'test-passwordless-template'
                )
            ).rejects.toThrow('Failed to get Marketing Cloud token');
        });

        it('should throw error if email send fails', async () => {
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';

            // Reset token cache to force a token request
            resetMarketingCloudTokenCache();
            mockFetch.mockClear();
            mockFetch.mockReset();

            // Token succeeds, email fails
            const responses = [
                {
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'test-token' }),
                    text: () => Promise.resolve(''),
                },
                {
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: () => Promise.resolve('Email service unavailable'),
                },
            ];
            let callIndex = 0;
            mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]));

            await expect(
                sendMarketingCloudEmail(
                    'test@example.com',
                    'https://example.com/magic-link',
                    'test-passwordless-template'
                )
            ).rejects.toThrow('Failed to send email to Marketing Cloud');
        });

        it('should reuse cached token on subsequent calls', async () => {
            process.env.MARKETING_CLOUD_CLIENT_SECRET = 'test-client-secret';

            // Ensure token cache is cleared and mocks reset
            resetMarketingCloudTokenCache();
            mockFetch.mockClear();
            mockFetch.mockReset();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ access_token: 'test-token', hasErrors: false }),
                text: () => Promise.resolve(''),
            });

            // First call - should request token
            await sendMarketingCloudEmail(
                'test@example.com',
                'https://example.com/magic-link',
                'test-passwordless-template'
            );
            const firstCallCount = mockFetch.mock.calls.length;

            // Second call - should reuse token
            await sendMarketingCloudEmail(
                'test2@example.com',
                'https://example.com/magic-link2',
                'test-passwordless-template'
            );
            const secondCallCount = mockFetch.mock.calls.length;

            // Second call should only make 1 additional fetch (for email, not token)
            expect(secondCallCount).toBe(firstCallCount + 1);
        });
    });

    describe('validateSlasCallbackToken', () => {
        it('should validate a valid SLAS callback token', async () => {
            const mockContext = {} as any;
            const token = 'valid.jwt.token';

            const result = await validateSlasCallbackToken(mockContext, token);

            expect(result).toBeDefined();
            expect(result.iss).toBe('https://zzrf_001/anything');
        });

        it('should throw error if token is missing issuer claim', async () => {
            const { decodeJwt } = await import('jose');
            vi.mocked(decodeJwt).mockReturnValueOnce({} as any);

            const mockContext = {} as any;
            const token = 'invalid.jwt.token';

            await expect(validateSlasCallbackToken(mockContext, token)).rejects.toThrow(
                'Invalid token: missing or invalid issuer claim'
            );
        });

        it('should throw error if tenant ID cannot be extracted', async () => {
            const { decodeJwt } = await import('jose');
            vi.mocked(decodeJwt).mockReturnValueOnce({
                iss: 'https://invalid',
            } as any);

            const mockContext = {} as any;
            const token = 'invalid.jwt.token';

            await expect(validateSlasCallbackToken(mockContext, token)).rejects.toThrow('SLAS Token Validation Error');
        });
    });
});
