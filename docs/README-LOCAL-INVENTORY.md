# Preparing-store inventory

`features.localInventory` scopes availability to the validated preparing store for delivery and pickup. It is disabled by default pending tenant validation.

```typescript
localInventory: {
    enabled: true,
    inventoryListsBySite: { GroceryNext: ['verified-store-inventory'] },
    nativeSearchVerified: false,
}
```

Reuse [store selection](./README-STORE-SELECTION.md) for context, identity reconciliation and the confirmed-change boundary. `Store.inventoryId` supplies the list mapping; URL inventory IDs never authorize another store. The list registry is server-only configuration: include only existing lists with default-in-stock disabled, and maintain it when lists change. Configuration alone does not prove these tenant properties. When every requested product is offline or absent, native availability can return only `limit: 0` and `total: 0`; this means missing stock after list validation. That empty response cannot distinguish an existing list from an unknown list, so it cannot validate the registry itself.

Treat registry changes as part of the store/inventory feed deployment: validate list existence, Default In-Stock=false and the store mapping before adding an entry. Remove or disable an entry before deleting its list, changing its mapping or enabling default-in-stock; revalidate before restoring it. Keep one inventory-feed owner responsible for this sequence and retain the validation timestamp. A browser request and an empty Shopper Availability response cannot replace this administrative validation.

Product, variant, bundle and basket reads use explicit Shopper Availability requests, batched at 24 IDs with at most four in flight. A missing record, non-orderable record, zero physical stock or insufficient physical stock/ATS is unavailable. Site stock, preorders and backorders cannot fill the gap. A native availability response that omits its required inventory collection is an invalid-list/configuration error. Product API inventory expansion must not validate a list: a provider can return site fallback stock labelled with the requested list ID. API failures and invalid configuration stay errors. Prices and offers remain native commerce results.

Product data retains existing `inventory`/`inventories` consumers and carries computed `c_localInventoryId`, `c_localInventoryStoreId` and `c_localInventoryRevision` metadata. The revision comes from the existing committed shopping context. Search hits carry `c_localInventoryAvailable`, `c_localInventoryId` and `c_localInventoryRevision`.

## Search

“Show unavailable products” defaults on. This requests the complete native result set with `orderable_only=false` and annotates the returned window. It never removes unavailable hits from a returned page.

Before validating native filtering, enable **Shop the Store Inventory**, disable **Shop the Store Inventory Fallback**, and enable the site's **Site Preferences → Search Preferences → Shop the Store** setting. Rebuild and verify the native **Inventory Index** as well as the Availability Index. These are separate indexes; an online Availability Index alone does not prove store inventory was indexed. Record the effective configuration and index versions with the query results. See [Enable Shop the Store](https://help.salesforce.com/s/articleView?id=cc.b2c_enable_shop_the_store.htm&type=5).

Turning it off requires `nativeSearchVerified=true`. Before setting that flag, prove the native `ilids=<selected-list>` plus `orderable_only=true` query excludes zero, insufficient, absent and deferred stock exclusively at that store, including variants/bundles, while returning correct totals, facets, ordering and pagination across the full set. A flag is an operator assertion, not a capability test. Without verification the control announces an error and preserves results; direct requests fail closed. A returned unavailable hit in a supposedly filtered window is an index/configuration error, not a reason to filter that page.

Filtered store searches include native `availability` alongside existing expansions, which gives the response a documented default 60-second cache lifetime. Explicit inventory reads still supply displayed stock. Unfiltered search retains its existing cache policy. This request policy does not prove feed/index freshness or exclude other backend caches. SCAPI can return `Cache-Control: no-cache, no-store` for server-cached responses; inspect `sfdc_cache_status` and `sfdc_cdn_cache_status`, and allow the documented invalidation window when testing. See [SCAPI caching](https://developer.salesforce.com/docs/commerce/b2c-commerce/guide/server-side-web-tier-caching.html).

Store change/clear replaces/removes obsolete inventory refinements, preserves unrelated search parameters and resets both offset and page pagination. A stale Load More request for a different store returns 409. Existing route revalidation refreshes store-dependent reads. Full late-response suppression remains part of the shared UI-refresh integration.

[Native Shop the Store documentation](https://help.salesforce.com/s/articleView?id=cc.b2c_shop_the_store.htm&type=5) describes site/store orderability and an inventory fallback switch. These documented semantics do not certify the strict store-only query above. Native inventory-based sorting is restricted, and suggestions/recommendations are not filtered by selected-store availability. Recommendations remain outside this feature. Resolve a demonstrated native limitation with the platform before selecting another integration; no custom API or object is assumed.

## Basket and checkout

Stock budgets aggregate identical SKUs across options, shipments and bundle components. Native basket component quantities are totals. Cart mutations check new consumption; reductions/removals can repair an already-unavailable basket one line at a time. Checkout checks the complete basket before calculation/payment preparation; native order-time validation remains necessary because preflight is not a reservation or atomic stock guarantee.

New lines carry the selected list even for delivery. Existing lines tied to another list, a legacy site-default list or another pickup store require the existing `STORE_CHANGE_CONFIRMATION_REQUIRED` boundary. This feature does not migrate those lines or implement preview/consent/apply.

## Candidate stock

`GET /resource/store-stock?candidateStoreId=<id>&items=<JSON array>` accepts up to 80 `{productId, quantity}` entries. Resolve variants to concrete SKU IDs. The endpoint resolves the candidate list from trusted store data, aggregates duplicate quantities and returns only stock with `stockOnly: true` and private/no-store caching. Bundle availability can use its native bundle ID; component checks must supply total component quantities. It never changes active selection, qualifiers, prices or totals and is not a financial preview.

## Release evidence

Retain the 1,200–4,000-store × approximately 30,000-SKU target: 36–120 million distinct inventory records before site stock. Native [Shop the Store](https://help.salesforce.com/s/articleView?id=cc.b2c_shop_the_store.htm&type=5) documents up to **50 million inventory records**. The upper target exceeds that documented capacity; obtain a platform-supported capacity model or exception and actual tenant evidence before release. Do not share lists for independent stock. No request scans this catalog to implement filtering.

Measure feed acceptance, native availability, search-index visibility and visible UI timestamps for decreases and recovery against approximately five minutes. [Automatic availability-index guidance](https://help.salesforce.com/s/articleView?id=cc.b2c_index_creation.htm&type=5) warns that index visibility can take five or more minutes. A cache TTL, manual edit or pilot does not prove the feed-to-UI target. Confirm quotas, feed/index responsibility, error/429 behavior and representative 30/80-line basket latency on the target tenant before enabling release.
