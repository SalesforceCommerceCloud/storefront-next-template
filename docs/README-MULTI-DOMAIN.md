# Multiple Domains, One Environment

A single Managed Runtime environment can serve **many storefront domains** at once — for example
`brand-a.com`, `brand-b.com`, and `shop.brand-c.com` all pointing at the same deployment. Each
shopper stays on the domain they arrived on: links, redirects, emails, and SEO tags are all built
from the domain in the current request, not from a single hard-coded hostname.

You do **not** need a separate build or environment per domain. The storefront detects the
shopper-facing domain on every request and adapts automatically.

> This is the mirror image of [Base Path](./README-BASE-PATH.md). Use this page when **many domains
> share one environment**; use Base Path when **one domain is split across many environments**.

| Scenario | Doc |
|---|---|
| Many domains → one environment | **This page** |
| One domain → many environments (path-prefixed) | [Base Path](./README-BASE-PATH.md) |

## When to use this

- **Each domain maps to a different B2C Commerce site** (e.g. `site-a.shop.com` → `RefArch`,
  `siteb.shop.com` → `RefArchGlobal`) off one deployment — see
  [Mapping each domain to a different site](#mapping-each-domain-to-a-different-b2c-site).
- One codebase and deployment powering several brands or country sites on distinct domains.
- A staging environment reachable from both its Managed Runtime hostname and a friendlier vanity
  domain.
- Consolidating multiple low-traffic storefronts onto one environment to simplify operations.

If the domains are truly independent brands, this keeps them isolated at the URL level while sharing
infrastructure. If instead you want several storefronts under **one** domain (e.g.
`example.com/brand-a`, `example.com/brand-b`), use [Base Path](./README-BASE-PATH.md) instead.

## How it works

Managed Runtime sits behind a CDN. When a shopper visits one of your domains, the CDN forwards the
request to your environment and records the domain the shopper actually used in the
**`X-Forwarded-Host`** request header (and the scheme in `X-Forwarded-Proto`). The storefront reads
these headers to determine the **public origin** — the `scheme://host` the shopper sees in their
address bar — for the current request.

```
   brand-a.com          brand-b.com          shop.brand-c.com
        \                    |                     /
         \                   |                    /
          `-------> [ Managed Runtime CDN ] <----'
                             |
             X-Forwarded-Host: <the domain the shopper used>
             X-Forwarded-Proto: https
                             |
                   [ One MRT Environment ]
              EXTERNAL_DOMAIN_NAME = <fallback only>
```

Because the origin is resolved **per request**, the same environment produces
`https://brand-a.com/...` for one shopper and `https://brand-b.com/...` for another — with no
per-domain configuration in the storefront.

### Request flow example

A shopper on `brand-b.com` starts a passwordless (magic-link) login:

```
1. Browser
   GET https://brand-b.com/login
        |
2. Managed Runtime CDN
   - Forwards to your environment
   - Sets X-Forwarded-Host: brand-b.com
        |
3. Storefront (one environment)
   - Resolves public origin for this request: https://brand-b.com
   - Builds the magic-link callback URL: https://brand-b.com/callback...
   - Sends the SLAS redirect_uri as https://brand-b.com/...
        |
4. Shopper clicks the emailed link
   - Lands back on brand-b.com — the domain they started on
```

Without per-request resolution, that callback would be built from a single fixed hostname and the
shopper on `brand-b.com` could be redirected to the wrong domain — breaking login, or triggering a
`redirect_uri doesn't match the registered redirects` error from SLAS.

## Configuration

For most cases there is **nothing to configure in the storefront** — domain resolution is automatic.
The steps below cover the environment setup and the two optional storefront settings that interact
with custom domains.

### 1. Attach each domain to your environment (Managed Runtime)

In Runtime Admin, register every domain you want the environment to serve as an **external
hostname**, and point each domain's DNS/CDN at that environment. An environment only responds to
requests whose host matches a hostname configured for it. See the
[Managed Runtime documentation](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime)
for adding domains and certificates.

Add each domain's registered redirect URIs (e.g. `https://brand-b.com/callback`) to your SLAS
client's allowed redirect list, so social/passwordless/password-reset callbacks are accepted on
every domain.

### 2. `EXTERNAL_DOMAIN_NAME` — fallback only

`EXTERNAL_DOMAIN_NAME` is the hostname used **only when no forwarded host header is present** — for
example at server start-up (before any request) or in local development. It does **not** cap which
domains the environment can serve: the per-request `X-Forwarded-Host` always takes precedence, so a
single fallback value is fine no matter how many domains you attach.

| Environment | Value |
|---|---|
| Local dev (`pnpm dev`) / preview | Defaults to `localhost:<port>` |
| Production (Managed Runtime) | Set automatically to the environment's assigned domain |

You normally don't set this by hand. In local development you can point it at a specific hostname
if you need to exercise absolute-URL behavior (e.g. `EXTERNAL_DOMAIN_NAME=shop.local.test:5173`).

### 3. Images on custom domains — `realmHostMappings`

The image pipeline (DIS) needs to know your Commerce Cloud realm. On standard
`*.commercecloud.salesforce.com` hosts it infers the realm automatically, but on a **custom domain**
it cannot. Map each domain to its realm in `config.server.ts` so images resize correctly on every
domain:

```typescript
// config.server.ts
images: {
    realmHostMappings: [
        { hostSuffix: 'brand-a.com', realm: 'ZZRF_001' },
        { hostSuffix: 'brand-b.com', realm: 'ZZRF_002' },
        { hostSuffix: '.brand-c.com', realm: 'BJNL_PRD' }, // matches shop.brand-c.com, m.brand-c.com, …
    ],
}
```

See [Images § Vanity Domains and Custom Realm Mappings](./README-IMAGES.md#vanity-domains-and-custom-realm-mappings)
for matching rules.

### 4. Cookies — host-only is usually what you want

By default every cookie is **host-only**, scoped to the exact domain that served the response. For
independent brands on separate domains this is the correct behavior — a session on `brand-a.com`
does not leak to `brand-b.com`.

Only set a [cookie domain](./README-COOKIE-DOMAIN.md) when the domains are **subdomains of one
parent** that should share a session (e.g. `www.example.com` and `account.example.com`). Do **not**
set a shared cookie domain across unrelated brand domains.

## Mapping each domain to a different B2C site

A common use of this pattern is giving each domain its own B2C Commerce site while sharing everything
else:

| Domain | Site |
|---|---|
| `site-a.shop.com` | `RefArch` |
| `siteb.shop.com` | `RefArchGlobal` |

**Yes, this is a multi-site setup.** Every site you serve must be declared in `commerce.sites` (see
[Multi-Site & Locale URL Routing](./README-MULTI-SITE.md)). The only thing that changes from a
normal multi-site storefront is *how the site is selected*: the **domain** picks the site instead of
a `/:siteId/` path segment.

The sites can **share one SCAPI configuration** (org ID, short code, SLAS client). SCAPI is
org-level — the site is just a `siteId` parameter on each call. The storefront passes the site
resolved for the current request into every SCAPI call automatically, so `site-a.shop.com` talks to
`RefArch` and `siteb.shop.com` talks to `RefArchGlobal` off the same client config.

### How the domain selects the site

Site detection reads the site from one of four sources — a path segment, a query param, a cookie, or
a request **header**. There is **no built-in "detect from hostname" source**, so the clean way to
drive the site from the domain is to have your CDN translate each domain into the **`X-Site-Id`**
request header:

| Domain | CDN sets header |
|---|---|
| `site-a.shop.com` | `X-Site-Id: RefArch` |
| `siteb.shop.com` | `X-Site-Id: RefArchGlobal` |

The header value can be the site ID or its configured alias. Then configure `config.server.ts` so
the header is authoritative and the site is no longer expected in the URL path:

```typescript
// config.server.ts
export default {
    app: {
        // 1. Declare every site (they can all use the same SCAPI/org config).
        commerce: {
            sites: [
                { id: 'RefArch',       defaultLocale: 'en-US', supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }] },
                { id: 'RefArchGlobal', defaultLocale: 'en-GB', supportedLocales: [{ id: 'en-GB', preferredCurrency: 'GBP' }] },
            ],
        },
        defaultSiteId: 'RefArch',

        // 2. Site comes from the domain (X-Site-Id header), not the URL path.
        //    Keep locale in the path so URLs stay shareable: /en-US/product/123
        url: { prefix: '/:localeId', excludeRoutes: ['/resource/**', '/action/**'] },

        // 3. Read the site from the header; drop 'path' so the locale segment isn't
        //    mistaken for a site. Locale is now the first path segment (index 0).
        siteDetectionConfig:   { order: ['header', 'cookie'], lookupHeader: 'X-Site-Id' },
        localeDetectionConfig: { lookupFromPathIndex: 0 },
    },
};
```

Now `https://siteb.shop.com/en-GB/product/123` renders `RefArchGlobal` in `en-GB`, and
`https://site-a.shop.com/en-US/product/123` renders `RefArch` in `en-US` — from one deployment.

> **Changing `url.prefix` requires a rebuild.** The prefix is baked into the route structure and
> can't be changed at runtime via `PUBLIC__` environment variables. Update `config.server.ts` and
> rebuild. See [Multi-Site § URL Config](./README-MULTI-SITE.md#url-config).

### Request flow

```
1. Browser → GET https://siteb.shop.com/en-GB/product/123
        |
2. Managed Runtime CDN → forwards to the environment
     - X-Forwarded-Host: siteb.shop.com   (drives the public origin)
     - X-Site-Id: RefArchGlobal           (drives site selection)
        |
3. Storefront (one environment)
     - Resolves site   = RefArchGlobal            (from X-Site-Id)
     - Resolves origin = https://siteb.shop.com   (from X-Forwarded-Host)
     - SCAPI calls use siteId=RefArchGlobal
     - Canonical / hreflang / JSON-LD URLs use https://siteb.shop.com
```

Because the public origin and the site are both resolved per request, each domain gets both correct
site-specific commerce data **and** correct absolute URLs.

### Notes

- **Fallback:** if `X-Site-Id` is missing (a request that bypasses the CDN, or a misconfigured rule),
  the storefront falls back to `defaultSiteId`. Make sure your CDN sets the header for every route on
  every domain.
- **Cookies stay per-domain:** with host-only cookies (the default), a `site_id` cache written on
  one domain is never sent to another, so domains can't cross-contaminate each other's site. Don't
  set a shared cookie domain across these domains.
- **No CDN header injection?** If your edge can't add request headers, keep the site in the URL
  (`/:siteId/:localeId`, the standard multi-site setup) or have the CDN rewrite the path to include
  the site segment. Domain-as-site-selector specifically depends on the edge translating
  domain → header (or → path).

## What automatically uses the request domain

Once your domains are attached, these features build absolute, shopper-facing URLs from the current
request's domain — no code changes required:

| Feature | Why the domain matters |
|---|---|
| Passwordless (magic-link) and password-reset emails | The emailed link must return the shopper to the domain they started on |
| Social login callbacks | OAuth redirect must land on the originating domain |
| SLAS `redirect_uri` | Must match the domain's registered redirect or auth fails |
| Canonical & `hreflang` tags | `<link rel="canonical">` / `hreflang` must reference the public domain, not an internal hostname ([SEO](./README-SEO.md)) |
| Structured data (JSON-LD) | Product/category URLs in schema must use the public domain ([AEO/GEO](./README-AEO-GEO.md)) |
| Any other absolute URL built server-side | Uses the same resolved origin |

Under the hood these all resolve the origin the same way, via `getAppOrigin()` in
[`src/lib/origin.ts`](../src/lib/origin.ts). If you build your own absolute URLs on the server, use
that helper (pass the router `context`) rather than reading headers or `EXTERNAL_DOMAIN_NAME`
directly — that keeps your URLs correct across all domains.

## Security: trusting the forwarded host

The storefront trusts `X-Forwarded-Host` because Managed Runtime's CDN sets it and strips any
client-supplied value, and the environment is only reachable through that CDN. This is safe for the
standard Managed Runtime deployment.

If you ever expose the environment **directly** — bypassing the CDN so requests can reach it without
going through Managed Runtime's edge — a client could spoof `X-Forwarded-Host` and poison the URLs
embedded in login and password-reset emails. Don't run that topology. If you must, put a proxy in
front that pins the host to a trusted value before the request reaches the storefront.

## Verifying

Deploy, attach your domains, then confirm each one resolves to itself:

- **Canonical tag** — load a page on each domain and check the rendered
  `<link rel="canonical" href="https://<that-domain>/...">` matches the domain you're on
  (View Source, or `curl -s https://brand-b.com/ | grep canonical`).
- **Auth round-trip** — trigger passwordless login or password reset on each domain and confirm the
  emailed link and the post-login redirect stay on that domain.
- **Images** — confirm product images load (correct realm) on each custom domain.
- **Local check** — simulate a forwarded host against a running dev/preview server:
  ```bash
  curl -s -H 'X-Forwarded-Host: brand-b.com' -H 'X-Forwarded-Proto: https' \
    http://localhost:5173/ | grep canonical
  # expect: <link rel="canonical" href="https://brand-b.com/..."/>
  ```

## Related docs

- [Base Path](./README-BASE-PATH.md) — the inverse scenario (one domain, many environments)
- [Multi-Site & Locale URL Routing](./README-MULTI-SITE.md) — site/locale detection and URL config
- [Cookie Domain Configuration](./README-COOKIE-DOMAIN.md) — when to share cookies across subdomains
- [Images](./README-IMAGES.md#vanity-domains-and-custom-realm-mappings) — realm mappings for custom domains
- [SEO](./README-SEO.md) — canonical and `hreflang` URLs
- [Authentication](./README-AUTH.md) — auth flows and callback URLs
