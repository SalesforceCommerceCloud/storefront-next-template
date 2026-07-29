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
 * Browser-side correlation id for one shopper's checkout journey. Spans the
 * cart's Checkout button click through Place Order finalize, so log lines
 * from any checkout-flow request can be stitched together.
 *
 * The id is sent on the standard `x-correlation-id` header that the
 * storefront's `correlationMiddleware` already consumes; the logger
 * automatically attaches it to every log line via context, so no per-route
 * plumbing is needed - just send the same id on every fetch in the journey.
 *
 * Two propagation paths:
 * 1. `x-correlation-id` HTTP header on native `fetch()` calls
 *    (place-order-prepare, place-order-finalize).
 * 2. `x-correlation-id` FormData field on `fetcher.submit()` calls
 *    (submit-contact-info, submit-shipping-address, submit-shipping-options,
 *    submit-payment, submit-place-order). React Router's `fetcher.submit`
 *    does not accept a headers option; `correlationMiddleware` falls back
 *    to reading the field from the form body when the header is absent.
 *
 * Stored in `sessionStorage` so it survives page reloads within the same
 * tab. Callers clear it via `clearCheckoutCorrelationId()` before navigating
 * to order confirmation so the next checkout starts fresh.
 */

const STORAGE_KEY = 'checkoutCorrelationId';

/**
 * Session-scoped memo for the browser path when `sessionStorage` throws
 * (e.g. SecurityError). Mid-flow submits in the same page session share one
 * id; `clearCheckoutCorrelationId` resets it so the next checkout is fresh.
 * Not used on the SSR / `sessionStorage === undefined` path.
 */
let transientFallbackId: string | undefined;

/**
 * Mint a correlation id that always matches the middleware validator
 * `/^[A-Za-z0-9._-]{1,128}$/`. Falls back when `crypto.randomUUID` throws
 * (missing/unsupported in some environments).
 */
function safeUuid(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

function getTransientFallbackId(): string {
    if (!transientFallbackId) {
        transientFallbackId = safeUuid();
    }
    return transientFallbackId;
}

/**
 * Returns the existing checkout correlation id, or mints a new one and
 * stores it. Safe to call on the cart page (mints early) and again on the
 * place-order click handler (reads existing).
 *
 * If `sessionStorage` throws (e.g. SecurityError when storage is blocked),
 * returns a transient UUID without propagating the error to callers.
 */
export function getOrCreateCheckoutCorrelationId(): string {
    if (typeof sessionStorage === 'undefined') {
        // SSR / non-browser: fresh id per call — do not memoize across requests.
        return safeUuid();
    }
    try {
        const existing = sessionStorage.getItem(STORAGE_KEY);
        if (existing) return existing;
        const fresh = safeUuid();
        sessionStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
    } catch {
        // SecurityError or any other throw: memoize for this page session.
        return getTransientFallbackId();
    }
}

/** Clear the correlation id. Call before navigating to order confirmation. */
export function clearCheckoutCorrelationId(): void {
    transientFallbackId = undefined;
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // SecurityError or any other throw: ignore; next checkout mints fresh.
    }
}
