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
import { ApiError } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { NormalizedApiError } from './normalized-api-error';
import { fetchCategory, fetchCategories, fetchCategoriesByIds } from './categories.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('categories.server', () => {
    const mockGetCategory = vi.fn();
    const mockGetCategories = vi.fn();
    const mockClients = {
        shopperProducts: {
            getCategory: mockGetCategory,
            getCategories: mockGetCategories,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue(mockClients as never);
    });

    describe('fetchCategory', () => {
        it('should return category data on success', async () => {
            const mockCategory = { id: 'root', name: 'Root Category' };
            mockGetCategory.mockResolvedValue({ data: mockCategory });

            const context = createTestContext();
            const result = await fetchCategory(context, 'root', 1);

            expect(result).toEqual(mockCategory);
            expect(mockGetCategory).toHaveBeenCalledWith({
                params: {
                    path: { id: 'root' },
                    query: { levels: 1 },
                },
            });
        });

        it('should throw NormalizedApiError when API call fails with ApiError', async () => {
            const apiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Not Found',
                    detail: 'Category not found',
                },
                rawBody: JSON.stringify({ detail: 'Category not found' }),
                url: 'https://api.example.com/categories/root',
                method: 'GET',
            });

            mockGetCategory.mockRejectedValue(apiError);

            const context = createTestContext();
            await expect(fetchCategory(context, 'root', 1)).rejects.toThrow(NormalizedApiError);
            await expect(fetchCategory(context, 'root', 1)).rejects.toThrow('Category not found');
        });

        it('should throw NormalizedApiError when API call fails with non-API error', async () => {
            mockGetCategory.mockRejectedValue(new TypeError('Network failure'));

            const context = createTestContext();
            await expect(fetchCategory(context, 'root', 1)).rejects.toThrow(NormalizedApiError);
            await expect(fetchCategory(context, 'root', 1)).rejects.toThrow('Network failure');
        });

        it('should log operation context when API call fails', async () => {
            const mockLogger = {
                error: vi.fn(),
                warn: vi.fn(),
                info: vi.fn(),
                debug: vi.fn(),
            };

            const { getLogger } = await import('@/lib/logger.server');
            vi.mocked(getLogger).mockReturnValue(mockLogger as never);

            const apiError = new ApiError({
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/server-error',
                    title: 'Server Error',
                    detail: 'Server error',
                },
                rawBody: JSON.stringify({ detail: 'Server error' }),
                url: 'https://api.example.com/categories/mens',
                method: 'GET',
            });

            mockGetCategory.mockRejectedValue(apiError);

            const context = createTestContext();
            await fetchCategory(context, 'mens', 2).catch(() => {});

            expect(mockLogger.error).toHaveBeenCalledWith(
                'shopperProducts.getCategory failed',
                expect.objectContaining({ categoryId: 'mens', levels: 2 })
            );
        });

        it('should use default levels of 0', async () => {
            const mockCategory = { id: 'test', name: 'Test' };
            mockGetCategory.mockResolvedValue({ data: mockCategory });

            const context = createTestContext();
            await fetchCategory(context, 'test');

            expect(mockGetCategory).toHaveBeenCalledWith({
                params: {
                    path: { id: 'test' },
                    query: { levels: 0 },
                },
            });
        });
    });

    describe('fetchCategories', () => {
        it('should return child categories', async () => {
            const mockCategory = {
                id: 'root',
                name: 'Root',
                categories: [
                    { id: 'cat1', name: 'Category 1' },
                    { id: 'cat2', name: 'Category 2' },
                ],
            };
            mockGetCategory.mockResolvedValue({ data: mockCategory });

            const context = createTestContext();
            const result = await fetchCategories(context, 'root', 1);

            expect(result).toEqual(mockCategory.categories);
        });

        it('should return empty array when parent has no categories', async () => {
            const mockCategory = { id: 'root', name: 'Root' };
            mockGetCategory.mockResolvedValue({ data: mockCategory });

            const context = createTestContext();
            const result = await fetchCategories(context, 'root', 1);

            expect(result).toEqual([]);
        });

        it('should propagate NormalizedApiError from fetchCategory', async () => {
            const apiError = new ApiError({
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/server-error',
                    title: 'Server Error',
                    detail: 'Failed',
                },
                rawBody: JSON.stringify({ detail: 'Failed' }),
                url: 'https://api.example.com/categories/root',
                method: 'GET',
            });

            mockGetCategory.mockRejectedValue(apiError);

            const context = createTestContext();
            await expect(fetchCategories(context, 'root', 1)).rejects.toThrow(NormalizedApiError);
        });
    });

    describe('fetchCategoriesByIds', () => {
        it('should fetch all ids in a single getCategories call and flatten the result', async () => {
            const categories = [
                { id: 'cat1', name: 'Category 1', categories: [{ id: 'cat1-1' }] },
                { id: 'cat2', name: 'Category 2', categories: [{ id: 'cat2-1' }] },
            ];
            mockGetCategories.mockResolvedValue({ data: { data: categories, limit: 2, total: 2 } });

            const context = createTestContext();
            const result = await fetchCategoriesByIds(context, ['cat1', 'cat2'], 2);

            expect(result).toEqual(categories);
            expect(mockGetCategories).toHaveBeenCalledTimes(1);
            expect(mockGetCategories).toHaveBeenCalledWith({
                params: {
                    query: { ids: ['cat1', 'cat2'], levels: 2 },
                },
            });
        });

        it('should not call SCAPI and return an empty array when there are no ids', async () => {
            const context = createTestContext();
            const result = await fetchCategoriesByIds(context, [], 2);

            expect(result).toEqual([]);
            expect(mockGetCategories).not.toHaveBeenCalled();
        });

        it('should issue a single request for exactly 50 ids', async () => {
            const ids = Array.from({ length: 50 }, (_, i) => `cat${i}`);
            mockGetCategories.mockResolvedValue({
                data: { data: ids.map((id) => ({ id })), limit: 50, total: 50 },
            });

            const context = createTestContext();
            const result = await fetchCategoriesByIds(context, ids, 2);

            expect(result).toHaveLength(50);
            expect(mockGetCategories).toHaveBeenCalledTimes(1);
            expect(mockGetCategories).toHaveBeenCalledWith({
                params: { query: { ids, levels: 2 } },
            });
        });

        it('should chunk ids into requests of at most 50', async () => {
            const ids = Array.from({ length: 51 }, (_, i) => `cat${i}`);
            mockGetCategories.mockImplementation(({ params }) => {
                const chunkIds = params.query.ids as string[];
                return Promise.resolve({
                    data: { data: chunkIds.map((id) => ({ id })), limit: chunkIds.length, total: chunkIds.length },
                });
            });

            const context = createTestContext();
            const result = await fetchCategoriesByIds(context, ids, 2);

            expect(mockGetCategories).toHaveBeenCalledTimes(2);
            expect((mockGetCategories.mock.calls[0][0].params.query.ids as string[]).length).toBe(50);
            expect((mockGetCategories.mock.calls[1][0].params.query.ids as string[]).length).toBe(1);
            expect(result).toHaveLength(51);
        });

        it('should return categories regardless of the order the API responds in', async () => {
            // SCAPI does not guarantee response order matches the requested id order.
            mockGetCategories.mockResolvedValue({
                data: {
                    data: [
                        { id: 'cat2', name: 'Category 2' },
                        { id: 'cat1', name: 'Category 1' },
                    ],
                    limit: 2,
                    total: 2,
                },
            });

            const context = createTestContext();
            const result = await fetchCategoriesByIds(context, ['cat1', 'cat2'], 2);

            expect(result.map((category) => category.id)).toEqual(['cat2', 'cat1']);
        });

        it('should throw NormalizedApiError when a request fails', async () => {
            mockGetCategories.mockRejectedValue(new TypeError('boom'));

            const context = createTestContext();
            await expect(fetchCategoriesByIds(context, ['cat1'], 2)).rejects.toThrow(NormalizedApiError);
            await expect(fetchCategoriesByIds(context, ['cat1'], 2)).rejects.toThrow('boom');
        });

        it('should log operation context when a request fails', async () => {
            const mockLogger = {
                error: vi.fn(),
                warn: vi.fn(),
                info: vi.fn(),
                debug: vi.fn(),
            };
            const { getLogger } = await import('@/lib/logger.server');
            vi.mocked(getLogger).mockReturnValue(mockLogger as never);

            mockGetCategories.mockRejectedValue(new TypeError('boom'));

            const context = createTestContext();
            await fetchCategoriesByIds(context, ['cat1'], 2).catch(() => {});

            expect(mockLogger.error).toHaveBeenCalledWith(
                'shopperProducts.getCategories failed',
                expect.objectContaining({ ids: ['cat1'], levels: 2 })
            );
        });
    });
});
