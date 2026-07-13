# Migrating to React Router 7.18

This guide walks you through upgrading your storefront-next project from
`react-router` 7.12 to 7.18.0. It covers the security fixes it delivers, the
eight API renames stabilized in 7.15, two behavioral quirks that ride along
with 7.16 and 7.18, and how to drive the whole migration by pasting this
document into Claude Code.

## 1. Security Context

React Router 7.14.2 patches an unauthenticated remote-code-execution
vulnerability plus four other advisories in the vendored `turbo-stream`
dependency. This is a **peer dependency** of `@salesforce/storefront-next-*`,
so the SDK release that stabilizes the API renames does not itself pull the
fix into your app — the version is pinned by your own `package.json`.

You must bump both packages together:

- `react-router` to `7.18.0`
- every `@react-router/*` package your project depends on (`@react-router/node`,
  `@react-router/dev`, `@react-router/express`, `@react-router/fs-routes`) to
  `7.18.0`

**Pin exactly `7.18.0`, not `^7.18.0`.** A caret leaves the resolved version
up to the lockfile, so the manifest stops describing what shipped and the
next `pnpm install` can silently roll into an untested patch. Exact pins keep
the manifest declarative and give a single version to attest against.

Projects generated fresh from the template already ship with the exact pin.

## 2. Prerequisites

- Your project's `@salesforce/storefront-next-dev` and
  `@salesforce/storefront-next-runtime` packages are on the SDK release that
  carries this migration (or newer).
- You are on Node.js 24 or later and pnpm 10.28.0 or later.
- Your project was generated from the storefront-next template and you own the
  fork.

## 3. The Eight Renames

React Router stabilized eight `unstable_*` symbols in 7.15. Six drop the
prefix; two swap it for `v8_`. Group them by how they surface so you can
apply the risky one first and lean on the typechecker for the rest.

### 3a. Silent-Failure Rename — Act on This First

React Router 7.18 reads the server-entry `instrumentations` export **by
name**. An entry file that still exports `unstable_instrumentations`
compiles cleanly, but its instrumentations are never registered — you lose
tracing / OpenTelemetry spans without any signal at build time.

Only relevant if you have **ejected `entry.server.tsx`** and are exporting
your own instrumentations.

Rename the export:

```ts
// Before — 7.12
export const unstable_instrumentations = [/* ... */];

// After — 7.18
export const instrumentations = [/* ... */];
```

The SDK's `composeServerEntry` also emits a dev-only warning if it sees the
old name still exported, to catch this before it ships. If you see this in
your dev log, that is the silent-failure rename:

```
[storefront-next] entry.server exports `unstable_instrumentations`, which
React Router 7.18 no longer reads. Rename the export to `instrumentations`
or it will not register.
```

### 3b. Typecheck-Caught Renames — Drop the `unstable_` Prefix

Each of these fails `pnpm typecheck` on 7.18, so the compiler will find every
call site for you. Drop the `unstable_` prefix on:

- `pattern` — the route pattern arg on any `route.instrument({ loader, action, middleware })` callback or `MiddlewareFunction`
- `ServerInstrumentation` — the exported type for instrumentation objects
- `InstrumentationHandlerResult` — the exported type for handler instrumentation results
- `createContext` — the router context factory
- `subResourceIntegrity` — the config flag (also moves — see next)

Two concrete before/after examples from the SDK's own instrumentation.

Type import — in your SDK (not your app), at `@salesforce/storefront-next-dev/src/otel/react-router/instrumentation.ts`:

```ts
// Before — 7.12
import type { unstable_ServerInstrumentation } from 'react-router';
export const platformInstrumentation: unstable_ServerInstrumentation = { /* ... */ };

// After — 7.18
import type { ServerInstrumentation } from 'react-router';
export const platformInstrumentation: ServerInstrumentation = { /* ... */ };
```

Route-instrument callback arg — same file, `route.instrument(...)`:

```ts
// Before — 7.12
route.instrument({
    async loader(handleLoader, { unstable_pattern }) {
        await traced(`loader (${route.id})`, routeAttributes(unstable_pattern), handleLoader);
    },
    async action(handleAction, { unstable_pattern }) { /* ... */ },
    async middleware(handleMiddleware, { unstable_pattern }) { /* ... */ },
});

// After — 7.18
route.instrument({
    async loader(handleLoader, { pattern }) {
        await traced(`loader (${route.id})`, routeAttributes(pattern), handleLoader);
    },
    async action(handleAction, { pattern }) { /* ... */ },
    async middleware(handleMiddleware, { pattern }) { /* ... */ },
});
```

Config flag also moves out of `future` and up to top-level — example from
your SDK, `@salesforce/storefront-next-dev/src/configs/react-router.config.test.ts`.
Only relevant if you have added a `future` block to your own
`react-router.config.ts`. A stock config (`presets: [storefrontNextPreset()]`)
has nothing to change here:

```ts
// Before — 7.12
{
    future: {
        unstable_subResourceIntegrity: false,
        // ...
    },
}

// After — 7.18
{
    future: {
        subResourceIntegrity: false,   // stays here for `future.*` migration compat
        // ...
    },
    subResourceIntegrity: false,        // and is now a top-level option
}
```

### 3c. Prefix-Swap Renames — `unstable_` to `v8_`

Two `future` flags swap prefix instead of dropping it. Only relevant if you
have added a `future` block to your own `react-router.config.ts` and set
either flag. Update both:

```ts
// Before — 7.12
future: {
    unstable_trailingSlashAwareDataRequests: false,
    unstable_passThroughRequests: false,
    // ...
}

// After — 7.18
future: {
    v8_trailingSlashAwareDataRequests: false,
    v8_passThroughRequests: false,
    // ...
}
```

`v8_passThroughRequests` is what preserves the `.data` request-URL suffix so
data-response middleware can detect it. If you have middleware that keys off
`request.url` ending in `.data`, keep the flag on.

## 4. What Stays `unstable_` in 7.18 — Leave These Alone

Two `unstable_*` identifiers are still unstable in 7.18. **Do not rename
them**:

- `unstable_optimizeDeps` — Vite dep-optimization flag in `react-router.config.ts`
- `unstable_devTools` — dev-tools config

They may stabilize in a later release. When they do, we will ship another
migration guide.

## 5. Loader/Action `url` — Type-Only

`LoaderFunctionArgs` and `ActionFunctionArgs` now include a `url: URL` field
alongside `request`. **Runtime behavior is unchanged** — the framework still
provides the URL via `request.url`, and any loader/action code that reads
`request.url` continues to work as-is. No production loader change is
required.

The change only surfaces in **test fixtures** that construct the args by
hand — the compiler now demands the new field.

Test-fixture example, `src/lib/test-utils/loader-action-args.ts`:

```ts
// Before — 7.12
return {
    request,
    context,
    params: options.params ?? {},
    unstable_pattern: options.unstable_pattern,
} as T;

// After — 7.18
return {
    request,
    context,
    params: options.params ?? {},
    pattern: options.pattern,
    url: new URL(request.url),
} as T;
```

If you use a `createLoaderArgs` / `createActionArgs` helper of your own, add
`url: new URL(request.url)` to it in one place and every test picks it up.

## 6. Behavioral Quirks — Read If You Hit These Symptoms

Two runtime behaviors changed in 7.16 and 7.18 that are not renames. The
SDK already ships the fix for both; you only need to know about them if
your project runs a custom Vite/adapter build or you have your own
`fetcher.state` effect.

### 6a. MRT Streaming-Drain (RR 7.16+)

**Symptom.** Order-confirmation or any long streamed SSR response hangs for
about 30 seconds and then times out. Common on routes with a deferred
loader that flushes a second Suspense chunk.

**Root cause.** React Router 7.16+ awaits a `drain` event on the response
after any `res.write()` that reports backpressure, before it sends the next
chunk. The Managed Runtime response stream does not emit `drain` on `res`
— it emits on the compression / `HttpResponseStream` pipe inside, so the
writer waits on a signal that never comes.

**Where the fix lives.** In your SDK (not your app), at
`@salesforce/storefront-next-dev/src/mrt/create-lambda-adapter.ts:485-522`.
`writeChunk` now returns whether the chunk was **accepted** rather than
relaying the underlying stream's backpressure signal, so the writer keeps
flowing and real flow control stays inside the compression to response pipe.

If you build a **custom** Vite adapter or eject `create-lambda-adapter.ts`,
you must carry this shape forward.

### 6b. Fetcher Idle-Race (RR 7.18)

**Symptom.** A fetcher-driven action (place-order, quantity update, wishlist
add) never fires; the UI times out at 30s.

**Root cause.** React Router 7.18 defers fetcher state updates. A render can
now run while a just-submitted fetcher still reads `state === 'idle'`. A raw
`state === 'idle'` check therefore cannot tell "not started yet" from "just
finished." A handoff effect that used to fire once after payment succeeded
now cancels itself on the pre-submission idle tick.

**The fix pattern.** Track the previous fetcher state via a ref, and act
only on the transition **into** `idle`:

```tsx
// After — 7.18. Real diff from
// src/components/checkout/checkout-form-page.tsx
const previousPaymentFetcherStateRef = useRef(paymentFetcher.state);
useEffect(() => {
    const previousState = previousPaymentFetcherStateRef.current;
    previousPaymentFetcherStateRef.current = paymentFetcher.state;

    if (!paymentSubmissionRef.current.shouldPlaceOrderAfterPayment) return;
    const paymentJustResolved = paymentFetcher.state === 'idle' && previousState !== 'idle';
    if (!paymentJustResolved) return;

    // ...proceed with the handoff
}, [paymentFetcher.state, paymentFetcher.data]);
```

Any effect that reads `fetcher.state` directly and acts on `=== 'idle'`
needs the same guard.

## 7. Using This Guide with Claude Code

You can drive the entire rename set by pasting this document into a Claude
Code session as the migration prompt. A framing sentence that works:

> Migrate this repo from react-router 7.12 to 7.18.0 by applying every
> rename in the guide below. Leave `unstable_optimizeDeps` and
> `unstable_devTools` as-is. Do not add `url` to production loaders or
> actions (runtime is unchanged); update test fixtures only where the
> compiler complains. The MRT streaming-drain and fetcher idle-race fixes
> in § 6 ship in the SDK — skip them unless my project has ejected the
> adapter or has its own `fetcher.state` effect.

The compiler + the `[storefront-next]` dev warning cover most safety nets;
still run through § 8 before you ship.

## 8. Verification Checklist

- [ ] `react-router` and every `@react-router/*` package pin exactly `7.18.0`
      in `package.json` (no caret, no tilde).
- [ ] `pnpm install` reconciles cleanly with the pinned versions.
- [ ] `pnpm typecheck` is green — the six prefix-drop renames and the two
      prefix-swap renames all surface here.
- [ ] `pnpm test` is green.
- [ ] `pnpm dev` boots. If you have an ejected `entry.server.tsx`,
      grep for `unstable_instrumentations` — the export must be renamed to
      `instrumentations` or nothing registers.
- [ ] No `[storefront-next] entry.server exports unstable_instrumentations`
      warning in the dev log.
- [ ] Manual smoke of one order-confirmation flow (streamed response) and
      one fetcher-driven checkout step (place order). If either hangs at
      ~30s, revisit § 6.

## 9. Links

- React Router 7.15.0 release —
  https://github.com/remix-run/react-router/releases/tag/react-router%407.15.0
  (stabilization of the eight renames; changelog anchor at
  https://github.com/remix-run/react-router/blob/main/CHANGELOG.md#v7150).
- React Router 7.16.0 release —
  https://github.com/remix-run/react-router/releases/tag/react-router%407.16.0
  (streaming / drain-awareness on the server response).
- React Router 7.18.0 release —
  https://github.com/remix-run/react-router/releases/tag/react-router%407.18.0
  (deferred fetcher state updates; the changelog anchor is
  https://github.com/remix-run/react-router/blob/main/CHANGELOG.md#v7180).
- Full React Router changelog —
  https://github.com/remix-run/react-router/blob/main/CHANGELOG.md.
