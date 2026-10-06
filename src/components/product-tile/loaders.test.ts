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
import { ApiError } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { loader } from './loaders';
import { fetchProductById } from '@/lib/api/products.server';
import { convertProductToProductSearchHit } from '@/lib/product/product-conversion';

vi.mock('@/lib/api/products.server', () => ({
    fetchProductById: vi.fn(),
    getDefaultProductExpansions: vi.fn((...additional: string[]) => [
        'availability',
        'images',
        'prices',
        'variations',
        ...additional,
    ]),
}));

vi.mock('@/lib/product/product-conversion', () => ({
    convertProductToProductSearchHit: vi.fn(),
}));

describe('product-tile loader', () => {
    const mockContext = {
        get: vi.fn(),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns null when productId is missing', async () => {
        const result = await loader.server({
            componentData: {},
            context: mockContext,
        });

        expect(result).toBeNull();
        expect(fetchProductById).not.toHaveBeenCalled();
    });

    test('returns null when productId is empty string', async () => {
        const result = await loader.server({
            componentData: {
                data: { productId: '  ' },
            },
            context: mockContext,
        });

        expect(result).toBeNull();
        expect(fetchProductById).not.toHaveBeenCalled();
    });

    test('fetches product and converts it to ProductSearchHit', async () => {
        mockContext.get.mockReturnValue({ currency: 'USD' });
        vi.mocked(fetchProductById).mockResolvedValue({ id: 'sku-123', name: 'Test Product' } as any);
        vi.mocked(convertProductToProductSearchHit).mockReturnValue({ productId: 'sku-123' } as any);

        const result = await loader.server({
            componentData: {
                id: 'component-1',
                typeId: 'Content.productTile',
                data: { productId: 'sku-123' },
            },
            context: mockContext,
        });

        expect(fetchProductById).toHaveBeenCalledWith(mockContext, 'sku-123', {
            allImages: true,
            perPricebook: true,
            currency: 'USD',
            expand: ['availability', 'images', 'prices', 'variations'],
        });
        expect(convertProductToProductSearchHit).toHaveBeenCalledWith({ id: 'sku-123', name: 'Test Product' });
        expect(result).toEqual({ productId: 'sku-123' });
    });

    test('omits currency from query when not in context', async () => {
        mockContext.get.mockReturnValue({ currency: undefined });
        vi.mocked(fetchProductById).mockResolvedValue({ id: 'sku-321' } as any);
        vi.mocked(convertProductToProductSearchHit).mockReturnValue({ productId: 'sku-321' } as any);

        await loader.server({
            componentData: {
                data: { productId: 'sku-321' },
            },
            context: mockContext,
        });

        expect(fetchProductById).toHaveBeenCalledWith(mockContext, 'sku-321', {
            allImages: true,
            perPricebook: true,
            expand: ['availability', 'images', 'prices', 'variations'],
        });
    });

    test('propagates 404 errors so the surface error boundary can handle them', async () => {
        mockContext.get.mockReturnValue({ currency: 'USD' });
        const error404 = new ApiError({
            status: 404,
            statusText: 'Not Found',
            headers: new Headers(),
            body: { type: 'Not Found', title: 'Product Not Found', detail: 'Product not found' },
            rawBody: '{}',
            url: 'https://api.example.com/products/missing-product',
            method: 'GET',
        });
        vi.mocked(fetchProductById).mockRejectedValue(new NormalizedApiError(error404));

        await expect(
            loader.server({
                componentData: {
                    data: { productId: 'missing-product' },
                },
                context: mockContext,
            })
        ).rejects.toThrow(NormalizedApiError);
    });

    test('propagates non-404 errors (auth, network failures)', async () => {
        mockContext.get.mockReturnValue({ currency: 'USD' });
        const error500 = new ApiError({
            status: 500,
            statusText: 'Server Error',
            headers: new Headers(),
            body: { type: 'Server Error', title: 'Server Error', detail: 'Internal server error' },
            rawBody: '{}',
            url: 'https://api.example.com/products/error-product',
            method: 'GET',
        });
        vi.mocked(fetchProductById).mockRejectedValue(new NormalizedApiError(error500));

        await expect(
            loader.server({
                componentData: {
                    data: { productId: 'error-product' },
                },
                context: mockContext,
            })
        ).rejects.toThrow(NormalizedApiError);
    });

    test('handles productId with whitespace (fetchProductById trims internally)', async () => {
        mockContext.get.mockReturnValue({ currency: 'USD' });
        vi.mocked(fetchProductById).mockResolvedValue({ id: 'sku-trimmed' } as any);
        vi.mocked(convertProductToProductSearchHit).mockReturnValue({ productId: 'sku-trimmed' } as any);

        const result = await loader.server({
            componentData: {
                data: { productId: '  sku-trimmed  ' },
            },
            context: mockContext,
        });

        // fetchProductById is called with the original ID (it handles trimming internally)
        expect(fetchProductById).toHaveBeenCalledWith(mockContext, '  sku-trimmed  ', {
            allImages: true,
            perPricebook: true,
            currency: 'USD',
            expand: ['availability', 'images', 'prices', 'variations'],
        });
        expect(result).toEqual({ productId: 'sku-trimmed' });
    });
});
