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
import type { ShopperAvailability } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';

/** Shopper Availability accepts at most 24 product IDs per request. */
const SCAPI_GET_AVAILABILITY_MAX_IDS = 24;

/**
 * Fetch exact-SKU availability from the site-assigned default inventory list.
 * Omitting inventoryIds selects that default; currency and locale are not supported.
 * IDs are trimmed, deduplicated, and batched in parallel. Any failed batch is logged
 * and rethrown as NormalizedApiError, preserving its cause for auth recovery.
 */
export async function fetchAvailabilityByIds(
    context: LoaderFunctionArgs['context'],
    ids: string[]
): Promise<ShopperAvailability.schemas['Availability'][]> {
    const productIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
    if (!productIds.length) return [];

    const logger = getLogger(context);
    const clients = createApiClients(context);
    const chunks: string[][] = [];
    for (let i = 0; i < productIds.length; i += SCAPI_GET_AVAILABILITY_MAX_IDS) {
        chunks.push(productIds.slice(i, i + SCAPI_GET_AVAILABILITY_MAX_IDS));
    }
    try {
        const responses = await Promise.all(
            chunks.map((chunk) =>
                clients.shopperAvailability.getAvailability({ params: { query: { productIds: chunk } } })
            )
        );
        return responses.flatMap(({ data }) => data?.data ?? []);
    } catch (error) {
        logger.error('shopperAvailability.getAvailability failed', { productIds });
        throw new NormalizedApiError(error);
    }
}
