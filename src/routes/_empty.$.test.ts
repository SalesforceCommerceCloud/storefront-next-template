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
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import { resolveUrlMapping } from '@/lib/seo/url-mapping.server';
import { getAppOrigin } from '@/lib/origin';
import { ApiError } from '@/scapi';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
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
    hybrid: {
        enabled: true,
        legacyRoutes: [{ pattern: '/legacy-products/:id', suffix: '.html' }],
    },
    seoFallback: {
        sites: {
            RefArch: {
                redirectOrigins: ['https://approved.example'],
                allowedQueryParameters: { product: [], category: [], redirect: [] },
                contentOwned: false,
            },
        },
    },
    url: {
        prefix: '/:siteId/:localeId',
        seoRoutes: {
            RefArch: {
                product: { prefix: 'products' },
                category: { prefix: 'catalog', mode: 'id-suffix' as const },
            },
        },
    },
}));

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
    getConfig: vi.fn(() => mockConfig),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

vi.mock('@/lib/api/shopper-seo.server', () => ({
    getUrlMapping: vi.fn(),
}));

vi.mock('@/lib/seo/url-mapping.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/seo/url-mapping.server')>();
    return { ...actual, resolveUrlMapping: vi.fn() };
});

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://shop.example'),
}));

const mockPasswordlessCallback = vi.mocked(handlePasswordlessCallback);
const mockPasswordlessLanding = vi.mocked(handlePasswordlessLanding);
const mockSocialLoginCallback = vi.mocked(handleSocialLoginLanding);
const mockResetPasswordCallback = vi.mocked(handleResetPasswordCallback);
const mockResetPasswordLanding = vi.mocked(handleResetPasswordLanding);
const mockGetUrlMapping = vi.mocked(getUrlMapping);
const mockResolveUrlMapping = vi.mocked(resolveUrlMapping);
const mockGetAppOrigin = vi.mocked(getAppOrigin);

describe('_empty.$.ts - Catch-all route (no layout)', () => {
    it('should export a default component', () => {
        expect(typeof CatchAllRoute).toBe('function');
    });

    const activeSiteContext = {
        site: {
            id: 'RefArch',
            alias: 'global',
            defaultLocale: 'en-US',
            defaultCurrency: 'USD',
            supportedLocales: [],
            supportedCurrencies: ['USD'],
        },
        locale: { id: 'en-US', alias: 'en' },
        currency: 'USD',
    };
    const mockContext = {
        get: vi.fn((key) => (key === siteContext ? activeSiteContext : undefined)),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUrlMapping.mockResolvedValue(null);
        mockResolveUrlMapping.mockReturnValue({ type: 'not-found' });
        mockGetAppOrigin.mockReturnValue('https://shop.example');
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
            expect(mockGetUrlMapping).not.toHaveBeenCalled();
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

        it('bypasses mapping for a legacy-owned incoming path after stripping its resolved prefix', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/legacy-products/p1?private=query'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            expect(mockGetUrlMapping).not.toHaveBeenCalled();
            expect(mockResolveUrlMapping).not.toHaveBeenCalled();
        });

        it.each(['GET', 'HEAD'])('calls mapping once with a query-free segment for an unmatched %s', async (method) => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/old path?campaign=secret', { method }),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            expect(mockGetUrlMapping).toHaveBeenCalledOnce();
            expect(mockGetUrlMapping).toHaveBeenCalledWith(mockContext, 'old%20path');
        });

        it('returns the existing 404 for a mapping miss', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            expect(mockResolveUrlMapping).toHaveBeenCalledWith(null, expect.any(Object));
        });

        it.each([
            { type: 'redirect' as const, status: 301 as const, location: '/products/p1' },
            { type: 'hybrid' as const, status: 307 as const, location: '/global/en/legacy-products/p1.html' },
        ])('returns a document $type response', async (outcome) => {
            mockResolveUrlMapping.mockReturnValue(outcome);
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            const response = await loader(args);

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(outcome.status);
            expect(response.headers.get('Location')).toBe(outcome.location);
            expect(response.headers.get('X-Remix-Reload-Document')).toBe('true');
        });

        it.each(['rejected', 'not-found'] as const)('returns 404 for a %s mapping outcome', async (type) => {
            mockResolveUrlMapping.mockReturnValue({ type });
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
        });

        it('propagates operational mapping failures by identity', async () => {
            const failure = new Error('upstream unavailable');
            mockGetUrlMapping.mockRejectedValue(failure);
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toBe(failure);
            expect(mockGetUrlMapping).toHaveBeenCalledOnce();
        });

        it('sanitizes Shopper SEO ApiError details before reaching the route error boundary', async () => {
            const sensitiveDetail = 'private upstream diagnostic';
            const failure = new ApiError({
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers(),
                body: { type: 'upstream-error', title: 'Unavailable', detail: sensitiveDetail },
                rawBody: JSON.stringify({ detail: sensitiveDetail }),
                url: 'https://api.example.test/url-mapping?token=private',
                method: 'GET',
            });
            mockGetUrlMapping.mockRejectedValue(failure);
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            const error = await loader(args).catch((reason: unknown) => reason);

            expect(error).not.toBe(failure);
            expect(error).toBeInstanceOf(Response);
            expect((error as Response).status).toBe(502);
            const body = await (error as Response).text();
            expect(body).toBe('Bad Gateway');
            expect(body).not.toContain(sensitiveDetail);
            expect(mockGetUrlMapping).toHaveBeenCalledOnce();
        });

        it('does not classify an upstream TypeError as malformed path encoding', async () => {
            const failure = new TypeError('upstream serialization failed');
            mockGetUrlMapping.mockRejectedValue(failure);
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toBe(failure);
            expect(mockGetUrlMapping).toHaveBeenCalledOnce();
        });

        it('returns 404 without mapping malformed percent-encoded paths', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/bad%2'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            expect(mockGetUrlMapping).not.toHaveBeenCalled();
        });

        it('passes active site policy, URL context, origin, request prefix, and legacy routes to the resolver', async () => {
            const mapping = { resourceType: 'PRODUCT' as const, resourceId: 'private-resource-id' };
            mockGetUrlMapping.mockResolvedValue(mapping);
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://internal.example/global/en/missing?campaign=secret'),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            expect(mockResolveUrlMapping).toHaveBeenCalledWith(mapping, {
                requestUrl: new URL(args.request.url),
                publicOrigin: 'https://shop.example',
                incomingPathname: '/missing',
                sitePolicy: mockConfig.seoFallback.sites.RefArch,
                seoUrlContext: { siteId: 'RefArch', seoRoutes: mockConfig.url.seoRoutes },
                destinationPrefix: '/global/en',
                buildResourceUrl: expect.any(Function),
                legacyRoutes: mockConfig.hybrid.legacyRoutes,
            });
            expect(mockGetAppOrigin).toHaveBeenCalledWith(mockContext);
        });

        it('logs only bounded fields without request or mapping values', async () => {
            const secrets = [
                '/global/en/raw-secret-path',
                'query-secret',
                'https://approved.example/destination-secret',
                'resource-secret',
            ];
            mockGetUrlMapping.mockResolvedValue({
                resourceType: 'PRODUCT',
                resourceId: secrets[3],
                destinationUrl: secrets[2],
            });
            mockResolveUrlMapping.mockReturnValue({ type: 'rejected' });
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request(`https://internal.example${secrets[0]}?campaign=${secrets[1]}`),
                mockContext,
                { pattern: '*' }
            );

            await expect(loader(args)).rejects.toMatchObject({ status: 404 });
            const actionArgs = createActionArgs<Route.ActionArgs>(
                new Request(`https://internal.example${secrets[0]}?campaign=${secrets[1]}`, { method: 'POST' }),
                mockContext,
                { pattern: '*' }
            );
            await expect(action(actionArgs)).rejects.toMatchObject({ status: 405 });
            const serializedLogs = JSON.stringify(Object.values(mockLogger).flatMap((logger) => logger.mock.calls));
            for (const secret of secrets) expect(serializedLogs).not.toContain(secret);
            expect(mockLogger.debug).toHaveBeenCalledWith('CatchAllRoute: loader starting', { method: 'GET' });
            expect(mockLogger.warn).toHaveBeenCalledWith('CatchAllRoute: SEO fallback unresolved', {
                outcome: 'rejected',
            });
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
            expect(mockGetUrlMapping).not.toHaveBeenCalled();
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
