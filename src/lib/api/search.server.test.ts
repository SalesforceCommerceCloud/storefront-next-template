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
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { fetchSearchProducts } from './search.server';
import { ApiError } from '@/scapi';
import { NormalizedApiError } from './normalized-api-error';

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

describe('', () => {
    describe('fetchSearchProducts', () => {
        const mockProductSearch = vi.fn();
        const mockClients = {
            shopperSearch: {
                productSearch: mockProductSearch,
            },
            use: vi.fn(),
        };

        beforeEach(() => {
            vi.clearAllMocks();
            vi.mocked(createApiClients).mockReturnValue(mockClients as never);
        });

        it('should call productSearch with defaults and return data', async () => {
            const mockContext = createTestContext({
                currency: 'EUR',
                appConfig: {
                    commerce: {
                        defaultCurrency: 'EUR',
                    },
                } as never,
            });

            const mockResult = { hits: [], total: 0 };
            mockProductSearch.mockResolvedValue({ data: mockResult });

            const result = await fetchSearchProducts(mockContext, { currency: 'EUR' });

            expect(createApiClients).toHaveBeenCalledWith(mockContext);
            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        q: '',
                        sort: 'best-matches',
                        limit: 24,
                        offset: 0,
                        expand: ['promotions', 'variations', 'prices', 'images', 'page_meta_tags', 'custom_properties'],
                        refine: ['orderable_only=true'],
                        currency: 'EUR',
                        allImages: true,
                        allVariationProperties: true,
                        perPricebook: true,
                        imgTypes: 'medium,swatch',
                    }),
                },
            });
            expect(result).toEqual(mockResult);
        });

        it('should build refine without duplicates', async () => {
            const mockContext = createTestContext({
                appConfig: {
                    commerce: {
                        sites: [
                            {
                                defaultCurrency: 'USD',
                            },
                        ],
                    },
                } as never,
            });

            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                refine: ['cgid=mens', 'color=blue', 'cgid=mens'],
                currency: 'USD',
            });

            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        refine: expect.arrayContaining(['cgid=mens', 'color=blue']),
                    }),
                },
            });

            const refineArg = mockProductSearch.mock.calls[0][0].params.query.refine as unknown as string[];
            expect(new Set(refineArg).size).toBe(refineArg.length);
        });

        it('should use default refine when refine provided', async () => {
            const mockContext = createTestContext();
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                q: 'dress',
                refine: [],
                currency: 'USD',
            });

            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        refine: ['orderable_only=true'],
                    }),
                },
            });
        });

        it('should allow explicit currency to override config currency', async () => {
            const mockContext = createTestContext({
                currency: 'JPY',
                appConfig: {
                    commerce: {
                        sites: [
                            {
                                defaultCurrency: 'EUR',
                            },
                        ],
                    },
                } as never,
            });

            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                q: 'shirt',
                currency: 'JPY',
            });

            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        q: 'shirt',
                        currency: 'JPY',
                    }),
                },
            });
        });

        it('should pass through non-default query parameters', async () => {
            const mockContext = createTestContext();
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                q: 'boots',
                sort: 'price-low-to-high',
                limit: 12,
                offset: 24,
                expand: ['prices'],
                allImages: false,
                allVariationProperties: false,
                perPricebook: false,
                currency: 'USD',
            });

            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        q: 'boots',
                        sort: 'price-low-to-high',
                        limit: 12,
                        offset: 24,
                        expand: ['prices'],
                        refine: ['orderable_only=true'],
                        currency: expect.any(String),
                        allImages: false,
                        allVariationProperties: false,
                        perPricebook: false,
                    }),
                },
            });
        });

        it('should throw NormalizedApiError when productSearch fails with ApiError', async () => {
            const mockContext = createTestContext();
            const apiError = new ApiError({
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/unavailable',
                    title: 'Service Unavailable',
                    detail: 'Search service is down',
                },
                rawBody: JSON.stringify({ detail: 'Search service is down' }),
                url: 'https://api.example.com/search',
                method: 'GET',
            });

            mockProductSearch.mockRejectedValue(apiError);

            await expect(fetchSearchProducts(mockContext, { q: 'x' })).rejects.toThrow(NormalizedApiError);
            await expect(fetchSearchProducts(mockContext, { q: 'x' })).rejects.toThrow('Search service is down');
        });

        it('should throw NormalizedApiError when productSearch fails with non-API error', async () => {
            const mockContext = createTestContext();
            mockProductSearch.mockRejectedValue(new TypeError('Network failure'));

            await expect(fetchSearchProducts(mockContext, { q: 'x' })).rejects.toThrow(NormalizedApiError);
            await expect(fetchSearchProducts(mockContext, { q: 'x' })).rejects.toThrow('Network failure');
        });

        it('should log operation context when productSearch fails', async () => {
            const mockContext = createTestContext();
            const { getLogger } = await import('@/lib/logger.server');
            const mockLogger = {
                error: vi.fn(),
                warn: vi.fn(),
                info: vi.fn(),
                debug: vi.fn(),
            };
            vi.mocked(getLogger).mockReturnValue(mockLogger);

            mockProductSearch.mockRejectedValue(new Error('boom'));

            await fetchSearchProducts(mockContext, { q: 'dress', refine: ['cgid=womens'] }).catch(() => {});

            expect(mockLogger.error).toHaveBeenCalledWith(
                'shopperSearch.productSearch failed',
                expect.objectContaining({ q: 'dress' })
            );
        });

        it('should not include orderable_only when config has orderableOnly=false', async () => {
            const mockContext = createTestContext({
                appConfig: {
                    search: {
                        products: {
                            refine: {
                                orderableOnly: false,
                            },
                        },
                    },
                } as any,
            });

            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                q: 'dress',
                currency: 'USD',
            });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query).not.toHaveProperty('refine');
        });

        it('should not overwrite orderable_only=false when config has orderableOnly=true', async () => {
            const mockContext = createTestContext();

            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, {
                q: 'dress',
                currency: 'USD',
                refine: ['orderable_only=false'],
            });

            expect(mockProductSearch).toHaveBeenCalledWith({
                params: {
                    query: expect.objectContaining({
                        refine: ['orderable_only=false'],
                    }),
                },
            });
        });

        it('should pass imgTypes with default viewTypes when config.images is absent', async () => {
            const mockContext = createTestContext({
                appConfig: {} as never,
            });
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, { q: 'dress' });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query.imgTypes).toBe('medium,swatch');
        });

        it('should pass imgTypes reflecting configured role-named viewTypes', async () => {
            const mockContext = createTestContext({
                appConfig: {
                    search: {
                        products: {
                            images: { tile: 'large' },
                        },
                    },
                } as never,
            });
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, { q: 'dress' });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query.imgTypes).toBe('large');
        });

        it('should omit imgTypes when all role-named viewTypes are unset', async () => {
            const mockContext = createTestContext({
                appConfig: {
                    search: {
                        products: {
                            images: {},
                        },
                    },
                } as never,
            });
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, { q: 'dress' });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query.imgTypes).toBeUndefined();
        });

        it('should deduplicate imgTypes when multiple roles share a viewType', async () => {
            const mockContext = createTestContext({
                appConfig: {
                    search: {
                        products: {
                            images: { tile: 'medium', swatch: 'medium' },
                        },
                    },
                } as never,
            });
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, { q: 'dress' });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query.imgTypes).toBe('medium');
        });

        it('should allow caller-provided imgTypes to override the generated one', async () => {
            const mockContext = createTestContext();
            mockProductSearch.mockResolvedValue({ data: { hits: [] } });

            await fetchSearchProducts(mockContext, { q: 'dress', imgTypes: 'large:1' });

            const query = mockProductSearch.mock.calls[0][0].params.query;
            expect(query.imgTypes).toBe('large:1');
        });
    });
});
