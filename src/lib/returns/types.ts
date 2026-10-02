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

/**
 * Shared types for the UI-only returns and exchanges demo. Nothing here touches SFCC or OMS.
 */

export type ReturnAction = 'return' | 'exchange';

export type ItemEligibilityStatus = 'eligible' | 'exchange-only' | 'not-returnable' | 'window-closed';

/** Fixed list of reasons a shopper can pick from. `labelKey` lives in the `returns` i18n namespace. */
export const RETURN_REASONS = [
    { id: 'too-small', labelKey: 'reasons.tooSmall' },
    { id: 'too-large', labelKey: 'reasons.tooLarge' },
    { id: 'defective', labelKey: 'reasons.defective' },
    { id: 'not-as-described', labelKey: 'reasons.notAsDescribed' },
    { id: 'changed-mind', labelKey: 'reasons.changedMind' },
    { id: 'wrong-item', labelKey: 'reasons.wrongItem' },
] as const;

export type ReturnReasonId = (typeof RETURN_REASONS)[number]['id'];

export type ReturnStatus = 'submitted' | 'approved' | 'received' | 'refunded' | 'exchange_shipped';

/** One replacement candidate of the same master product. */
export interface ExchangeVariant {
    sku: string;
    variationValues: Record<string, string>;
    orderable: boolean;
}

export interface VariationAttributeOption {
    id: string;
    name: string;
    values: { value: string; name: string }[];
}

/**
 * A single order line as the return screens need it. Plain serializable data (loader output), so the
 * eligibility module and the UI never touch SCAPI types.
 */
export interface ReturnableLine {
    /** Stable unique key of the line inside the order. */
    lineKey: string;
    sku: string;
    name: string;
    imageUrl?: string;
    /** Quantity ordered on this line. */
    quantity: number;
    categoryId?: string;
    /** Shipment the line belongs to; lines sharing it are shown as one delivery. */
    deliveryId: string;
    /** City the delivery ships from. Set only when the delivery comes from the order's saved split. */
    deliveryCity?: string;
    /** What the 30-day window is measured from: an ISO timestamp, or a `YYYY-MM-DD` delivery date. */
    deliveredAt?: string;
    variationValues: Record<string, string>;
    variationAttributes: VariationAttributeOption[];
    variants: ExchangeVariant[];
}

export interface ReturnItem {
    lineKey: string;
    sku: string;
    name: string;
    imageUrl?: string;
    quantity: number;
    /** Quantity ordered on the line, kept so the store can enforce the per-line cap. */
    orderedQuantity: number;
    action: ReturnAction;
    reason: ReturnReasonId;
    /** Exchange only. Always a variant of the same product. */
    replacementSku?: string;
    replacementLabel?: string;
}

export interface ReturnStatusEntry {
    status: ReturnStatus;
    at: string;
}

export interface ReturnRequest {
    rmaNo: string;
    orderNo: string;
    createdAt: string;
    status: ReturnStatus;
    history: ReturnStatusEntry[];
    items: ReturnItem[];
    /** Set once the status reaches `exchange_shipped`. */
    trackingNo?: string;
    /** Idempotency key of the submission that created this request. */
    clientRequestId?: string;
}

export type CreateReturnInput = Pick<ReturnRequest, 'orderNo' | 'items' | 'clientRequestId'>;
