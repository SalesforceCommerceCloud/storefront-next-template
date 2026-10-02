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

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { Route } from './+types/resource.returns';
import { getAuth } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { fetchCustomerReturns } from '@/lib/returns/returns-api.server';
import type { ReturnRequest } from '@/lib/returns/types';

export type ReturnsListData = { returns: ReturnRequest[] };

/**
 * GET /resource/returns: the logged-in shopper's returns, read from `c_returns` on their orders.
 * Shoppers who are not registered have none. Never cached: a status change must show on the next load.
 */
export async function loader({ context }: Route.LoaderArgs): Promise<Response> {
    if (!getConfig(context).features?.returnsCustomApi) throw new Response('Not Found', { status: 404 });

    const noStore = { 'Cache-Control': 'no-store' };
    const session = getAuth(context);
    if (session.userType !== 'registered' || !session.customerId) {
        return Response.json({ returns: [] } satisfies ReturnsListData, { headers: noStore });
    }

    try {
        const returns = await fetchCustomerReturns(context, session.customerId);
        return Response.json({ returns } satisfies ReturnsListData, { headers: noStore });
    } catch (error) {
        getLogger(context).error('[Returns] could not load the shopper returns', {
            error: error instanceof Error ? error.message : String(error),
        });
        return Response.json({ error: 'unavailable' }, { status: 502, headers: noStore });
    }
}
