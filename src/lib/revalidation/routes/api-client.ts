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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { resourceRoutes } from '@/route-paths';
import { invokeMatchingFetchers } from '@/lib/scapi/fetcher-registry';
import type { DecodedResource } from '@/lib/scapi/resource-encoding';
import { getActionPath, isContextMutation } from './shared';

/**
 * A single revalidation rule: when a mutation matching `when` completes, reload every registered fetcher whose
 * resource matches `affects`. Splitting the two predicates keeps "which mutation fired" (context) cleanly separate
 * from "which fetcher does it invalidate" (resource) — the latter being the per-fetcher dimension React Router's
 * own `shouldRevalidate` cannot see (it is called without the evaluated fetcher's identity).
 */
interface ScapiRevalidationRule {
    /** True when the completed mutation's context should trigger this rule. */
    when: (args: ShouldRevalidateFunctionArgs) => boolean;
    /** True when this fetcher's resource is invalidated by the rule's mutation. */
    affects: (resource: DecodedResource) => boolean;
}

/** True when a non-GET mutation's normalized `formAction` path satisfies `matchesPath`. */
const matchesMutation =
    (matchesPath: (actionPath: string) => boolean) =>
    (args: ShouldRevalidateFunctionArgs): boolean =>
        args.formMethod !== 'GET' && typeof args.formAction === 'string' && matchesPath(args.formAction);

// @sfdc-extension-block-start SFDC_EXT_BOPIS
/**
 * Store-selection mutations: they change *which* store's inventory record a product call reads, not the global stock.
 * A cart mutation alone never moves a product's availability — SCAPI does not reserve inventory on basket changes
 * (that happens at order creation) — so only switching the pickup/selected store can stale a store-scoped product
 * fetcher.
 */
const STORE_SELECTION_MUTATIONS: ReadonlySet<string> = new Set([
    resourceRoutes.setSelectedStore,
    resourceRoutes.cartPickupStoreUpdate,
]);

/**
 * True when the decoded resource is scoped to a specific store's inventory (`options.params.query.inventoryIds`).
 * Keying off this query field rather than the SCAPI method covers every store-scoped call uniformly — `getProduct`,
 * the bulk `getProducts` child-inventory fetch, and any future product call that reads store inventory. A call
 * without `inventoryIds` reads site-default availability, which a store switch does not change, so it is left alone.
 */
function requestsInventoryIds(resource: DecodedResource): boolean {
    const inventoryIds = (resource.options as { params?: { query?: { inventoryIds?: unknown } } })?.params?.query
        ?.inventoryIds;
    return Array.isArray(inventoryIds) && inventoryIds.length > 0;
}
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * The shipped revalidation rules for SCAPI resource-route fetchers (`useScapiFetcher().load()`).
 *
 * This is an allowlist: a localized `load()` fetcher revalidates after a mutation only when a rule says so. The
 * default — no rule — is to NOT reload, because that is the entire reason `useScapiFetcher` exists over a page loader
 * (avoid refetching unrelated data on every interaction). Add a rule when a mutation provably changes the data a
 * fetcher reads.
 *
 * @remarks Each rule pairs a context predicate (`when`) with a resource predicate (`affects`); the two are ANDed
 * per fetcher, and rules are ORed across the set.
 *
 * **What this route governs.** Only the reads invoked through `useScapiFetcher().load()` flow through here:
 * `shopperBasketsV2.getBasket` (basket provider / mini-cart), `shopperProducts.getProduct` (cart-item and
 * bonus-product modals), `shopperProducts.getProducts` (store-scoped bulk inventory), and
 * `shopperSearch.getSearchSuggestions` (optionally with a `prices` expand). Every one of these reads is
 * priced/localized, which is why the global rule's `affects` is unconditional — see that rule's note. A SCAPI
 * write→read coupling that lands on a *page loader* or another resource route is gated there, not here.
 *
 * **Couplings deliberately left without a rule** (write provably stales a governed read, yet no reload is correct):
 * - Cart / promo / payment / place-order writes → `getBasket`: the action returns the new `basket` and the basket
 *   provider is updated from that result (`use-product-actions`, `use-checkout-actions` → `useBasketUpdater`), so the
 *   freshest copy already reaches consumers; a reload would re-fetch a basket the subtree already holds.
 * - Cart writes → product availability (`getProduct`/`getProducts`): adding to cart does not reserve inventory
 *   (SCAPI reserves only at order creation), so a basket change cannot stale a product's stock.
 * - Identity change (`/login`, `/signup`, `/logout`) → `getBasket`: the basket provider is persistent (root-mounted),
 *   so unlike the overlay fetchers it stays active across the identity redirect — but the login action merges the guest
 *   basket server-side (`mergeBasket` → `updateBasketResource`) before returning the redirect, so the re-running root
 *   loader returns the post-merge snapshot and the provider re-seeds from that prop plus the Set-Cookie snapshot on the
 *   same navigation. A fetcher reload would re-read a basket the provider already holds. The context dimension is
 *   matched via {@link isContextMutation}, which excludes the identity routes for exactly this reason.
 */
const REVALIDATION_RULES: readonly ScapiRevalidationRule[] = [
    // A context switch (site/currency/locale or shopper context) re-scopes pricing and localization, and every read
    // this route governs is priced/localized — so it invalidates every registered fetcher unconditionally.
    {
        when: matchesMutation(isContextMutation),
        affects: () => true,
    },
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // Switching the selected/pickup store changes which store's inventory a product call reads, so reload anything
    // scoped to a store's inventory.
    {
        when: matchesMutation((actionPath) => STORE_SELECTION_MUTATIONS.has(actionPath)),
        affects: requestsInventoryIds,
    },
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
];

// React Router calls `shouldRevalidate` once per active resource-route fetcher after a mutation, all with identical
// args. We only want to walk the registry once per revalidation pass — but a "pass" is one mutation, not one
// synchronous burst. This set holds the normalized `formAction`s already walked in the current microtask tick: RR's
// identical-args repeats of a single pass collapse to one walk, while two distinct mutations resolving in the same
// tick (e.g. `setSiteContext` then `updateShopperContext`) each get their own. The set is cleared after the burst via
// `queueMicrotask`. A navigation/GET pass has no `formAction`; the empty-string key dedups it the same way.
const walkedActionsThisTick = new Set<string>();
let resetScheduled = false;

/**
 * `shouldRevalidate` for the generic SCAPI resource route (`/resource/api/client/:resource`).
 *
 * React Router never tells this function which fetcher it's being consulted for. Every active `useScapiFetcher()`
 * fetcher gets the same args, so it cannot make a per-fetcher decision directly. Instead, it uses its own resource
 * as the post-mutation entry point: on the first call of a revalidation pass triggered by a mutation, it iterates the
 * fetcher registry and reloads exactly those registered fetchers whose decoded resource the {@link REVALIDATION_RULES}
 * policy says the mutation invalidates. It always returns `false` for the route's own fetchers — RR's blanket
 * auto-revalidation is replaced by this targeted, registry-driven reload.
 *
 * @remarks The registry walk is a deliberate side effect inside `shouldRevalidate` (normally pure). It is safe here:
 * client-only, idempotent within a pass (guarded by `walkedActionsThisTick`), and `reload()` is itself a
 * `fetcher.load()` that RR serializes. Navigations and loads (no `formMethod`/`formAction`, or `GET`) still walk once,
 * but no rule matches them, so nothing reloads.
 * @see {@link invokeMatchingFetchers}
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
    const { formAction, currentUrl } = args;

    // Normalize `formAction` to a bare pathname so rules can match it against `resourceRoutes.*` constants (handles a
    // trailing `?index` and absolute URLs). Falls back to the empty-string key when no action was submitted.
    const normalizedAction = getActionPath(formAction, currentUrl.origin) ?? '';

    // Walk once per distinct mutation per tick. RR's identical-args repeats of a single pass share `normalizedAction`
    // and so collapse; two different mutations in the same tick each walk.
    if (!walkedActionsThisTick.has(normalizedAction)) {
        walkedActionsThisTick.add(normalizedAction);

        // Reset after the synchronous burst of per-fetcher calls this tick completes.
        if (!resetScheduled) {
            resetScheduled = true;
            queueMicrotask(() => {
                walkedActionsThisTick.clear();
                resetScheduled = false;
            });
        }

        const normalizedArgs: ShouldRevalidateFunctionArgs = { ...args, formAction: normalizedAction };

        // Per registered fetcher, reload it iff some rule both matches the mutation context (`when`) and claims that
        // fetcher's resource (`affects`). This per-fetcher decision is the dimension React Router cannot make here:
        // it consults the route without the evaluated fetcher's identity, so every fetcher would get the same answer.
        invokeMatchingFetchers((resource) =>
            REVALIDATION_RULES.some((rule) => rule.when(normalizedArgs) && rule.affects(resource))
        );
    }

    // Important: The route's own fetchers never auto-revalidate. The registry walk above drives all required reloads.
    return false;
}
