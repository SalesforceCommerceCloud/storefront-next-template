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
import type { ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';

export const fetchCategory = async (
    context: LoaderFunctionArgs['context'],
    id: string,
    levels: ShopperProducts.operations['getCategory']['parameters']['query']['levels'] = 0
): Promise<ShopperProducts.schemas['Category']> => {
    const logger = getLogger(context);
    const clients = createApiClients(context);

    try {
        const { data } = await clients.shopperProducts.getCategory({
            params: {
                path: { id },
                query: { levels },
            },
        });
        return data;
    } catch (error) {
        logger.error('shopperProducts.getCategory failed', { categoryId: id, levels });
        throw new NormalizedApiError(error);
    }
};

export const fetchCategories = async (
    context: LoaderFunctionArgs['context'],
    parentId: string = 'root',
    levels: ShopperProducts.operations['getCategories']['parameters']['query']['levels'] = 1
): Promise<ShopperProducts.schemas['Category'][]> => {
    const parentCategory = await fetchCategory(context, parentId, levels);
    return parentCategory.categories || [];
};

/** The getCategories endpoint accepts at most 50 category IDs per request. */
const CATEGORY_IDS_PER_REQUEST = 50;

/**
 * Fetch several categories by ID in as few requests as possible.
 *
 * The IDs are split into chunks of {@link CATEGORY_IDS_PER_REQUEST} and each chunk is fetched via a single
 * `getCategories` call. The returned order follows the API responses and is not guaranteed to match the requested ID
 * order — callers must key results by `Category.id`.
 */
export const fetchCategoriesByIds = async (
    context: LoaderFunctionArgs['context'],
    ids: string[],
    levels: ShopperProducts.operations['getCategories']['parameters']['query']['levels'] = 1
): Promise<ShopperProducts.schemas['Category'][]> => {
    if (ids.length === 0) {
        return [];
    }

    const logger = getLogger(context);
    const clients = createApiClients(context);

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CATEGORY_IDS_PER_REQUEST) {
        chunks.push(ids.slice(i, i + CATEGORY_IDS_PER_REQUEST));
    }

    try {
        const results = await Promise.all(
            chunks.map(async (chunkIds) => {
                const { data } = await clients.shopperProducts.getCategories({
                    params: {
                        query: {
                            ids: chunkIds,
                            levels,
                        },
                    },
                });
                return data.data ?? [];
            })
        );

        return results.flat();
    } catch (error) {
        logger.error('shopperProducts.getCategories failed', { ids, levels });
        throw new NormalizedApiError(error);
    }
};
