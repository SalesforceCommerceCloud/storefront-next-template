# SCAPI Client

A type-safe, operation-based API client for Salesforce B2C Commerce Shopper APIs (SCAPI), built on top of `openapi-fetch` with custom operation mapping and TypeScript Proxy-based method routing.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
  - [Configuration](#configuration)
  - [Auth Namespace API](#auth-namespace-api)
  - [Usage Examples](#authentication-usage-examples)
  - [Stateless Design](#stateless-design)
- [Architecture](#architecture)
- [Libraries Used](#libraries-used)
- [Why Operation-Based Interface?](#why-operation-based-interface)
- [How It Works](#how-it-works)
  - [Type Generation](#type-generation)
  - [Operation Mapping Generation](#operation-mapping-generation)
  - [Proxy Client Creation](#proxy-client-creation)
- [The Proxy Implementation](#the-proxy-implementation)
- [Why proxy-types.ts?](#why-proxy-typests)
- [Package Scripts](#package-scripts)
- [Usage Examples](#usage-examples)
- [Updating to New OpenAPI Specifications](#updating-to-new-openapi-specifications)
- [API Options and Middleware](#api-options-and-middleware)
- [References](#references)

## Overview

The SCAPI client provides a developer-friendly, type-safe interface for calling Salesforce B2C Commerce Shopper APIs. Instead of using generic HTTP methods with path strings, developers can call operations by their semantic names with full TypeScript autocomplete and type checking.

## Authentication

The SCAPI client includes a built-in `auth` namespace that provides a unified, type-safe interface for all SLAS (Shopper Login and Session API) authentication operations. All auth methods are accessible via `clients.auth.*` with full IDE autocomplete and TypeScript support.

### Configuration

To enable authentication, provide the required auth parameters when creating the clients:

```typescript
import { createCommerceApiClients } from '@salesforce/storefront-next-runtime/scapi';

const clients = createCommerceApiClients({
  // Standard parameters
  baseUrl: 'https://shortcode.api.commercecloud.salesforce.com',
  organizationId: 'f_ecom_xxx',
  siteId: 'RefArch',

  // Auth parameters (required for clients.auth.*)
  clientId: 'your-slas-client-id',
  redirectUri: 'https://yoursite.com/callback',

  // Optional: enables private SLAS client features (passwordless, etc.)
  clientSecret: process.env.COMMERCE_API_SLAS_SECRET,
});
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `clientId` | Yes | SLAS client ID from Account Manager |
| `redirectUri` | Yes | OAuth redirect URI (must be registered in SLAS configuration) |
| `clientSecret` | No | SLAS client secret for private client operations |

### Auth Namespace API

#### Core Authentication (`clients.auth.*`)

```typescript
// Guest login - auto-detects public vs private SLAS based on clientSecret
loginAsGuest(options?: {
  usid?: string;   // Link to existing session
  dnt?: boolean;   // Do Not Track flag
}): Promise<TokenResponse>

// Registered user login with credentials
loginWithCredentials(options: {
  username: string;
  password: string;
  usid?: string;
  dnt?: boolean;
}): Promise<TokenResponse>

// Refresh an access token
refreshToken(options: {
  refreshToken: string;
  dnt?: boolean;
}): Promise<TokenResponse>

// Logout and revoke tokens
logout(options: {
  accessToken: string;
  refreshToken: string;
}): Promise<TokenResponse>
```

#### Social/IDP Login (`clients.auth.social.*`)

```typescript
// Get authorization URL for social login (Google, Facebook, Apple, etc.)
getAuthorizationUrl(options: {
  hint: string;           // IDP identifier: 'google', 'facebook', 'apple', etc.
  redirectUri?: string;   // Override default redirect URI
  usid?: string;
}): Promise<{
  url: string;            // Redirect user to this URL
  codeVerifier: string;   // Store securely, needed for exchangeCode()
}>

// Exchange authorization code for tokens (after user returns from IDP)
exchangeCode(options: {
  code: string;           // Authorization code from callback
  codeVerifier: string;   // The codeVerifier from getAuthorizationUrl()
  redirectUri: string;    // Must match the URI used for authorization
  usid?: string;
  dnt?: boolean;
}): Promise<TokenResponse>
```

#### Passwordless Login (`clients.auth.passwordless.*`)

> **Note:** Requires `clientSecret` to be configured (private SLAS client only)

```typescript
// Send magic link or SMS code
authorize(options: {
  userId: string;              // Email or phone number
  callbackUri?: string;        // Required for 'callback' mode
  mode?: 'callback' | 'sms';   // Default: 'callback'
  usid?: string;
}): Promise<ApiResponse>

// Exchange passwordless token for access tokens
exchangeToken(options: {
  pwdlessLoginToken: string;   // Token from magic link or SMS
  usid?: string;
  dnt?: boolean;
}): Promise<ApiResponse<TokenResponse>>
```

#### Password Management (`clients.auth.password.*`)

```typescript
// Request password reset email
requestReset(options: {
  userId: string;       // User's email address
  callbackUri: string;  // Password reset page URL
}): Promise<ApiResponse>

// Reset password with token from email
reset(options: {
  userId: string;
  token: string;        // Token from reset email
  newPassword: string;
}): Promise<ApiResponse>
```

### Authentication Usage Examples

#### Guest Login

```typescript
// Simple guest login
const tokens = await clients.auth.loginAsGuest();
console.log('Access token:', tokens.access_token);
console.log('Refresh token:', tokens.refresh_token);

// Guest login with session linking (e.g., to preserve cart)
const tokens = await clients.auth.loginAsGuest({
  usid: existingSessionId,
});
```

#### Registered User Login

```typescript
const tokens = await clients.auth.loginWithCredentials({
  username: 'user@example.com',
  password: 'password123',
  usid: guestUsid, // Optional: merge guest cart with registered user
});

console.log('Customer ID:', tokens.customer_id);
```

#### Token Refresh

```typescript
const newTokens = await clients.auth.refreshToken({
  refreshToken: storedRefreshToken,
});

// Update stored tokens
storeTokens(newTokens);
```

#### Social Login (Google Example)

```typescript
// Step 1: Get authorization URL (on "Login with Google" click)
const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
  hint: 'google',
});

// Store codeVerifier securely (e.g., httpOnly cookie)
setCookie('code_verifier', codeVerifier, { httpOnly: true, maxAge: 300 });

// Redirect user to Google
redirect(url);

// Step 2: Handle callback (user returns from Google)
const code = getQueryParam('code');
const storedCodeVerifier = getCookie('code_verifier');

const tokens = await clients.auth.social.exchangeCode({
  code,
  codeVerifier: storedCodeVerifier,
  redirectUri: 'https://yoursite.com/social-callback',
});

// Clear code verifier and store tokens
deleteCookie('code_verifier');
storeTokens(tokens);
```

#### Passwordless Login

```typescript
// Step 1: Send magic link
await clients.auth.passwordless.authorize({
  userId: 'user@example.com',
  callbackUri: 'https://yoursite.com/passwordless-callback',
  mode: 'callback',
});

// Step 2: Exchange token (when user clicks magic link)
const pwdlessToken = getQueryParam('dwsgst'); // Token from URL
const { data: tokens } = await clients.auth.passwordless.exchangeToken({
  pwdlessLoginToken: pwdlessToken,
});
```

#### Password Reset

```typescript
// Step 1: Request reset email
await clients.auth.password.requestReset({
  userId: 'user@example.com',
  callbackUri: 'https://yoursite.com/reset-password',
});

// Step 2: Reset password (when user submits new password)
const resetToken = getQueryParam('dwrt'); // Token from URL
await clients.auth.password.reset({
  userId: 'user@example.com',
  token: resetToken,
  newPassword: 'newSecurePassword123',
});
```

#### Logout

```typescript
await clients.auth.logout({
  accessToken: currentAccessToken,
  refreshToken: currentRefreshToken,
});

// Clear stored tokens
clearTokens();
```

### Stateless Design

The auth namespace is intentionally **stateless** - it does not store tokens, session data, or any intermediate state internally. This design provides:

1. **SSR Compatibility** - Each HTTP request gets isolated state, avoiding shared singleton issues
2. **Maximum Flexibility** - Applications choose their own storage strategy (cookies, localStorage, Redis, etc.)
3. **No Vendor Lock-in** - No opinionated state management that could block customizations
4. **Testability** - Pure functions with no hidden state are easier to test
5. **Predictability** - No hidden state mutations that could cause subtle bugs

**What you need to manage:**

| Data | When to Store | Storage Recommendation |
|------|---------------|------------------------|
| `access_token` | After any login | Short-lived cookie (~30 min) |
| `refresh_token` | After any login | httpOnly cookie (30-90 days) |
| `usid` | After any login | Cookie (same expiry as refresh token) |
| `codeVerifier` | During social login flow | httpOnly cookie (5 min expiry) |
| `customer_id` | After registered login | Cookie or session storage |

## Architecture

The SCAPI client architecture consists of several layers:

1. **OpenAPI Specifications** - YAML files defining the SCAPI endpoints
2. **Generated TypeScript Types** - Type definitions generated from OpenAPI specs
3. **Generated Operation Maps** - Runtime mappings between operation names and HTTP methods/paths
4. **Proxy Client Wrapper** - JavaScript Proxy that intercepts method calls and routes them to the appropriate HTTP methods
5. **Type-Safe Client API** - The final exported clients with full type inference

```
OpenAPI Spec (.yaml)
        ↓
openapi-typescript (generates types)
        ↓
TypeScript Definitions (.ts)
        ↓
generate-operation-maps.ts (extracts runtime mappings)
        ↓
Operation Maps (.operations.ts)
        ↓
createClient (wraps with Proxy)
        ↓
Type-Safe Operation Methods
```

## Libraries Used

### [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)

A lightweight, type-safe fetch client for OpenAPI 3.x specifications. Key features:

- Full TypeScript type inference from OpenAPI schemas
- Built on native `fetch` API
- Middleware support for request/response interception
- Minimal runtime overhead
- Native support for parameters, headers, and response types

**Why openapi-fetch?**
- Native TypeScript support with excellent type inference
- Zero dependencies beyond native fetch
- Flexible middleware system
- Good balance between features and bundle size

### [openapi-typescript](https://openapi-ts.dev/introduction)

A tool that generates TypeScript types from OpenAPI specifications. It transforms OpenAPI YAML/JSON into TypeScript interfaces and types.

**Generated structure:**
```typescript
export interface paths {
  "/organizations/{organizationId}/products": {
    get: operations["getProducts"];
    // ... other HTTP methods
  };
}

export interface operations {
  getProducts: {
    parameters: { /* ... */ };
    responses: { /* ... */ };
  };
}
```

**Why openapi-typescript?**
- Zero runtime overhead (types only)
- Accurate type generation from OpenAPI specs
- Supports OpenAPI 3.x features
- Integrates seamlessly with openapi-fetch

## Why Operation-Based Interface?

The `openapi-typescript` generator provides excellent type definitions but does **not** include runtime mappings between operation names and their corresponding paths/methods. The generated types require you to use the path-based syntax:

```typescript
client.GET('/organizations/{organizationId}/products', options)
```

However, OpenAPI specifications define semantic operation names (like `getProducts`, `createBasket`) via the `operationId` field. An operation-based interface is more:

- **Developer-friendly**: Semantic method names are easier to discover and remember
- **Refactor-safe**: Path changes don't break calling code
- **IDE-friendly**: Better autocomplete and documentation tooltips
- **Self-documenting**: Method names describe what the operation does

To achieve this, we added an extra build step that:

1. Parses the generated TypeScript type definitions
2. Extracts the runtime mapping between operation names, HTTP methods, and path templates
3. Generates operation map files with this runtime information
4. Uses these maps to create a Proxy-based client that transforms operation calls into HTTP method calls

## How It Works

### Type Generation

TypeScript types are generated using `openapi-typescript` with configuration in `redocly.yaml`:

```yaml
apis:
  shopper-products-v1:
    root: ./shopper-products-oas-1.0.37/shopper-products-oas-v1-public.yaml
    x-openapi-ts:
      output: ../src/scapi-client/generated/shopper-products-v1.ts
```

Running `pnpm scapi:generate-types`:

This generates TypeScript files like `shopper-products-v1.ts` containing:
- `paths` interface - Maps URL paths to operations
- `operations` interface - Defines request/response types for each operation
- `components` interface - Shared schemas, parameters, etc.

### Operation Mapping Generation

Since `openapi-typescript` doesn't provide runtime path-to-operation mappings, we generate them with a custom script: `scripts/generate-operation-maps.ts`.

**What it does:**

1. Reads each generated TypeScript file
2. Parses the `paths` interface to extract:
   - Path template (e.g., `/organizations/{organizationId}/products`)
   - HTTP method (e.g., `get`)
   - Operation name (e.g., `getProducts`)
3. Analyzes paths to find common base path prefix
4. Creates optimized runtime mapping with abbreviated keys

**Bundle Size Optimizations:**

The generation script applies two optimizations to reduce bundle size:

1. **Base Path Extraction**: The longest common path prefix across ALL operations is extracted into a `BASE_PATH` constant to eliminate repetition
2. **Abbreviated Keys**: Property names use single letters (`m`, `b`, `s`) instead of full words

**Example parsing:**
```typescript
// Input (generated type):
export interface paths {
  "/organizations/{organizationId}/baskets": {
    post: operations["createBasket"];
  };
  "/organizations/{organizationId}/baskets/{basketId}": {
    get: operations["getBasket"];
  };
}

// Output (optimized operation map with maximum base path extraction):
export const BASE_PATH = '/organizations/{organizationId}/baskets' as const;

export const operations = {
  createBasket: {
    m: 'POST' as const,     // m = method
    b: BASE_PATH,            // b = base path
    s: ''                    // s = suffix (can be empty!)
  },
  getBasket: {
    m: 'GET' as const,
    b: BASE_PATH,
    s: '/{basketId}'         // s = suffix (shorter than before)
  }
} as const;
```

The script uses regex to parse the TypeScript source and generates `*.operations.ts` files with runtime mappings.

**Example generated file (`shopper-baskets-v1.operations.ts`):**

```typescript
/**
 * Auto-generated operation map for shopper-baskets-v1
 *
 * This file maps operation names to their HTTP method and path template.
 * Generated by scripts/generate-operation-maps.ts
 *
 * Optimizations applied:
 * - Base path extraction: Saves ~1443 bytes
 * - Abbreviated keys: Saves ~481 bytes (m=method, b=base, s=suffix)
 * - Total savings: ~1924 bytes
 *
 * Property abbreviations:
 * - m: HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
 * - b: Base path shared across operations
 * - s: Suffix path unique to this operation
 *
 * DO NOT EDIT MANUALLY - Changes will be overwritten on next generation
 */

export const BASE_PATH = '/organizations/{organizationId}/baskets' as const;

export const operations = {
  createBasket: { m: 'POST' as const, b: BASE_PATH, s: '' },
  getBasket: { m: 'GET' as const, b: BASE_PATH, s: '/{basketId}' },
  deleteBasket: { m: 'DELETE' as const, b: BASE_PATH, s: '/{basketId}' },
  addItemToBasket: { m: 'POST' as const, b: BASE_PATH, s: '/{basketId}/items' }
} as const;
```

This generated file provides the runtime information needed by the Proxy to route operation method calls to the correct HTTP methods and paths. At runtime, the full path is reconstructed by concatenating `b + s`. Note that some operations may have an empty suffix (`s: ''`) when the operation's path exactly matches the BASE_PATH.

### Proxy Client Creation

The `createClient` function wraps an `openapi-fetch` client with a JavaScript Proxy that:

1. Intercepts property access on the client
2. Checks if the property is an operation name
3. If yes, returns a function that:
   - Looks up the operation's HTTP method (m), base path (b), and suffix (s)
   - Reconstructs the full path by concatenating `b + s`
   - Calls the underlying client's HTTP method with the reconstructed path
4. If no, passes through middleware methods (`use`, `eject`)

**Flow:**
```
client.getProducts(options)
        ↓
Proxy intercepts "getProducts"
        ↓
Looks up in operation map: { m: 'GET', b: BASE_PATH, s: '/products' }
        ↓
Reconstructs path: BASE_PATH + '/products' = '/organizations/{organizationId}/products'
        ↓
Calls: client.GET(path, options)
        ↓
Returns: Promise<Response>
```

## The Proxy Implementation

The Proxy implementation in `createClient.ts` uses JavaScript's [Proxy API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) to intercept property access and method calls.

**Key Proxy traps:**

### `get` trap
Intercepts property access. Returns:
- Operation method function if the property is an operation name
- Middleware methods (`use`, `eject`) if accessing those
- `undefined` for all other properties (hiding HTTP methods like `GET`, `POST`)

```typescript
get(target, prop) {
  if (typeof prop === 'string' && prop in operations) {
    const operationInfo = operations[prop];
    // Extract abbreviated keys: m=method, b=base, s=suffix
    const { m: method, b: base, s: suffix } = operationInfo;
    // Reconstruct full path from base + suffix
    const path = base + suffix;
    return function (...args) {
      return target[method.toUpperCase()](path, ...args);
    };
  }
  if (prop === 'use' || prop === 'eject') {
    return target[prop].bind(target);
  }
  return undefined;
}
```

### `has` trap
Controls `in` operator and property existence checks. Returns `true` only for:
- Operation methods
- Middleware methods (`use`, `eject`)

### `ownKeys` trap
Controls `Object.keys()` and enumeration. Returns only:
- Operation method names
- Middleware method names

This design ensures that:
- Only operation methods and middleware are accessible
- HTTP methods (GET, POST, etc.) are hidden from the API surface
- The client API is clean and focused
- TypeScript types match the runtime behavior

## Why proxy-types.ts?

The `proxy-types.ts` file contains complex TypeScript type definitions that enable full type safety for the Proxy-based client. Without these types, TypeScript cannot infer the correct parameter and return types for dynamically created methods.

**Key type utilities:**

### `OperationMethod<TClient, TOperation>`
Constructs the type signature for a single operation method by:
1. Extracting the path from the operation info
2. Looking up the operation definition in the client's paths type
3. Inferring parameter types from `FetchOptions`
4. Inferring return types from `FetchResponse`
5. Making parameters optional if no required keys exist

### `ProxyClient<TClient, TOperations>`
Creates the final client interface by:
1. Mapping each operation name to its `OperationMethod` type
2. Including middleware methods (`use`, `eject`) from the base client
3. Excluding HTTP method properties (GET, POST, etc.)

### `ResolvedFetchOptions<OpDef>`
Expands the `FetchOptions` type for better IDE tooltips, showing actual properties like `params` instead of opaque type references.

**Why it's necessary:**

Without these types, the Proxy would work at runtime but TypeScript would lose all type information:
- No autocomplete for method names
- No type checking for parameters
- No inference of response types
- Developers would need to manually cast types

With `proxy-types.ts`, TypeScript can:
- Infer all operation methods from the operation map
- Type-check parameters against the OpenAPI specification
- Infer response types correctly
- Provide accurate IDE tooltips and documentation

## Package Scripts

The following npm scripts are available in `package.json`:

### Generation Scripts

```json
{
  "scapi:generate-types": "openapi-typescript -c ./openapi-specs/redocly.yaml",
  "scapi:generate-operations": "pnpm dlx tsx scripts/generate-operation-maps.ts",
  "scapi:generate": "pnpm scapi:generate-types && pnpm scapi:generate-operations",
  "scapi:update-specs": "pnpm dlx tsx scripts/update-scapi-specs.ts"
}
```

- **`scapi:generate-types`**: Generates TypeScript type definitions from OpenAPI specs
- **`scapi:generate-operations`**: Generates operation mapping files from generated types
- **`scapi:generate`**: Runs both generation steps in sequence (recommended)
- **`scapi:update-specs`**: Downloads the latest released specs from Anypoint Exchange, swaps the spec folders, rewrites `redocly.yaml`, and regenerates the client. Pass `--check` for a dry run that exits non-zero when a spec has drifted. See [Updating to New OpenAPI Specifications](#updating-to-new-openapi-specifications).

### Usage

To regenerate all client types and operations:

```bash
pnpm scapi:generate
```

## Usage Examples

### Basic Usage

```typescript
import { createCommerceApiClients, ApiError } from '@salesforce/storefront-next-runtime';

// Create all SCAPI clients
const clients = createCommerceApiClients({
  baseUrl: 'https://your-instance.api.commercecloud.salesforce.com'
});

// Call operations with full type safety
try {
  const { data, response } = await clients.shopperProducts.getProduct({
    params: {
      path: {
        organizationId: 'f_ecom_zzxy_prd',
        id: 'product-123'
      },
      query: {
        siteId: 'RefArch',
        allImages: true
      }
    }
  });

  console.log('Product:', data); // Fully typed from OpenAPI spec
  console.log('ETag:', response.headers.get('etag')); // Access response headers
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API error:', error.status, error.body);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### With Custom Fetch

```typescript
const clients = createCommerceApiClients({
  baseUrl: 'https://your-instance.api.commercecloud.salesforce.com',
  fetch: customFetch // e.g., with auth headers, logging, etc.
});
```

### With Middleware

Middleware can intercept and modify requests/responses:

```typescript
// Add auth middleware to all clients
clients.use((req, options) => {
  req.headers.set('Authorization', `Bearer ${getAccessToken()}`);
  return req;
});

// Or add middleware to a specific client
clients.shopperBaskets.use((req, options) => {
  console.log('Making request to:', req.url);
  return req;
});
```

### Available Clients

```typescript
clients.shopperAvailability  // Product availability/inventory
clients.shopperBasketsV1     // Basket operations (v1)
clients.shopperBasketsV2     // Basket operations (v2)
clients.shopperConsents      // Consent management
clients.shopperContext       // Context/session operations
clients.shopperCustomers     // Customer management
clients.shopperExperience    // Experience/page content
clients.shopperGiftCertificates  // Gift certificate operations
clients.shopperLogin         // Authentication
clients.shopperOrders        // Order management
clients.shopperProducts      // Product catalog
clients.shopperPromotions    // Promotions and campaigns
clients.shopperSearch        // Search operations
clients.shopperSeo           // SEO metadata
clients.shopperStores        // Store locator
```

## Updating to New OpenAPI Specifications

Spec updates are **automated** — you should rarely do this by hand.

### Automated (default)

The [`SCAPI Spec Update`](../../../../.github/workflows/scapi-spec-update.yml) workflow runs `pnpm scapi:update-specs` weekly (and on demand via *Run workflow*). For every spec tracked in `openapi-specs/redocly.yaml`, it asks Anypoint Exchange for the latest released (`MAJOR.MINOR.PATCH`) version whose major matches the tracked API version (e.g. `shopper-baskets` `v2` ↔ `2.x.x`), and when a newer one exists it downloads the spec, swaps the folder, rewrites `redocly.yaml`, regenerates the client, and opens a PR. Reviewing the spec + generated diff on that PR is part of the [release process](../../../../CONTRIBUTING.md) so the shipped client never silently drifts behind the live APIs.

The Exchange coordinates come from each spec folder's `exchange.json` (`groupId` / `assetId` / `version` / `apiVersion`) — that file is the source of truth for what we ship and what to diff against.

To run it locally (requires `ANYPOINT_USERNAME` / `ANYPOINT_PASSWORD`):

```bash
cd packages/storefront-next-runtime

# Dry run — report drift, exit non-zero if any spec is outdated. No writes.
pnpm scapi:update-specs --check

# Apply: download new specs, swap folders, rewrite redocly.yaml, regenerate.
pnpm scapi:update-specs
```

Then review `git diff openapi-specs/ src/scapi-client/generated/`, run `pnpm test`, and commit.

### Manual fallback

If the automation is unavailable (e.g. a spec not yet on Exchange, or a pre-release you need to pin), update by hand:

1. **Download the spec** and replace the folder under `openapi-specs/` (keep the `<assetId>-<version>` naming and the `exchange.json` descriptor).
2. **Point `redocly.yaml`** at the new `root:` path for that api entry.
3. **Regenerate** with `pnpm scapi:generate` (types + operation maps).
4. **Review** `git diff src/scapi-client/generated/` for breaking vs. non-breaking changes.
5. **Test** with `pnpm test` and `pnpm typecheck`.
6. **Commit** both `openapi-specs/` and the regenerated `src/scapi-client/generated/`.

**Note:** While the generated files are checked into git, they should be treated as build artifacts. Always regenerate them rather than manually editing.

## API Options and Middleware

The SCAPI client leverages `openapi-fetch` capabilities for request configuration and middleware.

### Request Options

Each operation method accepts a `FetchOptions` object with these properties:

```typescript
{
  params?: {
    path?: { /* path parameters */ },
    query?: { /* query parameters */ },
    header?: { /* header parameters */ },
    cookie?: { /* cookie parameters */ }
  },
  body?: /* request body (for POST/PUT/PATCH) */,
  headers?: HeadersInit,              // Custom HTTP headers
  parseAs?: "json" | "text" | "blob" | "arrayBuffer" | "stream",
  baseUrl?: string,                   // Override base URL
  querySerializer?: QuerySerializer,  // Custom query serialization
  bodySerializer?: BodySerializer,    // Custom body serialization
  fetch?: typeof fetch,               // Custom fetch implementation
  middleware?: Middleware[]           // Request-specific middleware
}
```

### Query Parameter Serialization

The SCAPI client includes a smart default query serializer that handles B2C Commerce API requirements automatically.

#### Default Behavior

**Comma-separated arrays (most parameters):**
```typescript
// Input
await clients.shopperProducts.getProduct({
  params: {
    query: {
      expand: ['images', 'prices', 'variations']
    }
  }
});

// Generated URL
// ?expand=images,prices,variations
```

**Repeated parameters (whitelisted):**
```typescript
// Input - individual refinements
await clients.shopperSearch.productSearch({
  params: {
    query: {
      refine: ['c_refinementColor=Black', 'c_refinementColor=Green', 'price=(0..20)']
    }
  }
});

// SDK automatically groups by attribute ID:
// ['c_refinementColor=Black|Green', 'price=(0..20)']

// Generated URL
// ?refine=c_refinementColor=Black|Green&refine=price=(0..20)
```

#### How It Works

The default query serializer (`defaultQuerySerializer`) provides two key features:

1. **Automatic Grouping**: For whitelisted parameters like `refine`, the serializer automatically groups values by attribute ID
   - Input: `['c_color=Black', 'c_color=Green', 'price=(0..10)']`
   - Grouped: `['c_color=Black|Green', 'price=(0..10)']`
   - Multiple values for the same attribute are combined with pipes (`|`)

2. **Smart Serialization**: Different parameters use different serialization strategies
   - **Comma-separated** (`explode: false`): Most array parameters like `expand`
   - **Repeated** (`explode: true`): Whitelisted parameters like `refine`

**Whitelisted parameters using repeated format:**
- `refine` - Product search refinements

**Example configuration in `defaultQuerySerializer.ts`:**
```typescript
const EXPLODED_PARAMS = ['refine'];  // Repeated parameters
const GROUPED_PARAMS = ['refine'];   // Auto-grouping by attribute ID
```

#### Customizing Query Serialization

You can override the default serializer if needed:

```typescript
import { createQuerySerializer } from 'openapi-fetch';

const clients = createCommerceApiClients({
  baseUrl: 'https://your-instance.api.commercecloud.salesforce.com',
  querySerializer: createQuerySerializer({
    array: {
      style: 'form',
      explode: true  // All arrays use repeated format
    }
  })
});
```

Or create a custom serializer function:

```typescript
const clients = createCommerceApiClients({
  baseUrl: 'https://your-instance.api.commercecloud.salesforce.com',
  querySerializer: (queryParams) => {
    // Custom serialization logic
    return new URLSearchParams(/* ... */).toString();
  }
});
```

### Middleware

Middleware allows you to intercept and modify requests and responses. Common use cases:

- Adding authentication headers
- Logging requests/responses
- Error handling and retries
- Request/response transformation
- Caching

**Example: Auth Middleware**

```typescript
import type { Middleware } from 'openapi-fetch';

const authMiddleware: Middleware = {
  async onRequest(req, options) {
    const token = await getAccessToken();
    req.headers.set('Authorization', `Bearer ${token}`);
    return req;
  },

  async onResponse(res, options) {
    if (res.status === 401) {
      await refreshToken();
      // Optionally retry the request
    }
    return res;
  }
};

clients.use(authMiddleware);
```

**Example: Logging Middleware**

```typescript
const loggingMiddleware: Middleware = {
  async onRequest(req) {
    console.log(`[API] ${req.method} ${req.url}`);
    return req;
  },

  async onResponse(res) {
    console.log(`[API] ${res.status} ${res.url}`);
    return res;
  }
};

clients.shopperProducts.use(loggingMiddleware);
```

### Response Format

All operations return a Promise with this structure on success:

```typescript
{
  data: T,           // Response data (fully typed from OpenAPI spec)
  response: Response // Raw fetch Response object with headers, status, etc.
}
```

On error (non-2xx status), the operation throws an `ApiError`:

```typescript
// Success case
const { data, response } = await clients.shopperProducts.getProduct(options);
console.log(data.name); // Fully typed
console.log(response.headers.get('etag')); // Access response headers

// Error case - use try/catch
try {
  const { data } = await clients.shopperProducts.getProduct(options);
  console.log(data);
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', error.status, error.body);
  }
}
```

### Error Handling

The SCAPI client throws typed `ApiError` exceptions for all non-2xx HTTP responses, aligning with standard Fetch API behavior.

For non-SLAS endpoints, a **401** response is classified as an `AuthTokenInvalidError` to signal that the access token is invalid or revoked. SLAS auth endpoints continue to throw `ApiError` for 401s.

#### ApiError Properties

The `ApiError` class provides comprehensive error information:

```typescript
class ApiError<TBody = unknown> extends Error {
  status: number;         // HTTP status code (404, 500, etc.)
  statusText: string;     // HTTP status text ("Not Found", "Internal Server Error")
  headers: Headers;       // Response headers object
  body: TBody;           // Parsed response body (typed from OpenAPI spec)
  rawBody: string;       // Raw response body as text
  url: string;           // Request URL that caused the error
  method: string;        // HTTP method (GET, POST, etc.)
}
```

#### Error Handling Patterns

**Basic Error Handling:**

```typescript
import { ApiError } from '@salesforce/storefront-next-runtime';

try {
  const { data } = await clients.shopperProducts.getProduct({
    params: {
      path: { organizationId: 'org123', id: 'invalid-id' },
      query: { siteId: 'RefArch' }
    }
  });
  console.log(data);
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`Error ${error.status}: ${error.statusText}`);
    console.error('Error details:', error.body);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Accessing Error Details:**

```typescript
try {
  const { data } = await clients.shopperBaskets.createBasket(options);
} catch (error) {
  if (error instanceof ApiError) {
    // Access all error properties
    console.log('Status:', error.status);              // 404
    console.log('Status Text:', error.statusText);     // "Not Found"
    console.log('Error Body:', error.body);            // Typed error response
    console.log('Raw Body:', error.rawBody);           // Raw response text
    console.log('Headers:', error.headers);            // Headers object
    console.log('URL:', error.url);                    // Request URL
    console.log('Method:', error.method);              // "POST"
    
    // Access specific headers
    const rateLimitRemaining = error.headers.get('x-rate-limit-remaining');
    const contentType = error.headers.get('content-type');
  }
}
```

**Handling Specific Error Codes:**

```typescript
try {
  const { data } = await clients.shopperCustomers.getCustomer(options);
} catch (error) {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        // Handle unauthorized
        await refreshAccessToken();
        break;
      case 404:
        // Handle not found
        console.log('Customer not found');
        break;
      case 429:
        // Handle rate limiting
        const retryAfter = error.headers.get('retry-after');
        console.log(`Rate limited. Retry after ${retryAfter}s`);
        break;
      default:
        console.error('Unexpected error:', error);
    }
  }
}
```

**Type-Safe Error Bodies:**

The error body is typed based on the OpenAPI specification's error response schemas:

```typescript
try {
  const { data } = await clients.shopperProducts.getProduct(options);
} catch (error) {
  if (error instanceof ApiError) {
    // error.body is typed from OpenAPI spec
    // For example, SCAPI errors typically have this shape:
    const errorBody = error.body as {
      type?: string;
      title?: string;
      detail?: string;
      instance?: string;
    };
    
    console.error(`${errorBody.type}: ${errorBody.detail}`);
  }
}
```

**Async/Await with Error Handling:**

```typescript
async function fetchProduct(productId: string) {
  try {
    const { data, response } = await clients.shopperProducts.getProduct({
      params: {
        path: { organizationId: 'org123', id: productId },
        query: { siteId: 'RefArch' }
      }
    });
    
    // Access response headers
    const etag = response.headers.get('etag');
    
    return { product: data, etag };
  } catch (error) {
    if (error instanceof ApiError) {
      // Handle API errors
      throw new Error(`Failed to fetch product: ${error.status} ${error.statusText}`);
    }
    // Network errors or other exceptions
    throw error;
  }
}
```

**JSON Serialization for Logging:**

```typescript
try {
  const { data } = await clients.shopperProducts.getProduct(options);
} catch (error) {
  if (error instanceof ApiError) {
    // ApiError has a toJSON() method for easy logging
    console.error('API Error:', JSON.stringify(error));
    
    // Or log to external service
    logger.error('SCAPI Error', error.toJSON());
  }
}
```

## References

- [openapi-fetch Documentation](https://openapi-ts.dev/openapi-fetch/) - Type-safe fetch client
- [openapi-typescript Documentation](https://openapi-ts.dev/introduction) - Type generation from OpenAPI
- [openapi-fetch Middleware Guide](https://openapi-ts.dev/openapi-fetch/middleware) - Request/response interception
- [openapi-fetch API Options](https://openapi-ts.dev/openapi-fetch/api) - Request configuration options
- [Salesforce B2C Commerce API Documentation](https://developer.salesforce.com/docs/commerce/commerce-api/guide/get-started.html) - SCAPI reference
- [SCAPI Clients: Overrides and Custom APIs](../../../template/docs/README-SCAPI.md) - SCAPI client usage patterns in Storefront Next apps 
