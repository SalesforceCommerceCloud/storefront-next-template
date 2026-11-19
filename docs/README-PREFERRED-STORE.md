# Preferred-store resolution

Server-only profile helpers require the store-locator extension and initialized [auth middleware](./README-AUTH.md). Import them from `@/extensions/store-locator/lib/api/preferred-store.server`.

| API | Contract |
| --- | --- |
| `getPreferredStoreId(context)` | Registered profile GET with `expand: ['none']`; reads native `preferredStoreId`, returning null for nonregistered shoppers or an absent/null/empty value. |
| `updatePreferredStoreId(context, id)` | Registered-only PATCH of `{ preferredStoreId: id }`; null clears the current site's preference. Caller validates store suitability. |

Both derive customer ID from the session. Missing registered customer IDs/nonregistered writes throw HTTP 401; malformed nonempty IDs (non-string, whitespace-only, over 256 characters) throw TypeError. IDs stay unchanged. API failures propagate from the helpers. Profile reads never resolve or repair stale IDs.

The native preference is site-specific, even when sites share a customer list/profile. The API client's current `siteId` scopes reads and writes; an unset site has no default-site fallback. Clearing one site leaves other sites' preferences intact. Device cookies remain independent. The helpers never read or write legacy `c_preferredStoreId`, retry with it, or migrate it automatically.

| Shopper | Authoritative selection |
| --- | --- |
| Guest | Current site's unexpired selected-store cookie |
| Registered | Current site's native profile `preferredStoreId` only, never a legacy-field or cookie fallback |

Root, account store preferences, and PDP inventory share one lazy request-scoped resolution. Each candidate is matched by exact ID against the current site's Shopper Stores response. Selection exposes canonical ID, name, inventory ID, country code and postal code; account retains full store details. Missing/stale IDs are empty; profile/store failures retain the existing account error state. Reads never update a profile or repair a cookie.

An explicit successful guest-to-registered login (including signup login, passwordless, social, passkey, and password-reset auto-login) promotes a valid guest cookie only after a successful profile read confirms the preference is unset. Any nonempty preference wins, including stale IDs. Read/validation/write failures do not fail authentication or enable cookie fallback; SDK invalid-token markers remain available to auth recovery. Completed login proofs are never replayed: successful registered-session recovery preserves the completed response; failed recovery cannot report login success. Refresh and registered reauthentication do not promote.

Promotion is best-effort read-before-PATCH. The API has no conditional update contract, so a concurrent preference update from another session can race with promotion.

The guest cookie is consumed only after a successful promotion PATCH. Failed promotion, an existing profile preference, and invalid/missing stores preserve it. A successful registered `set` or `clear` also drops it, since the profile is authoritative for that session. Logout clears the current site's guest cookie for both guest and registered sessions using the selected-store middleware's cookie scope; it does not clear the profile preference. Cookie cleanup is not a permanent opt-out: a later independent guest selection can promote on a future login.

Promotion overlaps independent basket merge/transfer after the synchronous auth update. Both settle before the response; basket recalculation stays ordered after merge. Login flows without a basket step do not add one for promotion.

The root streams selected-store resolution; only the header badge and home prompt wait. Identity/site changes and newer local selection (including rollback) invalidate old reads without remounting the provider subtree. Browser search memory restores search fields only. A late authorization failure offers a fresh, same-origin document recovery request so auth middleware can publish refreshed cookies.

PDP product details load immediately, independently of selected-store resolution. Exact-SKU availability streams separately into fulfillment controls; delivery remains usable while pickup is pending. Product sets use selected-child inventory and quantities; bundles use parent stock. The initial server seed avoids duplicate mount requests and is invalidated by newer store or shopper selections.

## Late preferred-store read recovery

A registered shopper's preferred store is read from the profile as a streamed promise. If that read gets a 401 after the response head is sent, the auth middleware cannot refresh in that request. The badge shows its fixed-width loading placeholder (never a link or a premature empty state) and the client retries once per page session: it sets the short-lived `sfnext-store-recover` cookie and calls `revalidate()`. With that cookie present and no `cc-auth-recover` guard, the root loader awaits the read, so the 401 reaches the auth middleware before the head is sent and it refreshes and redirects with fresh cookies. If the retry also fails, the placeholder resolves to the normal no-store state. Pickup availability (`'auth-error'`) shares the same retry. Known limitation: if only the PDP pickup read gets a 401 while the root read is served from the metadata cache, the retry never reaches the auth middleware and pickup stays unavailable until the next navigation; fixing it means awaiting the pickup read under the recover cookie.

To avoid late 401s from near-expiry tokens, the auth middleware refreshes an access token within 90 seconds of expiry at the start of the request (a failed early refresh keeps using the still-valid token).

The `/resource/auth-recovery` endpoint remains for preferred-store POST recovery. Removing store locator also removes endpoint-specific auth validation, query overrides, and preferred-store POST recovery, while core login/basket integration coverage remains available.

Only that endpoint validates and resolves the explicit site/locale pair before site-scoped authentication, overriding stale detection cookies. Invalid, ambiguous, duplicate or partial pairs and colliding query keys return a no-store 400. A well-formed unknown site or globally unknown locale returns a no-store 303 to the deployment root before authentication, without setting cookies; a known site with an unsupported, globally known locale returns 400. Direct requests with neither value retain normal detection. The 400/409 rejections render a minimal localized HTML document with a home link before auth/i18n middleware; a supported locale alias or configured locale cookie selects the language, while invalid explicit locales fall back to the default site's locale (then the translation fallback).

Recovery preserves configured cookie caching. Before authentication, it verifies that the ordinary destination request resolves the same pair using only the site/locale cookies the configured policy will publish, preserving unrelated cookies and headers. A continuity conflict returns a no-store 409 without authentication side effects; explicit destination path/query identity disagreement returns 400. Default cookie persistence intentionally keeps the recovered context on the next request.

Recovery re-resolves site/locale from the request cookies overlaid with the context cookies it will write (first duplicate wins) and returns 409 on a mismatch. Browser cookie-acceptance rules (public-suffix `Domain`, `__Host-`/`__Secure-` prefixes, `Secure`, `SameSite`) and stale scoped duplicates are not emulated, so such a cookie can surface after the redirect as a site/locale mismatch when the destination does not pin site/locale. Ordinary requests retain normal detection.

Destination validation runs before token refresh and uses the SDK's compiled `isDocument` metadata for the winning route; resource-route winners and `.data` transports are rejected. Paths that match no route are rejected too, unless the app has a document catch-all (the template's `_empty.$` splat), which accepts them and renders its 404. Category slugs named `resource` or `action` remain valid documents. Continuity uses that same winning route's parameters. Middleware publishes recovered cookies and returns a no-store 303 to the page, with basename applied once. Search text remains opaque. Recovery never derives authentication identity from the destination, adds identity query fields to it, or replays a preference write or login proof.

Authorization recovery for `POST /action/set-selected-store` also uses a no-store 303 document GET. It returns to a validated same-origin document Referer when available, otherwise the deployment root. Set/clear is never automatically repeated; a fresh read establishes the authoritative preference.

## Metadata cache and login cart handoff

Profiles are read on every request; parallel consumers share request-local work only. Exact-ID store metadata with an inventory ID can be reused for 60 seconds, with fixed expiry and at most 256 entries per server process. Preferences, stock, failures and missing stores are never cached. Set `serverExtension.storeLocator.storeMetadataCacheTtlSeconds` to `0` to disable reuse. Backend, organization, client, site, locale and a hashed authentication/session tuple isolate entries; raw tokens and request contexts are not retained. Promotion validates metadata afresh. Shopper-context-enabled configurations disable reuse because evolving qualifiers are not exposed in router context.

A transfer authorization failure can leave basket ownership uncertain. Recovery refreshes the completed registered session once, verifies customer/session/site continuity, and reads the customer's basket list. It hydrates the captured guest basket only when that list authorizes the same ID; it never repeats the transfer or creates an empty replacement. Rejected recovery blocks authenticated dispatch; unconfirmed ownership blocks basket hydration/mutations, implicit creation and wishlist writes for that request. Late failures from old credentials cannot invalidate recovered credentials. An unconfirmed handoff retains the guest snapshot and warns the shopper to review their cart; a second authorization failure remains an auth error.

Explicit account selection/clear and the longer guest cookie lifetime are separate persistence work. Until that work is integrated, existing cookie-only selection controls cannot change a registered profile preference. Registered clear must also clear any remaining guest cookie when that persistence work is integrated. Profile values are never copied into the guest cookie.

## Commerce Cloud setup

Require a backend that supports native Shopper Customers `preferredStoreId` reads, writes and null clears for each participating site. This capability was verified on an on-demand sandbox running version 27.1; that is a verified version, not a claimed minimum version. Verify the live capability before rollout using the checks below. Do not create a custom Profile attribute or import custom attribute metadata to enable native support.

Explicit unsupported-field errors propagate through the helpers; there is no compatibility toggle or legacy PATCH retry. An absent field on GET is indistinguishable from an unset preference, so GET alone (or a successful PATCH response alone) cannot establish capability. Confirm persistence with separate authenticated GETs after set, replacement and clear.

Check each participating site's **Settings > Customer List** and test using its own `siteId`. SLAS needs customer profile read/write permissions (`sfcc.shopper-myaccount.rw`, or `sfcc.shopper-standard`) plus Shopper Stores access; `sfcc.shopper-myaccount` is read-only. See the [scope catalog](https://developer.salesforce.com/docs/commerce/commerce-api/guide/auth-z-scope-catalog.html).

## Legacy migration

If retaining legacy preferences is required, perform an operator-controlled, one-time migration per customer and site before enabling native-only behavior. Capture legacy, native and unrelated-field baselines; validate each legacy store against the target site's Shopper Stores data; preserve any existing native preference. Copy only approved, valid legacy IDs into the native field for that site and verify them with fresh GETs. Record completion durably so the migration cannot run again after a shopper clears the native preference. Do not migrate on login or ordinary reads. Retained legacy data must never resurrect a cleared selection.

## Rollout verification

Use two dedicated shoppers and record native preferences per site and unrelated-field baselines first. Verify set, replacement, and clear with separate GETs in fresh requests, not PATCH responses. Confirm unrelated fields and the second shopper's profile stay unchanged. Sign out/in and verify persistence. For the same customer on another site sharing the customer list/profile, verify independent preferences, no default-site fallback, and no cross-site change when clearing. Restore baselines and verify both profiles on each site even if testing fails.

For login resolution, compare header, selector, account and PDP inventory: existing preference wins; confirmed-unset profile promotes a valid guest selection and deletes its cookie; stale profile/read failure never falls back or consumes the cookie; logout clears it without changing the profile. Verify a new guest selection can promote later, ordinary reads issue no PATCH/Set-Cookie, and parallel consumers reuse lookups.

Keep redacted HTTP/persistence/cross-site evidence separate from local fetch-mocked results. Local tests prove routing, serialization and failure handling, not provisioning, permissions or backend persistence. Removing the extension removes its helper imports.

## Selection workflow

POST `/action/set-selected-store` with `intent=set` and one opaque `storeId`, or `intent=clear` without an ID. The server derives customer identity and validates current-site store metadata; caller-provided names and inventory IDs are not authoritative. Direct requests require same-origin Origin, or same-origin Referer when Origin is absent. Replacement guest selections expire after 30 days.

Selecting or clearing the active store never writes the account default. Registered shoppers save the default explicitly through POST `/action/save-default-store` (one `storeId`): same-origin, registered only (guests get 401 `SIGN_IN_REQUIRED`), the store is validated fresh (404 `STORE_NOT_FOUND` if unknown, 422 `STORE_NOT_ELIGIBLE` if it cannot serve pickup), then written to the native current-site `preferredStoreId` and read back. A failed write or readback mismatch returns 502 `DEFAULT_SAVE_FAILED`, never a false success. It does not touch the active selection, selection cookie, basket, prices or fulfillment. Writes never fall back to a legacy custom attribute.

The account Store Preferences page shows the saved default and the current store independently. Change store changes only the current store; "Save current store as default" and an isolated "Choose a different default" dialog save the default. Clearing the default has no UI.

Unknown write outcomes require an explicit `intent=reconcile` read, never a repeated write. Reconciliation publishes current truth, including a different store or null for an unavailable store. Only a matching result in the still-open initiating chooser session emits its owned confirmation notification. Manual cancellation, a new chooser, and scope changes invalidate notification ownership.

Confirmation closes the chooser and publishes canonical metadata together. Cart and checkout use a logical owner keyed by caller surface and pickup-store target, preserved across caller remounts within the chooser session and shopper/site generation. They claim their notification atomically once and call the existing mounted pickup hook; its PATCH, toast, and basket revalidation remain caller-owned. Same-store confirmation and header/account selection do not PATCH a basket. A cart item's first pickup gesture opens the chooser; after confirmation, a second pickup gesture performs the item update. The preference coordinator does not own basket transports, pending state, errors, or recovery.

The selected-store route has a narrow exception to the template's no-clientAction convention: its transport wrapper calls native `serverAction()` exactly once and maps recognized lost-response errors to an unknown preference outcome. Redirects, aborts, CSRF failures and unrelated errors retain native behavior.
