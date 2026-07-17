# Performance Best Practices

Use optimization strategies to build fast storefronts. Follow performance best practices for web fonts, resource hints, bundle optimization, and third-party scripts.

> [!NOTE]
> This document is the entry point for performance topics. For in-depth documentation, see the topics listed next.

| Topic                                    | Key Areas                                                                                      |
|------------------------------------------|------------------------------------------------------------------------------------------------|
| [Data Fetching](README-DATA.md)          | Server-load everything, data classification, loaders, actions, fetchers, SCAPI request shape   |
| [Revalidation](README-REVALIDATION.md)   | When loaders re-run after actions, the scale cost of the default, gating with `shouldRevalidate`|
| [Loading States](README-SUSPENSE.md)     | Suspense boundary granularity, skeleton vs. spinner, visual feedback patterns                  |
| [State Management](README-STATE.md)      | URL state, context selector pattern, optimistic UI, avoiding derived state                     |
| [Images](README-IMAGES.md)               | DIS integration, `<DynamicImage>`, `DynamicImageProvider`, responsive sources, alt text        |
| [Metrics](README-PERFORMANCE-METRICS.md) | Server-Timing, timeline visualization, parallelization analysis                                |

## Optimize Web Fonts

To achieve optimal performance during page load, use system fonts or minimize the size of web fonts and improve their discovery. Large web font files take longer to download and negatively affect [First Contentful Paint](https://web.dev/articles/fcp) (FCP). An incorrect `font-display` value can cause layout shifts that contribute to [Cumulative Layout Shift](https://web.dev/articles/cls) (CLS).

### Font Hosting

Self-host web fonts instead of loading them from third-party CDNs like Google Fonts. Self-hosting eliminates cross-origin DNS lookups and connection setup, avoids browser cache partitioning (browsers isolate third-party CDN caches per site), and is required for GDPR compliance, since loading fonts from external CDNs transmits the visitor's IP address to that third party on every page load. A [2022 ruling by the Munich Regional Court](https://gdprhub.eu/index.php?title=LG_M%C3%BCnchen_-_3_O_17493/20) established this as a GDPR violation applicable across the EU. The alternative of gating external font loading behind a consent manager preserves CDN delivery but degrades the experience for users who haven't consented and adds implementation complexity. For details, see [Google Fonts and GDPR](https://www.cookieyes.com/documentation/google-fonts-and-gdpr/).

### Font Discovery

Browsers use `@font-face` to find fonts. Help the browser discover fonts earlier by inlining the `@font-face` declaration in the `<head>` and adding a `<link rel="preload">` directive. Without preload, the browser doesn't request the font until it computes a style that references it, adding a waterfall delay.

### Font Download

Use the WOFF2 format for its superior compression. Prefer variable fonts because a single file covers multiple weights, reducing the number of requests and preload hints. Subset fonts to include only necessary characters when the full Unicode range isn't needed.

### Font Rendering

The `font-display` CSS property controls how text is shown while a font loads. Use `swap` to immediately show a system fallback font and swap in the web font once loaded, avoiding Flash of Invisible Text (FOIT). Use `optional` to eliminate the swap-induced layout shift entirely. The web font is used only if it arrives before first render, otherwise the system font persists.

### System Fonts

Using system fonts avoids the font download entirely and eliminates render-blocking. For examples of system fonts, see [Fonts for Apple platforms](https://developer.apple.com/fonts/) and [Windows 11 font list](https://learn.microsoft.com/en-us/typography/fonts/windows_11_font_list).

For more detail, see [Optimize web fonts](https://web.dev/learn/performance/optimize-web-fonts) on web.dev.

### Template Implementation

The template ships with **Sen**, a self-hosted variable font that applies the recommendations above:

| Aspect         | Implementation                                                             | File                     |
|----------------|----------------------------------------------------------------------------|--------------------------|
| Font file      | `public/fonts/sen-variable.woff2` (~22 KB, variable, weight 400–800)       | —                        |
| Preload        | `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous">` | `src/root.tsx`           |
| `@font-face`   | Declared in bundled CSS with `font-display: swap`                          | `src/theme/base.css`     |
| Fallback stack | `'Sen', -apple-system, 'system-ui', 'Helvetica Neue', Arial, sans-serif`   | `src/theme/tailwind.css` |

When replacing Sen with a different font, update the font file in `public/fonts/`, the preload hint in `src/root.tsx`, the `@font-face` declaration in `src/theme/base.css`, and the `--font-sans` / `--font-serif` / `--font-mono` variables in `src/theme/tailwind.css`. Choose a system fallback with similar metrics to minimize the visual shift during swap.

## Resource Hints

Resource hints tell the browser to start DNS lookups, TCP connections, or resource downloads before they're needed, reducing latency when those resources are eventually requested.

The template renders resource hints in the `<head>` based on configuration values in `config.server.ts`, so they can be tuned per environment without code changes (`src/root.tsx`).

- `appConfig.links.preconnect`: Origins the browser should open early connections to (DNS + TCP + TLS). Use for services that will definitely be contacted on every page, such as the image CDN. The template preconnects to the DIS host by default.
- `appConfig.links.prefetchDns`: Origins for DNS-only prefetching. Lighter than `preconnect`, appropriate for services that may or may not be contacted (for example, analytics, optional third-party APIs).
- `appConfig.links.prefetch`: Specific resources to fetch and cache in the background. Use sparingly, as prefetched resources consume bandwidth regardless of whether the user navigates to them.

```bash
# Override via environment variables
PUBLIC__app__links__preconnect='["https://edge.dis.commercecloud.salesforce.com"]'
PUBLIC__app__links__prefetchDns='["https://analytics.example.com"]'
```

> [!WARNING]
> Only `preconnect` to origins that are actually used on every page. Each preconnect opens a TCP and TLS connection eagerly, so unused preconnects waste the browser's connection budget and can delay more important requests. Performance audits such as Lighthouse's "Avoid unnecessary preconnects" will flag this. If an origin is only used on some pages (for example, a payment provider on checkout), prefer `dns-prefetch` instead. DNS lookups are cheaper and don't trigger warnings when unused.

## Bundle Optimization

Vite handles tree-shaking, minification, and chunk splitting automatically. Follow these practices to help keep bundles small.

- Split your code. Vite automatically splits each route into its own chunk, so that users only download the JavaScript for the page they're visiting. For components that aren't needed on initial render, for example modals, drawers, rich editors, or heavy off-screen content, use [`React.lazy()`](https://react.dev/reference/react/lazy) with deferred mounting to split them into separate chunks that are loaded on demand. See [Lazy Loading for Overlays](#lazy-loading-for-overlays-modals-drawers-dialogs) for the pattern. Avoid reaching for `manualChunks` to bucket whole component domains: as the bucketed code grows, Rollup hoists shared primitives (Button, Typography, i18n) into the named chunk to satisfy its "one home per module" rule, and that chunk then gets `modulepreload`ed on every page that references any module under it.
- Analyze and monitor bundle size. Run `pnpm bundlesize` to verify against configured size limits — CI enforces these checks on every PR. To generate an interactive visualization of client and server bundles (opens `build/client-bundle-size.html` and `build/ssr-bundle-size.html`), run `cross-env BUNDLES_SIZE_ANALYZE=true pnpm build`.
- Avoid large dependencies for small tasks. Before adding a library, check its bundle size (for example, via [bundlephobia](https://bundlephobia.com)). A 50 KB utility library for a function you could write in 10 lines is not a good tradeoff.
- Compression is handled automatically. Managed Runtime (CloudFront) applies Gzip/Brotli compression to responses at the edge — no application-level configuration is needed.

## React Rendering

Unnecessary re-renders inflate [Interaction to Next Paint](https://web.dev/articles/inp) (INP) and degrade responsiveness. Here are the most impactful optimizations.

- Split React Contexts by concern. One context per domain (theme, locale, and user). A single large context re-renders all consumers on every value change — even consumers that don't use the changed value. See [State Management](README-STATE.md#context-selector-pattern).
- Memoize expensive computations. Use `useMemo` for derivations that are genuinely expensive. Don't memoize everything, since the overhead of memoization exceeds the cost of cheap computations.
- Stabilize callback references. When passing callbacks to memoized child components, wrap them in `useCallback` to prevent the child from re-rendering on every parent render.
- Use `React.memo` selectively. Wrap components that re-render often with unchanged props. Don't apply it broadly because it adds comparison overhead and obscures the component tree.

### Lazy Loading for Overlays (Modals, Drawers, Dialogs)

Overlay components that are hidden on initial render, such as modals, drawers, and dialogs, must use [`React.lazy()`](https://react.dev/reference/react/lazy) with deferred mounting. Mount the `<Suspense>` subtree only after the first user interaction, not on page load. This keeps the overlay's code out of the main chunk entirely until it's actually needed, reducing page load size and [Total Blocking Time](https://web.dev/articles/tbt) (TBT).

Gate the mount on the overlay's `open` state so the subtree unmounts when the overlay closes. Use `useDeferredUnmount(open)` to keep it mounted for a short window after close — long enough for the exit animation to play — then unmount. `React.lazy` memoizes the resolved chunk at module scope, so re-opening after unmount does **not** re-download the JavaScript; only the closed overlay's in-memory state (and any resource fetchers it holds) is released.

```jsx
const MyModal = lazy(() => import('@/components/my-modal').then((m) => ({ default: m.MyModal })));

function MyComponent() {
  const [open, setOpen] = useState(false);
  // Mounted while open, then unmounts shortly after close so the exit animation plays.
  const mounted = useDeferredUnmount(open);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      {mounted && (
        <Suspense fallback={null}>
          <MyModal open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
```

- First open triggers the lazy import and mounts the subtree; `React.lazy` caches the chunk, so subsequent opens are instant without keeping the subtree alive.
- `open` toggles visibility; `mounted` follows `open` but lags the close by the unmount delay so the exit animation can finish.

> [!IMPORTANT]
> **Anti-pattern:** Importing overlay components synchronously (non-lazy) bundles them into the main chunk, increasing page load size and TBT.
>
> **Anti-pattern:** A sticky "loaded" latch (`const [loaded, setLoaded] = useState(false)` that flips `true` on first open and never resets, gating `{loaded && <Suspense>…}`). It keeps the overlay's subtree mounted forever after the first open. Any resource fetcher the overlay loads on open (`fetcher.load()`, `useScapiFetcher`) then stays registered after close and is re-run on every later revalidation — currency/locale/site switch, store selection — for an overlay the shopper already dismissed. Gate on `open` (via `useDeferredUnmount`) instead. See [Revalidation](./README-REVALIDATION.md) for the fan-out cost.
>
> **Discouraged:** `<Suspense><LazyComponent /></Suspense>` without a guard — the chunk is separate but still fetched and parsed on mount, adding to TBT during page startup.

### Deferred Rendering with `useDeferredRender`

Mounting a `<Suspense>` boundary at the top of the component tree forces React to retain the entire fallback subtree in memory and process it during initial render — even if the user hasn't scrolled near that content. For large grids or heavy off-screen sections, this unconditional top-level mounting inflates [Total Blocking Time](https://web.dev/articles/tbt) (TBT) and competes for the main thread with [LCP](https://web.dev/articles/lcp) candidates in the initial viewport.

The `useDeferredRender` hook solves this main-thread contention by delaying the mount of a `<Suspense>` boundary until the browser reports an idle frame via [`requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback). During that idle window, the component renders a lightweight skeleton placeholder instead of a live `<Suspense>` tree.

**Three-Phase Rendering:**

| Phase                   | When                         | What renders                                                                         |
|-------------------------|------------------------------|--------------------------------------------------------------------------------------|
| **Pre-Idle**            | Immediately after page paint | Critical content and static skeleton placeholders. No `<Suspense>` boundary mounted. |
| **Post-Idle (Pending)** | After idle callback fires    | `<Suspense>` boundary mounts with skeleton fallback. Stream begins.                  |
| **Resolved**            | After Promise settles        | Full content replaces skeleton.                                                      |

```jsx
import { useDeferredRender } from '@/hooks/use-deferred-render';

function MySection({ criticalItems, nonCriticalPromise, placeholderCount }) {
  const shouldRender = useDeferredRender(placeholderCount > 0);

  return (
    <>
      {/* Critical, initial-viewport content always renders synchronously */}
      <ItemGrid items={criticalItems} />

      {/* Phase 1: no Suspense boundary — minimal render cost */}
      {!shouldRender ? (
        <SkeletonGrid count={placeholderCount} />
      ) : (
        /* Phase 2 & 3: Suspense boundary mounts after idle */
        <Suspense fallback={<SkeletonGrid count={placeholderCount} />}>
          <Await resolve={nonCriticalPromise}>
            {(items) => <ItemGrid items={items} />}
          </Await>
        </Suspense>
      )}
    </>
  );
}
```

### Client-Side Transform Anti-Patterns

A common source of unnecessary CPU work is data computation that runs on every render when it should happen once in the server loader. Identify and move these transforms before they compound across component trees.

**Anti-patterns to avoid:**

- **Building lookup maps from arrays in the component body.** Variation matrices, facet lookups, and category trees constructed via `reduce` or nested loops are the most common offender — the work scales with input size and repeats on every render, compounding across every tile in a grid.
- **Nested passes over the same data.** `items.filter(...).map(...).sort(...)` or `items.map(item => other.find(...))` are O(n²) when repeated per render over larger collections. Derive the shape you need once, and index once.
- **Deep spreads and clones.** `items.map(item => ({ ...item, children: item.children.map(c => ({ ...c })) }))` allocates a fresh object tree every render and breaks prop equality for every child downstream.
- **Repeated string normalization.** Slug construction, URL parsing, or locale formatting that doesn't depend on client-only state belongs in the loader.

```jsx
// ❌ BAD: lookup map rebuilt, and nested find/sort repeated on every render
function Grid({ items, categories }: Props) {
  const byCategory = items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.categoryId] ??= []).push(item);
    return acc;
  }, {});
  const rows = categories
    .map((c) => ({ ...c, items: byCategory[c.id] ?? [] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return <>{rows.map((row) => <Row key={row.id} row={row} />)}</>;
}

// ✅ GOOD: derive once in the loader; component just renders
export async function loader({ params }: Route.LoaderArgs) {
  const [items, categories] = await Promise.all([fetchItems(params.id), fetchCategories()]);
  const rows = buildRows(items, categories); // group + sort once, server-side
  return { rows };
}

function Grid() {
  const { rows } = useLoaderData<typeof loader>();
  return <>{rows.map((row) => <Row key={row.id} row={row} />)}</>;
}
```

## Third-Party Scripts

Third-party scripts, such as analytics, tag managers, A/B testing, chat widgets, and consent banners, are a common source of performance degradation. Each script adds to [Total Blocking Time](https://web.dev/articles/tbt) (TBT) and can delay [Interaction to Next Paint](https://web.dev/articles/inp) (INP).

Keep these tips in mind for best performance results.

- Audit regularly. Every external script must justify its performance cost. Remove scripts that aren't actively used.
- Never load synchronously. Always use `async` or `defer`. A synchronous `<script>` blocks HTML parsing entirely.
- Lazy-load interaction-driven widgets. Chat widgets, social buttons, and similar components should load only when the user scrolls near them or clicks a placeholder — not on page load. See [Lazy Loading for Overlays](#lazy-loading-for-overlays-modals-drawers-dialogs) for the deferred mounting pattern.
- Use a Consent Management Platform (CMP). Integrate with a tag manager to prevent marketing and analytics tags from loading before user consent. This method satisfies privacy regulations and improves performance for users who haven't consented.
- Measure impact. Use the Chrome DevTools [Coverage tab](https://developer.chrome.com/docs/devtools/coverage) to identify unused JavaScript and CSS from third-party scripts.
