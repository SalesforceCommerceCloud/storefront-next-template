# (Demo) Buy Now Pay Later (BNPL)

Renders an inline installment message and a "Learn more" payment-schedule modal on
the PDP, gated by the `sfcc.pdp.bnpl.message` UITarget.

> **Demo / mock stub.** This extension ships with hard-coded fixture data — it is
> a reference implementation, not a production integration. The fixtures return
> the same payment schedule for every product. To go live, replace the bodies of
> the two functions in `lib/api/bnpl.server.ts` with calls into your BNPL
> provider (PayPal, Klarna, Affirm, etc.). Types are stable, so consumers don't
> change.

## Data sources

`src/extensions/bnpl/lib/api/bnpl.server.ts` exports two server-only functions:

- `getBuyNowPayLaterMessage(productId)` — short inline message data.
- `getBuyNowPayLaterLearnMore(productId)` — full payment-schedule modal data.

Both currently return mock fixtures. Swap each function body to wire in a real
provider; the rest of the extension (loader, UITarget wrapper, component) stays
the same.

## Loader integration

The PDP route loader (`src/routes/_app.p.$.tsx`) creates two
deferred Promises (`bnplMessage`, `bnplLearnMore`) that are streamed to the
target wrapper via `useRouteLoaderData('routes/_app.p.$')`. The
imports and loader fields are bracketed by `@sfdc-extension-block-start/-end
SFDC_EXT_BNPL` markers so they're stripped cleanly when the extension is
uninstalled.

## UITarget

`sfcc.pdp.bnpl.message` is rendered inside `src/components/product-cart-actions`
beneath the add-to-cart button. The target's wrapper component
(`components/target/bnpl-target.tsx`) sources data via `useRouteLoaderData` and
streams it through `<Suspense>`/`<Await>`.
