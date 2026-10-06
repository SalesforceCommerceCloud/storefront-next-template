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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { render } from '@testing-library/react';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError } from '@/scapi';
import { Region } from '@/components/region';
import { createLoaderArgs } from '@/lib/test-utils/loader-action-args';
import { fetchContent } from '@/lib/api/content.server';
import { fetchPageFromLoader, attachComponentData } from '@/lib/page-designer/page-loader.server';
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import StandaloneContentPage, { loader } from './_app.cms.$';

vi.mock('@/lib/api/content.server', () => ({ fetchContent: vi.fn() }));
vi.mock('@/components/region', () => ({ Region: vi.fn(() => null) }));
vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageFromLoader: vi.fn(),
    attachComponentData: vi.fn((_args, page) => ({ ...page, componentData: {} })),
}));
vi.mock('@/lib/api/shopper-seo.server', () => ({ getUrlMapping: vi.fn() }));
vi.mock('@/lib/origin', () => ({ getAppOrigin: vi.fn(() => 'https://shop.example') }));

const appConfig = {
    hybrid: { enabled: true, legacyRoutes: [] as string[] },
    localeAliasMap: { 'en-US': 'en' },
    url: {
        prefix: '/:siteId/:localeId',
        seoRoutes: {
            RefArch: {
                product: { prefix: 'p' },
                category: { prefix: 'c', mode: 'id-suffix' as const },
                content: { prefix: 'cms' },
            },
        },
    },
    seoFallback: {
        sites: {
            RefArch: {
                contentOwned: true,
                redirectOrigins: [],
                allowedQueryParameters: { product: [], category: [], redirect: [] },
            },
        },
    },
};

function context() {
    const value = new RouterContextProvider();
    value.set(appConfigContext, appConfig as never);
    value.set(siteContext, {
        site: { id: 'RefArch', alias: 'global' },
        locale: { id: 'en-US', alias: 'en' },
        currency: 'USD',
    } as never);
    return value;
}

function args(pathname: string) {
    return createLoaderArgs(new Request(`https://internal.example${pathname}`), context(), {
        params: { '*': pathname.split('/').slice(3).join('/') },
        pattern: '/:siteId/:localeId/cms/*',
    });
}

function apiError(status: number) {
    return new ApiError({
        status,
        statusText: status === 404 ? 'Not Found' : 'Failure',
        headers: new Headers(),
        body: { type: 'failure', title: 'Failure', detail: 'Request failed' },
        rawBody: '',
        url: '',
        method: 'GET',
    });
}

describe('standalone content route loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appConfig.hybrid.legacyRoutes = [];
        vi.mocked(getUrlMapping).mockResolvedValue(null);
    });

    it('fetches a standard content asset directly without URL Mapping', async () => {
        const content = { id: 'about', name: 'About us', c_body: '<p>Our story</p>' };
        vi.mocked(fetchContent).mockResolvedValue(content);

        const result = await loader(args('/global/en/cms/content/company/about') as never);

        expect(result).toMatchObject({ type: 'content', content });
        expect(fetchContent).toHaveBeenCalledWith(expect.any(RouterContextProvider), 'about');
        expect(fetchPageFromLoader).not.toHaveBeenCalled();
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    it('fetches a Page Designer page directly and attaches component data', async () => {
        const page = { id: 'spring', regions: [] };
        vi.mocked(fetchPageFromLoader).mockResolvedValue(page as never);

        const result = await loader(args('/global/en/cms/page/campaigns/spring') as never);

        expect(fetchPageFromLoader).toHaveBeenCalledWith(expect.anything(), { pageId: 'spring' });
        expect(attachComponentData).toHaveBeenCalledWith(expect.anything(), page);
        expect(result).toMatchObject({ type: 'page', page: { id: 'spring', componentData: {} } });
        expect(fetchContent).not.toHaveBeenCalled();
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    it('stops before SCAPI and fallback when runtime config assigns the prefix to legacy', async () => {
        appConfig.hybrid.legacyRoutes = ['/cms/*'];

        await expect(loader(args('/global/en/cms/content/about') as never)).rejects.toMatchObject({ status: 404 });
        expect(fetchContent).not.toHaveBeenCalled();
        expect(fetchPageFromLoader).not.toHaveBeenCalled();
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    it('rejects paths without a supported discriminator before SCAPI', async () => {
        await expect(loader(args('/global/en/cms/asset/about') as never)).rejects.toMatchObject({ status: 404 });
        expect(fetchContent).not.toHaveBeenCalled();
        expect(fetchPageFromLoader).not.toHaveBeenCalled();
        expect(getUrlMapping).toHaveBeenCalledOnce();
    });

    it('uses the bounded SEO fallback when the content alias matches outside its deterministic grammar', async () => {
        vi.mocked(getUrlMapping).mockResolvedValue({
            resourceType: 'CONTENT_ASSET',
            resourceSubType: 'PAGE_DESIGNER_CONTENT_ASSET',
            resourceId: 'landing',
            statusCode: 301,
        });

        const response = await loader(args('/global/en/cms/old-campaign') as never);

        expect(response).toBeInstanceOf(Response);
        expect((response as Response).status).toBe(301);
        expect((response as Response).headers.get('Location')).toBe('/global/en/cms/page/landing');
        expect(getUrlMapping).toHaveBeenCalledOnce();
        expect(fetchContent).not.toHaveBeenCalled();
        expect(fetchPageFromLoader).not.toHaveBeenCalled();
    });

    it('normalizes the optional html suffix with a permanent redirect before SCAPI', async () => {
        await expect(loader(args('/global/en/cms/content/company/about.html') as never)).rejects.toMatchObject({
            status: 301,
            headers: expect.objectContaining({}),
        });
        try {
            await loader(args('/global/en/cms/content/company/about.html') as never);
        } catch (error) {
            expect((error as Response).headers.get('Location')).toBe('/global/en/cms/content/company/about');
        }
        expect(fetchContent).not.toHaveBeenCalled();
    });

    it('turns SCAPI misses into route 404s without consulting URL Mapping', async () => {
        vi.mocked(fetchContent).mockRejectedValue(apiError(404));

        await expect(loader(args('/global/en/cms/content/missing') as never)).rejects.toMatchObject({ status: 404 });
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    it('preserves operational SCAPI failures', async () => {
        const failure = apiError(503);
        vi.mocked(fetchContent).mockRejectedValue(failure);

        await expect(loader(args('/global/en/cms/content/about') as never)).rejects.toBe(failure);
    });
});

describe('standalone Page Designer rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks only the merchant-selected LCP region as critical', () => {
        const page = {
            id: 'landing',
            typeId: 'landing',
            data: { criticalRegionId: 'hero' },
            regions: [{ id: 'hero' }, { id: 'body' }],
            componentData: {},
        };

        render(
            <StandaloneContentPage
                loaderData={{ type: 'page', page: page as never, pageUrl: 'https://shop.example/cms/page/landing' }}
            />
        );

        const regionProps = vi.mocked(Region).mock.calls.map(([props]) => props);
        expect(regionProps).toEqual([
            expect.objectContaining({ regionId: 'hero', critical: true }),
            expect.objectContaining({ regionId: 'body', critical: false }),
        ]);
    });
});
