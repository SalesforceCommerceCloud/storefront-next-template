---
title: Turnstile Bot Protection for Passwordless Login
domain: Checkout
status: active
version: 7
created: 2026-04-08
last_updated: 2026-05-08
author: Avinash Kumar
changelog:
  - version: 7.0
    date: 2026-05-08
    change: >
      WI-9 enhancements + WI-8 status-page tier removed.
      Per Cloudflare guidance, siteverify failure rate is now the primary health signal
      and the static-CDN HEAD probe is the corroborating bootstrap signal. The status-page
      tier was a defense-in-depth choice we made and have now removed because Cloudflare
      did not endorse it and it added test/code surface for narrow benefit.
    author: Avinash Kumar
  - version: 6.0
    date: 2026-05-05
    change: >
      WI-8: Cloudflare Status Page as secondary health signal - dual-signal architecture,
      independent caches with separate TTLs, configurable probe URLs via env vars
    author: Avinash Kumar
  - version: 5.0
    date: 2026-05-05
    change: >
      WI-7: Graceful degradation - server-side Cloudflare health detection, tightened error code handling,
      removed client-trusted bypass flag (security fix), stale-while-revalidate caching
    author: Avinash Kumar
  - version: 4.0
    date: 2026-04-27
    change: >
      WI-6: Skip redundant Turnstile challenge during registration if shopper already completed challenge during login
      with server-side verification cookie (cc-tv_${siteId}), early widget mount on focus, executeRef prop
    author: Avinash Kumar
  - version: 3.0
    date: 2026-04-23
    change: >
      WI-5: Login page enforcement, token reset after use, fail-closed config,
      locale fix, shared enforcement utility, updated config examples
    author: Avinash Kumar
  - version: 2.2
    date: 2026-04-20
    change: "Add Turnstile-WI-4: Protect checkout registration endpoint from bot abuse"
    author: Avinash Kumar
  - version: 2.1
    date: 2026-04-20
    change: Managed mode default, deferred widget render, gated form submission, attack logging
    author: Avinash Kumar
  - version: 2.0
    date: 2026-04-20
    change: Add Turnstile-WI-2 - Server-side token verification on MRT (4 work items)
    author: Avinash Kumar
  - version: 1.2
    date: 2026-04-09
    change: Ready - cleaned up code, updated spec
    author: Avinash Kumar
  - version: 1.1
    date: 2026-04-09
    change: Complete E2E coverage - 6 tests covering all Cloudflare test key scenarios
    author: Avinash Kumar
  - version: 1.0
    date: 2026-04-08
    change: Initial spec for Turnstile bot protection
    author: Avinash Kumar
---

# Turnstile Bot Protection for Passwordless Login

## Overview

Protect all passwordless login and registration endpoints from bot abuse using Cloudflare Turnstile. Default mode is **managed**: Cloudflare decides whether to show an interactive challenge or auto-pass based on risk signals. All server-side enforcement uses a shared utility (`enforceTurnstile`) with fail-closed defaults: if no Turnstile site keys are configured, protected endpoints reject requests. Graceful degradation ensures that Cloudflare outages never block legitimate shoppers; the server independently detects infrastructure issues and fails open when Cloudflare is at fault.

## User Experience

**Checkout contact info (passwordless login):**
1. Shopper focuses the email field
2. Shopper types email and leaves the field → challenge runs (auto-solves or shows interactive widget)
3. Passwordless login fires automatically once the challenge is solved
4. Continue button becomes enabled

**Checkout registration ("Save for faster checkout"):**
1. Shopper checks the "Save for faster checkout" checkbox
2. If they already passed a challenge at contact info → no second challenge, request proceeds immediately
3. Otherwise → challenge appears, shopper completes it, registration request fires

**Login page:**
1. Shopper enters email and submits the passwordless login form
2. Challenge is included inline; form cannot submit without a solved challenge

**When Cloudflare is down:**
1. Widget fails to load or challenge times out (5 seconds)
2. The form becomes submittable regardless (shopper is not blocked)
3. Server independently detects the outage and allows the request through

**Attack blocked:**
1. Bot sends request without completing a challenge → rejected (403)
2. Bot sends invalid or replayed token → rejected (403)
3. Bot sends request without browser headers → rejected (403)

## Acceptance Criteria

### Turnstile-WI-1: Bot Protection (Frontend) [done]

- [x] Shoppers complete a bot challenge before passwordless login requests fire
- [x] Cloudflare decides whether to show an interactive challenge or auto-pass (managed mode)
- [x] The challenge widget appears only after the shopper interacts with the email field, not on page load
- [x] The form cannot be submitted until the challenge is solved (Continue button gated)
- [x] Passwordless login does not fire until a valid token is available
- [x] Site keys are configurable per environment (production, staging, local dev)
- [x] If the widget fails to initialize due to misconfiguration, the shopper is not blocked

#### Design

- `TurnstileWidget` component loads the Cloudflare script, renders the widget, and exposes `onSuccess`/`onError`/`onExpire` callbacks
- Widget mounts after email blur (deferred render) to avoid unnecessary CDN load on page entry
- Token stored in React state; parent form reads it from state on submission
- Site keys read from `security.turnstile.sites` in MRT config (parsed from `PUBLIC__security__turnstile__sites` env var)

### Turnstile-WI-2: Server-Side Token Verification on MRT [done]

- [x] All passwordless login requests are verified server-side before the OTP email is sent
- [x] Requests without a token are rejected (403)
- [x] Requests with an invalid or expired token are rejected (403)
- [x] Verification can be disabled via configuration for environments that don't need it
- [x] The shopper's IP is forwarded to Cloudflare for additional risk scoring
- [x] Verification handles timeouts and network errors without crashing the server action

#### Design

**WI-2a: Verification utility (`verify.server.ts`):**
- Calls Cloudflare siteverify API (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`)
- Passes `secret` (from env), `response` (token), and optionally `remoteip`
- 5-second timeout; network errors and timeouts map to `internal-error`
- Returns typed result: `{ success, errorCodes, challengeTs, hostname }`

**WI-2b: Integration into server actions:**
- `action.authorize-passwordless-email.ts` extracts `turnstileToken` from FormData
- Token verified BEFORE calling `authorizePasswordless()`: rejects early on failure
- If `verification.enabled = false`, verification is skipped entirely

**WI-2c: Secret key management:**
- Secret keys stored in `TURNSTILE_SECRET_KEYS` env var (server-only, JSON map: `{ "siteKey": "secretKey" }`)
- Looked up by matching the request's site key
- `config.server.ts` exposes `verification.enabled` default

**WI-2d: E2E validation:**
- Uses Cloudflare test keys: always-pass (`1x...AA`), always-fail (`2x...AA`), token-already-spent (`3x...AA`)
- Verifies 403 on invalid token, form blocking on interactive challenge

### Turnstile-WI-3: Attack Detection Logging [done]

- [x] Bot bypass attempts (missing token) are logged with IP, user-agent, and email
- [x] Verification failures (replay, invalid token) are logged with error codes, IP, and user-agent
- [x] Merchant misconfiguration (missing secret key) is logged **and blocks the request** (fail-closed in enforce mode — aligns with WI-5d)
- [x] All logs include the action name for easy filtering in monitoring tools

#### Design

- All logging happens within `enforceTurnstile()` at warn level
- Log fields: `remoteIp` (from `x-forwarded-for` or `cf-connecting-ip`), `userAgent`, `email`, `action`, `errorCodes`
- Misconfiguration (no secret key) logs the site key to aid debugging

### Turnstile-WI-4: Protect Checkout Registration Endpoint [done]

The checkout registration endpoint triggers OTP emails for guest account creation. Without protection, attackers can trigger mass OTP emails (email bombing) or enumerate registered accounts.

- [x] The registration endpoint requires bot verification before sending OTP emails
- [x] The widget appears below the "Save for faster checkout" checkbox
- [x] Requests without verification (no token AND no prior session proof) are rejected
- [x] OTP resend requests also require a valid token
- [x] Only POST requests are accepted

#### Design

- `TurnstileWidget` added to `register-customer-selection.tsx`, rendered below the checkbox
- `turnstileToken` included in both initial submission and resend code flow
- Server action (`action.initiate-checkout-registration.ts`) calls `enforceTurnstile()`
- Accepts either a fresh token OR the `cc-tv_${siteId}` httpOnly cookie (see WI-6) as proof
- POST method check returns 405 for other methods
- Attack logging follows WI-3 patterns

### Turnstile-WI-5: Harden All Passwordless Flows [done]

All passwordless entry points use a shared enforcement utility. Test credentials are removed from production config. Locale is dynamically resolved.

#### WI-5a: Login page enforcement [done]
- [x] The login page passwordless flow requires bot verification
- [x] OTP resend on the login page requires a fresh token
- [x] Tokens are reset after each use (single-use enforcement)

#### WI-5b: Shared enforcement utility [done]
- [x] A single enforcement entry point handles all protected endpoints (no duplicated logic)
- [x] Enforcement checks: origin/referer header present, site key matches, secret key configured, token present, token valid
- [x] Each check has diagnostic logging for ops visibility

#### WI-5c: Token reset after use [done]
- [x] After a token is consumed, the widget resets to generate a fresh token for the next request
- [x] Email changes in checkout trigger a fresh challenge (prior token invalidated)

#### WI-5d: Fail-closed configuration [done]
- [x] If no site keys are configured, all protected requests are blocked (fail-closed)
- [x] Malformed configuration JSON is treated as empty (fail-closed)
- [x] Test keys are not present in production config; only in local dev `.env.default`
- [x] Missing Origin/Referer headers cause rejection (blocks requests without a browser)

#### WI-5e: Locale fix [done]
- [x] OTP emails use the shopper's current locale, not a hardcoded value

#### Design

- `enforceTurnstile()` in `enforce.server.ts`: single entry point called by all three server actions
- Checks performed in order: config enabled → origin/referer present → site key match → secret key configured → token present → token verified
- Token reset via `resetRef` (registration, login resend) or `tokenConsumedRef` tracking (contact info)
- `config.server.ts` defaults `sites` to `{}` with try/catch on JSON.parse
- Locale resolved from `i18nextContext` in request context

### Turnstile-WI-6: Deferred Execution & Session-Level Verification [done]

Shoppers who already passed a challenge at checkout contact info should not be challenged again at registration.

#### WI-6a: Deferred execution [done]
- [x] The challenge widget mounts on email blur (not focus) to avoid loading the Cloudflare script until the shopper finishes entering email
- [x] This prevents a double-challenge when the shopper types email and immediately clicks Continue
- [x] Parents can control when the challenge executes via a ref (non-interactive mode)
- [x] After widget retry exhaustion, re-focusing email remounts a fresh challenge (recovery path)
- [x] On blur, if `GET /resource/turnstile-session` reports the httpOnly `cc-tv_*` cookie already matches this email, the widget is **not** mounted and the form is not gated (UI suppress only; server `enforceTurnstile` still runs)

#### WI-6b: Session-level verification [done]
- [x] After passing a challenge at contact info, the shopper is not challenged again at registration within the same session
- [x] The server sets an httpOnly verification cookie (30-minute TTL) on successful verification
- [x] The registration endpoint accepts this cookie as proof; no second token required
- [x] If neither a fresh token nor the cookie is present, the request is rejected
- [x] A fresh token is still accepted if provided (handles expired cookies or direct access)
- [x] Starting checkout again with the **same email** within the cookie TTL suppresses the contact-info / passwordless-login widget (cookie↔email match via `/resource/turnstile-session`); a different email shows the widget again — covered by `@turnstile` E2E (`Cookie session suppress` scenarios)

#### Design

- Contact info / passwordless login widgets mount on email blur (deferred render), **unless** `/resource/turnstile-session` reports the `cc-tv_*` cookie already matches that email (widget suppressed; form ungated). After retry exhaustion, remount-on-focus recovers a fresh challenge. Non-interactive mode still uses `execution: 'execute'` and calls `executeRef` on blur once mounted.
- `tokenConsumedRef` prevents premature reset when token is pending server verification
- The `cc-tv_${siteId}` httpOnly cookie is the single source of truth for "this client cleared Turnstile recently." No mirroring client-side state.
- Server sets `cc-tv_${siteId}` httpOnly cookie (`COOKIE_TURNSTILE_VERIFIED`, 30min TTL) via `action.authorize-passwordless-email.ts` on every response path where siteverify returned `success: true` (success, 400, 404, 5xx, generic 500); never on the Turnstile-rejected path and never on fail-open paths (missing token + degraded, or infrastructure siteverify errors)
- `action.initiate-checkout-registration.ts` passes the site-namespaced cookie name into `enforceTurnstile`, which **always runs** and performs HMAC binding verification internally: if the cookie value matches `hmac_sha256(derivedKey, siteKey + ':' + normalizedEmail)` (where `siteKey` is the Cloudflare public site key), the request is short-circuited without a fresh siteverify call; otherwise a fresh siteverify call runs and the HMAC-bound value is written as the new cookie on every response path where siteverify returned `success: true`

### Turnstile-WI-7: Graceful Degradation [done]

Ensure Cloudflare outages or infrastructure issues never block legitimate shoppers from logging in or completing checkout.

**Error Handling Matrix:**

| Scenario | Turnstile Outcome | Shopper Impact |
|----------|----------------|----------------|
| Cloudflare CDN is unreachable (timeout or 5xx) and shopper has no token | Allowed (fail-open) | Login succeeds. Checkout proceeds normally. No disruption. |
| Siteverify endpoint is unreachable (HTTP 5xx or network error) | Allowed (fail-open) | Login succeeds. Checkout proceeds normally. No disruption. |
| Siteverify returns `internal-error` (Cloudflare-side failure) | Allowed (fail-open) | Login succeeds. Checkout proceeds normally. No disruption. |
| Shopper has no token and Cloudflare CDN is healthy | Blocked (403) | Passwordless login fails. Shopper can proceed with checkout as guest or navigate to any other page. |
| Siteverify returns `timeout-or-duplicate` (token already used / replay) | Blocked (403) | Passwordless login fails. Shopper can proceed with checkout as guest or navigate to any other page. |
| Siteverify returns `invalid-input-response` (invalid or forged token) | Blocked (403) | Passwordless login fails. Shopper can proceed with checkout as guest or navigate to any other page. |
| Client widget fails to load or challenge times out (5s) | Depends on CDN health (see rows above) | Form unblocks immediately. If server also allows (CDN down) -> login succeeds. If server blocks (CDN healthy) -> login fails, but shopper can proceed as guest or navigate freely. |
| Interactive challenge shown but shopper never responds | Cloudflare auto-resets the widget on its own schedule | Shopper sees the widget again. Repeats until the shopper solves or navigates away. No form submission occurs while the challenge is unsolved. (Implemented via Cloudflare's `refresh-timeout: 'auto'` option - see WI-9.) |

**Timeout parameters:**

- **Client script load timeout (5s):** How long the shopper waits before the form unblocks if the Turnstile CDN is unreachable. For a sub-100KB resource on a global CDN, 5s is generous even on slow connections - if it hasn't arrived by then, the CDN is almost certainly unreachable, not just slow.
- **Client challenge timeout (Cloudflare-managed):** Cloudflare resets the widget on its own schedule via `refresh-timeout: 'auto'`. We do not hardcode a duration. (Replaced the previous 120s manual timer per WI-9.)
- **Client error-callback retry cap (3):** Max resets on consecutive challenge failures before stopping. Prevents infinite loops from misconfigured site keys. Form stays gated (no bypass).
- **Server CDN probe timeout (3s):** Max latency the CDN probe can add on cold start.
- **CDN health cache TTL (60s):** How long the server reuses a cached CDN probe result before refreshing in the background.
- **Siteverify metrics window (60s, min 5 samples):** Sliding window of recent siteverify outcomes. The primary health signal once the window has enough samples (see WI-9).

**Cold start** = the first time a specific MRT instance needs to check Cloudflare health and has no cached result yet (e.g., after a deployment or instance scale-up). Only this first request pays the probe cost; all subsequent requests on that instance use the cache.

**Security requirements:**
- [x] The server must independently verify Cloudflare availability; clients cannot signal bypass
- [x] No client-supplied form data (e.g., hidden input flags) may influence the server's allow/block decision
- [x] All fail-open decisions are logged at warn level with IP, user-agent, email, and action name
- [x] Health check results are cached to avoid adding latency to the shopper's request path
- [x] On cold start, the health check adds at most 3 seconds of latency
- [x] After initial cache is populated, the health check adds zero latency (stale-while-revalidate: returns stale value immediately while refreshing in background)

**Client-side requirements:**
- [x] If the Turnstile script fails to load within 5 seconds, the UI unblocks the shopper
- [x] If the challenge fails 3 consecutive times (error-callback retry cap), the widget stops retrying (form stays gated - misconfiguration must be fixed)
- [x] When an interactive challenge times out, Cloudflare auto-resets the widget via `refresh-timeout: 'auto'` (no hardcoded duration; see WI-9)
- [x] The widget exposes an `onBypass` callback so parent components can release button/form gates (fires only on script load failure - CDN unreachable)
- [x] No bypass signal is sent to the server; the client only controls local UI state

#### Design

**Server-side health detection (`health.server.ts`):**

Two-tier signal, evaluated in priority order (see WI-9 for the rationale and Cloudflare guidance):
1. **PRIMARY** - Siteverify failure rate and p95 latency over a 60-second sliding window (min 5 samples, with hysteresis). Directly measures the dependency.
2. **SECONDARY** - CDN HEAD probe to `challenges.cloudflare.com/turnstile/v0/api.js` - fast, real-time bootstrap signal used when tier 1 has too few samples.

Either tier indicating degraded triggers fail-open. Each has its own cache:
- Siteverify metrics: 60s window, min 5 samples to be authoritative, fed by every siteverify call. In-memory cached snapshot for the hot logging path. All thresholds are env-overridable (see Configuration).
- CDN probe: 3-second timeout, 60-second cache TTL, stale-while-revalidate. Concurrent cold-start probes (no cache yet) dedupe onto a single in-flight HEAD so instance boot under load does not fan out into a thundering herd.
- Cold start (no cache, no samples): tier 2 is awaited synchronously (max 3s added latency, once per instance)

**Error code classification (`enforce.server.ts`):**

Siteverify error codes are classified into two categories:

| Category | Codes | Action |
|----------|-------|--------|
| Infrastructure (Cloudflare's fault) | `internal-error`, `http-error-5xx` | Allow (fail-open) |
| Security or our misconfiguration | `timeout-or-duplicate`, `invalid-input-response`, `http-error-4xx`, all others | Block (fail-closed) |

- `internal-error`: returned by Cloudflare or mapped locally when the siteverify fetch throws a network error or times out
- `http-error-5xx`: siteverify endpoint returned HTTP 5xx (CF-side outage)
- `http-error-4xx`: siteverify endpoint returned HTTP 4xx (our request was bad - wrong secret, malformed body). Fails closed so a misconfigured `TURNSTILE_SECRET_KEYS` cannot silently let bots through.
- `timeout-or-duplicate`: returned by Cloudflare when a token has already been verified (replay attack)
- `invalid-input-response`: returned by Cloudflare when the token is malformed or forged

**Client-side bypass (`TurnstileWidget`):**

The widget fires `onBypass` only when the Turnstile infrastructure is entirely unavailable:
- Script load failure (CDN unreachable or 5-second timeout)
- Widget render exception (e.g. `turnstile.render()` throws)

This unblocks the UI so shoppers are not permanently stuck when Cloudflare's CDN is down. The server independently detects the outage and makes its own allow/block decision.

`onBypass` does NOT fire for:
- Challenge errors (misconfigured site key) - widget resets up to 3 times then stops. Form stays gated. This is intentional: misconfiguration is a deployment issue that must be fixed, not silently degraded.
- Interactive challenge timeout - Cloudflare auto-resets the widget on its own schedule (`refresh-timeout: 'auto'`). Shopper may be idle; widget should remain available when they return.

**Removed: client-trusted `turnstileBypassed` form data field.** Previously, the client could send `turnstileBypassed=1` in form data to tell the server to skip verification. This was a security vulnerability; any bot could include this field. Replaced by server-side health detection.

**Unit test coverage (`src/lib/turnstile/`):**
- `health.server.test.ts`: CDN probe behavior, CDN-tier verdict, caching, in-flight refresh dedup, cold-start dedup, siteverify metrics tier, min-failure guard, hysteresis (full snapshot pinning at every transition and exact threshold boundaries), latency dimension, ring buffer integrity, metrics snapshot semantics (value-based assertions, no identity coupling), full state-machine transition matrix, temporal edge cases
- `health-integration.test.ts`: cross-module wiring: `verifyTurnstileToken` -> `recordSiteverifyOutcome` against the live (un-mocked) health module. Catches rename / refactor regressions the unit suites cannot see.
- `health-min-failure-guard.test.ts`: isolates the min-failure guard under a low `RATE_ENTER` env override; pins env-override range and non-numeric fallback behavior.
- `enforce.server.test.ts`: enforcement decisions, log enrichment, header/origin edge cases (Origin-vs-Referer precedence, x-forwarded-for first-hop trimming, cf-connecting-ip fallback, multi-hop addresses), http-error classification (5xx fail-open, 4xx fail-closed), exhaustive log-meta shape pinning per decision (every warn/debug call's complete meta asserted via `toEqual`), email redaction contract, config edge cases
- `verify.server.test.ts`: HTTP layer, outcome recording (rate, latency, edge cases, abort timer, exact wall-clock duration via fake timers), malformed-body handling (empty body, invalid JSON, non-array error-codes), action/challengeTs round-trip, remoteIp body-encoding
- `log-redact.server.test.ts`: `redactEmailForLog` contract: deterministic, case-insensitive on local-part, plaintext domain, malformed-input safety
- `utils.test.ts`: site-key / secret-key resolution, hostname extraction (incl. malformed URL fallback, protocol stripping, empty input), client-side null guard
- `constants.test.ts`: cookie name and TTL invariants

Coverage target: 100% statements / 100% branches / 100% functions / 100% lines on every production file in `src/lib/turnstile/`. Field-level value assertions (not just shape) on every log meta object and metrics snapshot. Snapshot tests compare values, never object identity, so the cache implementation can change without churning tests.

### Turnstile-WI-8: Cloudflare Status Page as Secondary Health Signal [removed in v7]

This work item added the Cloudflare Status Page API as a secondary health signal alongside the CDN probe. It has been removed in v7 of this spec.

**Why removed:** When we reviewed the implementation with Cloudflare's Turnstile team in May 2026 (see WI-9), they recommended siteverify failure-rate metrics as the primary health signal and the CDN probe as a secondary corroborating signal. They did not recommend the status page as a tertiary signal. Keeping it added test/code surface (an extra fetch path, separate TTL, separate state, ~14 unit tests) for narrow benefit: it would only influence the verdict when tier 1 had too few samples AND the CDN was healthy AND Cloudflare had publicly acknowledged the outage on their status page - a window in which tier 1 has typically already crossed the threshold by the time the status page updates.

The remaining `health.server.ts` design is two-tier (siteverify metrics → CDN probe). See WI-9 for the current design.

### Turnstile-WI-9: Cloudflare Guidance Alignment [done]

Apply corrections received from the Cloudflare Turnstile team in May 2026 to align the implementation with their recommended approach.

- [x] Siteverify call metrics are the primary health signal; CDN probe is the secondary/bootstrap signal (Cloudflare Status Page tier was removed in v7 - see WI-8)
- [x] Interactive challenge timeout is delegated to Cloudflare via `refresh-timeout: 'auto'` (no hardcoded duration)
- [x] Client `error-callback` captures the Cloudflare error code and classifies it (infrastructure / bot-detection / timeout / other)
- [x] Infrastructure-family widget errors trigger `onBypass` immediately (the iframe could not load); other families are retried up to the existing 3-reset cap
- [x] Type definitions for `window.turnstile.render()` include `error-callback(errorCode)`, `timeout-callback`, `before-interactive-callback`, `after-interactive-callback`, and `refresh-timeout`
- [x] `timeout-callback` is wired through `TurnstileWidget` as `onTimeout`, surfaced in checkout contact info as a soft "verification refreshed" hint so the shopper sees that the widget is being reset rather than getting silently stuck

#### Background (Cloudflare Q&A)

The Cloudflare Turnstile team confirmed the original architecture was sound and provided four corrections:

1. **`error-callback` does receive an error code** as its first parameter. The previous implementation declared it as no-arg.
2. **The undocumented ~120s interactive timeout should not be hardcoded** - it can change without notice. Use `refresh-timeout: 'auto'` (Cloudflare's documented self-managed schedule) instead of a manual `setTimeout`.
3. **`before-interactive-callback` and `after-interactive-callback` exist** (since 2023-04-17) but were missing from public TypeScript types - this is a "types gap" rather than a feature gap.
4. **CDN probe is not a perfect proxy for siteverify availability.** The static CDN and the siteverify API run on independent infrastructure and can fail independently. They recommend monitoring siteverify call outcomes directly as the primary signal, with the CDN probe as corroborating evidence.

#### Design

**Two-tier health detection (`health.server.ts`):**

1. **PRIMARY - siteverify metrics:** `recordSiteverifyOutcome(failed, durationMs)` is invoked from `verify.server.ts` after every siteverify request. The health module maintains a 60-second sliding window of outcomes (failure rate + p95 latency) in a fixed-capacity ring buffer with hysteresis. Once the window has at least 5 samples and at least 3 failures, this is the authoritative signal.
2. **SECONDARY - CDN probe:** HEAD probe to `challenges.cloudflare.com/turnstile/v0/api.js`, 60s cache with stale-while-revalidate. Used when tier 1 has too few samples (low-traffic instances, cold starts).

**Failure classification for tier-1 metrics:**

Only CF-side failures count toward the failure rate. Bot-detection failures (`invalid-input-response`, `timeout-or-duplicate`, etc.) reflect a working service and are recorded as non-failures.

| Outcome | Recorded as |
|---|---|
| `success: true` | non-failure |
| `error-codes: ['invalid-input-response']` (or other client-error codes) | non-failure |
| `error-codes: ['internal-error']` | failure |
| HTTP 5xx | failure |
| HTTP 4xx | non-failure (our request was bad, not CF-side) |
| Network error / timeout | failure |

**Client widget changes (`turnstile-widget.tsx`):**

- `error-callback: (errorCode: string) => void` - receives Cloudflare's error code
- `classifyTurnstileErrorCode(code)` returns `'infrastructure' | 'bot-detection' | 'timeout' | 'other'` based on the documented code families (200xxx/500xxx, 300xxx/600xxx, 110xxx, else)
- Infrastructure errors call `onBypass` immediately (iframe load issue means the user is stuck)
- Other errors fall through to the existing 3-reset cap before stopping
- `refresh-timeout: 'auto'` replaces the previous 120s `setTimeout` and the supporting `resolvedRef`/`startChallengeTimer`/`clearChallengeTimer` machinery
- `timeout-callback` exposed as `onTimeout` prop for parent use (e.g. soft "verification is refreshing" hint); CF auto-resets the widget so the shopper just retries.
- Script-load timer and "wait for window.turnstile" interval are tracked in effect-scoped variables and cleared by the cleanup, so a fast unmount during the 5s load window does not fire callbacks against a stale closure.

**Type changes (`use-turnstile.ts` global declaration):**

```typescript
'error-callback'?: (errorCode: string) => void;        // was: () => void
'timeout-callback'?: () => void;                       // newly typed
'before-interactive-callback'?: () => void;            // newly typed
'after-interactive-callback'?: () => void;             // newly typed
'refresh-timeout'?: 'auto' | 'manual' | 'never';      // newly typed
```

### Turnstile-WI-10: Surface server-side verification rejections to the shopper [done]

Previously, when the server's `enforceTurnstile` returned 403 (`code: NOT_AUTHORIZED`), the contact-info form silently absorbed the response - the OTP modal did not open, no error was shown, and the shopper was left with no feedback. This left legitimate shoppers stuck whenever a token failed server-side verification (replay, clock skew, transient bot signal, misconfigured key).

This work item aligns the form's UX with industry best practice (Cloudflare, Stripe Radar, Shopify Checkout): show a generic retry message, reset the widget so a fresh token is generated, cap auto-retries.

**Scope:** This work item covers both rejection paths:

1. **Server-side rejection** - widget produces a token, server's `enforceTurnstile` returns 403 NOT_AUTHORIZED (replay, clock skew, transient bot signal, misconfigured key). Form reads `fetcher.data.error.code === 'NOT_AUTHORIZED'` and surfaces the generic message.
2. **Widget-side rejection** - widget exhausts its 3-retry cap without producing a token (always-block sitekeys, genuine bot detection rejecting the client). The `TurnstileWidget` exposes a new `onRetryExhausted` callback that fires once when this happens; the form wires it to surface the same generic message via the same alert testid.

Both paths share copy, alert markup, and clear-on-focus behavior so the shopper sees a consistent UX regardless of which side rejected.

#### Acceptance criteria

**Server-side rejection path:**

- [x] When the action returns 403 with `code: NOT_AUTHORIZED`, the form renders a generic retry message below the email field (`role="alert"`, `data-testid="contact-info-verification-error"`).
- [x] The Turnstile widget is reset on server rejection so a fresh token can be generated on the next email blur.
- [x] After 3 consecutive `NOT_AUTHORIZED` responses on the same mount, the widget is no longer reset; the message still shows. This caps auto-retries against a misconfigured key or genuinely-blocked client.
- [x] Non-`NOT_AUTHORIZED` errors (e.g. `OPERATION_FAILED`, `REQUIRED_FIELD`) do NOT trigger the generic verification message - those have their own paths.

**Widget-side rejection path:**

- [x] `TurnstileWidget` exposes an `onRetryExhausted(errorCode, family)` callback that fires once per mount when 3 consecutive non-infrastructure `error-callback` invocations occur without a successful token. Resets when a successful token is later produced.
- [x] When `onRetryExhausted` fires, the form renders the same generic alert (same testid, same copy) as the server-rejection path.
- [x] Widget-side rejection is distinct from `onBypass` (infrastructure failure → fail open) and from a successful but server-rejected token (handled by the server-side path above).

**Shared:**

- [x] The message copy never references "Turnstile", "bot", "captcha", or specific error codes - it must not leak detection signals to attackers.
- [x] The error message is cleared when the shopper engages with the email field again (focus event).
- [x] Translation keys exist in all supported locales (`en-US`, `en-GB`, `it-IT`).

#### Design

**Component changes (`turnstile-widget.tsx`):**

- New `onRetryExhausted?: (errorCode: string, family: TurnstileErrorFamily) => void` prop.
- `error-callback` increments `errorResetCountRef` on each non-infrastructure error; resets the widget when below the cap and fires `onRetryExhausted` exactly once per mount when the cap (3) is reached.
- `hasRetryExhaustedRef` ensures the callback fires at most once per mount; reset to `false` on a successful token so a later failure on the same mount can re-trigger.

**Component changes (`contact-info.tsx`):**

- New `useEffect` watches the fetcher's `success === false && error?.code === 'NOT_AUTHORIZED'` transition; sets a generic message and (within retry cap) resets the widget. (Server-side rejection path.)
- New `handleTurnstileRetryExhausted` callback wired to the widget's `onRetryExhausted` prop sets the same message and clears `pendingEmailRef` so the form does not loop. (Widget-side rejection path.)
- New `useState<string | null>` holds the error message; rendered below the widget container.
- `handleEmailFocus` clears the error so a successful retry doesn't display alongside the prior failure.
- Retry counter is a `useRef` (no re-render on increment); cap is a module-level constant.

**Translation keys (`src/locales/<locale>/translations.json`):**

- `checkout.contactInfo.verificationFailed` - "We couldn't verify your information. Please try again." (en-US/en-GB) / "Non è stato possibile verificare le tue informazioni. Riprova." (it-IT)

**Why generic copy:** The action response carries the specific error code (`NOT_AUTHORIZED`) for callers that want to distinguish bot rejection from other failures (observability, e2e tests). The form maps it to a non-specific user message because exposing detection signals to attackers makes the bot protection trivially bypassable.

**Why reset + retry:** Cloudflare's UX guidance and mainstream e-commerce checkouts (Stripe Radar, Shopify Checkout) recommend retry-with-feedback over silent failure. The dominant cost in checkout is abandoned carts from frustrated humans, not bot fraud. Bot operators already know the site uses Turnstile (the widget is observable in DevTools); hiding the failure doesn't help, it just confuses real users whose challenge had a transient issue.

**Tests:**

- `contact-info.passwordless-otp.test.tsx` - 5 test cases for the server-side rejection path:
  - Generic verification-error alert renders for `NOT_AUTHORIZED`
  - No error renders on success
  - No error renders on `requiresLogin`
  - No error renders on non-Turnstile errors (e.g. `OPERATION_FAILED`)
  - Error clears when shopper focuses the email field again
- `contact-info.turnstile-retry-exhausted.test.tsx` - 3 test cases for the widget-side rejection path:
  - Generic verification-error alert renders when widget exhausts retries
  - The form passes `onRetryExhausted` through to the widget (regression guard)
  - Alert clears when shopper focuses the email field after retry exhaustion

## Design

This section covers cross-cutting design decisions that apply across all work items.

### Architecture

**Components:**
| Module | Purpose |
|--------|---------|
| `src/lib/turnstile/enforce.server.ts` | Shared server-side enforcement utility (single entry point for all protected endpoints) |
| `src/lib/turnstile/verify.server.ts` | Cloudflare siteverify API call |
| `src/lib/turnstile/health.server.ts` | Two-tier health detection: siteverify metrics (primary) + CDN probe (secondary/bootstrap) |
| `src/lib/turnstile/utils.ts` | Site key lookup, mode, and config helpers |
| `src/lib/turnstile/constants.ts` | Cookie name (`cc-tv`) and TTL constants |
| `src/lib/turnstile/log-redact.server.ts` | Email redaction helper (`redactEmailForLog`) used in fail-open log paths |
| `src/components/security/turnstile-widget.tsx` | Loads Cloudflare script, renders widget, manages token lifecycle, exposes `resetRef` and `executeRef` |

**Protected Endpoints:**
| Endpoint | Component | Enforcement |
|----------|-----------|-------------|
| `action.authorize-passwordless-email` | `contact-info.tsx` | Token required; sets `cc-tv_${siteId}` cookie on every response path where siteverify returned `success: true` (success or any SCAPI failure). Fail-open paths do not set the cookie. |
| `action.initiate-checkout-registration` | `register-customer-selection.tsx` | Token OR `cc-tv_${siteId}` cookie required; `enforceTurnstile` always called — HMAC short-circuit is internal. Sets `cc-tv_${siteId}` cookie on every response path when siteverify returned `success: true` on a fresh token. |
| `_empty.login.tsx` (server action) | `_empty.login.tsx` | Token required; sets `cc-tv_${siteId}` cookie when siteverify returned `success: true`. WI-10 parity: generic alert on server rejection, form gated. |

**Not protected by Turnstile (no `enforceTurnstile` call, `cc-tv_${siteId}` not required):**
- `action.otp-verify` / verify-passwordless-otp
- `action.otp-request`

The upstream Turnstile challenge at the email-entry step plus the OTP code itself are the controls for those steps.

### Cloudflare Siteverify API

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret=<SECRET_KEY>&response=<TOKEN>&remoteip=<IP>
```

**Response:**
```json
{
  "success": true|false,
  "challenge_ts": "2026-04-20T12:00:00.000Z",
  "hostname": "store.example.com",
  "error-codes": [],
  "action": "",
  "cdata": ""
}
```

### Configuration

**MRT Config (`config.server.ts`):**
```typescript
security: {
  turnstile: {
    sites: {},           // Parsed from PUBLIC__security__turnstile__sites env var
    enabled: true,
    mode: 'managed',     // 'managed' | 'non-interactive' | 'invisible'
    verification: { enabled: true }
  }
}
```

**Environment Variables:**
```bash
# Client-side (PUBLIC__ prefix, exposed to browser)
PUBLIC__security__turnstile__enabled=true
PUBLIC__security__turnstile__mode=managed
PUBLIC__security__turnstile__sites='{"prod":[{"siteKey":"YOUR_KEY","domains":["your-store.com"]}]}'

# Server-side (no PUBLIC__ prefix, never exposed to browser)
TURNSTILE_VERIFICATION_ENABLED=true
TURNSTILE_SECRET_KEYS={"YOUR_SITE_KEY":"YOUR_SECRET_KEY"}
TURNSTILE_CDN_PROBE_URL=https://challenges.cloudflare.com/turnstile/v0/api.js  # Optional override

# Health-detection thresholds (all optional; defaults match values in this spec).
# Out-of-range or non-numeric values fall back to defaults so a typo cannot disable
# the health signal entirely.
TURNSTILE_HEALTH_WINDOW_MS=60000          # sliding window length for tier-1 metrics
TURNSTILE_HEALTH_MIN_SAMPLES=5            # min samples before tier-1 verdict is authoritative
TURNSTILE_HEALTH_RING_CAPACITY=200        # max samples retained in memory
TURNSTILE_HEALTH_RATE_ENTER=0.5           # failure rate that flips healthy -> degraded
TURNSTILE_HEALTH_RATE_EXIT=0.3            # failure rate that flips degraded -> healthy
TURNSTILE_HEALTH_MIN_FAILURES=3           # absolute failure floor for rate-driven entry
TURNSTILE_HEALTH_LATENCY_P95_MS=3000      # p95 latency that flips healthy -> degraded
```

**Local development (`.env.default`):**
```bash
PUBLIC__security__turnstile__sites={"local-dev":[{"siteKey":"1x00000000000000000000BB","domains":["localhost","127.0.0.1"]}]}
```

### Token Flows

**Checkout contact info:**
1. Shopper blurs a valid email field → widget mounts (and in non-interactive mode `turnstile.execute()` runs)
2. Token stored in React state, `tokenConsumedRef` set to false
3. Token included in passwordless email request
4. `enforceTurnstile()` verifies token, `authorizePasswordless()` sends OTP
5. Server sets `cc-tv_${siteId}` httpOnly cookie (30min TTL)
6. `tokenConsumedRef` set to true (prevents reuse without reset)
7. If email changes: `resetTurnstile()` called → effect calls `execute()` → fresh token generated
8. After retry exhaustion, re-focusing email remounts a fresh widget (recovery; first show remains blur)

**Checkout registration:**
1. Shopper checks "Save for faster checkout" checkbox
2. Widget always mounts when Turnstile is enabled; the server cookie alone decides whether to skip re-verification
3. The server always calls `enforceTurnstile`. If `cc-tv_${siteId}` is present and its HMAC matches, `enforceTurnstile` short-circuits internally without a fresh siteverify call; no second token is required
4. Otherwise: widget-generated token sent with request, server calls `enforceTurnstile`, sets `cc-tv_${siteId}` cookie on every response path where siteverify returned `success: true`

### Server Logging

| Log Message | Level | Meaning |
|-------------|-------|---------|
| `[Turnstile] No Origin or Referer header` | warn | Cannot determine site key (check reverse-proxy config) |
| `[Turnstile] No site key match for request origin` | warn | Origin doesn't match any configured domain |
| `[Turnstile] No secret key configured for site` | warn | Site key found but no matching secret |
| `[Turnstile] Missing token - allowed (Turnstile platform degraded)` | warn | CDN down, fail-open |
| `[Turnstile] Missing token - blocked` | warn | CDN healthy, bot bypassed widget |
| `[Turnstile] Verification failed due to infrastructure issue - allowed` | warn | `internal-error` or `http-error-5xx`, fail-open |
| `[Turnstile] Verification failed - potential bot or replay attack` | warn | Invalid/replayed token, blocked |

All warn logs include: `remoteIp`, `userAgent`, `email`, `action`. The `email` field is redacted to `<sha256-prefix>@domain` (8-char hash of the lowercased local-part, plaintext domain) so fail-open at scale during a CF outage does not accumulate raw PII while still letting operators correlate per-shopper events. Implemented in `log-redact.server.ts`.

### Request Format

```typescript
{
  email: string;
  turnstileToken: string  // Required when verification enabled (absent during CDN outage)
}
```

## Testing

**Unit Tests:** see the "Unit test coverage" block under WI-7 for the full per-file breakdown. In addition to the `src/lib/turnstile/` suite, route-level tests (`src/routes/action.authorize-passwordless-email.test.ts`, `src/routes/action.initiate-checkout-registration.test.ts`) cover the integration between server actions and `enforceTurnstile` with Turnstile mocks.

**E2E Tests:** `e2e/src/specs/core/checkout-turnstile.spec.ts`

**Client-side tests (Turnstile-WI-1):**
| Test | Key | Validates |
|------|-----|-----------|
| Script loading | `1x00000000000000000000BB` | CDN load, API, widget DOM |
| Token generation | `1x00000000000000000000BB` | Token in request |
| Graceful degradation | `1x00000000000000000000BB` | Form works, no errors |
| Error handling | `2x00000000000000000000BB` | Challenge fails, form works |
| Managed mode | `1x00000000000000000000AA` | Widget container exists |
| Interactive challenge | `3x00000000000000000000FF` | Widget container exists |

**Server-side tests (Turnstile-WI-2):**
| Test | Secret Key | Validates |
|------|-----------|-----------|
| Valid token (always-pass) | `1x0000000000000000000000000000000AA` | Request passes verification |
| Invalid token (always-fails) | `2x0000000000000000000000000000000AA` | Request rejected with 403 |
| Token already spent | `3x0000000000000000000000000000000AA` | Replay attack blocked |
| Interactive challenge blocks | `3x00000000000000000000FF` | Form blocked until solved |

**Run (local only — CI never selects `@turnstile`):**

```bash
# Terminal 1 — storefront app with Turnstile + passwordless prefs in packages/template/.env:
#   PUBLIC__app__security__turnstile__enabled=true
#   PUBLIC__app__security__turnstile__sites=… (localhost site key)
#   TURNSTILE_VERIFICATION_ENABLED=true + TURNSTILE_SECRET_KEYS map for all test keys
#   MRT_DATA_STORE_DEFAULTS=…emailVerificationEnabled:true…  (passwordless /login UI)
pnpm dev                 # restart after changing MRT_DATA_STORE_DEFAULTS

# Terminal 2 — from packages/template (or e2e/):
unset CI                 # CI=true/1 refused; do NOT set CI=false in e2e/.env (truthy string)
pnpm e2e:turnstile       # greps @turnstile; clears local CI sentinels before spawn
```

**Login-page Turnstile** needs passwordless enabled: seed `MRT_DATA_STORE_DEFAULTS` with `<siteId>-login-preferences` → `{ "data": { "emailVerificationEnabled": true } }` (see test plan / README-TURNSTILE). Without it, `/login` shows email/password only.

Per-test Cloudflare keys use `overrideTurnstileConfig(...)`, not multiple tags. Continue stays gated (WI-10) until the challenge yields a token.

**Test Site Keys (client):**

Note: the widget mounts with `appearance: 'interaction-only'`, so the only sitekey that produces visible UI is `3x...FF`. All other test keys (pass and block alike) operate via a hidden iframe and produce no visible UI.

- `1x00000000000000000000BB` - Non-interactive, always passes (no visible UI)
- `2x00000000000000000000BB` - Non-interactive, always fails (no visible UI; widget retries then form submits without token)
- `1x00000000000000000000AA` - Managed, always passes (no visible UI)
- `2x00000000000000000000AB` - Managed, always blocks (no visible UI; same retry/submit behavior as 2x...BB)
- `3x00000000000000000000FF` - Managed, forces interactive challenge (visible challenge UI)

**Test Secret Keys (server):**
- `1x0000000000000000000000000000000AA` - Always passes
- `2x0000000000000000000000000000000AA` - Always fails
- `3x0000000000000000000000000000000AA` - Token already spent

**For manual visible-UI testing**, see the manual test plan in `docs/README-TURNSTILE.md#manual-test-plan`. The recommended starting combo is `3x00000000000000000000FF` + `1x0000000000000000000000000000000AA`.

Source: [Cloudflare Turnstile Testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

## Production Deployment

1. **Get production site key + secret key** from Cloudflare Dashboard
2. **Set client config** in MRT Runtime Admin: `PUBLIC__security__turnstile__sites` with your production domains
3. **Set server secrets** in MRT Runtime Admin: `TURNSTILE_SECRET_KEYS` and `TURNSTILE_VERIFICATION_ENABLED=true`
4. **Do NOT hardcode test keys** in `config.server.ts`; the default is `{}` (fail-closed). Test keys belong only in `.env.default` for local development.
5. **Deploy**: Frontend widget and server verification active immediately on all three endpoints
6. **Monitor**: Watch MRT logs for `[Turnstile]` warn entries to detect attacks and misconfigurations

## Documentation

- **Feature Spec:** `e2e/feature-specs/checkout/turnstile-protection.spec.md`
- **Test Plan:** `e2e/test-plans/turnstile-test-plan.md`
- **E2E Tests:** `e2e/src/specs/core/checkout-turnstile.spec.ts`

## Open Questions (Cloudflare)

Resolved with Cloudflare team on 2026-05-08 (see WI-9 for the implementation changes).

| # | Question | Cloudflare's answer | Implementation |
|---|----------|---------------------|----------------|
| 1 | Is the ~120s interactive challenge lifetime intentional and stable? Is there a supported callback or config to detect/extend it? | The duration is undocumented and may change. Use `refresh-timeout: 'auto'` for Cloudflare-managed reset, plus the documented `timeout-callback` for any UI hint. `before-interactive-callback` / `after-interactive-callback` also exist but were missing from public types. | Replaced 120s manual timer with `refresh-timeout: 'auto'` (WI-9). |
| 2 | Can a sustained `internal-error` from siteverify be distinguished from a legitimate Cloudflare outage vs. a targeted attack? | `internal-error` is the only siteverify code that signals CF-side failure. There is no separate "outage" code distinct from "service error". | Continue to treat `internal-error` and HTTP 5xx as fail-open triggers. Sustained-attack mitigation is observability-driven (alert on elevated `internal-error` rate). |
| 3 | Is there a dedicated Turnstile health API or webhook, or is the public status page (`cloudflarestatus.com`) the recommended signal? | No dedicated health API. Recommended: monitor your own siteverify call outcomes as the primary signal, with the CDN probe as the corroborating secondary signal. (The status page was not endorsed.) | Two-tier health design: siteverify metrics → CDN probe (WI-9). The previously-implemented status page tier was removed in v7. |

## References

- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Test Keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [SCAPI Passwordless Login](https://developer.salesforce.com/docs/commerce/commerce-api/)
