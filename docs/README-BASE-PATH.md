# Base Path

A base path is an optional URL prefix that allows multiple storefronts to share a single domain. When configured, all page routes and static assets are served under this prefix (e.g., `https://example.com/storefront-a/` instead of `https://example.com/`).

This is useful when multiple MRT environments are served behind a shared domain, with a CDN or reverse proxy routing traffic to the correct environment based on the first path segment.

> For the inverse scenario — **many domains served by one environment** — see [Multiple Domains, One Environment](./README-MULTI-DOMAIN.md).

## Configuration

The base path is configured in `config.server.ts` under `runtime.ssrParameters.envBasePath`:

```typescript
// config.server.ts
export default {
    runtime: {
        ssrParameters: {
            ssrFunctionNodeVersion: '24.x',
            envBasePath: '/storefront-a',
        },
    },
    app: { /* ... */ },
};
```

### Validation Rules

- Must be a single path segment starting with `/` (e.g., `/shop`, `/site-a`)
- Max 63 characters after the leading slash
- Only URL-safe characters: `a-z A-Z 0-9 _ . + $ ~ " ' @ : -`
- No nested segments (e.g., `/a/b` is invalid)
- Empty or unset means no base path (default behavior)

#### Why only a single path segment?

The base path is used by the CDN to route traffic to the correct MRT environment. The CDN makes its routing decision based solely on the first path segment — it has no knowledge of an upstream application's routes or how they are structured.

If nested base paths were allowed (e.g., both `/foo` and `/foo/bar`), the CDN would not be able to determine which environment should handle a request like `/foo/bar/product/123` — it could belong to the `/foo` environment (at route `/bar/product/123`) or the `/foo/bar` environment (at route `/product/123`). Unlike an application server, the CDN cannot fall back to a second option if the first doesn't match.

Restricting base paths to a single segment ensures that each environment owns a distinct, non-overlapping prefix, so routing is always unambiguous.

## How It Works

### Environment Variable: `MRT_ENV_BASE_PATH`

The base path flows through the system via the `MRT_ENV_BASE_PATH` environment variable:

| Environment | How `MRT_ENV_BASE_PATH` is set |
|---|---|
| **Development** (`pnpm dev`) | Read from `config.server.ts` at startup |
| **Preview** (`pnpm start`) | Read from `config.server.ts` at startup |
| **Production** (MRT) | Set by MRT Lambda from `ssrParameters.envBasePath` (sent during `pnpm push`) |

The SDK reads this env var via `getBasePath()` — you never need to set the env var directly.

### What Changes When a Base Path is Set

#### Page Routes

All page routes are prefixed with the base path:

| Without base path | With base path `/shop` |
|---|---|
| `/` | `/shop/` |
| `/category/womens` | `/shop/category/womens` |
| `/product/25720052M` | `/shop/product/25720052M` |

This is handled by React Router's `basename` property, which the SDK sets automatically on the server build.

#### Static Assets (JS, CSS, images)

Bundle asset URLs include the base path:

| Without base path | With base path `/shop` |
|---|---|
| `/mobify/bundle/140/client/assets/root.js` | `/shop/mobify/bundle/140/client/assets/root.js` |
| `/mobify/bundle/140/client/images/logo.svg` | `/shop/mobify/bundle/140/client/images/logo.svg` |

This is handled by:
- **Server-side rendering**: Vite's `renderBuiltUrl` uses `process.env.MRT_ENV_BASE_PATH` at runtime
- **Client-side**: The `<Scripts>` component injects `window._BUNDLE_PATH` which includes the base path
- **Preview mode**: `patchReactRouterBuild()` rewrites asset paths and sets `basename` on the build

#### SCAPI Proxy

The SCAPI proxy is only used in development and preview mode (disabled in production). It is mounted at its configured path without the base path prefix (e.g., `/mobify/proxy/api`):

| Environment | Proxy path |
|---|---|
| Dev / Preview | `/mobify/proxy/api` (no base path) |
| Production (MRT) | Proxy disabled — SCAPI calls go directly to the API |

The server-side SCAPI client always calls the proxy at `config.commerce.api.proxy` directly, so the base path is not involved.

#### Resource Routes

Resource routes accessed via `useFetcher` automatically include the base path (React Router handles this via `basename`). However, raw `fetch()` or `navigator.sendBeacon()` calls from client-side code must manually prepend the base path:

```typescript
import { getBasePath } from '@/lib/utils';

// Raw fetch needs manual base path
const url = `${getBasePath()}/resource/api/client/${resource}`;
const response = await fetch(url);

// sendBeacon also needs manual base path
const proxyUrl = `${getBasePath()}/resource/analytics-proxy?url=${encodeURIComponent(url)}`;
navigator.sendBeacon(proxyUrl);
```

#### Multi-Site Detection

When site context is configured with path-based site/locale detection, the SDK automatically adjusts the `lookupFromPathIndex` to skip the base path segment. No configuration change is needed.

For example, with base path `/shop` and a URL like `/shop/site-us/en-US/category/womens`:
- Without base path: segment index 0 = `site-us`
- With base path: the SDK adds an offset of +1, so index 0 still resolves to `site-us`

This applies to both `resolveSite()` and `resolveLocale()` path detection. Other detection methods (cookie, header, querystring) are unaffected.

### `getBasePath()` Helper

Two versions of this helper exist:

| Location | Used by | How it reads the base path |
|---|---|---|
| `storefront-next-dev` (`utils/paths.ts`) | SDK server code, Vite plugins, CLI | `process.env.MRT_ENV_BASE_PATH` |
| Template app (`src/lib/utils.ts`) | Template components, hooks | Server: `process.env.MRT_ENV_BASE_PATH`; Client: extracts from `window._BUNDLE_PATH` |

Both return the sanitized base path (e.g., `/shop`) or an empty string if no base path is configured.

## Behavior Differences by Environment

### Development (`pnpm dev`)

- Base path is read from `config.server.ts` and set as `MRT_ENV_BASE_PATH`
- A redirect middleware sends non-prefixed requests to the prefixed path (e.g., `/category/womens` → 302 → `/shop/category/womens`)
- `/mobify/` infrastructure paths are not redirected
- Vite HMR and dev tooling work normally

### Preview (`pnpm start`)

- Same as development: base path is read from `config.server.ts`
- Redirect middleware is active for convenience
- Static assets are served from the build output with base path prefixed URLs
- `patchReactRouterBuild()` rewrites the build manifest to use bundle paths and sets `basename`

### Production (MRT)

- `MRT_ENV_BASE_PATH` is set by MRT from `ssrParameters.envBasePath` (configured during `pnpm push`)
- MRT does **not** strip the base path — the Lambda receives the full URL (e.g., `/shop/category/womens`)
- React Router's `basename` handles routing correctly: it strips the base path when matching routes
- Redirect middleware is active: requests without the base path prefix (e.g., direct access to the MRT environment domain) are redirected to the prefixed URL
- `renderBuiltUrl` generates asset URLs with the base path at runtime
- React Router `basename` is set via `patchReactRouterBuild()` in the MRT SSR entry
- When a CDN is placed in front of MRT, it routes traffic to the correct environment based on the base path segment

## Architecture: CDN + Multiple MRT Environments

In a typical production setup, a CDN sits in front of multiple MRT environments, each serving a different storefront under the same domain. The CDN routes requests to the correct environment based on the base path segment.

```
                         www.example.com
                              |
                          [ CDN ]
                         /        \
           /basepath-1/*            /basepath-2/*
                |                        |
    basepath-1.mobify-storefront.com    basepath-2.mobify-storefront.com
         (MRT Environment 1)              (MRT Environment 2)
         envBasePath: /basepath-1         envBasePath: /basepath-2
```

### Request Flow Example

A user visits `https://www.example.com/basepath-1/category/womens`:

```
1. Browser
   GET https://www.example.com/basepath-1/category/womens
        |
2. CDN (www.example.com)
   - Matches /basepath-1/* rule
   - Forwards to basepath-1.mobify-storefront.com
   - Preserves full path: /basepath-1/category/womens
        |
3. MRT Lambda (basepath-1.mobify-storefront.com)
   - Receives: /basepath-1/category/womens
   - MRT_ENV_BASE_PATH=/basepath-1
   - Does NOT strip the base path
        |
4. Express Server
   - app.all('*') catches the request
   - Passes to React Router request handler
        |
5. React Router (basename: '/basepath-1')
   - Strips basename from URL for route matching
   - Matches route: /category/womens → _app.category.$categoryId.tsx
   - request.url still contains full path: /basepath-1/category/womens
   - useLocation() returns pathname: /category/womens (base path is stripped)
   - Links render with base path: /basepath-1/product/123
        |
6. SSR Response
   - HTML includes asset URLs with base path:
     /basepath-1/mobify/bundle/140/client/assets/root.js
   - Page links include base path:
     <a href="/basepath-1/product/123">...</a>
```

### Static Asset Flow

Static assets (JS, CSS, images) are typically served by the CDN directly, without hitting the Lambda:

```
Browser requests: /basepath-1/mobify/bundle/140/client/assets/root.js
        |
CDN matches /basepath-1/* → forwards to MRT
        |
MRT serves static file from bundle storage
```

The CDN can cache these assets since bundle URLs are content-hashed.

## React Router and `basename`

React Router's `basename` property affects different parts of the framework differently:

| Context | Base path stripped? | Example |
|---|---|---|
| `useLocation()`, `useParams()` (SSR + client) | Yes | `/shop/product/123` → `pathname: /product/123` |
| `useHref()`, `<Link>`, `<NavLink>` | Auto-prepended | `useHref('/product/123')` → `/shop/product/123` |
| `useFetcher` | Auto-prepended | Fetcher URLs include base path automatically |
| `redirect()` in middleware | **Not** prepended | Must manually prepend: `redirect(\`${basePath}/login\`)` |
| `request.url` in middleware/loaders | **Not** stripped | Full URL including base path |

The key takeaway: `request.url` in middleware and loaders always contains the full path including the base path. The SDK handles this for site context detection, but custom middleware that parses `request.url` paths may need to account for it.

## Known Limitation: Express Routes Without Base Path

Express routes mounted at fixed paths (e.g., health check at `/sfdc-health`) are accessible without the base path prefix but not with it. A request to `/shop/sfdc-health` falls through to React Router instead of matching the Express route. This is because Express route mounts don't participate in React Router's `basename` stripping — they match against the raw request path.