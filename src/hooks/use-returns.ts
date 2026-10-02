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
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import {
    getReturnsServerSnapshot,
    getReturnsSnapshot,
    isFinalStatus,
    subscribeToReturns,
    type ReturnsBackend,
    type ReturnsSnapshot,
} from '@/lib/returns/return-store';
import type { OrderReturnStatusType } from '@/lib/order/status';
import { getOrderReturnStatusFromReturns } from '@/lib/returns/order-return-status';
import type { ReturnRequest } from '@/lib/returns/types';

/**
 * Reads the return store. `ready` is false on the server and during hydration, so the first client render matches the
 * server HTML; callers render nothing (badge) or a skeleton (tracking page) until it turns true.
 */
export function useReturns(): ReturnsSnapshot {
    // Returns live on the order when the Returns custom API is deployed, otherwise in this browser.
    const backend: ReturnsBackend = useConfig().features?.returnsCustomApi ? 'api' : 'browser';
    // Both callbacks only change when the backend does, so React keeps one subscription and never re-subscribes in a loop.
    const subscribe = useCallback((listener: () => void) => subscribeToReturns(listener, backend), [backend]);
    const getSnapshot = useCallback(() => getReturnsSnapshot(backend), [backend]);
    return useSyncExternalStore(subscribe, getSnapshot, getReturnsServerSnapshot);
}

export function useReturnForOrder(orderNo: string | undefined): { ready: boolean; request: ReturnRequest | undefined } {
    const { ready, returns } = useReturns();
    return useMemo(() => {
        const forOrder = returns.filter((request) => request.orderNo === orderNo);
        return { ready, request: forOrder[forOrder.length - 1] };
    }, [ready, returns, orderNo]);
}

export function useReturnByRma(rmaNo: string | undefined): { ready: boolean; request: ReturnRequest | undefined } {
    const { ready, returns } = useReturns();
    return useMemo(
        () => ({ ready, request: returns.find((request) => request.rmaNo === rmaNo) }),
        [ready, returns, rmaNo]
    );
}

/**
 * `inProgress` is true while any request for the order has not reached its final status (Refunded / Exchange shipped).
 * `ready` is false on the server and during hydration.
 */
export function useReturnInProgress(orderNo: string | undefined): { ready: boolean; inProgress: boolean } {
    const { ready, returns } = useReturns();
    return useMemo(
        () => ({
            ready,
            inProgress: returns.some((request) => request.orderNo === orderNo && !isFinalStatus(request)),
        }),
        [ready, returns, orderNo]
    );
}

/** All returns of an order, oldest first. */
export function useOrderReturns(orderNo: string | undefined): { ready: boolean; requests: readonly ReturnRequest[] } {
    const { ready, returns } = useReturns();
    return useMemo(
        () => ({ ready, requests: returns.filter((request) => request.orderNo === orderNo) }),
        [ready, returns, orderNo]
    );
}

/**
 * The order-level return status for the order badge, from this order's saved returns. `undefined` while the store is
 * loading and for orders without returns, so the normal order status shows.
 */
export function useOrderReturnStatus(
    orderNo: string | undefined,
    orderUnits: number
): OrderReturnStatusType | undefined {
    const { ready, requests } = useOrderReturns(orderNo);
    return useMemo(
        () => (ready ? getOrderReturnStatusFromReturns(requests, orderUnits) : undefined),
        [ready, requests, orderUnits]
    );
}
