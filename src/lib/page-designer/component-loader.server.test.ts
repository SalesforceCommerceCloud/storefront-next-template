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
import { fetchComponentFromLoader, fetchComponentWithComponentData } from './component-loader.server';
import { fetchComponent } from '@/lib/api/component.server';
import { registry } from '@/lib/page-designer/registry';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';

vi.mock('@/lib/api/component.server', () => ({
    fetchComponent: vi.fn(),
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

const mockedFetchComponent = vi.mocked(fetchComponent);
const mockedRegistry = vi.mocked(registry);
const mockedIsDesignModeActive = vi.mocked(isDesignModeActive);
const mockedIsPreviewModeActive = vi.mocked(isPreviewModeActive);

const TEST_CONTEXT = { get: vi.fn(), set: vi.fn() };
const BASE_URL = 'https://example.com/page';
const MOCK_COMPONENT_ID = 'test-component';
const MOCK_PD_TOKEN = 'abc123';

const createLoaderArgs = (url: string, context = TEST_CONTEXT) =>
    ({
        request: new Request(url),
        url: new URL(url),
        context,
        params: {},
        pattern: '/',
    }) as LoaderFunctionArgs;

const createMockComponent = (id: string, typeId: string, additionalProps = {}) => ({
    id,
    typeId,
    ...additionalProps,
});

const createMockRegion = (components: any[]) => ({ components });

const createMockComponentResponse = (regions: any[] = []): ShopperExperience.schemas['Component'] =>
    ({
        id: 'mock-component',
        typeId: 'commerce_assets.contentBlock',
        regions,
    }) as ShopperExperience.schemas['Component'];

describe('componentLoader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedFetchComponent.mockResolvedValue(createMockComponentResponse());
        mockedIsDesignModeActive.mockReturnValue(false);
        mockedIsPreviewModeActive.mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchComponentFromLoader', () => {
        test('calls fetchComponent with basic params when no mode in URL', async () => {
            const args = createLoaderArgs(BASE_URL);

            await fetchComponentFromLoader(args, { componentId: MOCK_COMPONENT_ID });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, { componentId: MOCK_COMPONENT_ID });
        });

        test('includes mode=EDIT and pdToken (and componentId from URL) when present', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const urlComponentId = 'url-component';
            const args = createLoaderArgs(
                `${BASE_URL}?mode=EDIT&pdToken=${MOCK_PD_TOKEN}&componentId=${urlComponentId}`
            );

            await fetchComponentFromLoader(args, { componentId: 'param-component' });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, {
                mode: 'EDIT',
                pdToken: MOCK_PD_TOKEN,
                componentId: urlComponentId,
            });
        });

        test('includes mode=PREVIEW and pdToken when present', async () => {
            mockedIsPreviewModeActive.mockReturnValue(true);
            const previewToken = 'xyz789';
            const args = createLoaderArgs(`${BASE_URL}?mode=PREVIEW&pdToken=${previewToken}`);

            await fetchComponentFromLoader(args, { componentId: MOCK_COMPONENT_ID });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, {
                componentId: MOCK_COMPONENT_ID,
                mode: 'PREVIEW',
                pdToken: previewToken,
            });
        });

        test('does not include pdToken if missing even in EDIT mode', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const args = createLoaderArgs(`${BASE_URL}?mode=EDIT`);

            await fetchComponentFromLoader(args, { componentId: MOCK_COMPONENT_ID });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, {
                componentId: MOCK_COMPONENT_ID,
                mode: 'EDIT',
            });
        });

        test('does not include design params when neither design nor preview mode is active', async () => {
            const args = createLoaderArgs(`${BASE_URL}?mode=VIEW&pdToken=shouldNotAppear&componentId=ignored`);

            await fetchComponentFromLoader(args, { componentId: MOCK_COMPONENT_ID });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, {
                componentId: MOCK_COMPONENT_ID,
            });
        });

        test('propagates fetchComponent errors', async () => {
            const error = new Error('API Error');
            mockedFetchComponent.mockRejectedValueOnce(error);

            await expect(
                fetchComponentFromLoader(createLoaderArgs(BASE_URL), { componentId: MOCK_COMPONENT_ID })
            ).rejects.toThrow('API Error');
        });
    });

    describe('fetchComponentWithComponentData', () => {
        test('returns component with empty componentData when component has no regions', async () => {
            const args = createLoaderArgs(BASE_URL);
            const mockComponent = createMockComponentResponse([]);
            mockedFetchComponent.mockResolvedValue(mockComponent);

            const result = await fetchComponentWithComponentData(args, { componentId: MOCK_COMPONENT_ID });

            expect(result).toHaveProperty('id', 'mock-component');
            expect(result).toHaveProperty('componentData', {});
            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, { componentId: MOCK_COMPONENT_ID });
            // oxlint-disable-next-line @typescript-eslint/unbound-method
            expect(mockedRegistry.callLoader).toHaveBeenCalledTimes(0);
        });

        test('returns component with component data promises for nested components with server loaders', async () => {
            const tileData1 = { product: 'iphone6' };
            const tileData2 = { product: 'iphone7' };

            mockedRegistry.hasLoaders.mockReturnValueOnce(true).mockReturnValueOnce(true);

            mockedRegistry.callLoader
                .mockReturnValueOnce(Promise.resolve(tileData1))
                .mockReturnValueOnce(Promise.resolve(tileData2));

            const args = createLoaderArgs(BASE_URL);
            const components = [
                createMockComponent('tile-1', 'productTile'),
                createMockComponent('tile-2', 'productTile'),
            ];
            const mockComponent = createMockComponentResponse([createMockRegion(components)]);
            mockedFetchComponent.mockResolvedValue(mockComponent);

            const result = await fetchComponentWithComponentData(args, { componentId: MOCK_COMPONENT_ID });
            if (!result) throw new Error('Expected non-null result');

            expect(result).toHaveProperty('id', 'mock-component');
            expect(result).toHaveProperty('componentData');
            expect(Object.keys(result.componentData ?? {})).toEqual(['tile-1', 'tile-2']);
            await expect(result.componentData?.['tile-1']).resolves.toEqual(tileData1);
            await expect(result.componentData?.['tile-2']).resolves.toEqual(tileData2);
        });

        test('includes design mode parameters when in EDIT mode', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            const args = createLoaderArgs(`${BASE_URL}?mode=EDIT&pdToken=${MOCK_PD_TOKEN}`);
            const mockComponent = createMockComponentResponse([]);
            mockedFetchComponent.mockResolvedValue(mockComponent);

            await fetchComponentWithComponentData(args, { componentId: MOCK_COMPONENT_ID });

            expect(fetchComponent).toHaveBeenCalledWith(TEST_CONTEXT, {
                componentId: MOCK_COMPONENT_ID,
                mode: 'EDIT',
                pdToken: MOCK_PD_TOKEN,
            });
        });

        test('propagates non-ApiError errors', async () => {
            const error = new Error('API Error');
            mockedFetchComponent.mockRejectedValueOnce(error);

            await expect(
                fetchComponentWithComponentData(createLoaderArgs(BASE_URL), { componentId: MOCK_COMPONENT_ID })
            ).rejects.toThrow('API Error');
        });

        test('returns null without logging when fetchComponent throws a 404 ApiError', async () => {
            const notFoundError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: { type: '', title: 'Not Found', detail: 'Component not found' },
                rawBody: '',
                url: BASE_URL,
                method: 'GET',
            });
            mockedFetchComponent.mockRejectedValueOnce(notFoundError);

            const result = await fetchComponentWithComponentData(createLoaderArgs(BASE_URL), {
                componentId: MOCK_COMPONENT_ID,
            });

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
            mockedFetchComponent.mockRejectedValueOnce(serverError);

            const result = await fetchComponentWithComponentData(createLoaderArgs(BASE_URL), {
                componentId: MOCK_COMPONENT_ID,
            });
            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalledWith('Page Designer component fetch failed', {
                status: 500,
                componentId: MOCK_COMPONENT_ID,
            });
        });

        test('re-throws non-ApiError errors even when they have a status-like property', async () => {
            const genericError = Object.assign(new Error('Network failure'), { status: 404 });
            mockedFetchComponent.mockRejectedValueOnce(genericError);

            await expect(
                fetchComponentWithComponentData(createLoaderArgs(BASE_URL), { componentId: MOCK_COMPONENT_ID })
            ).rejects.toThrow('Network failure');
        });
    });
});
