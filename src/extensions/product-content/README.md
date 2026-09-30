# (Demo) Product Content

Renders three PDP surfaces backed by editorial / CMS-style content:

- **Returns & Warranty** info card + "View Policies" modal (`sfcc.pdp.returnsWarranty`)
- **Ask assistant FAQ** collapsible (`sfcc.pdp.faq`)
- **Collapsible product sections** (Materials, Usage Instructions, Care Instructions, Specifications) via `sfcc.pdp.collapsibles`

> **Demo / mock stub.** This extension ships with hard-coded fixture data — it is
> a reference implementation, not a production integration. The fixtures return
> the same content for every product. To go live, replace the bodies of the
> functions in `lib/api/product-content.server.ts` with calls into your CMS,
> PIM, or Page Designer-backed content service. Types are stable, so consumers
> don't change.

## Data sources

`src/extensions/product-content/lib/api/product-content.server.ts` exports
server-only functions:

- `getReturnsAndWarranty(productId)` — returns & warranty card + modal data.
- `getIngredientsData(productId)` / `getUsageInstructions(productId)` /
  `getCareInstructions(productId)` / `getTechSpecs(productId)` — pre-rendered
  HTML for the four collapsible sections.
- `getFaqQuestions(productId)` — list of suggested prompts for the "Ask assistant"
  collapsible (used only when the shopper agent is enabled and the product-context
  UI is on).

All currently return mock fixtures. Swap each function body to wire in a real
backend; the rest of the extension (loader, UITarget wrappers, components) stays
the same.

## Customizing the collapsible sections

`src/extensions/product-content/lib/pdp-sections.ts` exports `resolvePdpSections(product)`,
which returns the ordered list of collapsible sections rendered on the PDP. This
is the **intended customization seam** for merchants — vary sections by category,
product type, or any custom Business Manager attribute. The function runs
synchronously during SSR, so the correct shells are rendered on the first paint
(no layout shift).

## Loader integration

The PDP route loader (`src/routes/_app.p.$.tsx`) creates three
deferred Promises (`returnsWarranty`, `faqQuestions`, `pdpCollapsibles`) and
passes them into `ProductContentDataProvider` (defined in
`context/product-content-data-context.tsx`). Target wrappers read the Promises
via `useProductContentData()` — no hardcoded route IDs. The imports, loader
fields, and provider wrapping are bracketed by
`@sfdc-extension-block-start/-end SFDC_EXT_PRODUCT_CONTENT` markers so they're
stripped cleanly when the extension is uninstalled.

## UITargets

- `sfcc.pdp.returnsWarranty` and `sfcc.pdp.faq` mount inside
  `src/components/product-view/product-view.tsx`.
- `sfcc.pdp.collapsibles` renders the merchant-configured collapsible sections
  in the same parent.
- Each target wrapper sources data via `useProductContentData()` and streams it
  through `<Suspense>`/`<Await>`.
