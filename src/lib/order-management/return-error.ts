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
import { ApiError } from '@/scapi';

/**
 * The classified outcome of a return-order attempt, consumed by the return
 * dialog to pick the right recovery affordance. A port of PWA Kit's
 * `return-error-utils.js` `ERROR_CODE_TO_KIND` mapping.
 *
 * - `invalid_input` — locally-detected malformed form input, rejected before the
 *   SCAPI call is ever made. Never produced from a server response.
 * - `invalid_reason` / `unknown_items` / `quantity_exceeded` — the three 400
 *   sub-codes that carry a specific, per-item recovery affordance.
 * - `not_found` (404) / `not_returnable` (409) — terminal; submit stays disabled.
 * - `transient` — retryable inline (submit stays enabled). Covers 5xx, network
 *   errors, AND any 400 without a recognized recovery sub-code (`OrderReturnFailed`
 *   or an absent/unknown code).
 */
export type ReturnErrorKind =
    | 'invalid_input'
    | 'invalid_reason'
    | 'unknown_items'
    | 'quantity_exceeded'
    | 'not_found'
    | 'not_returnable'
    | 'transient';

/**
 * Map an HTTP status + optional SCAPI error sub-code to a {@link ReturnErrorKind}.
 *
 * The 400 switch mirrors PWA Kit's `return-error-utils.js`: only the three
 * per-item codes carry a recovery affordance. `OrderReturnFailed` — which the API
 * can return on EITHER a 400 or a 409 — and any other/absent 400 code carry none,
 * so they deliberately fall through to `transient` (retryable inline), NOT
 * `invalid_input` (that kind is reserved for locally-detected malformed form input
 * before the API call).
 */
export function classifyReturnError(status: number, code?: string): ReturnErrorKind {
    if (status === 400) {
        switch (code) {
            case 'InvalidReasonCode':
                return 'invalid_reason';
            case 'UnknownProductItemIds':
                return 'unknown_items';
            case 'ReturnQuantityExceeded':
                return 'quantity_exceeded';
            // OrderReturnFailed (also seen on 409) and any other/absent 400 code
            // carry no per-item recovery affordance → retryable inline.
            default:
                return 'transient';
        }
    }
    switch (status) {
        case 404:
            return 'not_found';
        case 409:
            return 'not_returnable';
        default:
            return 'transient';
    }
}

/**
 * Safely extract the SCAPI error sub-code from a thrown error, never throwing.
 *
 * Unlike PWA Kit's `return-error-utils.js` — which reads a one-shot fetch
 * `Response` stream and must guard against `bodyUsed` — SFN's fetch client
 * (`storefront-next-runtime/.../createClient.ts`) parses the error body up front
 * and hands the already-parsed object to `ApiError` as `error.body`. So there is
 * no stream to re-read and no `bodyUsed` hazard here; we just read the
 * discriminator off `error.body`.
 *
 * The sub-code lives in the RFC 7807 `type` field (e.g. `"InvalidReasonCode"`).
 * Some gateways emit it as a URI or `#fragment`, so we normalize to the trailing
 * token. Falls back to a bare `errorCode` field for robustness, and returns
 * `undefined` for anything that isn't an `ApiError` with a usable code.
 */
export function readReturnErrorCode(error: unknown): string | undefined {
    if (!(error instanceof ApiError)) {
        return undefined;
    }
    const body = error.body as { type?: unknown; errorCode?: unknown } | undefined;
    const raw = pickString(body?.type) ?? pickString(body?.errorCode);
    if (!raw) {
        return undefined;
    }
    // Normalize a URI / `#fragment` / path form to its trailing token:
    // "about:blank#InvalidReasonCode" or ".../InvalidReasonCode" → "InvalidReasonCode".
    const token = raw.split(/[#/]/).pop()?.trim();
    return token || undefined;
}

function pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
