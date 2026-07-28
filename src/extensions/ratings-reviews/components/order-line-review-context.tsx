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
/** @sfdc-extension-file SFDC_EXT_RATINGS_REVIEWS */
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { ShopperProducts } from '@/scapi';

/**
 * Per-line context used to forward order-line review props through the
 * `<UITarget targetId="sfcc.account.orderDetail.lineReview" />` boundary.
 * UITarget is a passthrough marker — it can't carry per-iteration props,
 * so the parent list wraps each item with `OrderLineReviewSlot` to provide
 * them via context.
 */
export interface OrderLineReviewSlotValue {
    product: ShopperProducts.schemas['Product'];
    lineKey: string;
    reviewSubmitted: boolean;
    onLineReviewSubmitted: (lineKey: string) => void;
}

const OrderLineReviewSlotContext = createContext<OrderLineReviewSlotValue | null>(null);

export function useOrderLineReviewSlot(): OrderLineReviewSlotValue | null {
    return useContext(OrderLineReviewSlotContext);
}

export type OrderLineReviewSlotProps = PropsWithChildren<OrderLineReviewSlotValue>;

export function OrderLineReviewSlot({
    product,
    lineKey,
    reviewSubmitted,
    onLineReviewSubmitted,
    children,
}: OrderLineReviewSlotProps): ReactElement {
    const value: OrderLineReviewSlotValue = { product, lineKey, reviewSubmitted, onLineReviewSubmitted };
    return <OrderLineReviewSlotContext.Provider value={value}>{children}</OrderLineReviewSlotContext.Provider>;
}
