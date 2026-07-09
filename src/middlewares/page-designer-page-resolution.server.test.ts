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
import { deflateSync } from 'node:zlib';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pageDesignerResolutionMiddleware } from './page-designer-page-resolution.server';
import { siteUrlConfigContext } from './site-url-config.server';
import { createTestContext } from '@/lib/test-utils';
import { scapiMiddlewareContext, ScapiMiddlewareRegistry } from '@/lib/scapi-middleware';
import { resolvePage } from '@salesforce/storefront-next-runtime/design/data';
import {
    DataStore,
    DataStoreNotFoundError,
    DataStoreUnavailableError,
    DataStoreServiceError,
} from '@salesforce/storefront-next-runtime/data-store';
import { mockSiteObject } from '@/test-utils/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import type { Cookie } from 'react-router';

const mockGetEntry = vi.fn();
const mockResolveQualifiers = vi.fn();

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

const mockClients = {
    shopperExperience: {
        resolveQualifiers: mockResolveQualifiers,
    },
} as any;

vi.mock('@salesforce/storefront-next-runtime/data-store', async (importOriginal) => {
    const original = await importOriginal<typeof import('@salesforce/storefront-next-runtime/data-store')>();
    return {
        ...original,
        DataStore: {
            getDataStore: vi.fn(() => ({ getEntry: mockGetEntry })),
        },
    };
});

vi.mock('@salesforce/storefront-next-runtime/design/data', async (importOriginal) => {
    const original = await importOriginal<typeof import('@salesforce/storefront-next-runtime/design/data')>();
    return {
        ...original,
        resolvePage: vi.fn(),
    };
});

const mockedResolvePage = vi.mocked(resolvePage);

/**
 * Helper: creates a mock page Data Store entry with the given object deflate-compressed
 * and base64-encoded under `compressedData`, matching the format expected by
 * `getAndUnpackDataStoreEntry` for page manifests.
 */
function packPageEntry(data: Record<string, unknown>) {
    const compressed = deflateSync(Buffer.from(JSON.stringify(data), 'utf-8'));
    return { value: { compressedData: compressed.toString('base64') } };
}

/**
 * Helper: creates a mock site Data Store entry. As of the unified manifest
 * unpack path, both page and site manifests share the deflate+base64
 * `compressedData` envelope — this helper exists for readability at call
 * sites that semantically work with site manifests.
 */
function packSiteEntry(data: Record<string, unknown>) {
    return packPageEntry(data);
}

/** Base URL pattern matching SCAPI shopperExperience getPage endpoint */
const SCAPI_BASE = 'https://short.api.commercecloud.salesforce.com/shopper/shopper-experience/v1/organizations/org1';

function getPageUrl(pageId: string, queryParams?: Record<string, string>): string {
    const url = new URL(`${SCAPI_BASE}/pages/${pageId}`);
    if (queryParams) {
        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

function getPagesUrl(queryParams?: Record<string, string>): string {
    const url = new URL(`${SCAPI_BASE}/pages`);
    if (queryParams) {
        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

/** Builds a MiddlewareCallbackParams-compatible object for the onRequest handler. */
function middlewareParams(request: Request, overrides: { schemaPath?: string; id?: string } = {}) {
    return {
        request,
        schemaPath: overrides.schemaPath ?? '/pages/{pageId}',
        params: {},
        id: overrides.id ?? 'getPage',
        options: {} as any,
    };
}

/**
 * Helper: invokes the middleware to register the factory, then calls the factory
 * with context to produce the SCAPI middleware. Returns `null` if the factory
 * returns null (e.g. feature flag disabled, no data store).
 */
async function invokeMiddlewareAndGetHandler(context: ReturnType<typeof createTestContext>) {
    const registry = new ScapiMiddlewareRegistry();
    context.set(scapiMiddlewareContext, registry);

    const next = vi.fn().mockResolvedValue(new Response());
    await pageDesignerResolutionMiddleware({ context } as any, next);

    expect(next).toHaveBeenCalled();
    const entries = Array.from(registry.entries());
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.clients).toEqual(['shopperExperience']);

    const middleware = entry.factory(context, mockClients);
    if (!middleware) return null;

    return middleware.onRequest;
}

/**
 * Helper: creates a context with the feature flag enabled and data store available,
 * invokes the middleware, and returns the onRequest handler.
 *
 * The site URL config context is pre-populated with a lazy loader that
 * resolves to a media host prefix so `resolveGetPageRequest` does not bail
 * out at its `mediaHostPrefix` guard — tests that exercise the missing-
 * prefix path skip this setup so the loader resolves to `null`.
 */
async function setupHandler() {
    const context = createTestContext({
        appConfig: { features: { mrtBasedPageDesignerResolution: true } } as any,
    });
    // Pin the site context to the mock site so manifest storage keys are
    // deterministic regardless of the developer's local config.app.defaultSiteId.
    const localeObj =
        mockSiteObject.supportedLocales.find((l) => l.id === 'en-GB') ?? mockSiteObject.supportedLocales[0];
    context.set(siteContext, {
        site: { ...mockSiteObject, alias: 'global', name: mockSiteObject.id },
        locale: { ...localeObj },
        currency: localeObj.preferredCurrency,
        siteCookie: { name: 'site_id' } as unknown as Cookie,
        localeCookie: { name: 'locale_id' } as unknown as Cookie,
        currencyCookie: { name: 'currency' } as unknown as Cookie,
    });
    // The lazy middleware stores a loader function rather than a value;
    // mirror that shape here so `getSiteUrlConfig` resolves correctly.
    context.set(siteUrlConfigContext, (() => Promise.resolve({ mediaHostPrefix: 'https://www.shop.example' })) as any);

    const handler = await invokeMiddlewareAndGetHandler(context);
    if (!handler) throw new Error('Expected factory to return a middleware with onRequest handler');
    return handler;
}

describe('pageDesignerResolutionMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetEntry.mockReset();
        mockResolveQualifiers.mockReset();
        mockedResolvePage.mockReset();
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    describe('factory registration', () => {
        it('should not register any SCAPI factory when the feature flag is disabled', async () => {
            // With the feature flag off and no debug telemetry, the
            // middleware is a no-op: no SCAPI factory is registered, so
            // getPage requests pass through to the SCAPI client unchanged.
            const context = createTestContext({
                appConfig: { features: { mrtBasedPageDesignerResolution: false } } as any,
            });
            const registry = new ScapiMiddlewareRegistry();
            context.set(scapiMiddlewareContext, registry);

            const next = vi.fn().mockResolvedValue(new Response());
            await pageDesignerResolutionMiddleware({ context } as any, next);

            expect(Array.from(registry.entries())).toHaveLength(0);
            expect(next).toHaveBeenCalled();
        });

        it('should register a factory entry when feature flag is enabled', async () => {
            const context = createTestContext({
                appConfig: { features: { mrtBasedPageDesignerResolution: true } } as any,
            });
            const registry = new ScapiMiddlewareRegistry();
            context.set(scapiMiddlewareContext, registry);

            const next = vi.fn().mockResolvedValue(new Response());
            await pageDesignerResolutionMiddleware({ context } as any, next);

            const entries = Array.from(registry.entries());
            expect(entries).toHaveLength(1);
            expect(entries[0].clients).toEqual(['shopperExperience']);
            expect(typeof entries[0].factory).toBe('function');
            expect(next).toHaveBeenCalled();
        });

        it('replaces the existing entry for the same key when run twice on the same request', async () => {
            // Idempotency check: if the router middleware were to fire
            // twice within one request the registry must not produce two
            // factory entries (which would cause duplicate logs / double
            // SCAPI middleware on the same client).
            const context = createTestContext({
                appConfig: { features: { mrtBasedPageDesignerResolution: true } } as any,
            });
            const registry = new ScapiMiddlewareRegistry();
            context.set(scapiMiddlewareContext, registry);

            const next = vi.fn().mockResolvedValue(new Response());
            await pageDesignerResolutionMiddleware({ context } as any, next);
            await pageDesignerResolutionMiddleware({ context } as any, next);

            expect(Array.from(registry.entries())).toHaveLength(1);
        });

        it('should return an onRequest handler from factory when feature flag is enabled', async () => {
            const context = createTestContext({
                appConfig: { features: { mrtBasedPageDesignerResolution: true } } as any,
            });

            const handler = await invokeMiddlewareAndGetHandler(context);

            expect(handler).toBeDefined();
        });
    });

    describe('request matching', () => {
        it('should skip non-GET requests', async () => {
            const handler = await setupHandler();

            const result = await handler(middlewareParams(new Request(getPageUrl('homepage'), { method: 'POST' })));

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });

        it('should skip requests that do not match /pages/{pageId}', async () => {
            const handler = await setupHandler();

            const result = await handler(
                middlewareParams(new Request(`${SCAPI_BASE}/other-endpoint`), {
                    schemaPath: '/other',
                    id: 'other',
                })
            );

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });

        it('should skip design mode requests (mode query param)', async () => {
            const handler = await setupHandler();

            const result = await handler(middlewareParams(new Request(getPageUrl('homepage', { mode: 'EDIT' }))));

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });

        it('should skip preview mode requests (pdToken query param)', async () => {
            const handler = await setupHandler();

            const result = await handler(middlewareParams(new Request(getPageUrl('homepage', { pdToken: 'abc123' }))));

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });

        it('should match GET requests to /pages/{pageId}', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(middlewareParams(new Request(getPageUrl('homepage'))));

            expect(mockedResolvePage).toHaveBeenCalled();
        });
    });

    describe('mediaHostPrefix guard', () => {
        async function setupHandlerWithoutMediaHostPrefix() {
            const context = createTestContext({
                appConfig: { features: { mrtBasedPageDesignerResolution: true } } as any,
            });
            // Intentionally do NOT set siteUrlConfigContext — this simulates
            // an environment where the ECOM SiteUrlConfigDalEntryProvider
            // hasn't synced its entry yet (e.g. local dev).
            const handler = await invokeMiddlewareAndGetHandler(context);
            if (!handler) throw new Error('Expected factory to return a middleware');
            return handler;
        }

        it('falls through to SCAPI without calling resolvePage when mediaHostPrefix is unavailable', async () => {
            const handler = await setupHandlerWithoutMediaHostPrefix();

            const result = await handler(middlewareParams(new Request(getPageUrl('homepage'))));

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });

        it('logs a warning when mediaHostPrefix is unavailable on a page request', async () => {
            const handler = await setupHandlerWithoutMediaHostPrefix();

            await handler(middlewareParams(new Request(getPageUrl('homepage'))));

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('mediaHostPrefix not available'),
                expect.objectContaining({ pageId: 'homepage' })
            );
        });

        it('does not log when the request is not a page request (no spam on every SCAPI call)', async () => {
            const handler = await setupHandlerWithoutMediaHostPrefix();

            await handler(
                middlewareParams(new Request(`${SCAPI_BASE}/other-endpoint`), {
                    schemaPath: '/other',
                    id: 'other',
                })
            );

            expect(mockLogger.warn).not.toHaveBeenCalled();
        });
    });

    describe('page resolution', () => {
        it('should call resolvePage with correct params for a page identifier', async () => {
            const handler = await setupHandler();
            const mockPage = { id: 'homepage', regions: [] };
            mockedResolvePage.mockResolvedValue(mockPage as any);

            const aspectAttributes = JSON.stringify({ aspectType: 'storefront' });
            const result = await handler(middlewareParams(new Request(getPageUrl('homepage', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'homepage',
                    identifierType: 'page',
                    aspectType: 'storefront',
                    locale: expect.any(String),
                    manifestStorage: expect.any(Object),
                    contextResolver: expect.any(Function),
                })
            );
            expect(result).toBeInstanceOf(Response);
            const body = await (result as Response).json();
            expect(body).toEqual(mockPage);
        });

        it('should use product identifierType when productId is provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ productId: 'shirt-001' });
            await handler(middlewareParams(new Request(getPageUrl('pdp', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                })
            );
        });

        it('should use category identifierType when categoryId is provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ categoryId: 'mens-clothing' });
            await handler(middlewareParams(new Request(getPageUrl('plp', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'mens-clothing',
                    identifierType: 'category',
                })
            );
        });

        it('should prefer productId over categoryId when both are provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ productId: 'shirt-001', categoryId: 'mens-clothing' });
            await handler(middlewareParams(new Request(getPageUrl('pdp', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                })
            );
        });

        it('should pass categoryId as a fallback when both productId and categoryId are provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ productId: 'shirt-001', categoryId: 'mens-clothing' });
            await handler(middlewareParams(new Request(getPageUrl('pdp', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                    categoryId: 'mens-clothing',
                })
            );
        });

        it('should not pass categoryId when only productId is provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ productId: 'shirt-001' });
            await handler(middlewareParams(new Request(getPageUrl('pdp', { aspectAttributes }))));

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                    categoryId: undefined,
                })
            );
        });

        it('should return undefined when resolvePage returns null (pass through to SCAPI)', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const result = await handler(middlewareParams(new Request(getPageUrl('nonexistent'))));

            expect(result).toBeUndefined();
        });

        it('should return a JSON Response when resolvePage succeeds', async () => {
            const handler = await setupHandler();
            const mockPage = { id: 'resolved-page', name: 'Resolved Page', regions: [{ id: 'main', components: [] }] };
            mockedResolvePage.mockResolvedValue(mockPage as any);

            const result = await handler(middlewareParams(new Request(getPageUrl('resolved-page'))));

            expect(result).toBeInstanceOf(Response);
            const body = await (result as Response).json();
            expect(body).toEqual(mockPage);
        });
    });

    describe('getPages interception', () => {
        it('should match GET requests to /pages (no pageId)', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(
                middlewareParams(new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001' })), {
                    schemaPath: '/pages',
                    id: 'getPages',
                })
            );

            expect(mockedResolvePage).toHaveBeenCalled();
        });

        it('falls back to top-level query params when no aspectAttributes JSON is present', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(
                middlewareParams(new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001' })), {
                    schemaPath: '/pages',
                    id: 'getPages',
                })
            );

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                    aspectType: 'pdp',
                })
            );
        });

        it('reads the category fallback from the aspectAttributes JSON when a PDP omits the top-level categoryId', async () => {
            // Mirrors what fetchPage sends for a PDP getPages request: productId
            // top-level (SCAPI rejects both business-object IDs), with the full
            // set — including the primary-category fallback — in the
            // aspectAttributes JSON. The fallback must survive so a product with
            // no page but whose primary category has one still resolves.
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({
                aspectType: 'pdp',
                categoryId: 'mens-clothing',
                productId: 'shirt-001',
            });
            await handler(
                middlewareParams(
                    new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001', aspectAttributes })),
                    { schemaPath: '/pages', id: 'getPages' }
                )
            );

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'shirt-001',
                    identifierType: 'product',
                    aspectType: 'pdp',
                    categoryId: 'mens-clothing',
                })
            );
        });

        it('should use category identifierType when categoryId is provided', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(
                middlewareParams(new Request(getPagesUrl({ aspectTypeId: 'plp', categoryId: 'mens-clothing' })), {
                    schemaPath: '/pages',
                    id: 'getPages',
                })
            );

            expect(mockedResolvePage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'mens-clothing',
                    identifierType: 'category',
                    aspectType: 'plp',
                })
            );
        });

        it('should wrap the resolved page as a PageResult-shaped list response', async () => {
            const handler = await setupHandler();
            const mockPage = { id: 'resolved-pdp', name: 'PDP', regions: [] };
            mockedResolvePage.mockResolvedValue(mockPage as any);

            const result = await handler(
                middlewareParams(new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001' })), {
                    schemaPath: '/pages',
                    id: 'getPages',
                })
            );

            expect(result).toBeInstanceOf(Response);
            const body = await (result as Response).json();
            expect(body).toEqual({ data: [mockPage] });
        });

        it('should return undefined when resolvePage returns null (pass through to SCAPI)', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const result = await handler(
                middlewareParams(new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001' })), {
                    schemaPath: '/pages',
                    id: 'getPages',
                })
            );

            expect(result).toBeUndefined();
        });

        it('should skip design mode requests (mode query param)', async () => {
            const handler = await setupHandler();

            const result = await handler(
                middlewareParams(
                    new Request(getPagesUrl({ aspectTypeId: 'pdp', productId: 'shirt-001', mode: 'EDIT' })),
                    { schemaPath: '/pages', id: 'getPages' }
                )
            );

            expect(result).toBeUndefined();
            expect(mockedResolvePage).not.toHaveBeenCalled();
        });
    });

    describe('contextResolver', () => {
        /**
         * Helper: invokes the middleware handler, captures the contextResolver
         * passed to resolvePage, and returns it for direct testing.
         */
        async function captureContextResolver() {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(middlewareParams(new Request(getPageUrl('test-page'))));

            const resolvePageArgs = mockedResolvePage.mock.calls[0][0];
            return resolvePageArgs.contextResolver as NonNullable<typeof resolvePageArgs.contextResolver>;
        }

        it('should call resolveQualifiers with the provided context and return its data', async () => {
            const qualifierResponse = {
                campaignQualifiers: { camp1: true },
                customerGroups: { group1: true },
                dataBindings: { binding1: 'value' },
            };
            mockResolveQualifiers.mockResolvedValue({ data: qualifierResponse });

            const contextResolver = await captureContextResolver();
            const inputContext = {
                campaignQualifiers: { camp1: ['q1'] },
                customerGroups: ['cg1'],
                dataBindings: [{ key: 'b1' }],
            };

            const result = await contextResolver(inputContext as any);

            expect(mockResolveQualifiers).toHaveBeenCalledWith({
                params: {},
                body: {
                    campaignQualifiers: inputContext.campaignQualifiers,
                    dataBindings: inputContext.dataBindings,
                    customerGroups: inputContext.customerGroups,
                },
            });
            expect(result).toEqual(qualifierResponse);
        });

        it('should return null and log error when resolveQualifiers fails', async () => {
            mockResolveQualifiers.mockRejectedValue(new Error('qualifier API failed'));

            const contextResolver = await captureContextResolver();
            // Populated context — empty input would short-circuit before
            // resolveQualifiers is called (see "early-return" test below).
            const result = await contextResolver({
                campaignQualifiers: [{ id: 'q1' }],
                customerGroups: [],
                dataBindings: [],
            } as any);

            expect(result).toBeNull();
            expect(mockLogger.error).toHaveBeenCalledWith('[PageResolutionMiddleware] Failed to resolve qualifiers', {
                message: 'Failed to resolve qualifiers',
                cause: expect.any(Error),
            });
        });

        it('should not throw when resolveQualifiers fails (error is handled by onError)', async () => {
            mockResolveQualifiers.mockRejectedValue(new Error('qualifier API failed'));

            const contextResolver = await captureContextResolver();

            await expect(
                contextResolver({
                    campaignQualifiers: [{ id: 'q1' }],
                    customerGroups: [],
                    dataBindings: [],
                } as any)
            ).resolves.toBeNull();
        });

        it('should short-circuit and return null when all context fields are empty', async () => {
            // Empty/undefined context arrays are a no-op — the resolver
            // returns null without making a network call. This avoids
            // wasted SCAPI requests for pages that have no qualifier
            // bindings.
            mockResolveQualifiers.mockResolvedValue({ data: {} });

            const contextResolver = await captureContextResolver();
            const inputContext = {
                campaignQualifiers: undefined,
                customerGroups: undefined,
                dataBindings: undefined,
            };

            const result = await contextResolver(inputContext as any);

            expect(result).toBeNull();
            expect(mockResolveQualifiers).not.toHaveBeenCalled();
        });
    });

    describe('manifestStorage', () => {
        /**
         * Helper: invokes the middleware handler, captures the manifestStorage
         * passed to resolvePage, and returns it for direct testing.
         */
        async function captureManifestStorage() {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(middlewareParams(new Request(getPageUrl('test-page'))));

            const resolvePageArgs = mockedResolvePage.mock.calls[0][0];
            return resolvePageArgs.manifestStorage;
        }

        describe('getPageManifest', () => {
            it('should call dataStore.getEntry with the correct key and unpack the entry', async () => {
                const mockManifest = { id: 'page-1', context: {} };
                mockGetEntry.mockResolvedValue(packPageEntry(mockManifest));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('page-1');

                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_page-1`);
                expect(result).toEqual(mockManifest);
            });

            it('should use the correct siteId in the storage key', async () => {
                mockGetEntry.mockResolvedValue(packPageEntry({}));

                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('my-page');

                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_my-page`);
            });

            it('should return null and log warning when DataStoreNotFoundError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreNotFoundError('not found'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('missing-page');

                expect(result).toBeNull();
                expect(mockLogger.warn).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store entry not found', {
                    message: 'not found',
                });
            });

            it('should return null and log error when DataStoreUnavailableError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreUnavailableError('unavailable'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('some-page');

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store unavailable', {
                    message: 'unavailable',
                });
            });

            it('should return null and log error when DataStoreServiceError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreServiceError('service error'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('some-page');

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store service error', {
                    message: 'service error',
                });
            });

            it('should return null and log unpack error when entry has invalid base64 data', async () => {
                mockGetEntry.mockResolvedValue({ value: { compressedData: '!!!not-base64!!!' } });

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('bad-page');

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith(
                    '[PageResolutionMiddleware] Failed to unpack data store entry',
                    {
                        message: expect.stringContaining('Failed to unpack data store entry'),
                        cause: expect.anything(),
                    }
                );
            });

            it('should return null and log unpack error when entry has invalid compressed data', async () => {
                mockGetEntry.mockResolvedValue({
                    value: { compressedData: Buffer.from('not compressed').toString('base64') },
                });

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('bad-page');

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith(
                    '[PageResolutionMiddleware] Failed to unpack data store entry',
                    {
                        message: expect.stringContaining('Failed to unpack data store entry'),
                        cause: expect.anything(),
                    }
                );
            });

            it('should return null and log unpack error when decompressed data is not valid JSON', async () => {
                const compressed = deflateSync(Buffer.from('not json', 'utf-8'));
                mockGetEntry.mockResolvedValue({ value: { compressedData: compressed.toString('base64') } });

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getPageManifest('bad-page');

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith(
                    '[PageResolutionMiddleware] Failed to unpack data store entry',
                    {
                        message: expect.stringContaining('Failed to unpack data store entry'),
                        cause: expect.anything(),
                    }
                );
            });

            it('should propagate unknown errors from getEntry (forwarded to error boundary)', async () => {
                // Unknown errors are NOT swallowed at the manifest-storage
                // layer — the error handler rethrows them so the outer
                // onRequest wrapper logs them as unexpected and the error
                // boundary takes over. Known data-store errors (covered by
                // the cases above) resolve to null.
                mockGetEntry.mockRejectedValue(new Error('unexpected'));

                const manifestStorage = await captureManifestStorage();

                await expect(manifestStorage.getPageManifest('some-page')).rejects.toThrow('unexpected');
            });

            it('should resolve null for all known data-store error types (errors are forwarded to onError)', async () => {
                const errorCases = [
                    new DataStoreNotFoundError('not found'),
                    new DataStoreUnavailableError('unavailable'),
                    new DataStoreServiceError('service error'),
                ];

                for (const error of errorCases) {
                    mockGetEntry.mockRejectedValue(error);

                    const manifestStorage = await captureManifestStorage();

                    await expect(manifestStorage.getPageManifest('page')).resolves.toBeNull();
                }
            });
        });

        describe('getSiteManifest', () => {
            it('should call dataStore.getEntry with site-level key and unpack the entry', async () => {
                const mockSiteManifest = { pages: {} };
                mockGetEntry.mockResolvedValue(packSiteEntry(mockSiteManifest));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getSiteManifest();

                expect(mockGetEntry).toHaveBeenCalledWith(`site-manifest_${mockSiteObject.id}`);
                expect(result).toEqual(mockSiteManifest);
            });

            it('should return null and log warning when DataStoreNotFoundError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreNotFoundError('not found'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getSiteManifest();

                expect(result).toBeNull();
                expect(mockLogger.warn).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store entry not found', {
                    message: 'not found',
                });
            });

            it('should return null and log error when DataStoreUnavailableError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreUnavailableError('unavailable'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getSiteManifest();

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store unavailable', {
                    message: 'unavailable',
                });
            });

            it('should return null and log error when DataStoreServiceError is thrown', async () => {
                mockGetEntry.mockRejectedValue(new DataStoreServiceError('service error'));

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getSiteManifest();

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith('[PageResolutionMiddleware] Data store service error', {
                    message: 'service error',
                });
            });

            it('should return null and log unpack error when entry has invalid JSON data', async () => {
                const compressed = deflateSync(Buffer.from('not json', 'utf-8'));
                mockGetEntry.mockResolvedValue({ value: { compressedData: compressed.toString('base64') } });

                const manifestStorage = await captureManifestStorage();
                const result = await manifestStorage.getSiteManifest();

                expect(result).toBeNull();
                expect(mockLogger.error).toHaveBeenCalledWith(
                    '[PageResolutionMiddleware] Failed to unpack data store entry',
                    {
                        message: expect.stringContaining('Failed to unpack data store entry'),
                        cause: expect.anything(),
                    }
                );
            });

            it('should propagate unknown errors from getEntry (forwarded to error boundary)', async () => {
                // See getPageManifest counterpart — unknown errors bubble
                // out so the outer onRequest catch can log "Unexpected
                // error during page resolution" and rethrow.
                mockGetEntry.mockRejectedValue(new Error('unexpected'));

                const manifestStorage = await captureManifestStorage();

                await expect(manifestStorage.getSiteManifest()).rejects.toThrow('unexpected');
            });

            it('should resolve null for all known data-store error types (errors are forwarded to onError)', async () => {
                const errorCases = [
                    new DataStoreNotFoundError('not found'),
                    new DataStoreUnavailableError('unavailable'),
                    new DataStoreServiceError('service error'),
                ];

                for (const error of errorCases) {
                    mockGetEntry.mockRejectedValue(error);

                    const manifestStorage = await captureManifestStorage();

                    await expect(manifestStorage.getSiteManifest()).resolves.toBeNull();
                }
            });
        });

        describe('storage key sanitization', () => {
            it('should pass through safe characters unchanged', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('homepage');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_homepage`);
            });

            it('should pass through alphanumeric and hyphens', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('my-page-v2');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_my-page-v2`);
            });

            it('should encode underscore as .5F to prevent delimiter collision', async () => {
                // _ is the segment delimiter in keys — if _ passed through unencoded,
                // siteId="a_b" + pageId="c" and siteId="a" + pageId="b_c" would
                // produce the same key. Encoding _ as .5F makes segments unambiguous.
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('a_b');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_a.5Fb`);
            });

            it('should encode tilde as .7E', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('home~page');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_home.7Epage`);
            });

            it('should encode colon as .3A', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('category:shoes');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_category.3Ashoes`);
            });

            it('should encode dot as .2E to prevent collisions', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('page.3Amore');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_page.2E3Amore`);
            });

            it('should encode square brackets as .5B and .5D', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('page[1]');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_page.5B1.5D`);
            });

            it('should encode all special pageId characters', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                // pageId special chars: ~ : [ ] @ ! ' * , ; =  (only - is safe; _ is encoded as .5F)
                await manifestStorage.getPageManifest("~:[]@!'*,;=");
                expect(mockGetEntry).toHaveBeenCalledWith(
                    `page-manifest_${mockSiteObject.id}_.7E.3A.5B.5D.40.21.27.2A.2C.3B.3D`
                );
            });

            it('should encode multi-byte UTF-8 characters', async () => {
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getPageManifest('café');
                expect(mockGetEntry).toHaveBeenCalledWith(`page-manifest_${mockSiteObject.id}_caf.C3.A9`);
            });

            it('should form correct key for a safe siteId', async () => {
                // The test harness sets siteId to the configured default site ID (all safe characters).
                // This verifies the siteId segment is included verbatim when no encoding
                // is needed. Special-character siteId encoding is covered structurally by
                // sanitizeKeySegment, which is exercised identically for both segments.
                mockGetEntry.mockResolvedValue(null);
                const manifestStorage = await captureManifestStorage();
                await manifestStorage.getSiteManifest();
                const key = mockGetEntry.mock.calls[0][0] as string;
                expect(key).toBe(`site-manifest_${mockSiteObject.id}`);
            });
        });
    });

    describe('metrics logging', () => {
        it('should not emit a debug log when the request does not match a getPage path', async () => {
            const handler = await setupHandler();

            await handler(middlewareParams(new Request(`${SCAPI_BASE}/other-endpoint`)));

            expect(mockLogger.debug).not.toHaveBeenCalled();
        });

        it('should not emit a debug log for non-GET requests', async () => {
            const handler = await setupHandler();

            await handler(middlewareParams(new Request(getPageUrl('homepage'), { method: 'POST' })));

            expect(mockLogger.debug).not.toHaveBeenCalled();
        });

        it('should not emit a debug log for design/preview mode requests', async () => {
            const handler = await setupHandler();

            await handler(middlewareParams(new Request(getPageUrl('homepage', { mode: 'EDIT' }))));

            expect(mockLogger.debug).not.toHaveBeenCalled();
        });

        it('should emit a debug log with metrics when resolution is attempted', async () => {
            const handler = await setupHandler();
            const mockPage = { id: 'homepage', typeId: 'storefront', regions: [] };
            mockedResolvePage.mockResolvedValue(mockPage as any);

            await handler(middlewareParams(new Request(getPageUrl('homepage'))));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[PageResolutionMiddleware] page resolution',
                expect.objectContaining({
                    resolvedPageId: 'homepage',
                    resolvedPageTypeId: 'storefront',
                    resolvedParameters: expect.objectContaining({
                        id: 'homepage',
                        identifierType: 'page',
                        locale: expect.any(String),
                    }),
                    metrics: expect.objectContaining({
                        resolutionDuration: expect.any(Number),
                    }),
                })
            );
        });

        it('should emit a debug log with undefined result fields when resolvePage returns null', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            await handler(middlewareParams(new Request(getPageUrl('nonexistent'))));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[PageResolutionMiddleware] page resolution',
                expect.objectContaining({
                    resolvedPageId: undefined,
                    resolvedPageTypeId: undefined,
                    metrics: expect.objectContaining({
                        resolutionDuration: expect.any(Number),
                    }),
                })
            );
        });

        it('should log resolution parameters with correct identifierType for product pages', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ productId: 'shirt-001' });
            await handler(middlewareParams(new Request(getPageUrl('pdp', { aspectAttributes }))));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[PageResolutionMiddleware] page resolution',
                expect.objectContaining({
                    resolvedParameters: expect.objectContaining({
                        id: 'shirt-001',
                        identifierType: 'product',
                    }),
                })
            );
        });

        it('should log resolution parameters with correct identifierType for category pages', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue(null);

            const aspectAttributes = JSON.stringify({ categoryId: 'mens' });
            await handler(middlewareParams(new Request(getPageUrl('plp', { aspectAttributes }))));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[PageResolutionMiddleware] page resolution',
                expect.objectContaining({
                    resolvedParameters: expect.objectContaining({
                        id: 'mens',
                        identifierType: 'category',
                    }),
                })
            );
        });

        it('should include non-negative duration values in metrics', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockResolvedValue({ id: 'page', regions: [] } as any);

            await handler(middlewareParams(new Request(getPageUrl('page'))));

            const logCall = mockLogger.debug.mock.calls[0];
            const metrics = logCall[1].metrics;

            expect(metrics.resolutionDuration).toBeGreaterThanOrEqual(0);
        });

        it('should not emit metrics when resolvePage throws (error propagates before logMetrics)', async () => {
            const handler = await setupHandler();
            mockedResolvePage.mockRejectedValue(new Error('resolution failed'));

            await expect(handler(middlewareParams(new Request(getPageUrl('page'))))).rejects.toThrow(
                'resolution failed'
            );

            expect(mockLogger.debug).not.toHaveBeenCalled();
        });

        describe('resolvedContext sanitization', () => {
            /**
             * Drives a full resolution where `resolvePage` invokes the supplied
             * `contextResolver` with a populated context, so `resolveQualifiers`
             * runs and `metrics.resolvedContext` is set from `resolvedData`.
             * Returns the `resolvedContext` field as emitted in the debug log.
             */
            async function captureLoggedResolvedContext(resolvedData: Record<string, unknown>) {
                mockResolveQualifiers.mockResolvedValue({ data: resolvedData });
                mockedResolvePage.mockImplementation(async (params: any) => {
                    // Non-empty context so the resolver doesn't short-circuit.
                    await params.contextResolver({ dataBindings: [{ type: 't', id: 'i' }] });
                    return null;
                });

                const handler = await setupHandler();
                await handler(middlewareParams(new Request(getPageUrl('homepage'))));

                const logCall = mockLogger.debug.mock.calls.find(
                    (c) => c[0] === '[PageResolutionMiddleware] page resolution'
                );
                return logCall?.[1].resolvedContext;
            }

            it('preserves data-binding structure and short string values verbatim', async () => {
                const resolvedContext = await captureLoggedResolvedContext({
                    customerGroups: { VIP: true },
                    campaignQualifiers: { 'my-campaign': { 'my-promo': false } },
                    dataBindings: {
                        content_asset: {
                            'homepage-banner': { title: 'Winter Sale', showCountdown: true, priority: 3 },
                        },
                    },
                });

                expect(resolvedContext).toEqual({
                    customerGroups: { VIP: true },
                    campaignQualifiers: { 'my-campaign': { 'my-promo': false } },
                    dataBindings: {
                        content_asset: {
                            'homepage-banner': { title: 'Winter Sale', showCountdown: true, priority: 3 },
                        },
                    },
                });
            });

            it('truncates long string values while keeping non-string values intact', async () => {
                const longBody = 'x'.repeat(250);
                const resolvedContext = await captureLoggedResolvedContext({
                    dataBindings: {
                        content_asset: {
                            'homepage-banner': { body: longBody, enabled: true },
                        },
                    },
                });

                const sanitizedBinding = resolvedContext.dataBindings.content_asset['homepage-banner'];
                expect(sanitizedBinding.body).toBe(`${'x'.repeat(100)}… (+150 chars)`);
                expect(sanitizedBinding.enabled).toBe(true);
            });

            it('omits the dataBindings key when the resolved context has none', async () => {
                const resolvedContext = await captureLoggedResolvedContext({
                    customerGroups: { VIP: true },
                });

                expect(resolvedContext).toEqual({ customerGroups: { VIP: true } });
                expect(resolvedContext).not.toHaveProperty('dataBindings');
            });
        });
    });
});
