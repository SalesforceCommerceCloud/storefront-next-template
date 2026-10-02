# Returns and Exchanges

A shopper can return or exchange items from Order History. The options follow policy rules, and the shopper can track the request after submitting it. Nothing here talks to Order Management.

Two things are saved on the order as Text custom attributes holding versioned JSON:

| Attribute | Written by | Holds |
| --- | --- | --- |
| `c_deliverySplit` | The storefront, on the **basket** just before the order is placed. SFCC copies basket attributes to the order. | What was promised at checkout: deliveries, hubs, dates, tracking numbers. |
| `c_returns` | The **Returns custom API** (cartridge), after the order exists. Shopper APIs cannot update a placed order. | The return and exchange requests for the order. |

## Business Manager setup

Create both as **Text** attributes (Merchant Tools → Site Preferences → System Object Types):

- `Basket` → `c_deliverySplit`
- `Order` → `c_deliverySplit` and `c_returns`

Both must also be readable through SCAPI (custom property exposure for Shopper Orders and Shopper Customers). If an attribute is not exposed, the order pages simply behave as if it were empty: orders fall back to the old delivery calculation and no returns appear.

## Delivery split (`c_deliverySplit`)

```json
{
  "version": 1,
  "shopperCityId": "BUS",
  "deliveries": [
    {
      "id": "D1", "hubId": "HUB-BUS", "city": "Batumi", "distanceKm": 20,
      "leadTimeDays": 1, "deliveryDate": "2026-10-08",
      "trackingNumber": "DRS-BUS-48291300",
      "items": [{ "itemId": "abc123", "productId": "DU-879242-M", "quantity": 1 }]
    }
  ]
}
```

- `leadTimeDays` is the total from the order: hub handling plus transit.
- `itemId` is the basket line id. SFCC keeps it on the order, so the same id is valid there.
- Code: `src/lib/delivery-promise/delivery-split.ts` (build, parse), `src/lib/checkout/delivery-split.server.ts` (save).
- It is saved in `action.place-order` and `action.place-order-prepare`. A failed save is logged and never blocks the order; pages fall back to calculating the split for the current city.
- Confirmation, Order Details and the return form read it with `parseDeliverySplit(order.c_deliverySplit)`.

## Returns (`c_returns`)

```json
{
  "version": 1,
  "returns": [
    {
      "rmaNo": "RMA-104233",
      "status": "approved",
      "clientRequestId": "6f1c…",
      "items": [
        { "itemId": "abc123", "quantity": 1, "action": "exchange", "reason": "too-small", "replacementSku": "DU-879242-S" }
      ],
      "history": [
        { "status": "submitted", "at": "2026-10-09T10:12:00Z" },
        { "status": "approved", "at": "2026-10-09T10:15:00Z" }
      ],
      "trackingNo": null
    }
  ]
}
```

- Reasons are the fixed ids in `src/lib/returns/types.ts` (`too-small`, `too-large`, `defective`, `not-as-described`, `changed-mind`, `wrong-item`).
- `clientRequestId` is an idempotency key: the same key returns the first return instead of creating another.
- Names, SKUs and ordered quantities are not stored; they are read back from the order lines.

### Return rules

Rules live in `src/lib/returns/return-policy.json` and are applied by `src/lib/returns/eligibility.ts`. Most specific rule wins: non-returnable SKU, then exchange-only SKU, then non-returnable category, then the default window. The window is counted from the delivery's own `deliveryDate` in `c_deliverySplit`; orders without a split use the older behaviour (SFCC shipment, OMS delivery date, or order date).

### Returns custom API

Cartridge `app_storefrontnext_base`, folder `cartridge/rest-apis/returns/`:

- `POST /orders/{orderNo}/returns` creates a return.
- `POST /orders/{orderNo}/returns/{rmaNo}/advance` moves it one status forward (presenter control).

Both answer `404` for an order that does not belong to the logged-in shopper, and both re-run the return rules on the server. The rules are plain ES5 in `cartridge/scripts/returns/returns-core.js`; the file `return-policy.json` next to it must equal the storefront's copy. `src/lib/returns/cartridge-parity.test.ts` runs the same cases through both implementations and fails if they differ or the two policy files drift apart.

Registration rules that matter (a mistake here makes the gateway answer `404 Resource Not Found` for the whole API):

- `api.json` maps each `operationId` to the schema and the script, with no file extension: `{ "endpoint": "createReturn", "schema": "schema.yaml", "implementation": "script" }`.
- Every endpoint must require exactly one custom scope that starts with `c_` (at most 25 characters). Here it is `c_returns`, declared on the `ShopperToken` scheme in `schema.yaml` and listed in each operation's `security`.
- The **SLAS client** the storefront uses must have the `c_returns` scope, otherwise the shopper token does not carry it and calls are refused.
- In server scripts a custom attribute is `order.custom.returns` and `order.custom.deliverySplit`, without the `c_` prefix. SCAPI adds the prefix in JSON.
- Endpoints are registered when the code version is **active**. After uploading, activate it again.

`schema.yaml` is also the source of the typed storefront client. After changing it:

```bash
pnpm exec sfnext scapi remove returns
pnpm exec sfnext scapi add --schema cartridges/app_storefrontnext_base/cartridge/rest-apis/returns/schema.yaml --name returns --base-path /custom/returns/v1
```

### Storefront

`src/lib/returns/return-store.ts` is the only module screens use. It has two backends behind one API, chosen by `features.returnsCustomApi`:

- **on**: reads `GET /resource/returns` (the shopper's returns from `c_returns` on their 50 most recent orders) and writes through `POST /action/return-create` and `POST /action/return-advance`, which call the custom API.
- **off** (default until the cartridge is deployed): browser `localStorage`, as in the original demo.

Set `PUBLIC__app__features__returnsCustomApi=true` after deploying the cartridge and creating the attributes.

### Presenter control

Add `?demo=1` to the return page to show the **Advance status** button. Without it the button is not rendered.

## Verification checklist

Run against a sandbox with the cartridge deployed and `returnsCustomApi` on. These need a real SFCC site and cannot be proven by the unit tests.

- A mixed Batumi and Tbilisi order has `c_deliverySplit` with two deliveries in Business Manager.
- Switching city, or opening the order the next day or on another device, shows the same deliveries, dates and tracking numbers.
- A return appears in `c_returns` in Business Manager, and on a second device.
- Calling the custom API for another customer's order answers `404`; a not-returnable item is rejected by the server (`400`); a double submit creates one RMA; a double click on Advance moves one step.
- Every id in `data/simplified_city_management.json` and `return-policy.json` exists on the sandbox and on the Dressup live site, and the swimwear products' primary category is one of `nonReturnableCategories`.
