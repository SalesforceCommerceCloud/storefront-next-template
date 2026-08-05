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
 * The classified outcome of a cancel-order attempt, consumed by the cancel
 * dialog to pick the right recovery affordance. Shared by both the
 * registered-customer (`action.cancel-order.ts`) and guest
 * (`action.order-lookup-cancel.ts`) cancel flows.
 *
 * - `invalid_input` — locally-detected malformed form input (missing orderNo),
 *   rejected before the SCAPI call is ever made. Never produced by {@link classifyCancelError}.
 * - `invalid_reason` (400) — the provided reason code does not match any reason
 *   configured in OMS.
 * - `not_found` (404) — order doesn't exist or caller lacks access.
 * - `not_cancellable` (409) — order is in a state that prevents cancellation
 *   (e.g., already shipped or cancelled).
 * - `transient` — retryable (5xx, network errors, or any unclassified 4xx).
 */
export type CancelErrorKind = 'invalid_input' | 'invalid_reason' | 'not_found' | 'not_cancellable' | 'transient';

/**
 * Map an HTTP status to a {@link CancelErrorKind}.
 *
 * Unlike return-order, which has per-item validation sub-codes, cancel is
 * order-level only: 400 is always `invalid_reason` (the reason code doesn't
 * match OMS config), 404 is `not_found`, 409 is `not_cancellable`, and
 * everything else is `transient`.
 */
export function classifyCancelError(status: number): CancelErrorKind {
    switch (status) {
        case 400:
            return 'invalid_reason';
        case 404:
            return 'not_found';
        case 409:
            return 'not_cancellable';
        default:
            return 'transient';
    }
}
