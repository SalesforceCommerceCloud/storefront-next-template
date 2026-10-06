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
import type { ShopperExperience } from '@/scapi';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { convertProductToProductSearchHit } from '@/lib/product/product-conversion';
import { fetchProductById, getDefaultProductExpansions } from '@/lib/api/products.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getSeoSlugExpansion } from '@/lib/seo/scapi-slugs';

const dataLoader = async (args: { componentData: unknown; context: LoaderFunctionArgs['context'] }) => {
    const { componentData, context: routeContext } = args;
    const comp = componentData as ShopperExperience.schemas['Component'];
    const productId = (comp.data as { productId?: string })?.productId;
    if (!productId?.trim()) {
        return null;
    }

    const currency = (routeContext.get(siteContext) as SiteContext).currency;
    const config = getConfig(routeContext);

    const product = await fetchProductById(routeContext, productId, {
        allImages: true,
        perPricebook: true,
        expand: getDefaultProductExpansions(...getSeoSlugExpansion(config.url?.seoRoutes)),
        ...(currency ? { currency } : {}),
    });

    return product ? convertProductToProductSearchHit(product) : null;
};

export const loader = {
    server: dataLoader,
};
