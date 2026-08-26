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
import { fetchCategories } from '@/lib/api/categories.server';
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience, ShopperProducts } from '@/scapi';

const dataLoader = (args: {
    componentData: unknown;
    context: LoaderFunctionArgs['context'];
}): Promise<ShopperProducts.schemas['Category'][] | undefined> => {
    const { componentData, context: routeContext } = args;

    // Type cast to component structure
    const comp = componentData as ShopperExperience.schemas['Component'];

    // Extract parentId from component data (Page Designer attributes are in comp.data)
    const parentId = (comp.data as { parentId?: string })?.parentId;

    if (!parentId || typeof parentId !== 'string') {
        // No parent category configured yet (e.g. a freshly-dropped Categories Carousel in Page
        // Designer). Resolve to undefined instead of defaulting to 'root': always fetching the root
        // categories would populate `data`, so the component's data branch would render real
        // categories and its design-mode empty state (empty Category Card placeholders) would be
        // unreachable. Resolving lets the component fall through to that empty state in design mode
        // and render nothing on the live storefront. Mirrors the Product Carousel loader.
        return Promise.resolve(undefined);
    }

    return fetchCategories(routeContext, parentId, 1);
};

export const loader = dataLoader;
