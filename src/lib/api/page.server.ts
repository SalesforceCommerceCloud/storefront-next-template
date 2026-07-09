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
import { type LoaderFunctionArgs } from 'react-router';
import { ApiError, type ShopperExperience } from '@/scapi';
import { type PageDesignerMode } from '@salesforce/storefront-next-runtime/design/mode';
import { createApiClients } from '@/lib/api-clients.server';

export interface PageDesignerPageIdParams {
    pageId: string;
    aspectType?: string;
    categoryId?: string;
    productId?: string;
}

export interface PageDesignerPageQueryParams {
    pageId?: string;
    aspectType: string;
    categoryId?: string;
    productId?: string;
}

export interface PageDesignerPageModeParams {
    mode?: PageDesignerMode;
    pdToken?: string;
}

export type PageDesignerPageParams = PageDesignerPageIdParams | PageDesignerPageQueryParams;

/**
 * Fetches a Page Designer page from SCAPI's Shopper Experience API.
 *
 * When the MRT-based page resolution middleware is active, `getPage` calls are
 * transparently intercepted and resolved from the Data Store. If resolution
 * fails or the middleware is not active, the request falls through to SCAPI.
 *
 * If no `pageId` is provided, falls back to the `getPages` endpoint which
 * searches for a page assigned to the given product or category in the context
 * of the provided aspect type. Today this is a 1:1 relationship (at most one
 * PDP per product or PLP per category), so the first hit is returned.
 *
 * @param context - The loader function context from React Router.
 * @param parameters - Page Designer page parameters including the page ID,
 *   optional preview mode/token, and aspect attributes (product, category).
 * @returns The resolved Page Designer page data.
 */
export const fetchPage = async (
    context: LoaderFunctionArgs['context'],
    parameters: PageDesignerPageParams & PageDesignerPageModeParams
): Promise<ShopperExperience.schemas['Page']> => {
    const { pageId, pdToken, mode, aspectType, categoryId, productId } = parameters || {};
    const clients = createApiClients(context);

    const aspectAttributes = {
        ...(aspectType && { aspectType }),
        ...(categoryId && { categoryId }),
        ...(productId && { productId }),
    };
    const aspectAttributesQuery =
        Object.keys(aspectAttributes).length > 0 ? { aspectAttributes: JSON.stringify(aspectAttributes) } : {};

    if (!pageId) {
        const result = await clients.shopperExperience.getPages({
            params: {
                query: {
                    // Required by SCAPI; the API will surface a 400 if missing.
                    aspectTypeId: aspectType as string,
                    // SCAPI's getPages rejects calls that carry multiple business-object
                    // IDs (e.g. productId + categoryId) with 400 business-object-id-invalid.
                    // Send only the most specific one — productId when present, otherwise
                    // categoryId. The other value still reaches the MRT manifest middleware
                    // via the aspectAttributes query param below.
                    ...(productId ? { productId } : categoryId ? { categoryId } : {}),
                    ...aspectAttributesQuery,
                },
            },
        });

        const page = result.data?.data?.[0];

        if (!page) {
            // Mirror the SCAPI `getPage` 404 contract so callers can handle a
            // missing page identically across both endpoints.
            throw new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'page-not-found',
                    title: 'Page Not Found',
                    detail: `No page assigned for aspectTypeId "${aspectType}".`,
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });
        }

        return page;
    }

    const result = await clients.shopperExperience.getPage({
        params: {
            path: { pageId },
            query: {
                ...(mode && { mode }),
                ...(pdToken && { pdToken }),
                ...aspectAttributesQuery,
            },
        },
    });

    return result.data;
};
