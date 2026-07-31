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
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import shopperContextMiddleware from './shopper-context.server';
import { createTestContext } from '@/lib/test-utils';
import { createShopperContext } from '@/lib/api/shopper-context.server';
import { getAuth } from './auth.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { resourceRoutes } from '@/route-paths';
import config from '@/config/server';

// SITE_ID is the first configured site's id, the same source `createTestContext` reads, so it
// always matches the namespaced `<name>_<siteId>` cookie the middleware builds and the assertion
// holds regardless of which site config is loaded.
const SITE_ID = config.app.commerce.sites[0].id;

vi.mock('@/lib/shopper-context/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/shopper-context/constants')>();
    return {
        ...actual,
        SHOPPER_CONTEXT_SEARCH_PARAMS: {
            ...actual.SHOPPER_CONTEXT_SEARCH_PARAMS,
            effectiveDateTime: {
                [actual.QUALIFIER_MAPPING_PARAM_NAME]: 'effectiveDateTime',
                [actual.QUALIFIER_MAPPING_API_FIELD_NAME]: 'effectiveDateTime',
            },
            customerGroupIds: {
                [actual.QUALIFIER_MAPPING_PARAM_NAME]: 'customerGroupIds',
                [actual.QUALIFIER_MAPPING_API_FIELD_NAME]: 'customerGroupIds',
            },
        },
    };
});

vi.mock('@/lib/api/shopper-context.server', () => ({
    createShopperContext: vi.fn(),
}));

vi.mock('./auth.server', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@/lib/cookie-utils.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/cookie-utils.server')>();
    return {
        ...actual,
        getCookieConfig: vi.fn(() => ({
            path: '/',
            sameSite: 'lax',
            secure: true,
            httpOnly: false,
        })),
    };
});

const defaultMockConfig = {
    commerce: {
        api: {
            siteId: 'test-site',
        },
        sites: [
            {
                id: 'test-site',
                defaultLocale: 'en-GB',
                defaultCurrency: 'GBP',
                supportedLocales: [{ id: 'en-GB', preferredCurrency: 'GBP' }],
                supportedCurrencies: ['GBP'],
            },
        ],
    },
    defaultSiteId: 'test-site',
    features: {
        shopperContext: {
            enabled: true,
        },
    },
};

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual || {}),
        getConfig: vi.fn(() => defaultMockConfig),
    };
});

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

/**
 * Satisfies React Router's DataFunctionArgs (request, context, params, pattern).
 * React Router added required pattern in a 7.x release;
 */
const createMiddlewareArgs = (request: Request, context: RouterContextProvider) =>
    ({ request, context, params: {}, pattern: '/', url: new URL(request.url) }) as Parameters<
        typeof shopperContextMiddleware
    >[0];

type MiddlewareNext = Parameters<typeof shopperContextMiddleware>[1];

describe('shopper-context.server', () => {
    let mockRequest: Request;
    let mockContext: RouterContextProvider;
    let mockNext: MiddlewareNext;

    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(getConfig).mockReturnValue(defaultMockConfig as any);

        mockRequest = new Request('https://example.com/test');
        mockContext = createTestContext({
            authSession: { usid: 'test-usid' },
        }) as RouterContextProvider;
        // Use mockImplementation so each next() gets a fresh Response.
        mockNext = vi.fn().mockImplementation(() => Promise.resolve(new Response('test'))) as MiddlewareNext;

        vi.mocked(getAuth).mockReturnValue({ usid: 'test-usid' } as any);
        vi.mocked(createShopperContext).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('middleware execution flow', () => {
        test('should call next() when feature flag is disabled', async () => {
            // Temporarily override getConfig to disable feature
            const configModule = await import('@salesforce/storefront-next-runtime/config');
            vi.mocked(configModule.getConfig).mockReturnValueOnce({
                commerce: {
                    api: {
                        siteId: 'test-site',
                    },
                },
                features: {
                    shopperContext: {
                        enabled: false,
                    },
                },
            } as any);

            try {
                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

                expect(mockNext).toHaveBeenCalledOnce();
                expect(createShopperContext).not.toHaveBeenCalled();
                expect(result).toBeInstanceOf(Response);
                expect((result as Response).headers.get('Set-Cookie')).toBeNull();
            } finally {
                // Restore original mock
                vi.mocked(configModule.getConfig).mockReturnValue({
                    commerce: {
                        api: {
                            siteId: 'test-site',
                        },
                    },
                    features: {
                        shopperContext: {
                            enabled: true,
                        },
                    },
                } as any);
            }
        });

        test('should call next() when Page Designer mode is active', async () => {
            mockRequest = new Request('https://example.com?mode=EDIT');

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();
            // Verify no cookies were set
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Set-Cookie')).toBeNull();
        });

        test('should call next() when no USID is available', async () => {
            vi.mocked(getAuth).mockReturnValue({} as any);

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();
            // Verify no cookies were set
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Set-Cookie')).toBeNull();
        });

        test('should handle session with undefined usid', async () => {
            vi.mocked(getAuth).mockReturnValue({ usid: undefined } as any);

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Set-Cookie')).toBeNull();
        });

        test('should handle session with empty string usid', async () => {
            // Test when usid is empty string - should be caught by middleware check
            vi.mocked(getAuth).mockReturnValue({ usid: '' } as any);

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Set-Cookie')).toBeNull();
        });

        test('should process shopper context when conditions are met', async () => {
            const url = new URL('https://example.com?src=email');
            mockRequest = new Request(url.toString());

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', { sourceCode: 'email' });
            // Verify cookies were set
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(1);

            // Verify sourceCode cookie was set with the bare source-code string (SFRA-compatible)
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
            expect(sourceCodeCookieValue).toBe('email');
        });
    });

    describe('cookie handling', () => {
        test('should read existing cookies from request', async () => {
            const cookieValue = { sourceCode: 'existing' };
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const cookieHandler = createCookie('storefront-next-context', cookieConfig, mockContext);
            // cookie-utils stores string values; shopper context uses JSON
            const serializedCookie = await cookieHandler.serialize(JSON.stringify(cookieValue));
            const cookieNameValue = serializedCookie.split(';')[0];

            mockRequest = new Request('https://example.com/test', {
                headers: { Cookie: cookieNameValue },
            });

            const parsed = await cookieHandler.parse(cookieNameValue);
            expect(JSON.parse(parsed as string)).toEqual(cookieValue);
        });

        test('should handle cookie parsing returning null (fallback to empty object)', async () => {
            // Create a request with a cookie header that exists but parsing returns null
            const url = new URL('https://example.com/test?src=email');
            mockRequest = new Request(url.toString(), {
                headers: { Cookie: 'other-cookie=value' },
            });

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            // Should still process and set new cookies even when existing cookies parse to null
            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', { sourceCode: 'email' });
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(1);

            // Verify sourceCode cookie was set with the bare source-code string (SFRA-compatible)
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
            expect(sourceCodeCookieValue).toBe('email');
        });

        test('SFRA contract: dwsourcecode_<siteId> Set-Cookie value is the bare source-code string, not JSON', async () => {
            // Hybrid storefronts (SFRA + Storefront Next) read the same `dwsourcecode_*` cookie.
            // SFRA expects a plain string; storing JSON would break it.
            const url = new URL('https://example.com?src=email');
            mockRequest = new Request(url.toString());

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            const setCookieHeaders = (result as Response).headers.getSetCookie();
            const sourceCodeHeader = setCookieHeaders.find((h) => h.startsWith(`dwsourcecode_${SITE_ID}=`));
            expect(sourceCodeHeader).toBeDefined();
            // The substring after `name=` and before the first `;` is the cookie value.
            const value = (sourceCodeHeader as string).split(';')[0].split('=', 2)[1];
            expect(value).toBe('email');
            // Defensive: confirm the value is not URL-encoded JSON (SFRA cannot parse this).
            expect(value).not.toContain('%7B');
            expect(value).not.toContain('{');
        });

        test('should set sourceCode cookie when hasNewSourceCodeContext is true', async () => {
            // Test with sourceCode which is already configured
            const url = new URL('https://example.com?src=email');
            mockRequest = new Request(url.toString());

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', { sourceCode: 'email' });
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(1);

            // Verify sourceCode cookie was set with the bare source-code string (SFRA-compatible)
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
            expect(sourceCodeCookieValue).toBe('email');
        });

        test('should set context cookie when hasNewContext is true', async () => {
            // Mock extractQualifiersFromUrl to return qualifiers (not sourceCode) to trigger hasNewContext path
            const shopperContextUtils = await import('@/lib/shopper-context/server-utils.server');
            const extractQualifiersFromUrlSpy = vi
                .spyOn(shopperContextUtils, 'extractQualifiersFromUrl')
                .mockReturnValue({
                    qualifiers: { deviceType: 'mobile' },
                    sourceCodeQualifiers: {},
                });

            try {
                const url = new URL('https://example.com?deviceType=mobile');
                mockRequest = new Request(url.toString());

                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

                expect(mockNext).toHaveBeenCalledOnce();
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    customQualifiers: {
                        deviceType: 'mobile',
                    },
                });
                expect(result).toBeInstanceOf(Response);
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toBe(1);

                // Verify context cookie was set with correct data (not sourceCode cookie)
                const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
                const contextCookieHandler = createCookie('storefront-next-context', cookieConfig, mockContext);
                const contextCookieValue = await contextCookieHandler.parse(setCookieHeaders[0]);
                expect(JSON.parse(contextCookieValue as string)).toEqual({ deviceType: 'mobile' });
            } finally {
                extractQualifiersFromUrlSpy.mockRestore();
            }
        });

        test('should set both sourceCode and context cookies when both are present', async () => {
            // Mock extractQualifiersFromUrl to return both sourceCode and qualifiers
            const shopperContextUtils = await import('@/lib/shopper-context/server-utils.server');
            const extractQualifiersFromUrlSpy = vi
                .spyOn(shopperContextUtils, 'extractQualifiersFromUrl')
                .mockReturnValue({
                    qualifiers: { deviceType: 'mobile' },
                    sourceCodeQualifiers: { sourceCode: 'email' },
                });

            try {
                const url = new URL('https://example.com?src=email&deviceType=mobile');
                mockRequest = new Request(url.toString());

                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

                expect(mockNext).toHaveBeenCalledOnce();
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    sourceCode: 'email',
                    customQualifiers: {
                        deviceType: 'mobile',
                    },
                });
                expect(result).toBeInstanceOf(Response);
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toBe(2);

                // Verify both cookies were set with correct data. Source-code is a bare string
                // (SFRA-compatible); context is JSON. Disambiguate by namespaced cookie name.
                const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
                const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
                const contextCookieHandler = createCookie('storefront-next-context', cookieConfig, mockContext);

                const sourceCodeHeader = setCookieHeaders.find((h) => h.startsWith(`dwsourcecode_${SITE_ID}=`));
                const contextHeader = setCookieHeaders.find((h) => h.startsWith(`storefront-next-context_${SITE_ID}=`));
                expect(sourceCodeHeader).toBeDefined();
                expect(contextHeader).toBeDefined();

                const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(sourceCodeHeader as string);
                const contextCookieValue = await contextCookieHandler.parse(contextHeader as string);

                expect(sourceCodeCookieValue).toBe('email');
                expect(JSON.parse(contextCookieValue as string)).toEqual({ deviceType: 'mobile' });
            } finally {
                extractQualifiersFromUrlSpy.mockRestore();
            }
        });

        test('should restore sourceCode from dwsourcecode cookie when storefront-next-context is empty/expired', async () => {
            // Scenario: context cookie is empty/expired, but sourceCode cookie has value
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieSerialized = await sourceCodeCookieHandler.serialize('persisted-source');
            const sourceCodeCookieValue = sourceCodeCookieSerialized.split(';')[0];

            // Request has sourceCode cookie but no context cookie (expired/empty); no URL params
            mockRequest = new Request('https://example.com', {
                headers: { Cookie: sourceCodeCookieValue },
            });

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            // Should compute effective context but not call API since no new qualifiers
            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();

            // Note: sourceCode cookie already has the value, so it won't be updated (no change)
            // No new qualifiers in URL, so no cookies should be set
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(0); // No cookies set since no new qualifiers
        });

        test('should not update cookies when context has not changed', async () => {
            const currentContext = { sourceCode: 'email' };
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const contextCookieHandler = createCookie('storefront-next-context', cookieConfig, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const contextCookieSerialized = await contextCookieHandler.serialize(JSON.stringify(currentContext));
            const sourceCodeCookieSerialized = await sourceCodeCookieHandler.serialize('email');
            const contextCookieValue = contextCookieSerialized.split(';')[0];
            const sourceCodeCookieValue = sourceCodeCookieSerialized.split(';')[0];

            mockRequest = new Request('https://example.com', {
                headers: { Cookie: `${contextCookieValue}; ${sourceCodeCookieValue}` },
            });

            // No URL params, so extractQualifiersFromUrl returns empty
            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            // The middleware checks if context changed before calling API
            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).not.toHaveBeenCalled();
            // Verify no cookies were set
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Set-Cookie')).toBeNull();
        });
    });

    describe('error handling', () => {
        test('should not fail request when createShopperContext throws', async () => {
            vi.mocked(createShopperContext).mockRejectedValue(new Error('API Error'));

            const url = new URL('https://example.com?src=email');
            mockRequest = new Request(url.toString());

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(result).toBeInstanceOf(Response);
            expect(mockNext).toHaveBeenCalledOnce();
            expect(mockLogger.error).toHaveBeenCalledWith('ShopperContext: middleware failed', {
                error: expect.any(Error),
                usid: 'test-usid',
                url: url.toString(),
            });
        });

        test('should continue processing even if computation fails', async () => {
            // Simulate an error by making getCookieConfig throw
            vi.mocked(getCookieConfig).mockImplementationOnce(() => {
                throw new Error('Computation error');
            });

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(result).toBeInstanceOf(Response);
            expect(mockNext).toHaveBeenCalledOnce();
            expect(mockLogger.error).toHaveBeenCalledWith('ShopperContext: middleware failed', {
                error: expect.any(Error),
                usid: 'test-usid',
                url: mockRequest.url,
            });
        });

        test('should return response from next() when cookie setting fails after handler execution', async () => {
            const url = new URL('https://example.com?src=email');
            mockRequest = new Request(url.toString());

            // Mock Response.headers.append to throw (simulating cookie setting error)
            const mockResponse = new Response('test');
            const appendSpy = vi.spyOn(mockResponse.headers, 'append').mockImplementation(() => {
                throw new Error('Cookie append error');
            });
            vi.mocked(mockNext).mockResolvedValue(mockResponse);

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(result).toBeInstanceOf(Response);
            expect(mockNext).toHaveBeenCalledOnce();
            expect(mockLogger.error).toHaveBeenCalledWith('ShopperContext: middleware failed', {
                error: expect.any(Error),
                usid: 'test-usid',
                url: url.toString(),
            });
            expect(result).toBe(mockResponse);

            appendSpy.mockRestore();
        });
    });

    describe('URL parameter extraction', () => {
        test('should handle URLs without shopper context qualifiers (e.g. root .data fetch)', async () => {
            // Real-life root loader URL: no src/deviceType etc., so no shopper context update
            const rootDataUrl = 'http://localhost:5173/_root.data?_routes=root%2Croutes%2F_app._index';
            mockRequest = new Request(rootDataUrl);
            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(createShopperContext).not.toHaveBeenCalled();
            // Verify no cookies were set
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.getSetCookie().length).toBe(0);
        });
    });

    describe('qualifier value handling (null, undefined, empty, whitespace, valid)', () => {
        const baseUrl = 'https://example.com';
        let sourceCodeCookieHandler: ReturnType<typeof createCookie<string>>;
        let contextCookieHandler: ReturnType<typeof createCookie<string>>;

        beforeEach(() => {
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            contextCookieHandler = createCookie('storefront-next-context', cookieConfig, mockContext);
        });

        /** Parse context cookie from Set-Cookie headers (same pattern as "should set both sourceCode and context cookies"). */
        const getContextCookieValue = async (headers: string[]): Promise<Record<string, string>> => {
            for (const cookieHeader of headers) {
                const parsed = await contextCookieHandler.parse(cookieHeader);
                if (parsed) return JSON.parse(parsed) as Record<string, string>;
            }
            throw new Error('Context cookie not found');
        };

        test('sourceCode (src): passes through null, undefined, empty, whitespace, and valid string', async () => {
            // Source-code cookie is a bare string for SFRA hybrid compatibility. Empty/whitespace
            // values clear the cookie (`parseAllCookies` drops empty values, so `parse()` → null).
            const cases: {
                param: string | null | undefined;
                expected: string;
                expectedCookie: string | null;
            }[] = [
                { param: 'email', expected: 'email', expectedCookie: 'email' },
                { param: '', expected: '', expectedCookie: null }, // src= with prior cookie → delete
                { param: '  ', expected: '', expectedCookie: null },
                { param: 'email  insta', expected: 'email  insta', expectedCookie: 'email  insta' }, // trim only; internal spaces preserved
                { param: ' email  ', expected: 'email', expectedCookie: 'email' },
            ];
            let cookieForNextRequest: string | null = null;
            for (const { param, expected, expectedCookie } of cases) {
                vi.clearAllMocks();
                const url = `${baseUrl}?src=${encodeURIComponent(String(param))}`;
                mockRequest = new Request(
                    url,
                    cookieForNextRequest ? { headers: { Cookie: cookieForNextRequest } } : {}
                );
                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    sourceCode: expected,
                });
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toBe(1);
                const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
                expect(sourceCodeCookieValue).toBe(expectedCookie);
                cookieForNextRequest = setCookieHeaders[0].split(';')[0];
            }
        });

        test('effectiveDateTime: passes through null, undefined, empty, whitespace, and valid string', async () => {
            const cases: {
                param: string | null | undefined;
                expected: string;
                expectedCookie: Record<string, string>;
            }[] = [
                {
                    param: '2025-01-15T12:00:00Z',
                    expected: '2025-01-15T12:00:00Z',
                    expectedCookie: { effectiveDateTime: '2025-01-15T12:00:00Z' },
                },
                { param: '', expected: '', expectedCookie: { effectiveDateTime: '' } }, // empty with prior cookie → delete
                { param: '  ', expected: '', expectedCookie: { effectiveDateTime: '' } },
            ];
            let cookieForNextRequest: string | null = null;
            for (const { param, expected, expectedCookie } of cases) {
                vi.clearAllMocks();
                const url = `${baseUrl}?effectiveDateTime=${encodeURIComponent(String(param))}`;
                mockRequest = new Request(
                    url,
                    cookieForNextRequest ? { headers: { Cookie: cookieForNextRequest } } : {}
                );
                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    effectiveDateTime: expected,
                });
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toBeGreaterThanOrEqual(1);
                expect(await getContextCookieValue(setCookieHeaders)).toEqual(expectedCookie);
                cookieForNextRequest = setCookieHeaders[0].split(';')[0];
            }
        });

        test('customerGroupIds: passes through null, undefined, empty, whitespace, and valid string (as array)', async () => {
            const cases: {
                param: string | null | undefined;
                expectedBody: string[];
                expectedCookie: string;
            }[] = [
                { param: 'g1,,g2', expectedBody: ['g1', 'g2'], expectedCookie: 'g1,g2' },
                { param: '', expectedBody: [], expectedCookie: '' }, // empty with prior cookie → delete
                { param: '  ', expectedBody: [], expectedCookie: '' },
                { param: ',,,', expectedBody: [], expectedCookie: '' },
                { param: ' , ', expectedBody: [], expectedCookie: '' },
                { param: 'g1', expectedBody: ['g1'], expectedCookie: 'g1' },
                { param: 'g1 ,  , g2 ', expectedBody: ['g1', 'g2'], expectedCookie: 'g1,g2' },
            ];
            let cookieForNextRequest: string | null = null;
            for (const { param, expectedBody, expectedCookie } of cases) {
                vi.clearAllMocks();
                const url = `${baseUrl}?customerGroupIds=${encodeURIComponent(String(param))}`;
                mockRequest = new Request(
                    url,
                    cookieForNextRequest ? { headers: { Cookie: cookieForNextRequest } } : {}
                );
                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    customerGroupIds: expectedBody,
                });
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toBeGreaterThanOrEqual(1);
                expect(await getContextCookieValue(setCookieHeaders)).toEqual({
                    customerGroupIds: expectedCookie,
                });
                cookieForNextRequest = setCookieHeaders[0].split(';')[0];
            }
        });

        test('couponCodes: passes through null, undefined, empty, whitespace, and valid string (as array)', async () => {
            const cases: {
                param: string | null | undefined;
                expectedBody: string[];
                expectedCookie: string;
            }[] = [
                {
                    param: 'SAVE10,SAVE20,FREESHIP',
                    expectedBody: ['SAVE10', 'SAVE20', 'FREESHIP'],
                    expectedCookie: 'SAVE10,SAVE20,FREESHIP',
                },
                {
                    param: 'code1,,,code3',
                    expectedBody: ['code1', 'code3'],
                    expectedCookie: 'code1,code3',
                },
                { param: '', expectedBody: [], expectedCookie: '' }, // empty with prior cookie → delete. Same as API contract.
                { param: '  ', expectedBody: [], expectedCookie: '' },
                { param: ',,,', expectedBody: [], expectedCookie: '' },
                { param: ' , ', expectedBody: [], expectedCookie: '' },
                { param: 'SAVE10', expectedBody: ['SAVE10'], expectedCookie: 'SAVE10' },
                {
                    param: 'SAVE10 ,  , SAVE  20 ',
                    expectedBody: ['SAVE10', 'SAVE  20'],
                    expectedCookie: 'SAVE10,SAVE  20',
                },
            ];
            let cookieForNextRequest: string | null = null;
            for (const { param, expectedBody, expectedCookie } of cases) {
                vi.clearAllMocks();
                const url = `${baseUrl}?couponCodes=${encodeURIComponent(String(param))}`;
                mockRequest = new Request(
                    url,
                    cookieForNextRequest ? { headers: { Cookie: cookieForNextRequest } } : {}
                );
                const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
                expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                    couponCodes: expectedBody,
                });
                const setCookieHeaders = (result as Response).headers.getSetCookie();
                expect(setCookieHeaders.length).toEqual(1);
                expect(await getContextCookieValue(setCookieHeaders)).toEqual({
                    couponCodes: expectedCookie,
                });
                cookieForNextRequest = setCookieHeaders[0].split(';')[0];
            }
        });

        test('custom qualifier (deviceType): passes empty, whitespace, null, undefined, and valid string', async () => {
            // Empty string → passed through (request body + cookie)
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?deviceType=`);
            let result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                customQualifiers: { deviceType: '' },
            });
            expect((result as Response).headers.getSetCookie().length).toEqual(1);
            expect(await getContextCookieValue((result as Response).headers.getSetCookie())).toEqual({
                deviceType: '',
            });

            // Whitespace only → trimmed to ''
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?deviceType=%20%20`);
            result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                customQualifiers: { deviceType: '' },
            });
            expect((result as Response).headers.getSetCookie().length).toEqual(1);
            expect(await getContextCookieValue((result as Response).headers.getSetCookie())).toEqual({
                deviceType: '',
            });

            // String "null" → included (request body + cookie)
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?deviceType=null`);
            result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                customQualifiers: { deviceType: 'null' },
            });
            const setCookieHeadersNull = (result as Response).headers.getSetCookie();
            expect(setCookieHeadersNull.length).toEqual(1);
            expect(await getContextCookieValue(setCookieHeadersNull)).toEqual({ deviceType: 'null' });

            // Valid string → included
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?deviceType=mobile`);
            result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                customQualifiers: { deviceType: 'mobile' },
            });
            const setCookieHeadersValid = (result as Response).headers.getSetCookie();
            expect(setCookieHeadersValid.length).toEqual(1);
            expect(await getContextCookieValue(setCookieHeadersValid)).toEqual({
                deviceType: 'mobile',
            });
        });

        test('assignment qualifier (store): passes empty, whitespace, null, undefined, and valid string', async () => {
            // Empty string → passed through
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?store=`);
            let result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                assignmentQualifiers: { store: '' },
            });
            expect((result as Response).headers.getSetCookie().length).toEqual(1);
            expect(await getContextCookieValue((result as Response).headers.getSetCookie())).toEqual({ store: '' });

            // Whitespace only → trimmed to ''
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?store=%20%20`);
            result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                assignmentQualifiers: { store: '' },
            });
            expect((result as Response).headers.getSetCookie().length).toEqual(1);
            expect(await getContextCookieValue((result as Response).headers.getSetCookie())).toEqual({ store: '' });

            // Valid string → included
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?store=store123`);
            result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', {
                assignmentQualifiers: { store: 'store123' },
            });
            const setCookieHeadersValid = (result as Response).headers.getSetCookie();
            expect(setCookieHeadersValid.length).toEqual(1);
            expect(await getContextCookieValue(setCookieHeadersValid)).toEqual({
                store: 'store123',
            });

            // If an empty assignment qualifiers object {} is passed, the entire qualifier object is deleted (API contract).
            vi.clearAllMocks();
            mockRequest = new Request(`${baseUrl}?src=email`);
            await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            expect(createShopperContext).toHaveBeenCalledWith(
                mockContext,
                'test-usid',
                expect.objectContaining({
                    sourceCode: 'email',
                })
            );
        });
    });

    describe('loader and action URLs', () => {
        test('should process shopper context when request URL is a loader URL (e.g. .data fetch)', async () => {
            // Real-life loader URL: React Router data request with .data path and _routes query
            const loaderUrl =
                'http://localhost:5173/product/25697782M.data?color=JJI15XX&size=006&pid=701644606374M&src=email&_routes=root%2Croutes%2F_app.product.%24productId';
            mockRequest = new Request(loaderUrl);

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', { sourceCode: 'email' });
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(1);
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
            expect(sourceCodeCookieValue).toBe('email');
        });

        test('should process shopper context when request URL is an action URL (e.g. POST to action route)', async () => {
            // Real-life action URL: POST to action route with product/quantity params and src for shopper context
            const actionUrl = `http://localhost:5173${resourceRoutes.cartItemAdd}?pid=701644606374M&quantity=1&src=email`;
            mockRequest = new Request(actionUrl, { method: 'POST' });

            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);

            expect(mockNext).toHaveBeenCalledOnce();
            expect(createShopperContext).toHaveBeenCalledWith(mockContext, 'test-usid', { sourceCode: 'email' });
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(1);
            const cookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const sourceCodeCookieHandler = createCookie('dwsourcecode', cookieConfig, mockContext);
            const sourceCodeCookieValue = await sourceCodeCookieHandler.parse(setCookieHeaders[0]);
            expect(sourceCodeCookieValue).toBe('email');
        });
    });

    describe('sourceCode handling', () => {
        test('should restore sourceCode from persistent cookie when not in URL', async () => {
            const testCookieConfig = getCookieConfig({ httpOnly: false }, mockContext);
            const testSourceCodeCookieHandler = createCookie('dwsourcecode', testCookieConfig, mockContext);
            const sourceCodeCookieSerialized = await testSourceCodeCookieHandler.serialize('persisted');
            const sourceCodeCookieValue = sourceCodeCookieSerialized.split(';')[0];

            mockRequest = new Request('https://example.com', {
                headers: { Cookie: sourceCodeCookieValue },
            });

            // No URL params
            const result = await shopperContextMiddleware(createMiddlewareArgs(mockRequest, mockContext), mockNext);
            // No new qualifiers, so API should not be called
            expect(createShopperContext).not.toHaveBeenCalled();
            // Verify no cookies were set since no new qualifiers
            expect(result).toBeInstanceOf(Response);
            const setCookieHeaders = (result as Response).headers.getSetCookie();
            expect(setCookieHeaders.length).toBe(0);
        });
    });
});
