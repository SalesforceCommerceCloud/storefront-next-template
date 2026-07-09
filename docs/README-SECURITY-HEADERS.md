# Security Response Headers

Storefront Next ships default security response headers from the SDK. Every storefront generated from this template inherits them automatically — no opt-in needed.

## What ships by default

| Header | Default value |
|---|---|
| `Content-Security-Policy` | See [CSP directives](#csp-directives) below |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (only on Managed Runtime; suppressed locally) |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### CSP directives

| Directive | Default value | Why |
|---|---|---|
| `default-src` | `'self'` | Restricts every fetch type not otherwise listed. |
| `script-src` | `'self' https://challenges.cloudflare.com 'nonce-<per-request>'` | Strict — no `'unsafe-inline'` or `'unsafe-eval'`. The per-request nonce permits the `__APP_CONFIG__` inline script. Cloudflare origin permits the Turnstile widget. |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind v4 + shadcn rely on inline styles. |
| `img-src` | `'self' data: https://*.commercecloud.salesforce.com https://*.demandware.net` | DIS image URLs. |
| `font-src` | `'self' data:` | Self-hosted web fonts. |
| `connect-src` | `'self' https://*.commercecloud.salesforce.com https://*.demandware.net https://challenges.cloudflare.com https://api.cquotient.com` | SCAPI calls + browser-initiated XHR from the Turnstile widget + Einstein engagement beacons (CQuotient activities API). |
| `frame-src` | `https://challenges.cloudflare.com` | Turnstile widget iframe. |
| `frame-ancestors` | `'self'` | Modern equivalent of `X-Frame-Options`. |
| `form-action` | `'self'` | Restricts form POST targets. CSP3 does NOT fall back to `default-src` for this directive — without it, forms can POST anywhere. |
| `base-uri` | `'self'` | Prevents `<base href>` injection. |
| `object-src` | `'none'` | Blocks Flash and other plugin content. |
| `upgrade-insecure-requests` | enabled (only on Managed Runtime; suppressed locally) | Browser auto-upgrades HTTP subresources to HTTPS. Suppressed on local `pnpm dev` because Safari upgrades `http://localhost` subresources to `https://` (same port, no TLS listener) and breaks every CSS/JS request. |

## Where the config lives

All security-headers config is under `app.security.headers.*` in `config.server.ts`. (The sibling `app.security.turnstile.*` is unrelated — that's bot protection. Both live under `security` because they're defense-in-depth concerns.)

## Extending CSP for a new origin

Spread `defaultCspDirectives` and override per directive. **Each directive you set fully replaces the SDK default** — copy from the defaults to extend.

```ts
// config.server.ts
import { defaultCspDirectives } from '@salesforce/storefront-next-runtime/security';

export default defineConfig<Config>({
    app: {
        // …
        security: {
            turnstile: { /* …existing turnstile config… */ },
            headers: {
                csp: {
                    directives: {
                        ...defaultCspDirectives,
                        'script-src': [
                            ...defaultCspDirectives['script-src']!,
                            'https://cdn.example.com',
                        ],
                        'connect-src': [
                            ...defaultCspDirectives['connect-src']!,
                            'https://api.segment.io',
                        ],
                    },
                },
            },
        },
    },
});
```

## CSP Contributors

Opt-in features (e.g., Cimulate messaging widget) contribute their exact configured origins to the CSP at boot instead of requiring manual directive edits or shipping broad wildcards. The SDK validates contributors at boot (https-only, no wildcards/credentials/whitespace) and folds active ones into the served CSP.

| Feature | Contributor ID | Directives | Activation |
|---|---|---|---|
| Commerce Client (Cimulate) | `cimulate` | `script-src`, `connect-src`, `img-src`, `style-src`, `font-src`, `frame-src` | `cimulateAgent.enabled` is `true` or `'true'` |

Origins are derived from feature config (`cimulateAgent.commerceClientScriptSourceUrl`, `scrt2Url`, `commerceClientLogoUrl`) — no new config to set.

To author a new contributor for a feature, use the `add-csp-contributor` skill.

**Note:** The Page Designer `frame-ancestors` relaxation is currently inline in the SDK middleware (a documented legacy exception) and will migrate to a contributor in a follow-up (W-23050622).

## Disabling a header

Set the field to `false` to disable a single header. Other headers remain.

```ts
security: {
    headers: {
        hsts: false,              // disable HSTS only
        permissionsPolicy: false, // disable Permissions-Policy only
    },
}
```

To disable everything (for debugging only):

```ts
security: { headers: { enabled: false } }
```

A startup warning is logged whenever any header is disabled.

## Migrating from PWA Kit

PWA Kit shipped its own permissive defaults; Storefront Next defaults are stricter. For a safe rollout:

1. Deploy with CSP in **report-only** mode:
   ```ts
   security: { headers: { csp: { reportOnly: true } } }
   ```
   The browser won't block anything but will log all violations to DevTools (and to any configured `report-uri`). A startup warning is logged on every server boot in this mode.
2. Watch DevTools / browser violation reports for a week or two. Identify legitimate origins your storefront uses (analytics CDNs, third-party widgets, etc.).
3. Add those origins to your CSP via the spread pattern above.
4. Flip `reportOnly: false` (or remove the field) and redeploy. Enforcement is now on.

## Troubleshooting CSP violations

Open the browser DevTools console. Violations look like:

> Refused to load the script `https://cdn.example.com/foo.js` because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…' https://challenges.cloudflare.com".

The directive name in the message tells you what to extend. Common culprits:

| Symptom | Likely fix |
|---|---|
| "Refused to load the script" | Add the origin to `script-src` |
| "Refused to connect to" | Add the origin to `connect-src` |
| "Refused to load the image" | Add the origin to `img-src` |
| "Refused to apply inline style" | Custom inline styles need `'unsafe-inline'` (already on by default) — check the directive in the violation message |

## Environment variable overrides

Standard `PUBLIC__` env-var override applies. The path uses double-underscore separators following the existing `security.turnstile.*` pattern:

```bash
# Toggle CSP report-only mode (recommended use case for env vars):
PUBLIC__app__security__headers__csp__reportOnly=true

# Disable HSTS entirely:
PUBLIC__app__security__headers__hsts=false
```

Replacing individual CSP directive names is **not supported via env vars** because the env-var path uses `__` as a segment separator and CSP directive names contain hyphens (`script-src`, `connect-src`, …). Override the whole `directives` map as a JSON blob instead:

```bash
# Override the entire CSP directives map (note: this REPLACES all defaults):
PUBLIC__app__security__headers__csp__directives='{"default-src":["'"'"'self'"'"'"],"script-src":["'"'"'self'"'"'","https://cdn.example.com"]}'
```

Because this fully replaces the SDK defaults, env-var CSP overrides are best reserved for unusual cases. For most directive changes, edit `config.server.ts` and spread `defaultCspDirectives` — the shell escaping is unforgiving and the default-replacement semantics are easy to get wrong.

See [README-CONFIG.md](./README-CONFIG.md) for the full env-var override system.

## Related docs

- [README-CONFIG.md](./README-CONFIG.md) — Configuration system
- [README-CONFIG-OPTIONS.md](./README-CONFIG-OPTIONS.md) — Configuration reference
- [README-AUTH.md](./README-AUTH.md) — Auth and social-login (extends `connect-src`)
- [README-TURNSTILE.md](./README-TURNSTILE.md) — Cloudflare Turnstile (already permitted in defaults)
