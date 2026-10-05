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
import type { LoaderFunctionArgs } from 'react-router';
import { fetchPage, type PageDesignerPageModeParams, type PageDesignerPageParams } from '@/lib/api/page.server';
import { ApiError, type ShopperExperience } from '@/scapi';
import {
    isDesignModeActive,
    isPreviewModeActive,
    type PageDesignerMode,
} from '@salesforce/storefront-next-runtime/design/mode';
import { getLogger } from '@/lib/logger.server';
import { collectFromRegions } from './collect-component-data.server';

export type Page = ShopperExperience.schemas['Page'];

export type PageWithComponentData = Page & {
    componentData?: Record<string, Promise<unknown>>;
};

/** Attach server component-loader promises to a resolved Page Designer page. */
export function attachComponentData(args: LoaderFunctionArgs, page: Page): PageWithComponentData {
    const componentData: Record<string, Promise<unknown>> = {};
    collectFromRegions(args, page.regions, componentData);
    return { ...page, componentData };
}

export async function fetchPageFromLoader(
    { context, request }: LoaderFunctionArgs,
    params: PageDesignerPageParams & PageDesignerPageModeParams
): Promise<ShopperExperience.schemas['Page']> {
    const isPageDesignerActive = isDesignModeActive(request) || isPreviewModeActive(request);
    const url = new URL(request.url);

    if (!isPageDesignerActive) {
        return fetchPage(context, params);
    }

    const pageDesignerParams: Partial<PageDesignerPageParams & PageDesignerPageModeParams> = {
        mode: (url.searchParams.get('mode') as PageDesignerMode | null) || undefined,
        pdToken: url.searchParams.get('pdToken') || undefined,
        pageId: url.searchParams.get('pageId') || undefined,
    };

    const cleanParams = Object.fromEntries(
        Object.entries(pageDesignerParams).filter(([, value]) => value !== undefined)
    );

    return fetchPage(context, { ...params, ...cleanParams });
}

/**
 * Fetches a page and attaches componentData promises as a nested property.
 * This follows the React Router nested promise pattern where the outer promise
 * resolves to an object containing nested promises that can be awaited separately.
 *
 * Usage:
 * ```tsx
 * // In loader:
 * return { page: fetchPageWithComponentData(args, { pageId: 'homepage' }) };
 *
 * // In component:
 * <Await resolve={loaderData.page}>
 *   {(page) => (
 *     <Await resolve={page.componentData[componentId]}>
 *       {(data) => <Component data={data} />}
 *     </Await>
 *   )}
 * </Await>
 * ```
 */
export async function fetchPageWithComponentData(
    args: LoaderFunctionArgs,
    params: PageDesignerPageParams & PageDesignerPageModeParams
): Promise<PageWithComponentData | null> {
    let page: ShopperExperience.schemas['Page'];
    try {
        page = await fetchPageFromLoader(args, params);
    } catch (e) {
        if (e instanceof ApiError) {
            if (e.status !== 404) {
                const logger = getLogger(args.context);
                logger.warn('Page Designer fetch failed', { status: e.status, pageId: params.pageId });
            }
            return null;
        }
        throw e;
    }

    return attachComponentData(args, page);
}
