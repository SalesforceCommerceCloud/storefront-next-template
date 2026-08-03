# Turnstile Test Plan

Complete testing guide for Cloudflare Turnstile bot protection.

## Integration

**Location:** Checkout `ContactInfo` (`src/components/checkout/components/contact-info.tsx`) and login (`src/routes/_empty.login.tsx`)

**Trigger:** Passwordless login on email blur → POST `/action/authorize-passwordless-email` with `turnstileToken`

## Local E2E suite

Single tag: **`@turnstile`** (Feature-level). CI never runs this suite.

```bash
# Terminal 1 — packages/template, Turnstile + passwordless prefs in .env (see Required env)
pnpm dev                 # restart after changing MRT_DATA_STORE_DEFAULTS

# Terminal 2 — packages/template (or e2e/):
unset CI                 # Cursor/IDE may export CI=true; refuse real CI
pnpm e2e:turnstile
```

- Do **not** set `CI=false` in `e2e/.env` — that string is truthy; Codecept empty-run checks treat it as CI. Leave CI unset (`pnpm e2e:turnstile` also clears local sentinels).
- Per-test keys: `overrideTurnstileConfig(siteKey, mode, origin)` — not tags.
- Continue stays disabled until Turnstile yields a token (WI-10); expected, not a freeze.

## Required env

Set these on the **storefront app** (`packages/template/.env`), not only in `e2e/.env`:

```bash
PUBLIC__app__security__turnstile__enabled=true

# Server-verification scenarios also need (app + readable by e2e process if you want those scenarios unskipped):
TURNSTILE_VERIFICATION_ENABLED=true
TURNSTILE_SECRET_KEYS='{"1x00000000000000000000AA":"1x0000000000000000000000000000000AA","1x00000000000000000000BB":"1x0000000000000000000000000000000AA","2x00000000000000000000AB":"2x0000000000000000000000000000000AA","2x00000000000000000000BB":"2x0000000000000000000000000000000AA","3x00000000000000000000FF":"1x0000000000000000000000000000000AA"}'

# Passwordless / OTP login UI (login-page Turnstile scenarios). Without this, /login
# only shows email+password. Seeds the local data-store "Enable Email Verification"
# preference (BM site pref in production). Restart `pnpm dev` after changing.
MRT_DATA_STORE_DEFAULTS={"RefArchGlobal-login-preferences":{"data":{"emailVerificationEnabled":true}},"RefArch-login-preferences":{"data":{"emailVerificationEnabled":true}}}
```

Map **all** test site keys in `TURNSTILE_SECRET_KEYS` so per-test site-key overrides still verify server-side.

## Test keys

| Sitekey | Secret | Behavior |
|---------|--------|----------|
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Always passes |
| `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` | Always passes (default local) |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | Always blocks |
| `2x00000000000000000000BB` | `2x0000000000000000000000000000000AA` | Always blocks |
| `3x00000000000000000000FF` | `1x0000000000000000000000000000000AA` | Forces interactive challenge |

Source: [Cloudflare Turnstile Testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

## Per-test key selection

Each scenario picks its key via `overrideTurnstileConfig(siteKey, mode, origin)` (injects `window.__APP_CONFIG__` before navigation). No tag-based key filtering.

```typescript
await overrideTurnstileConfig('2x00000000000000000000BB', 'managed', origin);
await addToCartFlow.executeAndNavigateToCheckout(...);
```

## Automated coverage (`e2e/src/specs/core/checkout-turnstile.spec.ts`)

| Scenario | Key | Validates |
|----------|-----|-----------|
| Script/widget load | default `1x…BB` | CDN + DOM |
| Graceful degradation | any | No error alerts |
| Visible always-pass | `1x…AA` | Widget container |
| Interactive challenge UI | `3x…FF` | Widget renders (solve not automated) |
| Token in request | default `1x…BB` | `turnstileToken` in FormData |
| Always-block WI-10 | `2x…BB` | Generic alert, no Turnstile/bot/captcha leak |
| Visible always-block | `2x…AB` | OTP modal not opened |
| Login always-pass | `1x…BB` | Widget on `/login` |
| Login always-block | `2x…BB` | WI-10 alert, no signal leak |
| Cookie suppress — same email | HMAC-seeded `cc-tv_*` | Seed cookie (same HMAC as authorize mint); second blur hides widget + Continue ungated |
| Cookie suppress — different email | HMAC-seeded `cc-tv_*` | Cookie for email A; blur email B remounts widget |
| Server verify pass | `1x…BB` + pass secret | Not 403 from Turnstile |
| Server verify invalid/spent | (see notes in spec) | Informational / unit-backed |
| Challenge blocks submit | `3x…FF` | No token before solve |

## Interactive challenge limits

Cloudflare iframes block reliable automation of solving `3x…FF`. Automated tests assert render + pre-solve gating. Human solve paths require `RUN_MANUAL_TURNSTILE=true pnpm e2e:turnstile`.

## Unit tests

Hard 100% target: `src/lib/turnstile/**`. Widget, error-codes, passwordless-login-form, and Turnstile paths in contact-info / login / protected actions are covered by Vitest (see feature-spec WI-7).
