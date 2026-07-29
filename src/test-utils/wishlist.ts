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
 * Test-only helpers for driving the module-level wishlist singleton (see `@/providers/wishlist`).
 * These live outside the provider so they never enter the runtime bundle — only test files import
 * from `@/test-utils/*`. They mutate the provider's `@internal` `wishlistState`/store exports
 * directly, matching what the provider's own load/session logic does.
 */
import { pendingStore, wishlistState, wishlistStore } from '@/providers/wishlist';

/** Reset all module-level wishlist state between tests. */
export function resetWishlistStore(): void {
    wishlistState.sessionCustomerId = null;
    wishlistState.loadState = { done: false, inFlight: null };
    wishlistState.pendingRemovals = new Set();
    wishlistState.loadRequested = false;
    wishlistState.writeChain = Promise.resolve();
    pendingStore.reset();
    wishlistStore.replaceAll(new Set());
}

/**
 * Seed the store as if `productIds` were already present for `customerId`. Defaults to marking the
 * load done so no lazy read fires (renders a filled heart without a provider wrapper). Pass
 * `{ loaded: false }` to simulate a bound session whose lazy read hasn't run yet.
 */
export function seedWishlistStore(
    customerId: string | null,
    productIds: readonly string[],
    options: { loaded?: boolean } = {}
): void {
    const { loaded = true } = options;
    wishlistState.sessionCustomerId = customerId;
    wishlistState.loadState = { done: loaded, inFlight: null };
    wishlistState.pendingRemovals = new Set();
    wishlistState.loadRequested = false;
    wishlistStore.replaceAll(new Set(productIds));
}
