# Delivery Estimates

The Shipping & Delivery extension displays product-specific delivery estimates on the product detail page (PDP). It calls the Shopper Delivery Estimates API with the product and a shopper destination, then shows delivery windows for the shipping methods that can fulfill that product at that destination.

This extension is a live SCAPI integration. Installing the storefront alone does not configure a delivery-estimate provider or make estimates available.

## Shopper Experience

The PDP initially asks the shopper for a postal code when no destination is known. For registered shoppers, the extension can first use a stored browser destination and otherwise resolves a customer address. A shopper-entered destination is stored in the browser for 30 days when the request returns an estimate or the supported merchant fallback.

The estimator:

- Validates and normalizes postal codes for the destination country. The country comes from the active site locale unless a saved destination supplies a country code.
- Requests delivery options for the selected product and destination.
- Displays only shipping options that include a delivery window.
- Uses the lowest-priced available option as the primary summary. When prices are unavailable, it uses the earliest delivery-window end date among the unpriced options.
- Shows a dialog with all available delivery options when more than one option is returned.

The default summary target shows the arrival window and hides the primary shipping price. The detailed target also shows the price when the API returned one.

Delivery estimates are a PDP feature. They do not select a shipping method, alter a basket, or replace checkout shipping-method selection.

## Prerequisites

Configure all of the following before expecting live estimates:

| Requirement | Why it is needed |
|---|---|
| Shopper API Client ID | The storefront uses its configured SLAS client to call SCAPI. |
| SLAS scopes `sfcc.shopper-delivery-estimates` and `sfcc.shopper-standard` | Allow the shopper client to call the Delivery Estimates API and its supporting shopper APIs. |
| Online products assigned to the current site | The selected PDP product must be available to the active site. |
| Delivery-estimate Commerce App | Install and configure a Commerce App that can return delivery windows for your catalog, inventory, and shipping setup. |
| Commerce App binding | Bind the installed app's provider to `sfcc.app.shipping.estimate`. |

The exact app and provider configuration is merchant-specific. Install and configure the app, then create the binding in the B2C Commerce administration experience used by your organization. Verify that the provider returns delivery windows for a product and destination before testing the storefront.

Product shipping-method descriptions are optional. The storefront uses the first non-pickup description only as general merchant guidance after the Delivery Estimates API returns `403` or `500`; they do not produce a live, destination-specific estimate.

## Enable the Extension

Keep the `SFDC_EXT_SHIPPING_DELIVERY` extension installed when generating or customizing the storefront. Its registry entry is in [`src/extensions/config.json`](../src/extensions/config.json), and its PDP integration is marked in [`src/routes/_app.product.$productId.tsx`](../src/routes/_app.product.$productId.tsx).

The extension registers the `sfcc.pdp.estimatedDelivery` target in [`src/extensions/shipping-delivery/target-config.json`](../src/extensions/shipping-delivery/target-config.json). The canonical PDP renders that target from [`src/components/product-view/product-info.tsx`](../src/components/product-view/product-info.tsx).

No storefront environment variable enables delivery estimates. The normal storefront SCAPI configuration still applies:

```bash
PUBLIC__app__commerce__api__clientId=your-slas-client-id
PUBLIC__app__commerce__api__organizationId=your-b2c-commerce-organization-id
PUBLIC__app__commerce__api__shortCode=your-scapi-short-code
```

For private SLAS clients, also configure `COMMERCE_API_SLAS_SECRET`. See [Configuration](./README-CONFIG.md) for the full SCAPI configuration reference.

## Target Customization

The default target uses the summary wrapper:

```json
{
    "targetId": "sfcc.pdp.estimatedDelivery",
    "path": "extensions/shipping-delivery/components/target/delivery-estimate-summary-target.tsx",
    "order": 0
}
```

To include the primary shipping price, change the target path to:

```text
extensions/shipping-delivery/components/target/delivery-estimate-detailed-target.tsx
```

You can also point the target to a merchant-owned component. Preserve the existing server resource routes and their response handling unless you are deliberately replacing the integration:

| File | Responsibility |
|---|---|
| [`resource.shipping-estimate.ts`](../src/extensions/shipping-delivery/routes/resource.shipping-estimate.ts) | Validates the destination, calls the delivery-estimate API, and controls destination-cookie persistence. |
| [`resource.shipping-destination.ts`](../src/extensions/shipping-delivery/routes/resource.shipping-destination.ts) | Resolves the initial destination for registered shoppers. |
| [`shipping-delivery.server.ts`](../src/extensions/shipping-delivery/lib/api/shipping-delivery.server.ts) | Maps SCAPI shipping options to the storefront display contract. |
| [`postal-code-formats.ts`](../src/lib/shipping-estimate/postal-code-formats.ts) | Defines postal-code normalization and validation by country. |

The resource routes are same-origin only and return `Cache-Control: no-store`. Do not move the Shopper Delivery Estimates API call into a browser component, because the SDK server client supplies the required shopper authentication and request middleware.

For merchant-specific presentation, point the target to a component in your storefront. See the extension override guidance in [`src/extensions/README.md`](../src/extensions/README.md).

## Empty Results and Failures

An estimate is available only when SCAPI returns at least one shipping option with a delivery window.

| Condition | Storefront behavior |
|---|---|
| Invalid postal code | The UI validates the value before requesting an estimate and asks the shopper to correct it. |
| Invalid product ID or country code | The resource route rejects the request and the UI shows that delivery dates are unavailable. |
| No product estimate, no shipping options, or no delivery windows | No delivery date is displayed. The entered destination is not persisted. |
| Delivery Estimates API returns `403` or `500` | The extension tries to display the first non-pickup shipping-method description configured on the product. This is general merchant guidance, not a destination-specific estimate. |
| Other upstream or catalog-fallback failure | The UI shows that delivery dates are unavailable and lets the shopper try another destination. |

The catalog fallback comes from the product's `shippingMethods[].description`. Keep that copy general, such as a shipping policy or typical service-level statement. Do not describe it as a guaranteed delivery date for the shopper's postal code.

## Verification

After configuring the Commerce App, binding, product assignment, and scopes:

1. Start the storefront and open a PDP for an online product assigned to the active site.
2. Scroll to the delivery-estimate card. The calculator loads when it enters the viewport.
3. Enter a valid postal code for a destination the provider can serve, then select **Calculate**.
4. Confirm that the PDP shows the returned delivery window. If multiple methods are available, confirm the additional-options dialog lists them.
5. Refresh the PDP and confirm that a successful manually entered destination is reused. It should not be saved after an empty result.
6. Test a postal code with no deliverable method and confirm no date is displayed.
7. Temporarily test a provider failure in a non-production environment. For `403` or `500`, confirm that a configured non-pickup shipping-method description is shown; otherwise confirm the unavailable state is shown.

## Troubleshooting

| Symptom | Check |
|---|---|
| The card is not on the PDP | Confirm `SFDC_EXT_SHIPPING_DELIVERY` is installed, the `sfcc.pdp.estimatedDelivery` target remains registered, and your PDP renders the target. The canonical PDP intentionally omits it while availability for the selected product or variant is deferred. |
| The card never makes an estimate request | Scroll the card into view. The calculator is intentionally deferred until it is visible. |
| SCAPI returns `403` | Verify the SLAS client has `sfcc.shopper-delivery-estimates` and `sfcc.shopper-standard`, and verify the `sfcc.app.shipping.estimate` binding. |
| No delivery dates are returned | Verify the product is online and site-assigned and that the provider can return a delivery window for the submitted destination. |
| The fallback message is missing | Add a non-empty description to a non-pickup product shipping method. The fallback is attempted only for Delivery Estimates `403` and `500` responses. |
| The wrong postal-code format is shown | Verify the site's active locale or the saved destination country code. Postal-code validation follows that country. |

## Related Files

- [`src/extensions/shipping-delivery/`](../src/extensions/shipping-delivery/) - Shipping & Delivery extension implementation.
- [`src/lib/shipping-estimate/`](../src/lib/shipping-estimate/) - Shared destination, response, and postal-code utilities.
- [`docs/README-SCAPI.md`](./README-SCAPI.md) - SCAPI client configuration and overrides.
- [`src/extensions/README.md`](../src/extensions/README.md) - Extension registration and targets.
