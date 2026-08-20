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
import { fetchCategory } from '@/lib/api/categories.server';
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperProducts, ShopperExperience } from '@/scapi';

const dataLoader = (args: {
    componentData: unknown;
    context: LoaderFunctionArgs['context'];
}): Promise<ShopperProducts.schemas['Category'] | undefined> => {
    const { componentData, context: routeContext } = args;

    // Type cast to component structure
    const comp = componentData as ShopperExperience.schemas['Component'];

    // Extract category ID from component data
    // componentData is the full component object, componentData.data contains Page Designer attributes
    const categoryId = (comp.data as { category?: string })?.category;

    if (!categoryId || typeof categoryId !== 'string') {
        // No category configured yet (e.g. a freshly-dropped Category Card in Page Designer).
        // Resolve to undefined instead of throwing: a thrown loader rejects the PD component-data
        // promise, which the region <Await> swaps for a null error fallback — so the card never
        // mounts and its design-mode empty state (index.tsx) never runs ("doesn't even show up as
        // an item"). Resolving lets the component render its design-mode empty state and render
        // null on the live storefront, matching the no-loader siblings (Content Card, Hero).
        return Promise.resolve(undefined);
    }

    // Fetch the full category object
    return fetchCategory(routeContext, categoryId, 0);
};

export const loader = dataLoader;
