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

import type { ReturnAction, ReturnStatus, ReturnStatusEntry } from './types';

/**
 * Status flow shared by the browser store, the storefront server code and (as a plain ES5 copy, checked by a parity
 * test) the Returns custom API: Submitted, Approved, Received, then Refunded for a return or Exchange shipped for an
 * exchange. Pure functions only.
 */

const STEPS_BEFORE_FINAL: readonly ReturnStatus[] = ['submitted', 'approved', 'received'];

interface WithItems {
    items: readonly { action: ReturnAction }[];
}

/** Status the request ends in. Any exchange line means the final step is "Exchange shipped". */
export function getFinalStatus(request: WithItems): ReturnStatus {
    return request.items.some((item) => item.action === 'exchange') ? 'exchange_shipped' : 'refunded';
}

/** Ordered steps for a request, used by the timeline. */
export function getStatusSteps(request: WithItems): ReturnStatus[] {
    return [...STEPS_BEFORE_FINAL, getFinalStatus(request)];
}

export function isFinalStatus(request: WithItems & { status: ReturnStatus }): boolean {
    return request.status === getFinalStatus(request);
}

/** Derived from the RMA number, so advancing twice can never produce two different tracking numbers. */
export function getMockTrackingNo(rmaNo: string): string {
    let hash = 0;
    for (let i = 0; i < rmaNo.length; i += 1) hash = (hash * 31 + rmaNo.charCodeAt(i)) >>> 0;
    return `1Z${String(hash).padStart(10, '0').slice(-10)}DEMO`;
}

interface AdvanceableRecord extends WithItems {
    rmaNo: string;
    status: ReturnStatus;
    history: readonly ReturnStatusEntry[];
    trackingNo?: string | null;
}

/**
 * Moves a record one step forward and returns the new record. When `expectedStatus` is given and differs from the
 * record's status (a double click, or another device already advanced it), or the record is already final, the same
 * record object is returned unchanged, so a step is never skipped.
 */
export function advanceStatusRecord<T extends AdvanceableRecord>(
    record: T,
    expectedStatus: ReturnStatus | undefined,
    nowIso: string
): T {
    if (expectedStatus && record.status !== expectedStatus) return record;
    const steps = getStatusSteps(record);
    const next = steps[steps.indexOf(record.status) + 1];
    if (!next) return record;

    return {
        ...record,
        status: next,
        history: [...record.history, { status: next, at: nowIso }],
        ...(next === 'exchange_shipped' ? { trackingNo: getMockTrackingNo(record.rmaNo) } : {}),
    };
}
