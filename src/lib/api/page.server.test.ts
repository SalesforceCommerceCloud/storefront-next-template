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
import { fetchPage } from './page.server';
import { createApiClients } from '@/lib/api-clients.server';
import { createTestContext } from '@/lib/test-utils';
import { type PageDesignerMode } from '@salesforce/storefront-next-runtime/design/mode';

const mockGetPage = vi.fn();
const mockGetPages = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperExperience: {
            getPage: mockGetPage,
            getPages: mockGetPages,
        },
    })),
}));

describe('fetchPage', () => {
    const mockContext = createTestContext();
    const mockCreateApiClients = vi.mocked(createApiClients);

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPage.mockReset();
        mockGetPages.mockReset();
    });

    const basicParameterTestCases = [
        {
            description: 'should call getPage with all parameters provided',
            inputParameters: {
                pageId: 'product-page',
                mode: 'EDIT' as PageDesignerMode,
                pdToken: 'abc123',
                aspectType: 'mobile',
                categoryId: 'electronics',
                productId: 'laptop-001',
            },
            expectedParams: {
                path: { pageId: 'product-page' },
                query: {
                    mode: 'EDIT',
                    pdToken: 'abc123',
                    aspectAttributes: JSON.stringify({
                        aspectType: 'mobile',
                        categoryId: 'electronics',
                        productId: 'laptop-001',
                    }),
                },
            },
            mockResult: { id: 'product-page', name: 'Product Detail Page', pageType: 'productDetailPage' },
        },
    ];

    it.each(basicParameterTestCases)('$description', async ({ inputParameters, expectedParams, mockResult }) => {
        mockGetPage.mockResolvedValue({ data: mockResult });

        const result = await fetchPage(mockContext, inputParameters);

        expect(mockCreateApiClients).toHaveBeenCalledWith(mockContext);
        expect(mockGetPage).toHaveBeenCalledWith({
            params: expectedParams,
        });
        expect(result).toEqual(mockResult);
    });

    describe('falls back to getPages when no pageId is provided', () => {
        const fallbackTestCases = [
            {
                // SCAPI's getPages rejects calls carrying multiple business-object IDs, so
                // when both are present we send only the more specific productId. The
                // categoryId still rides along in aspectAttributes for the manifest middleware.
                description: 'sends only productId (not categoryId) when both are provided',
                inputParameters: {
                    aspectType: 'pdpAspect',
                    categoryId: 'electronics',
                    productId: 'laptop-001',
                },
                expectedParams: {
                    query: {
                        aspectTypeId: 'pdpAspect',
                        productId: 'laptop-001',
                        aspectAttributes: JSON.stringify({
                            aspectType: 'pdpAspect',
                            categoryId: 'electronics',
                            productId: 'laptop-001',
                        }),
                    },
                },
            },
            {
                description: 'omits unspecified query params',
                inputParameters: {
                    aspectType: 'plpAspect',
                    categoryId: 'mens-clothing',
                },
                expectedParams: {
                    query: {
                        aspectTypeId: 'plpAspect',
                        categoryId: 'mens-clothing',
                        aspectAttributes: JSON.stringify({
                            aspectType: 'plpAspect',
                            categoryId: 'mens-clothing',
                        }),
                    },
                },
            },
            {
                description: 'sends only aspectTypeId when no category or product is provided',
                inputParameters: { aspectType: 'storePageAspect' },
                expectedParams: {
                    query: {
                        aspectTypeId: 'storePageAspect',
                        aspectAttributes: JSON.stringify({ aspectType: 'storePageAspect' }),
                    },
                },
            },
        ];

        it.each(fallbackTestCases)('$description', async ({ inputParameters, expectedParams }) => {
            const firstPage = { id: 'first', name: 'First Page', pageType: 'storePage' };
            mockGetPages.mockResolvedValue({ data: { data: [firstPage] } });

            const result = await fetchPage(mockContext, inputParameters);

            expect(mockGetPages).toHaveBeenCalledWith({ params: expectedParams });
            expect(mockGetPage).not.toHaveBeenCalled();
            expect(result).toEqual(firstPage);
        });

        it('returns the first page when getPages returns multiple results', async () => {
            const firstPage = { id: 'first', name: 'First', pageType: 'storePage' };
            const secondPage = { id: 'second', name: 'Second', pageType: 'storePage' };
            mockGetPages.mockResolvedValue({ data: { data: [firstPage, secondPage] } });

            const result = await fetchPage(mockContext, { aspectType: 'pdpAspect', productId: 'p1' });

            expect(result).toEqual(firstPage);
        });

        it('throws a 404 ApiError when getPages returns no results', async () => {
            mockGetPages.mockResolvedValue({ data: { data: [] } });

            await expect(fetchPage(mockContext, { aspectType: 'pdpAspect', productId: 'p1' })).rejects.toMatchObject({
                name: 'ApiError',
                status: 404,
            });
        });
    });

    describe('Page Designer design specific parameters', () => {
        const pageDesignerTestCases = [
            {
                description: 'should handle Page Designer edit mode',
                parameters: {
                    pageId: 'homepage',
                    mode: 'EDIT' as PageDesignerMode,
                    pdToken: 'edit-token-123',
                    categoryId: 'mens-clothing',
                    aspectType: 'category',
                },
                expectedParams: {
                    path: { pageId: 'homepage' },
                    query: {
                        mode: 'EDIT',
                        pdToken: 'edit-token-123',
                        aspectAttributes: JSON.stringify({
                            aspectType: 'category',
                            categoryId: 'mens-clothing',
                        }),
                    },
                },
            },
            {
                description: 'should handle product context parameters',
                parameters: {
                    pageId: 'product-template',
                    productId: 'shirt-001',
                    categoryId: 'mens-shirts',
                    aspectType: 'product',
                },
                expectedParams: {
                    path: { pageId: 'product-template' },
                    query: {
                        aspectAttributes: JSON.stringify({
                            aspectType: 'product',
                            categoryId: 'mens-shirts',
                            productId: 'shirt-001',
                        }),
                    },
                },
            },
        ];

        it.each(pageDesignerTestCases)('$description', async ({ parameters, expectedParams }) => {
            const mockResult = {
                id: parameters.pageId,
                name: 'Test Page',
                pageType: 'storePage',
            };
            mockGetPage.mockResolvedValue({ data: mockResult });

            await fetchPage(mockContext, parameters);

            expect(mockGetPage).toHaveBeenCalledWith({
                params: expectedParams,
            });
        });
    });

    describe('error handling', () => {
        const errorTestCases = [
            {
                description: 'should propagate ShopperExperience API errors',
                error: new Error('Page not found'),
                inputParameters: { pageId: 'non-existent' },
                expectedErrorMessage: 'Page not found',
                shouldCheckParameters: true,
            },
            {
                description: 'should handle network errors',
                error: new Error('Network timeout'),
                inputParameters: { pageId: 'homepage' },
                expectedErrorMessage: 'Network timeout',
                shouldCheckParameters: false,
            },
            {
                description: 'should handle authentication errors',
                error: new Error('Unauthorized access'),
                inputParameters: {
                    pageId: 'secure-page',
                    mode: 'EDIT' as PageDesignerMode,
                    pdToken: 'invalid-token',
                },
                expectedErrorMessage: 'Unauthorized access',
                shouldCheckParameters: false,
            },
        ];

        it.each(errorTestCases)(
            '$description',
            async ({ error, inputParameters, expectedErrorMessage, shouldCheckParameters }) => {
                mockGetPage.mockRejectedValue(error);

                await expect(fetchPage(mockContext, inputParameters)).rejects.toThrow(expectedErrorMessage);

                if (shouldCheckParameters) {
                    expect(mockGetPage).toHaveBeenCalledWith({
                        params: {
                            path: { pageId: inputParameters.pageId },
                            query: {},
                        },
                    });
                }
            }
        );
    });

    describe('return value validation', () => {
        const returnValueTestCases = [
            {
                description: 'should return the exact response from ShopperExperience.getPage',
                mockPageResponse: {
                    id: 'test-page',
                    name: 'Test Page',
                    pageType: 'storePage',
                    description: 'A test page for validation',
                    regions: [
                        {
                            id: 'header',
                            components: [],
                        },
                    ],
                    data: {
                        customAttribute: 'value',
                    },
                },
                inputParameters: { pageId: 'test-page' },
            },
            {
                description: 'should handle empty page response',
                mockPageResponse: {},
                inputParameters: { pageId: 'empty-page' },
            },
        ];

        it.each(returnValueTestCases)('$description', async ({ mockPageResponse, inputParameters }) => {
            mockGetPage.mockResolvedValue({ data: mockPageResponse });

            const result = await fetchPage(mockContext, inputParameters);

            expect(result).toEqual(mockPageResponse);
        });
    });

    describe('context usage', () => {
        const contextTestCases = [
            {
                description: 'should pass the correct context to createApiClients',
                testFunction: async () => {
                    const customContext = createTestContext();
                    const mockResult = { id: 'test', name: 'Test Page', pageType: 'storePage' };
                    mockGetPage.mockResolvedValue({ data: mockResult });

                    await fetchPage(customContext, { pageId: 'test' });

                    expect(mockCreateApiClients).toHaveBeenCalledWith(customContext);
                    expect(mockCreateApiClients).toHaveBeenCalledTimes(1);
                },
            },
            {
                description: 'should create a new client instance for each call',
                testFunction: async () => {
                    const mockResult = { id: 'test', name: 'Test Page', pageType: 'storePage' };
                    mockGetPage.mockResolvedValue({ data: mockResult });

                    await fetchPage(mockContext, { pageId: 'test1' });
                    await fetchPage(mockContext, { pageId: 'test2' });

                    expect(mockCreateApiClients).toHaveBeenCalledTimes(2);
                    expect(mockCreateApiClients).toHaveBeenNthCalledWith(1, mockContext);
                    expect(mockCreateApiClients).toHaveBeenNthCalledWith(2, mockContext);
                },
            },
        ];

        it.each(contextTestCases)('$description', async ({ testFunction }) => {
            await testFunction();
        });
    });
});
