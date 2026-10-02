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
import { fetchOrderWithProducts } from '@/lib/api/order.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getLogger } from '@/lib/logger.server';
import type { ReturnableLine } from './types';
import { buildReturnableLines, collectMasterIds } from './order-lines';

export interface ReturnPageData {
    orderNo: string;
    lines: ReturnableLine[];
    /**
     * Server time used for every eligibility decision on the page. Passing it down (instead of reading the clock in
     * the browser) keeps the server HTML and the hydrated markup identical and makes submit re-validate against the
     * same instant the shopper saw.
     */
    now: string;
}

/**
 * Loads one order for the return form. The whole result is a single promise so the route needs exactly one
 * Suspense boundary and no in-render promise composition.
 */
export function loadReturnPage(context: LoaderFunctionArgs['context'], orderNo: string): Promise<ReturnPageData> {
    const logger = getLogger(context);
    const { orderDataPromise } = fetchOrderWithProducts(context, orderNo, { includeOms: true });

    return orderDataPromise.then(async ({ order, productsById }) => {
        const masterIds = collectMasterIds(order, productsById);
        let mastersById: Record<string, (typeof productsById)[string]> = {};
        if (masterIds.length > 0) {
            try {
                const masters = await fetchProductsByIds(context, masterIds, { expand: ['variations'] });
                mastersById = Object.fromEntries(masters.map((master) => [master.id, master]));
            } catch {
                // Without variants the exchange picker has nothing to offer, but returns still work.
                logger.warn('ReturnPage: could not load exchange variants', { orderNo });
            }
        }
        return {
            orderNo,
            lines: buildReturnableLines(order, productsById, mastersById),
            now: new Date().toISOString(),
        };
    });
}
