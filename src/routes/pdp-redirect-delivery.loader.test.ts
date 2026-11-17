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
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError, AuthTokenInvalidError, type ShopperProducts } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { resolveSelectedStore } from '@/extensions/store-locator/lib/resolve-selected-store.server';

const mocks = vi.hoisted(() => ({
    product: vi.fn(),
    products: vi.fn(),
    availability: vi.fn(),
    redirect: vi.fn(),
    fallback: vi.fn(),
}));
vi.mock('@/lib/api/products.server', () => ({ fetchProductById: mocks.product, fetchProductsByIds: mocks.products }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperAvailability: { getAvailability: mocks.availability } }),
}));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }));
vi.mock('@/lib/seo/canonical-redirect.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/seo/canonical-redirect.server')>()),
    getCanonicalProductRedirect: mocks.redirect,
}));
vi.mock('@/lib/seo/route-fallback.server', () => ({ attemptRouteSeoFallback: mocks.fallback }));
// @sfdc-extension-line SFDC_EXT_BOPIS
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({ resolveSelectedStore: vi.fn() }));
vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/api/search.server', () => ({ fetchSearchProducts: vi.fn(() => Promise.resolve({ hits: [] })) }));
vi.mock('@/lib/product/recommendations.server', () => ({
    fetchProductRecommendations: vi.fn(() => Promise.resolve({ recs: [] })),
}));
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
vi.mock('@/extensions/ratings-reviews/lib/api/reviews.server', () => ({
    getReviewsSummary: vi.fn(() => Promise.resolve({})),
    getReviews: vi.fn(() => Promise.resolve({})),
    getWriteReviewForm: vi.fn(() => Promise.resolve({})),
}));
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
// @sfdc-extension-line SFDC_EXT_PRODUCT_CONTENT
vi.mock('@/extensions/product-content/lib/pdp-sections', () => ({ resolvePdpSections: () => [] }));

// VERTICAL (optional, e.g. cosmetic) selects the exact overlay loader under test.
const vertical = process.env.VERTICAL ?? 'fashion';
type LoaderModule = {
    loader: (args: LoaderFunctionArgs) => Promise<{
        product: ShopperProducts.schemas['Product'];
        pickupInventory?: Promise<unknown>;
    }>;
};
const overlays = import.meta.glob<LoaderModule>('../verticals/*/routes/_app.p.$.tsx');
const overlay = overlays[`../verticals/${vertical}/routes/_app.p.$.tsx`];
const canonical = import.meta.glob<LoaderModule>('./_app.p.$.tsx');
const { loader } = overlay ? await overlay() : await canonical['./_app.p.$.tsx']();

describe('PDP redirect-before-delivery inventory', () => {
    const inventory = { id: 'site', ats: 7, stockLevel: 7, orderable: true };
    const product: ShopperProducts.schemas['Product'] = {
        id: 'master',
        type: { master: true },
        variationAttributes: [{ id: 'size', values: [{ value: 'S' }, { value: 'L' }] }],
        variants: [
            { productId: 'small', variationValues: { size: 'S' } },
            { productId: 'large', variationValues: { size: 'L' } },
        ],
    };
    const context = {
        get: vi.fn((key) => {
            if (key === appConfigContext) return { commerce: { api: {} }, sitePreferences: {} };
            if (key === siteContext) return { currency: 'USD', site: { id: 'test-site' }, locale: { id: 'en-US' } };
            return undefined;
        }),
        set: vi.fn(),
    } as unknown as Readonly<RouterContextProvider>;
    const request = new Request('https://example.com/p/master?size=S');
    const args = {
        request,
        context,
        params: { siteId: 'test-site', localeId: 'en-US', '*': 'master' },
        url: new URL(request.url),
        pattern: '/p/*',
    };
    const apiError = (status: number) =>
        new NormalizedApiError(
            new ApiError({
                status,
                statusText: 'Failure',
                headers: new Headers(),
                body: { type: 'Failure', title: 'Failure', detail: 'failure' },
                rawBody: '{}',
                url: 'https://api.example.com/products/master',
                method: 'GET',
            })
        );

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.redirect.mockReset();
        mocks.fallback.mockReset().mockResolvedValue(undefined);
        mocks.product.mockReset().mockResolvedValue(product);
        mocks.products.mockReset().mockResolvedValue([{ id: 'small', inventory }]);
        mocks.availability
            .mockReset()
            .mockResolvedValue({ data: { data: [{ id: 'small', inventories: [inventory] }] } });
        // @sfdc-extension-line SFDC_EXT_BOPIS
        vi.mocked(resolveSelectedStore).mockResolvedValue({ selectedStoreInfo: null, store: null, error: null });
    });

    test('throws the original 301 without requesting missing selected-SKU inventory', async () => {
        const redirect = new Response(null, { status: 301, headers: { Location: '/product/master?size=S' } });
        mocks.redirect.mockReturnValueOnce(redirect);
        await expect(loader(args)).rejects.toBe(redirect);
        expect(mocks.product).toHaveBeenCalledTimes(1);
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
        expect(mocks.redirect).toHaveBeenCalledWith(expect.objectContaining({ product }));
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('seeds canonical missing-SKU inventory before held store selection resolves', async () => {
        let release!: (value: Awaited<ReturnType<typeof resolveSelectedStore>>) => void;
        vi.mocked(resolveSelectedStore).mockReturnValueOnce(
            new Promise((resolve) => {
                release = resolve;
            })
        );
        const pending = loader(args);
        try {
            await vi.waitFor(() => expect(mocks.availability).toHaveBeenCalledTimes(1));
            const result = await pending;
            expect(result.product.variants?.[0]).toEqual(expect.objectContaining({ productId: 'small', inventory }));
            expect(result.pickupInventory).toBeInstanceOf(Promise);
            expect(mocks.availability).toHaveBeenCalledExactlyOnceWith({
                params: { query: { productIds: ['small'] } },
            });
            expect(mocks.products).not.toHaveBeenCalled();
        } finally {
            release({ selectedStoreInfo: null, store: null, error: null });
            await (await pending).pickupInventory;
        }
    });

    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('reuses direct-SKU inventory without a supplemental request', async () => {
        const sku = { id: 'small', inventory };
        mocks.product.mockResolvedValueOnce(sku);
        expect((await loader(args)).product).toEqual(sku);
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
    });

    test('prioritizes a missing product over a potential canonical redirect', async () => {
        mocks.product.mockResolvedValueOnce(null);
        mocks.redirect.mockReturnValueOnce(new Response(null, { status: 301 }));
        await expect(loader(args)).rejects.toMatchObject({ status: 404 });
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
    });

    test('preserves primary 404 fallback before canonical or supplemental work', async () => {
        mocks.product.mockRejectedValueOnce(apiError(404));
        const fallback = new Response(null, { status: 302, headers: { Location: '/p/current' } });
        mocks.fallback.mockResolvedValueOnce(fallback);
        expect(await loader(args)).toBe(fallback);
        expect(mocks.fallback).toHaveBeenCalledExactlyOnceWith(context, request);
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
    });

    test('preserves primary auth sentinel identity', async () => {
        const sentinel = new AuthTokenInvalidError('expired');
        mocks.product.mockRejectedValueOnce(sentinel);
        await expect(loader(args)).rejects.toBe(sentinel);
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
        expect(mocks.fallback).not.toHaveBeenCalled();
    });

    test.each([403, 429, 500])('preserves primary status %s', async (status) => {
        mocks.product.mockRejectedValueOnce(apiError(status));
        await expect(loader(args)).rejects.toMatchObject({ status });
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.products).not.toHaveBeenCalled();
        expect(mocks.availability).not.toHaveBeenCalled();
        expect(mocks.fallback).not.toHaveBeenCalled();
    });

    test('preserves supplemental auth sentinel identity', async () => {
        const sentinel = new AuthTokenInvalidError('expired');
        mocks.availability.mockRejectedValueOnce(sentinel);
        await expect(loader(args)).rejects.toBe(sentinel);
        expect(mocks.fallback).not.toHaveBeenCalled();
    });

    test('normalizes supplemental 401 into the auth sentinel', async () => {
        mocks.availability.mockRejectedValueOnce(apiError(401).cause);
        await expect(loader(args)).rejects.toBeInstanceOf(AuthTokenInvalidError);
        expect(mocks.fallback).not.toHaveBeenCalled();
    });

    test.each([
        apiError(404),
        new Error('network'),
    ])('keeps product usable on non-auth supplemental failure %s', async (error) => {
        mocks.availability.mockRejectedValueOnce(error);
        expect((await loader(args)).product).toBe(product);
        expect(mocks.fallback).not.toHaveBeenCalled();
    });
});
