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

import type { OrderReturnStatusType } from '@/lib/order/status';
import { isFinalStatus } from './return-status';
import type { ReturnRequest } from './types';

/**
 * The order-level return badge ("Return Initiated", "Return Complete", ...) for an order, derived from its saved
 * returns. It follows the same rules as the Order Management based status in `lib/order/status.ts`, so both feed the
 * one badge: a finished return outranks an open one, and "partial" means not every unit of the order is covered.
 *
 * A request is finished when it reached its last status (Refunded, or Exchange shipped for an exchange).
 * Returns `undefined` when the order has none, so the caller keeps the normal order status.
 */
export function getOrderReturnStatusFromReturns(
    returns: readonly Pick<ReturnRequest, 'items' | 'status'>[],
    orderUnits: number
): OrderReturnStatusType | undefined {
    let finishedUnits = 0;
    let openUnits = 0;
    for (const request of returns) {
        const units = request.items.reduce((sum, item) => sum + item.quantity, 0);
        if (isFinalStatus(request)) finishedUnits += units;
        else openUnits += units;
    }

    const total = Math.max(orderUnits, finishedUnits + openUnits);
    if (finishedUnits > 0) return finishedUnits >= total ? 'RETURN_COMPLETE' : 'PARTIAL_RETURN_COMPLETE';
    if (openUnits > 0) return openUnits >= total ? 'RETURN_INITIATED' : 'PARTIAL_RETURN_INITIATED';
    return undefined;
}
