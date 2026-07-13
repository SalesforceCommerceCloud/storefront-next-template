# Template Retail App

Storefront template for Salesforce Commerce Cloud built with React Router v7, React, Tailwind CSS, and Vite. Integrates with Commerce Cloud via SCAPI.

This file is the single source of truth for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this package. `CLAUDE.md` is a symlink to this file.

> **Changesets**: any change in this package needs a changeset. Run `pnpm changeset` from the repo root, pick `@salesforce/template` (and `@salesforce/storefront-next-{dev,runtime}` if applicable), and commit the generated `.changeset/<id>.md`. See [`../../CONTRIBUTING.md#changesets`](../../CONTRIBUTING.md#changesets).

## Project Structure

- `./src/` — Application source code
  - `./src/routes/` — React Router file-based routes
  - `./src/components/` — React components (`./src/components/ui/` for Radix + Tailwind primitives)
  - `./src/hooks/`, `./src/providers/` — React hooks and context providers
  - `./src/analytics/` — Analytics tracking components (e.g. `PageViewTracker`)
  - `./src/middlewares/` — React Router server middlewares
  - `./src/extensions/` — Optional feature extensions
  - `./src/locales/` — i18n translation files
  - `./src/lib/` — Shared utilities, business logic, and framework plumbing. Domain-first organization:
    - Commerce domains (each a self-contained folder): `address/`, `auth/`, `cart/`, `checkout/`, `customer/`, `images/`, `marketing/`, `order/`, `payment/`, `product/`, `shopper-context/`, `turnstile/`
    - Framework: `adapters/` (engagement, product-content, customer-preferences — each with its own store, types, mock/impl), `decorators/` (Page Designer), `page-designer/` (registry + loader), `api/` (SCAPI wrappers)
    - Root-level files are cross-cutting only: `logger.server.ts`, `correlation.ts`, `currency.ts`, `date-utils.ts`, `url.ts`, `cookie-utils.server.ts`, etc.
    - **Rule**: a new commerce concept gets its own folder. Cross-domain utilities (no commerce knowledge) go at the `lib/` root.
  - `./src/types/config.ts` — Template-specific config types
- `./config.server.ts` — Configuration defaults
- `./.storybook/` — Storybook configuration
- `./public/` — Static assets
- `./docs/` — Detailed docs (see **Key Documentation** below)

## Common Commands

```bash
# Dev
pnpm dev                         # Dev server at http://localhost:5173
pnpm dev:debug                   # Dev server with Node debugger
pnpm storybook                   # Storybook at http://localhost:6006

# Build / deploy
pnpm build                       # Production build
pnpm preview                     # Preview production build
pnpm push                        # Deploy to Commerce Cloud Managed Runtime
pnpm cartridge:generate          # Extract Page Designer metadata

# Quality
pnpm typecheck
pnpm lint                        # Strict: --max-warnings 0 (CI enforces)
pnpm lint:fix
pnpm bundlesize                  # Verify bundle size limits
pnpm lighthouse:ci

# Tests
pnpm test                        # Unit tests
pnpm test:watch                  # Unit tests in watch mode
pnpm test src/components/foo     # Single file/dir

pnpm storybook:test --type=snapshot     # Snapshot tests
pnpm storybook:test --type=interaction  # Interaction tests
pnpm storybook:test --type=a11y         # A11y tests
```

### Less common command variants

Most of these are direct CLI passthroughs. Pass extra flags after the script
name and pnpm forwards them to the underlying command.

**Tests with extra flags** (forwarded to vitest):
```bash
pnpm test --coverage         # Coverage report
pnpm test --ui               # Vitest UI
pnpm test --reporter=verbose # Verbose output
```

**Lint variants** (extra eslint scans not covered by `pnpm lint`):
```bash
node scripts/check-typescript-only.js                                                  # No .js files in src/
cross-env NODE_OPTIONS=--max-old-space-size=8192 eslint src --rule 'no-restricted-classnames: error' --cache  # Color rule scan
```

**Storybook test variants:**
```bash
pnpm storybook:test --type=snapshot --update      # Refresh snapshot fixtures
pnpm storybook:test --type=snapshot --coverage    # Snapshot tests + coverage (auto-generates story tests)
pnpm storybook:test --type=interaction --static   # Build & serve static bundle, then test (CI mode)
pnpm storybook:test --type=a11y --static          # Same, for a11y
```

**Bundle size with treemap:**
```bash
cross-env BUNDLES_SIZE_ANALYZE=true pnpm build    # Interactive treemap (build/client-bundle-size.html)
```

**Cartridge deploy with clean wipe:**
```bash
pnpm cartridge:deploy -- --delete                 # Delete old cartridge files first
```

**E2E variants** (run inside `e2e/` subpackage):
```bash
pnpm --filter ./e2e e2e:headless          # HEADLESS=true
pnpm --filter ./e2e e2e:verbose
pnpm --filter ./e2e e2e:debug             # DEBUG_E2E=true + --verbose
pnpm --filter ./e2e report                # Open Allure report
pnpm --filter ./e2e a11y:headless
pnpm --filter ./e2e a11y:report           # Generate consolidated a11y report
pnpm --filter ./e2e a11y:update-baseline  # Rewrite a11y baseline
```

You can also forward `--grep` directly: `pnpm e2e --grep "@checkout"`.

## Performance & Data Rules

These rules take priority when designing routes, components, and state. Apply them as a checklist for every route module and every component that consumes async data. See [Data Fetching](./docs/README-DATA.md), [Loading States](./docs/README-SUSPENSE.md), [State Management](./docs/README-STATE.md), and [Performance](./docs/README-PERFORMANCE.md) for full context.

### Data Loading

1. **Server-load everything.** All initial data must come from server `loader` functions — never `useEffect`, `fetch`, or other client-side fetching for data needed on first render.
2. **Classify every data field per route.** Critical data (SEO, LCP, CLS, HTTP status) is `await`ed in the loader. Non-critical data is returned as an unresolved Promise. Interaction-driven data is fetched via `useFetcher` on user action.
3. **Never block the loader on non-critical data.** Return the Promise directly — don't `await` recommendations, reviews, or below-the-fold content.
4. **Export `shouldRevalidate` on routes with URL-driven filtering.** Prevent redundant loader re-execution when only search params change and the loader already handles them on the next navigation.
5. **No `clientLoader` or `clientAction`.** Only server `loader` and server `action` exports are permitted in route modules.

### Rendering & Visual Stability

6. **One `<Suspense>` boundary per async operation, with stable promise references.** Never place multiple `use()` calls or `<Await>` components inside a single `<Suspense>` boundary — each deferred Promise gets its own boundary and its own skeleton. Never compose loader promises in the component (`Promise.all`, `.then()`, wrappers) — Suspense tracks promises by identity, and an in-render composition produces a new reference each render and re-suspends forever. Compose in the loader instead. See [Suspense Boundary Granularity](./docs/README-SUSPENSE.md#suspense-boundary-granularity) and [Promise Identity](./docs/README-SUSPENSE.md#promise-identity) for examples and anti-patterns.
7. **Skeleton screens for known layouts, spinners for indeterminate operations.** If the shape of the resolved content is known, use a skeleton. Spinners are only for global or unknown-layout loading states.
8. **Above the fold: avoid `fallback={null}` without reserving space.** Rendering nothing and then injecting content causes CLS. If no visual fallback is desired, the container must maintain explicit dimensions (`minHeight`, aspect ratio).
9. **Below the fold: prefer `fallback={null}` or a simple placeholder.** Users don't perceive layout shift for content they can't see, and complex skeletons add hydration cost without visible benefit.

### Mutations & Interactions

10. **Navigating mutations: `action` + `<Form>`.** Non-navigating mutations: `useFetcher`. Never mix these — the choice determines whether React Router triggers a route transition.
11. **Prefer optimistic UI when failure is unlikely and reversible.** Use `fetcher.formData` for simple optimistic reads, `useOptimistic` for complex state transformations (e.g., list insertions).

### State Management

12. **URL-worthy state goes in `useSearchParams`, not `useState`.** Filters, pagination, sort order, and modal visibility belong in the URL — they must survive refresh and be shareable.
13. **Never store derived state in `useState`.** Compute inline or use `useMemo` for expensive derivations. A second source of truth is a bug waiting to happen.
14. **Split React Contexts by concern.** One context per domain (theme, locale, user) — never a single large `AppContext`. Every value change re-renders all consumers of that context.
15. **Persistent cross-request state via cookies/sessions, not `localStorage`.** Cookies are SSR-compatible, avoid hydration mismatches, and work before scripts load.

### Images

16. **Use `<DynamicImage>` with `widths` or `heights` for all product and content images.** Without either, the component renders a plain `<img>` with no responsive sources and no DIS resizing. Set `priority="high"` on LCP-candidate images (hero, first product image) to trigger React 19 SSR preloading. See [Images](./docs/README-IMAGES.md).
17. **Use `DynamicImageProvider` for image grids.** Wrap product grids in a provider to control priority and responsive widths centrally rather than prop-drilling through every tile.

### Best Practices

18. **Lazy-load overlays and heavy below-the-fold content.** Use `React.lazy()` with deferred mounting — only mount the `<Suspense>` subtree after the first user interaction. See [Lazy Loading for Overlays](./docs/README-PERFORMANCE.md#lazy-loading-for-overlays-modals-drawers-dialogs).
19. **Self-host web fonts.** Use WOFF2 variable fonts, preload in `<head>`, inline the `@font-face` declaration, and set `font-display: swap` or `optional`. Never load fonts from third-party CDNs (cache partitioning, GDPR).
20. **Never load third-party scripts synchronously.** Always use `async` or `defer`. Lazy-load interaction-driven widgets (chat, social) on scroll or click, not on page load.
21. **Monitor bundle size.** Run `pnpm bundlesize` to verify against configured size limits — CI enforces these on every PR. Check bundle impact with `pnpm bundlesize --analyze` before adding large dependencies.
22. **Configure resource hints via `config.server.ts`.** Use `preconnect` for origins contacted on every page (e.g., image CDN), `dns-prefetch` for optional origins. Don't preconnect to origins that aren't used on every page.

## Code Conventions

### `.env.default` is required-only — do not add optional vars

`.env.default` lists the variables a contributor must set to boot the app or run `pnpm push`. Optional config (feature toggles, callback URIs, log levels, hybrid proxy, Marketing Cloud, Turnstile, etc.) lives in `config.server.ts` defaults and is documented in [docs/README-CONFIG.md](./docs/README-CONFIG.md) — not duplicated here.

**Rule:** Do not add a new variable to `.env.default` unless the app cannot start (or `pnpm push` cannot deploy) without it. If a user asks you to add an optional variable, push back: confirm explicitly that they understand it's optional and still want it inline. Default to declining and pointing them at `config.server.ts` + README-CONFIG.md instead.

### Copyright Header (required)

All TypeScript/JavaScript files must include this Apache 2.0 header. Enforced by ESLint via `eslint-plugin-header`.

```typescript
/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
```

### Site-context-aware navigation — use project wrappers, not React Router originals

This project provides `Link`, `NavLink` (from `@/components/link`) and `useNavigate` (from `@/hooks/use-navigate`) that automatically apply site/locale URL prefixes via `buildUrl`. Using the React Router originals silently produces unprefixed URLs that break multi-site routing.

```typescript
// Correct — site-context-aware
import { Link, NavLink } from '@/components/link';
import { useNavigate } from '@/hooks/use-navigate';

// Wrong — bypasses site context, produces unprefixed URLs
import { Link, NavLink, useNavigate } from 'react-router';
```

Use React Router's `href()` for type-safe param interpolation; combine it with the project's wrappers — `href()` interpolates params, the wrapper adds the site prefix:

```typescript
import { href } from 'react-router';
import { Link } from '@/components/link';

<Link to={href('/product/:id', { id: product.id })}>Product</Link>
```

### Lazy loading for overlays (modals, drawers, dialogs)

Overlay components hidden on initial render **must** use `React.lazy()` with deferred mounting — only mount the `<Suspense>` subtree after the first user interaction. See [Lazy Loading for Overlays](./docs/README-PERFORMANCE.md#lazy-loading-for-overlays-modals-drawers-dialogs) for the pattern, anti-patterns, and rationale.

### Styling

- Use Tailwind utility classes
- Use design tokens (`bg-foreground`, `text-muted-foreground`), not hard-coded colors
- Use `cn()` from `@/lib/utils` to merge class names
- Responsive breakpoints: `sm`, `md`, `lg`, `xl`, `2xl`

See [docs/README-UI-STYLING.md](./docs/README-UI-STYLING.md) for the full guide.

### Shape Tokens (Critical — read before touching Card, Button, Input, or any shadcn primitive)

Shape is token-driven. `rounded-ui` and `shadow-ui` apply to 19 primitives (Card, Button, Input, Dialog, Checkbox, etc.). `border-ui` applies to **Card only** — other primitives use Tailwind's built-in `border` (1px).

**Always override the SOURCE tokens (`--ui-radius`, `--ui-shadow`, `--ui-border-width`), never the bridge variables (`--radius-ui`, `--shadow-ui`).**

The bridge variables are inlined at compile time by Tailwind's `@theme inline { --radius-ui: var(--ui-radius); }`, so `.rounded-ui` actually compiles to `border-radius: var(--ui-radius)` directly. Writing to `--radius-ui` at runtime has no effect — the bridge name doesn't survive into the served CSS. Only `--ui-radius` / `--ui-shadow` / `--ui-border-width` are real runtime variables. See [docs/README-SHAPE-TOKENS.md](./docs/README-SHAPE-TOKENS.md) for the full mechanism.

**Never** add explicit shape classes to components that already use these token utilities.

**Rules:**

1. **Never add `rounded-none`, `shadow-none`, or `border-0` to neutralize shape** — change the token value in `core.css` instead. These classes are redundant when the token is already 0/none.
2. **Never add `rounded-xl`, `rounded-lg`, etc. directly to shadcn primitives** — use `[--ui-radius:var(--radius-xl)]` to override the source token for that instance.
3. **Never hardcode `border-radius: 0.75rem` in CSS** — use `var(--radius-xl)` or set `--ui-radius` via scoped override.
4. **Use `[--ui-border-width:1px]` to opt a Card into visible borders** — not `border` or `border-1` (those don't override `border-ui`'s variable). This only applies to Card; Input/Dialog/etc. use plain `border`.
5. **Use `:where()` for section-scoped overrides** — preserves per-card className overridability.
6. **`border-primary`, `border-transparent` override color only** — they work alongside `border-ui` on Card (which controls width). Never use `border-2` to override `border-ui` width; use `[--ui-border-width:2px]`.

```tsx
// ✅ Correct — source-token overrides
<Card className="[--ui-border-width:2px] border-primary">
<Card className="[--ui-radius:var(--radius-2xl)]">
<Card className="[--ui-shadow:none]">

// ❌ Wrong — bridge-token writes do nothing at runtime (Tailwind inlines them at compile time)
<Card className="[--radius-ui:var(--radius-2xl)]">
<Card className="[--shadow-ui:none]">

// ❌ Wrong — redundant, fights the token system
<Card className="rounded-none shadow-none">
<Card className="rounded-xl">
<Card className="border border-border">  // border sets width:1px but border-ui overrides it
```

```css
/* ✅ Correct — source-token scoped override in base.css */
.product-card[data-slot="card"] {
    --ui-radius: var(--radius-2xl);
    --ui-shadow: 0 4px 16px -4px rgb(0 0 0 / 0.12);
}

/* ❌ Wrong — bridge-token writes do nothing (compile-time inlined) */
.product-card[data-slot="card"] {
    --radius-ui: var(--radius-2xl);
    --shadow-ui: 0 4px 16px -4px rgb(0 0 0 / 0.12);
}

/* ❌ Wrong — hardcoded values, not token-driven */
.product-card[data-slot="card"] {
    border-radius: 1rem;
    box-shadow: 0 4px 16px -4px rgb(0 0 0 / 0.12);
}
```

## Testing

Three strategies — see [docs/README-TESTS.md](./docs/README-TESTS.md) for patterns.

- **Unit tests (Vitest):** `*.test.ts`, `*.test.tsx` — React Testing Library, jsdom, MSW for API mocking.
- **Storybook snapshot / interaction tests:** Visual regression and user-flow testing via `play` functions.
- **Storybook a11y tests:** Accessibility violation detection via axe-core.

## Key Documentation

The docs below are where architectural detail lives — consult them for tasks in the relevant area.

**Architecture & patterns:**
- [docs/README-DATA.md](./docs/README-DATA.md) — Data fetching: loaders, actions, fetchers, middlewares, cookies/sessions
- [docs/README-REVALIDATION.md](./docs/README-REVALIDATION.md) — Revalidation control: when loaders re-run after actions, the scale cost of the default, and gating with `shouldRevalidate`
- [docs/README-SUSPENSE.md](./docs/README-SUSPENSE.md) — Loading states and Suspense patterns
- [docs/README-STATE.md](./docs/README-STATE.md) — State management: server state, URL state, optimistic UI
- [docs/README-ADAPTER-PATTERN-GUIDE.md](./docs/README-ADAPTER-PATTERN-GUIDE.md) — Adapter pattern for data fetching (Einstein, Active Data, custom)
- [docs/README-SCAPI.md](./docs/README-SCAPI.md) — SCAPI client overrides and custom APIs
- [docs/README-CONFIG.md](./docs/README-CONFIG.md) — Configuration system (including `PUBLIC__` prefix behavior)
- [docs/README-CONFIG-OPTIONS.md](./docs/README-CONFIG-OPTIONS.md) — Configuration options reference
- [docs/README-AUTH.md](./docs/README-AUTH.md) — Authentication patterns
- [docs/README-COOKIE-DOMAIN.md](./docs/README-COOKIE-DOMAIN.md) — Configurable cookie domains: storefront config (`app.cookies.domain` + per-site), the matching Business Manager setting, verification, rollout
- [docs/README-EMAIL-VERIFICATION.md](./docs/README-EMAIL-VERIFICATION.md) — Email verification: OTP flows, passwordless registration/login, account details badge, Change Email
- [docs/README-TURNSTILE.md](./docs/README-TURNSTILE.md) — Cloudflare Turnstile bot protection (BFF verification, three-tier health, fail-open)
- [docs/README-SECURITY-HEADERS.md](./docs/README-SECURITY-HEADERS.md) — Default security response headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- [docs/README-I18N.md](./docs/README-I18N.md) — Internationalization
- [docs/README-MULTI-SITE.md](./docs/README-MULTI-SITE.md) — Site context and locale URL routing
- [docs/README-PAGE-DESIGNER.md](./docs/README-PAGE-DESIGNER.md) — Page Designer component development (decorators, metadata)

**UI & frontend:**
- [docs/README-UI-STYLING.md](./docs/README-UI-STYLING.md) — Tailwind, shadcn, design tokens
- [docs/README-SHAPE-TOKENS.md](./docs/README-SHAPE-TOKENS.md) — Shape tokens: source vs bridge variables, scoped overrides for Card/Button/Input shape
- [docs/README-PERFORMANCE.md](./docs/README-PERFORMANCE.md) — Performance entry point: web fonts, third-party scripts, bundles, client-side transform anti-patterns; links to all other performance guides
- [docs/README-IMAGES.md](./docs/README-IMAGES.md) — DIS integration, `<DynamicImage>`, alt text
- [docs/README-SEO.md](./docs/README-SEO.md) — Page titles, meta tags, canonical URLs
- [docs/README-PERFORMANCE-METRICS.md](./docs/README-PERFORMANCE-METRICS.md) — Performance monitoring (Server-Timing, timeline visualization)

**Testing & quality:**
- [docs/README-TESTS.md](./docs/README-TESTS.md) — Testing strategy and patterns
- [docs/README-ESLINT.md](./docs/README-ESLINT.md) — ESLint configuration
- [docs/README-STORY-COVERAGE.md](./docs/README-STORY-COVERAGE.md) — Story coverage enforcement
- [docs/README-STORYBOOK.md](./docs/README-STORYBOOK.md) — Storybook setup

**Migrations:**
- [docs/migrations/react-router-7.18/README.md](./docs/migrations/react-router-7.18/README.md) — Upgrading your project from React Router 7.12 to 7.18.0 (security fixes, API renames, behavioral quirks)

**Development:**
- [docs/README-HYBRID-PROXY.md](./docs/README-HYBRID-PROXY.md) — Hybrid proxy for local development
- [src/extensions/README.md](./src/extensions/README.md) — Extensions system (including `@sfdc-extension-*` markers)
