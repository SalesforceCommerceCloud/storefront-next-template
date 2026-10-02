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
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { ApiError } from '@/scapi';
import { parseStoredReturns, toReturnRequest, type OrderLineForReturn } from './returns-codec';
import type { ReturnAction, ReturnReasonId, ReturnRequest, ReturnStatus } from './types';

type Context = LoaderFunctionArgs['context'];

/** Most recent orders searched for returns. SCAPI caps one page at 50. */
const ORDERS_PAGE_SIZE = 50;

/**
 * The shopper's returns, read from `c_returns` on their most recent orders, joined with each order's lines.
 * One request, so the order list can show a "Return in progress" badge on every order without one call per order.
 * Orders beyond the first page are not searched.
 *
 * Needs `c_returns` to be returned by Shopper Customers `getCustomerOrders` (the attribute must be exposed to SCAPI
 * in Business Manager); an order without it simply has no returns.
 */
export async function fetchCustomerReturns(context: Context, customerId: string): Promise<ReturnRequest[]> {
    const { data } = await createApiClients(context).shopperCustomers.getCustomerOrders({
        params: { path: { customerId }, query: { offset: 0, limit: ORDERS_PAGE_SIZE } },
    });

    return (data?.data ?? []).flatMap((order) => {
        const orderNo = order.orderNo;
        if (!orderNo) return [];
        const stored = parseStoredReturns((order as { c_returns?: unknown }).c_returns);
        if (stored.length === 0) return [];
        const lines: OrderLineForReturn[] = (order.productItems ?? []).flatMap((item) =>
            item.itemId && item.productId
                ? [
                      {
                          itemId: item.itemId,
                          productId: item.productId,
                          productName: (item as { productName?: string }).productName,
                          quantity: item.quantity ?? 1,
                      },
                  ]
                : []
        );
        return stored.map((record) => toReturnRequest(orderNo, record, lines));
    });
}

export type CreateReturnBody = {
    clientRequestId?: string;
    items: {
        itemId: string;
        quantity: number;
        action: ReturnAction;
        reason: ReturnReasonId;
        replacementSku?: string;
    }[];
};

export type ReturnsApiResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Turns an SCAPI failure into a status and a short, safe code. Anything unexpected is a 502. */
function toFailure(context: Context, error: unknown): { ok: false; status: number; error: string } {
    if (error instanceof ApiError) {
        // 400, 404 and 409 come from the server-side rules and mean the request itself was wrong.
        if ([400, 404, 409].includes(error.status)) {
            const type = (error.body?.title as string | undefined) ?? 'rejected';
            return { ok: false, status: error.status, error: type };
        }
        getLogger(context).warn('[Returns] custom API error', { status: error.status });
    } else {
        getLogger(context).error('[Returns] custom API call failed', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return { ok: false, status: 502, error: 'unavailable' };
}

/**
 * Creates a return through the Returns custom API. The API checks that the order belongs to the logged-in shopper
 * and re-runs the return rules, so nothing the browser sent is trusted here.
 */
export async function createReturnViaApi(
    context: Context,
    orderNo: string,
    body: CreateReturnBody
): Promise<ReturnsApiResult<ReturnRequest>> {
    try {
        const { data } = await createApiClients(context).returns.createReturn({
            params: { path: { orderNo } },
            body,
        });
        return { ok: true, value: toReturnRequest(orderNo, normalize(data), []) };
    } catch (error) {
        return toFailure(context, error);
    }
}

export async function advanceReturnViaApi(
    context: Context,
    orderNo: string,
    rmaNo: string,
    expectedStatus: ReturnStatus | undefined
): Promise<ReturnsApiResult<ReturnRequest>> {
    try {
        const { data } = await createApiClients(context).returns.advanceReturn({
            params: { path: { orderNo, rmaNo } },
            body: { expectedStatus },
        });
        return { ok: true, value: toReturnRequest(orderNo, normalize(data), []) };
    } catch (error) {
        return toFailure(context, error);
    }
}

/** Reads the API's record through the same validator the order read path uses, so both paths agree on the shape. */
function normalize(record: unknown) {
    const [stored] = parseStoredReturns({ version: 1, returns: [record] });
    if (!stored) throw new Error('The Returns API sent a record the storefront cannot read.');
    return stored;
}
