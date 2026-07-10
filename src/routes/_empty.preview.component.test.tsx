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
import type { Route } from './+types/_empty.preview.component';
import PreviewComponentRoute, { loader, meta } from './_empty.preview.component';
import { createLoaderArgs } from '@/lib/test-utils/loader-action-args';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';
import { fetchComponentWithComponentData } from '@/lib/page-designer/component-loader.server';
import { injectIntoPreviewRegion } from '@/lib/page-designer/preview-page.server';

vi.mock('@salesforce/storefront-next-runtime/design/mode', () => ({
    isDesignModeActive: vi.fn(),
    isPreviewModeActive: vi.fn(),
}));

vi.mock('@/lib/page-designer/component-loader.server', () => ({
    fetchComponentWithComponentData: vi.fn(),
}));

vi.mock('@/lib/page-designer/preview-page.server', () => ({
    injectIntoPreviewRegion: vi.fn(),
}));

const mockedIsDesignModeActive = vi.mocked(isDesignModeActive);
const mockedIsPreviewModeActive = vi.mocked(isPreviewModeActive);
const mockedFetch = vi.mocked(fetchComponentWithComponentData);
const mockedInject = vi.mocked(injectIntoPreviewRegion);

const mockContext = {} as any;
const BASE = 'http://localhost/RefArch/en-US/preview/component';

const runLoader = (url: string) =>
    loader(createLoaderArgs<Route.LoaderArgs>(new Request(url), mockContext, { pattern: '*' }));

const expect404 = async (url: string) => {
    try {
        await runLoader(url);
        expect.fail('Should have thrown a 404 Response');
    } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(404);
    }
};

describe('_empty.preview.component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedIsDesignModeActive.mockReturnValue(false);
        mockedIsPreviewModeActive.mockReturnValue(false);
    });

    it('exports a default component', () => {
        expect(typeof PreviewComponentRoute).toBe('function');
    });

    describe('design-param gate', () => {
        it('404s when no mode param is present', async () => {
            await expect404(`${BASE}?componentId=c-1`);

            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('404s when mode is an unrecognized value (VIEW)', async () => {
            await expect404(`${BASE}?mode=VIEW&componentId=c-1`);
        });

        it('404s when mode is empty', async () => {
            await expect404(`${BASE}?mode=&componentId=c-1`);
        });

        it('passes the gate in PREVIEW mode', async () => {
            mockedIsPreviewModeActive.mockReturnValue(true);
            mockedFetch.mockResolvedValue({ id: 'c-1', typeId: 'hero' } as any);
            mockedInject.mockReturnValue({ id: 'p', regions: [], componentData: {} } as any);

            await runLoader(`${BASE}?mode=PREVIEW&componentId=c-1`);

            expect(mockedFetch).toHaveBeenCalledWith(expect.anything(), { componentId: 'c-1' });
        });

        it('passes the gate in EDIT mode', async () => {
            mockedIsDesignModeActive.mockReturnValue(true);
            mockedFetch.mockResolvedValue({ id: 'c-1', typeId: 'hero' } as any);
            mockedInject.mockReturnValue({ id: 'p', regions: [], componentData: {} } as any);

            await runLoader(`${BASE}?mode=EDIT&componentId=c-1`);

            expect(mockedFetch).toHaveBeenCalledWith(expect.anything(), { componentId: 'c-1' });
        });
    });

    describe('componentId handling', () => {
        beforeEach(() => {
            mockedIsPreviewModeActive.mockReturnValue(true);
        });

        it('404s when componentId is missing', async () => {
            await expect404(`${BASE}?mode=PREVIEW`);

            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('404s when the component cannot be fetched (null)', async () => {
            mockedFetch.mockResolvedValue(null);
            await expect404(`${BASE}?mode=PREVIEW&componentId=missing`);
        });
    });

    describe('happy path', () => {
        it('returns the synthesized page from injectIntoPreviewRegion', async () => {
            mockedIsPreviewModeActive.mockReturnValue(true);
            const component = { id: 'c-1', typeId: 'hero' } as any;
            const syntheticPage = { id: 'p', regions: [], componentData: {} } as any;
            mockedFetch.mockResolvedValue(component);
            mockedInject.mockReturnValue(syntheticPage);

            const result = await runLoader(`${BASE}?mode=PREVIEW&componentId=c-1`);

            expect(mockedInject).toHaveBeenCalledWith(component, expect.anything());
            expect(result).toEqual({ page: syntheticPage });
        });
    });

    describe('meta', () => {
        it('emits exactly noindex,nofollow on robots', () => {
            const tags = meta({} as Route.MetaArgs);
            expect(tags).toEqual([{ name: 'robots', content: 'noindex,nofollow' }]);
        });
    });
});
