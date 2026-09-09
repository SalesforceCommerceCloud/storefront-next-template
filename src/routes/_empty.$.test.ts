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
import CatchAllRoute, { loader, action } from './_empty.$';
import type { Route } from './+types/_empty.$';
import { handlePasswordlessCallback, handlePasswordlessLanding } from '@/lib/auth/passwordless-login.server';
import { handleSocialLoginLanding } from '@/lib/api/auth/social-login.server';
import { handleResetPasswordCallback, handleResetPasswordLanding } from '@/lib/api/auth/reset-password.server';
import { createActionArgs, createLoaderArgs } from '@/lib/test-utils/loader-action-args';

// Mock passwordless-login handlers
vi.mock('@/lib/auth/passwordless-login.server', () => ({
    handlePasswordlessCallback: vi.fn(),
    handlePasswordlessLanding: vi.fn(),
}));

// Mock social-callback handler
vi.mock('@/lib/api/auth/social-login.server', () => ({
    handleSocialLoginLanding: vi.fn(),
}));

// Mock reset-password handlers
vi.mock('@/lib/api/auth/reset-password.server', () => ({
    handleResetPasswordCallback: vi.fn(),
    handleResetPasswordLanding: vi.fn(),
}));

// Mock config
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        features: {
            passwordlessLogin: {
                mode: 'callback',
                landingUri: '/passwordless-login-landing',
                callbackUri: '/passwordless-login-callback',
            },
            socialLogin: {
                enabled: true,
                callbackUri: '/social-callback',
            },
            resetPassword: {
                landingUri: '/reset-password-landing',
                callbackUri: '/reset-password-callback',
            },
        },
    })),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockPasswordlessCallback = vi.mocked(handlePasswordlessCallback);
const mockPasswordlessLanding = vi.mocked(handlePasswordlessLanding);
const mockSocialLoginCallback = vi.mocked(handleSocialLoginLanding);
const mockResetPasswordCallback = vi.mocked(handleResetPasswordCallback);
const mockResetPasswordLanding = vi.mocked(handleResetPasswordLanding);

describe('_empty.$.ts - Catch-all route (no layout)', () => {
    it('should export a default component', () => {
        expect(typeof CatchAllRoute).toBe('function');
    });

    const mockContext = {} as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loader', () => {
        it('should handle passwordless login landing route', async () => {
            const mockResponse = new Response(null, {
                status: 302,
                headers: { Location: '/account' },
            });
            mockPasswordlessLanding.mockResolvedValue(mockResponse);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/passwordless-login-landing?token=test'),
                mockContext,
                { pattern: '*' }
            );
            const result = await loader(args);

            expect(mockPasswordlessLanding).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResponse);
        });

        it('should handle reset password landing route', async () => {
            const mockResponse = new Response(null, {
                status: 302,
                headers: { Location: '/reset-password?token=test&email=test%40example.com' },
            });
            mockResetPasswordLanding.mockResolvedValue(mockResponse);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/reset-password-landing?token=test&email=test@example.com'),
                mockContext,
                { pattern: '*' }
            );
            const result = await loader(args);

            expect(mockResetPasswordLanding).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResponse);
        });

        it('should handle social login callback route', async () => {
            const mockResponse = new Response(null, {
                status: 302,
                headers: { Location: '/' },
            });
            mockSocialLoginCallback.mockResolvedValue(mockResponse);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/social-callback?code=auth_code_123&usid=user_session_id'),
                mockContext,
                { pattern: '*' }
            );
            const result = await loader(args);

            expect(mockSocialLoginCallback).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResponse);
        });

        it('should throw 404 for unmatched paths', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(new Request('http://localhost/unknown-path'), mockContext, {
                pattern: '*',
            });

            try {
                await loader(args);
                expect.fail('Should have thrown a Response');
            } catch (error) {
                expect(error).toBeInstanceOf(Response);
                expect((error as Response).status).toBe(404);
                expect(await (error as Response).text()).toBe('Not Found');
            }
        });
    });

    describe('action', () => {
        it('should handle passwordless login callback route', async () => {
            const mockResult = { success: true, data: {} };
            mockPasswordlessCallback.mockResolvedValue(mockResult);

            const args = createActionArgs<Route.ActionArgs>(
                new Request('http://localhost/passwordless-login-callback', { method: 'POST' }),
                mockContext,
                { pattern: '*' }
            );
            const result = await action(args);

            expect(mockPasswordlessCallback).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResult);
        });

        it('should handle reset password callback route', async () => {
            const mockResult = { success: true, result: {} };
            mockResetPasswordCallback.mockResolvedValue(mockResult);

            const args = createActionArgs<Route.ActionArgs>(
                new Request('http://localhost/reset-password-callback', { method: 'POST' }),
                mockContext,
                { pattern: '*' }
            );
            const result = await action(args);

            expect(mockResetPasswordCallback).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResult);
        });

        it('should throw 405 for unmatched paths', async () => {
            const args = createActionArgs<Route.ActionArgs>(
                new Request('http://localhost/unknown-path', { method: 'POST' }),
                mockContext,
                { pattern: '*' }
            );

            try {
                await action(args);
                expect.fail('Should have thrown a Response');
            } catch (error) {
                expect(error).toBeInstanceOf(Response);
                expect((error as Response).status).toBe(405);
                expect(await (error as Response).text()).toBe('Method Not Allowed');
            }
        });
    });

    describe('getHandler (indirectly tested)', () => {
        it('should correctly route based on pathname from config', async () => {
            // Test that the handler correctly identifies routes from config
            const loaderArgs = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/passwordless-login-landing'),
                mockContext,
                { pattern: '*' }
            );

            mockPasswordlessLanding.mockResolvedValue(new Response(null, { status: 302 }));
            await loader(loaderArgs);

            expect(mockPasswordlessLanding).toHaveBeenCalled();
        });

        it('should return null for paths not in config', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/some-random-path'),
                mockContext,
                {
                    pattern: '*',
                }
            );

            try {
                await loader(args);
                expect.fail('Should have thrown a Response');
            } catch (error) {
                expect(error).toBeInstanceOf(Response);
                expect((error as Response).status).toBe(404);
            }
            expect(mockPasswordlessLanding).not.toHaveBeenCalled();
            expect(mockPasswordlessCallback).not.toHaveBeenCalled();
        });
    });

    describe('absolute URL support', () => {
        it('should handle social login callback with absolute URL in config', async () => {
            // Mock getConfig to return absolute URL for callbackUri
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValueOnce({
                features: {
                    passwordlessLogin: {
                        landingUri: '/passwordless-login-landing',
                        callbackUri: '/passwordless-login-callback',
                    },
                    socialLogin: {
                        enabled: true,
                        callbackUri: 'https://dev2.phased-launch-testing.com/social-callback',
                    },
                    resetPassword: {
                        landingUri: '/reset-password-landing',
                        callbackUri: '/reset-password-callback',
                    },
                },
            } as any);

            const mockResponse = new Response(null, {
                status: 302,
                headers: { Location: '/' },
            });
            mockSocialLoginCallback.mockResolvedValue(mockResponse);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/social-callback?code=auth_code_123'),
                mockContext,
                { pattern: '*' }
            );
            const result = await loader(args);

            expect(mockSocialLoginCallback).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResponse);
        });

        it('should handle passwordless landing with absolute URL in config', async () => {
            // Mock getConfig to return absolute URL for landingUri
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValueOnce({
                features: {
                    passwordlessLogin: {
                        landingUri: 'https://production.example.com/passwordless-login-landing',
                        callbackUri: '/passwordless-login-callback',
                    },
                    socialLogin: {
                        enabled: true,
                        callbackUri: '/social-callback',
                    },
                    resetPassword: {
                        landingUri: '/reset-password-landing',
                        callbackUri: '/reset-password-callback',
                    },
                },
            } as any);

            const mockResponse = new Response(null, {
                status: 302,
                headers: { Location: '/account' },
            });
            mockPasswordlessLanding.mockResolvedValue(mockResponse);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('http://localhost/passwordless-login-landing?token=test'),
                mockContext,
                { pattern: '*' }
            );
            const result = await loader(args);

            expect(mockPasswordlessLanding).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResponse);
        });

        it('should handle reset password callback with absolute URL in config', async () => {
            // Mock getConfig to return absolute URL for callbackUri
            const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(getConfig).mockReturnValueOnce({
                features: {
                    passwordlessLogin: {
                        landingUri: '/passwordless-login-landing',
                        callbackUri: '/passwordless-login-callback',
                    },
                    socialLogin: {
                        enabled: true,
                        callbackUri: '/social-callback',
                    },
                    resetPassword: {
                        landingUri: '/reset-password-landing',
                        callbackUri: 'https://vanity-domain.com/reset-password-callback',
                    },
                },
            } as any);

            const mockResult = { success: true, result: {} };
            mockResetPasswordCallback.mockResolvedValue(mockResult);

            const args = createActionArgs<Route.ActionArgs>(
                new Request('http://localhost/reset-password-callback', { method: 'POST' }),
                mockContext,
                { pattern: '*' }
            );
            const result = await action(args);

            expect(mockResetPasswordCallback).toHaveBeenCalledWith(args);
            expect(result).toBe(mockResult);
        });
    });
});
