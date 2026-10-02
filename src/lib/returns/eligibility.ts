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

import defaultPolicy from './return-policy.json';
import {
    RETURN_REASONS,
    type ItemEligibilityStatus,
    type ReturnAction,
    type ReturnItem,
    type ReturnableLine,
} from './types';

/**
 * The only place that knows the return rules. Every screen asks this module; no screen repeats a rule.
 * Pure functions: no I/O, no clock reads (callers pass `now`), so results are identical on server and client.
 *
 * Precedence, most specific first: SKU rule, then category rule, then the default window.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReturnPolicy {
    defaultWindowDays: number;
    nonReturnableCategories: readonly string[];
    /** SKUs that can be neither returned nor exchanged. A SKU rule overrides a category rule. */
    nonReturnableSkus: readonly string[];
    exchangeOnlySkus: readonly string[];
}

export const RETURN_POLICY: ReturnPolicy = defaultPolicy;

/** i18n key (in the `returns` namespace) plus interpolation values, so the UI owns the wording. */
export type EligibilityReasonKey =
    | 'eligibility.reason.eligible'
    | 'eligibility.reason.exchangeOnly'
    | 'eligibility.reason.notReturnable'
    | 'eligibility.reason.windowClosed'
    | 'eligibility.reason.noDeliveryDate';

export interface EligibilityReason {
    key: EligibilityReasonKey;
    values?: Record<string, string>;
}

export interface ItemEligibility {
    status: ItemEligibilityStatus;
    reason: EligibilityReason;
    allowedActions: readonly ReturnAction[];
}

const NO_ACTIONS: readonly ReturnAction[] = Object.freeze([]);
const BOTH_ACTIONS: readonly ReturnAction[] = Object.freeze(['return', 'exchange'] as ReturnAction[]);
const EXCHANGE_ONLY: readonly ReturnAction[] = Object.freeze(['exchange'] as ReturnAction[]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Last instant a return is accepted, or `null` when the delivery date is missing or unparseable.
 * A full timestamp is counted from that moment. A date-only value (a saved delivery date) is counted in whole days, so
 * the window stays open through the whole last day.
 */
export function getWindowEnd(deliveredAt: string | undefined, policy: ReturnPolicy = RETURN_POLICY): Date | null {
    if (!deliveredAt) return null;
    if (DATE_ONLY.test(deliveredAt)) {
        const start = Date.parse(`${deliveredAt}T00:00:00Z`);
        return Number.isNaN(start) ? null : new Date(start + (policy.defaultWindowDays + 1) * DAY_MS - 1);
    }
    const delivered = new Date(deliveredAt);
    if (Number.isNaN(delivered.getTime())) return null;
    return new Date(delivered.getTime() + policy.defaultWindowDays * DAY_MS);
}

export function getItemEligibility(
    item: Pick<ReturnableLine, 'sku' | 'categoryId' | 'deliveredAt'>,
    now: Date,
    policy: ReturnPolicy = RETURN_POLICY
): ItemEligibility {
    // 1. SKU rules. Not returnable is checked first, so a SKU listed in both lists gets the stricter rule.
    if (policy.nonReturnableSkus.includes(item.sku)) {
        return {
            status: 'not-returnable',
            reason: { key: 'eligibility.reason.notReturnable' },
            allowedActions: NO_ACTIONS,
        };
    }
    if (policy.exchangeOnlySkus.includes(item.sku)) {
        return {
            status: 'exchange-only',
            reason: { key: 'eligibility.reason.exchangeOnly' },
            allowedActions: EXCHANGE_ONLY,
        };
    }

    // 2. Category rule
    if (item.categoryId && policy.nonReturnableCategories.includes(item.categoryId)) {
        return {
            status: 'not-returnable',
            reason: { key: 'eligibility.reason.notReturnable' },
            allowedActions: NO_ACTIONS,
        };
    }

    // 3. Default window
    const windowEnd = getWindowEnd(item.deliveredAt, policy);
    if (!windowEnd) {
        return {
            status: 'window-closed',
            reason: { key: 'eligibility.reason.noDeliveryDate' },
            allowedActions: NO_ACTIONS,
        };
    }
    if (now.getTime() > windowEnd.getTime()) {
        return {
            status: 'window-closed',
            reason: { key: 'eligibility.reason.windowClosed', values: { date: windowEnd.toISOString() } },
            allowedActions: NO_ACTIONS,
        };
    }
    return {
        status: 'eligible',
        reason: { key: 'eligibility.reason.eligible', values: { date: windowEnd.toISOString() } },
        allowedActions: BOTH_ACTIONS,
    };
}

/** Group lines by delivery, keeping first-seen order so the screen is stable between renders. */
export function groupLinesByDelivery(
    lines: readonly ReturnableLine[]
): { deliveryId: string; lines: ReturnableLine[] }[] {
    const groups = new Map<string, ReturnableLine[]>();
    for (const line of lines) {
        const group = groups.get(line.deliveryId);
        if (group) group.push(line);
        else groups.set(line.deliveryId, [line]);
    }
    return Array.from(groups, ([deliveryId, groupLines]) => ({ deliveryId, lines: groupLines }));
}

/** Quantity of each line already covered by existing requests, so it cannot be requested twice. */
export function getRequestedQuantities(existing: readonly { items: readonly ReturnItem[] }[]): Map<string, number> {
    const requested = new Map<string, number>();
    for (const request of existing) {
        for (const item of request.items) {
            requested.set(item.lineKey, (requested.get(item.lineKey) ?? 0) + item.quantity);
        }
    }
    return requested;
}

export type SelectionError =
    | 'empty'
    | 'unknown-line'
    | 'invalid-quantity'
    | 'quantity-exceeded'
    | 'action-not-allowed'
    | 'missing-reason'
    | 'invalid-replacement';

export type SelectionValidation = { ok: true } | { ok: false; error: SelectionError; lineKey?: string };

/**
 * Validates a submission against the lines and the policy. The form disables Submit using this same function
 * and re-runs it on submit, so a stale or tampered selection can never reach the store.
 */
export function validateSelection(
    selection: readonly ReturnItem[],
    lines: readonly ReturnableLine[],
    alreadyRequested: ReadonlyMap<string, number>,
    now: Date,
    policy: ReturnPolicy = RETURN_POLICY
): SelectionValidation {
    if (selection.length === 0) return { ok: false, error: 'empty' };

    const linesByKey = new Map(lines.map((line) => [line.lineKey, line]));
    const seen = new Set<string>();

    for (const item of selection) {
        const line = linesByKey.get(item.lineKey);
        if (!line || seen.has(item.lineKey)) return { ok: false, error: 'unknown-line', lineKey: item.lineKey };
        seen.add(item.lineKey);

        const remaining = line.quantity - (alreadyRequested.get(line.lineKey) ?? 0);
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
            return { ok: false, error: 'invalid-quantity', lineKey: line.lineKey };
        }
        if (item.quantity > remaining) return { ok: false, error: 'quantity-exceeded', lineKey: line.lineKey };

        if (!getItemEligibility(line, now, policy).allowedActions.includes(item.action)) {
            return { ok: false, error: 'action-not-allowed', lineKey: line.lineKey };
        }
        if (!RETURN_REASONS.some((reason) => reason.id === item.reason)) {
            return { ok: false, error: 'missing-reason', lineKey: line.lineKey };
        }

        if (item.action === 'exchange') {
            const replacement = line.variants.find((variant) => variant.sku === item.replacementSku);
            if (!replacement || !replacement.orderable || replacement.sku === line.sku) {
                return { ok: false, error: 'invalid-replacement', lineKey: line.lineKey };
            }
        }
    }
    return { ok: true };
}
