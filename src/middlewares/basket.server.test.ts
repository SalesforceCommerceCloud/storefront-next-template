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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCookie, RouterContextProvider, type MiddlewareFunction } from 'react-router';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { ApiError } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { getCookieConfig } from '@/lib/cookie-utils.server';
import { validateBasketSnapshot } from '@/lib/basket/cookie';
import createBasketMiddleware, {
    basketMetadataContext,
    basketResourceContext,
    defaultCreateSnapshot,
    destroyBasket,
    getBasket,
    getBasketSnapshot,
    type BasketSnapshot,
} from './basket.server';

// SCAPI ApiError fixture for hydration-failure tests. The middleware's missing-basket gate
// inspects `error.status`, so plain `new Error()` won't trigger the flag flip and lets us cover
// the transient-error branch.
const createApiError = (status: number) =>
    new ApiError({
        status,
        statusText: 'Test Error',
        headers: new Headers(),
        body: { type: '', title: '', detail: '' },
        rawBody: '{}',
        url: 'https://api.example.com/test',
        method: 'GET',
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

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

vi.mock('@/lib/cookie-utils.server', () => ({
    getCookieConfig: vi.fn(() => ({
        path: '/',
        sameSite: 'lax',
        secure: true,
        httpOnly: false,
        encode: (value: string) => value,
        decode: (value: string) => value,
    })),
}));

describe('basket.server middleware', () => {
    let mockRequest: Request;
    let mockContext: ReturnType<typeof createTestContext>;
    let mockNext: Parameters<MiddlewareFunction<Response>>[1];
    const createArgs = (request: Request, context: Readonly<RouterContextProvider>) =>
        createLoaderArgs(request, context, { pattern: '' });

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequest = new Request('https://example.com');
        mockContext = createTestContext();
        mockNext = vi.fn().mockResolvedValue(new Response('ok')) as unknown as Parameters<
            MiddlewareFunction<Response>
        >[1];
    });

    test('lazy mode does not load basket or set cookie by default', async () => {
        const middleware = createBasketMiddleware({ mode: 'lazy' });
        const response = (await middleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(mockNext).toHaveBeenCalledOnce();
        expect(createApiClients).not.toHaveBeenCalled();
        const basketResource = mockContext.get(basketResourceContext);
        expect(basketResource?.hydrated).toBe(false);
        expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    test('eager mode loads basket and sets cookie', async () => {
        const basket = {
            basketId: 'basket-1',
            currency: 'GBP',
            productItems: [{ productId: 'sku-1', quantity: 2 }],
        };
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockResolvedValue(basket),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager' });
        const response = (await middleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(mockNext).toHaveBeenCalledOnce();
        expect(createApiClients).toHaveBeenCalledOnce();
        const basketResource = await getBasket(mockContext);
        expect(basketResource.current).toEqual(basket);
        expect(response.headers.get('Set-Cookie')).toContain('__sfdc_basket=');
    });

    test('default (create) branch forwards expand=approaching_discounts to getOrCreateBasket (AC1/AC10)', async () => {
        // The eager/default hydration path mints-or-reads the basket via getOrCreateBasket. It must
        // opt into the same `approaching_discounts` expansion as the read branch so the banner data
        // is present regardless of which code path hydrates the basket.
        const basket = { basketId: 'basket-eager', currency: 'GBP', productItems: [] };
        const getOrCreateBasket = vi.fn().mockResolvedValue(basket);
        vi.mocked(createApiClients).mockReturnValue({
            basket: { getOrCreateBasket },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        expect(getOrCreateBasket).toHaveBeenCalledOnce();
        expect(getOrCreateBasket.mock.calls[0][0].params.query.expand).toContain('approaching_discounts');
    });

    test('custom cookie name is used in Set-Cookie header', async () => {
        const basket = { basketId: 'basket-2', currency: 'GBP', productItems: [] };
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockResolvedValue(basket),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager', cookieName: 'custom_basket' });
        const response = (await middleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(response.headers.get('Set-Cookie')).toContain('custom_basket=');
    });

    test('uses cookie snapshot when provided', async () => {
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const snapshot: BasketSnapshot = {
            basketId: 'basket-from-cookie',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        };
        const cookieHeader = await basketCookie.serialize(snapshot);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        const basketResource = mockContext.get(basketResourceContext);
        expect(basketResource?.snapshot).toEqual(snapshot);
        expect(basketResource?.hydrated).toBe(false);
        // Happy path must be silent. A regression that drops the warn down to a different message channel
        // (or moves the discard log to warn level) would otherwise go unnoticed.
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    test('discards a malformed cookie snapshot rather than exposing it to loaders', async () => {
        // A tampered or otherwise malformed cookie can deserialize to a shape-wrong object — non-string
        // basketId, non-finite counts, etc. The middleware must run the parsed value through the shared
        // shape validator so a value like `{ basketId: 'b', totalItemCount: 'oops', uniqueProductCount: 0 }`
        // doesn't reach the badge UI as `"oops items"`. The expectation here is `null`, not the malformed
        // object.
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const malformed = {
            basketId: 'basket-malformed',
            totalItemCount: 'not-a-number',
            uniqueProductCount: null,
        } as unknown as BasketSnapshot;
        const cookieHeader = await basketCookie.serialize(malformed);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        const basketResource = mockContext.get(basketResourceContext);
        expect(basketResource?.snapshot).toBeNull();
        // Logged at debug: a malformed cookie is request-controlled input. Logging at warn would let an attacker
        // rate-limit the warn channel by replaying junk cookies.
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
            'Basket: discarding malformed snapshot cookie',
            expect.objectContaining({ cookieName: '__sfdc_basket' })
        );
    });

    describe('writer ↔ validator contract', () => {
        // These tests pin the invariant that whatever `defaultCreateSnapshot` writes survives the
        // `validateBasketSnapshot` shape check unchanged. A future writer change (e.g. `bigint` counts,
        // optional `basketId`, etc.) that silently breaks the read path is the regression these guard against.
        test('defaultCreateSnapshot output is accepted by validateBasketSnapshot', () => {
            const snapshot = defaultCreateSnapshot({
                basketId: 'basket-rt',
                productItems: [
                    { productId: 'p1', quantity: 2 },
                    { productId: 'p2', quantity: 3 },
                ],
            } as Parameters<typeof defaultCreateSnapshot>[0]);
            expect(validateBasketSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
        });

        test('defaultCreateSnapshot output for an empty basket is accepted', () => {
            const snapshot = defaultCreateSnapshot({
                basketId: 'basket-empty',
                productItems: [],
            } as Parameters<typeof defaultCreateSnapshot>[0]);
            expect(validateBasketSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
        });

        test('defaultCreateSnapshot output for a basket missing basketId is rejected', () => {
            // `defaultCreateSnapshot` falls back to '' when the basket lacks an id; the validator must reject
            // that, mirroring the client cookie reader's rejection of empty-string ids.
            const snapshot = defaultCreateSnapshot({
                productItems: [{ productId: 'p1', quantity: 1 }],
            } as Parameters<typeof defaultCreateSnapshot>[0]);
            expect(validateBasketSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBeNull();
        });

        test('defaultCreateSnapshot includes lastModified from basket', () => {
            const snapshot = defaultCreateSnapshot({
                basketId: 'basket-ts',
                lastModified: '2026-06-29T10:23:44.000Z',
                productItems: [],
            } as Parameters<typeof defaultCreateSnapshot>[0]);
            expect(snapshot.lastModified).toBe('2026-06-29T10:23:44.000Z');
            expect(validateBasketSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
        });

        test('defaultCreateSnapshot uses empty string when basket lastModified is absent', () => {
            const snapshot = defaultCreateSnapshot({
                basketId: 'basket-no-ts',
                productItems: [],
            } as Parameters<typeof defaultCreateSnapshot>[0]);
            expect(snapshot.lastModified).toBe('');
            expect(validateBasketSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
        });
    });

    test('getBasketSnapshot returns null when no context is set', () => {
        const contextProvider = new RouterContextProvider();
        contextProvider.set(basketResourceContext, undefined);
        expect(getBasketSnapshot(contextProvider)).toBeNull();
    });

    test('getBasketSnapshot returns the current snapshot', () => {
        const snapshot: BasketSnapshot = {
            basketId: 'basket-snapshot',
            totalItemCount: 3,
            uniqueProductCount: 2,
            lastModified: '',
        };
        const contextProvider = new RouterContextProvider();
        contextProvider.set(basketResourceContext, {
            snapshot,
            current: null,
            hydrated: false,
            error: null,
        });

        expect(getBasketSnapshot(contextProvider)).toEqual(snapshot);
    });

    test('merges custom snapshot fields while preserving defaults', async () => {
        const basket = {
            basketId: 'basket-merge',
            currency: 'GBP',
            productItems: [{ productId: 'sku-1', quantity: 2 }],
        };
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockResolvedValue(basket),
            },
        } as any);

        const middleware = createBasketMiddleware({
            mode: 'eager',
            calculateBasketSnapshot: () => ({
                basketId: 'override-id',
                totalItemCount: 99,
                uniqueProductCount: 99,
                hasPickupItems: true,
            }),
        });
        const response = (await middleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        const snapshot = mockContext.get(basketResourceContext)?.snapshot;
        expect(snapshot).toMatchObject({
            basketId: 'basket-merge',
            totalItemCount: 2,
            uniqueProductCount: 1,
            hasPickupItems: true,
        });

        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const cookieHeader = response.headers.get('Set-Cookie') ?? '';
        const cookieSnapshot = (await basketCookie.parse(cookieHeader)) as BasketSnapshot;
        expect(cookieSnapshot).toMatchObject({
            basketId: 'basket-merge',
            totalItemCount: 2,
            uniqueProductCount: 1,
            hasPickupItems: true,
        });
    });

    test('recalculates basket when currency does not match', async () => {
        const basket = {
            basketId: 'basket-currency',
            currency: 'USD',
            productItems: [{ productId: 'sku-1', quantity: 1 }],
        };
        const recalculatedBasket = {
            ...basket,
            currency: 'GBP',
        };
        const updateBasketMock = vi.fn().mockResolvedValue({ data: recalculatedBasket });
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockResolvedValue(basket),
            },
            shopperBasketsV2: {
                updateBasket: updateBasketMock,
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        expect(updateBasketMock).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-currency' } },
            body: { currency: 'GBP' },
        });
        const basketResource = await getBasket(mockContext);
        expect(basketResource.current?.currency).toBe('GBP');
    });

    test('rethrows NormalizedApiError and flips deletion flag when hydration fails with a missing-basket status', async () => {
        // 404 from getOrCreateBasket means the create-fallback ran and SCAPI rejected the request
        // outright — the snapshot is stale beyond recovery and the cookie must be expired.
        const loadError = createApiError(404);
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockRejectedValue(loadError),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        const rejection = await getBasket(mockContext).catch((e: unknown) => e);
        expect(rejection).toBeInstanceOf(NormalizedApiError);
        expect((rejection as NormalizedApiError).cause).toBe(loadError);

        const basketResource = mockContext.get(basketResourceContext);
        expect(basketResource?.hydrated).toBe(true);
        expect(basketResource?.error).toBeInstanceOf(NormalizedApiError);
        // Dead-basket statuses null out the in-memory snapshot so getBasketSnapshot() can't keep
        // serving a stale id to other loaders in the same request.
        expect(basketResource?.snapshot).toBeNull();
        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'Basket: snapshot cookie expired due to missing basket id',
            expect.objectContaining({ status: 404 })
        );
    });

    test('rethrows NormalizedApiError but preserves snapshot/cookie when hydration fails with a transient error', async () => {
        // getOrCreateBasket already self-heals 4xx for stale baskets; a 5xx (or non-ApiError network
        // failure) bubbling here means the basket is probably still alive in SCAPI. Forcing a fresh
        // basket on every transient blip would wipe shoppers' carts during a brief outage.
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const snapshot: BasketSnapshot = {
            basketId: 'basket-existing',
            totalItemCount: 2,
            uniqueProductCount: 2,
            lastModified: '',
        };
        const cookieHeader = await basketCookie.serialize(snapshot);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        const loadError = createApiError(500);
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockRejectedValue(loadError),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        await middleware(createArgs(mockRequest, mockContext), mockNext);

        const rejection = await getBasket(mockContext).catch((e: unknown) => e);
        expect(rejection).toBeInstanceOf(NormalizedApiError);

        const basketResource = mockContext.get(basketResourceContext);
        expect(basketResource?.error).toBeInstanceOf(NormalizedApiError);
        // Snapshot is preserved so the cart badge keeps rendering and the next request can retry.
        expect(basketResource?.snapshot).toEqual(snapshot);
        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
            'Basket: snapshot cookie expired due to missing basket id',
            expect.anything()
        );
    });

    describe("getBasket with ensureBasket: 'read'", () => {
        // The 'read' mode is used by the mini-cart resource route to avoid creating a fresh
        // basket for shoppers who don't have one yet (a `getOrCreateBasket` call would mint
        // a server-side basket on first cart-sheet open, even if the shopper never adds an
        // item — bloating SCAPI traffic and the cart-sheet badge with empty baskets).

        test('skips hydration and returns the unhydrated resource when no basket id is present', async () => {
            // No cookie snapshot, no current basket — the read path must short-circuit and never
            // call SCAPI.
            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const getOrCreateBasket = vi.fn();
            const getBasketRead = vi.fn();
            vi.mocked(createApiClients).mockReturnValue({
                basket: { getOrCreateBasket },
                shopperBasketsV2: { getBasket: getBasketRead },
            } as any);

            const result = await getBasket(mockContext, { ensureBasket: 'read' });

            expect(result.current).toBeNull();
            expect(result.hydrated).toBe(false);
            expect(createApiClients).not.toHaveBeenCalled();
            expect(getOrCreateBasket).not.toHaveBeenCalled();
            expect(getBasketRead).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Basket: hydration skipped, no existing basket ID');
        });

        test('reads the existing basket via shopperBasketsV2.getBasket when a cookie snapshot exists', async () => {
            // Read mode must prefer the read-only `shopperBasketsV2.getBasket` endpoint over
            // `getOrCreateBasket` — the latter would mutate SCAPI state by minting a basket
            // when called against a stale id. The handler also unwraps the SCAPI client's
            // `{ data }` envelope, so a regression that drops the destructure would store
            // the wrapper object as the basket.
            const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
            const basketCookie = createCookie('__sfdc_basket', cookieConfig);
            const snapshot: BasketSnapshot = {
                basketId: 'basket-existing',
                totalItemCount: 1,
                uniqueProductCount: 1,
                lastModified: '',
            };
            const cookieHeader = await basketCookie.serialize(snapshot);
            mockRequest = new Request('https://example.com', {
                headers: { Cookie: cookieHeader },
            });

            const fetchedBasket = {
                basketId: 'basket-existing',
                currency: 'GBP',
                productItems: [{ productId: 'sku-1', quantity: 1 }],
            };
            const getBasketRead = vi.fn().mockResolvedValue({ data: fetchedBasket });
            const getOrCreateBasket = vi.fn();
            vi.mocked(createApiClients).mockReturnValue({
                basket: { getOrCreateBasket },
                shopperBasketsV2: { getBasket: getBasketRead },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const result = await getBasket(mockContext, { ensureBasket: 'read' });

            expect(getBasketRead).toHaveBeenCalledWith({
                params: {
                    path: { basketId: 'basket-existing' },
                    query: { expand: ['approaching_discounts'] },
                },
            });
            expect(getOrCreateBasket).not.toHaveBeenCalled();
            expect(result.current).toEqual(fetchedBasket);
            expect(result.hydrated).toBe(true);
        });

        test('sends expand=approaching_discounts on the read-branch getBasket (AC1/AC10)', async () => {
            // AC1/AC10: the single shared basket fetch opts into the SCAPI `approaching_discounts`
            // expansion so `basket.approachingDiscounts` is populated for every surface without an
            // extra round-trip. This asserts the read branch forwards the expand query.
            const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
            const basketCookie = createCookie('__sfdc_basket', cookieConfig);
            const snapshot: BasketSnapshot = {
                basketId: 'basket-existing',
                totalItemCount: 1,
                uniqueProductCount: 1,
                lastModified: '',
            };
            const cookieHeader = await basketCookie.serialize(snapshot);
            mockRequest = new Request('https://example.com', { headers: { Cookie: cookieHeader } });

            const getBasketRead = vi.fn().mockResolvedValue({ data: { basketId: 'basket-existing' } });
            vi.mocked(createApiClients).mockReturnValue({
                basket: { getOrCreateBasket: vi.fn() },
                shopperBasketsV2: { getBasket: getBasketRead },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);
            await getBasket(mockContext, { ensureBasket: 'read' });

            expect(getBasketRead).toHaveBeenCalledOnce();
            expect(getBasketRead.mock.calls[0][0].params.query.expand).toContain('approaching_discounts');
        });

        test('returns the cached basket without re-fetching when already loaded', async () => {
            // Same invariant as the default path: a basket already in the resource short-circuits
            // before any SCAPI call. Pinning this here as well so 'read' mode inherits the cache
            // behavior — otherwise multiple readers in the same request (cart-sheet panel +
            // basket-products loader) would each issue an extra getBasket call.
            const basket = {
                basketId: 'basket-cached',
                currency: 'GBP',
                productItems: [{ productId: 'sku-1', quantity: 1 }],
            };
            vi.mocked(createApiClients).mockReturnValue({
                basket: {
                    getOrCreateBasket: vi.fn().mockResolvedValue(basket),
                },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'eager' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const getBasketRead = vi.fn();
            vi.mocked(createApiClients).mockReturnValue({
                shopperBasketsV2: { getBasket: getBasketRead },
            } as any);

            const result = await getBasket(mockContext, { ensureBasket: 'read' });

            expect(result.current).toEqual(basket);
            expect(getBasketRead).not.toHaveBeenCalled();
        });

        test('falls back to getOrCreateBasket when the read fetch fails (e.g. stale snapshot id)', async () => {
            // A snapshot cookie can outlive its server-side basket — guest baskets expire after
            // their TTL. In that case `shopperBasketsV2.getBasket` returns 404; the middleware
            // must mint a fresh basket via `getOrCreateBasket` rather than surfacing the read
            // error, so the mini-cart resource route degrades to "fresh basket" instead of
            // throwing a NormalizedApiError into the panel.
            const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
            const basketCookie = createCookie('__sfdc_basket', cookieConfig);
            const snapshot: BasketSnapshot = {
                basketId: 'basket-stale',
                totalItemCount: 1,
                uniqueProductCount: 1,
                lastModified: '',
            };
            const cookieHeader = await basketCookie.serialize(snapshot);
            mockRequest = new Request('https://example.com', {
                headers: { Cookie: cookieHeader },
            });

            const freshBasket = {
                basketId: 'basket-fresh',
                currency: 'GBP',
                productItems: [],
            };
            const getOrCreateBasket = vi.fn().mockResolvedValue(freshBasket);
            vi.mocked(createApiClients).mockReturnValue({
                basket: { getOrCreateBasket },
                shopperBasketsV2: {
                    getBasket: vi.fn().mockRejectedValue(new Error('not found')),
                },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const result = await getBasket(mockContext, { ensureBasket: 'read' });

            expect(getOrCreateBasket).toHaveBeenCalledWith({
                params: { path: { basketId: 'basket-stale' }, query: { expand: ['approaching_discounts'] } },
                body: { currency: 'GBP' },
            });
            expect(result.current).toEqual(freshBasket);
            expect(result.hydrated).toBe(true);
            expect(result.error).toBeNull();
        });

        test('wraps and rethrows as NormalizedApiError; flips deletion flag when fallback returns a missing-basket status', async () => {
            // The fallback exists to recover from a stale snapshot, not to swallow real outages.
            // When `getOrCreateBasket` returns a missing-basket status (404), the caller must see a
            // NormalizedApiError so the resource route's catch can degrade the mini-cart, AND the
            // cookie must be expired so subsequent requests don't keep replaying the stale id.
            const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
            const basketCookie = createCookie('__sfdc_basket', cookieConfig);
            const snapshot: BasketSnapshot = {
                basketId: 'basket-stale',
                totalItemCount: 1,
                uniqueProductCount: 1,
                lastModified: '',
            };
            const cookieHeader = await basketCookie.serialize(snapshot);
            mockRequest = new Request('https://example.com', {
                headers: { Cookie: cookieHeader },
            });

            const fallbackError = createApiError(404);
            vi.mocked(createApiClients).mockReturnValue({
                basket: {
                    getOrCreateBasket: vi.fn().mockRejectedValue(fallbackError),
                },
                shopperBasketsV2: {
                    getBasket: vi.fn().mockRejectedValue(new Error('not found')),
                },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const rejection = await getBasket(mockContext, { ensureBasket: 'read' }).catch((e: unknown) => e);
            expect(rejection).toBeInstanceOf(NormalizedApiError);
            expect((rejection as NormalizedApiError).cause).toBe(fallbackError);

            const basketResource = mockContext.get(basketResourceContext);
            expect(basketResource?.hydrated).toBe(true);
            expect(basketResource?.error).toBeInstanceOf(NormalizedApiError);
            expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(true);
        });

        test('preserves snapshot and cookie when both read and fallback fail with a transient error', async () => {
            // Common outage shape: read fails (cache miss / transient 404 path) and fallback fails
            // with 5xx. The basket may still be alive in SCAPI — clearing the cookie here would wipe
            // the cart for every shopper during a brief upstream blip.
            const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
            const basketCookie = createCookie('__sfdc_basket', cookieConfig);
            const snapshot: BasketSnapshot = {
                basketId: 'basket-existing',
                totalItemCount: 1,
                uniqueProductCount: 1,
                lastModified: '',
            };
            const cookieHeader = await basketCookie.serialize(snapshot);
            mockRequest = new Request('https://example.com', {
                headers: { Cookie: cookieHeader },
            });

            vi.mocked(createApiClients).mockReturnValue({
                basket: {
                    getOrCreateBasket: vi.fn().mockRejectedValue(createApiError(503)),
                },
                shopperBasketsV2: {
                    getBasket: vi.fn().mockRejectedValue(new Error('not found')),
                },
            } as any);

            const middleware = createBasketMiddleware({ mode: 'lazy' });
            await middleware(createArgs(mockRequest, mockContext), mockNext);

            const rejection = await getBasket(mockContext, { ensureBasket: 'read' }).catch((e: unknown) => e);
            expect(rejection).toBeInstanceOf(NormalizedApiError);

            const basketResource = mockContext.get(basketResourceContext);
            expect(basketResource?.snapshot).toEqual(snapshot);
            expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
        });
    });

    test('marks basket for deletion and expires cookie', async () => {
        const middleware = createBasketMiddleware({ mode: 'lazy' });
        const next = vi.fn().mockImplementation(async () => {
            destroyBasket(mockContext);
            await Promise.resolve();
            return new Response('ok');
        }) as unknown as Parameters<MiddlewareFunction<Response>>[1];

        const response = (await middleware(createArgs(mockRequest, mockContext), next)) as Response;

        const metadata = mockContext.get(basketMetadataContext);
        expect(metadata?.basketMarkedForDeletion).toBe(true);
        expect(response.headers.get('Set-Cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });

    test('lazy mode: missing-basket failure during a loader expires the cookie via response phase', async () => {
        // Reproduces the bug from the AC: a route loader (e.g. resource.basket-products.ts) calls
        // getBasket() while a stale __sfdc_basket cookie is in the request. The fallback returns a
        // missing-basket status (404), so the catch block flips the deletion flag and the response
        // phase serializes an expired Set-Cookie. Without the fix, the stale snapshot keeps showing
        // wrong counts on the badge.
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const snapshot: BasketSnapshot = {
            basketId: 'basket-stale',
            totalItemCount: 3,
            uniqueProductCount: 3,
            lastModified: '',
        };
        const cookieHeader = await basketCookie.serialize(snapshot);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockRejectedValue(createApiError(404)),
            },
            shopperBasketsV2: {
                getBasket: vi.fn().mockRejectedValue(new Error('not found')),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        const next = vi.fn().mockImplementation(async () => {
            // Route loader path: swallow the error (the route's <Await errorElement> renders the
            // failure UI) so the middleware can still run its response phase.
            await getBasket(mockContext, { ensureBasket: 'read' }).catch(() => undefined);
            return new Response('ok');
        }) as unknown as Parameters<MiddlewareFunction<Response>>[1];

        const response = (await middleware(createArgs(mockRequest, mockContext), next)) as Response;

        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(true);
        expect(response.headers.get('Set-Cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });

    test('lazy mode: transient hydration failure leaves the cookie intact', async () => {
        // Counterpart to the missing-basket case above: a 5xx outage must not expire the cookie. The
        // basket is probably still alive in SCAPI; the next request should retry against the same id.
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const snapshot: BasketSnapshot = {
            basketId: 'basket-existing',
            totalItemCount: 2,
            uniqueProductCount: 2,
            lastModified: '',
        };
        const cookieHeader = await basketCookie.serialize(snapshot);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockRejectedValue(createApiError(500)),
            },
            shopperBasketsV2: {
                getBasket: vi.fn().mockRejectedValue(new Error('boom')),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        const next = vi.fn().mockImplementation(async () => {
            await getBasket(mockContext, { ensureBasket: 'read' }).catch(() => undefined);
            return new Response('ok');
        }) as unknown as Parameters<MiddlewareFunction<Response>>[1];

        const response = (await middleware(createArgs(mockRequest, mockContext), next)) as Response;

        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
        // No Set-Cookie at all when the basket isn't loaded and the flag isn't flipped — keeps the
        // existing client-side cookie in place for the retry.
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
            'Basket: snapshot cookie expired due to missing basket id',
            expect.anything()
        );
    });

    test('eager mode: hydration failure surfaces NormalizedApiError to the caller', async () => {
        // Eager mode awaits getBasket() before next() — when both SCAPI calls fail with a dead
        // status, the throw propagates out of the middleware and the deletion flag is set as a side
        // effect of the catch block. (Routes that use eager mode are responsible for catching at
        // the route level — outside the scope of this fix; tracked as future work.)
        const cookieConfig = vi.mocked(getCookieConfig).mock.results[0]?.value;
        const basketCookie = createCookie('__sfdc_basket', cookieConfig);
        const snapshot: BasketSnapshot = {
            basketId: 'basket-stale',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        };
        const cookieHeader = await basketCookie.serialize(snapshot);
        mockRequest = new Request('https://example.com', {
            headers: { Cookie: cookieHeader },
        });

        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockRejectedValue(createApiError(404)),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager' });
        const rejection = await Promise.resolve(middleware(createArgs(mockRequest, mockContext), mockNext)).catch(
            (e: unknown) => e
        );

        expect(rejection).toBeInstanceOf(NormalizedApiError);
        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(true);
    });

    test('in-request retry: a later successful hydration clears a flag set by an earlier failure', async () => {
        // React Router can run multiple loaders against the same request context, and getBasket()
        // does not memoize a failed hydration (the resource ends with current=null, so subsequent
        // callers re-enter the try block). If an earlier call fails with a missing-basket status and a
        // later call succeeds — e.g. a retry, or a follow-up loader hitting a different code path —
        // the success branch must clear basketMarkedForDeletion. Otherwise the response phase
        // expires the cookie that was just refreshed and the badge keeps lying.
        const freshBasket = {
            basketId: 'basket-fresh',
            currency: 'USD',
            productItems: [{ productId: 'sku-1', quantity: 1 }],
        };
        const getOrCreateBasket = vi
            .fn()
            // First call: fails with a missing-basket status, flips the flag.
            .mockRejectedValueOnce(createApiError(404))
            // Second call: succeeds, must clear the flag.
            .mockResolvedValueOnce(freshBasket);
        vi.mocked(createApiClients).mockReturnValue({
            basket: { getOrCreateBasket },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'lazy' });
        const next = vi.fn().mockImplementation(async () => {
            await getBasket(mockContext).catch(() => undefined);
            expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(true);
            await getBasket(mockContext);
            return new Response('ok');
        }) as unknown as Parameters<MiddlewareFunction<Response>>[1];

        const response = (await middleware(createArgs(mockRequest, mockContext), next)) as Response;

        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('__sfdc_basket=');
        expect(setCookie).not.toContain('Expires=Thu, 01 Jan 1970');
    });

    test('hydration success leaves basketMarkedForDeletion false (no over-clearing)', async () => {
        // Negative test: the success path of getBasket() must not flip the flag. A regression that
        // unconditionally set basketMarkedForDeletion would erase every shopper's cookie on every
        // request and tank the SSR cart-badge optimization the cookie exists to support.
        const basket = {
            basketId: 'basket-ok',
            currency: 'GBP',
            productItems: [{ productId: 'sku-1', quantity: 1 }],
        };
        vi.mocked(createApiClients).mockReturnValue({
            basket: {
                getOrCreateBasket: vi.fn().mockResolvedValue(basket),
            },
        } as any);

        const middleware = createBasketMiddleware({ mode: 'eager' });
        const response = (await middleware(createArgs(mockRequest, mockContext), mockNext)) as Response;

        expect(mockContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
        // Sanity check: the response phase wrote the fresh basket cookie, not an expired one.
        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('__sfdc_basket=');
        expect(setCookie).not.toContain('Expires=Thu, 01 Jan 1970');
    });
});
