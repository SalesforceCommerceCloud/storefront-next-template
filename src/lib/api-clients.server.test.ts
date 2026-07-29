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
import type { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { authContext } from '@/middlewares/auth.utils';
import type { SessionData } from '@/lib/api/types';
import type { Logger } from '@/lib/logger';
import { loggerContext } from '@/lib/logger.server';
import { scapiMiddlewareContext } from './scapi-middleware';
import {
    createApiClients,
    createDedupedFetch,
    createHealthObserverFetch,
    createTimeoutFetch,
} from './api-clients.server';

const scapiMocks = vi.hoisted(() => {
    const mockUse = vi.fn();
    const mockCustomUse = vi.fn();
    const mockCreateClient = vi.fn(() => ({
        use: mockCustomUse,
        getLoyaltyPoints: vi.fn(),
    }));
    const mockCreateOpenApiFetchClient = vi.fn(() => ({}));
    const mockClients = {
        use: mockUse,
        shopperBasketsV2: {},
        shopperProducts: {},
    };

    return {
        mockUse,
        mockCustomUse,
        mockCreateClient,
        mockCreateOpenApiFetchClient,
        mockClients,
    };
});

vi.mock('@/scapi/custom-clients', () => ({
    customClients: [
        {
            key: 'loyalty',
            basePath: '/custom/loyalty/v1',
            ops: { getLoyaltyPoints: { m: 'GET', b: '/customers/{customerId}', s: '/loyalty' } },
            locale: false,
            orgPrefix: true,
        },
    ],
}));

// Mock dependencies
vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://example.com'),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof vi.importActual>();
    return {
        ...actual,
        getConfig: vi.fn(() => ({
            commerce: {
                api: {
                    shortCode: 'kv7kzm78',
                    clientId: 'test-client-id',
                    organizationId: 'test-org-id',
                    siteId: 'test-site-id',
                    callback: '/callback',
                },
                sites: [
                    {
                        defaultCurrency: 'USD',
                        supportedLocales: [
                            { id: 'en-US', preferredCurrency: 'USD' },
                            { id: 'es-MX', preferredCurrency: 'MXN' },
                        ],
                        supportedCurrencies: ['USD', 'MXN'],
                    },
                ],
            },
        })),
    };
});

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({
        i18next: {
            language: 'en-US',
        },
    })),
}));

const createMockContextProvider = (): RouterContextProvider => {
    const store = new Map<unknown, unknown>();
    return {
        get(key: unknown) {
            return store.get(key);
        },
        set(key: unknown, value: unknown) {
            store.set(key, value);
            return value;
        },
    } as unknown as RouterContextProvider;
};

// Mock the createCommerceApiClients function
vi.mock('@salesforce/storefront-next-runtime/scapi', () => ({
    createCommerceApiClients: vi.fn(() => scapiMocks.mockClients),
    createClient: scapiMocks.mockCreateClient,
    createOpenApiFetchClient: scapiMocks.mockCreateOpenApiFetchClient,
    defaultQuerySerializer: vi.fn(),
    SLAS_AUTH_ENDPOINTS: [
        '/oauth2/token',
        '/oauth2/authorize',
        '/oauth2/logout',
        '/oauth2/login',
        '/oauth2/passwordless',
        '/oauth2/password',
        '/oauth2/session-bridge',
        '/oauth2/trusted-agent',
        '/oauth2/trusted-system',
        '/oauth2/revoke',
        '/oauth2/introspect',
    ],
}));

describe('createApiClients', () => {
    let mockContextProvider: RouterContextProvider;
    let mockGetConfig: ReturnType<typeof vi.fn>;
    let mockCreateCommerceApiClients: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockContextProvider = createMockContextProvider();
        mockContextProvider.set(siteContext, {
            site: {
                id: 'test-site-id',
                defaultCurrency: 'USD',
                defaultLocale: 'en-US',
                supportedCurrencies: ['USD', 'MXN'],
                supportedLocales: [
                    { id: 'en-US', preferredCurrency: 'USD' },
                    { id: 'es-MX', preferredCurrency: 'MXN' },
                ],
            },
            locale: { id: 'en-US', preferredCurrency: 'USD' },
        } as never);

        // Leave the registry unset — the production consumer treats a
        // null context value as "no factories to apply".
        mockContextProvider.set(scapiMiddlewareContext, null);

        // Get mocked functions
        const configModule = await import('@salesforce/storefront-next-runtime/config');
        mockGetConfig = configModule.getConfig as ReturnType<typeof vi.fn>;

        const scapiModule = await import('@/scapi');
        mockCreateCommerceApiClients = scapiModule.createCommerceApiClients as ReturnType<typeof vi.fn>;

        // Reset mock implementations
        mockGetConfig.mockReturnValue({
            commerce: {
                api: {
                    shortCode: 'kv7kzm78',
                    clientId: 'test-client-id',
                    organizationId: 'test-org-id',
                    siteId: 'test-site-id',
                    callback: '/callback',
                },
                sites: [
                    {
                        defaultCurrency: 'USD',
                        supportedLocales: [
                            { id: 'en-US', preferredCurrency: 'USD' },
                            { id: 'es-MX', preferredCurrency: 'MXN' },
                        ],
                        supportedCurrencies: ['USD', 'MXN'],
                    },
                ],
            },
        });
        mockCreateCommerceApiClients.mockReturnValue(scapiMocks.mockClients);
        scapiMocks.mockUse.mockClear();
        scapiMocks.mockCustomUse.mockClear();
        scapiMocks.mockCreateClient.mockClear();
        scapiMocks.mockCreateOpenApiFetchClient.mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    describe('client creation', () => {
        it('should create commerce API clients', () => {
            const clients = createApiClients(mockContextProvider);
            expect(clients).toBeDefined();
            // The returned object spreads the base SDK clients and adds custom clients + use
            expect(clients.shopperBasketsV2).toBe(scapiMocks.mockClients.shopperBasketsV2);
            expect(clients.shopperProducts).toBe(scapiMocks.mockClients.shopperProducts);
            expect(mockCreateCommerceApiClients).toHaveBeenCalledTimes(1);
            expect(mockGetConfig).toHaveBeenCalledWith(mockContextProvider);
        });

        it('should handle multiple client creations with same context', () => {
            const clients1 = createApiClients(mockContextProvider);
            const clients2 = createApiClients(mockContextProvider);

            expect(mockCreateCommerceApiClients).toHaveBeenCalledTimes(2);
            expect(clients1).toBeDefined();
            expect(clients2).toBeDefined();
        });

        it('should add authentication middleware', () => {
            createApiClients(mockContextProvider);

            // Three middlewares on client-side: correlation, auth, identifying headers
            expect(scapiMocks.mockUse).toHaveBeenCalledTimes(3);
            expect(scapiMocks.mockCustomUse).toHaveBeenCalledTimes(3);
            expect(scapiMocks.mockUse).toHaveBeenCalledWith(
                expect.objectContaining({
                    onRequest: expect.any(Function),
                })
            );
        });

        it('should use siteId from site context when available', () => {
            mockContextProvider.set(siteContext, {
                site: {
                    id: 'site-context-id',
                    defaultCurrency: 'USD',
                    defaultLocale: 'en-US',
                    supportedCurrencies: ['USD'],
                    supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],
                },
                locale: { id: 'en-US', preferredCurrency: 'USD' },
            } as never);

            createApiClients(mockContextProvider);

            expect(mockCreateCommerceApiClients).toHaveBeenCalledWith(
                expect.objectContaining({
                    siteId: 'site-context-id',
                })
            );
        });

        it('should throw when site context is not set', () => {
            // Explicitly clear site context to simulate no site context middleware
            mockContextProvider.set(siteContext, null);

            expect(() => createApiClients(mockContextProvider)).toThrow('Site context not initialized');
        });

        it('should create custom clients from the generated registry', () => {
            const clients = createApiClients(mockContextProvider);

            expect(clients).toHaveProperty('loyalty');
            expect(scapiMocks.mockCreateOpenApiFetchClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrl:
                        'https://kv7kzm78.api.commercecloud.salesforce.com/custom/loyalty/v1/organizations/test-org-id',
                })
            );
            expect(scapiMocks.mockCreateClient).toHaveBeenCalledWith(
                expect.any(Object),
                { getLoyaltyPoints: { m: 'GET', b: '/customers/{customerId}', s: '/loyalty' } },
                expect.objectContaining({
                    organizationId: 'test-org-id',
                    siteId: expect.any(String),
                }),
                expect.objectContaining({
                    onAuthTokenInvalid: expect.any(Function),
                })
            );
        });
    });

    describe('baseUrl configuration', () => {
        it('should use direct SCAPI URL from shortCode', () => {
            createApiClients(mockContextProvider);
            expect(mockCreateCommerceApiClients).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrl: 'https://kv7kzm78.api.commercecloud.salesforce.com',
                })
            );
        });

        it('should use SCAPI_PROXY_HOST when set (server-side)', () => {
            vi.stubGlobal('window', undefined);
            vi.stubEnv('SCAPI_PROXY_HOST', 'https://scw:25010');

            createApiClients(mockContextProvider);
            expect(mockCreateCommerceApiClients).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrl: 'https://scw:25010',
                    proxyHost: 'https://scw:25010',
                })
            );
        });

        it('should use shortCode from config', () => {
            mockGetConfig.mockReturnValue({
                commerce: {
                    api: {
                        shortCode: 'custom123',
                    },
                    sites: [
                        {
                            defaultCurrency: 'USD',
                            supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],
                            supportedCurrencies: ['USD'],
                        },
                    ],
                },
            });

            createApiClients(mockContextProvider);
            expect(mockCreateCommerceApiClients).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrl: 'https://custom123.api.commercecloud.salesforce.com',
                })
            );
        });
    });

    describe('authentication middleware', () => {
        let authMiddleware: { onRequest: (args: { request: Request }) => Promise<Request> };

        beforeEach(() => {
            createApiClients(mockContextProvider);
            // authMiddleware is at index 1 (correlation at 0)
            authMiddleware = scapiMocks.mockUse.mock.calls[1][0];
        });

        it('should have onRequest method', () => {
            expect(authMiddleware).toHaveProperty('onRequest');
            expect(typeof authMiddleware.onRequest).toBe('function');
        });

        describe('onRequest handler', () => {
            it('should add Authorization header with Bearer token', async () => {
                const mockRequest = new Request('https://api.example.com/test');
                const mockSession: SessionData = {
                    accessToken: 'test-access-token-123',
                    customerId: 'test-customer',
                    userType: 'registered',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Authorization')).toBe('Bearer test-access-token-123');
            });

            it('should add dwsid header when present in session', async () => {
                const mockRequest = new Request('https://api.example.com/test');
                const mockSession: SessionData = {
                    accessToken: 'test-access-token-123',
                    customerId: 'test-customer',
                    userType: 'registered',
                    dwsid: 'test-dwsid-value',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('sfdc_dwsid')).toBe('test-dwsid-value');
            });

            it('should retrieve auth session from context', async () => {
                const mockRequest = new Request('https://api.example.com/test');
                const mockSession: SessionData = {
                    accessToken: 'another-token',
                    customerId: 'customer-456',
                    userType: 'guest',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Authorization')).toBe('Bearer another-token');
            });

            it('should throw error when no session found', async () => {
                const mockRequest = new Request('https://api.example.com/test');

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(undefined),
                });

                await expect(authMiddleware.onRequest({ request: mockRequest })).rejects.toThrow('No session found');
            });

            it('should throw error when session is null', async () => {
                const mockRequest = new Request('https://api.example.com/test');

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(null as unknown as SessionData),
                });

                await expect(authMiddleware.onRequest({ request: mockRequest })).rejects.toThrow('No session found');
            });

            it('should preserve existing request headers', async () => {
                const mockRequest = new Request('https://api.example.com/test', {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Custom-Header': 'custom-value',
                    },
                });
                const mockSession: SessionData = {
                    accessToken: 'test-token',
                    customerId: 'test-customer',
                    userType: 'registered',
                    dwsid: 'session-id-123',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Content-Type')).toBe('application/json');
                expect(result.headers.get('X-Custom-Header')).toBe('custom-value');
                expect(result.headers.get('Authorization')).toBe('Bearer test-token');
                expect(result.headers.get('sfdc_dwsid')).toBe('session-id-123');
            });

            it('should handle auth promise rejection', async () => {
                const mockRequest = new Request('https://api.example.com/test');
                const authError = new Error('Auth service unavailable');

                mockContextProvider.set(authContext, {
                    ref: Promise.reject(authError),
                });

                await expect(authMiddleware.onRequest({ request: mockRequest })).rejects.toThrow(
                    'Auth service unavailable'
                );
            });

            it('should return the modified request', async () => {
                const mockRequest = new Request('https://api.example.com/test');
                const mockSession: SessionData = {
                    accessToken: 'test-token',
                    customerId: 'test-customer',
                    userType: 'registered',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result).toBeInstanceOf(Request);
                expect(result.url).toBe(mockRequest.url);
            });

            it('should skip Authorization and sfdc_dwsid for non-refresh SLAS auth endpoints', async () => {
                const mockRequest = new Request(
                    'https://api.example.com/shopper/auth/v1/organizations/test/oauth2/token',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'grant_type=authorization_code_pkce&code=test-code',
                    }
                );
                const mockSession: SessionData = {
                    accessToken: 'test-token',
                    customerId: 'test-customer',
                    userType: 'registered',
                    dwsid: 'test-dwsid',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Authorization')).toBeNull();
                expect(result.headers.get('sfdc_dwsid')).toBeNull();
            });

            it('should inject sfdc_dwsid for SLAS refresh_token calls', async () => {
                const mockRequest = new Request(
                    'https://api.example.com/shopper/auth/v1/organizations/test/oauth2/token',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'grant_type=refresh_token&refresh_token=test-refresh',
                    }
                );
                const mockSession: SessionData = {
                    accessToken: 'test-token',
                    customerId: 'test-customer',
                    userType: 'registered',
                    dwsid: 'test-dwsid',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Authorization')).toBeNull();
                expect(result.headers.get('sfdc_dwsid')).toBe('test-dwsid');
            });

            it('should not inject sfdc_dwsid for SLAS auth endpoints when session has no dwsid', async () => {
                const mockRequest = new Request(
                    'https://api.example.com/shopper/auth/v1/organizations/test/oauth2/token'
                );
                const mockSession: SessionData = {
                    accessToken: 'test-token',
                    customerId: 'test-customer',
                    userType: 'registered',
                };

                mockContextProvider.set(authContext, {
                    ref: Promise.resolve(mockSession),
                });

                const result = await authMiddleware.onRequest({ request: mockRequest });

                expect(result.headers.get('Authorization')).toBeNull();
                expect(result.headers.get('sfdc_dwsid')).toBeNull();
            });
        });
    });
});

// ===========================================================================
// Fetch-level dedupe — tests for `createDedupedFetch`, the opinionated reference
// dedupe implementation that wraps the base `fetch` before it's handed to the
// SCAPI clients.
// ===========================================================================

type MockLogger = {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
};

function makeContext(): RouterContextProvider & { logger: MockLogger } {
    // The registry is keyed by the context object itself (WeakMap), so any
    // unique object instance per "request" is sufficient for test isolation.
    // We wire a mock logger into `loggerContext` so cache-hit logging is
    // observable from tests (and so `getLogger(context)` doesn't fall back
    // to a console logger that would emit noise during the run).
    const store = new Map<unknown, unknown>();
    const logger: MockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    store.set(loggerContext, logger as unknown as Logger);
    const ctx = {
        get(key: unknown) {
            return store.get(key);
        },
        set(key: unknown, value: unknown) {
            store.set(key, value);
            return value;
        },
    } as unknown as RouterContextProvider & { logger: MockLogger };
    ctx.logger = logger;
    return ctx;
}

describe('createDedupedFetch', () => {
    function makeBaseFetch() {
        let counter = 0;
        return vi.fn(() => {
            const id = ++counter;
            return Promise.resolve(
                new Response(JSON.stringify({ id }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );
        });
    }

    it('shares one underlying fetch for two parallel identical GETs', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        const [r1, r2] = await Promise.all([fetch('https://api.example.com/x'), fetch('https://api.example.com/x')]);

        expect(baseFetch).toHaveBeenCalledTimes(1);
        // The second caller hit the cache and emits an info log.
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).toHaveBeenCalledWith('[ApiClients] fetch cache hit GET /x');
        // Both callers must be able to consume the body independently (responses are cloned).
        await expect(r1.json()).resolves.toEqual({ id: 1 });
        await expect(r2.json()).resolves.toEqual({ id: 1 });
    });

    it('treats reordered query parameters as identical', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await Promise.all([fetch('https://api.example.com/x?a=1&b=2'), fetch('https://api.example.com/x?b=2&a=1')]);

        expect(baseFetch).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        // Query keys are sorted and values are masked, so reordered params produce a stable log line.
        expect(ctx.logger.info).toHaveBeenCalledWith('[ApiClients] fetch cache hit GET /x?a=*&b=*');
    });

    it('does not dedupe POST requests', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await Promise.all([
            fetch('https://api.example.com/x', { method: 'POST', body: 'a' }),
            fetch('https://api.example.com/x', { method: 'POST', body: 'a' }),
        ]);

        expect(baseFetch).toHaveBeenCalledTimes(2);
        // Mutations are never cache hits — no info log should fire.
        expect(ctx.logger.info).not.toHaveBeenCalled();
    });

    it('isolates registries between two contexts (no cross-request leakage)', async () => {
        const ctxA = makeContext();
        const ctxB = makeContext();
        const baseFetch = makeBaseFetch();
        const fetchA = createDedupedFetch(ctxA, baseFetch as unknown as typeof globalThis.fetch);
        const fetchB = createDedupedFetch(ctxB, baseFetch as unknown as typeof globalThis.fetch);

        await fetchA('https://api.example.com/x');
        await fetchB('https://api.example.com/x');

        expect(baseFetch).toHaveBeenCalledTimes(2);
    });

    it('shares a rejected promise across concurrent callers and evicts on rejection', async () => {
        const ctx = makeContext();
        const baseFetch = vi.fn();
        baseFetch.mockRejectedValueOnce(new Error('network'));
        // Second call (after eviction) succeeds.
        baseFetch.mockResolvedValueOnce(new Response('ok'));
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        const p1 = fetch('https://api.example.com/x');
        const p2 = fetch('https://api.example.com/x');
        await expect(p1).rejects.toThrow('network');
        await expect(p2).rejects.toThrow('network');
        expect(baseFetch).toHaveBeenCalledTimes(1);

        // Subsequent identical call retries because the rejected entry was evicted.
        await expect(fetch('https://api.example.com/x')).resolves.toBeInstanceOf(Response);
        expect(baseFetch).toHaveBeenCalledTimes(2);
    });

    it('clears the registry on mutation settle (read → mutate → re-read)', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await fetch('https://api.example.com/x');
        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(1);
        // Second GET was a cache hit.
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).toHaveBeenLastCalledWith('[ApiClients] fetch cache hit GET /x');

        await fetch('https://api.example.com/x', { method: 'POST', body: 'a' });

        await fetch('https://api.example.com/x');
        // 1 GET (deduped) + 1 POST + 1 GET after invalidation = 3.
        expect(baseFetch).toHaveBeenCalledTimes(3);
        // Post-invalidation read missed the cache, so the info log count did not change.
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
    });

    it('clears the registry across URL boundaries on mutation settle', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await fetch('https://api.example.com/a');
        await fetch('https://api.example.com/b');
        expect(baseFetch).toHaveBeenCalledTimes(2);

        await fetch('https://api.example.com/x', { method: 'POST', body: 'a' });

        await fetch('https://api.example.com/a');
        await fetch('https://api.example.com/b');
        // 2 GETs + 1 POST + 2 fresh GETs after invalidation = 5.
        expect(baseFetch).toHaveBeenCalledTimes(5);
    });

    it('invalidates on mutation rejection (failure must not leave stale cache)', async () => {
        const ctx = makeContext();
        const baseFetch = vi.fn();
        baseFetch.mockResolvedValueOnce(new Response('ok')); // first GET
        baseFetch.mockRejectedValueOnce(new Error('boom')); // POST fails
        baseFetch.mockResolvedValueOnce(new Response('ok')); // second GET (after invalidation)
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await fetch('https://api.example.com/x');
        await expect(fetch('https://api.example.com/x', { method: 'POST', body: 'a' })).rejects.toThrow('boom');

        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(3);
    });

    it('lets concurrent in-flight reads complete against the pre-mutation snapshot', async () => {
        const ctx = makeContext();

        let resolveGet: ((value: Response) => void) | undefined;
        const baseFetch = vi.fn();
        baseFetch.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveGet = resolve;
                })
        );
        baseFetch.mockResolvedValueOnce(new Response('mutated')); // POST
        baseFetch.mockResolvedValueOnce(new Response('fresh')); // GET after invalidation
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        const inFlight = fetch('https://api.example.com/x');

        // Mutation settles while the read is still pending.
        await fetch('https://api.example.com/x', { method: 'POST', body: 'a' });

        // Pending read resolves to its original (pre-mutation) response.
        resolveGet?.(new Response('snapshot'));
        await expect((await inFlight).text()).resolves.toBe('snapshot');

        // 1 pending GET + 1 POST = 2 underlying calls so far.
        expect(baseFetch).toHaveBeenCalledTimes(2);

        // Subsequent read goes to the network.
        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(3);
    });

    it('passes a Request object through to the base fetch (reconstructed to neutralize signal)', async () => {
        const ctx = makeContext();
        const baseFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
            Promise.resolve(new Response('ok'))
        );
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        const req = new Request('https://api.example.com/x', {
            method: 'GET',
            headers: { 'X-Test': 'value' },
        });
        await fetch(req);

        // Underlying fetch must receive a Request (so SDK Request semantics — method, headers, body —
        // survive), but it MUST NOT be the caller's Request: we reconstruct so the inner Request's signal
        // is independent of any signal the caller may have attached to its own Request.
        expect(baseFetch).toHaveBeenCalledTimes(1);
        const passedInput = baseFetch.mock.calls[0][0] as Request;
        expect(passedInput).toBeInstanceOf(Request);
        expect(passedInput).not.toBe(req);
        expect(passedInput.url).toBe(req.url);
        expect(passedInput.method).toBe('GET');
        expect(passedInput.headers.get('X-Test')).toBe('value');
    });

    it('dedupes HEAD requests and shares the response across callers', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        const [r1, r2] = await Promise.all([
            fetch('https://api.example.com/x', { method: 'HEAD' }),
            fetch('https://api.example.com/x', { method: 'HEAD' }),
        ]);

        expect(baseFetch).toHaveBeenCalledTimes(1);
        // The HEAD cache hit is logged with the matching method.
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).toHaveBeenCalledWith('[ApiClients] fetch cache hit HEAD /x');
        // Each cache hit returns its own clone — both callers can read independently.
        expect(r1).toBeInstanceOf(Response);
        expect(r2).toBeInstanceOf(Response);
    });

    it('logs the URL pathname and query keys with masked values on cache hit', async () => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await Promise.all([
            fetch('https://api.example.com/baskets/abc?siteId=site&locale=en-US&token=secret&customerId=12345'),
            fetch('https://api.example.com/baskets/abc?siteId=site&locale=en-US&token=secret&customerId=12345'),
        ]);

        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        const message = ctx.logger.info.mock.calls[0][0] as string;
        // Pathname + sorted query keys; values for sensitive keys are masked, but `locale` and `siteId` are
        // global SCAPI routing parameters and kept verbatim for diagnostics.
        expect(message).toBe(
            '[ApiClients] fetch cache hit GET /baskets/abc?customerId=*&locale=en-US&siteId=site&token=*'
        );
        expect(message).not.toContain('api.example.com');
        expect(message).not.toContain('secret');
        expect(message).not.toContain('12345');
    });

    it.each([
        'PUT',
        'PATCH',
        'DELETE',
    ])('invalidates the registry on %s settle (not just POST)', async (mutationMethod) => {
        const ctx = makeContext();
        const baseFetch = makeBaseFetch();
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        await fetch('https://api.example.com/x');
        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(1);

        await fetch('https://api.example.com/x', { method: mutationMethod, body: 'a' });

        await fetch('https://api.example.com/x');
        // 1 GET (deduped) + 1 mutation + 1 GET after invalidation = 3.
        expect(baseFetch).toHaveBeenCalledTimes(3);
    });

    it('serializes concurrent mutations and invalidates the registry once each settles', async () => {
        const ctx = makeContext();
        const baseFetch = vi.fn();
        baseFetch.mockResolvedValueOnce(new Response('initial'));
        baseFetch.mockResolvedValueOnce(new Response('m1'));
        baseFetch.mockResolvedValueOnce(new Response('m2'));
        baseFetch.mockResolvedValueOnce(new Response('fresh'));
        const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

        // Prime the cache with one read.
        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(1);

        // Two concurrent mutations — each must hit the network (mutations are never deduped).
        await Promise.all([
            fetch('https://api.example.com/x', { method: 'POST', body: '1' }),
            fetch('https://api.example.com/x', { method: 'POST', body: '2' }),
        ]);
        expect(baseFetch).toHaveBeenCalledTimes(3);

        // After both mutations settle the registry is empty, so a fresh read goes to the network.
        await fetch('https://api.example.com/x');
        expect(baseFetch).toHaveBeenCalledTimes(4);
    });

    describe('abort handling', () => {
        // Construct a base fetch that resolves only when we tell it to, so we can interleave aborts.
        function makeControllableFetch() {
            let resolveCurrent: ((response: Response) => void) | undefined;
            const baseFetch = vi.fn(
                (_input: RequestInfo | URL, _init?: RequestInit) =>
                    new Promise<Response>((resolve) => {
                        resolveCurrent = resolve;
                    })
            );
            return {
                baseFetch,
                resolve: (response = new Response('ok')) => {
                    resolveCurrent?.(response);
                    resolveCurrent = undefined;
                },
            };
        }

        it("does not forward the caller's signal to the underlying fetch", async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controller = new AbortController();
            const fetchPromise = fetch('https://api.example.com/x', { signal: controller.signal });

            // Whatever init was passed to the underlying fetch must NOT carry the caller's signal — otherwise
            // the next assertion (caller's abort doesn't cancel the underlying fetch) would be a coincidence.
            expect(baseFetch).toHaveBeenCalledTimes(1);
            const passedInit = baseFetch.mock.calls[0]?.[1];
            expect(passedInit?.signal).toBeUndefined();

            controller.abort(new Error('caller aborted'));
            await expect(fetchPromise).rejects.toThrow('caller aborted');

            // Underlying fetch is still running — it has not been aborted.
            resolve();
            // Allow the unraced underlying fetch to settle without errors leaking out.
            await new Promise<void>((r) => setTimeout(r, 0));
        });

        it('aborts only the calling await, not the shared fetch (other callers complete normally)', async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controllerA = new AbortController();
            const a = fetch('https://api.example.com/x', { signal: controllerA.signal });
            const b = fetch('https://api.example.com/x'); // no signal

            controllerA.abort(new Error('A only'));
            await expect(a).rejects.toThrow('A only');

            // The underlying fetch was not aborted by A's abort, so B can still resolve.
            resolve(new Response('shared body'));
            await expect((await b).text()).resolves.toBe('shared body');

            expect(baseFetch).toHaveBeenCalledTimes(1);
        });

        it('rejects immediately when the caller signal is already aborted', async () => {
            const ctx = makeContext();
            const baseFetch = makeBaseFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controller = new AbortController();
            controller.abort(new Error('already gone'));

            // The signal was already aborted before fetch was called. Caller's await must reject.
            await expect(fetch('https://api.example.com/x', { signal: controller.signal })).rejects.toThrow(
                'already gone'
            );
        });

        it('does not forward a signal carried on a Request input to the underlying fetch', async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controller = new AbortController();
            const req = new Request('https://api.example.com/x', { signal: controller.signal });
            const fetchPromise = fetch(req);

            expect(baseFetch).toHaveBeenCalledTimes(1);
            const passedInput = baseFetch.mock.calls[0][0] as Request;
            // The underlying fetch must receive a Request whose signal is NOT the caller's signal.
            expect(passedInput).toBeInstanceOf(Request);
            expect(passedInput).not.toBe(req);
            expect(passedInput.signal).not.toBe(controller.signal);
            expect(passedInput.signal.aborted).toBe(false);

            controller.abort(new Error('caller aborted via Request'));
            await expect(fetchPromise).rejects.toThrow('caller aborted via Request');

            // Underlying fetch's signal must NOT have followed the caller's abort.
            expect(passedInput.signal.aborted).toBe(false);

            resolve();
            await new Promise<void>((r) => setTimeout(r, 0));
        });

        it('aborts only the calling await when the signal is on a Request input (other callers complete)', async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controllerA = new AbortController();
            const reqA = new Request('https://api.example.com/x', { signal: controllerA.signal });
            const a = fetch(reqA);
            const b = fetch('https://api.example.com/x'); // no signal

            controllerA.abort(new Error('A only (Request signal)'));
            await expect(a).rejects.toThrow('A only (Request signal)');

            // Underlying fetch was not aborted — the second caller still observes a normal resolution.
            resolve(new Response('shared body'));
            await expect((await b).text()).resolves.toBe('shared body');

            expect(baseFetch).toHaveBeenCalledTimes(1);
        });

        it('keeps the cache populated for later (non-aborted) callers when the first caller aborts', async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const controllerA = new AbortController();
            const a = fetch('https://api.example.com/x', { signal: controllerA.signal });
            controllerA.abort(new Error('A bailed'));
            await expect(a).rejects.toThrow('A bailed');

            // A second caller arrives after A aborted — should still share the in-flight fetch (no new fetch).
            const b = fetch('https://api.example.com/x');
            expect(baseFetch).toHaveBeenCalledTimes(1);

            resolve(new Response('shared'));
            await expect((await b).text()).resolves.toBe('shared');
        });
    });
});

// ===========================================================================
// Hard timeout — tests for `createTimeoutFetch`, the wrapper that brackets
// outgoing fetches with an AbortController-driven hard timeout. Composed with
// `createDedupedFetch` in `createApiClients` so one timer governs each real
// network call.
// ===========================================================================

describe('createTimeoutFetch', () => {
    function makeControllableFetch() {
        let resolveCurrent: ((response: Response) => void) | undefined;
        let rejectCurrent: ((reason: unknown) => void) | undefined;
        let lastSignal: AbortSignal | undefined;
        const baseFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            const signal = init?.signal ?? undefined;
            lastSignal = signal;
            // Mirror `globalThis.fetch`: when the signal aborts, the fetch promise rejects with the signal's reason.
            return new Promise<Response>((resolve, reject) => {
                resolveCurrent = resolve;
                rejectCurrent = reject;
                if (signal) {
                    if (signal.aborted) {
                        reject(signal.reason);
                        return;
                    }
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                }
            });
        });
        return {
            baseFetch,
            resolve: (response = new Response('ok')) => {
                resolveCurrent?.(response);
                resolveCurrent = undefined;
                rejectCurrent = undefined;
            },
            reject: (reason: unknown) => {
                rejectCurrent?.(reason);
                resolveCurrent = undefined;
                rejectCurrent = undefined;
            },
            getSignal: () => lastSignal,
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns baseFetch unchanged when timeoutMs is null (no wrapping overhead)', () => {
        const ctx = makeContext();
        const baseFetch = vi.fn();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, null);
        // Identity check: a null timeout yields the very same function.
        expect(wrapped).toBe(baseFetch);
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    describe('input validation (fail-open with warning)', () => {
        // Misconfiguration at the system boundary (e.g. PUBLIC__ env var typo) must not brick SCAPI.
        // Invalid values become a no-op + one warn log so ops can see what happened.
        it.each([
            ['zero', 0],
            ['negative', -1],
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['fractional', 1.5],
        ])('returns baseFetch unchanged for %s and emits one warn log', (_label, value) => {
            const ctx = makeContext();
            const baseFetch = vi.fn();
            const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, value);
            expect(wrapped).toBe(baseFetch);
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
            const [message, metadata] = ctx.logger.warn.mock.calls[0];
            expect(message).toBe(
                '[ApiClients] ignoring invalid timeoutMs; expected a positive integer, no timeout will be applied'
            );
            expect(metadata).toEqual({ timeoutMs: value });
        });

        it('warns at most once per request context across repeated invalid calls', () => {
            const ctx = makeContext();
            const baseFetch = vi.fn();
            createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 0);
            createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, -1);
            createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, Number.NaN);
            // Single shared context → one warn line, not three.
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        });

        it('warns separately per request context (no cross-request bleed)', () => {
            const ctxA = makeContext();
            const ctxB = makeContext();
            const baseFetch = vi.fn();
            createTimeoutFetch(ctxA, baseFetch as unknown as typeof globalThis.fetch, 0);
            createTimeoutFetch(ctxB, baseFetch as unknown as typeof globalThis.fetch, 0);
            // Each context is its own observability scope and gets its own warn line.
            expect(ctxA.logger.warn).toHaveBeenCalledTimes(1);
            expect(ctxB.logger.warn).toHaveBeenCalledTimes(1);
        });
    });

    it('aborts the underlying fetch when the timer fires and rejects with a TimeoutError', async () => {
        const ctx = makeContext();
        const { baseFetch, getSignal } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000);

        const promise = wrapped('https://api.example.com/x');

        // Underlying fetch was invoked with a signal that has not yet aborted.
        expect(baseFetch).toHaveBeenCalledTimes(1);
        const passedInit = baseFetch.mock.calls[0]?.[1];
        expect(passedInit?.signal).toBeDefined();
        expect(passedInit?.signal?.aborted).toBe(false);

        // `expect(...).rejects` attaches its handler synchronously, so we pair it with the timer
        // advancement to avoid an unhandled-rejection warning during the fake-timer drain.
        await Promise.all([
            expect(promise).rejects.toMatchObject({ name: 'TimeoutError' }),
            vi.advanceTimersByTimeAsync(1000),
        ]);

        // The signal forwarded to baseFetch is now aborted with a TimeoutError.
        const signal = getSignal();
        expect(signal?.aborted).toBe(true);
        expect((signal?.reason as Error)?.name).toBe('TimeoutError');
    });

    describe('rejection shape (mirrors AbortSignal.timeout)', () => {
        // The wrapper rejects with `new DOMException('fetch timed out after Nms', 'TimeoutError')`,
        // matching the standard `AbortSignal.timeout()` reason shape so callers can use the
        // standard `err.name === 'TimeoutError'` idiom. These tests pin that contract.

        async function runTimeout(timeoutMs: number) {
            const ctx = makeContext();
            const { baseFetch, getSignal } = makeControllableFetch();
            const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, timeoutMs);
            const promise = wrapped('https://api.example.com/x').catch((e: unknown) => e);
            await vi.advanceTimersByTimeAsync(timeoutMs);
            const error = (await promise) as Error;
            return { error, signal: getSignal() };
        }

        it('rejects with name === "TimeoutError"', async () => {
            const { error } = await runTimeout(1000);
            expect(error.name).toBe('TimeoutError');
        });

        it('error message includes the configured timeoutMs', async () => {
            const { error } = await runTimeout(2500);
            expect(error.message).toBe('fetch timed out after 2500ms');
        });

        it("aborted signal's reason is the same DOMException the caller observes", async () => {
            const { error, signal } = await runTimeout(1000);
            // The reason set on the controller is what propagates: same object identity from the abort
            // listener through to the rejected promise.
            expect(signal?.reason).toBe(error);
            expect(signal?.reason).toBeInstanceOf(DOMException);
            const reason = signal?.reason as DOMException;
            expect(reason.name).toBe('TimeoutError');
        });
    });

    it('does not abort or log when the underlying fetch resolves before the timer', async () => {
        const ctx = makeContext();
        const { baseFetch, resolve, getSignal } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000);

        const promise = wrapped('https://api.example.com/x');
        resolve(new Response('hello'));
        const response = await promise;

        await expect(response.text()).resolves.toBe('hello');

        // Advancing past the deadline must not retroactively abort or log — the timer was cleared.
        await vi.advanceTimersByTimeAsync(2000);
        expect(getSignal()?.aborted).toBe(false);
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it('does not abort or log when the underlying fetch rejects before the timer', async () => {
        const ctx = makeContext();
        const { baseFetch, reject, getSignal } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000);

        const promise = wrapped('https://api.example.com/x');
        reject(new Error('network'));
        await expect(promise).rejects.toThrow('network');

        await vi.advanceTimersByTimeAsync(2000);
        expect(getSignal()?.aborted).toBe(false);
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it("merges the caller's init.signal with the timeout signal (standalone use)", async () => {
        const ctx = makeContext();
        const { baseFetch, getSignal } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 5000);

        const controller = new AbortController();
        const promise = wrapped('https://api.example.com/x', { signal: controller.signal });

        // Caller's abort happens long before the timeout deadline; it must reach the underlying fetch.
        const rejection = expect(promise).rejects.toThrow('caller aborted');
        controller.abort(new Error('caller aborted'));
        await rejection;

        const signal = getSignal();
        expect(signal?.aborted).toBe(true);
        // Without the timer firing, the wrapper must not log a timeout.
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it('merges a Request-borne caller signal with the timeout signal (standalone use)', async () => {
        const ctx = makeContext();
        const { baseFetch, getSignal } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 5000);

        const controller = new AbortController();
        const req = new Request('https://api.example.com/x', { signal: controller.signal });
        const promise = wrapped(req);

        const rejection = expect(promise).rejects.toThrow('caller aborted via Request');
        controller.abort(new Error('caller aborted via Request'));
        await rejection;

        expect(getSignal()?.aborted).toBe(true);
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it('rejects synchronously when the caller signal is already aborted', async () => {
        // Distinct AbortSignal.any code path: when one of the merged signals is *already* aborted at the time
        // of merge, the result is an already-aborted signal, baseFetch rejects synchronously with the caller's
        // reason, the timer never fires, and `finally` clears the freshly-armed timer.
        const ctx = makeContext();
        const { baseFetch } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 5000);

        const controller = new AbortController();
        controller.abort(new Error('already gone'));

        await expect(wrapped('https://api.example.com/x', { signal: controller.signal })).rejects.toThrow(
            'already gone'
        );
        // The timer was armed and cleared without ever firing — no timeout log, no spurious abort log.
        expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it('emits exactly one warn log per timeout, with method, masked URL, and timeoutMs metadata', async () => {
        const ctx = makeContext();
        const { baseFetch } = makeControllableFetch();
        const wrapped = createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000);

        const promise = wrapped('https://api.example.com/baskets/abc?siteId=site&locale=en-US&token=secret', {
            method: 'POST',
            body: 'a',
        });

        await Promise.all([
            expect(promise).rejects.toMatchObject({ name: 'TimeoutError' }),
            vi.advanceTimersByTimeAsync(1000),
        ]);

        expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        const [message, metadata] = ctx.logger.warn.mock.calls[0];
        // Pathname + sorted query keys; values for sensitive keys are masked, but `locale` and `siteId` are
        // kept verbatim for diagnostics. Mirrors the dedupe wrapper's `maskUrl()` behavior.
        expect(message).toBe('[ApiClients] fetch timeout POST /baskets/abc?locale=en-US&siteId=site&token=*');
        expect(metadata).toEqual({ timeoutMs: 1000 });
        // Sanity — sensitive values must not leak.
        expect(message).not.toContain('secret');
        expect(message).not.toContain('api.example.com');
    });

    describe('composition with createDedupedFetch', () => {
        it('one timeout rejects all concurrent callers awaiting the same dedupe key', async () => {
            const ctx = makeContext();
            const { baseFetch } = makeControllableFetch();
            const fetch = createDedupedFetch(
                ctx,
                createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000)
            );

            const a = fetch('https://api.example.com/x');
            const b = fetch('https://api.example.com/x');

            // Both callers collided on the dedupe key — only one underlying fetch was issued.
            expect(baseFetch).toHaveBeenCalledTimes(1);

            await Promise.all([
                expect(a).rejects.toMatchObject({ name: 'TimeoutError' }),
                expect(b).rejects.toMatchObject({ name: 'TimeoutError' }),
                vi.advanceTimersByTimeAsync(1000),
            ]);
            // One real fetch, one timer, one warn log line.
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        });

        it('evicts the dedupe registry on timeout so the next call retries fresh', async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(
                ctx,
                createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000)
            );

            // First call times out — the rejected stored promise is evicted from the dedupe registry.
            const a = fetch('https://api.example.com/x');
            await Promise.all([
                expect(a).rejects.toMatchObject({ name: 'TimeoutError' }),
                vi.advanceTimersByTimeAsync(1000),
            ]);
            expect(baseFetch).toHaveBeenCalledTimes(1);

            // After timeout, the dedupe entry is evicted — a subsequent call to the same URL hits the
            // network again instead of being served from the cached (rejected) promise.
            const b = fetch('https://api.example.com/x');
            expect(baseFetch).toHaveBeenCalledTimes(2);

            // Resolve the second underlying fetch in time so the test's deadline doesn't fire.
            resolve(new Response('fresh'));
            await expect((await b).text()).resolves.toBe('fresh');
        });

        it("caller's own AbortSignal still rejects only that caller's await; underlying fetch keeps running for siblings", async () => {
            const ctx = makeContext();
            const { baseFetch, resolve } = makeControllableFetch();
            const fetch = createDedupedFetch(
                ctx,
                createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 5000)
            );

            const controllerA = new AbortController();
            const a = fetch('https://api.example.com/x', { signal: controllerA.signal });
            const b = fetch('https://api.example.com/x'); // no signal

            // Attach the rejection assertion synchronously, then trigger the abort. This avoids any
            // unhandled-rejection window between abort and the assertion attaching.
            const aRejection = expect(a).rejects.toThrow('A only');
            // Caller A aborts long before the timeout deadline.
            await vi.advanceTimersByTimeAsync(100);
            controllerA.abort(new Error('A only'));
            await aRejection;

            // Underlying fetch was not aborted — it is still alive for B. The timeout is still armed.
            // Resolve before the deadline.
            resolve(new Response('shared'));
            await expect((await b).text()).resolves.toBe('shared');

            // The deadline never fires because the underlying fetch resolved first; clearTimeout cleans up.
            await vi.advanceTimersByTimeAsync(10000);
            expect(ctx.logger.warn).not.toHaveBeenCalled();
        });

        it('timeout-before-caller-abort rejects all callers with TimeoutError', async () => {
            const ctx = makeContext();
            const { baseFetch } = makeControllableFetch();
            const fetch = createDedupedFetch(
                ctx,
                createTimeoutFetch(ctx, baseFetch as unknown as typeof globalThis.fetch, 1000)
            );

            const controllerA = new AbortController();
            const a = fetch('https://api.example.com/x', { signal: controllerA.signal });
            const b = fetch('https://api.example.com/x'); // no signal

            await Promise.all([
                expect(a).rejects.toMatchObject({ name: 'TimeoutError' }),
                expect(b).rejects.toMatchObject({ name: 'TimeoutError' }),
                vi.advanceTimersByTimeAsync(1000),
            ]);
            // Caller A's later abort is a no-op; the timeout already won.
            controllerA.abort(new Error('too late'));
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        });
    });
});

// ===========================================================================
// SCAPI health observer — tests for `createHealthObserverFetch`, the innermost
// wrapper that emits one concrete log line for otherwise-lost failure
// categories: load shedding (`sfdc_load_status` header) and rate limiting
// (HTTP 429). Detection and logging only — it never retries and always passes
// the original response through. All lines share the `SCAPI health` token.
// ===========================================================================

describe('createHealthObserverFetch', () => {
    function makeResponse(headers: Record<string, string>, status = 200): Response {
        return new Response('ok', { status, headers });
    }

    describe('load shedding', () => {
        it('does not log when no sfdc_load_status header is present', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({})));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const response = await fetch('https://api.example.com/x');

            expect(response.status).toBe(200);
            expect(ctx.logger.warn).not.toHaveBeenCalled();
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });

        it('logs at warn level on sfdc_load_status: WARN (served 2xx)', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'WARN', sfdc_load: '82' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/products/abc?siteId=site&locale=en-US&token=secret');

            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
            expect(ctx.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('SCAPI health load GET /products/abc?locale=en-US&siteId=site&token=*'),
                { status: 'warn', load: '82' }
            );
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });

        it('logs at warn level on sfdc_load_status: THROTTLE when the response is still served (2xx)', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() =>
                Promise.resolve(makeResponse({ sfdc_load_status: 'THROTTLE', sfdc_load: '93' }))
            );
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/products/abc');

            // The request succeeded despite advertised pressure — a warning, not an error.
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
            expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('SCAPI health load GET '), {
                status: 'throttle',
                load: '93',
            });
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });

        it('logs at error level when the request is shed with a 503 (sfdc_load drops, status carries THROTTLE)', async () => {
            const ctx = makeContext();
            // SCAPI's worker generates the shed 503 itself: it sets sfdc_load_status: THROTTLE but has no origin
            // sfdc_load value to copy through, so that header is absent.
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'THROTTLE' }, 503)));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/products/abc');

            expect(ctx.logger.error).toHaveBeenCalledTimes(1);
            expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('SCAPI health load GET '), {
                status: 'throttle',
                load: null,
            });
            expect(ctx.logger.warn).not.toHaveBeenCalled();
        });

        it('logs with load: null when sfdc_load_status is set but sfdc_load is absent', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'WARN' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/x');

            expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('SCAPI health load'), {
                status: 'warn',
                load: null,
            });
        });

        it('normalizes the status to lower case in the meta property', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'WARN', sfdc_load: '82' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/x');

            expect(ctx.logger.warn).toHaveBeenCalledWith(
                expect.not.stringContaining('WARN'),
                expect.objectContaining({ status: 'warn' })
            );
        });

        it('does not log on sfdc_load alone without sfdc_load_status', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load: '50' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/x');

            expect(ctx.logger.warn).not.toHaveBeenCalled();
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });

        it('reads the request method from a Request input', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'WARN' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch(new Request('https://api.example.com/baskets/abc', { method: 'POST' }));

            expect(ctx.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('SCAPI health load POST /baskets/abc'),
                { status: 'warn', load: null }
            );
        });

        it('masks the URL from a URL object input', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ sfdc_load_status: 'WARN' })));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch(new URL('https://api.example.com/products/abc?siteId=site&token=secret'));

            expect(ctx.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('SCAPI health load GET /products/abc?siteId=site&token=*'),
                { status: 'warn', load: null }
            );
        });
    });

    describe('rate limiting (HTTP 429)', () => {
        it('logs at error level on a 429 with a Retry-After header (verbatim)', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ 'Retry-After': '30' }, 429)));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/products/abc?siteId=site&locale=en-US&token=secret');

            expect(ctx.logger.error).toHaveBeenCalledTimes(1);
            expect(ctx.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('SCAPI health rate GET /products/abc?locale=en-US&siteId=site&token=*'),
                { retryAfter: '30' }
            );
        });

        it('logs at error level on a 429 without a Retry-After header (retryAfter: null)', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({}, 429)));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/x');

            expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('SCAPI health rate'), {
                retryAfter: null,
            });
        });

        it('reads the request method from a Request input for 429', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({ 'Retry-After': '5' }, 429)));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch(new Request('https://api.example.com/baskets/abc', { method: 'POST' }));

            expect(ctx.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('SCAPI health rate POST /baskets/abc'),
                { retryAfter: '5' }
            );
        });

        it('does not log on non-429 error statuses', async () => {
            const ctx = makeContext();
            const baseFetch = vi.fn(() => Promise.resolve(makeResponse({}, 500)));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await fetch('https://api.example.com/x');

            expect(ctx.logger.warn).not.toHaveBeenCalled();
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });
    });

    describe('passthrough and composition', () => {
        it('passes through the response unchanged', async () => {
            const ctx = makeContext();
            const original = makeResponse({ sfdc_load_status: 'WARN', sfdc_load: '80' });
            const baseFetch = vi.fn(() => Promise.resolve(original));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            const response = await fetch('https://api.example.com/x');

            expect(response).toBe(original);
            expect(await response.text()).toBe('ok');
        });

        it('does not log and rethrows a rejected fetch unchanged', async () => {
            const ctx = makeContext();
            const err = new TypeError('fetch failed');
            const baseFetch = vi.fn(() => Promise.reject(err));
            const fetch = createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch);

            await expect(fetch('https://api.example.com/x')).rejects.toBe(err);
            expect(ctx.logger.warn).not.toHaveBeenCalled();
            expect(ctx.logger.error).not.toHaveBeenCalled();
        });

        it('logs once per real fetch when wrapped beneath createTimeoutFetch', async () => {
            const ctx = makeContext();
            const responses = [
                makeResponse({ sfdc_load_status: 'WARN', sfdc_load: '85' }),
                makeResponse({ sfdc_load_status: 'WARN', sfdc_load: '88' }),
            ];
            let call = 0;
            const baseFetch = vi.fn(() => Promise.resolve(responses[call++]));
            const fetch = createTimeoutFetch(
                ctx,
                createHealthObserverFetch(ctx, baseFetch as unknown as typeof globalThis.fetch),
                5000
            );

            // Each real network call must produce exactly one observer log line, regardless of the timeout layer.
            await fetch('https://api.example.com/x');
            await fetch('https://api.example.com/y');

            expect(baseFetch).toHaveBeenCalledTimes(2);
            expect(ctx.logger.warn).toHaveBeenCalledTimes(2);
        });
    });
});
