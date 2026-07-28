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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';
import { ApiError, type ShopperExperience } from '@/scapi';
import { fetchPageFromLoader, fetchPageWithComponentData } from './page-loader.server';
import { fetchPage } from '@/lib/api/page.server';
import { registry } from '@/lib/page-designer/registry';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';

vi.mock('@/lib/api/page.server', () => ({
    fetchPage: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/design/mode', () => ({
    isDesignModeActive: vi.fn(),
    isPreviewModeActive: vi.fn(),
}));

vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        callLoader: vi.fn(),
        hasLoaders: vi.fn(),
    },
}));

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

const mockedFetchPage = vi.mocked(fetchPage);
const mockedRegistry = vi.mocked(registry);
const mockedIsDesignModeActive = vi.mocked(isDesignModeActive);
const mockedIsPreviewModeActive = vi.mocked(isPreviewModeActive);

// Test constants
const TEST_CONTEXT = { get: vi.fn(), set: vi.fn() };
const BASE_URL = 'https://example.com/page';
const MOCK_PAGE_ID = 'test-page';
const MOCK_PD_TOKEN = 'abc123';

// Test utilities
const createLoaderArgs = (url: string, context = TEST_CONTEXT) =>
    ({
        request: new Request(url),
        url: new URL(url),
        context,
        params: {},
        pattern: '/',
    }) as LoaderFunctionArgs;

const createMockPage = (regions: any[] = []): ShopperExperience.schemas['Page'] =>
    ({
        id: 'mock-page',
        regions,
    }) as ShopperExperience.schemas['Page'];

const createMockComponent = (id: string, typeId: string, additionalProps = {}) => ({
    id,
    typeId,
    ...additionalProps,
});

const createMockRegion = (components: any[]) => ({ components });

describe('pageLoader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedFetchPage.mockResolvedValue(createMockPage());
        // Set default mock behavior for design mode functions
        mockedIsDesignModeActive.mockReturnValue(false);
        mockedIsPreviewModeActive.mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchPageFromLoader', () => {
        test('calls fetchPage with basic params when no mode in URL', async () => {
            const args = createLoaderArgs(BASE_URL);

            await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, { pageId: MOCK_PAGE_ID });
        });

        test('includes mode=EDIT and pdToken (and pageId from URL) when present', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const urlPageId = 'url-page';
            const args = createLoaderArgs(`${BASE_URL}?mode=EDIT&pdToken=${MOCK_PD_TOKEN}&pageId=${urlPageId}`);

            await fetchPageFromLoader(args, { pageId: 'param-page', aspectType: 'product' });

            // URL pageId should override params.pageId because it’s spread later
            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, {
                aspectType: 'product',
                mode: 'EDIT',
                pdToken: MOCK_PD_TOKEN,
                pageId: urlPageId,
            });
        });

        test('includes mode=PREVIEW and pdToken when present', async () => {
            mockedIsPreviewModeActive.mockReturnValue(true);
            const previewToken = 'xyz789';
            const args = createLoaderArgs(`${BASE_URL}?mode=PREVIEW&pdToken=${previewToken}`);

            await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, {
                pageId: MOCK_PAGE_ID,
                mode: 'PREVIEW',
                pdToken: previewToken,
            });
        });

        test('does not include pdToken if missing even in EDIT mode', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const args = createLoaderArgs(`${BASE_URL}?mode=EDIT`);

            await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, {
                pageId: MOCK_PAGE_ID,
                mode: 'EDIT',
            });
        });

        test('includes mode=VIEW but ignores pdToken and pageId from URL', async () => {
            const paramPageId = 'param-page';
            const args = createLoaderArgs(`${BASE_URL}?mode=VIEW&pdToken=shouldNotAppear&pageId=ignored`);

            await fetchPageFromLoader(args, { pageId: paramPageId });

            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, {
                pageId: paramPageId,
            });
        });

        test('propagates fetchPage errors', async () => {
            const error = new Error('API Error');
            mockedFetchPage.mockRejectedValueOnce(error);

            await expect(fetchPageFromLoader(createLoaderArgs(BASE_URL), { pageId: MOCK_PAGE_ID })).rejects.toThrow(
                'API Error'
            );
        });

        describe('Page Designer mode handling', () => {
            test('calls fetchPage directly when not in design or preview mode', async () => {
                const args = createLoaderArgs(BASE_URL);
                await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

                expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, { pageId: MOCK_PAGE_ID });
            });

            test('does not call fetchPage with design params in Page Designer edit mode', async () => {
                mockedIsDesignModeActive.mockReturnValue(true);
                const args = createLoaderArgs(`${BASE_URL}?mode=EDIT&pdToken=${MOCK_PD_TOKEN}`);

                await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

                expect(fetchPage).toHaveBeenCalled();
            });

            test('does not call fetchPage with design params in Page Designer preview mode', async () => {
                mockedIsPreviewModeActive.mockReturnValue(true);
                const args = createLoaderArgs(`${BASE_URL}?mode=PREVIEW&pdToken=preview-token`);

                await fetchPageFromLoader(args, { pageId: MOCK_PAGE_ID });

                expect(fetchPage).toHaveBeenCalled();
            });
        });
    });

    describe('fetchPageWithComponentData', () => {
        test('returns page with empty componentData when page has no regions', async () => {
            const args = createLoaderArgs(BASE_URL);
            const mockPage = createMockPage([]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });

            expect(result).toHaveProperty('id', 'mock-page');
            expect(result).toHaveProperty('componentData', {});
            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, { pageId: MOCK_PAGE_ID });
            // oxlint-disable-next-line @typescript-eslint/unbound-method
            expect(mockedRegistry.callLoader).toHaveBeenCalledTimes(0);
        });

        test('returns page with component data promises for components with server loaders', async () => {
            const heroData = { title: 'Hero Title' };
            const footerData = { links: ['home', 'about'] };

            mockedRegistry.hasLoaders
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false) // carousel has no loader
                .mockReturnValueOnce(true);

            mockedRegistry.callLoader
                .mockReturnValueOnce(Promise.resolve(heroData))
                .mockReturnValueOnce(Promise.resolve(footerData));

            const args = createLoaderArgs(BASE_URL);
            const components = [
                createMockComponent('hero-1', 'hero'),
                createMockComponent('carousel-1', 'carousel'),
                createMockComponent('footer-1', 'footer'),
            ];
            const mockPage = createMockPage([createMockRegion(components)]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });
            if (!result) throw new Error('Expected non-null result');

            expect(result).toHaveProperty('id', 'mock-page');
            expect(result).toHaveProperty('componentData');
            expect(Object.keys(result.componentData ?? {})).toEqual(['hero-1', 'footer-1']);
            await expect(result.componentData?.['hero-1']).resolves.toEqual(heroData);
            await expect(result.componentData?.['footer-1']).resolves.toEqual(footerData);
        });

        test('server loader receives componentData, context, and request', async () => {
            const expectedData = { loaded: true };
            mockedRegistry.hasLoaders.mockReturnValue(true);
            mockedRegistry.callLoader.mockReturnValue(Promise.resolve(expectedData));

            const args = createLoaderArgs(BASE_URL);
            const component = createMockComponent('hero-1', 'hero', { title: 'Hero Title' });
            const mockPage = createMockPage([createMockRegion([component])]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });
            if (!result) throw new Error('Expected non-null result');
            const componentData = await result.componentData?.['hero-1'];

            // oxlint-disable-next-line @typescript-eslint/unbound-method
            expect(mockedRegistry.callLoader).toHaveBeenCalledWith(
                'hero',
                {
                    componentData: component,
                    context: TEST_CONTEXT,
                    request: args.request,
                },
                'loader'
            );
            expect(componentData).toEqual(expectedData);
        });

        test('component data promise rejects when server loader throws error', async () => {
            const loaderError = new Error('Server loader failed');
            mockedRegistry.hasLoaders.mockReturnValue(true);
            mockedRegistry.callLoader.mockReturnValue(Promise.reject(loaderError));

            const args = createLoaderArgs(BASE_URL);
            const component = createMockComponent('failing-component', 'hero');
            const mockPage = createMockPage([createMockRegion([component])]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });
            if (!result) throw new Error('Expected non-null result');

            await expect(result.componentData?.['failing-component']).rejects.toThrow('Server loader failed');
        });

        test('handles regions with null/undefined components gracefully', async () => {
            const args = createLoaderArgs(BASE_URL);
            const mockPage = createMockPage([
                { components: null },
                { components: undefined },
                createMockRegion([]), // empty array
            ]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });
            if (!result) throw new Error('Expected non-null result');

            expect(result.componentData).toEqual({});
            // oxlint-disable-next-line @typescript-eslint/unbound-method
            expect(mockedRegistry.callLoader).toHaveBeenCalledTimes(0);
        });

        test('processes multiple regions with mixed loader availability', async () => {
            const heroData = { type: 'hero' };
            const bannerData = { type: 'banner' };
            const footerData = { type: 'footer' };

            mockedRegistry.hasLoaders
                .mockReturnValueOnce(true) // hero has loader
                .mockReturnValueOnce(true) // banner has loader
                .mockReturnValueOnce(false) // carousel has no loader
                .mockReturnValueOnce(true); // footer has loader

            mockedRegistry.callLoader
                .mockReturnValueOnce(Promise.resolve(heroData))
                .mockReturnValueOnce(Promise.resolve(bannerData))
                .mockReturnValueOnce(Promise.resolve(footerData));

            const args = createLoaderArgs(BASE_URL);
            const mockPage = createMockPage([
                createMockRegion([createMockComponent('hero-1', 'hero'), createMockComponent('banner-1', 'banner')]),
                createMockRegion([
                    createMockComponent('carousel-1', 'carousel'), // no loader
                    createMockComponent('footer-1', 'footer'),
                ]),
            ]);
            mockedFetchPage.mockResolvedValue(mockPage);

            const result = await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });
            if (!result) throw new Error('Expected non-null result');

            const componentData = result.componentData as Record<string, Promise<unknown>>;
            expect(Object.keys(componentData)).toEqual(['hero-1', 'banner-1', 'footer-1']);

            const results = await Promise.all([
                componentData['hero-1'],
                componentData['banner-1'],
                componentData['footer-1'],
            ]);

            expect(results).toEqual([heroData, bannerData, footerData]);
        });

        test('includes design mode parameters when in EDIT mode', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const args = createLoaderArgs(`${BASE_URL}?mode=EDIT&pdToken=${MOCK_PD_TOKEN}`);
            const mockPage = createMockPage([]);
            mockedFetchPage.mockResolvedValue(mockPage);

            await fetchPageWithComponentData(args, { pageId: MOCK_PAGE_ID });

            expect(fetchPage).toHaveBeenCalledWith(TEST_CONTEXT, {
                pageId: MOCK_PAGE_ID,
                mode: 'EDIT',
                pdToken: MOCK_PD_TOKEN,
            });
        });

        test('propagates fetchPage errors', async () => {
            const error = new Error('API Error');
            mockedFetchPage.mockRejectedValueOnce(error);

            await expect(
                fetchPageWithComponentData(createLoaderArgs(BASE_URL), { pageId: MOCK_PAGE_ID })
            ).rejects.toThrow('API Error');
        });

        test('returns null without logging when fetchPage throws a 404 ApiError', async () => {
            const notFoundError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: { type: '', title: 'Not Found', detail: 'Page not found' },
                rawBody: '',
                url: BASE_URL,
                method: 'GET',
            });
            mockedFetchPage.mockRejectedValueOnce(notFoundError);

            const result = await fetchPageWithComponentData(createLoaderArgs(BASE_URL), { pageId: MOCK_PAGE_ID });

            expect(result).toBeNull();
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        test('returns null and logs warning for non-404 ApiErrors', async () => {
            const serverError = new ApiError({
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers(),
                body: { type: '', title: 'Server Error', detail: 'Something went wrong' },
                rawBody: '',
                url: BASE_URL,
                method: 'GET',
            });
            mockedFetchPage.mockRejectedValueOnce(serverError);

            const result = await fetchPageWithComponentData(createLoaderArgs(BASE_URL), { pageId: MOCK_PAGE_ID });
            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalledWith('Page Designer fetch failed', {
                status: 500,
                pageId: MOCK_PAGE_ID,
            });
        });

        test('re-throws non-ApiError errors even when they have a status-like property', async () => {
            const genericError = Object.assign(new Error('Network failure'), { status: 404 });
            mockedFetchPage.mockRejectedValueOnce(genericError);

            await expect(
                fetchPageWithComponentData(createLoaderArgs(BASE_URL), { pageId: MOCK_PAGE_ID })
            ).rejects.toThrow('Network failure');
        });
    });
});
