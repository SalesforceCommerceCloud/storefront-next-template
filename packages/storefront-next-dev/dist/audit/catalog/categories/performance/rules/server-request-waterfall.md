---
id: performance/server-request-waterfall
title: Chained Server-Side Data Requests
severity: high
appliesTo: [home, plp, pdp]
inputs: [source.code, playhouse.summary]
---
## Intent
Traces the network calls each page makes while it renders on the server, and shows which calls wait for another call to finish before they start. Every chained call adds a full round trip before the page can be sent, so the report suggests chains that could run in parallel, be combined or be streamed. Some chains are necessary, when a call needs the earlier result.
## Inspect
For each page in `prepared.json`, find the routes that match its URL (`src/root.tsx`, the `_app` layout and the page route) and trace the server-side network calls an SSR request makes: SCAPI/SLAS/OCAPI clients, Einstein, `fetch`, MRT data store reads, and calls made by Page Designer component loaders. For each call, record:

- where it starts (file and line of the call, not of a wrapper);
- which other calls it waits on: an `await`, a `.then` on another call's result, or a middleware that runs earlier;
- whether it blocks the shell (awaited before the loader returns) or is returned as an un-awaited promise and streamed;
- whether it is conditional (for example, only without a valid access token);
- whether its data is critical: needed for LCP, above-the-fold content or SEO content (title, meta, structured data, the main product or product grid). Critical data should stay awaited.

React Router semantics: root middlewares run in order, and only I/O before `next()` delays the loaders. All matched loaders start together after the middleware chain. Request-scoped GET dedupe in `lib/api-clients.server.ts` turns identical reads into one call. List a deduped call once.

The calls Storefront Next makes by default are listed below to help you trace. Judge every call the same way, wherever it comes from.

### Default Storefront Next calls (template 2026.9)

- **Middleware (all pages).** `sitesConfigMiddleware` does one MRT data store read when `commerce.sitesFromDal` is on (the default). `auth` makes 0 SLAS calls with a valid access token, 1 (`POST /oauth2/token`, refresh) with an expired token, and 2 chained calls (`GET /oauth2/authorize` → `POST /oauth2/token`) for a public-client guest login. A failed refresh followed by a guest login is 3. Basket, shopper context, data store preferences, site URL config and Page Designer resolution do no I/O by default.
- **Root loader.** No I/O.
- **`_app` loader (streamed).** `getCategory(root, levels=1)` → `getCategories(children, levels=2)` (chained); `getComponent('header')` and `getComponent('mega-menu')` in parallel, each followed by its component loaders.
- **Home.** Bare `/` redirects to `/{site}/{locale}/` after the full middleware chain. On the prefixed URL, `getPage('homepage')` is awaited and blocking, followed by its component loaders (streamed). `productSearch(cgid=root)` and `getCategory(root)` start in parallel and stream; `getCategory(root)` is deduped with `_app`.
- **PLP.** `getCategory`, the critical `productSearch` (first 4 hits) and `getPages(plp)` start in parallel; the loader awaits the category, the critical search and the pages. The non-critical `productSearch` is chained after the critical search and streamed.
- **PDP.** `getProduct` (with expansions; it already includes variations, sets, bundles and the primary category) is awaited and blocking. `getPages(pdp)` is chained after it and streamed. A product-recommendations component makes Einstein → `getProducts` (chained, streamed). Reviews, BNPL and product content are mocks with no I/O; default recommendation carousels fetch client-side.

## Evaluate
The customer decides which suggestions to apply.

A chain is a call that waits on another data call; waiting only on middleware is the normal request pipeline. For every chained call and every awaited non-critical call, decide whether there is an opportunity:

- `parallelize`: the call doesn't need the earlier result (for example, it only needs a route param), so it can start alongside it.
- `scapi-hook`: the call fetches data that could come back with the earlier response, for example product custom attributes or inventory added to `getProduct` by a SCAPI `modifyGETResponse` hook, so one call replaces two.
- `stream`: the data isn't critical, so the loader can return the promise un-awaited and let it stream after the shell. Never suggest this for critical data.

Leave `opportunity` out when the chain is necessary (it needs the earlier result and the data is critical) and say why in `note`.

- `finding`: at least one opportunity.
- `pass`: every chain is streamed or necessary.
- `not-verified`: call sites that can't be resolved (opaque wrappers, compiled extensions).

TTFB from `summary.json` may corroborate the impact; never invent per-call timings.

## Evidence
Cite each call with an opportunity as `source` evidence (file and line), and optionally the page's TTFB as `playhouse` evidence (`summary.json`, `/cells/<n>/medianRun/ttfb`).

Also add a `waterfall` field to the output file with one entry per captured page you traced. The dashboard draws it; it does not carry timings:

```json
"waterfall": { "pages": [{
  "page": "pdp", "route": "src/routes/_app.product.$productId.tsx",
  "summary": "Auth, then getProduct, then an inventory call that only needs the product id.",
  "steps": [
    { "id": "auth", "kind": "middleware", "label": "auth · SLAS guest login", "service": "slas", "source": { "file": "src/middlewares/auth.server.ts", "line": 965 }, "after": [], "blocking": true, "conditional": "only without a valid access token" },
    { "id": "get-product", "kind": "api", "label": "shopperProducts.getProduct", "service": "scapi", "source": { "file": "src/routes/_app.product.$productId.tsx", "line": 172 }, "after": ["auth"], "blocking": true, "critical": true },
    { "id": "get-inventory", "kind": "api", "label": "GET /inventory/{id}", "service": "other", "source": { "file": "src/routes/_app.product.$productId.tsx", "line": 196 }, "after": ["get-product"], "blocking": true, "critical": true, "opportunity": "parallelize", "note": "Only needs params.productId, so it can start alongside getProduct." },
    { "id": "get-pages", "kind": "api", "label": "shopperExperience.getPages(pdp)", "service": "scapi", "source": { "file": "src/routes/_app.product.$productId.tsx", "line": 230 }, "after": ["get-product"], "blocking": false },
    { "id": "render", "kind": "render", "label": "Shell render", "source": { "file": "src/entry.server.tsx", "line": 68 }, "after": ["get-inventory"], "blocking": true }
  ]
}] }
```

- One step per network call. When a component calls Einstein and then `getProducts`, that's two steps, the second with `after` the first.
- `id`: lowercase letters, digits and hyphens, unique within the page.
- `kind`: `middleware`, `loader`, `api` (a network call) or `render` (the shell flush; add one, waiting on the last blocking calls).
- `service` (optional): `scapi`, `slas`, `ocapi`, `einstein`, `data-store` or `other`.
- `after`: ids this step waits on, including the previous middleware with I/O. Empty means it starts with the request.
- `blocking`: `false` for streamed (un-awaited) promises.
- `critical` (optional): `true` for LCP, above-the-fold or SEO data; `false` for the rest. Set it on every call you suggest changing.
- `opportunity` (optional): `parallelize`, `scapi-hook` or `stream`, as described under Evaluate. `stream` requires `blocking: true` and `critical: false`; `parallelize` and `scapi-hook` require a non-empty `after`.
- `conditional` and `note` (optional): short plain text. In `note`, explain the opportunity concretely, or why a chain is necessary.

The customer reads `summary` and `note`. Describe what each call does and what it waits on, not where it came from: don't compare calls to the template or label them as added or customized. Describe opportunities as options, not mistakes.
- At most 60 steps per page. Use project-relative file paths. Leave out middlewares and loaders with no I/O.

## Remediation
These are suggestions for the customer to weigh, not required fixes. Start independent calls before the first `await` (or use `Promise.all`). Return extra data with the earlier response through a SCAPI hook instead of a second call. Return non-critical data as un-awaited promises so it streams, but keep awaiting critical data (LCP, above-the-fold and SEO content) so it's in the first HTML.

## Examples
Compliant: PDP awaits auth, then `getProduct`, with `getPages` streamed. Also compliant: a PLP promotions call that needs the category's promotion ids and renders the above-the-fold banner, so it stays chained and awaited. Problematic: a PDP loader does `await getProduct`, then `await getInventory(params.productId)` (could run in parallel), then `await getReviews(params.productId)` (below the fold, could stream). Ambiguous: a chain inside a vendor extension whose source isn't in the project.
