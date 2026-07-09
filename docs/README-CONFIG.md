# Configuration

One TypeScript file for all your app settings. Configure via `.env` files for different environments.

## Quick Start

**Two simple APIs for two contexts:**

### For Loaders, Actions, Utilities: `getConfig()`

```typescript
import { getConfig } from '@salesforce/storefront-next-runtime/config';

// ✅ Server loader/action - pass context
export function loader({ context }: LoaderFunctionArgs) {
  const config = getConfig(context);
  return { limit: config.search.products.hits.limit };
}

// ✅ Client loader - no context needed
export function clientLoader() {
  const config = getConfig();
  return { limit: config.search.products.hits.limit };
}
```

### For React Components: `useConfig()`

```typescript
import { useConfig } from '@salesforce/storefront-next-runtime/config';

export function MyComponent() {
  const config = useConfig();
  return <div>Showing {config.search.products.hits.limit} products</div>;
}
```

> `getConfig()` returns the full `AppConfig`; `useConfig()` returns the narrowed
> `Omit<AppConfig, 'serverExtension'>` so client-side reads can't reach
> server-only namespaces. Both shapes come from the template's two augmentations
> in `src/types/config.ts` (`AppConfigShape` and `ClientFacingAppConfigShape`).
> Future templates fill the same two slots for their own shapes.

## Required vs Optional Variables

Every variable the storefront recognizes is listed here. Set the **Required** rows only in `.env`. Everything else has a working default in `config.server.ts`.

### Required for the app to start

| Variable | Default | Notes |
|---|---|---|
| `PUBLIC__app__commerce__api__clientId` | — | SLAS client ID |
| `PUBLIC__app__commerce__api__organizationId` | — | B2C Commerce org/realm |
| `PUBLIC__app__commerce__api__shortCode` | — | SCAPI short code |

### Required for `pnpm push` (Managed Runtime deploy)

| Variable | Default | Notes |
|---|---|---|
| `MRT_PROJECT` | falls back to `package.json#name` | MRT project slug. Owned by the MRT/Fast Setup team. |
| `MRT_TARGET` | — | MRT deploy target (e.g. `development`, `production`). |

### Server-only secrets (never prefix with `PUBLIC__`)

| Variable | Used by | Notes |
|---|---|---|
| `COMMERCE_API_SLAS_SECRET` | `src/lib/api-clients.server.ts`, `e2e/src/utils/scapi-helper.ts` | Required only with private-client SCAPI auth. |
| `MARKETING_CLOUD_CLIENT_ID`, `MARKETING_CLOUD_CLIENT_SECRET`, `MARKETING_CLOUD_AUTH_BASE_URL`, `MARKETING_CLOUD_REST_BASE_URL` | Passwordless login email delivery | Required only when `passwordlessLogin.mode = 'email'` and you ship your own MC tenant. |
| `SCAPI_PROXY_HOST` | `vite-plugins/env-validation.ts`, `src/middlewares/app-config.server.ts` | Internal-developer-only override (workspace proxy). |

### Optional `PUBLIC__*` overrides (defaults in `config.server.ts`)

| Variable | Default | Effect |
|---|---|---|
| `PUBLIC__app__commerce__api__proxy` | `/mobify/proxy/api` | SCAPI proxy path |
| `PUBLIC__app__commerce__api__callback` | `/callback` | OAuth callback path |
| `PUBLIC__app__commerce__api__privateKeyEnabled` | `false` | Use private SLAS client |
| `PUBLIC__app__hybrid__enabled` | `false` | Hybrid PWA mode |
| `PUBLIC__app__auth__otpLength` | `6` | OTP length (6 or 8) |
| `PUBLIC__app__features__passwordlessLogin__mode` | `email` | `email` \| `callback` |
| `PUBLIC__app__features__otpRequest__mode` | `email` | `email` \| `callback` |
| `PUBLIC__app__features__resetPassword__mode` | `email` | `email` \| `callback` |
| `PUBLIC__app__features__mrtBasedPageDesignerResolution` | `false` | Resolve PD pages via MRT Data Store |
| `PUBLIC__app__features__socialLogin__enabled` | `true` | Apple/Google login button |
| `PUBLIC__app__features__socialLogin__callbackUri` | `/social-callback` | Social login callback path |
| `PUBLIC__app__features__socialLogin__providers` | `["Apple","Google"]` | Provider list |
| `PUBLIC__app__features__shopperContext__enabled` | `false` | Shopper context API |
| `PUBLIC__app__defaultSiteId` | (single-site default) | Override default site |
| `PUBLIC__app__commerce__sites` | (single-site default) | Multi-site JSON config |
| `PUBLIC__app__cookies__domain` | host-only | Global default cookie domain for all cookies (e.g. `.example.com`); per-site `commerce.sites[].cookies.domain` overrides it |
| `PUBLIC__app__commerce__api__guestRefreshTokenExpirySeconds` | from API response | Override guest refresh-token TTL |
| `PUBLIC__app__commerce__api__registeredRefreshTokenExpirySeconds` | from API response | Override registered refresh-token TTL |
| `PUBLIC__app__features__googleCloudAPI__apiKey` | — | Google Address Autocomplete |
| `PUBLIC__security__turnstile__enabled` | `false` | Turnstile bot protection |
| `PUBLIC__security__turnstile__sites` | — | Turnstile per-site configuration |
| `PUBLIC__app__cimulateAgent` | disabled | Commerce Client (Cimulate) messaging widget config (JSON string) |

### Optional non-`PUBLIC__` runtime/deploy variables

| Variable | Default | Effect |
|---|---|---|
| `HYBRID_PROXY_ENABLED` | `false` | Enable Vite hybrid proxy |
| `HYBRID_ROUTING_RULES` | — | Cloudflare-style routing expression for hybrid proxy |
| `HYBRID_PROXY_LOCALE` | falls back to `i18n.fallbackLng` | Locale for SFRA path transformation |
| `SFCC_ORIGIN` | — | SFCC origin URL (required when hybrid proxy enabled) |
| `SFCC_LOG_LEVEL` | `warn` (prod) / `info` (dev) | Log verbosity (`error` \| `warn` \| `info` \| `debug`) |

## Environment Variables

Override any configuration value using environment variables with the `PUBLIC__` prefix, no need to modify `config.server.ts`.

### Understanding the Path Syntax

The double underscore (`__`) lets you navigate nested config paths. Think of it as replacing the dot (`.`) in JavaScript object notation:

```bash
# This environment variable:
PUBLIC__app__site__locale=en-GB

# Maps to this config path:
config.app.site.locale

# Which creates this structure:
{
  app: {
    site: {
      locale: 'en-GB'
    }
  }
}
```

### Required Variables

Copy `.env.default` to `.env` and set these required B2C Commerce credentials:

```bash
PUBLIC__app__commerce__api__clientId=your-client-id
PUBLIC__app__commerce__api__organizationId=your-org-id
PUBLIC__app__commerce__api__shortCode=your-short-code
```

### Commerce Sites (Multi-Site)

Site-level settings (default locale, default currency, supported locales/currencies, cookie domain) come from the **`commerce.sites`** config array. You can override it with the environment variable **`PUBLIC__app__commerce__sites`**, set to a JSON array.

```bash
# Example: one site with multiple locales and currencies (single line)
PUBLIC__app__commerce__sites='[{"cookies":{"domain":null},"id":"RefArchGlobal","defaultLocale":"en-GB","defaultCurrency":"USD","supportedLocales":[{"id":"en-GB","preferredCurrency":"USD"},{"id":"de-DE","preferredCurrency":"EUR"}],"supportedCurrencies":["EUR","USD"]}]'
```

Multi-line JSON is supported in `.env` files. For the full schema, all properties, multi-line examples, and troubleshooting, see **commerce.sites** in [README-CONFIG-OPTIONS.md](./README-CONFIG-OPTIONS.md).

### Value Types

Values are automatically parsed to the correct type:

```bash
PUBLIC__app__myFeature__count=42           # → number
PUBLIC__app__myFeature__enabled=true       # → boolean
PUBLIC__app__myFeature__items=["a","b"]    # → array
PUBLIC__app__myFeature__data='{"x":1}'     # → object
PUBLIC__app__myFeature__name=hello         # → string
PUBLIC__app__myFeature__value=             # → empty string
```

You can also set entire nested objects at once using JSON:

```bash
# Instead of setting each value separately:
PUBLIC__app__myFeature__option1=value1
PUBLIC__app__myFeature__option2=value2
PUBLIC__app__myFeature__nested__enabled=true

# Use a single JSON value:
PUBLIC__app__myFeature='{"option1":"value1","option2":"value2","nested":{"enabled":true}}'
```

### Important Notes

**Case doesn't matter:** You can use any casing (lowercase, UPPERCASE, or MixedCase), and it will normalize to match your `config.server.ts`:

```bash
PUBLIC__app__site__locale=en-GB    # ✅ Works
PUBLIC__APP__SITE__LOCALE=en-GB    # ✅ Also works
PUBLIC__App__Site__Locale=en-GB    # ✅ Also works
```

**Paths must exist in config:** You can only override paths that are already defined in `config.server.ts`. This prevents typos from silently failing:

```bash
PUBLIC__app__site__local=en-GB  # ❌ Error: "local" doesn't exist (did you mean "locale"?)
```

**More specific paths win:** When paths overlap, deeper paths take precedence:

```bash
PUBLIC__app__myFeature='{"setting1":500,"setting2":1000}'
PUBLIC__app__myFeature__setting1=999  # ← This wins (more specific)
# Result: setting1=999, setting2=1000
```

**Depth limit:** Paths are limited to 10 levels deep. For deeper structures, use JSON values instead:

```bash
# ❌ Too deep (11 levels):
PUBLIC__a__b__c__d__e__f__g__h__i__j__k=value

# ✅ Use JSON instead:
PUBLIC__app__myFeature='{"deep":{"nested":{"structure":{"works":"fine"}}}}'
```

### Security: PUBLIC__ vs Non-Prefixed

**`PUBLIC__` prefix** → Exposed to the browser (bundled into client JavaScript)
- ✅ Use for: Client IDs, site IDs, locales, feature flags, public API endpoints
- ❌ Never use for: API secrets, passwords, private keys, authentication tokens

**No prefix** → Server-only (never exposed to client)
- ✅ Use for: SLAS secrets, database credentials, private tokens

```bash
# ✅ Safe to expose to client:
PUBLIC__app__commerce__api__clientId=abc123

# ✅ Server-only secret (no PUBLIC__ prefix):
COMMERCE_API_SLAS_SECRET=your-secret-here
```

Read server-only secrets directly from `process.env` in your server code—never add them to config.

### Merge Behavior

Environment variables are **deep merged** into defaults from `config.server.ts`:

```typescript
// config.server.ts (defaults)
export default defineConfig({
  app: {
    myFeature: {
      debounce: 750,
      maxItems: 999,
      enabled: true,
    }
  }
});

// With env var:
// PUBLIC__app__myFeature__debounce=1000

// Final result:
{
  app: {
    myFeature: {
      debounce: 1000,        // ← overridden
      maxItems: 999,         // ← preserved
      enabled: true,         // ← preserved
    }
  }
}
```

## Adding Configuration

### 1. Update the type (`src/types/config.ts`)

The template defines its own `AppConfig` type with all the fields it needs — SCAPI credentials,
pages, features, and any custom domain fields. `BaseConfig<AppConfig>` wraps it with `metadata`
and `runtime` sections:

```typescript
import type { BaseConfig } from '@salesforce/storefront-next-runtime/config';
import type { Site, Url } from '@salesforce/storefront-next-runtime/config';

// Define all app fields in one flat type
export type AppConfig = {
  commerce: { api: { clientId: string; /* ... */ }; sites: Array<Site> };
  defaultSiteId: string;
  url?: Url;
  myFeature: {
    enabled: boolean;
    maxItems: number;
  };
  // ...other template-specific fields (pages, features, global, etc.)
};

// Full config type used by config.server.ts
export type Config = BaseConfig<AppConfig>;
```

### 2. Add default value (`config.server.ts`)
```typescript
import { defineConfig } from '@salesforce/storefront-next-runtime/config';
import type { Config } from './src/types/config';

export default defineConfig<Config>({
  metadata: { projectName: 'My Store', projectSlug: 'my-store' },
  app: {
    // SCAPI fields
    commerce: { api: { clientId: '', organizationId: '', siteId: '', shortCode: '' }, sites: [] },
    defaultSiteId: 'RefArch',
    // Template-specific fields
    myFeature: {
      enabled: false,  // Just the default - no process.env needed!
      maxItems: 10,
    },
  },
});
```

### 3. Override via environment variables
```bash
# No code changes needed - just use the PUBLIC__ prefix!
PUBLIC__app__myFeature__enabled=true
PUBLIC__app__myFeature__maxItems=20
```

### 4. Use it in your code

**In React components:**
```typescript
import { useConfig } from '@salesforce/storefront-next-runtime/config';

export function MyComponent() {
  const config = useConfig();

  if (config.myFeature.enabled) {
    const maxItems = config.myFeature.maxItems;
    // Your feature code here
  }
}
```

**In loaders/actions:**
```typescript
import { getConfig } from '@salesforce/storefront-next-runtime/config';

export function loader({ context }: LoaderFunctionArgs) {
  const config = getConfig(context);

  if (config.myFeature.enabled) {
    // Your loader code here
  }
}
```

### 4. Add a new config value during app creation
**In config-meta.json:**
- Add the name and key value to the config array
- This will cause the create-storefront script to ask for user input, using the value in `.env.default` as default value
```json
{
    "configs": [
        {
            "name": "SLAS Client ID",
            "key": "PUBLIC__app__commerce__api__clientId"
        },
        {
            "name": "Organization ID",
            "key": "PUBLIC__app__commerce__api__organizationId"
        },
        {
            "name": "Short Code",
            "key": "PUBLIC__app__commerce__api__shortCode"
        }
    ]
}
```

### Extension config auto-discovery

The steps above are for config the template owns. **Extensions** add client-side config without editing `src/types/config.ts` or `config.server.ts`: drop a `config.ts` in the extension folder that default-exports a plain object, and the build prestep (`pnpm dev` / `pnpm build`) discovers it, merges it into `config.app.extension.<camelCaseFolder>`, and derives the type automatically. Merchants then override per environment with `PUBLIC__app__extension__<key>__<setting>` — no core-file edits. See [src/extensions/README.md](../src/extensions/README.md#extension-configuration) for the authoring guide.

Extension keys are set via `PUBLIC__` env vars / `.env`; they are not added to `config-meta.json`, so they don't appear in the create-storefront prompts.

### Server-only extension config (`server-config.ts`)

`config.ts` reaches the browser by design. For values an extension needs at runtime that must **never** be serialized into `window.__APP_CONFIG__` (vendor-side SCAPI service overrides, retry budgets, internal-only endpoints), drop a `server-config.ts` next to `config.ts`:

```typescript
// src/extensions/loqate-address-verification/server-config.ts
export default {
    scapiOverride: '',
    retryBudget: 3,
};
```

Read the value from a server loader, action, or middleware:

```typescript
import { getConfig } from '@salesforce/storefront-next-runtime/config';

export function loader({ context }: LoaderFunctionArgs) {
    const { scapiOverride } = getConfig(context).serverExtension?.loqateAddressVerification ?? {};
    // …
}
```

Same drop-a-file ergonomics as the client side — the build prestep aggregates every extension's `server-config.ts` into `src/extensions/config/server.ts` (auto-generated, do not edit) and merges it into `config.app.serverExtension.<camelCaseFolder>`. Three structural guarantees keep the values off the client:

- The client config extractor (`src/lib/app-config-client.ts`) strips `app.serverExtension` before writing `window.__APP_CONFIG__`.
- A Vite plugin (`vite-plugins/server-only-config-guard.ts`) fails the build if any client chunk imports `src/extensions/config/server`.
- `useConfig()` and `getConfig()`'s client-facing overloads (no-arg and `getConfig(ctx | undefined)`) are type-narrowed to omit `app.serverExtension`, so reading `.serverExtension` from any of them is a TypeScript error in client code. The server `getConfig(context)` overload still returns the full shape. The narrow is wired through the SDK's `ClientFacingAppConfigShape` slot, which the template fills with `ClientAppConfig` (`Omit<AppConfig, ServerOnlyNamespace>`); adding a server-only namespace to `SERVER_ONLY_NAMESPACES` (`src/lib/app-config-client.ts`) updates the runtime extractor and the type narrow together.

There is no `PUBLIC__` override path by design — the same AST validator runs on `server-config.ts`, so a `process.env.X` read still throws at discovery time. For true secrets that *must* vary per environment (SLAS secrets, Marketing Cloud credentials), keep using `process.env` from a server route — never put them in `server-config.ts`.

## How It Works

1. **Types defined** in `src/types/config.ts` — `AppConfig` defines all app fields, `Config = BaseConfig<AppConfig>`
2. **Defaults defined** in `config.server.ts` — clean, no `process.env` references
3. **Environment variables** with `PUBLIC__` prefix are automatically merged by `defineConfig()` — `defineConfig` reads `process.env` at call time, so it only resolves `PUBLIC__*` overrides on the server.
4. **Final config** is made available via:
   - `getConfig(context)` for server loaders/actions
   - `getConfig()` for client loaders
   - `useConfig()` for React components
   - `window.__APP_CONFIG__` for client code

   `getConfig(context)` returns the full `AppConfig`; `getConfig()` (no-context) and `useConfig()` return the narrowed `Omit<AppConfig, 'serverExtension'>` (see "Server-only extension config" above) — all automatic because the template fills two augmentation slots in `src/types/config.ts`:

   ```typescript
   declare module '@salesforce/storefront-next-runtime/config' {
       interface AppConfigShape extends AppConfig {}
       interface ClientFacingAppConfigShape extends ClientAppConfig {}
   }
   ```

   `ClientAppConfig` is `Omit<AppConfig, ServerOnlyNamespace>` from `src/lib/app-config-client.ts`, which keeps the runtime extractor and the type narrow reading the same source.

   > **Multi-template caveat:** if you build two templates in the same TS program (rare — usually each template has its own `tsconfig`), only one `extends ...` per slot wins. Fall back to explicit per-call generics in the loser: `getConfig<MyAppConfig>(context)` and `useConfig<MyClientAppConfig>()`.

5. **Custom middleware** can read the resolved app config from `appConfigContext` — this is the same context that `getConfig(context)` reads from internally:

   ```typescript
   import { appConfigContext } from '@salesforce/storefront-next-runtime/config';

   const config = context.get(appConfigContext);
   ```

The `.server.ts` suffix prevents accidental direct imports. The `PUBLIC__` prefix ensures only client-safe values are exposed.

**What gets shared:**
- The `app` section → Available on both server and client
- The `runtime` and `metadata` sections → Server-only (not injected to client)

**Where things live:**
- Public config API (`defineConfig`, `getConfig`, `useConfig`, `ConfigProvider`, `appConfigContext`, `AppConfigShape`, plus `BaseConfig`/`DefineConfigOptions`/`Site`/`Locale`/`Url` types) → `@salesforce/storefront-next-runtime/config`
- Build-time config loader (`loadConfig`) → `@salesforce/storefront-next-runtime/config/load-config`
- Template-specific types (`Config`, `AppConfig`) → `src/types/config.ts`
- App-config server/client middleware (template-owned) → `src/middlewares/app-config.{server,client}.ts`
- Default values → `config.server.ts`

## Testing

The template provides shared test utilities for components and hooks that depend on config:

```typescript
import { mockConfig, mockBuildConfig, ConfigWrapper, createConfigWrapper } from '@/test-utils/config';

// Use the default wrapper
renderHook(() => useConfig(), { wrapper: ConfigWrapper });

// Use a wrapper with custom overrides (deep merged)
const CustomWrapper = createConfigWrapper({
  app: { ...mockBuildConfig.app, pages: { ...mockBuildConfig.app.pages, cart: { ...mockBuildConfig.app.pages.cart, maxQuantityPerItem: 5 } } },
});
renderHook(() => useConfig(), { wrapper: CustomWrapper });
```

- `mockBuildConfig` — a full `Config` object with realistic test values
- `mockConfig` — the `app` section (i.e., `mockBuildConfig.app`)
- `ConfigWrapper` — a ready-to-use wrapper component for `renderHook` / `render`
- `createConfigWrapper(overrides?)` — creates a wrapper with custom config (deep-merges nested overrides)

For tests that need all providers (config + currency + store locator), use `AllProvidersWrapper` from `@/test-utils/context-provider`.

## Common Issues

**Changed `.env` but nothing happened?**
- Restart your dev server (environment variables are loaded at startup)

**Environment variable not working?**
- Verify the variable name starts with `PUBLIC__` (double underscore)
- Check `.env` file is in the project root
- For booleans, use string `"true"` not bare `true`

**Type errors after adding config?**
- Update both `src/types/config.ts` (type definitions) and `config.server.ts` (default values) to match
- Run `pnpm typecheck` to verify all files are correct

**App won't start - missing credentials?**
- Copy `.env.default` to `.env`
- Set required B2C Commerce credentials:
  ```bash
  PUBLIC__app__commerce__api__clientId=your-id
  PUBLIC__app__commerce__api__organizationId=your-org
  PUBLIC__app__commerce__api__shortCode=your-code
  ```

## Deploying to MRT (Managed Runtime)

When deploying to Managed Runtime, set the same environment variables in the MRT environment:

1. Log into the Runtime Admin
2. Navigate to your project → Environment Variables
3. Add the required `PUBLIC__` variables (same ones from your `.env` file)
4. Add any server-only secrets without the `PUBLIC__` prefix
5. Deploy your application

All the same rules apply: use the `PUBLIC__` prefix for client-safe values, use the `__` path syntax for nested config, and read server-only secrets directly from `process.env`.

**MRT limits:** Variable names max 512 characters, total PUBLIC__ values max 32KB. Use JSON to consolidate related settings if needed.

[Learn more about MRT environment variables →](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/environment-variables.html)

## Marketing Cloud Configuration (Server-Only)

Marketing Cloud is used for sending emails in features like passwordless login and password reset. The configuration is optional and only required if you're using these features.

### Environment Variables

```bash
# Marketing Cloud API Configuration (Server-only - NO PUBLIC__ prefix)
MARKETING_CLOUD_CLIENT_ID=your-client-id
MARKETING_CLOUD_CLIENT_SECRET=your-client-secret
MARKETING_CLOUD_SUBDOMAIN=your-subdomain
MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE=your-passwordless-template-id
MARKETING_CLOUD_RESET_PASSWORD_TEMPLATE=your-reset-password-template-id
```

**Important Security Notes:**
- ❌ These variables do NOT have the `PUBLIC__` prefix - they are **server-only**
- ❌ They are NOT included in `config.server.ts` or exposed to the client
- ✅ Read them directly from `process.env` in server-side code

## Enabling Optional Features

Each block in this section is a copy-pasteable env snippet. Drop it into your `.env` and uncomment to enable the feature.

### Multi-site / `commerce.sites`

Single-site is the default. To enable multiple sites, define them as a JSON array. The quote wrapping the array value is needed because it is multi-line — for MRT environment variables, convert to a single line and remove the surrounding quotes.

```bash
# Single-site override
# PUBLIC__app__defaultSiteId=RefArchGlobal

# Multi-site (single-line — works for MRT and local .env)
# PUBLIC__app__commerce__sites=[{"id":"RefArch","defaultLocale":"en-US","defaultCurrency":"USD","supportedLocales":[{"id":"en-US","preferredCurrency":"USD"}],"supportedCurrencies":["USD"]}]

# Multi-site (multi-line — local .env only)
# PUBLIC__app__commerce__sites='[
#  {
#    "id": "RefArchGlobal",
#    "defaultLocale": "en-GB",
#    "defaultCurrency": "GBP",
#    "supportedLocales": [
#      {"id": "en-US", "preferredCurrency": "USD"},
#      {"id": "da-DK", "preferredCurrency": "EUR"},
#      {"id": "de-DE", "preferredCurrency": "EUR"},
#      {"id": "en-GB", "preferredCurrency": "GBP"},
#      {"id": "es-MX", "preferredCurrency": "USD"},
#      {"id": "fi-FI", "preferredCurrency": "EUR"},
#      {"id": "fr-FR", "preferredCurrency": "EUR"},
#      {"id": "it-IT", "preferredCurrency": "EUR"},
#      {"id": "ja-JP", "preferredCurrency": "JPY"},
#      {"id": "ko-KR", "preferredCurrency": "KRW"},
#      {"id": "nl-NL", "preferredCurrency": "EUR"},
#      {"id": "no-NO", "preferredCurrency": "EUR"},
#      {"id": "pl-PL", "preferredCurrency": "EUR"},
#      {"id": "pt-BR", "preferredCurrency": "BRL"},
#      {"id": "sv-SE", "preferredCurrency": "EUR"},
#      {"id": "zh-CN", "preferredCurrency": "CNY"},
#      {"id": "zh-TW", "preferredCurrency": "TWD"}
#    ],
#    "supportedCurrencies": ["EUR", "GBP"]
#  }
# ]'
```

See [README-MULTI-SITE.md](./README-MULTI-SITE.md) for site-context routing details.

### Hybrid Proxy (local development only)

Silent HTTP proxying with cookie rewriting for a unified storefront experience. Local-dev only — production routing should use Cloudflare eCDN. Requires `SFCC_ORIGIN` and `PUBLIC__app__defaultSiteId`.

```bash
# HYBRID_PROXY_ENABLED=true
# HYBRID_PROXY_LOCALE=en-GB
# HYBRID_ROUTING_RULES='(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/product.*" or http.request.uri.path matches "^/category.*" or http.request.uri.path matches "^/search.*" or http.request.uri.path matches "^/account.*" or http.request.uri.path matches "^/resource/.*")'
# SFCC_ORIGIN=https://zzrf-001.dx.commercecloud.salesforce.com
```

See [README-HYBRID-PROXY.md](./README-HYBRID-PROXY.md).

### Passwordless Login (Marketing Cloud)

```bash
# PUBLIC__app__features__passwordlessLogin__mode=email
# PUBLIC__app__features__passwordlessLogin__callbackUri='/passwordless-login-callback'
# PUBLIC__app__features__passwordlessLogin__landingUri='/login'
# PUBLIC__app__features__otpRequest__mode=email
# PUBLIC__app__features__otpRequest__callbackUri='https://example.com/otp-callback'
# PUBLIC__app__features__resetPassword__mode=email
# PUBLIC__app__features__resetPassword__callbackUri='/reset-password-callback'
# PUBLIC__app__features__resetPassword__landingUri='/reset-password'
```

When using `mode=email`, also set the server-only Marketing Cloud secrets (`MARKETING_CLOUD_*`) listed in the Server-only Secrets table above. See [README-AUTH.md](./README-AUTH.md).

### Turnstile bot protection

Cloudflare Turnstile is disabled by default. The test site key below always passes — production sites must set their own keys via MRT env vars.

```bash
# PUBLIC__security__turnstile__enabled=true
# PUBLIC__security__turnstile__sites={"local-dev":[{"siteKey":"1x00000000000000000000BB","domains":["localhost","127.0.0.1"]}]}
```

See [README-TURNSTILE.md](./README-TURNSTILE.md) and `e2e/feature-specs/checkout/turnstile-protection.spec.md`.

### Commerce Client (Cimulate)

```bash
# PUBLIC__app__cimulateAgent='{"enabled":true,"provider":"commerce-client","commerceClientScriptSourceUrl":"https://...","scrt2Url":"https://...","salesforceOrgId":"...","esDeveloperName":"..."}'
```

Set as a single JSON string. Required fields: `enabled`, `commerceClientScriptSourceUrl`, `scrt2Url`, `salesforceOrgId`, `esDeveloperName`. See `src/components/cimulate/README.md` for setup.

### Cookie domain

Sets the default `Domain` on every cookie the storefront writes — auth/session and site-context
(`site_id`, locale, currency). A per-site `commerce.sites[].cookies.domain` overrides it for that
site. Unset = host-only scoping; setting a domain is opt-in.

```bash
# PUBLIC__app__cookies__domain=.example.com
```

See [Cookie Domain Configuration](./README-COOKIE-DOMAIN.md) for the full guide, including the
matching Business Manager setting and rollout guidance.

### Refresh-token expiry overrides

If unset, the storefront uses the expiry returned by SCAPI.

```bash
# PUBLIC__app__commerce__api__guestRefreshTokenExpirySeconds=2592000        # ~30 days
# PUBLIC__app__commerce__api__registeredRefreshTokenExpirySeconds=7776000   # ~90 days
```

### Google Cloud API key (Address Autocomplete)

```bash
# PUBLIC__app__features__googleCloudAPI__apiKey=
```

### Logging

```bash
# SFCC_LOG_LEVEL=info   # error | warn | info | debug
```

Shared with the SDK logger (`storefront-next-dev`) for unified control.

### Managed Runtime deployment vars

Already in `.env.default` — listed here for completeness.

```bash
MRT_PROJECT=my-project-slug
MRT_TARGET=development
```

### Server-only SLAS secret (never prefix with `PUBLIC__`)

```bash
# COMMERCE_API_SLAS_SECRET=your-secret-here
```

Read directly from `process.env` in server-side code (loaders, actions, middleware).

### JSON configuration pattern

Complex values can be encoded as JSON strings — the merge mechanism parses any value that looks like JSON.

```bash
# Override multiple cart configuration values at once
# PUBLIC__app__pages__cart='{"quantityUpdateDebounce":1000,"maxQuantityPerItem":500,"enableSaveForLater":true}'
```

## Related

- [README-SECURITY-HEADERS.md](./README-SECURITY-HEADERS.md) — Security response headers config (`app.security.headers.*`)
