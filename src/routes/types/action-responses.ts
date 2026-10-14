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

import type { ShopperBasketsV2 } from '@/scapi';
import type { ActionError, ErrorCode } from '@/lib/error-codes';

// Generic response types for actions
export interface ActionResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: ActionError;
}

// Specific response types for common actions
export interface BasketActionResponse extends ActionResponse {
    basket?: ShopperBasketsV2.schemas['Basket'];
}

/** Why a line item couldn't be added during a reorder. */
export type SkippedReason =
    | typeof ErrorCode.OUT_OF_STOCK
    | typeof ErrorCode.INSUFFICIENT_QUANTITY
    | typeof ErrorCode.NOT_ORDERABLE
    | typeof ErrorCode.NOT_FOUND;

export interface SkippedOrderItem {
    productId: string;
    productName?: string;
    requestedQuantity: number;
    reason: SkippedReason;
}

export interface AdjustedOrderItem {
    productId: string;
    productName?: string;
    requestedQuantity: number;
    addedQuantity: number;
}

export interface ReorderActionResponse extends BasketActionResponse {
    skippedItems?: SkippedOrderItem[];
    adjustedItems?: AdjustedOrderItem[];
}

// Utility functions for creating standardized responses
export const createSuccessResponse = <T>(data: T): ActionResponse<T> => ({
    success: true,
    data,
});

export const createBasketSuccessResponse = (basket: ShopperBasketsV2.schemas['Basket']): BasketActionResponse => ({
    success: true,
    basket,
});
