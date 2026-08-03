# Cloudflare Turnstile Integration

Bot protection for the storefront's passwordless-login and checkout-registration endpoints. The implementation is BFF-verified, fail-open, and uses a two-tier health signal so legitimate shoppers are never blocked when Cloudflare itself is degraded.

> **Feature spec:** [`e2e/feature-specs/checkout/turnstile-protection.spec.md`](../e2e/feature-specs/checkout/turnstile-protection.spec.md) - acceptance criteria, work items (WI-1 through WI-9), and the per-scenario error-handling matrix.
>
> This document captures the architecture, contracts, and operational concerns. The spec captures the per-feature acceptance criteria.

## Goals

1. Protect passwordless-login and checkout-registration endpoints from automated abuse without adding friction for legitimate shoppers.
2. **Never block a legitimate shopper because Cloudflare is having a bad day.** Cloudflare/Turnstile outages must degrade gracefully (fail-open).
3. Defense in depth: the client widget is convenient but not trusted; the BFF independently verifies every token via Cloudflare's siteverify endpoint.
4. Make the pieces individually testable and observable.

## Architecture

Three layers, each independently testable:

```
┌─ Client (browser) ──────────────────────────────────────────────┐
│  TurnstileWidget       loads challenges.cloudflare.com/api.js   │
│        │               renders widget, captures token            │
│        ▼                                                         │
│  Form submission       includes turnstileToken in form data     │
└────────┬─────────────────────────────────────────────────────────┘
         │ POST /action/<protected-endpoint>
         ▼
┌─ BFF (MRT serverless Node.js) ──────────────────────────────────┐
│  enforceTurnstile()    single entry point used by every         │
│        │               protected action                          │
│        ▼                                                         │
│  verifyTurnstileToken  POSTs siteverify with token + secret;    │
│        │               records outcome in health metrics         │
│        ▼                                                         │
│  isTurnstileDegraded   two-tier health signal (see below)       │
│        │                                                         │
│        ▼                                                         │
│  Allow / block         decision logged; on success sets the     │
│                        `cc-tv_${siteId}` cookie so subsequent OTP │
│                        steps in the same session can skip the   │
│                        widget                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Modules

| File | Responsibility |
|---|---|
| `src/components/security/turnstile-widget.tsx` | Loads CF script, renders widget, manages token lifecycle, classifies error codes, exposes `onSuccess`/`onError`/`onExpire`/`onBypass` and imperative `resetRef`/`executeRef`. |
| `src/components/security/turnstile-error-codes.ts` | `TURNSTILE_ERROR_FAMILY` and `classifyTurnstileErrorCode()` - maps Cloudflare error codes to families (infrastructure / bot-detection / timeout / other). Lives in its own file so the widget stays component-only (Vite fast-refresh constraint). |
| `src/hooks/use-turnstile.ts` | Older imperative hook + global `window.turnstile` types. Most callers use `TurnstileWidget`. |
| `src/lib/turnstile/enforce.server.ts` | Single server entry point used by every protected action. Decides allow/block based on token + health signal. |
| `src/lib/turnstile/cookie-match.server.ts` | HMAC cookie↔email match helpers (`isTurnstileSessionVerifiedForEmail`) shared by enforce + the session resource. |
| `src/lib/turnstile/check-session.ts` | Client helper that calls `/resource/turnstile-session` on email blur for UI suppress. |
| `src/routes/resource.turnstile-session.ts` | BFF resource: `{ verified }` for cookie↔email match only (no directory lookup). |
| `src/lib/turnstile/verify.server.ts` | Cloudflare siteverify HTTP call. Records every outcome in health metrics. |
| `src/lib/turnstile/health.server.ts` | Two-tier health detection (siteverify metrics → CDN probe). Maintains in-memory cache and the sliding-window metric. |
| `src/lib/turnstile/utils.ts` | Site-key lookup by request origin; secret-key retrieval from env; mode/enabled helpers. |
| `src/lib/turnstile/constants.ts` | Cookie base name (`cc-tv`) and TTL (30 minutes). The cookie is written as `cc-tv_${siteId}` (site-namespaced) so multi-site deployments can't share attestations across sites. |

### Enforcement points

Three call sites use `enforceTurnstile`:

| Endpoint | File | Purpose | Sets `cc-tv_${siteId}` cookie? |
|---|---|---|---|
| `action.authorize-passwordless-email` | `src/routes/action.authorize-passwordless-email.ts` | Initial email entry at checkout (sends OTP) | Yes - when siteverify returned `success: true` |
| `action.initiate-checkout-registration` | `src/routes/action.initiate-checkout-registration.ts` | Account creation during checkout | Yes - when siteverify returned `success: true` |
| Login page (passwordless submit and OTP resend) | `src/routes/_empty.login.tsx` | Standalone /login flow and OTP resend. WI-10 parity: generic alert shown on server rejection, form gated until challenge resolves. | Yes - when siteverify returned `success: true` |

`action.otp-verify` (verify-passwordless-otp) and `action.otp-request` do **not** call `enforceTurnstile` and do **not** require `cc-tv_${siteId}`. The upstream Turnstile challenge at the email-entry step plus the OTP code itself are the controls for those steps.

### Provider tree (where state lives)

The widget mounts inside the route component (e.g., `contact-info.tsx`) and stores its token in local React state. The token is included in the form submission as `turnstileToken`. There is no provider/context for Turnstile state - each protected form manages its own widget instance and token.

## End-to-end flow

Walk through what happens from page render to a verified login. Times are illustrative (warm caches, healthy network).

### Step 1: Page renders; widget mounts on email blur

1. Shopper navigates to a protected step (e.g. checkout contact info, or `/login`).
2. The route component reads `config.security.turnstile` and resolves a site key for the current hostname via `getTurnstileSiteKey(config, baseUrl)`.
3. If Turnstile is disabled or no site key matches, the widget never mounts and the form behaves normally.
4. Otherwise the form defers mounting until the shopper blurs a valid email field. On blur the client calls `GET /resource/turnstile-session?email=…`, which returns `{ verified }` for whether this request's httpOnly `cc-tv_*` cookie HMAC-matches that email. If `verified: true`, the widget is **not** mounted and the form treats the shopper as session-verified for UI gating (`turnstileSessionVerified`). If not verified, `<TurnstileWidget … />` mounts. Focus alone does not mount the widget; after retry exhaustion, re-focusing email remounts a fresh challenge for recovery. Submit stays disabled while a token is pending (`turnstilePending = enabled && siteKey && (checking || (!token && !bypassed && !sessionVerified))`).

### Step 2: Cloudflare script loads (browser)

1. The widget injects `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>` into `<head>` (or reuses the existing one if already injected by another widget on the page).
2. A 5-second load timeout is armed. If the script does not load in time:
   - `onBypass` fires.
   - The parent form un-disables the submit button (`turnstileBypassed = true`).
   - The shopper can submit without a token. The server will independently detect the CDN outage via the two-tier health signal and either fail-open or fail-closed accordingly.
3. On `script.onload`, the widget calls `window.turnstile.render(container, {...})` with the configured site key and callbacks.

### Step 3: Challenge runs (browser ↔ Cloudflare)

1. The Turnstile script connects to Cloudflare and runs its bot/human checks. In `managed` mode (the default), Cloudflare decides per request whether to show the visible "Verify you are human" checkbox or run silently in the background.
2. When the challenge succeeds, Cloudflare invokes the widget's `callback` with a single-use token (a long opaque string starting with `XXXX.DUMMY...` for test keys, or a real signed token in production).
3. The widget's `callback` updates React state via `setTurnstileToken(token)` and enables the submit button.
4. The submit button enables.

If anything goes wrong client-side:
- `error-callback(errorCode)` fires with one of Cloudflare's documented codes. The widget classifies the family (infrastructure / bot-detection / timeout / other) and either calls `onBypass` (infrastructure) or resets the widget (others, capped at 3 retries).
- `expired-callback` fires after Cloudflare's documented token TTL (~5 minutes) elapses without a submit. The widget clears the token and the parent re-renders the challenge.

### Step 4: Form submission (browser → BFF)

1. Shopper clicks "Submit" or tabs out of the email field.
2. The form serializes its data including the hidden `turnstileToken` field.
3. POST to the protected action route, e.g. `POST /action/authorize-passwordless-email`, body = `email=...&turnstileToken=XXXX.DUMMY...`.
4. The request hits the MRT-deployed BFF.

### Step 5: BFF enforcement (`enforceTurnstile`)

The action handler calls `enforceTurnstile({ request, config, turnstileToken, logger, actionName, email })`. Decision tree (each step short-circuits if it can decide):

```
1. Is turnstile.enabled and verification.enabled?     no → ALLOW (debug log)
2. Has the request an Origin/Referer?                  no → BLOCK (warn: missing origin)
3. Is there a site-key match for the hostname?         no → BLOCK (warn: no site-key match)
4. Is there a secret-key configured for that site?     no → BLOCK (warn: misconfiguration)
5. Is the turnstileToken present?                      no →
     a. isTurnstileDegraded()?                         yes → ALLOW (warn: fail-open, no token + degraded)
     b. otherwise                                       → BLOCK (warn: missing token, healthy)
6. Call verifyTurnstileToken(token, secret, remoteIp)
     a. success=true                                    → ALLOW (debug)
     b. errorCodes contains internal-error or http-5xx  → ALLOW (warn: fail-open, infra error)
     c. anything else                                   → BLOCK (warn: bot/replay)
```

The remoteIp passed to siteverify is read from `x-forwarded-for` (first hop) or `cf-connecting-ip`, never from the request socket directly (MRT sits behind a CDN).

### Step 6: Server → Cloudflare siteverify (BFF → Cloudflare)

When step 5.6 runs:

1. `verifyTurnstileToken` sends `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `Content-Type: application/x-www-form-urlencoded` and body `secret=<server-secret>&response=<token>&remoteip=<shopperIp>`.
2. A 5-second timeout is enforced via `AbortController`. If the call times out or throws, the function records `recordSiteverifyOutcome(true)` (counts as a CF-side failure for tier 1) and returns `{ success: false, errorCodes: ['internal-error'] }`.
3. On HTTP response:
   - **5xx** → `recordSiteverifyOutcome(true)`, return `{ success: false, errorCodes: ['http-error-<status>'] }`.
   - **4xx** → `recordSiteverifyOutcome(false)` (4xx means our request was bad - bad secret, malformed body - not a CF outage), return `http-error-<status>`.
   - **2xx** → parse JSON body. Cloudflare returns `{ success: bool, challenge_ts, hostname, "error-codes": [...], action }`. Record the outcome as a failure only if `error-codes` contains `internal-error`. Return the structured result.

What Cloudflare validates inside siteverify (we don't see the internals, but per their docs):
- Token signature is valid.
- Token has not been redeemed before (single-use).
- Token has not expired (~5 minute TTL from issuance).
- Token's hostname/site-key matches the secret being presented.
- The `remoteip` (if supplied) is consistent with the issuance.

### Step 7: BFF → response (BFF → browser)

If `enforceTurnstile` returned `true` **and** the result was a successful Cloudflare siteverify call (`success: true`):
- The action sets a `Set-Cookie: cc-tv_${siteId}=<hmac>; Max-Age=1800; HttpOnly; Secure; SameSite=Lax` header. The value is an HMAC-SHA-256 hex string (64 characters) computed as `hmac_sha256(derivedKey, siteKey + ':' + normalizedEmail)`, where `siteKey` is the Cloudflare public site key (distinct from the storefront `siteId` used in the cookie name). This binds the attestation to this shopper's email and the specific Cloudflare key in use. The cookie is attached to **every** response path on this request: success, 400, 404, 5xx, generic 500. The cookie attests that the client cleared the Turnstile gate, which has nothing to do with how SCAPI later decides about the email or account.
- **Fail-open paths do NOT issue the cookie.** When `enforceTurnstile` allows the request without a siteverify call — either because the token was missing while Cloudflare was degraded, or because siteverify returned an infrastructure error (`internal-error`, `http-error-5xx`) — no `cc-tv_${siteId}` cookie is emitted. Only a successful siteverify (`passed`) yields a cookie.
- When the request was already covered by a valid HMAC-bound cookie (short-circuit path), `enforceTurnstile` returns `cookieValue: null`. No new cookie is emitted; there is nothing new to record.
- The action proceeds with its real work (e.g. SLAS `authorizePasswordless` for the email step) and returns the response (with the cookie attached when applicable).

If `enforceTurnstile` returned `false`:
- The action returns HTTP 403 with `{ success: false, error: { code: 'NOT_AUTHORIZED', message: 'Turnstile verification failed' } }`.
- No cookie is set. The browser-side form re-renders the widget so the shopper can try again.

### Step 8: Subsequent steps in the same session

For the remainder of the 30-minute `cc-tv_${siteId}` cookie lifetime, the shopper can interact with related actions (registration submit) without re-rendering the widget. **Every protected action always calls `enforceTurnstile`**; the HMAC short-circuit lives inside it. When the cookie is present and its HMAC value matches the current email + Cloudflare site key, `enforceTurnstile` short-circuits and returns `{ allowed: true, cookieValue: null }` without making a fresh siteverify call. When `cookieValue` is null the caller skips the Set-Cookie header (nothing new to record).

Note: `action.otp-verify` and `action.otp-request` are **not** on the protected-action list — they never call `enforceTurnstile` and do not check for `cc-tv_${siteId}`. The OTP code itself plus the upstream challenge are the controls for those steps.

This avoids forcing a Turnstile widget on every checkout step, which would be unacceptable friction.

### Failure paths summary

| What fails | Where it's caught | Shopper experience |
|---|---|---|
| CF script never loads | Browser 5s timeout → `onBypass` | Form unblocks immediately. BFF detects degradation independently and fails-open if appropriate. |
| CF script loads but challenge errors (200xxx/500xxx) | Widget classifies as `infrastructure` → `onBypass` | Form unblocks. Same BFF path as above. |
| CF script loads but challenge errors (300xxx/600xxx) | Widget classifies as `bot-detection` → reset (up to 3x) | Shopper sees "challenge failed, please try again" UX (or implicit retry). After 3 fails, form stays gated. |
| CF challenge interactive timeout | Cloudflare auto-resets the widget (`refresh-timeout: 'auto'`) | Shopper sees a fresh challenge. No callback fires; the widget just resets. |
| BFF cannot reach siteverify (5xx/timeout/network) | `verifyTurnstileToken` returns `internal-error` → `enforceTurnstile` fails-open | Login proceeds. Warn log emitted. Tier-1 metric records the failure. |
| siteverify returns `invalid-input-response` | `enforceTurnstile` blocks | 403 response. Browser re-renders the widget for retry. |
| siteverify returns `timeout-or-duplicate` | `enforceTurnstile` blocks | 403 response. Token already used (replay) - fresh challenge required. |
| Tier-1 failure rate exceeds 50% over the window | `isTurnstileDegraded` returns true | All requests with missing tokens fail-open. Pre-existing tokens still attempt verify (and may pass), but missing-token paths are unblocked. |

## Why fail-open

Bot protection that breaks legitimate shoppers when the protection service has an outage is worse than no bot protection at all - the cost of one false-block at checkout is a lost order; the cost of one missed bot is a fraction of a cent. We optimize for shopper experience under failure.

The fail-open path is exercised by:
- siteverify network failures or HTTP 5xx
- siteverify returning `error-codes: ['internal-error']`
- Sustained elevated siteverify failure rate (the tier-1 signal, see below)
- CDN probe failure
- Client script load timeout (5s) - widget fires `onBypass`; server independently confirms degradation

The fail-CLOSED path covers genuine bot signals:
- `invalid-input-response` (token malformed or forged)
- `timeout-or-duplicate` (token replayed)
- Missing token while Cloudflare appears healthy
- Origin/Referer mismatch (no site key match)
- Misconfigured site key (after the 3-retry cap, the form stays gated)

Every fail-open decision is logged at `warn` level with action, IP, user-agent, and email so a sustained attack triggering `internal-error` is observable in logs and can be alerted on.

## Client widget design

`TurnstileWidget` is a thin wrapper around Cloudflare's `turnstile.render()`. Notable behaviors:

### Modes

The widget supports the three documented Turnstile modes via the `mode` prop:

| Mode | Cloudflare semantics | Use case |
|---|---|---|
| `managed` (default) | Cloudflare picks interactive vs invisible per request | Most flows |
| `non-interactive` | Always invisible; widget runs `execute()` instead of `render()` | When you want zero-friction unless the script signals required challenge |
| `invisible` | Widget shows nothing, runs in background | When even the visual "verifying..." UI is undesirable |

### Error classification

`error-callback: (errorCode) => ...` receives Cloudflare's documented error code. The widget classifies it into four families via `classifyTurnstileErrorCode`:

| Family | Codes | Widget action |
|---|---|---|
| `infrastructure` | `200xxx`, `500xxx` | Fire `onBypass` immediately - the iframe could not load. Server's tier-1/2/3 signal will independently confirm the outage. |
| `bot-detection` | `300xxx`, `600xxx` | Reset the widget (up to 3x cap), let the shopper try again. |
| `timeout` | `110xxx` | Reset the widget. (`refresh-timeout: 'auto'` typically handles this without us seeing the callback.) |
| `other` | anything else | Reset the widget (up to cap). |

The classified family is also passed to the parent's `onError(errorCode, family)` callback, so consumers can drive differentiated UX (e.g., show "service unavailable" vs "challenge failed - please try again") if desired.

### Cloudflare-managed challenge timeouts

The widget passes `'refresh-timeout': 'auto'` so Cloudflare resets the challenge on its own documented schedule when interactive challenges time out. The exact duration is intentionally undocumented by Cloudflare and may change without notice; we delegate to their schedule rather than hardcoding a value.

### Bypass surface

`onBypass` fires only when the widget cannot operate at all:
- Script load timeout (5s)
- Script onerror (CDN unreachable)
- `turnstile.render()` exception
- Infrastructure-family error code (`200xxx`/`500xxx`)

`onBypass` does NOT fire for:
- Bot-detection failures (`300xxx`/`600xxx`) - widget retries up to 3x then stops with form gated. A determined bot or a misconfigured site key should not silently degrade to "no protection."
- Interactive challenge timeouts - Cloudflare auto-resets the widget on its own schedule; the shopper can re-engage when they return.

### Important: client cannot signal bypass to server

There is no client-side mechanism to tell the server to skip verification. Earlier iterations included a `turnstileBypassed=1` form-data flag, which was removed because **any bot can include the field**. The server's allow/block decision uses only its own health signal, never client-supplied flags.

### Imperative reset / execute

The widget exposes `resetRef` and `executeRef` props (mutable refs). Parents that need to:
- **Force a fresh challenge** (e.g., after a failed login attempt): call `resetRef.current?.()`.
- **Trigger an invisible-mode challenge**: call `executeRef.current?.()` (only meaningful when `mode='non-interactive'`).

## Server enforcement design (`enforceTurnstile`)

Single function called by every protected action. Decision flow:

1. **Skip if disabled.** If `config.security.turnstile.enabled` or `config.security.turnstile.verification.enabled` is false, return `true` immediately. This makes the gate trivially toggleable per environment.
2. **Resolve site key from origin.** Reads `Origin` or `Referer` header → looks up matching site key via `getTurnstileSiteKey(config, requestUrl)`. No match → block (with warn log).
3. **Resolve secret key from env.** `getTurnstileSecretKey(siteKey)` reads `TURNSTILE_SECRET_KEYS` JSON. No secret configured → block (deployment error).
4. **Handle missing token.** If `turnstileToken` is undefined:
   - Check `isTurnstileDegraded()`. If degraded → allow (fail-open) with warn log including action, IP, user-agent, email.
   - If healthy → block (no token + healthy CF = bot).
5. **Verify token.** Call `verifyTurnstileToken({ token, secretKey, remoteIp })`. Outcome is recorded in the health metric (see below) regardless of allow/block.
6. **Classify failures.**
   - Infrastructure errors (`internal-error`, `http-error-5xx`) → allow (fail-open), warn log.
   - All other failures (including `http-error-4xx`) → block, warn log including the error codes.
7. **Allow** on success with debug log.

### Cookie-based session reuse (`cc-tv_${siteId}`)

After a fresh siteverify pass (`success: true`), the action sets a 30-minute httpOnly cookie named `cc-tv_${siteId}` (site-namespaced via `getCookieNameWithSiteId`). The value is `hmac_sha256(derivedKey, siteKey + ':' + normalizedEmail)`: a 64-character hex string where `siteKey` is the Cloudflare public site key (not the storefront `siteId` in the cookie name). This binds the attestation to this shopper's email and the specific Cloudflare key in use — a different site key means a different HMAC. On the next request, `enforceTurnstile` reads the cookie and calls `crypto.timingSafeEqual` against the expected HMAC; if it matches, verification is skipped. On email mismatch the request falls through to a fresh siteverify call rather than being rejected, so changing the email address doesn't block checkout.

**UI suppress (same cookie):** Because `cc-tv_*` is httpOnly, the client cannot read it. On email blur, checkout contact-info and passwordless login call `GET /resource/turnstile-session?email=…`, which uses the same HMAC match helper (`isTurnstileSessionVerifiedForEmail`) and returns only `{ verified: boolean }` for *this request's cookie vs this email* (no customer-directory lookup — anti-enumeration). When `verified` is true the widget stays unmounted and Continue/submit is not gated; changing to an email that does not match remounts the widget on the next blur. This is UX only — every protected action still calls `enforceTurnstile`.

Why: forcing a Turnstile widget on every checkout step would be extremely friction-heavy. The cookie functions as a session-scoped proof-of-humanity, with the same TTL (30 min) as a typical SLAS session.

The cookie is httpOnly (no JS access), Secure, and SameSite-Lax. It is never trusted across origins.

#### When the cookie is set

The cookie is set on **every response path** where `enforceTurnstile` performed a successful siteverify call (`success: true`) on the current request (success, 400, 404, 5xx, generic 500), not only on the success path of the gated business action.

**Fail-open allow paths do not set the cookie.** When `enforceTurnstile` allows without a siteverify call — missing token while Cloudflare was degraded, or siteverify returning `internal-error` / `http-error-5xx` — no cookie is emitted. The fail-open path attests nothing about whether this client passed a challenge; only a verified `success: true` from Cloudflare produces a cookie.

The reason is the cookie's semantics. The cookie attests "this client passed a Cloudflare siteverify check." Once siteverify returned `success: true`, the client cleared the Turnstile gate regardless of what SLAS later says about the email or account. None of that changes based on whether SLAS later returns 200, 400, 404, or 5xx. SCAPI's verdict is about the email or the account, not about whether the client is a bot.

If we conditioned the cookie on SCAPI success, every legitimate shopper who typed an unrecognized email or hit a transient SLAS upstream blip on their first attempt would be forced through a fresh Turnstile challenge on the next protected endpoint. That punishes real shoppers for events that have nothing to do with bot detection. Bot-mitigation TTL is the cookie's `Max-Age`, not the boolean of SCAPI-success.

Paths that do NOT set the cookie:
- `enforceTurnstile` rejected the request (returning HTTP 403) — gate said no.
- Fail-open allow: missing token while Cloudflare was degraded, or siteverify returned `internal-error` / `http-error-5xx` — no challenge was actually verified.
- Short-circuit path: valid HMAC-bound cookie already present — `enforceTurnstile` returns `cookieValue: null`; nothing new to record.

## Two-tier health signal

Two tiers, evaluated in priority order. Either tier indicating degraded triggers fail-open. The reason for two: the siteverify failure rate directly measures the dependency we use, but only once enough traffic has flowed through the instance to be statistically meaningful. The CDN probe is fast but only proves the static CDN is up (which can be independent of the siteverify API), so it serves as a bootstrap signal when the metrics window has too few samples.

### Tier 1 - Siteverify metrics (PRIMARY)

`verify.server.ts` calls `recordSiteverifyOutcome(failed, durationMs)` after every siteverify request. The health module maintains a 60-second sliding window of outcomes in a fixed-size ring buffer.

#### Sample shape

Each sample carries three fields:

| Field | Meaning |
|---|---|
| `timestamp` | When the call completed (ms since epoch) |
| `failed` | Whether the call indicates a CF-side failure (see classification below) |
| `durationMs` | Wall-clock duration of the call |

#### Failure classification

What counts as `failed=true`:
- Network error / fetch timeout
- HTTP 5xx response
- Body returned `error-codes: ['internal-error']`

What does NOT count as a failure (`failed=false`):
- Successful verify (`success: true`)
- HTTP 4xx (our request was bad - missing secret, etc.)
- `invalid-input-response`, `timeout-or-duplicate`, and other client-error codes (these reflect a working service correctly rejecting a bad token)

#### Two independent degradation conditions

The window produces a degraded verdict if EITHER condition holds (after meeting the minimum-samples and minimum-failures gates described below):

1. **Failure-rate dimension** - failure count / sample count crosses a threshold. Detects outright outages.
2. **Latency dimension** - p95 of `durationMs` over the window crosses a threshold. Detects "slow but not failed" degradation that wouldn't trip the rate signal until calls actually time out.

#### Hysteresis (separate enter and exit thresholds)

A single threshold causes flap when the rate hovers near it. The window uses different thresholds depending on the current verdict:

| Transition | Failure rate | p95 latency |
|---|---|---|
| Healthy → degraded (ENTER) | ≥ 50% | ≥ 3000ms |
| Degraded → healthy (EXIT) | < 30% | < 3000ms |

To exit degraded, BOTH dimensions must clear their respective thresholds. Either dimension still breaching keeps the verdict degraded.

#### Min-sample and min-failure gates

To avoid making a verdict on too little data:

- **Minimum samples** to be authoritative: **5**. Below this, tier 1 returns "unknown" and the lower tiers decide.
- **Minimum absolute failure count** to trigger ENTER: **3**. This stops the boundary case where 1-of-2 samples failing (50%) would otherwise flip the verdict.

#### What "stay degraded" looks like

Once degraded, the window's verdict is sticky. Even if the sample count drops below 5 (e.g. traffic ebbs), the verdict stays `true` rather than flipping to "unknown" - this prevents a brief lull from masking an ongoing outage. Recovery requires an explicit EXIT condition over enough samples.

#### Storage: ring buffer (per-instance)

Samples live in a fixed-capacity ring buffer (200 slots) with `head` and `count` pointers. New samples append in O(1); pruning by age advances `head` and decrements `count` in O(k) where k is the number of expired samples. No per-call array allocation.

The state is per-MRT-instance and not shared across instances. Cross-instance coordination is not feasible with the current SDK primitives (the data store is read-only on the storefront side). For a real outage all instances see failures simultaneously, so each independently crosses its threshold; this is a reasonable trade-off for zero-coordination simplicity.

#### Configuration constants

| Constant | Value | Why |
|---|---|---|
| `SITEVERIFY_WINDOW_MS` | 60_000 | Fast enough to detect outages, long enough to be statistically meaningful at typical traffic. |
| `SITEVERIFY_MIN_SAMPLES` | 5 | Smallest count where a rate is meaningful. |
| `SITEVERIFY_MIN_FAILURES_FOR_DEGRADED` | 3 | Boundary guard - prevents one or two failures from tripping the verdict. |
| `SITEVERIFY_FAILURE_RATE_ENTER` | 0.5 | Aggressive enough to catch real outages, conservative enough to avoid false positives. |
| `SITEVERIFY_FAILURE_RATE_EXIT` | 0.3 | Hysteresis margin - large enough to avoid flap. |
| `SITEVERIFY_LATENCY_P95_THRESHOLD_MS` | 3000 | Cloudflare's siteverify is sub-second under normal load; multi-second p95 is degradation. |
| `SITEVERIFY_RING_CAPACITY` | 200 | Memory bound. With high-traffic instances, this caps the window even if 60s of samples would otherwise be more. |

#### Observability

`getSiteverifyMetricsSnapshot()` returns the current `{ sampleCount, failureCount, failureRate, p95LatencyMs, currentVerdict }`. Useful for adding APM/log instrumentation that surfaces the metrics across instances.

### Tier 2 - CDN probe (SECONDARY / BOOTSTRAP)

HEAD request to `challenges.cloudflare.com/turnstile/v0/api.js` with a 3s timeout, cached for 60s with stale-while-revalidate. Used when tier 1 doesn't have enough samples (low-traffic instances, fresh cold start). Treats HTTP 5xx or fetch failure as degraded.

### Combined logic

```
verdict = getSiteverifyHealth()  // tier 1
if verdict === true:  return true   // already degraded; stays sticky until EXIT
if verdict === false: return false  // healthy by tier 1 (authoritative)
// verdict === null only when currently-healthy AND samples < 5
return cdn-probe-degraded
```

The bootstrap path (no samples, currently healthy) ensures a fresh MRT instance can still report degradation immediately based on tier 2. Once tier 1 has crossed into degraded, tier 2 is not consulted - the in-flight outage signal is authoritative until recovery.

### Latency budget

Health checks must add zero latency to a warm request and no more than ~3s to a cold one:

| State | Tier 1 | Tier 2 |
|---|---|---|
| Warm (cache hit) | 0ms (in-memory metric) | 0ms (cached) |
| Cold (no cache) | 0ms (window may be empty - falls through) | up to 3s (probe + buffer) |
| Stale (TTL elapsed) | 0ms (returns stale, refreshes in background) | 0ms (returns stale, refreshes in background) |

A warm instance pays no latency cost. A cold instance pays at most one 3s+5s probe sequence per cache cycle.

## Site key resolution (`utils.ts`)

`getTurnstileSiteKey(config, baseUrl)` extracts the hostname from the request URL and finds the first site config whose `domains` array contains it. Configuration shape:

```typescript
{
  security: {
    turnstile: {
      enabled: true,
      verification: { enabled: true },
      mode: 'managed',
      sites: {
        production: [
          { siteKey: '0x...', domains: ['storefront.example.com', 'www.storefront.example.com'] },
        ],
        staging: [
          { siteKey: '0y...', domains: ['staging.storefront.example.com'] },
        ],
      },
    },
  },
}
```

The outer key (e.g. `'production'`, `'staging'`) is purely organizational - the lookup walks all groups in order. This shape lets a single config file express keys for multiple environments.

`getTurnstileSecretKey(siteKey)` reads the `TURNSTILE_SECRET_KEYS` env var (a JSON map of `siteKey → secretKey`) at request time. Secrets never enter the public config bundle. The function is server-only - on the client side it returns `null`.

## Configuration

### Per-environment site keys (in `config.server.ts`)

```typescript
{
  security: {
    turnstile: {
      enabled: true,                          // master switch
      verification: { mode: 'enforce' },      // 'enforce' | 'log-only' | 'disabled'
      mode: 'managed',                        // 'managed' | 'non-interactive' | 'invisible'
      sites: { /* see Site key resolution above */ },
    },
  },
}
```

Each top-level flag can be overridden by env var via the `PUBLIC__` prefix (per the project's config system). For local development, the template's `.env.example` shows all options.

### Verification mode

`verification.mode` controls server-side enforcement:

| Value | Behaviour |
|---|---|
| `'enforce'` | Full verification; blocks requests that fail (default when `TURNSTILE_VERIFICATION_ENABLED=true`). |
| `'log-only'` | Full verification pipeline runs (siteverify is called, health signal is updated), but the result is only logged. No shopper is ever blocked. |
| `'disabled'` | Verification is skipped entirely. Equivalent to `TURNSTILE_VERIFICATION_ENABLED=false`. |

`mode` takes precedence over the legacy `enabled` boolean. When neither is set, `disabled` is assumed.

### Safe rollout with log-only mode

Use `log-only` to observe real traffic before committing to enforcement:

1. Deploy with `PUBLIC__app__security__turnstile__verification__mode=log-only`
2. Monitor logs - filter on `mode: log-only` and group by `would_block`:
   ```
   fields @timestamp, would_block, reason, action, siteKey
   | filter mode = "log-only"
   | stats count() by would_block, reason
   ```
3. Once the `would_block: true` rate is acceptably low, switch to `mode=enforce`.

> **Cutover note:** In log-only mode no `cc-tv_${siteId}` cookies are emitted (the gate is observation-only, not enforcement). When you flip to `enforce`, all shoppers start from scratch — the first request on each protected endpoint runs a fresh siteverify call. There is no pre-populated cookie window to work through.

### Required environment variables

| Variable | Purpose | Notes |
|---|---|---|
| `TURNSTILE_SECRET_KEYS` | JSON map of `siteKey → secretKey` for server verification | Server-only. Required if verification mode is `enforce` or `log-only`. |
| `PUBLIC__app__security__turnstile__verification__mode` | Verification mode | `enforce`, `log-only`, or `disabled`. Takes precedence over `TURNSTILE_VERIFICATION_ENABLED`. |
| `PUBLIC__app__security__turnstile__enabled` | Master switch (client-visible) | When `false`, the widget never renders and `enforceTurnstile` returns `true`. |
| `PUBLIC__app__security__turnstile__sites` | JSON site config | Same shape as `config.server.ts` `sites` field. |
| `PUBLIC__app__security__turnstile__mode` | Widget mode override | One of `managed` / `non-interactive` / `invisible`. |

### Optional / deprecated environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TURNSTILE_VERIFICATION_ENABLED` | `false` | **Deprecated.** Use `PUBLIC__app__security__turnstile__verification__mode` instead. Maps `true` → `enforce`, `false` → `disabled`. |
| `TURNSTILE_CDN_PROBE_URL` | `https://challenges.cloudflare.com/turnstile/v0/api.js` | Override the URL the CDN probe hits (useful for tests / staging). |

### Cloudflare test site keys (local development)

Cloudflare publishes documented test keys that always succeed/fail/time-out. Useful for local development and E2E tests:

| Site key | Secret key | Behavior | Visible widget? |
|---|---|---|---|
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Always passes | No - silent pass |
| `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` | Always passes (invisible/managed) | No - silent pass |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | Always blocks (forced bot detection) | No - silent fail |
| `2x00000000000000000000BB` | `2x0000000000000000000000000000000AA` | Always blocks (invisible) | No - silent fail |
| `3x00000000000000000000FF` | `1x0000000000000000000000000000000AA` | Forces interactive challenge | Yes - challenge UI |

The widget mounts with `appearance: 'interaction-only'`, so it stays hidden whenever Cloudflare doesn't need shopper input. **The only test sitekey that produces visible widget UI in this codebase is `3x...FF`** (forces an interactive challenge). All other test keys (always-pass and always-block alike) succeed or fail silently with no visible UI - the widget mounts a hidden iframe that does its work invisibly. Verify those via the network tab, server logs, or the `cc-tv_${siteId}` cookie.

### Manual test plan

Each combination below has been verified end-to-end. The "What you see on checkout" column describes only what the shopper observes on screen - widget UI, alert messages, modals, and whether they can advance to shipping.

| # | Sitekey | Secret | Mode | What you see on checkout (after entering email + blurring) |
|---|---|---|---|---|
| 1 | `3x00000000000000000000FF` | `1x0000000000000000000000000000000AA` | managed | Cloudflare challenge widget appears below the email field. After clicking "Verify you are human" and passing the challenge, the **OTP modal opens** asking for a code. Shopper completes passwordless login and continues to shipping. |
| 2 | `2x00000000000000000000AB` | (any) | managed | No widget appears. After a brief delay, a red alert appears below the email field: **"We couldn't verify your information. Please try again."** OTP modal does not open. Clicking back into the email field clears the alert; blurring again shows it again (no progress). |
| 3 | `2x00000000000000000000BB` | (any) | managed | Same as #2 - no widget, generic alert appears, OTP modal blocked. |
| 4 | `1x00000000000000000000AA` | `2x0000000000000000000000000000000AA` | managed | No widget appears. After a brief delay, the same red alert appears: **"We couldn't verify your information. Please try again."** OTP modal does not open. **However**, the "Continue to Shipping Address" button remains active - the shopper can ignore the alert and proceed to shipping as a guest. |
| 5 | `1x00000000000000000000AA` | `3x0000000000000000000000000000000AA` | managed | Same as #4 - generic alert, no OTP modal, but the shopper can still continue as a guest. |
| 6 | `3x00000000000000000000FF` | `2x0000000000000000000000000000000AA` | managed | Challenge widget appears. After passing the challenge, **no alert is shown** and the OTP modal does NOT open - no email is sent. Shopper proceeds as a guest by clicking "Continue to Shipping Address". (No user-facing signal that verification failed; the protection is server-side - bot is silently blocked from the OTP / SCAPI path while guest checkout remains open.) |
| 7 | (any) | (any) | managed + block CDN in `/etc/hosts` | No widget appears (Cloudflare unreachable). The shopper can enter email and continue normally, no alert, no OTP modal. Effectively behaves as if Turnstile were disabled (graceful degradation). |

**Silent happy paths** (`1x00000000000000000000AA` or `1x00000000000000000000BB` paired with `1x0000000000000000000000000000000AA`): no widget appears on screen, but the OTP modal **does** open after a brief delay - the shopper can complete passwordless login. To distinguish these from rejection paths visually you need DevTools (since neither shows widget UI), but the OTP modal opening is the user-facing tell that verification succeeded.

### Server-rejection UX

When the server rejects a request with `403 NOT_AUTHORIZED` (rows 4 and 5 in the manual test plan above - cases where the widget produced a token silently and server-side `siteverify` rejected it), the contact-info form follows the pattern recommended by Cloudflare, Stripe, and Shopify:

1. **Show a generic retry message.** A `role="alert"` is rendered below the email field reading "We couldn't verify your information. Please try again." The copy never mentions Turnstile, bots, or specific error codes - exposing those would leak detection signals to attackers.
2. **Reset the Turnstile widget.** A fresh token is generated on the next email blur, so a transient failure (clock skew, NAT issue, transient bot signal) self-heals on retry.
3. **Cap auto-retries.** After three consecutive `NOT_AUTHORIZED` responses we still show the message but stop resetting the widget; the shopper has to refresh or contact support. This prevents a misconfigured key or a genuinely-blocked client from looping forever.
4. **Clear the error on next focus.** When the shopper engages with the email field again, the error message is removed so a successful retry isn't shown alongside the prior error.

The action response still carries `error.code: NOT_AUTHORIZED` for callers that want to distinguish bot rejection from other failures (e.g., observability, e2e tests). The form just maps it to a generic, non-specific user message.

**Why not silent stuck?** Cloudflare's own UX guidance and mainstream e-commerce checkouts (Stripe Radar, Shopify Checkout) all recommend retry-with-feedback over silent failure. The dominant cost in checkout is abandoned carts from frustrated humans, not bot fraud. Bot operators already know the site uses Turnstile (the widget is observable in DevTools); hiding the failure doesn't help, it just confuses real users whose challenge had a transient issue.

**Widget-side rejection (rows 2 and 3 above).** When the client-side widget exhausts its 3 retries without producing a token (always-block test keys, or a real client where Cloudflare won't issue a token), it fires `onRetryExhausted`. The form treats this the same as a server-side rejection: surface the generic verification-error message, allow the shopper to retry by re-focusing the email field. This closes the loop on the silent-stuck gap; no automated path exists today for the form to "give up" entirely - if the widget genuinely cannot produce a token after retries, the shopper will need to refresh or contact support after seeing the alert.

**Visible-challenge + server-reject (row 6 above) is a known quirk.** When a shopper passes a visible interactive challenge but the server still rejects the resulting token (always-fail secret, replay, etc.), no alert is shown. The shopper sees: challenge → solve → no OTP modal → continue as guest. The server-side protection still works (the bot path to OTP/SCAPI is blocked), but the UI does not surface the rejection in this combo. Documented as expected behavior for now.

## Observability

Turnstile decisions are observable through MRT logs. The request-scoped logger writes to MRT's standard logging pipeline (CloudWatch on AWS). Operators can tail logs via the b2c CLI or the MRT console, group by `correlationId` to trace a single shopper's journey, and aggregate cross-instance signals via CloudWatch Logs Insights or equivalent tools. There is no separate metrics/dashboard infrastructure to set up - the same MRT log stream that serves all storefront diagnostics carries the Turnstile signal.

### Decisions logged

| Decision | Level | Includes metrics snapshot? |
|---|---|---|
| Verification passed | `debug` | No |
| Missing token + platform healthy → blocked | `warn` | No |
| Missing token + platform degraded → fail-open | `warn` | **Yes** |
| Verify returned `internal-error` / HTTP 5xx → fail-open | `warn` | **Yes** |
| Verify returned bot-detection codes → blocked | `warn` | No |
| No site-key match for origin → blocked | `warn` | No |
| No secret key configured for site → blocked | `warn` | No |

All log entries carry `action`, `email`, `remoteIp`, `userAgent`, and `correlationId` so operators can pivot on any of them. The fail-open paths additionally carry the tier-1 metrics snapshot - the dimension that tells you *why* fail-open fired and whether it's likely a real outage or a localized symptom.

### Metrics snapshot shape

The `metrics` field on fail-open log entries is the output of `getSiteverifyMetricsSnapshot()`:

| Field | Meaning |
|---|---|
| `sampleCount` | Number of siteverify calls in the current 60s window (capped at 200) |
| `failureCount` | Number of those calls that were CF-side failures (`internal-error` / 5xx / network) |
| `failureRate` | `failureCount / sampleCount` (0 when sampleCount is 0) |
| `p95LatencyMs` | p95 of `durationMs` over the window, nearest-rank |
| `currentVerdict` | The hysteresis state at log time (`true` = currently degraded) |

The snapshot is computed once per verdict evaluation and cached, so adding it to the log path adds ~zero overhead during sustained outages (the hot path).

### Sample log lines

Healthy verify (debug):

```jsonc
{
  "level": "debug",
  "msg": "[Turnstile] Verification passed",
  "challengeTs": "2026-05-08T17:40:12.000Z",
  "action": "authorize-passwordless-email",
  "correlationId": "8f7e6d5c-..."
}
```

Fail-open: missing token while platform is degraded (e.g. CDN unreachable, no token reached BFF):

```jsonc
{
  "level": "warn",
  "msg": "[Turnstile] Missing token - allowed (Turnstile platform degraded)",
  "email": "shopper@example.com",
  "remoteIp": "203.0.113.42",
  "userAgent": "Mozilla/5.0 ...",
  "action": "authorize-passwordless-email",
  "correlationId": "8f7e6d5c-...",
  "metrics": {
    "sampleCount": 17,
    "failureCount": 12,
    "failureRate": 0.706,
    "p95LatencyMs": 4500,
    "currentVerdict": true
  }
}
```

Fail-open: siteverify returned `internal-error`:

```jsonc
{
  "level": "warn",
  "msg": "[Turnstile] Verification failed due to infrastructure issue - allowed (fail-open)",
  "errorCodes": ["internal-error"],
  "email": "shopper@example.com",
  "remoteIp": "203.0.113.42",
  "userAgent": "Mozilla/5.0 ...",
  "action": "authorize-passwordless-email",
  "correlationId": "8f7e6d5c-...",
  "metrics": {
    "sampleCount": 9,
    "failureCount": 8,
    "failureRate": 0.889,
    "p95LatencyMs": 5200,
    "currentVerdict": true
  }
}
```

Fail-CLOSED: verify returned `invalid-input-response` (bot or replay - no metrics needed):

```jsonc
{
  "level": "warn",
  "msg": "[Turnstile] Verification failed - potential bot or replay attack",
  "errorCodes": ["invalid-input-response"],
  "email": "shopper@example.com",
  "remoteIp": "203.0.113.42",
  "userAgent": "Mozilla/5.0 ...",
  "action": "authorize-passwordless-email",
  "correlationId": "8f7e6d5c-...",
  "hasToken": true
}
```

## References

- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Turnstile siteverify API](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- Internal: feature spec at [`e2e/feature-specs/checkout/turnstile-protection.spec.md`](../e2e/feature-specs/checkout/turnstile-protection.spec.md)

## Local E2E (Cloudflare test keys)

Local-only suite tagged **`@turnstile`** (not `@core` / `@smoke`). CI never selects it.

```bash
# App: packages/template/.env has Turnstile enabled + TURNSTILE_SECRET_KEYS for all test keys,
# plus MRT_DATA_STORE_DEFAULTS seeding emailVerificationEnabled (passwordless login UI).
pnpm dev                 # must be running; restart after changing MRT_DATA_STORE_DEFAULTS

# Tests — from packages/template or packages/template/e2e:
unset CI                 # if Cursor/IDE exported CI=true; do not set CI=false in e2e/.env
pnpm e2e:turnstile       # greps @turnstile; refuses real CI; clears local CI=false sentinels
```

**Passwordless prerequisite (login-page scenarios):** `/login` only renders the passwordless form (where Turnstile is wired) when the site preference `emailVerificationEnabled` is true. Production gets that from Business Manager (**Storefront Login Preferences → Enable Email Verification**). Locally, seed it in `packages/template/.env`:

```bash
MRT_DATA_STORE_DEFAULTS={"RefArchGlobal-login-preferences":{"data":{"emailVerificationEnabled":true}},"RefArch-login-preferences":{"data":{"emailVerificationEnabled":true}}}
```

(`SFNEXT_DATA_STORE_DEFAULTS` is an accepted alias.) Without this, `/login` shows email/password only and login Turnstile scenarios fail waiting for `[data-testid="turnstile-widget"]`.

Per-test keys via `overrideTurnstileConfig` (see [`e2e/test-plans/turnstile-test-plan.md`](../e2e/test-plans/turnstile-test-plan.md)). Interactive-challenge *solving* is not automatable; `RUN_MANUAL_TURNSTILE=true` unlocks human-solve scenarios. Continue stays gated until a token exists (WI-10).
