# Multi-Site & Locale URL Routing

This project supports multiple B2C Commerce sites and locales within a single storefront deployment. All URLs — including the homepage — use `/:siteId/:localeId/...` prefixes and are fully shareable. Requests to bare `/` are redirected server-side to the default site and locale prefix (e.g., `/global/en-GB/`).

## Quick Start

**In React components** — use `Link`, `NavLink`, or `useNavigate` from the template. They automatically prefix all URLs (including `/`) with the current site and locale:

```typescript
import { Link } from '@/components/link';

// Renders as /global/en-GB/product/123
<Link to="/product/123">View Product</Link>

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

1. User requests `/global/en-GB/product/123`
2. Site context middleware resolves site and locale from the URL path (`global` → `RefArchGlobal`, `en-GB` → locale)
3. Site and locale objects are stored in router context for downstream consumers
4. i18next middleware reads the resolved locale and initializes translations
5. Loaders, actions, and components access the resolved site/locale from context

## Configuration

### URL Config

The `url` config in `config.server.ts` controls how site context URLs are constructed. It has three properties:

```typescript
url: {
    prefix: '/:siteId/:localeId',
    search: '?lng=:localeId',
    excludeRoutes: ['/resource/**', '/action/**'],
}
```

- **`prefix`** — Path segments prepended to every subpage URL. Uses `:param` placeholders that are replaced with values from `params` at build time.
- **`search`** — Query parameters appended to every subpage URL. Uses the same `:param` placeholder syntax. The **keys are literal query param names** — you choose them (see [Search Params](#search-params-urlsearch) below).
- **`excludeRoutes`** — Glob patterns for routes that should NOT be wrapped with the prefix (e.g., API resource routes, server actions).

Both `prefix` and `search` are optional. You can use either, both, or neither depending on your URL strategy.

> **Important: `url.prefix` and `url.excludeRoutes` require a rebuild.**
> These values are protected by `protectedPaths` in the config and **cannot be overridden via `PUBLIC__` environment variables** at runtime. Attempting to set `PUBLIC__app__url__prefix` or `PUBLIC__app__url__excludeRoutes` will throw an error. This is because `prefix` determines the React Router route structure, which is baked into the build — changing it at runtime would cause a mismatch between the routes the server expects and the routes the client has bundled. To change the URL prefix pattern, update `config.server.ts` and rebuild the application.

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
| Product (RefArchGlobal, en-GB) | `/global/en-GB/product/123` |
| Product (RefArch, en-US) | `/us/en-US/product/123` |
| Category (RefArchGlobal, it-IT) | `/global/it-IT/category/womens` |

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
| Product (en-GB) | `/en-GB/product/123` |
| Product (en-US) | `/en-US/product/123` |
| Category (it-IT) | `/it-IT/category/womens` |

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
| Product (RefArchGlobal, en-GB) | `/global/product/123?lng=en-GB` |
| Product (RefArch, en-US) | `/us/product/123?lng=en-US` |
| Category (RefArchGlobal, it-IT) | `/global/category/womens?lng=it-IT` |

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
| Product | `/product/123?site=global&lng=en-GB` |
| Category | `/category/womens?site=us&lng=en-US` |

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
| Product | `/product/123?lng=en-GB` |
| Category | `/category/womens?lng=it-IT` |

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

With this config, the site `RefArchGlobal` appears as `global` in URLs: `/global/en-GB/product/123`

### Locale Alias Map

Maps locale IDs to shorter URL-friendly aliases:

```typescript
localeAliasMap: {
    'en-US': 'us',
    'es-US': 'es',
}
```

With this config, the locale `en-US` appears as `us` in URLs: `/global/us/product/123`

Both alias maps are optional. Without them, the raw site ID and locale ID appear in URLs.

### Site and Locale Definitions

Sites and their supported locales are defined under `commerce.sites`:

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

### DAL-Sourced Sites (`commerce.sitesFromDal`)

On by default. When `commerce.sitesFromDal` is on, live site data synced through the Data Access Layer (DAL) replaces the static `commerce.sites` for site, locale, and currency resolution, resolved per request. `defaultSiteId`, `siteAliasMap`, and `localeAliasMap` stay static and derived from config, never from the DAL. Set the flag to `false` to keep the static `commerce.sites` authoritative regardless of the DAL.

**Fallback rules.** The middleware keeps the static `commerce.sites`, and does not fail the request, whenever any of these hold: the flag is off, the DAL entry is unavailable, the DAL payload yields no usable sites, or the usable sites omit the site named by `defaultSiteId`. The last case logs a warning naming the missing default and the DAL site IDs actually present, so the drift is visible in monitoring while the storefront keeps serving. This is deliberate: the app-config middleware validates `defaultSiteId` against the static sites before the DAL rewrite runs, so falling back is provably safe, whereas failing the request would take every site down over one missing default.

**URL aliasing stays config-owned.** When the flag is on, the DAL supplies which sites exist and their locale and currency data, but not how their URLs are aliased. `siteContextMiddleware`, which runs after the DAL rewrite, derives each resolved site's routing `alias` from the config `siteAliasMap`, keyed by site `id`, which is the same for DAL-sourced and static sites. So `siteAliasMap` and `localeAliasMap` remain the config-owned source for the `:siteId` and `:localeId` URL refs; a per-site `alias` value on the DAL payload does not change routing. Because a DAL `alias` or `name` would be overwritten before routing reads it, the DAL rewrite drops both at the source rather than carrying dead fields. Site detection matches a URL segment against a site's resolved `alias` before its `id` (see [Detection Config](#detection-config)), and that resolved `alias` comes from `siteAliasMap`, so keeping the maps in config is what keeps multi-site URLs stable when sites go live from the DAL.

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

// Both produce /global/en-GB/product/123
<Link to="/product/123">Product</Link>
<NavLink to="/product/123">Product</NavLink>

// Produces /global/en-GB/ (prefixed with current site context)
<Link to="/">Home</Link>
```

Special cases:
- External URLs (`http://`, `//`) are passed through unchanged
- Non-string `to` values (objects) are passed through unchanged

### useNavigate

Site-context-aware replacement for React Router's `useNavigate`:

```typescript
import { useNavigate } from '@/hooks/use-navigate';

function MyComponent() {
    const navigate = useNavigate();

    // String path — prefixed automatically
    navigate('/product/123');

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
