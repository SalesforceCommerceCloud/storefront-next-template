# SCAPI Clients: Overrides and Custom APIs

The storefront communicates with Salesforce B2C Commerce through **SCAPI (Salesforce Commerce API)** clients. The SDK ships with 16 built-in shopper clients (Shopper Products, Shopper Baskets, Shopper Search, etc.) and the `sfnext scapi` CLI lets you do two things on top of that:

1. **Override a built-in client** with a richer or newer schema — typically to expose `c_*` custom attributes with proper types, or to pick up SCAPI updates without waiting for an SDK release.
2. **Add a custom API** that you've deployed to B2C Commerce (e.g., a Loyalty API, Store Inventory API).

Both modes use the same command (`sfnext scapi add`) and produce type-safe TypeScript clients integrated with the existing middleware stack (auth, correlation IDs, maintenance detection).

## How template code consumes SCAPI types

All template code imports SCAPI types and clients from the local barrel `@/scapi`, **not** directly from `@salesforce/storefront-next-runtime/scapi`:

```typescript
// Correct — picks up overrides if any are registered
import { ShopperProducts, ApiError, type Clients } from '@/scapi';

// Wrong — bypasses the override mechanism (lint warns on this)
import { ShopperProducts } from '@salesforce/storefront-next-runtime/scapi';
```

When no overrides are registered, the barrel is a transparent re-export of the runtime types — there is no behavioral difference. When you register an override (e.g., `shopperProducts`), the barrel substitutes that one namespace with your locally-generated types while the other 15 still come from the runtime.

A lint rule (`no-restricted-imports` warning) flags any direct runtime imports outside `src/scapi/**` and `src/lib/api-clients.server.ts` to keep this invariant.

## Quick Start

### Override a built-in client (e.g., `shopperProducts`)

To replace the SDK's `shopperProducts` client with a customized schema:

```bash
sfnext scapi add custom shopper-products v1
```

…or with a local schema file:

```bash
sfnext scapi add --schema ./my-schemas/shopper-products-v1.yaml --name shopperProducts
```

Because `shopperProducts` is one of the 16 built-in client keys, the CLI registers this as an **override**. The runtime substitutes the SDK's `shopperProducts` client with yours; existing call sites that import via `@/scapi` automatically pick up the new types.

### Add a custom API

For an API that doesn't correspond to a built-in client:

```bash
sfnext scapi add --schema ./my-schemas/loyalty-api.yaml --name loyalty --base-path /custom/loyalty/v1
```

…or pull from B2C Commerce:

```bash
sfnext scapi add custom loyalty v1
```

The CLI registers this as a custom client. It appears as a new property on the clients object (`clients.loyalty`) alongside the built-in clients.

## CLI Commands

### `sfnext scapi add`

Add a SCAPI client override or a custom API.

**Two source modes** (orthogonal to override vs. custom — that distinction is derived from the client key):

| Source mode | Usage | When to use |
|------|-------|-------------|
| **Pull** | `sfnext scapi add <apiFamily> <apiName> <apiVersion>` | Fetch the schema from B2C Commerce |
| **Local** | `sfnext scapi add --schema <path> --name <key>` | Use a local OpenAPI schema file |

**Override vs. custom** is determined automatically: if the resolved client key matches one of the 16 built-in shopper clients (`shopperProducts`, `shopperBasketsV2`, `shopperLogin`, etc.) the entry is recorded as an override; otherwise it's a custom client.

**Flags:**

| Flag | Description |
|------|-------------|
| `--schema <path>` | Path to a local OpenAPI schema file (YAML or JSON) |
| `--name <key>` | Client key. For overrides, must match a built-in key (e.g., `shopperProducts`). For custom APIs, anything (e.g., `loyalty`). Auto-derived from `apiName` in pull mode. |
| `--base-path <path>` | SCAPI base path prefix. Auto-derived from the schema's `servers[].url` if not provided. |
| `--supports-locale` / `--no-supports-locale` | Whether the API accepts a `locale` query parameter (default: `false`). |

**Pull mode environment variables:**

| Variable | Description |
|----------|-------------|
| `SFCC_SHORTCODE` | SCAPI short code |
| `SFCC_TENANT_ID` | Tenant ID |
| `SFCC_OAUTH_CLIENT_ID` | OAuth client ID |
| `SFCC_OAUTH_CLIENT_SECRET` | OAuth client secret |

### `sfnext scapi list`

List registered SCAPI overrides and custom APIs:

```bash
sfnext scapi list
```

```
Registered SCAPI clients (2):

Overrides:
  shopperProducts
    Schema:  schemas/shopper-products-v1.yaml
    Base:    /product/shopper-products/v1
    Locale:  yes

Custom APIs:
  loyalty
    Schema:  schemas/loyalty-v1.yaml
    Base:    /custom/loyalty/v1
    Locale:  no
```

### `sfnext scapi remove`

Remove a registered entry and clean up generated files:

```bash
sfnext scapi remove shopperProducts
```

When the last override is removed, `src/scapi/index.ts` regenerates back to the default wildcard re-export of the runtime types.

## How It Works

### Generated File Structure

```
src/scapi/
├── index.ts                           # Barrel — only SCAPI import surface for template code (generated)
├── custom-clients.ts                  # Declarative registry of overrides + customs (generated)
├── generated/
│   ├── shopper-products-v1.ts         # TypeScript types (override)
│   ├── shopper-products-v1.operations.ts
│   ├── shopper-products-v1.namespace.ts # Namespace wrapper for overrides only
│   ├── loyalty-v1.ts                  # TypeScript types (custom)
│   └── loyalty-v1.operations.ts
└── schemas/
    ├── shopper-products-v1.yaml       # Source OpenAPI schema
    ├── shopper-products-v1.meta.json  # Sidecar (clientKey, basePath, kind, ...)
    ├── loyalty-v1.yaml
    └── loyalty-v1.meta.json
```

> **Do not edit generated files manually.** They are regenerated on every `sfnext scapi` invocation. The `generated/` tree is excluded from OxLint (`ignorePatterns` in `.oxlintrc.json`) and Biome (`files.includes` negations in `biome.json`).

### The Barrel (`src/scapi/index.ts`)

With no overrides registered, the barrel is a transparent re-export:

```typescript
export * from '@salesforce/storefront-next-runtime/scapi';
export { customClients, type AppClients } from './custom-clients';
```

When you register an override, the barrel switches to an explicit re-export list and substitutes the overridden namespace from a local file:

```typescript
export {
    ShopperAvailability, ShopperBasketsV1, ShopperBasketsV2, /* ... */ ShopperStores,
    createCommerceApiClients, createClient, /* ... */
    type Client, type Clients, type Middleware, /* ... */
} from '@salesforce/storefront-next-runtime/scapi';

export { ShopperProducts } from './generated/shopper-products-v1.namespace';
export { customClients, type AppClients } from './custom-clients';
```

Call sites stay byte-identical (`ShopperProducts.schemas['Product']` still works) — the type just resolves to your locally-generated namespace.

### The Client Registry (`src/scapi/custom-clients.ts`)

```typescript
export type AppClients = MergeClients<Clients, {
    shopperProducts: ProxyClient<Client<P0>, typeof ops0>;
    loyalty: ProxyClient<Client<P1>, typeof ops1>;
}>;

export const customClients = [
    { key: 'shopperProducts', basePath: '/product/shopper-products/v1', ops: ops0, locale: true, orgPrefix: false, kind: 'override' },
    { key: 'loyalty', basePath: '/custom/loyalty/v1', ops: ops1, locale: false, orgPrefix: true, kind: 'custom' },
] as const;
```

Each entry:

| Field | Description |
|-------|-------------|
| `key` | Property name on the clients object (e.g., `clients.loyalty`); for overrides, matches a built-in key |
| `basePath` | SCAPI base path prefix for all operations |
| `ops` | Generated operation map linking method names to HTTP verbs and paths |
| `locale` | Whether to include `locale` in global query parameters |
| `orgPrefix` | When `true`, injects `/organizations/{organizationId}` into the base URL |
| `kind` | `'override'` (replaces a built-in client) or `'custom'` (additional client) |

### Runtime Integration (`src/lib/api-clients.server.ts`)

`createApiClients()` constructs the SDK clients via `createCommerceApiClients`, then walks the registry:

- **Override entries** replace the SDK client in place: `clients.shopperProducts` points at the override's `ProxyClient`. Middleware registered via `clients.use(...)` is propagated to the override.
- **Custom entries** are added as new properties on the clients object.
- **Auth and basket helpers** (`clients.auth`, `clients.basket`) are rebuilt against the active clients when their underlying clients (`shopperLogin` / `shopperBasketsV2`) are overridden, keeping the helpers consistent with what the application actually talks to.

All clients share the same middleware stack: auth (Bearer tokens, `sfdc_dwsid`), correlation IDs, identifying headers, and maintenance detection.

## Using Clients in Your Code

```typescript
import { createApiClients } from '@/lib/api-clients';
import type { ShopperProducts } from '@/scapi';

export async function loader({ context }: LoaderFunctionArgs) {
    const clients = createApiClients(context);

    // Built-in client — types come from the override if one is registered, otherwise the SDK
    const { data: product } = await clients.shopperProducts.getProduct({
        params: { path: { id: 'my-product-id' } },
    });

    // Custom client
    const { data: rewards } = await clients.loyalty.getLoyaltyRewards();

    // Type-safe access to overridden namespace
    const customAttr: string | undefined = product?.c_loyaltyTier;

    return { product, rewards };
}
```

The `AppClients` type from `@/scapi` ensures both built-in (possibly overridden) and custom clients are fully typed.

## Upgrading from earlier SDK versions

Prior SDK versions did not have a barrel — template code imported SCAPI types directly from `@salesforce/storefront-next-runtime/scapi`. With this release, that import path still works (the barrel re-exports from it), but it **does not pick up overrides**.

**The migration is gradual-safe:**

- A file still importing from `@salesforce/storefront-next-runtime/scapi` continues to compile and run. It just keeps seeing the SDK's frozen types instead of an override.
- A lint warning (`no-restricted-imports`) flags every such import in `src/**` so you can drive the migration to zero at your own pace.
- To start using overrides for a given file, change its import specifier from `@salesforce/storefront-next-runtime/scapi` to `@/scapi`. No other change is needed — the imported names stay the same.

The two files exempted from the lint rule are `src/scapi/**` (the barrel itself) and `src/lib/api-clients.server.ts` (which legitimately wires the runtime SDK to the template).
