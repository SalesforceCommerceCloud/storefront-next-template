# Guest Order Lookup

Lets a guest (non-authenticated) shopper look up a past order by order number + email, verify a 6-digit access code sent to that email, and view a redacted, read-only copy of the order.

## Overview

Guest order lookup is a three-step flow:

1. **Request code** — shopper submits order number + email. If they match a real order, SCAPI emails a 6-digit access code, valid for 15 minutes (a fixed SCAPI-enforced window, not configurable). The response is identical whether or not the order/email pair exists, to prevent account enumeration.
2. **Verify code** — shopper enters the code. A per-order signed cookie tracks verification state and failed-attempt count.
3. **View order** — once verified, the storefront re-fetches the order, redacts it to an allow-listed field set, and renders the order details. Cancel and item-level return are available when Order Management (OMS) is active.

The access code is **not single-use** — it stays valid for its full TTL and can be reused (e.g. to re-run step 3, or to verify again in another tab) until it expires or a new code is requested for the same order.

## Prerequisites

- **`GUEST_ORDER_LOOKUP_COOKIE_SECRET`** (or `CLIENT_SECRET` as a fallback) must be set — it signs the order-state cookie. If neither is set, the feature fails closed with a `CONFIGURATION_ERROR` response rather than serving an unsigned cookie. See [`docs/README-CONFIG.md`](./README-CONFIG.md).
- **An email delivery integration** for the access code. SCAPI's `requestOrderAccessCode` triggers the platform hook `sfcc.app.order.sendOrderAccessCode(order, accessCode)` — the storefront never sends the email itself. You must implement this hook in a B2C Commerce cartridge using whichever email provider your project uses (Marketing Cloud, custom SMTP, etc.).

## Enabling the Feature

Set `guestOrderLookup.enabled: true` in `config.server.ts` (default `false`) and redeploy. When disabled, both page routes 404 and all three action routes return `FEATURE_DISABLED` — each layer checks the flag independently rather than relying on the page loader alone. A footer link to `/order-lookup` appears automatically once enabled ([`components/footer/legal-links.tsx`](../src/components/footer/legal-links.tsx)).

## Configuration

All keys live under `guestOrderLookup` in `config.server.ts`:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master feature flag. |
| `orderNumberPattern` | `string` (regex) | `^[a-zA-Z0-9-]{6,32}$` | Additional merchant-configurable validation applied on top of base input checks. An invalid regex is caught and validation falls back to the base checks (logged, not thrown). |
| `cooldownSeconds` | `number` | `60` | Minimum time between repeat "send code" requests for the same order. |
| `allowedFields` | `string[]` | `orderNo`, `status`, `orderTotal`, `productSubTotal`, `productTotal`, `shippingTotal`, `taxTotal`, `taxation`, `orderPriceAdjustments`, `shippingItems.priceAdjustments`, `productItems.*` (individual item fields), `shipments.*` (id, status, shipping method name, address fields), `paymentInstruments.*` (id, card type, last 4 digits) | Allow-list applied to the order before it reaches the browser. Fields not listed are absent entirely, not just hidden in the UI. A dotted path applied to an array field (e.g. `paymentInstruments.paymentCard.cardType`) selects that field from every array element rather than exposing the whole element. |
| `turnstile.enabled` | `boolean` | `true` | Requires a Cloudflare Turnstile token on the request-code step. See [`docs/README-TURNSTILE.md`](./README-TURNSTILE.md). |
| `turnstile.failOpen` | `boolean` | `false` | If Turnstile enforcement itself errors, `true` lets the request through; `false` blocks it (`403 BOT_CHECK`). |

Turnstile is enforced only on the request-code step — verify and results-fetch are not gated by it.

## Routes

| Route | Type | Purpose |
|---|---|---|
| [`_app.order-lookup._index.tsx`](../src/routes/_app.order-lookup._index.tsx) | Page | Entry form. Redirects registered/logged-in shoppers to `/account/orders`. |
| [`_app.order-lookup.results.tsx`](../src/routes/_app.order-lookup.results.tsx) | Page | Access code entry + order display. Redirects to the entry form if no valid order-state cookie exists for the requested order. |
| [`action.order-lookup-request-code.ts`](../src/routes/action.order-lookup-request-code.ts) | Action | Validates input, enforces Turnstile + cooldown, calls SCAPI's `requestOrderAccessCode`, sets the cooldown and order-state cookies. |
| [`action.order-lookup-verify.ts`](../src/routes/action.order-lookup-verify.ts) | Action | Verifies the access code against SCAPI. Does not return order data — only marks the cookie `verified`. |
| [`action.order-lookup-results-fetch.ts`](../src/routes/action.order-lookup-results-fetch.ts) | Action | Requires a `verified` cookie; re-calls SCAPI to fetch the order, redacts it, and returns only the products needed for the surviving fields. |
| [`action.order-lookup-cancel.ts`](../src/routes/action.order-lookup-cancel.ts) | Action | Re-verifies the signed order-state cookie, calls SCAPI to cancel the order via OMS, and returns the updated order + OMS metadata. |
| [`action.order-lookup-return.ts`](../src/routes/action.order-lookup-return.ts) | Action | Re-verifies the signed order-state cookie, calls SCAPI to submit an item-level OMS return, and returns the updated order + OMS metadata. |

Verify and results-fetch are deliberately separate SCAPI calls: verify only proves possession of the code, and results-fetch is re-checked against the cookie's `verified` flag before it will return any order data (defense in depth — a stolen/replayed verify response alone can't be turned into an order fetch).

## Order Matching

Orders are matched on **order number + email** only — there is no postal code or zip factor in this flow. Both `requestOrderAccessCode` and `guestOrderLookup` SCAPI calls take `orderNo` + `email` (+ `accessCode` for the latter). See [`lib/order/scapi.server.ts`](../src/lib/order/scapi.server.ts).

## Cookies

Two cookies are set, both scoped to a single order via a hash of the order number in the cookie name (so looking up multiple orders in one session keeps each order's state independent):

| Cookie | Contents | Signed? | Lifetime | Path |
|---|---|---|---|---|
| `glo_order_<orderHash>` | `siteId`, `orderNumberHash`, `issuedAt`, `verified`, `verifiedCode`, `attempts` | Yes — HMAC-SHA-256 | 15 min — `ACCESS_CODE_TTL_SECONDS` in [`session.server.ts`](../src/lib/order/session.server.ts), matching SCAPI's fixed access-code validity window | `/` |
| `glo_cd_<orderHash>` | Request timestamp | No (not attacker-controlled data) | `cooldownSeconds` (60s default) | `/action/order-lookup-request-code` |

`orderHash` is `SHA-256(orderNumber)`, base64url-encoded ([`hashOrderNumber`](../src/lib/order/session.server.ts)) — a one-way, non-secret identifier used to scope cookie names and cross-check the payload; it is not itself a security control.

### Signing

[`signOrderState` / `verifyOrderState`](../src/lib/order/session.server.ts) implement HMAC-SHA-256 over the JSON payload, wire format `<base64url(payload)>.<base64url(hmac)>`. Verification uses a constant-time comparison, rejects a payload whose `siteId` doesn't match the current site (cross-site replay defense), and rejects an expired `issuedAt`. The signing key is `process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET || process.env.CLIENT_SECRET`; if neither is set, callers get a `CONFIGURATION_ERROR` rather than an unsigned cookie.

## Rate Limiting

Three independent limits apply:

1. **Resend cooldown** — `cooldownSeconds` between "send code" requests for the same order, enforced via `glo_cd_<hash>` (`429 COOLDOWN`, includes `retryAfterSeconds`).
2. **Verify attempts** — `MAX_ATTEMPTS = 5` per order, tracked in the `attempts` field of the signed order-state cookie and checked before calling SCAPI (`429 ATTEMPTS_EXCEEDED`).
3. **SCAPI-side** — SCAPI's own 429s are passed through as `RATE_LIMITED` with `retryAfterSeconds`.

An already-`verified` order-state cookie short-circuits a repeat request-code call (`{ ok: true, alreadyVerified: true }`) without calling SCAPI again.

## Error Codes

Both `action.order-lookup-verify.ts` and `action.order-lookup-results-fetch.ts` return the same generic error for "wrong code" and "order doesn't exist" — this is intentional enumeration defense, not an oversight. [`OrderLookupErrorMessage`](../src/components/order-lookup/error-message.tsx) maps each code to shopper-facing copy:

| Code | Meaning | Recoverable? |
|---|---|---|
| `VALIDATION` | Malformed order number, email, or code | Yes — fix input |
| `BOT_CHECK` / `TURNSTILE_FAILED` | Turnstile check failed | Yes — retry |
| `COOLDOWN` | Resend requested too soon | Yes — wait for `retryAfterSeconds` |
| `RATE_LIMITED` | SCAPI-side rate limit | Yes — wait for `retryAfterSeconds` |
| `INVALID_CODE` | Wrong access code, or order/email doesn't exist | Yes — retry, up to `MAX_ATTEMPTS` |
| `ATTEMPTS_EXCEEDED` | 5 failed access-code attempts | No — must request a new code |
| `SCAPI_UNSUPPORTED` | Instance doesn't support this SCAPI operation | No — contact customer service |
| `CONFIGURATION_ERROR` | Missing signing secret | No — merchant/ops issue |
| `REQUEST_FAILED` / `LOOKUP_FAILED` | Generic SCAPI failure | Yes — retry |
| `FEATURE_DISABLED` | `guestOrderLookup.enabled` is `false` | No |

## Redaction

Once verified, [`action.order-lookup-results-fetch.ts`](../src/routes/action.order-lookup-results-fetch.ts) redacts the order via `redactOrder(order, allowedFields)` before it leaves the server — fields not in `allowedFields` are absent from the response, not merely hidden by the UI. Product data is fetched only for `productIds` that survived redaction, so the storefront never requests product details for line items the shopper isn't authorized to see. [`GuestOrderDetails`](../src/components/order-lookup/guest-order-details.tsx) renders defensively on top of this — it only displays fields present on the object, as a second layer rather than the primary control.

## Components

| Component | Purpose |
|---|---|
| [`RequestCodeForm`](../src/components/order-lookup/request-code-form.tsx) | Order number + email entry, Turnstile widget, resend handling. |
| [`VerifyForm`](../src/components/order-lookup/verify-form.tsx) | 6-box access-code entry; shows an attempts hint after 3 client-side failures. |
| [`GuestOrderDetails`](../src/components/order-lookup/guest-order-details.tsx) | Read-only order render: status badge, items, shipping address, summary, masked payment method. |
| [`OrderLookupErrorMessage`](../src/components/order-lookup/error-message.tsx) | Maps error codes to shopper-facing messages and recovery links. |

## Scope vs. Order Management

Guest order lookup displays the order and, when OMS is active, surfaces cancel and item-level return through the same `CancelOrderDialog` / `ReturnOrderDialog` components used on the registered-customer Order Details page. Guest identity is proven via the signed `glo_order_<hash>` verification-token cookie rather than `customerId` ownership — the guest action routes re-verify the cookie on every request before calling SCAPI.

Order tracking (`expand: ['oms_shipments']`) is not currently included in the guest results view. See [`docs/README-ORDER-MANAGEMENT.md`](./README-ORDER-MANAGEMENT.md) for background on OMS eligibility and the registered-customer cancel/return flow.

## Testing

E2E coverage lives in [`e2e/src/specs/core/guest-order-lookup.spec.ts`](../e2e/src/specs/core/guest-order-lookup.spec.ts), stubbing the verify/results-fetch actions (there's no real inbox in E2E). Several acceptance-criteria scenarios are intentionally `Scenario.skip`'d with `@not-implemented` tags for behavior that doesn't exist yet (client-side expiry countdown, proactive resend-cooldown UI, a "Refresh Status" button, an explanatory session-expired message, and cross-tab coordination) — check the spec file for the current list before assuming any of these ship.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every request returns `CONFIGURATION_ERROR` | `GUEST_ORDER_LOOKUP_COOKIE_SECRET` and `CLIENT_SECRET` are both unset. |
| Access code email never arrives | Verify your `sfcc.app.order.sendOrderAccessCode` hook is registered, deployed, and on the site's cartridge path. Check Business Manager → Administration → Operations → Log Center for hook errors. |
| `/order-lookup` 404s | `guestOrderLookup.enabled` is `false`, or not deployed since last set. |
| Shopper stuck on `ATTEMPTS_EXCEEDED` | Expected after 5 wrong codes — they must request a new code, which resets the counter. |
