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

import { advanceStatusRecord } from './return-status';
import { RETURN_REASONS, type ReturnAction, type ReturnRequest, type ReturnReasonId, type ReturnStatus } from './types';

export { advanceStatusRecord };

/**
 * How returns are saved on the order: the Text attribute `c_returns`, holding versioned JSON. Only what cannot be
 * derived from the order is stored; names, SKUs and ordered quantities are read back from the order lines.
 * The shape is a contract with the Returns custom API: change it only by bumping `version`.
 */
export const RETURNS_ATTRIBUTE = 'c_returns';
export const RETURNS_VERSION = 1;

export interface StoredReturnItem {
    /** Order line item id. */
    itemId: string;
    quantity: number;
    action: ReturnAction;
    reason: ReturnReasonId;
    replacementSku?: string;
}

export interface StoredReturn {
    rmaNo: string;
    status: ReturnStatus;
    /** Idempotency key the storefront sent, so a repeated submit returns this return instead of creating another. */
    clientRequestId?: string;
    items: StoredReturnItem[];
    history: { status: ReturnStatus; at: string }[];
    trackingNo: string | null;
}

const STATUSES: readonly string[] = ['submitted', 'approved', 'received', 'refunded', 'exchange_shipped'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function parseItem(value: unknown): StoredReturnItem | null {
    if (!isRecord(value)) return null;
    const { itemId, quantity, action, reason, replacementSku } = value;
    if (typeof itemId !== 'string' || !itemId) return null;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return null;
    if (action !== 'return' && action !== 'exchange') return null;
    if (!RETURN_REASONS.some((candidate) => candidate.id === reason)) return null;
    return {
        itemId,
        quantity,
        action,
        reason: reason as ReturnReasonId,
        ...(typeof replacementSku === 'string' && replacementSku ? { replacementSku } : {}),
    };
}

function parseReturn(value: unknown): StoredReturn | null {
    if (!isRecord(value)) return null;
    const { rmaNo, status, clientRequestId, items, history, trackingNo } = value;
    if (typeof rmaNo !== 'string' || !rmaNo || typeof status !== 'string' || !STATUSES.includes(status)) return null;
    if (!Array.isArray(items) || items.length === 0 || !Array.isArray(history) || history.length === 0) return null;

    const parsedItems = items.map(parseItem);
    if (parsedItems.some((item) => item === null)) return null;
    const parsedHistory = history.map((entry) =>
        isRecord(entry) &&
        typeof entry.status === 'string' &&
        STATUSES.includes(entry.status) &&
        typeof entry.at === 'string'
            ? { status: entry.status as ReturnStatus, at: entry.at }
            : null
    );
    if (parsedHistory.some((entry) => entry === null)) return null;

    return {
        rmaNo,
        status: status as ReturnStatus,
        ...(typeof clientRequestId === 'string' && clientRequestId ? { clientRequestId } : {}),
        items: parsedItems as StoredReturnItem[],
        history: parsedHistory as StoredReturn['history'],
        trackingNo: typeof trackingNo === 'string' && trackingNo ? trackingNo : null,
    };
}

/**
 * Reads `order.c_returns`. A missing, malformed or unknown-version value is an empty list, and a single damaged entry
 * is dropped, so one bad record can never take down an order page.
 */
export function parseStoredReturns(raw: unknown): StoredReturn[] {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        if (!raw.trim()) return [];
        try {
            value = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!isRecord(value) || value.version !== RETURNS_VERSION || !Array.isArray(value.returns)) return [];
    return value.returns.flatMap((entry) => {
        const parsed = parseReturn(entry);
        return parsed ? [parsed] : [];
    });
}

export interface OrderLineForReturn {
    itemId: string;
    productId: string;
    productName?: string;
    quantity: number;
}

/** Joins a stored return with its order's lines into the shape the screens use. */
export function toReturnRequest(
    orderNo: string,
    stored: StoredReturn,
    lines: readonly OrderLineForReturn[]
): ReturnRequest {
    const byId = new Map(lines.map((line) => [line.itemId, line]));
    return {
        rmaNo: stored.rmaNo,
        orderNo,
        createdAt: stored.history[0]?.at ?? '',
        status: stored.status,
        history: stored.history,
        ...(stored.trackingNo ? { trackingNo: stored.trackingNo } : {}),
        items: stored.items.map((item) => {
            const line = byId.get(item.itemId);
            return {
                lineKey: item.itemId,
                sku: line?.productId ?? '',
                name: line?.productName ?? line?.productId ?? item.itemId,
                quantity: item.quantity,
                orderedQuantity: line?.quantity ?? item.quantity,
                action: item.action,
                reason: item.reason,
                ...(item.replacementSku
                    ? { replacementSku: item.replacementSku, replacementLabel: item.replacementSku }
                    : {}),
            };
        }),
    };
}
