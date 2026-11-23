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

The response and root loader expose `shoppingContext`: site, preparing store, inventory, committed context revision/time, selection origin, identity epoch and current-session explicit-choice lineage. Opt-in fulfillment-first entry also preserves fulfillment mode. The compatible `selectedStoreInfo` remains available to locator/BOPIS consumers.

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

The preview/apply workstream must consume this handoff and publish the confirmed context and recalculated basket together. No browser `confirmed` flag bypasses the boundary. Preview, consent, basket recalculation, durable recovery and write-boundary concurrency guarantees are separate dependencies. Existing BOPIS picker callbacks cannot directly switch native qualification. Preview/apply UI and price presentation are separate integrations; account-default saving is the separate `save-default-store` action.

In native mode, legacy item-fulfillment and pickup-store update actions return HTTP 409 until confirmed switching is available. Single-item, set and bundle pickup adds must target the committed store and its validated inventory. Opening/closing the pickup picker does not run the legacy auto-apply callback; dismissing it keeps the basket unchanged. Selection failures show retryable toast feedback while store search results remain available. Native picker choices are disabled until the submission settles; failures retain the prior selection and enable retry. This prevents duplicate submissions in one picker, not concurrent commits across tabs or server instances. Write ordering for every native commit, including empty-basket select/clear, remains a confirmed-change integration dependency.

## Login and logout

Password, magic-link/OTP, social and passkey completion share `completeRegisteredLogin`. Password registration and post-order registration also reach it through their automatic password login. It captures source-basket presence before exchanging credentials, then reconciles selection before existing basket transfer/merge. Token refresh uses `updateAuth` and never creates explicit-choice provenance or saves a default.

Signup and post-order registration preserve reconciliation failures after account creation and authentication. Document login callbacks and page actions throw route responses so the error boundary renders recovery; resource actions return the original structured 409/503 handoff. All use private/no-store caching. These routes also trigger identity revalidation; the shared preview/apply integration still owns resolving pending basket consent.

An explicit guest choice from `storeChoiceSession` wins at login. Otherwise read the site's native `preferredStoreId` with `getPreferredStoreId` (`getCustomer`, `expand=none`). A valid saved default becomes active; unset, malformed or deleted defaults return to the unselected entry state. Store/API/configuration failures remain errors. Account persistence is separate: reconciliation never calls `updatePreferredStoreId`, and neither does `set-selected-store`; only the explicit `save-default-store` action does (see the preferred-store doc).

A different store, clear, or missing native qualification with source/destination product items returns the shared `STORE_CHANGE_CONFIRMATION_REQUIRED` handoff before transfer or selection publication, in both modes. Source-basket presence remains guarded after authentication, including profile-read failures and retries. Preview, consent, resuming transfer and durable transition coordination remain required before this path can complete. Authentication may already have succeeded when reconciliation returns an error; retrying must not treat that as an empty guest basket.

Native mode persists the source-basket barrier before credential exchange; a failed write leaves authentication unchanged. After a failed guest exchange, retry rechecks the actual basket so emptying it clears the old guard. Matching replica metadata can retain a missing denial, but cannot override newer native lineage.

With a nonempty source basket, login must retain the source USID. A response whose JWT changes USID is rejected before registered credentials are published, in both modes. The existing identity remains active; in native mode its source guard survives preference-cookie loss. Cross-session basket migration requires shared durable recovery; a destination-context write followed by cookie fallback cannot establish that guarantee. Existing separate-source native records remain blocked for recovery without relabeling their qualification.

Recovery pages offer a clean GET retry and sign-out, warning that existing logout clears the basket. Retry never replays credentials or callback tokens and never supplies consent. Sign-out retains store intent and discards the old transfer barrier. Same-account credential renewal retains the active store and avoids reads with the invalidated old credential; destination-basket checks use the new credential. Authentication and account creation are logged before reconciliation can fail.

Successful identity reconciliation publishes a new context revision/identity epoch even for the same store. Basket transfer explicitly recalculates and replaces the request basket resource. Auth changes synchronously invalidate native helper, shopping-context and hydrated-basket snapshots; only an opaque basket lookup ID is retained for reauthorization by SCAPI with the new credential. This preserves the inherited basket during OTP registration without exposing old counts, prices or totals. Logout destroys the lookup hint as well. Native helpers and API read deduplication also vary by credential/identity. Comparisons from a previous identity must not be confirmed against the new revision/epoch.

Logout remains available during failed reconciliation. It preserves the remembered store ID, removes explicit registered provenance, and keeps the existing auth/basket destruction. The next fresh guest request validates that ID and reconciles only store-owned qualification; registered eligibility and unrelated native qualifiers are not copied from the old session.

The read helper is reused from the native preferred-store integration. Real `preferredStoreId` support on the target tenant and preview/apply integration are release dependencies; unit test doubles do not establish either capability. Store-specific open/closed/service rules are merchant policy; opt-in fulfillment-first entry currently follows BOPIS store/inventory validation.

## Optional fulfillment-first entry and city search

`features.storeEntry` is disabled by default. When enabled, `policy: 'soft'` (also the default when omitted) permits browsing and requests selection before a single-product add; its captured SKU, options and quantity resume after successful selection. Set `policy: 'required'` to require a committed store/mode before displaying shopping pages.

Required entry gates the homepage, product/category/search, cart and checkout views, including initial server rendering, site-prefixed URLs, SEO URLs and the unprefixed root homepage alias. It keeps the normal header/footer and original URL, including query and fragment. Close, Escape or outside dismissal leaves a “Choose store to continue” view with a button to reopen the chooser. Success reveals the requested page and returns focus to its main content; arrival never creates an add intent. Help, legal and account routes remain accessible. Merchant routes can declare `handle.storeEntryRequired: true` or `false` to override the default route policy.

Both policies use existing BOPIS store/inventory validation. Delivery follows ordinary ship-to-address; selecting a store does not establish store-to-address coverage. The entry gate controls the rendered view; loaders retain their existing fetching behavior and server-side basket/context guards still apply. Nonempty-basket changes require the shared confirmed-change integration. The checkout order summary shows the committed shopping store and mode, with Change opening the shared locator. On mobile this row stays visible above collapsed totals. Rejected changes retain the current context and keep search/retry available.

Postcode and device-location searches use the existing Shopper Stores API. City search has no default provider and is disabled independently with `citySearchEnabled: false`; the form offers postcode/location search without a city option.

To add city search:

1. Implement [`searchStoresByCity`](../src/extensions/store-locator/lib/store-entry-services.server.ts) in the merchant-owned template. Its typed input supplies country, city, result limit and distance preferences; its output is the existing `ShopperStores.schemas['StoreResult']` shape.
2. Choose and document whether city input means matching recorded cities or searching near a resolved city. An indexed store directory or a geocoder followed by Shopper Stores can implement the contract. Radius preferences apply when the provider supports a geographic origin; omit distance when none is known.
3. Filter the authoritative source before limiting results. Do not copy a fixed boutique list, download the entire directory into the browser, or filter only an already-limited nearby-store response. Return an explicit empty `data` array for no matches and throw on provider failure. Honor the requested limit and return accurate result metadata.
4. Validate coverage of the merchant's directory, localization, limits and failure behavior, then set `features.storeEntry.citySearchEnabled: true`.

Enabling the flag alone does not install a provider: the stub returns HTTP 503 `CITY_LOOKUP_NOT_CONFIGURED`. Disabled city requests return HTTP 400 `CITY_SEARCH_DISABLED`. Provider calls and credentials stay server-side; the result list and selection continue through the existing locator and authoritative selection service. Fixture tests demonstrate the contract, not a production algorithm or validation at grocery scale.

## Disable and drain

1. Retain the complete qualifier key list and mappings. Set `storeSelectionEnabled: false` and `storeSelection.cleanup: true` (also set `enabled: false` if generic Shopper Context is no longer needed) during a controlled drain.
2. Reconciliation removes only owned keys and `sfnextStoreSelection`, even if the selected-store cookie was deleted. Drain cleanup precedes identity reconciliation. Failures stop commerce reads. A nonempty current or pending source basket stops with HTTP 409 until the confirmed-change integration resolves it; no silent repricing occurs.
3. Verify removal for active sessions and cover dormant sessions using the tenant's verified native expiry/operational cleanup policy before ending the drain. Keep normal traffic in maintenance if that policy cannot be established.
4. Set `cleanup: false` only after drain completion. Ordinary off-mode locator/BOPIS traffic then makes no native context calls.

Changing the flag, removing mappings or deleting a browser cookie alone never clears native qualifiers. Renaming/removing owned keys also requires draining their old names first.

Page Designer EDIT/PREVIEW page reads bypass selection reconciliation and do not publish a store. Native cart fulfillment switching and pickup-store changes are unavailable until the shared confirmed-change UI is integrated; server guards remain enforced. Locator failures retain results and provide distinct confirmation-required feedback, including the Luxury picker.
