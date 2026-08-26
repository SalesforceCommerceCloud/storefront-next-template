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
 * Server-side (in-process) failed-verification-attempt counter for guest order lookup,
 * keyed by `${siteId}:${orderHash}` — the same order number on two different sites gets
 * independent attempt budgets and can't lock each other out.
 *
 * Complements the signed `attempts` field carried in the per-order state cookie
 * (`session.server.ts`): that field is client-supplied on every request, so a caller that
 * simply omits the cookie always presents `attempts: 0`, making the advertised attempt limit
 * unenforceable against an attacker willing to drop cookies. This store lives entirely in the
 * server process — never serialized to the client — so it keeps counting regardless of what
 * the caller sends.
 *
 * Anchored on `globalThis` via `Symbol.for` (same pattern as
 * `storefront-next-runtime`'s data-store entry cache) so a warm serverless container reuses one
 * shared map across requests and across any duplicated module graph, instead of each getting
 * its own fresh, always-empty counter.
 *
 * Limitation: this is a per-container counter, not a distributed one. A request that lands on a
 * different (cold-started or otherwise idle) container starts with its own independent count.
 * It raises the bar against brute-forcing without new infrastructure; SCAPI's own per-order
 * throttling remains the hard backstop.
 */

const STORE_SYMBOL = Symbol.for('@salesforce/template/order/verify-attempts');

type AttemptRecord = {
    count: number;
    /** Absolute epoch-ms expiry; the record is stale (and treated as absent) once `Date.now() >= expiresAt`. */
    expiresAt: number;
};

type GlobalWithStore = typeof globalThis & { [STORE_SYMBOL]?: Map<string, AttemptRecord> };

/** Upper bound on distinct order hashes tracked at once, evicted oldest-first, so a flood of distinct orders can't grow a warm container's memory without bound. */
const MAX_TRACKED_ORDERS = 10_000;

function getStore(): Map<string, AttemptRecord> {
    const globalWithStore = globalThis as GlobalWithStore;
    return (globalWithStore[STORE_SYMBOL] ??= new Map());
}

function pruneIfNeeded(store: Map<string, AttemptRecord>): void {
    if (store.size <= MAX_TRACKED_ORDERS) return;
    // Map preserves insertion order — the first key is the oldest tracked order hash.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
}

/**
 * Composes the store key from siteId and order hash — the same order number on two different
 * sites must not share (or exhaust) one another's attempt budget.
 */
function storeKey(siteId: string, orderHash: string): string {
    return `${siteId}:${orderHash}`;
}

/**
 * Current failed-attempt count for an order hash on a given site. Returns `0` for an untracked
 * or expired hash.
 */
export function getServerVerifyAttempts(siteId: string, orderHash: string): number {
    const store = getStore();
    const key = storeKey(siteId, orderHash);
    const record = store.get(key);
    if (!record) return 0;
    if (Date.now() >= record.expiresAt) {
        store.delete(key);
        return 0;
    }
    return record.count;
}

/**
 * Records a failed verification attempt for an order hash on a given site and returns the new
 * count.
 *
 * @param siteId - The site the attempt was made against — keeps per-site attempt budgets independent
 * @param orderHash - The hashed order number (see `hashOrderNumber`)
 * @param ttlSeconds - How long the count stays valid — callers pass the same TTL as the access
 *   code itself (`ACCESS_CODE_TTL_SECONDS`), so the counter never outlives the code it's guarding.
 */
export function recordFailedVerifyAttempt(siteId: string, orderHash: string, ttlSeconds: number): number {
    const store = getStore();
    const key = storeKey(siteId, orderHash);
    const now = Date.now();
    const existing = store.get(key);
    const count = existing && existing.expiresAt > now ? existing.count + 1 : 1;
    store.set(key, { count, expiresAt: now + ttlSeconds * 1000 });
    pruneIfNeeded(store);
    return count;
}

/** Clears the failed-attempt count for an order hash on a given site — called on successful verification. */
export function clearServerVerifyAttempts(siteId: string, orderHash: string): void {
    getStore().delete(storeKey(siteId, orderHash));
}

/** Test-only: clears every tracked order hash so test cases don't leak counters into each other. */
export function __resetVerifyAttemptsForTests(): void {
    getStore().clear();
}
