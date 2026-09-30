# Adopting SEO URL Rules

Turn on configurable SEO product and category URLs (`seoRoutes`) in an existing
storefront-next project. This guide covers the prerequisites that gate a safe
rollout, why no route files are renamed, how the two category modes differ, how
to avoid breaking already-indexed URLs, and where the storefront's ownership
ends in a hybrid deployment.

For the configuration reference—the `url.seoRoutes` shape, the semantic URL
builders, and the build-fail rules—see
[README-MULTI-SITE.md, URL Config](../../README-MULTI-SITE.md#url-config). This
guide is the migration playbook; that section is the reference. It does not
repeat the mechanics.

## What `seoRoutes` Changes

`seoRoutes` maps each Commerce site's Business Manager URL settings to the
product and category path segments the storefront generates and serves. With it
set, a product URL becomes `/{product-prefix}/{slug}/{id}` and a category URL
becomes `/{category-prefix}/{slug}/{id}` (or a pure slug path—see
[Category Modes](#category-modes)),
keyed per site. Without it, the storefront serves the built-in `/product/{id}`
and `/category/{id}` grammar.

The prefixes mirror Business Manager. Business Manager is the source of truth;
`seoRoutes` is the build-time mirror of it. When a merchant changes a URL setting
in Business Manager, the matching `seoRoutes` value must be updated and the
storefront rebuilt and redeployed—the two do not sync automatically (see
[Business Manager Is the Source of Truth](#business-manager-is-the-source-of-truth-manual-sync)).

## Prerequisites

Do not enable `seoRoutes` until **all** of these hold:

- Your project's `@salesforce/storefront-next-runtime` and
  `@salesforce/storefront-next-dev` packages are on the SDK release that ships
  the route-registration layer (`SeoRoutesConfig`, `apply-seo-url-config`) or
  newer.
- **Every active site has an entry.** `seoRoutes` is keyed by Commerce site ID,
  and URL generation throws for a site with no entry, because the compiled
  manifest no longer contains the built-in product and category routes. A
  partial map is a build-or-runtime failure, not a gradual rollout.
- **Every active site's PDP/PLP grammar is decided.** Slug-path categories
  require Shopper Products 1.13, Shopper Search 1.15, and authoritative slug
  data at every category-link surface (see [Category Modes](#category-modes)).

These are the same two gates stated in
[README-MULTI-SITE.md, URL Config](../../README-MULTI-SITE.md#url-config). They
are prerequisites, not warnings—a storefront that ships `seoRoutes` before they
hold will either fail the build or fail to generate URLs for an omitted site.

## Rename the Product and Category Route Modules

Rename `src/routes/_app.product.$productId.tsx` to `_app.p.$.tsx` and
`src/routes/_app.category.$categoryId.tsx` to `_app.c.$.tsx`. Rename matching
vertical overlays and tests, and update route-ID consumers to
`routes/_app.p.$` and `routes/_app.c.$`.

Without `seoRoutes`, these modules provide the reference `/p/*` and `/c/*`
routes. Product IDs and category IDs or slug paths are resolved from the splat
at the loader boundary.

At build time each becomes a pathless parent that owns its configured prefix
aliases, so the registered union of prefixes routes back to the same loader and
component. The one constraint: both modules must be **leaf routes** (no nested
child routes) when `seoRoutes` is enabled, or the build fails with a
"must be a leaf route" error. If either already has children, move those
children elsewhere before you enable.

Because the route files are unchanged, `src/route-paths.ts` needs no new entries
for product or category destinations. Generate those URLs with the semantic
builders instead of static patterns:

- `createProductUrl({ productId, slug }, seoUrlContext)`
- `createCategoryUrl({ categoryId, slugSegments }, seoUrlContext)`
- `createCategoryUrlFromLegacyPath(legacyPath, seoUrlContext)` for
  merchant-authored links stored as legacy `/category/...` strings

Bind the context with `useSeoUrlContext()` in components. The builders return the
functional path only; the template's `Link` and navigation wrappers still add the
outer `/:siteId/:localeId` prefix. They encode each segment independently and make
no SCAPI or Shopper SEO call.

## Category Modes

`category.mode` is `id-suffix` or `slug-path`, and the difference decides what
data you must have before enabling:

| Mode | URL shape | How the PLP resolves the category | Prerequisite |
|---|---|---|---|
| `id-suffix` | `/{prefix}/{slug}/{id}` | Reads the category ID from the **final raw path segment** of the request URL—deterministic, no lookup | Category ID present as the last segment |
| `slug-path` | `/{prefix}/{full-slug-path}` | Sends the full path to `getCategory` and uses `cgslug` in the existing product-search pipeline | Shopper Products 1.13, Shopper Search 1.15, and complete authoritative slugs at every category-link surface |

`id-suffix` mode is deterministic: the category (PLP) loader resolves the
category from the last raw path segment, so a URL like `/c/womens/dresses/25502`
resolves with no slug→ID lookup and no SEO-mapping request—the trailing ID is
authoritative. This is why `id-suffix` is the lower-prerequisite choice.

Enabling `seoRoutes` replaces the built-in `/category/{id}` route with the
configured `{prefix}/*` alias, so the legacy grammar is no longer served in-app.
Redirect it to the new form (see
[Preventing Broken Indexed URLs and Redirect Loops](#preventing-broken-indexed-urls-and-redirect-loops)).

In `slug-path` mode the loader starts `getCategory(fullSlug)` and the critical
`productSearch(refine=cgslug=<fullSlug>)` together. It reuses the returned category
ID for metadata, analytics, schema, and Page Designer context; it does not add a
second product-search call. Query-string `cgid` and `cgslug` values cannot override
the category selected by the route.

Outbound category links use the complete `Category.slug` or `PathRecord.slug`
hierarchy. The template does not substitute category IDs or display names for
missing slugs. Interactive controls without a slug are disabled; static legacy
category destinations use the existing search route with `refine=cgid=<id>`.
Category search suggestions also use a category-ID search refinement because
that response has no authoritative category slug.

Product slugs are optional—the product ID stays authoritative and sits at the
tail of the URL. Category slugs are optional in `id-suffix` mode too, so the
storefront also generates slug-less `/{prefix}/{id}` category URLs; `slug-path`
mode requires at least one slug segment. When `seoRoutes` is enabled, existing
Shopper Products requests that feed product links, plus product search and
suggestions, include `expand=slug`. PDPs, tiles, recommendations, carts,
wishlists, Page Designer, typeahead, and structured data therefore use the
configured slug without another request. Storefronts without SEO routes keep the
compatible request shape for older B2C Commerce versions.

## Preventing Broken Indexed URLs and Redirect Loops

Changing a product or category prefix changes every already-indexed URL for that
resource. When an ID-suffix PDP or PLP resolves successfully, Storefront Next
compares the incoming decorative slug hierarchy with the authoritative slug
returned by the existing Shopper API response. A stale hierarchy receives one
`301` to the configured canonical path. This adds no lookup or URL Mapping call.
When the authoritative slug is absent, Storefront Next keeps the valid ID route
and does not invent or redirect a slug.

Use Business Manager URL Mapping or the CDN edge for old prefixes, `.html` forms,
slug-only historical category paths, and other URLs that cannot resolve by their
authoritative ID. Scheduled URL Mapping redirects apply only from `onlineFrom`
through `onlineTo`, inclusive.

- **Redirect old grammar to new with a single 301.** Map forms the storefront
  cannot resolve by authoritative ID at the CDN / Business Manager URL-redirect
  layer (for example `/product/{id}` → `/p/{slug}/{id}`). A 301 preserves the
  ranking signal and keeps existing inbound links working.
- **Redirect once, to the canonical target.** The canonical target is the URL the
  storefront now generates for that resource. Do not chain redirects (old → interim
  → canonical) and do not let the new URL redirect back toward the old grammar—
  either produces a redirect loop that search crawlers penalize. Point every legacy
  form directly at the canonical form.
- **`.html` suffixes.** If the merchant's legacy Commerce URLs carried a `.html`
  suffix, the new `seoRoutes` grammar does not. Redirect the `.html` form to the
  suffix-less canonical URL with a 301; do not serve both.
- **Confirm the canonical tag matches.** The page's `<link rel="canonical">` must
  point at the same URL the redirect targets. A redirect to one URL with a
  canonical tag naming another sends conflicting signals.

Roll a site's prefix change and its redirect rules out together. A prefix change
without redirects breaks indexed URLs; redirects without the prefix change send
traffic to a grammar the storefront no longer serves.

## Hybrid Ownership Boundaries

In a [hybrid deployment](../../README-HYBRID-PROXY.md), some paths are served by
storefront-next and some by the existing Commerce (SFRA/SiteGenesis) storefront.
`seoRoutes` governs only the paths storefront-next owns.

- The storefront generates and serves product and category URLs under its
  configured prefixes for the sites it owns.
- Paths owned by the legacy storefront keep their Commerce-managed URLs. Do not
  assume `seoRoutes` rewrites them.
- An outdated or external inbound URL that matches neither the new grammar nor a
  redirect rule falls through to the terminal Shopper SEO fallback. For an
  eligible `GET` or `HEAD` request the catch-all makes one Business Manager
  Shopper SEO URL Mapping lookup and, on a hit, redirects through the configured
  URL builders (product, category, plain URL, and hybrid handoffs). A miss, a
  rejected result, or an ineligible request returns a 404, and a legacy-owned
  path in a hybrid deployment is left for the legacy storefront. External
  redirect origins and forwarded query parameters are denied unless you allow
  them per site in `seoFallback.sites`; see
  [README-MULTI-SITE.md, Shopper SEO URL Rules Fallback](../../README-MULTI-SITE.md#shopper-seo-url-rules-fallback).
  Still cover the legacy forms you want handled at the edge with the redirect
  rules in [Preventing Broken Indexed URLs and Redirect Loops](#preventing-broken-indexed-urls-and-redirect-loops).

## Business Manager Is the Source of Truth (Manual Sync)

`seoRoutes` is a **build-time mirror** of Business Manager URL settings. There is
no automatic synchronization: a change made in Business Manager does not reach a
deployed storefront until someone updates `config.server.ts` and redeploys.

The rebuild requirement follows from `seoRoutes` being a `protectedPaths` value—
it is compiled into the React Router manifest and cannot be overridden with a
`PUBLIC__` environment variable. Update `config.server.ts`, rebuild, redeploy.

Automatic Business-Manager-to-storefront synchronization is a tracked follow-up,
not current behavior. Until it ships, treat every Business Manager URL change as a
storefront config change too.

## Using This Guide with Claude Code

You can drive the config edit by pasting this guide plus your target grammar into
a Claude Code session. A framing sentence that works:

> Enable `seoRoutes` in `packages/template/config.server.ts` for every active
> site in `commerce.sites`, using product prefix `p` and category prefix `c` in
> `id-suffix` mode. Do not rename any route file. Do not put a site in
> `slug-path` mode. Then run `pnpm typecheck` and `pnpm build` and report any
> "must be a leaf route" or missing-site errors.

The build is the safety net: an invalid prefix, a prefix shared across resource
types, a collision with another route branch, or a non-leaf product/category
route all fail the build. Still run through the
[Verification Checklist](#verification-checklist) before you ship.

## Verification Checklist

Enabling `seoRoutes` is a build-time config change; the reference-configuration
scenarios below are validated against a deployed instance by QA. Work the list
per site.

- [ ] `pnpm typecheck` and `pnpm build` are green with `seoRoutes` set for every
      active site.
- [ ] The build reports no "must be a leaf route", invalid-prefix,
      shared-prefix, or collision error.
- [ ] Every active site in `commerce.sites` has a `seoRoutes` entry—no site is
      omitted.
- [ ] **Deterministic routing:** a product URL and a category URL under the new
      prefixes resolve the correct PDP/PLP with no Shopper-SEO / URL-mapping
      request in the network trace.
- [ ] **Fallback:** an outdated or external URL that matches neither the new
      grammar nor a redirect rule falls through to the terminal Shopper SEO
      fallback—confirm an eligible `GET`/`HEAD` request with a matching Business
      Manager Shopper SEO URL Mapping redirects to the mapped destination, that a
      mapping miss or an ineligible request returns a 404, and that a
      disallowed external origin or forwarded query parameter is denied unless
      permitted in `seoFallback.sites` (hybrid: legacy-owned paths still resolve
      on the Commerce storefront).
- [ ] **Canonical:** each PDP/PLP renders a `<link rel="canonical">` pointing at
      the URL the storefront now generates, matching the redirect target. A stale
      decorative slug on a valid ID-suffix PDP/PLP returns one `301` to that
      canonical path without an additional lookup or URL Mapping call; missing
      authoritative slug data keeps the valid ID route without inventing a slug.
- [ ] **Redirects:** the legacy grammar (and any `.html` suffix form) 301s once,
      directly to the canonical URL, with no redirect loop. For scheduled URL
      Mapping redirects, verify the mapping is inactive before `onlineFrom`,
      active at both inclusive boundaries, and inactive after `onlineTo`.
- [ ] **Sitemap:** generated sitemap entries use the new prefixes and contain no
      legacy-grammar URLs.
- [ ] **Crawler rendering and pagination:** crawlers receive fully-rendered HTML,
      and paginated category results stay crawlable through `?page=N` with
      `rel="prev"` / `rel="next"` links. See
      [README-SEO.md, Crawler Rendering and Pagination](../../README-SEO.md#crawler-rendering-and-pagination).
- [ ] In `slug-path`, category links preserve the complete authoritative
      hierarchy; missing slugs degrade without a lookup, and category pages use
      one route-authoritative `cgslug` refinement in every search phase.

## Links

- [README-MULTI-SITE.md, URL Config](../../README-MULTI-SITE.md#url-config)—
  the `url.seoRoutes` reference, semantic builders, and build-fail rules.
- [README-HYBRID-PROXY.md](../../README-HYBRID-PROXY.md)—hybrid deployment and
  which storefront owns which paths.
- [README-SEO.md](../../README-SEO.md)—page titles, meta tags, canonical URL
  rendering, and crawler rendering and pagination.
