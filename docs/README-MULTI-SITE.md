# Multi-Site & Locale URL Routing

This project supports multiple B2C Commerce sites and locales within a single storefront deployment. All URLs — including the homepage — use `/:siteId/:localeId/...` prefixes and are fully shareable. Requests to bare `/` are redirected server-side to the default site and locale prefix (e.g., `/global/en-GB/`).

## Quick Start

**In React components** — use `Link`, `NavLink`, or `useNavigate` from the template. They automatically prefix all URLs (including `/`) with the current site and locale:

```typescript
import { Link } from '@/components/link';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { createProductUrl } from '@/route-paths';

const seoUrlContext = useSeoUrlContext();

// Renders as /global/en-GB/p/123 with the shipped reference configuration.
<Link to={createProductUrl({productId: '123'}, seoUrlContext)}>View Product</Link>

// Renders as /global/en-GB/ (prefixed with current site context)
<Link to="/">Home</Link>
```

**In server loaders/actions** — use `buildUrlFromContext` to prefix URLs:

```typescript
import { buildUrlFromContext } from '@/lib/url.server';

export function loader({ context }: LoaderFunctionArgs) {
    throw redirect(buildUrlFromContext('/login', context));
    // → '/global/en-GB/login'
}
```

## Architecture Overview

The site context system consists of:

1. **Site context middleware (`site-context.server.ts`): Resolves site, locale, and currency from the request (URL path, cookies, locale config), stores them in router context
2. **URL config** (`config.server.ts`): Defines the URL pattern (`prefix`, `search`) and alias mappings
3. **`buildUrl`** (runtime SDK): Applies the URL prefix and search params to bare paths
4. **`buildUrlFromContext`** (`src/lib/url.server.ts`): Server-side helper that reads site/locale from router context and calls `buildUrl`
5. **`useCurrentSiteAndLocaleRef`** hook: Client-side helper that resolves the current site/locale aliases for URL building
6. **`Link`, `NavLink`, `useNavigate`**: Site-context-aware navigation primitives that call `buildUrl` internally

### Homepage & Root URL

The homepage lives at the prefixed path (e.g., `/global/en-GB/`). Bare `/` redirects server-side to the default site and locale prefix — this is handled in the homepage loader (`_app._index.tsx`), so customers can customize the redirect behavior.

| Request | Behavior |
|---|---|
| `/global/en-GB/` | Renders homepage for RefArchGlobal, en-GB |
| `/us/en-US/` | Renders homepage for RefArch, en-US |
| `/` | Redirects to `/{defaultSiteAlias}/{defaultLocale}/` (e.g., `/global/en-GB/`) |

### Request Flow

1. User requests `/global/en-GB/p/123`
2. Site context middleware resolves site and locale from the URL path (`global` → `RefArchGlobal`, `en-GB` → locale)
3. Site and locale objects are stored in router context for downstream consumers
4. i18next middleware reads the resolved locale and initializes translations
5. Loaders, actions, and components access the resolved site/locale from context

## Configuration

### URL Config

The `url` config in `config.server.ts` controls how site context URLs and build-time SEO routes are constructed:

```typescript
url: {
    prefix: '/:siteId/:localeId',
    search: '?lng=:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
    seoRoutes: {
        RefArchGlobal: {
            product: {prefix: 'p'},
            category: {prefix: 'c', mode: 'id-suffix'},
            content: {prefix: 'cms'},
        },
        RefArch: {
            product: {prefix: 'p'},
            category: {prefix: 'c', mode: 'id-suffix'},
            content: {prefix: 'cms'},
        },
    },
}
```

- **`prefix`** — Path segments prepended to every subpage URL. Uses `:param` placeholders that are replaced with values from `params` at build time.
- **`search`** — Query parameters appended to every subpage URL. Uses the same `:param` placeholder syntax. The **keys are literal query param names** — you choose them (see [Search Params](#search-params-urlsearch) below).
- **`excludeRoutes`** — Glob patterns for routes that should NOT be wrapped with the prefix (e.g., API resource routes, server actions).
- **`seoRoutes`** — Business Manager-mirrored product, category, and optional standalone-content prefixes keyed directly by Commerce site ID. Prefixes are static segments without slashes. Category mode is `id-suffix` or `slug-path`.

All properties are optional at the type level. The reference config ships `p`,
`c` (`id-suffix`), and `cms` prefixes for both reference sites. Replace those
site-keyed values with the Business Manager grammar for your sites.

> **Important: `url.prefix`, `url.excludeRoutes`, and `url.seoRoutes` require a rebuild.**
> These values are protected by `protectedPaths` and cannot be overridden with `PUBLIC__` environment variables. React Router compiles them during development startup, type generation, and production build. Update `config.server.ts`, then rebuild and redeploy.

`seoRoutes` registers the deduplicated union of every configured site's product, category, and content prefixes as static `{prefix}/*` routes. Configuration fails the build when a prefix is invalid, reserved, shared across resource types, or collides with another route branch. The outer site/locale shape remains in `url.prefix`.

The product, category, and standalone-content route modules must be leaf routes (no nested child routes) when their aliases are enabled. Each becomes a pathless parent owning its prefix aliases, so the build fails with a "must be a leaf route" error if a target already has children. Move nested routes elsewhere before enabling.

Use the semantic builders for product, category, and standalone-content destinations. They return the functional path only; the storefront's `Link` and navigation wrappers continue to add the outer site/locale prefix.

```tsx
const seoUrlContext = useSeoUrlContext()

createProductUrl(
    {productId: product.productId, slug: product.slug},
    seoUrlContext,
)

createCategoryUrlFromScapiCategory(category, seoUrlContext)

createContentUrl(
    {type: 'page', resourceId: page.id, slugSegments: ['campaigns']},
    seoUrlContext,
)
```

Product slugs are optional because the product ID remains authoritative. When a Shopper API product slug contains a Business Manager hierarchy and terminal `.html` suffix, the product builder preserves the hierarchy as path segments, removes the Commerce-generated extension, and includes the product ID only once. If the product ID itself ends in `.html`, the builder emits `.html.html`; the resolver removes the final extension and preserves the complete ID. Category slug segments are explicit so callers cannot mistake display names for Business Manager slugs. The builders encode each segment independently and make no SCAPI or Shopper SEO calls.

The template uses the complete hierarchy from `Category.slug` and `PathRecord.slug`. It never substitutes an ID or display name for a missing slug. In `slug-path` mode, an unresolved interactive category is disabled; a static legacy category destination degrades to the existing search route with `refine=cgid=<id>`.

When `seoRoutes` is enabled, existing Shopper Products requests that feed product links, plus product search and suggestions, include `expand=slug`. PDPs, tiles, recommendations, carts, wishlists, Page Designer, typeahead, and structured data therefore use the configured slug without another request. Storefronts without SEO routes keep the compatible request shape for older B2C Commerce versions. Category suggestions do not expose an authoritative category slug; in `slug-path` mode they link to search with their category ID instead of inventing a category path. For merchant-authored internal links stored as legacy `/category/...` strings, use `createCategoryUrlFromLegacyPath()`; external and non-category destinations pass through unchanged.

When `seoRoutes` is present, every active site must have an entry. URL generation fails fast for an omitted site because the compiled manifest no longer contains the legacy product and category routes.

Do not enable `seoRoutes` until every active site's PDP/PLP grammar is decided. `slug-path` requires Shopper Products 1.13 and Shopper Search 1.15.

Configuring `content.prefix` enables two deterministic standalone URL forms:

- `/{content-prefix}/content/{optional-slug-path}/{contentId}[.html]` uses Shopper Experience `getContent`.
- `/{content-prefix}/page/{optional-slug-path}/{pageId}[.html]` uses Shopper Experience `getPage`.

The explicit `content` or `page` segment selects the API without a URL Mapping call. Embedded Page Designer regions and content slots keep their host page URL. A trailing `.html` is accepted and permanently redirected to the suffix-free canonical path.

For a standalone Page Designer page with an above-the-fold region, expose a string `criticalRegionId` in the page type's data and set it to that top-level region ID. The route marks only that region as critical; all other regions keep their streaming behavior.

For the step-by-step rollout—prerequisites, the two category modes, preventing broken indexed URLs and redirect loops, and the QA verification checklist—see the [SEO URL Rules adoption guide](./migrations/seo-url-rules/README.md).

#### Mapping Business Manager URL Settings to `seoRoutes`

Business Manager is the source of truth for a site's SEO URL grammar; `seoRoutes` is the build-time mirror of it. Each Business Manager URL setting maps to one `seoRoutes` field:

| Business Manager (in **Merchant Tools > _Site_ > SEO & Discoverability**) | `config.server.ts` |
|---|---|
| Product URL segment / prefix | `seoRoutes.<siteId>.product.prefix` |
| Category URL segment / prefix | `seoRoutes.<siteId>.category.prefix` |
| Category URLs carry the category ID vs. a pure slug path | `seoRoutes.<siteId>.category.mode` (`id-suffix` \| `slug-path`) |
| Content/landing URL segment / prefix | `seoRoutes.<siteId>.content.prefix` (optional) |
| Site and locale in the path | `url.prefix` (e.g. `/:siteId/:localeId`) |
| Locale-to-alias display | `localeAliasMap` / `siteAliasMap` |

Prefixes are static segments without slashes. The mapping is manual and one-directional: a change in Business Manager reaches a deployed storefront only after you update `config.server.ts` and rebuild (`seoRoutes` is a `protectedPaths` value—see the rebuild note above). Product builders remove the terminal `.html` extension supplied by Business Manager while preserving a product ID that itself ends in `.html`. Redirects for paths outside the active Storefront Next grammar remain the responsibility of the CDN / Business Manager redirect layer—see [Adopting SEO URL Rules: Preventing broken indexed URLs](./migrations/seo-url-rules/README.md#preventing-broken-indexed-urls-and-redirect-loops).

#### Market Street Reference Configuration

Market Street is the reference storefront for the retail vertical. Its `seoRoutes` entry uses short prefixes and deterministic `id-suffix` category routing:

```typescript
url: {
    prefix: '/:siteId/:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
    seoRoutes: {
        MarketStreet: {
            product: {prefix: 'p'},
            category: {prefix: 'c', mode: 'id-suffix'},
            content: {prefix: 'cms'},
        },
    },
}
```

With this entry a Business Manager product path such as `men/knitwear/product-id.html` resolves at `/{siteId}/{localeId}/p/men/knitwear/product-id`, and a category resolves at `/{siteId}/{localeId}/c/{slug}/{id}`. Both loaders read the resource ID from the final path segment with no SEO-mapping request.

The shipped reference configuration includes Market Street alongside the RefArch demo sites. Keep an entry for every active site and remove inactive entries when tailoring a generated project. URL generation for an omitted site fails fast, and a build can surface that failure when it renders or validates links for that site.

#### Non-Blocking Follow-Ups

These are tracked separately from the routing layer and are **not** current behavior:

- **Automatic Business Manager sync**—today the Business-Manager-to-`seoRoutes` mapping is manual and requires a rebuild. Auto-sync is a follow-up.
- **URL-mapping request-volume hardening**—well-formed SEO URLs resolve deterministically from the path, and lookup-based resolution of unmatched or legacy URLs now ships as the terminal fallback (see [Shopper SEO URL Rules Fallback](#shopper-seo-url-rules-fallback)). Request-volume hardening of that lookup path is tracked separately.
- **Composite category endpoint**—the storefront currently starts category lookup and product search in parallel. A composite endpoint could consolidate those requests later, but is not required for slug-path routing.

### Shopper SEO URL Rules Fallback

Business Manager is the source of truth for URL Rules. Keep each site's Business Manager rules, `url.seoRoutes`, and `seoFallback.sites` policy aligned. `url.seoRoutes` registers the product, category, and optional content routes that receive mapped destinations; changing a prefix requires rebuilding and redeploying the storefront.

For an otherwise-unmatched `GET` or `HEAD` request, the terminal route can make one Shopper SEO URL Mapping call. It does not send the incoming query string, retry, or follow mapping chains. Valid product, category, and owned content mappings redirect through the configured URL builders. Content mappings require a recognized `STANDARD_CONTENT_ASSET` or `PAGE_DESIGNER_CONTENT_ASSET` subtype. Valid URL redirects and hybrid handoffs are also supported. Mapping misses and rejected results remain 404 responses; operational API errors propagate.

External redirect origins and forwarded query parameters are denied unless explicitly allowed for the active Commerce site in `seoFallback.sites`. Redirect origins must be exact HTTPS origins. `contentOwned` authorizes fallback mappings only; direct deterministic content routes do not call URL Mapping.

### URL Config Use Cases

Below are common URL patterns you can achieve by combining `prefix` and `search`. The available `:param` placeholders are **`:siteId`** and **`:localeId`**, which are resolved from the current site and locale refs (after alias mapping).

#### Use Case 1: Site and locale in the path (default)

```typescript
url: {
    prefix: '/:siteId/:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

| Page | URL |
|------|-----|
| Homepage (RefArchGlobal, en-GB) | `/global/en-GB/` |
| Product (RefArchGlobal, en-GB) | `/global/en-GB/p/123` |
| Product (RefArch, en-US) | `/us/en-US/p/123` |
| Category (RefArchGlobal, it-IT) | `/global/it-IT/c/womens` |

Best for: Most site context storefronts. Clean, fully deterministic URLs.

#### Use Case 2: Locale only in the path

```typescript
url: {
    prefix: '/:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

| Page | URL |
|------|-----|
| Homepage (en-GB) | `/en-GB/` |
| Product (en-GB) | `/en-GB/p/123` |
| Product (en-US) | `/en-US/p/123` |
| Category (it-IT) | `/it-IT/c/womens` |

Best for: Single-site storefronts with multiple locales, or when the site is determined entirely by cookie/domain.

#### Use Case 3: Site in the path, locale in search params

```typescript
url: {
    prefix: '/:siteId',
    search: '?lng=:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

| Page | URL |
|------|-----|
| Homepage (RefArchGlobal, en-GB) | `/global/?lng=en-GB` |
| Product (RefArchGlobal, en-GB) | `/global/p/123?lng=en-GB` |
| Product (RefArch, en-US) | `/us/p/123?lng=en-US` |
| Category (RefArchGlobal, it-IT) | `/global/c/womens?lng=it-IT` |

Best for: When you want shorter path segments but still need the locale in the URL for shareability.

#### Use Case 4: Everything in search params

```typescript
url: {
    search: '?site=:siteId&lng=:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

| Page | URL |
|------|-----|
| Homepage | `/?site=global&lng=en-GB` |
| Product | `/p/123?site=global&lng=en-GB` |
| Category | `/c/womens?site=us&lng=en-US` |

Best for: Storefronts that want clean paths and don't mind query params. Note that without a `prefix`, React Router doesn't need site/locale route params in its route definitions.

#### Use Case 5: Locale only in search params

```typescript
url: {
    search: '?lng=:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

| Page | URL |
|------|-----|
| Homepage | `/?lng=en-GB` |
| Product | `/p/123?lng=en-GB` |
| Category | `/c/womens?lng=it-IT` |

Best for: Single-site storefronts that want locale-aware URLs without path changes.

### Search Params (`url.search`)

The `search` config uses standard query string syntax with `:param` placeholders:

```typescript
search: '?lng=:localeId'
//       ^^^              → query param key (literal string — you choose this)
//           ^^^^^^^^^^   → placeholder replaced with the resolved locale ref
```

**The keys are literal query param names** that appear in the URL. However, the keys are **not arbitrary** — they must match what the detection middleware looks for:

- **Locale key must be `lng`** — this matches both the i18next cookie key and the default `localeDetectionConfig.lookupQuerystring`. Using a different key (e.g., `locale`, `language`) would cause i18next and locale detection to break.
- **Site key must be `site`** (by default) — this matches the default `siteDetectionConfig.lookupQuerystring`. If you want a different key like `store`, you must also update `siteDetectionConfig.lookupQuerystring` to match (see [Detection Config](#detection-config) below).

```typescript
// ✅ Correct — keys match detection defaults
search: '?lng=:localeId'                      // → ?lng=en-GB
search: '?lng=:localeId&site=:siteId'         // → ?lng=en-GB&site=global

// ✅ Custom site key — but you MUST also set siteDetectionConfig.lookupQuerystring to 'store'
search: '?lng=:localeId&store=:siteId'        // → ?lng=en-GB&store=global
```

**The values must use `:param` syntax** to reference either `:siteId` or `:localeId`. You can also use literal values:

```typescript
search: '?lng=:localeId&site=:siteId'     // Both dynamic
search: '?lng=:localeId&version=2'         // Mix of dynamic and static
```

Multiple params are separated with `&`, just like a normal query string.

**Custom query param keys**: If you use a different key for site (e.g., `store` instead of `site`) or locale (e.g., `language` instead of `lng`), you must also update `siteDetectionConfig.lookupQuerystring` or `localeDetectionConfig.lookupQuerystring` to match. Otherwise the middleware won't find the values in the URL. See [Detection Config](#detection-config) below for details.

**Interaction with existing query params**: `buildUrl` merges search config params with any query params already on the URL. Search config params are set via `searchParams.set()`, so they overwrite any existing param with the same key. Params with different keys are preserved:

```typescript
// url.search = '?lng=:localeId'
buildUrl({ to: '/search?q=shoes&sort=price', ... })
// → '/global/en-GB/search?q=shoes&sort=price&lng=en-GB'

buildUrl({ to: '/search?lng=old-value', ... })
// → '/global/en-GB/search?lng=en-GB'  (overwritten by config)
```

### Detection Config

The URL config (`prefix`, `search`) controls how URLs are **built**. The detection config controls how site and locale are **read back** from incoming requests. These two must stay in sync.

The SDK provides default detection config in [`createSiteContextMiddleware`](../../storefront-next-runtime/src/site-context/configs.ts):

```typescript
// Default site detection
siteDetectionConfig: {
    order: ['path', 'querystring', 'cookie', 'header'],
    lookupFromPathIndex: 0,      // 1st path segment (e.g., /global/en-GB/... → 'global')
    lookupQuerystring: 'site',   // ?site=global
    lookupCookie: 'site_id',
    lookupHeader: 'X-Site-Id',
    caches: ['cookie'],
}

// Default locale detection
localeDetectionConfig: {
    order: ['path', 'querystring', 'cookie', 'header'],
    lookupFromPathIndex: 1,      // 2nd path segment (e.g., /global/en-GB/... → 'en-GB')
    lookupQuerystring: 'lng',    // ?lng=en-GB
    lookupCookie: 'lng',
    lookupHeader: 'Accept-Language',
    caches: ['cookie'],
}
```

**When to override detection config:**

1. **You changed the prefix order** — If your prefix is `/:localeId/:siteId` (locale first, site second), you must flip the `lookupFromPathIndex` values:

    ```typescript
    // prefix: '/:localeId/:siteId'
    siteDetectionConfig: { lookupFromPathIndex: 1 },   // site is now 2nd
    localeDetectionConfig: { lookupFromPathIndex: 0 },  // locale is now 1st
    ```

2. **You removed site or locale from the prefix** — If your prefix is `/:localeId` (no site in path), remove `'path'` from the site detection order so it doesn't try to parse a path segment that isn't there:

    ```typescript
    // prefix: '/:localeId'
    siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    localeDetectionConfig: { lookupFromPathIndex: 0 },  // locale is now 1st
    ```

3. **You use a non-default querystring key for site** — If your search config uses `store=:siteId` instead of `site=:siteId`, update the detection to match:

    ```typescript
    // search: '?lng=:localeId&store=:siteId'
    siteDetectionConfig: { lookupQuerystring: 'store' },
    ```

4. **You moved site/locale entirely to search params** — Remove `'path'` from both detection orders:

    ```typescript
    // search: '?site=:siteId&lng=:localeId' (no prefix)
    siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    localeDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    ```

**Rule of thumb**: The detection config tells the middleware *where to look* for site/locale values. The URL config tells `buildUrl` *where to put* them. If you change one, check whether the other still matches.

To override detection config, pass `siteDetectionConfig` and/or `localeDetectionConfig` in the `SiteConfig` object passed to `createSiteContextMiddleware`. In this template, that's constructed in `src/middlewares/site-context.server.ts`.

### Site Alias Map

Maps B2C Commerce site IDs to shorter URL-friendly aliases:

```typescript
siteAliasMap: {
    RefArchGlobal: 'global',
    RefArch: 'us',
}
```

With this config, the site `RefArchGlobal` appears as `global` in URLs: `/global/en-GB/p/123`

### Locale Alias Map

Maps locale IDs to shorter URL-friendly aliases:

```typescript
localeAliasMap: {
    'en-US': 'us',
    'es-US': 'es',
}
```

With this config, the locale `en-US` appears as `us` in URLs: `/global/us/p/123`

Both alias maps are optional. Without them, the raw site ID and locale ID appear in URLs.

### Site and Locale Definitions

Sites and their supported locales are defined in `config.server.ts` under `commerce.sites`. By default, sites and their locales are retrieved from the MRT Data Store. See [MRT Data Store Sites](#mrt-data-store-sites). If the MRT Data Store sites option is turned off, sites and locales are retrieved from `config.server.ts`.

```typescript
commerce: {
    sites: [
        {
            id: 'RefArchGlobal',
            defaultLocale: 'en-GB',
            supportedLocales: [
                { id: 'en-GB', preferredCurrency: 'GBP' },
                { id: 'fr-FR', preferredCurrency: 'EUR' },
                { id: 'it-IT', preferredCurrency: 'EUR' },
                { id: 'en-US', preferredCurrency: 'USD' },
            ],
        },
    ],
}
```

### MRT Data Store Sites

On by default. When `commerce.sitesFromDal` is on, live site data synced through the [MRT Data Store](https://developer.salesforce.com/docs/commerce/sfnext/guide/sfnext-mrt-data-store.html) replaces the static `commerce.sites` for site, locale, and currency resolution, resolved per request. `defaultSiteId`, `siteAliasMap`, and `localeAliasMap` stay static and derived from config, never from the MRT Data Store. Set the flag to `false` to keep the static `commerce.sites` authoritative.

**Fallback behavior.** When the middleware can't get site data from the MRT Data Store, the storefront keeps serving the static `commerce.sites` and doesn't fail the request. This fallback applies whenever `commerce.sitesFromDal` is off, the MRT Data Store entry is unavailable, the payload yields no usable sites, or the usable sites omit the site named by `defaultSiteId`. That last case logs a warning naming the missing default and the site IDs actually present, so the issue is visible in monitoring.

**URL aliasing stays config-owned.** The MRT Data Store supplies which sites exist and their locale and currency data, but not how their URLs are aliased. `siteContextMiddleware` runs after the data store rewrite and derives each resolved site's routing `alias` from the config `siteAliasMap`, keyed by site `id` (the same key for the data store and static sites), so `siteAliasMap` and `localeAliasMap` stay the config-owned source for the `:siteId` and `:localeId` URL refs. A per-site `alias` on the data store payload would be overwritten before routing reads it, so the rewrite drops it at the source. This is what keeps multi-site URLs stable when sites go live from the data store.

```bash
# Opt out via env (see README-CONFIG.md) to keep static commerce.sites authoritative
# PUBLIC__app__commerce__sitesFromDal=false
```

## Client-Side Navigation

### `useCurrentSiteAndLocaleRef` Hook

Returns the resolved site and locale references (alias if configured, raw ID otherwise) for URL building:

```typescript
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';

function MyComponent() {
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    // siteRef = 'global' (alias for RefArchGlobal)
    // localeRef = 'en-GB' (no alias configured, uses raw ID)
}
```

### Link and NavLink

Drop-in replacements for React Router's `Link` and `NavLink`. They automatically apply the site context URL prefix to all paths:

```typescript
import { Link, NavLink } from '@/components/link';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { createProductUrl } from '@/route-paths';

const productUrl = createProductUrl({productId: '123'}, useSeoUrlContext());

// Both produce /global/en-GB/p/123 with the shipped reference configuration.
<Link to={productUrl}>Product</Link>
<NavLink to={productUrl}>Product</NavLink>

// Produces /global/en-GB/ (prefixed with current site context)
<Link to="/">Home</Link>
```

Special cases:
- External URLs (`http://`, `//`) are passed through unchanged
- Object `to` values with rooted pathnames are site-prefixed
- Search-only strings and pathname-less objects with `search` resolve against the current route
  before configured URL context is applied
- Empty, hash-only, and relative object targets retain React Router's native resolution

### useNavigate

Site-context-aware replacement for React Router's `useNavigate`:

```typescript
import { useNavigate } from '@/hooks/use-navigate';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { createProductUrl } from '@/route-paths';

function MyComponent() {
    const navigate = useNavigate();
    const seoUrlContext = useSeoUrlContext();

    // Semantic product path — prefixed automatically
    navigate(createProductUrl({productId: '123'}, seoUrlContext));

    // '/' — prefixed to /global/en-GB/
    navigate('/');

    // Object with pathname — pathname is prefixed
    navigate({ pathname: '/search', search: '?q=shoes' });

    // History navigation — passed through
    navigate(-1);
}
```

### React Router Form Actions

React Router's `<Form>` component does NOT go through `buildUrl`. If you use `<Form action="/some-path">`, you must prefix the action yourself:

```typescript
import { Form } from 'react-router';
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';

function LogoutButton() {
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();

    const action = buildUrl({
        to: '/logout',
        urlConfig: config.url,
        params: { siteId: siteRef, localeId: localeRef },
    });

    return (
        <Form method="post" action={action}>
            <button type="submit">Log Out</button>
        </Form>
    );
}
```

## Server-Side Redirects

All `redirect()` calls in loaders and actions must include the site context prefix. A bare `redirect('/login')` will produce a URL without the prefix, resulting in a 404.

Use `buildUrlFromContext` — a server-side helper that reads the resolved site and locale from router context and applies the URL prefix:

```typescript
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { buildUrlFromContext } from '@/lib/url.server';

export function loader({ context }: LoaderFunctionArgs) {
    throw redirect(buildUrlFromContext('/login', context));
    // → '/global/en-GB/login'
}
```

This is the `.server.ts` counterpart of the client-side `useCurrentSiteAndLocaleRef` + `buildUrl` pattern.

## Site Switcher

The site switcher (`src/components/site-switcher`) in the footer allows switching between sites at any time:

1. User selects a new site from the dropdown
2. Client-side `i18n.changeLanguage()` fires for immediate UX update
3. Posts `type: 'site'` and `siteId` to `/action/set-site-context`
4. The server action sets `site_id` and `lng` cookies, redirects to the new site's prefixed homepage (e.g., `/us/en-US/`)

## Locale Switcher

The locale switcher (`src/components/locale-switcher`) changes the locale on the current page:

1. Strips the current site/locale prefix from the URL using `stripPathPrefix`
2. Rebuilds the URL with the new locale
3. Calls `i18n.changeLanguage()` for immediate client-side update
4. Submits `type: 'locale'`, `locale`, and `pathname` to `/action/set-site-context`
5. The server action sets the `lng` cookie and redirects to the new URL
6. The page reloads with the new locale, triggering full revalidation of all loaders

## Currency Switcher

The currency switcher (`src/components/currency-switcher`) changes the active currency:

1. User selects a new currency from the dropdown
2. Client-side validation checks against `site.supportedCurrencies`
3. Submits `type: 'currency'` and `currency` to `/action/set-site-context`
4. The server action validates, sets the currency cookie, and returns `{ success: true }`
5. React Router automatically revalidates loaders, updating prices across the page

Currency resolution priority (handled by SDK middleware):
1. **Cookie** — explicit user selection
2. **Locale's `preferredCurrency`** — from site config
3. **Site's `defaultCurrency`** — fallback

## Accessing Site Context in React

Use `useSite()` to access the current site, language, and currency in components:

```typescript
import { useSite } from '@salesforce/storefront-next-runtime/site-context';

function MyComponent() {
    const { site, language, currency } = useSite();
    // site: Site object (id, supportedLocales, supportedCurrencies, etc.)
    // language: current locale ID (e.g., 'en-GB')
    // currency: current currency code (e.g., 'GBP')
}
```

`useSite()` throws if called outside a `SiteProvider`. In the template, `SiteProvider` is mounted in `root.tsx` and wraps the entire app.

## Engagement Data & Site Context

Engagement adapters (Einstein, Active Data, Data 360) are initialized once at application startup with static configuration from `config.server.ts`. However, the current site and locale are injected dynamically at **event-send time** via `EventSiteInfo`, which is resolved from the site context middleware context.

### How Site Context Flows to Adapters

1. The `useAnalytics` hook calls `useSite()` to get the current site context (`{ site, language, currency }`)
2. It constructs an `EventSiteInfo` object: `{ siteId: site.id, localeId: language }`
3. Every tracking call (e.g., `trackViewProduct`, `trackAddToCart`) passes `siteInfo` to the event mediator
4. The mediator forwards `siteInfo` to each registered adapter's `sendEvent` method

```typescript
// In use-analytics.ts
const { site, language } = useSite();
const siteInfo = { siteId: site.id, localeId: language };

// Passed to every tracking call
mediator.track(event, siteInfo);
```

### Adapter Behavior Per Site

| Adapter | Site-context aware? | How it uses site context |
|---------|-------------------|--------------------------|
| **Active Data** | Yes | Uses `siteInfo.siteId` and `siteInfo.localeId` at event time to build the endpoint URL (`Sites-{siteId}-Site/{locale}`) |
| **Einstein** | No (static) | Uses the `siteId` from config at initialization — ignores the `siteInfo` parameter at event time |
| **Data 360** | Yes | Prefers `siteInfo.siteId` at event time (`siteId`/`internalOrganizationId`), falling back to the `siteId` from config |

Active Data automatically routes events to the correct B2C Commerce site based on the shopper's current site context. Einstein currently sends all events to the single site configured in `config.server.ts` regardless of which site the shopper is browsing.

### Configuration

Engagement adapter config is defined once in `config.server.ts` under `app.engagement.adapters`. These settings are **protected paths** — they cannot be overridden via `PUBLIC__` environment variables at runtime (see [URL Config](#url-config) for a similar restriction). To change engagement adapter settings, update `config.server.ts` and rebuild.

## Best Practices

1. **Always use `Link`/`NavLink` from `@/components/link`** — never use React Router's Link directly. The template versions handle URL prefixing automatically
2. **Always use `useNavigate` from `@/hooks/use-navigate`** — same reason as above
3. **Always prefix server-side redirects** — every `redirect()` call in loaders and actions must use `buildUrlFromContext` from `@/lib/url.server`
4. **Prefix `<Form action>` values manually** — React Router's `<Form>` does not go through `buildUrl`
5. **Use alias maps for clean URLs** — configure `siteAliasMap` and `localeAliasMap` to keep URLs short and readable
6. **Don't hardcode site/locale values** — always resolve them from context or the `useCurrentSiteAndLocaleRef` hook
7. **`/` is prefixed like any other path** — `Link`, `NavLink`, and `useNavigate` prefix `/` with the current site/locale (e.g., `/global/en-GB/`). Bare `/` is redirected server-side to the default site/locale by the homepage loader
8. **Test with multiple sites and locales** — switch between sites and locales, verify all links, redirects, and form actions produce correct URLs
