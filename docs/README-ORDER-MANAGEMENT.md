# Order Management

How shoppers initiate returns, cancel orders, and track shipments through Salesforce Order Management (SOM).

## Overview

When a Salesforce Order Management (SOM) core org is connected to the B2C Commerce instance, orders are enriched with OMS data (`order.omsData`, `order.productItems[*].omsData`). This enrichment drives three shopper-initiated actions on the order detail page:

1. **Return Items** — Initiate an item-level return request
2. **Cancel Order** — Cancel an entire order before shipment
3. **Track Shipment** — View carrier tracking details and delivery dates

These features require no feature flags. They render only when the order carries OMS data and the shopper meets eligibility conditions (registered account, ownership, item-level return/cancel availability). ECOM-only orders (no `omsData`) never expose return or cancel affordances — they silently degrade to tracking-only (when `order.shipments[]` is present).

## Prerequisites

- **Salesforce Order Management (SOM)** core org connected to the B2C Commerce instance
- **OMS data expansion** — The order detail loader calls `shopperOrders.getOrder` with `expand: ['oms', 'oms_shipments']` to load `omsData` enrichment onto the order and its items. Without this expansion the features stay hidden.

On orgs without SOM, the expand tokens are silently ignored (OAS degrade contract) and the storefront remains functional — the ECOM-only path is unaffected.

**Help Center:**  
[Order Management Help](https://help.salesforce.com/articleView?id=sf.order_management.htm&type=5)

## Order Returns

Shoppers can request item-level returns for eligible items. The Return Items dialog renders a selection UI (checkboxes, quantity steppers, reason dropdown), validates the request, and submits it to OMS via the [`action.return-order.ts`](../src/routes/action.return-order.ts) server action.

### Eligibility

An item is returnable when its `omsData.quantityAvailableToReturn` is a finite number greater than 0. The storefront trusts this field verbatim — OMS computes it per item, factoring whatever order/item state matters. There is no client-side status allowlist. The authoritative refusal happens server-side via a 409 returned by `POST .../actions/oms-return-order`.

| Condition | Required Value |
|-----------|----------------|
| Shopper is registered | `customerId` is concrete |
| Shopper owns the order | `customerId === order.customerInfo.customerId` |
| At least one item has return quantity | `item.omsData.quantityAvailableToReturn > 0` |

Unlike cancel (which requires every item fully cancellable), return supports partial returns — a single returnable item is sufficient.

**Reference:** [`getReturnableItems`](../src/lib/order-management/return.ts)

### How It Works

1. The order detail loader fetches the order with `expand: ['oms', 'oms_shipments']` and loads OMS metadata ([`fetchOmsMetaData`](../src/lib/api/order.server.ts)) to retrieve return reason codes.
2. The order detail component checks eligibility ([`getReturnableItems`](../src/lib/order-management/return.ts)) and renders the "Return Items" button when at least one item is returnable.
3. The shopper selects items, quantities, and a reason code in the Return Items dialog ([`return-order-dialog.tsx`](../src/components/account/order-details/return-order-dialog.tsx)).
4. On submit, the dialog POSTs the selection to the return server action ([`action.return-order.ts`](../src/routes/action.return-order.ts)) via React Router's `useFetcher`.
5. The server action calls `shopperOrders.returnOmsOrder` (`POST .../actions/oms-return-order`) with the selected items, quantities, and reasons.
6. On success, the action returns `{ success: true }` and the dialog closes. On failure, the action classifies the error ([`classifyReturnError`](../src/lib/order-management/return-error.ts)) and returns it to the dialog for per-kind recovery affordances.

### Return Reason Codes

Return reason codes are configured in Salesforce Order Management and loaded via `GET /orders/oms-meta-data`. The dialog renders them as a dropdown. The default reason code (the entry with `default: true` in the `returnReasonCodes` array) is pre-selected; non-default selections are sent in the payload, while the default is omitted (the server applies it when `reason` is absent).

When the metadata fetch fails (5xx, network error) or the API returns an empty array, the dialog degrades to a reason-unavailable retry state — eligibility still comes from per-item `omsData`, so the entry point stays visible.

**Reference:** [`buildReturnProductItems`](../src/lib/order-management/return.ts)

### Error Handling

The return server action classifies every failure into a [`ReturnErrorKind`](../src/lib/order-management/return-error.ts):

| Kind | HTTP Status | Meaning | Recovery |
|------|-------------|---------|----------|
| `invalid_input` | 400 | Locally-detected malformed form input (bad JSON, empty array, missing itemId/quantity) | Never sent to SCAPI; dialog shows generic error |
| `invalid_reason` | 400 | Reason code does not match OMS configuration | Shopper is sent back to the selection view to pick a valid reason |
| `unknown_items` | 400 | One or more item IDs no longer exist in the order | Shopper is sent back to the selection view; React Router auto-revalidates the order loader so stale items are reconciled |
| `quantity_exceeded` | 400 | Requested quantity exceeds `quantityAvailableToReturn` | Shopper is sent back to the selection view; auto-revalidation refreshes the available quantities |
| `not_found` | 404 | Order does not exist or caller lacks access | Terminal; submit stays disabled |
| `not_returnable` | 409 | Order state prevents return (already fully returned, cancelled, etc.) | Terminal; submit stays disabled |
| `transient` | 5xx, network, or unrecognized 4xx | Retryable server/network error | Submit stays enabled; shopper can retry inline |

The three 400 sub-codes (`invalid_reason`, `unknown_items`, `quantity_exceeded`) carry per-item recovery affordances. The `OrderReturnFailed` code (which SCAPI can return on either 400 or 409) carries no recovery affordance and falls through to `transient`.

**Reference:** [`classifyReturnError`](../src/lib/order-management/return-error.ts), [`readReturnErrorCode`](../src/lib/order-management/return-error.ts)

## Order Cancellation

Shoppers can cancel an entire order before shipment. The Cancel Order dialog collects an optional reason code and submits the request to OMS via the [`action.cancel-order.ts`](../src/routes/action.cancel-order.ts) server action.

### Eligibility

Cancellation is order-level only (no partial cancellations). An order is cancellable when:

| Condition | Required Value |
|-----------|----------------|
| Shopper is registered | `customerId` is concrete |
| Shopper owns the order | `customerId === order.customerInfo.customerId` |
| Order has OMS data | `order.omsData` is present |
| Order has at least one product item | `order.productItems.length > 0` |
| Every item is fully cancellable | `item.omsData.quantityAvailableToCancel === item.omsData.quantityOrdered` for all items |

All five conditions are checked in [`canCancelOrder`](../src/lib/order-management/cancel.ts).

**Reference:** [`canCancelOrder`](../src/lib/order-management/cancel.ts), [`isCancellable`](../src/lib/order-management/cancel.ts)

### How It Works

1. The order detail loader fetches the order with `expand: ['oms', 'oms_shipments']` and loads OMS metadata ([`fetchOmsMetaData`](../src/lib/api/order.server.ts)) to retrieve cancel reason codes.
2. The order detail component checks eligibility ([`canCancelOrder`](../src/lib/order-management/cancel.ts)) and renders the "Cancel Order" button when the order is cancellable.
3. If the order becomes ineligible after the page loads (e.g., a shipment is created), the Cancel Order button renders as `aria-disabled` with a screen-reader-only reason rather than hiding — this preserves layout stability and ensures assistive tech users understand why the action is unavailable.
4. On submit, the dialog POSTs the selected reason to the cancel server action ([`action.cancel-order.ts`](../src/routes/action.cancel-order.ts)) via `useFetcher`.
5. The server action calls `shopperOrders.cancelOmsOrder` (`POST .../actions/oms-cancel-order`) with the optional reason code.
6. On success, the action returns `{ success: true }` and the dialog closes. A success alert appears after a 300ms delay (so screen readers finish announcing the dialog close before the alert steals the live-region announcement).
7. On 404 or 409, the order detail component sets `cancelFailed: true` and hides the Cancel Order button permanently for this order.

### Cancel Reason Codes

Cancel reason codes are configured in Salesforce Order Management and loaded via `GET /orders/oms-meta-data`. The dialog renders them as a dropdown when available. The default reason code (the entry with `default: true`) is pre-selected; when omitted from the form submission, the server applies the default reason code.

### Error Handling

The cancel server action classifies every failure:

| Kind | HTTP Status | Meaning | Recovery |
|------|-------------|---------|----------|
| `invalid_input` | 400 | Missing `orderNo` | Never sent to SCAPI; dialog shows generic error |
| `invalid_reason` | 400 | Reason code does not match OMS configuration | Terminal; submit stays disabled (no per-item recovery — cancel is order-level) |
| `not_found` | 404 | Order does not exist or caller lacks access | Terminal; submit stays disabled |
| `not_cancellable` | 409 | Order state prevents cancellation (already shipped, cancelled, etc.) | Terminal; submit stays disabled |
| `transient` | 5xx, network, or unrecognized 4xx | Retryable server/network error | Submit stays enabled; shopper can retry inline |

Unlike returns, cancel errors do not carry per-item recovery affordances. A 400 is always `invalid_reason`, and 404/409 are terminal.

## Order Tracking

The order detail page renders a "Tracking Number" card for each shipment that has tracking-relevant data: tracking number, carrier URL, provider name, or a delivery date. A "Track Shipment" dropdown action links to external carrier tracking pages when carrier URLs are available.

### How It Works

1. The order detail loader fetches the order with `expand: ['oms', 'oms_shipments']` to load OMS shipment enrichment (`order.omsData.shipments[]`).
2. [`getOrderTrackingEntries`](../src/lib/order-management/tracking.ts) maps the order's shipments to a normalized list of tracking entries. **OMS-preferred, ECOM-fallback:** if `order.omsData.shipments[]` is present, it is used; otherwise the function falls back to the legacy `order.shipments[]` (tracking number + status only — provider, carrier URL, and delivery dates are OMS-only). There is no positional OMS↔ECOM join — we return one whole list or the other.
3. The tracking card ([`order-tracking/index.tsx`](../src/components/account/order-tracking/index.tsx)) renders each entry that has a tracking number, provider, or delivery date. A bare `trackingUrl` (no number/provider/date) produces no card.
4. The "Track Shipment" action ([`track-shipment.ts`](../src/components/account/order-tracking/track-shipment.ts)) links to the carrier URL when exactly one shipment has an externalizable URL; when multiple shipments have carrier links, it becomes a dropdown. When no carrier URLs are available, the action links to the in-page `#order-tracking` anchor.

### Tracking Data Fields

| Field | Source | Notes |
|-------|--------|-------|
| `trackingNumber` | OMS shipment or ECOM shipment | Displayed in the tracking card; used as the dropdown option label |
| `trackingUrl` | OMS shipment only | External carrier deep link (e.g., UPS, FedEx tracking page). Passed through [`ensureExternalUrl`](../src/lib/utils.ts) before rendering to reject relative/unsafe URLs. |
| `provider` | OMS shipment only | Carrier name (e.g., "UPS", "FedEx") |
| `status` | OMS shipment or ECOM `shippingStatus` | Shipment status (e.g., "Shipped", "Delivered"); displayed in the tracking card but excluded from the visibility check — status is already conveyed by the shipping-status badge |
| `expectedDeliveryDate` | OMS shipment only | ISO date string; parsed via [`parseTrackingDate`](../src/lib/order-management/tracking.ts) |
| `actualDeliveryDate` | OMS shipment only | ISO date string; parsed via [`parseTrackingDate`](../src/lib/order-management/tracking.ts) |

### Date Parsing

[`parseTrackingDate`](../src/lib/order-management/tracking.ts) guards against three failure modes:

1. **Falsy input** — `null`/`undefined` returns `null` first. Without this guard, `new Date(null)` silently returns the epoch (1970-01-01), which would render "Dec 31, 1969".
2. **Unparseable string** — A truthy-but-invalid string yields an Invalid Date, caught via `isNaN(getTime())`, so it renders nothing instead of throwing in downstream formatting.
3. **Epoch-era sentinel** — A truthy 1970-era string (e.g., `"1970-01-01T00:00:00Z"`) parses to a valid Date but is rejected by `date.getUTCFullYear() <= 1970`. OMS does not currently send such a sentinel; this is cheap insurance if it ever does.

### Carrier Link Safety

Carrier URLs are sanitized via [`ensureExternalUrl`](../src/lib/utils.ts) before rendering. This function rejects relative URLs (e.g., `/tracking/123`) and `javascript:` pseudo-protocols, returning `undefined` for unsafe values. Only absolute `http`/`https` URLs are rendered as links.

### Track Shipment Action States

The "Track Shipment" action has three states:

1. **Single external link** — When exactly one shipment has a usable carrier URL, the action is a button that opens the carrier tracking page in a new tab.
2. **Multi-shipment dropdown** — When multiple shipments have carrier URLs, the action is a dropdown listing each tracking number (or "Shipment N" for entries without a number). Each option opens the corresponding carrier page.
3. **In-page anchor** — When no shipments have externalizable carrier URLs, the action links to the `#order-tracking` anchor (the tracking card section) so the shopper can still scroll to the tracking details.

**Reference:** [`getTrackShipmentHref`](../src/components/account/order-tracking/track-shipment.ts), [`getTrackShipmentTargets`](../src/components/account/order-tracking/track-shipment.ts)

## Status Badge

The order detail page displays an order-level status badge derived from item-level OMS data. Three derivations are checked in order:

1. **Cancel status** — When every product item is in OMS `canceled` state ([`isOrderCancelled`](../src/lib/order-management/cancel.ts)), the badge shows "Cancelled" in the critical (red) style.
2. **Return status** — When at least one item is returned or has a return in flight ([`getOrderReturnStatus`](../src/lib/order/status.ts)), the badge shows one of four derived return statuses (see below). In-progress return states use the `info` (blue) style; complete states use `muted` (gray).
3. **Fulfillment status** — When neither cancel nor return applies, the badge aggregates item-level fulfillment buckets ([`getOrderFulfillmentStatus`](../src/lib/order/status.ts)) and shows one of six fulfillment statuses (e.g., "Ordered", "In Progress", "Shipped", "Delivered"). All fulfillment badges use the `success` (green) style.

### Why Item-Level Status is Authoritative

SCAPI carries return and fulfillment state **only** at the line-item level (`productItems[*].omsData.status`) — never at order level. The order-level `order.status` (the ECOM status: `created`, `new`, `completed`, `cancelled`, `replaced`, `failed`) stays stale after OMS updates and is only the fallback for ECOM-only orders. The order-level `order.omsData.status` is similarly unreliable — it does not reflect per-item return/cancel/fulfillment changes. For this reason, the badge aggregates item-level `omsData.status` to derive the true order-level state.

**Reference:** [`resolveOrderStatus`](../src/lib/order/status.ts)

### Derived Return Statuses

[`getOrderReturnStatus`](../src/lib/order/status.ts) aggregates per-item return buckets into one of four order-level statuses:

| Status | Meaning |
|--------|---------|
| `RETURN_COMPLETE` | All active units (excluding cancelled units) have been returned |
| `PARTIAL_RETURN_COMPLETE` | Some (not all) active units have been returned |
| `RETURN_INITIATED` | All active units have return requests in flight; none yet returned |
| `PARTIAL_RETURN_INITIATED` | Some active units have return requests in flight; none yet returned |

When a line carries OMS per-unit quantities (`quantityOrdered`, `quantityCanceled`, `quantityReturned`, `quantityReturnInitiated`), it is expanded into individual units: cancelled units drop out, returned units are counted as returned, in-flight return units (`quantityReturnInitiated - quantityReturned`) are counted as initiated, and the remainder take the line's `status`. This lets a single line with `quantity > 1` report a partial return. When quantities are absent, the line falls back to one unit categorized by its `status` string.

`returned` is the terminal state and outranks in-flight returns. Any order with at least one returned unit resolves to a `*_COMPLETE` status.

### Derived Fulfillment Statuses

[`getOrderFulfillmentStatus`](../src/lib/order/status.ts) aggregates per-item fulfillment buckets into one of six order-level statuses:

| Status | Meaning |
|--------|---------|
| `DELIVERED` | All active units have been delivered |
| `PART_ORDER_DELIVERED` | Some (not all) active units have been delivered |
| `SHIPPED` | All active units have been shipped (none delivered) |
| `PARTIALLY_SHIPPED` | Some active units have been shipped (none delivered) |
| `IN_PROGRESS` | At least one unit is in progress (allocated, fulfilled, processing); none shipped or delivered |
| `ORDERED` | All active units are ordered (created, approved, new, open, placed); none in progress, shipped, or delivered |

Unknown item statuses default to `IN_PROGRESS` (never a terminal state like "Delivered") so an unexpected value never reads as completed.

## Refunds (Out of Scope)

Payment refunds are not owned by the storefront. The UI only initiates return/cancel requests; refund is an automated downstream process managed by Salesforce Order Management (SOM).

### Return Flow

When a shopper submits a return request, the storefront calls `POST .../actions/oms-return-order`, which creates a return order in SOM with status `Return Initiated`. Once the shopper physically returns the item and the merchant processes it, SOM transitions the return order to a closed state. This triggers the **EnsureRefunds** automation:

1. SOM creates a credit memo for the returned items.
2. SOM calls the payment service provider (PSP) to issue a refund to the original payment method.
3. The refund appears in the shopper's account per the PSP's timeline (typically 5-10 business days).

The storefront never calls a refund API — the entire refund lifecycle is orchestrated by SOM after the return order is created.

### Cancellation Flow

When a shopper cancels an order, the storefront calls `POST .../actions/oms-cancel-order`. SOM updates the order items to `canceled` status, which triggers the same **EnsureRefunds** automation as a return: SOM creates a credit memo and initiates a PSP refund. The storefront is not involved in the refund step.

### Return Label Generation

Return label generation is a merchant/carrier workflow outside the storefront's scope. Some merchants configure SOM to auto-generate return labels (via carrier integrations like UPS, FedEx, or third-party providers); others handle return labels manually. The storefront does not provide a return label download or email flow — that is either configured in SOM or managed out-of-band by the merchant.
