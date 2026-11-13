# Store selection and Shopper Context

| Configuration | Selection behavior |
| --- | --- |
| `features.shopperContext.enabled: false`, `storeSelection.cleanup: false` | Validate stores, persist the existing locator cookie and retain BOPIS behavior. No native Shopper Context requests. |
| `enabled: true`, `storeSelectionEnabled: false` | Keep generic URL qualifiers and cookie-based locator/BOPIS selection. |
| `enabled: true`, `storeSelectionEnabled: true` | Validate trusted mappings, update native qualification, then publish the selected-store cookie. |
| `storeSelectionEnabled: false`, `cleanup: true` | Drain store-owned native qualifiers before commerce reads. Nonempty baskets require the confirmed-change integration. |

## Configure trusted assignments

Set `features.shopperContext.enabled` and `features.shopperContext.storeSelectionEnabled` to `true`, then configure `features.shopperContext.storeSelection` in `config.server.ts`. Generic Shopper Context remains usable without opting in to store ownership; existing URL qualifiers keep their behavior. Grocery inherits this configuration and ships disabled. Map each site's stores to their native inventory list and the exact case-sensitive Ecom assignment values:

```typescript
storeSelection: {
    qualifierKeys: ['store'],
    storeValidationTtlSeconds: 30,
    storesBySite: {
        GroceryNext: {
            'store-a': {
                inventoryId: 'inventory-a',
                assignmentQualifiers: { store: 'store-a' },
            },
        },
    },
    cleanup: false,
}
```

The mapping is merchant data. Provision the inventory lists, store assignments and qualification rules in Ecom before enabling. The Store API's `inventoryId` must match the configured value. Every mapped store must supply exactly the configured qualifier keys. The [unit fixture](../src/extensions/store-locator/tests/fixtures/store-selection.json) includes two stores and group qualification; its identifiers are test doubles.

`storeSelection` can also be overridden as a JSON object with `PUBLIC__app__features__shopperContext__storeSelection`. `PUBLIC__app__features__shopperContext__enabled` enables generic Shopper Context; `PUBLIC__app__features__shopperContext__storeSelectionEnabled` opts store selection into native ownership. Both default to `false`. Neither variable is required to boot the app. Credentials stay in the existing server-side SCAPI/authentication infrastructure.

Successful Store API validation for ordinary restores is cached per process for `storeValidationTtlSeconds` (default 30 seconds; 0 disables; values outside 0–300 disable caching). The cache holds at most 1,000 entries and is partitioned by backend, organization/client, shopper/session, site/locale/currency, store and trusted mapping. Expiry is fixed from validation time. Missing stores and failures are not cached, and failed refreshes cannot reuse an older success. Explicit selection actions, controlled cleanup and missing/damaged native-context repair validate afresh. Merchant Store API overrides that vary within this scope must disable caching. Native readiness and authoritative basket checks are never cached by this optimization. This bounds store-data staleness to the configured TTL and is not a distributed consistency or authorization guarantee.

The selection policy, including every site's mappings, is stripped from browser configuration. The client receives the two enabled flags and the resolved current selection; the server retains the full policy.

## Selection contract

Use the existing `/action/set-selected-store` action with `storeInfo` JSON or an empty string to clear. The BFF resolves store names and inventory; browser-supplied assignment values are ignored and inventory mismatches are rejected. Native success precedes `Set-Cookie` and client selection updates. Errors do not activate the candidate.

The response and root loader expose `shoppingContext`: site, preparing store, inventory, committed context revision/time, selection origin and current-session explicit-choice lineage. Fulfillment mode, identity reconciliation and service versions belong to their integration stories. The compatible `selectedStoreInfo` remains available to locator/BOPIS consumers.

Native context owns the enabled selection. The reserved custom qualifier `sfnextStoreSelection` records its revision and explicit clear, alongside the configured assignment keys. Unrelated source code, coupons, customer groups and custom/assignment qualifiers are preserved. URL and generic qualifier controls cannot change configured store keys.

Before dependent loaders, one request-scoped empty native PATCH retrieves authoritative state. This deliberately adds a native round trip per enabled request, rather than trusting a cookie TTL to prove that context still exists. Normal requests need no native GET. Only the specific `shopper-context-not-found` fault permits creation from validated creation defaults; PUT creation omits null qualifier dictionary entries, preserving clear metadata without persisting null values that can break dependent commerce reads. PUT returns no body, so creation is verified with one GET. Other native failures stop dependent commerce reads. For ordinary cookie-based selection, a Store API outage leaves the remembered cookie intact and renders without an active store; explicit selection still requires successful validation. This is not an atomic create-if-absent or a distributed write lock.

Known SDK token invalidation follows centralized auth recovery. Other failures use stable codes: upstream throttling returns 503 `STORE_CONTEXT_RATE_LIMITED`, temporary unavailability 503 `STORE_CONTEXT_UNAVAILABLE`, timeout 504 `STORE_CONTEXT_TIMEOUT`, and rejected server-generated upstream requests 500 `STORE_CONTEXT_REJECTED`. Valid upstream `Retry-After` is retained for throttling/unavailability; upstream bodies stay server-side. No failed or uncertain write is automatically retried by store selection.

Reconciliation failures on page loads and client navigation use the existing route error boundary. Selection actions retain structured failure responses; failures never publish a replacement selection. Store selection does not override route cache policies. Graceful partial browsing is a separate integration.

Restore resolves the remembered store ID against current Store API data and trusted mappings; stale cookie inventory/display values are replaced. Explicit selection requests with mismatched inventory are still rejected. A valid remembered store repairs expired context, including same-store selection. A native record repairs a missing/stale cookie after lost responses; an explicit native clear prevents an old cookie from resurrecting the choice. `storeChoiceSession` is an HttpOnly browser-session lineage cookie, independent of token refresh. The HttpOnly `storeChoiceRecord` preserves provenance across native expiry.

The session and record cookies are **unsigned, client-asserted preference metadata**. A matching session marker distinguishes an explicit preference from a remembered store for shopping behavior; it is not authenticated evidence of a user action. The marker includes site, version and issued time, with a 24-hour maximum age that passive reads do not renew. Malformed, oversized, expired or mismatched metadata is ignored. These checks do not prevent a shopper from changing their own preference or timestamps.

Preference metadata never authorizes store access, inventory/qualifier values, basket changes, checkout or account-default persistence. Native context remains authoritative while present. Missing-context repair independently validates the store and trusted mappings, rejects native conflicts and checks the actual baskets. Client-asserted origin, revisions and timestamps cannot bypass those checks. No additional signing secret is required; public and private SLAS clients follow the same preference contract. Neither cookie contains credentials.

Passive reconciliation writes selection/provenance cookies only when their values differ or a replica is missing. Successful explicit select/change/clear refreshes cookie expiry. Unchanged reads do not extend the one-year retention period.

If a committed store is deleted or its inventory mapping becomes invalid, commerce reads stop. An explicit selection action can clear it or replace it with a validated store after checking the shopper's actual baskets. Requests with product items still require confirmed-change recovery; unrelated actions cannot bypass reconciliation.

Recovery also requires the committed store's trusted assignment mapping to remain configured and any surviving native values to agree with it. Missing mappings or conflicting native qualifiers remain blocked; recovery cannot overwrite them.

## Basket-change integration

A native store change or clear checks the shopper's actual baskets, including when the basket cookie is absent. A basket with product items returns HTTP 409 and the SDK's `ConfirmedContextChangeRequired` contract (`STORE_CHANGE_CONFIRMATION_REQUIRED`, current selection, validated candidate). The active selection remains unchanged. A same-store repair backed by the committed native record does not switch stores. If native lineage is entirely missing and the basket has items, restoration stops with HTTP 409 and delegates recovery to the same confirmed-change integration; a cookie alone cannot authorize that transition.

The preview/apply workstream must consume this handoff and publish the confirmed context and recalculated basket together. No browser `confirmed` flag bypasses the boundary. Preview, consent, basket recalculation, durable recovery and write-boundary concurrency guarantees are separate dependencies. Existing BOPIS picker callbacks cannot directly switch native qualification. Account defaults, login/logout reconciliation and price presentation are also outside this change.

In native mode, legacy item-fulfillment and pickup-store update actions return HTTP 409 until confirmed switching is available. Single-item, set and bundle pickup adds must target the committed store and its validated inventory. Opening/closing the pickup picker does not run the legacy auto-apply callback; dismissing it keeps the basket unchanged. Selection failures show retryable toast feedback while store search results remain available. Native picker choices are disabled until the submission settles; failures retain the prior selection and enable retry. This prevents duplicate submissions in one picker, not concurrent commits across tabs or server instances. Write ordering for every native commit, including empty-basket select/clear, remains a confirmed-change integration dependency.

## Disable and drain

1. Retain the complete qualifier key list and mappings. Set `storeSelectionEnabled: false` and `storeSelection.cleanup: true` (also set `enabled: false` if generic Shopper Context is no longer needed) during a controlled drain.
2. Reconciliation removes only owned keys and `sfnextStoreSelection`, even if the selected-store cookie was deleted. Failures stop commerce reads. A nonempty basket stops with HTTP 409 until the confirmed-change integration resolves it; no silent repricing occurs.
3. Verify removal for active sessions and cover dormant sessions using the tenant's verified native expiry/operational cleanup policy before ending the drain. Keep normal traffic in maintenance if that policy cannot be established.
4. Set `cleanup: false` only after drain completion. Ordinary off-mode locator/BOPIS traffic then makes no native context calls.

Changing the flag, removing mappings or deleting a browser cookie alone never clears native qualifiers. Renaming/removing owned keys also requires draining their old names first.

Page Designer EDIT/PREVIEW page reads bypass selection reconciliation and do not publish a store. Native cart fulfillment switching and pickup-store changes are unavailable until the shared confirmed-change UI is integrated; server guards remain enforced. Locator failures retain results and provide distinct confirmation-required feedback, including the Luxury picker.
