# Hybrid Proxy: Local Development Guide

> **LOCAL DEVELOPMENT ONLY**
>
> The hybrid proxy Vite plugin only works with `pnpm dev`. It must not be enabled in production.
> For MRT or production deployments, routing between Storefront Next and SFRA is handled by **Cloudflare eCDN**. Do not rely on this plugin for any production traffic.

The hybrid proxy lets you run Storefront Next and SFRA side-by-side in local development without any visible redirects. The Vite dev server silently proxies requests that belong to SFRA, so you can navigate between Storefront Next pages and SFRA pages at `http://localhost:5173` as if they were a single site.

## Features

**Side-by-side local development**
Run Storefront Next and SFRA simultaneously at a single origin (`localhost:5173`) with no visible redirects or session loss. Navigate freely between Storefront Next pages and SFRA pages as if they were one unified storefront.

**Parity with eCDN routing rules**
Routing decisions use the same Cloudflare eCDN expression format (`http.request.uri.path matches`) as your production configuration. Your `HYBRID_ROUTING_RULES` value can be copied directly from (or kept in sync with) your eCDN origin rules, so local dev routing stays true to production.

**Configuration flexibility**
No assumptions are made about which pages live on Storefront Next vs SFRA. You define the split entirely through `HYBRID_ROUTING_RULES`. Any combination of migrated and legacy pages is valid — include only the routes you've built in Storefront Next.

**Feature flag**
A dedicated `HYBRID_PROXY_ENABLED` flag controls the proxy. It defaults to `false`, so the proxy never activates unless you explicitly turn it on. The plugin is also guarded by a `mode === 'development'` check in `vite.config.ts`, making it impossible to enable in a production build.

## How It Works

1. Every request to the Vite dev server passes through the hybrid proxy middleware first.
2. The middleware checks the request path against your `HYBRID_ROUTING_RULES`.
3. **Matching paths** (e.g., `/`, `/p/*`, `/account/*`) are passed to React Router — Storefront Next handles them.
4. **Non-matching paths** (e.g., `/cart`, `/checkout`) are silently proxied to your SFCC sandbox (`SFCC_ORIGIN`).
5. The proxy rewrites the path to SFRA format: `/cart` → `/s/{siteId}/{locale}/cart`.
6. Set-Cookie headers from SFCC are rewritten (`Domain=localhost`) so session cookies work across both apps on localhost.
7. URLs inside proxied HTML and JSON responses are rewritten from the SFCC origin to `localhost:5173`, keeping all client-side navigation within the proxy.
8. **A cookie interceptor script is injected into every proxied HTML page.** SFRA's client-side JavaScript sets cookies directly via `document.cookie`, bypassing the proxy entirely. Without this interceptor, those cookies would be written with the wrong domain and fail silently — breaking hybrid auth session continuity. The injected script patches `document.cookie` at the browser level before any SFRA script runs, ensuring client-side cookie writes go through the same normalization as Set-Cookie headers from the server.

## Setup

### 1. Copy the environment template

If you haven't already:

```bash
cp .env.default .env
```

### 2. Configure the hybrid variables

Add the following to your `.env` file. See [Environment Variables](#environment-variables) below for the full reference — note that some variables are required in all environments, while others are local dev only.

---

## Environment Variables

### Application Config (All Environments)

These variables must be set in **every environment** — local development, staging, and production (MRT). They are standard `PUBLIC__` config variables that are bundled into the app and read at runtime.

#### `PUBLIC__app__hybrid__enabled`

Enables hybrid mode globally. Must be `true` for the legacy-routes middleware to activate. Defaults to `false`.

```bash
PUBLIC__app__hybrid__enabled=true
```

---

#### `PUBLIC__app__hybrid__legacyRoutes`

A JSON array of route patterns that belong to SFRA (the legacy backend). When a user clicks a `<Link>` to one of these routes, the client-side navigation middleware intercepts it and forces a full-page load. The browser then navigates to the URL normally, letting the CDN (eCDN in production) or the Vite proxy (local dev) route the request to SFRA.

Supports three pattern forms:

| Form        | Example          | Matches                                                                              | Does **not** match                     |
| ----------- | ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| Exact path  | `/cart`          | `/cart` only                                                                         | `/cart/` or `/cart/anything`           |
| Named param | `/product/:id`   | A single path segment in place of `:id` (e.g. `/product/123`)                        | `/product/123/details` (multi-segment) |
| Wildcard    | `/categoryLv1/*` | Any path content under the prefix, including `/` (e.g. `/categoryLv1/shoes/running`) | `/categoryLv1` (no trailing slash)     |

```bash
PUBLIC__app__hybrid__legacyRoutes='["/cart", "/checkout", "/product/:id", "/categoryLv1/*"]'
```

To keep a configured standalone-content prefix on the legacy storefront, include both its bare path and subtree:

```bash
PUBLIC__app__hybrid__legacyRoutes='["/cms", "/cms/*"]'
```

The content prefix in `url.seoRoutes` is build-time because it defines the route grammar. Ownership remains runtime-configurable here. A legacy match hands off before the content loader or Shopper SEO fallback runs, so changing ownership does not require rebuilding the route manifest. Keep the production eCDN rule and local `HYBRID_ROUTING_RULES` aligned with this setting.

Use `:name` when you need a single-segment placeholder (no `/` allowed). Use `*` when the legacy backend owns an entire subtree and you'd otherwise have to enumerate every URL underneath. The two can be combined — e.g. `/category/:cat/*` matches `/category/shoes/details/blue`. `*` may also appear in the middle of a pattern (e.g. `/files/*-thumb`); React Router itself only allows splats at the end, but this matcher does not enforce that.

> **`/parent/*` does not match the bare `/parent`.** The trailing `/` in the pattern is required, so `/categoryLv1/*` matches `/categoryLv1/shoes` and `/categoryLv1/` but **not** `/categoryLv1`. If you need both, list `/categoryLv1` as a separate exact entry. Note that the eCDN regex example below (`^/categoryLv1.*`) _does_ match the bare path — so copy-pasting between the two configs gives divergent behavior at exactly the parent path. Either add the bare entry here or use `^/categoryLv1(/.*)?$` on the eCDN side to keep them aligned.

> **The bare pattern `'*'`** matches any path (catch-all, regex `^.*$`). Use it deliberately — it's only useful when you want every navigation to fall through to the legacy backend.

> **Keep this in sync with your eCDN routing rules.** Any path that is _not_ in `HYBRID_ROUTING_RULES` (i.e., it belongs to SFRA) and could be the target of a `<Link>` in Storefront Next should be listed here. If a route is missing from this list, React Router will attempt to render it client-side and show a 404 or error boundary instead of handing off to SFRA. The eCDN expression is plain regex, so a wildcard entry here typically corresponds to a `^/categoryLv1.*` pattern in `HYBRID_ROUTING_RULES`.

---

### Proxy Plugin Config (Local Development Only)

These variables configure the Vite dev server proxy. They are only read during `pnpm dev` and have no effect in production builds.

#### `HYBRID_PROXY_ENABLED`

Activates the proxy. Set to `true` to enable.

```bash
HYBRID_PROXY_ENABLED=true
```

The proxy is disabled by default (`false`) in `.env.default`.

---

#### `SFCC_ORIGIN`

The full HTTPS URL of your SFCC sandbox. All non-matching requests are forwarded here.

```bash
SFCC_ORIGIN=https://zzrf-001.dx.commercecloud.salesforce.com
```

This is separate from `PUBLIC__app__commerce__api__shortCode`. It must be the actual hostname of your SFRA instance, not the SCAPI base URL.

---

#### `HYBRID_ROUTING_RULES`

A Cloudflare-style routing expression that declares which paths belong to Storefront Next. Every path **matching** the expression is routed to React Router; every path **not matching** is proxied to SFCC.

The expression format uses `http.request.uri.path matches "<regex>"` clauses joined with `or`:

```bash
HYBRID_ROUTING_RULES='(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/product.*")'
```

See [Writing Routing Rules](#writing-routing-rules) below for a full breakdown.

---

#### `PUBLIC__app__defaultSiteId`

Your B2C Commerce site ID. Used to build the SFRA path prefix (`/s/{siteId}/{locale}/...`). This is already required for the storefront to work and is likely already set in your `.env`.

```bash
PUBLIC__app__defaultSiteId=RefArchGlobal
```

---

### Optional

#### `HYBRID_PROXY_LOCALE`

The locale used when rewriting paths to SFRA format. If not set, falls back to `PUBLIC__app__i18n__fallbackLng`. If neither is set, the proxy uses `default`.

```bash
HYBRID_PROXY_LOCALE=en-GB
```

Set this when your SFRA site requires a specific locale in its URL path that differs from the storefront's i18n fallback.

---

## Writing Routing Rules

`HYBRID_ROUTING_RULES` is the core of the hybrid proxy. It declares ownership of each route: Storefront Next or SFRA.

### Expression format

Each clause follows the pattern:

```
http.request.uri.path matches "<regex>"
```

Multiple clauses are combined with `or`. The full expression is wrapped in parentheses:

```
(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/category.*")
```

This is the same format used to configure Cloudflare eCDN routing, so your local `HYBRID_ROUTING_RULES` value should stay in sync with your production eCDN configuration.

### Required patterns

Some patterns are required for Storefront Next to function correctly regardless of which pages you've migrated. Missing these will break React Router functionality:

| Pattern        | Why it's required                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `^/resource.*` | React Router [resource routes](https://reactrouter.com/how-to/resource-routes) — server endpoints that return data, not HTML |
| `^/action/.*`  | React Router [actions](https://reactrouter.com/start/framework/actions) used by form submissions and mutations               |

> `.data` requests (React Router's data fetch format) are automatically excluded from proxying by the dev server — you do not need to add them to your routing rules, though including them is harmless.

### Page route patterns (optional — pick what fits your migration)

These are the routes your storefront has migrated to Storefront Next. Include the ones you've built and exclude the ones still on SFRA:

| Pattern               | Route                       |
| --------------------- | --------------------------- |
| `^/$`                 | Homepage                    |
| `^/login.*`           | Login page                  |
| `^/logout.*`          | Logout                      |
| `^/signup.*`          | Registration                |
| `^/reset-password.*`  | Password reset              |
| `^/account.*`         | Account pages               |
| `^/product.*`         | Product detail pages        |
| `^/category.*`        | Category / PLP pages        |
| `^/search.*`          | Search results              |
| `^/social-callback.*` | Social login OAuth callback |

### Full example

This example represents a storefront where the homepage, auth pages, product, category, search, and account have been migrated to Storefront Next, while cart and checkout remain on SFRA:

```bash
HYBRID_ROUTING_RULES='(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/reset-password.*" or http.request.uri.path matches "^/signup.*" or http.request.uri.path matches "^/logout.*" or http.request.uri.path matches "^/login.*" or http.request.uri.path matches "^/category.*" or http.request.uri.path matches "^/product.*" or http.request.uri.path matches "^/search.*" or http.request.uri.path matches "^/account.*" or http.request.uri.path matches "^/social-callback.*" or http.request.uri.path matches "^/resource.*" or http.request.uri.path matches "^/action/.*")'
```

### Automatically excluded paths

These paths are never proxied to SFCC regardless of routing rules:

- `/@*`, `/__*` — Vite virtual modules and dev server internals
- `/src/*`, `/node_modules/*` — Source files served by Vite
- `*.data` — React Router data requests
- `/mobify/*` — SCAPI proxy paths (handled by React Router)
- Static asset extensions (`.js`, `.css`, `.png`, `.woff2`, etc.)

SFRA static assets (`/on/demandware.static/*`, `/on/demandware.store/*`) are always proxied to SFCC and cannot be overridden.

---

## Path Transformation

The proxy automatically rewrites paths to SFRA's expected URL format. You never need to include `/s/{siteId}/{locale}/` in your routing rules or application links.

| Browser URL                 | Proxied to SFCC as                              |
| --------------------------- | ----------------------------------------------- |
| `/`                         | `/s/RefArchGlobal` (locale-less site root)      |
| `/cart`                     | `/s/RefArchGlobal/en-GB/cart`                   |
| `/checkout`                 | `/s/RefArchGlobal/en-GB/checkout`               |
| `/on/demandware.static/...` | `/on/demandware.static/...` (no transformation) |
| `/s/...`                    | `/s/...` (no transformation)                    |

The `siteId` comes from `PUBLIC__app__defaultSiteId`. The `locale` uses `HYBRID_PROXY_LOCALE` → `PUBLIC__app__i18n__fallbackLng` → `default`. The query string is always preserved through the rewrite.

### URL-prefix awareness (multi-site / locale prefixes)

When your storefront uses a `url.prefix` in `config.server.ts` (e.g. `/:localeId` or `/:siteId/:localeId`), Storefront Next emits links that already carry the site/locale segment — `/uk/cart`, `/global/en-GB/cart`. The proxy reads `url.prefix` and your site/locale alias catalog from `config.server.ts` automatically and **reuses the site/locale the path already carries** rather than stacking the fallback on top of it. No extra `.env` configuration is required for the standard prefix shapes.

| `url.prefix`         | Browser URL          | Proxied to SFCC as            | Note                                                                           |
| -------------------- | -------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| _none_               | `/cart`              | `/s/RefArchGlobal/en-GB/cart` | Decorated with the `defaultSiteId` / fallback locale                           |
| `/:localeId`         | `/uk/cart`           | `/s/RefArchGlobal/uk/cart`    | Reuses `uk` from the path — **not** double-stacked                             |
| `/:localeId`         | `/uk`                | `/s/RefArchGlobal/uk/`        | Locale home keeps its locale                                                   |
| `/:localeId`         | `/cart`              | `/s/RefArchGlobal/en-GB/cart` | Bare legacy path — `cart` isn't a known locale, so the fallback locale is used |
| `/:siteId/:localeId` | `/global/en-GB/cart` | `/s/global/en-GB/cart`        | Reuses both segments from the path                                             |

A prefix segment is only treated as a site or locale when it is a **known identifier** — a site/locale id or its configured alias. This is what lets the proxy tell a locale home (`/uk`) apart from a bare legacy path (`/cart`) when both fit a single-segment `/:localeId` prefix: `uk` is a known locale alias, `cart` is not.

> **Escape hatch (last resort).** For a non-standard URL model the standard prefix handling can't express, `hybridProxyPlugin` accepts an optional `rewritePath(pathname)` callback in `vite.config.ts`. Return the SFRA path to use, or `null` to fall through to the built-in transformation. Prefer the OOTB behavior — reach for this only when your URL model genuinely differs from the `url.prefix` shapes above.

---

## Cookie Behavior

Hybrid auth requires that both Storefront Next and SFRA share the same session cookies (`dwsid`, `cc-*`). The proxy keeps them in sync in three ways:

1. **Set-Cookie header rewriting (Layer 1):** SFCC response headers have `Domain=.salesforce.com` rewritten to `Domain=localhost`. All other cookie attributes (`Secure`, `SameSite`, `HttpOnly`) are preserved. Localhost is a [secure context](https://w3c.github.io/webappsec-secure-contexts/), so `Secure` cookies work on `http://localhost`.

2. **Storefront Next server cookies (Layer 2):** Storefront Next sets its own session cookies (`dwsid`, access token, refresh token, etc.) server-side via the auth middleware. These are written directly to `localhost` and require no rewriting. The proxy does not modify them.

3. **Client-side cookie interception (Layer 3) — localhost workaround only:** An inline script is injected at the top of every proxied HTML page. It patches `document.cookie` to apply the same `Domain=localhost` rewrite to any cookies set by SFRA's own JavaScript. SFRA's client-side scripts check `window.location.protocol` to decide whether to include `Secure` on cookies — on `http://localhost` they omit it, producing cookies the browser silently rejects. **This layer exists solely to compensate for localhost's non-HTTPS context and has no equivalent in the eCDN-based hybrid implementation used in production.**

---

---

## Gotchas and Pitfalls

### Routing rules out of sync with production eCDN

Your `HYBRID_ROUTING_RULES` should match your production Cloudflare eCDN routing configuration. If they diverge, you may see behavior in local dev that doesn't match production — a route that works locally might end up on the wrong backend in production.

### Missing routing rules cause cookie corruption

If a Storefront Next route (e.g., `/login`) is missing from `HYBRID_ROUTING_RULES`, the request is proxied to SFCC instead of React Router. SFCC won't find that path and will redirect to its 404 page, clearing session cookies in the process. The proxy detects this and strips `Set-Cookie` headers from 404 redirects, logging a warning:

```
[Hybrid Proxy] SFCC returned a redirect to 404 for /login
  This usually means your HYBRID_ROUTING_RULES are missing a pattern for this path.
```

If you see this warning, add the missing path to `HYBRID_ROUTING_RULES`.

### SFRA path must exist on `SFCC_ORIGIN`

If you proxy a path that doesn't exist in SFRA (e.g., `/cart` when your SFRA instance doesn't have a cart page), SFCC returns an error or redirect. The proxy forwards whatever SFCC returns — it has no way to know if the destination page is valid.

### `HYBRID_PROXY_LOCALE` must match SFRA's expected locale

SFRA expects URLs in the format `/s/{siteId}/{locale}/path`. If the locale in the proxy's path transformation doesn't match what SFRA is configured to accept, you'll get 404s or redirects. Set `HYBRID_PROXY_LOCALE` to match `config.app.commerce.sites[0].defaultLocale` for the site you're developing against.

### Compressed responses

The proxy decompresses `gzip`, `brotli`, and `deflate` responses before rewriting URLs. If SFCC uses a compression format other than these three, body rewriting is skipped and you may see SFCC origin URLs in the response.

### SFRA `plugin_redirect` returns 200 with Location

SFRA's `plugin_redirect` cartridge sometimes responds with HTTP 200 and a `Location` header instead of a proper 3xx redirect. Browsers only follow `Location` on 3xx responses, so without intervention the proxied page renders blank. The hybrid proxy detects this case (status 200 + non-empty `Location`) and converts the response into a 302 with the rewritten (localhost) `Location`, dropping the upstream body. `Set-Cookie` headers are preserved through the conversion so session continuity is maintained. This affects local development only. eCDN does not normalize 200 + Location responses in production — if this response shape reaches shoppers, fix the SFRA cartridge or add an eCDN worker rule.

### This plugin only runs in development mode

The `hybridProxyPlugin` is wrapped in a `mode === 'development'` check in `vite.config.ts`. It is a no-op in production builds. The hybrid proxy must not be enabled in production.

---

## Custom Route Matching

> **We strongly recommend using the default `shouldRouteToNext` matcher.** Overriding it means your local dev routing no longer mirrors the Cloudflare eCDN expression format used in production. Only do this if you have a specific reason and understand the divergence it introduces.

By default, the proxy uses `shouldRouteToNext` from `@salesforce/storefront-next-dev`, which parses the Cloudflare `http.request.uri.path matches` expression format.

You can override this in `vite.config.ts` by providing a custom `routeMatcher` callback:

```typescript
// vite.config.ts
import { hybridProxyPlugin, shouldRouteToNext } from '@salesforce/storefront-next-dev';

hybridProxyPlugin({
    // ...
    routeMatcher: (pathname, rules) => {
        // Add per-path overrides on top of the standard eCDN expression:
        if (pathname === '/my-custom-page') return true; // always → Storefront Next
        if (pathname === '/legacy-only') return false; // always → SFRA
        // Fall back to standard eCDN expression matching for everything else:
        return shouldRouteToNext(pathname, rules);
    },
});
```

Or replace the matcher entirely:

```typescript
routeMatcher: (pathname) => myOwnRoutingLogic(pathname),
```

The callback receives:

- `pathname` — the request path, e.g. `/category/mens-shoes`
- `routingRules` — the raw `HYBRID_ROUTING_RULES` string from your `.env`

Return `true` to route to Storefront Next, `false` to proxy to SFCC.

If the matcher throws, the proxy fails safe: the request is passed to React Router rather than proxied.

---

## Complete `.env` Example (assuming you've already copied other values from .env.default)

```bash
# ── Application config (required in ALL environments: local dev, staging, production) ──

# Enable hybrid mode — activates the client-side navigation middleware
PUBLIC__app__hybrid__enabled=true

# SFRA-owned routes — React Router <Link> clicks to these trigger a full-page load
# so the CDN (or Vite proxy locally) can route them to SFRA instead of React Router
PUBLIC__app__hybrid__legacyRoutes='["/cart", "/checkout"]'

# ── Proxy plugin config (local development only — ignored in production builds) ──

# Enable the Vite dev server proxy
HYBRID_PROXY_ENABLED=true

# Your SFCC sandbox origin
SFCC_ORIGIN=https://zzrf-001.dx.commercecloud.salesforce.com

# Locale for SFRA path transformation (optional — falls back to PUBLIC__app__i18n__fallbackLng)
HYBRID_PROXY_LOCALE=en-GB

# Routing rules: paths listed here → Storefront Next, everything else → SFRA
# The inverse of PUBLIC__app__hybrid__legacyRoutes: these are the routes Storefront Next owns
HYBRID_ROUTING_RULES='(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/reset-password.*" or http.request.uri.path matches "^/signup.*" or http.request.uri.path matches "^/logout.*" or http.request.uri.path matches "^/login.*" or http.request.uri.path matches "^/category.*" or http.request.uri.path matches "^/product.*" or http.request.uri.path matches "^/search.*" or http.request.uri.path matches "^/account.*" or http.request.uri.path matches "^/social-callback.*" or http.request.uri.path matches "^/resource.*" or http.request.uri.path matches "^/action/.*")'

# B2C Commerce site ID (already required for the storefront — just make sure it's set)
PUBLIC__app__defaultSiteId=RefArchGlobal
```
