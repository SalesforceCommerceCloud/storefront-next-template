# @salesforce/storefront-next-runtime

Runtime-agnostic libraries for SFCC Storefront Next, providing core functionality for Page Designer integration, SCAPI client generation, and component management.

## Overview

This package provides the foundational runtime libraries for building Salesforce Commerce Cloud (SFCC) Storefront Next applications. It includes:

- **Page Designer Integration**: Real-time communication APIs and React components for visual editing
- **SCAPI Client**: Type-safe, auto-generated API clients for Salesforce Commerce APIs

## Installation

```bash
pnpm add @salesforce/storefront-next-runtime
```

## Requirements

- Node.js >= 24.0.0
- React >= 19.0.0
- React DOM >= 19.0.0

## Modules

### `/assets` Client Bundle Assets

Provides `getClientBundlePath()`, which returns the URL prefix for emitted client resources in local development, preview, and deployed Managed Runtime environments. On the server it derives the path from `MRT_ENV_BASE_PATH` and `BUNDLE_ID`; in the browser it uses the bundle configuration injected by the Storefront Next `Scripts` integration.

```typescript
import { getClientBundlePath } from '@salesforce/storefront-next-runtime/assets';

const componentChunk = `${getClientBundlePath()}assets/component.js`;
```

### `/design/messaging` Page Designer Messaging API

Provides a communication layer between the Page Designer host application and client applications. Enables real-time messaging for design-time interactions, component selection, property updates, and synchronization between the visual editor and the running application.

### `/design/mode` Design Mode Detection

Utilities for detecting and managing the current application mode (Design or Preview). Allows components to conditionally render design-time features and optimize bundle size by excluding design-time code during runtime execution.

### `/design/preload` Page Designer Preload Resources

Exports the public Page Designer preload manifest types and utilities for resolving component type IDs to deduplicated module and stylesheet URLs. `resolvePreloadResources()` prioritizes styles, component entry modules, and then shared module dependencies. Styles are never removed by the module budgets.

```typescript
import { resolvePreloadResources } from '@salesforce/storefront-next-runtime/design/preload';
import { getClientBundlePath } from '@salesforce/storefront-next-runtime/assets';

const resources = resolvePreloadResources(manifest, criticalTypeIds, {
    bundlePath: getClientBundlePath(),
    maxModuleEstimatedTransferBytes: 250_000,
    maxModuleRawBytes: 750_000,
    compressedSizeStrategy: 'max',
    warnAtResources: 40,
    onWarning: (warning) => logger.warn('Page Designer preload warning', warning),
});
```

The shown limits are also the defaults. `compressedSizeStrategy` accepts `brotli`, `gzip`, or `max`; `max` conservatively uses the larger estimate. Warnings report unknown component type IDs, modules omitted by the budgets, and large resource selections.

### `/design/react` Design-Time React Components

React components and utilities for Page Designer integration. Provides design-time components, type definitions, and runtime utilities. Most components are lazy-loaded from `/design/react/core` to minimize bundle size, while types and essential runtime components are available directly from this module.

### `/design/react/core` Core React Components

Entry point for React Page Designer integration. Exports only the minimal set of components required for Page Designer functionality to prevent bundling design-time code during runtime when not in design mode. Components from `/design/react` are dynamically loaded when design mode is active.

### `/design/react/preload` React Preload Links and Stylesheet Precedence

Provides `PreloadResources` for rendering resolved module and stylesheet links, plus stylesheet precedence constants and `createStorefrontStylesheetLink()`. Use the helper for application, route, and extension styles emitted through React Router's `links` export so Page Designer component styles can follow them in a deterministic cascade.

```tsx
import { createStorefrontStylesheetLink } from '@salesforce/storefront-next-runtime/design/react/preload';
import appStylesHref from './app.css?url';

export const links = () => [createStorefrontStylesheetLink(appStylesHref)];
```

React orders stylesheet precedence groups by their first appearance, not by comparing the precedence strings. Keep the storefront stylesheet link present before critical Page Designer styles are emitted.

### `/design/styles.css` Page Designer Styles

CSS stylesheet containing design layer styles for Page Designer integration. Provides visual overlays, selection indicators, and design-time UI elements. Can be imported and consumed in various ways depending on your bundler configuration and build setup.

### `/data-store` MRT Data Store Access

Utilities and middleware for reading scoped entries from the MRT data access layer. This module intentionally exposes only key-specific helpers (initially site preferences).

**Environment Variables:**

- `AWS_REGION` (required): AWS region for the data store table (e.g., `us-east-1`)
- `MOBIFY_PROPERTY_ID` (required): MRT property identifier (e.g., `abcd1234`)
- `DEPLOY_TARGET` (required): MRT deploy target (e.g., `production`)
- `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` (optional): controls built-in middleware behavior when the
  MRT data store is unavailable or returns a service error
  - `fallback` (default): use middleware-defined safe fallback values and continue request execution
  - `throw`: opt back into fail-fast behavior — middleware throws and the request errors out

  Applies to the four built-in middlewares (`customSitePreferencesMiddleware`,
  `customGlobalPreferencesMiddleware`, `gcpPreferencesMiddleware`, `loginPreferencesMiddleware`).
  Customer-authored middlewares created via `createDataStoreMiddleware` default to `'throw'`; pass
  `onUnavailable: 'fallback'` and a `fallbackValue` to opt into graceful degradation.

These are managed by Managed Runtime and are not typically set by SDK consumers directly.

**Provider Selection:**

The runtime auto-selects the MRT provider when all MRT environment variables are present.
If any are missing, it loads a local provider from `@salesforce/storefront-next-dev` in
development.

Local provider environment variables (development only):

- `SFNEXT_DATA_STORE_DEFAULTS` (optional): JSON map of keys to preference objects
- `SFNEXT_DATA_STORE_WARN_ON_MISSING` (optional): set to `false` to silence warnings

**Example Usage:**

```typescript
import { customSitePreferencesMiddleware, getSitePreferences } from '@salesforce/storefront-next-runtime/data-store';

export const middleware = [
  // Must run after the multi-site middleware to resolve site-specific keys.
  customSitePreferencesMiddleware,
  // ...other middleware
];

export const loader = ({ context }) => {
  const sitePreferences = getSitePreferences(context);
  return { sitePreferences };
};
```

**Custom Middleware Usage:**

If you want to read a different key or apply a custom transform, you can build your own
middleware with `createDataStoreMiddleware` and `createDataStoreContext`.

```typescript
import {
  createDataStoreContext,
  createDataStoreMiddleware,
} from '@salesforce/storefront-next-runtime/data-store';

type CustomPreferences = {
  featureFlags: Record<string, boolean>;
};

export const customPreferencesContext = createDataStoreContext<CustomPreferences>();

export const customPreferencesMiddleware = createDataStoreMiddleware({
  entryKey: 'custom-preferences',
  context: customPreferencesContext,
  transform: (value) => ({
    featureFlags: value.featureFlags as Record<string, boolean>,
  }),
});

export const loader = ({ context }) => {
  const customPreferences = context.get(customPreferencesContext);
  return { customPreferences };
};
```

The site preferences middleware reads data from a site-scoped key in the data store using this format:

```
<siteid>-custom-site-preferences
```

### `/scapi-client` SCAPI Client

Type-safe, auto-generated API clients for Salesforce Commerce APIs with operation-based method names.

For detailed technical documentation, architecture details, and update procedures, see [SCAPI Client Documentation](./src/scapi-client/README.md).

**Key Features:**

- Type-safe API calls with full TypeScript support
- Intuitive operation names instead of HTTP method + path
- Auto-generated from OpenAPI specifications
- Built on [openapi-fetch](https://github.com/drwpow/openapi-typescript/tree/main/packages/openapi-fetch)

**Example Usage:**

```typescript
import { createCommerceApiClients } from '@salesforce/storefront-next-runtime/scapi';

// Initialize clients
const clients = createCommerceApiClients({
  baseUrl: 'https://kv7kzm78.api.commercecloud.salesforce.com',
});

// Add authentication middleware
const token = 'your-auth-token';
clients.use({
  onRequest({ request }) {
    request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
});

// Call operations using intuitive method names
const response = await clients.shopperProducts.getCategories({
  params: {
    path: {
      organizationId: 'f_ecom_zzrf_001',
    },
    query: {
      ids: ['root'],
      siteId: 'RefArchGlobal',
    },
  }
});

// Fully typed response
console.log(response.data); // CategoryResult type
```

**Generating SCAPI Clients:**

```bash
pnpm scapi:generate
```

## Development

### Build

```bash
pnpm build
```

### Development Mode

Watch mode for rapid development:

```bash
pnpm dev
```

### Testing

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Run tests with coverage
pnpm test:unit
```

### Linting

```bash
# Check for issues
pnpm lint

# Fix issues automatically
pnpm lint:fix
```

### Clean Build Artifacts

```bash
pnpm clean
```

## Architecture

### Build Configuration

Built using [tsdown](https://github.com/egoist/tsdown) for optimal bundling:

- **Module Format**: ESM
- **Target**: ES2022
- **TypeScript**: Strict mode enabled
- **Output**: Type declarations with source maps
