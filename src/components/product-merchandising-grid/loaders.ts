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
import type { ShopperExperience, ShopperSearch } from '@/scapi';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { resolveMerchandisingGridLayout } from './constants';

/**
 * Fetches the bounded category assortment displayed by a merchandising grid.
 * Rows and columns are normalized before the request so authored values cannot
 * increase the server-side product-search cost beyond the component contract.
 */
export function fetchMerchandisingGridProducts(
    context: LoaderFunctionArgs['context'],
    {
        categoryId,
        columns,
        rows,
        currency,
    }: {
        categoryId: string;
        columns?: unknown;
        rows?: unknown;
        currency?: string;
    }
): Promise<ShopperSearch.schemas['ProductSearchResult']> {
    const { limit } = resolveMerchandisingGridLayout({ columns, rows });
    return fetchSearchProducts(context, {
        refine: [`cgid=${categoryId}`],
        limit,
        currency,
    });
}

const pdLoader = ({
    componentData,
    context,
}: {
    componentData: unknown;
    context: LoaderFunctionArgs['context'];
}): Promise<ShopperSearch.schemas['ProductSearchResult'] | null> => {
    const component = componentData as ShopperExperience.schemas['Component'];
    const { categoryId, columns, rows } = (component.data ?? {}) as {
        categoryId?: unknown;
        columns?: unknown;
        rows?: unknown;
    };

    if (typeof categoryId !== 'string' || !categoryId) {
        return Promise.resolve(null);
    }

    const { currency } = context.get(siteContext) as SiteContext;
    return fetchMerchandisingGridProducts(context, { categoryId, columns, rows, currency: currency ?? undefined });
};

export const loader = pdLoader;
