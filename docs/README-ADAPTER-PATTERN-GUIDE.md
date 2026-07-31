# Engagement Adapter Pattern Guide

> How the adapter pattern is used for analytics event tracking (Einstein, Active Data, Data 360).

## Overview

The **adapter pattern** decouples analytics components from vendor-specific event APIs. Components call a generic interface; the adapter translates those calls into the vendor's API.

Three adapters ship out of the box:

| Adapter | Purpose | Config key |
|---------|---------|------------|
| **Einstein** | Analytics event tracking (viewProduct, addToCart, etc.) | `engagement.adapters.einstein` |
| **Active Data** | Analytics event tracking (dwac beacon) | `engagement.adapters.activeData` |
| **Data 360** | Salesforce Data 360 — view/impression events only | `engagement.adapters.data360` |

All three implement the `EngagementAdapter` interface and are registered in a shared store.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Component Layer                          │
│  (PageViewTracker, AddToCartButton, etc.)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ sendEvent(event)
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                     Adapter Store                            │
│  Map<string, EngagementAdapter>                             │
│  + ensureAdaptersInitialized() (lazy, idempotent)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Vendor Implementations                          │
│  createEinsteinAdapter → POST to api.cquotient.com          │
│  createActiveDataAdapter → pixel/beacon requests            │
│  createData360Adapter → sendBeacon to                       │
│    {tenantId}.c360a.salesforce.com                          │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/lib/adapters/
├── index.ts                        # Re-exports store, types, utils
└── engagement/
    ├── types.ts                    # EngagementAdapter interface, EngagementAdapterConfig
    ├── store.ts                    # addAdapter, getAdapter, getAllAdapters, removeAdapter
    ├── einstein.ts                 # createEinsteinAdapter factory (analytics events only)
    ├── active-data.ts              # createActiveDataAdapter factory
    ├── data360.ts                  # createData360Adapter factory (view/impression events only)
    ├── register.ts                 # initializeEngagementAdapters (reads config, creates + registers)
    ├── initialize.ts               # ensureAdaptersInitialized (idempotent, lazy-loads register.ts)
    ├── einstein-config.ts          # validateEinsteinConfig helper
    ├── data360-config.ts           # Data360Config type + validateData360Config helper
    └── utils.ts                    # hasConsent helper
```

### Adapter Interface

```typescript
// src/lib/adapters/engagement/types.ts
export interface EngagementAdapter extends EventAdapter {
    name: string;
    sendEvent?: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => Promise<unknown>;
    send?: (url: string, options?: RequestInit) => Promise<Response>;
}
```

### Adapter Store

A `Map<string, EngagementAdapter>` with functional accessors:

```typescript
addAdapter('einstein', adapter);           // Register
getAdapter('einstein');                     // Retrieve by name
getAllAdapters();                           // All registered adapters
removeAdapter('einstein');                  // Unregister
```

### Lazy Initialization

Adapter code is dynamically imported to stay out of the initial bundle:

```typescript
// src/lib/adapters/engagement/initialize.ts
export async function ensureAdaptersInitialized(appConfig: AppConfig): Promise<void> {
    if (getAllAdapters().length > 0) return;  // Already done
    const { initializeEngagementAdapters } = await import('./register');
    initializeEngagementAdapters(appConfig);
}
```

The dynamic `import()` means the Einstein/Active Data/Data 360 implementation modules are code-split into a separate chunk.

### Configuration

Adapters are configured in `config.server.ts` under `engagement.adapters`:

```typescript
engagement: {
    adapters: {
        einstein: {
            enabled: true,
            host: 'https://api.cquotient.com',
            einsteinId: '<your-einstein-id>',
            siteId: '<your-site-id>',
            realm: '<realm>',
            isProduction: false,
            consentCategory: 'analytics',
            eventToggles: { view_product: true, cart_item_add: true, ... },
        },
        activeData: {
            enabled: true,
            host: '<host>',
            siteUUID: '<uuid>',
            consentCategory: 'analytics',
            eventToggles: { view_product: true, cart_item_add: true, ... },
        },
        data360: {
            enabled: true,
            appSourceId: '<your-app-source-id>',
            tenantId: '<your-tenant-id>',
            siteId: '<your-site-id>',
            webStoreId: 'sfnext',           // separates Storefront Next traffic from PWA Kit's in a shared DLO
            consentCategory: 'analytics',
            eventToggles: { view_product: true, view_category: true, ... },
        },
    },
},
```

If an adapter's `enabled` flag is `false`, it is not registered.

**Data 360 maps only view/impression events** — `view_page`, `view_product`, `view_search`, `view_category`, and `view_recommender`. Cart, checkout, wishlist, and click events have no Data 360 mapping and ship disabled in `eventToggles` (PWA Kit parity).

---

## Testing

### Mocking Adapters in Tests

```typescript
import { addAdapter, removeAdapter } from '@/lib/adapters';

const mockAdapter: EngagementAdapter = {
    name: 'mock-einstein',
    sendEvent: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => addAdapter('einstein', mockAdapter));
afterEach(() => removeAdapter('einstein'));
```

### Testing Initialization

```typescript
import { resetAdaptersInitialization } from '@/lib/adapters/engagement/initialize';

afterEach(() => resetAdaptersInitialization());  // Clear cached promise for clean state
```

---

## Adding a New Engagement Adapter

1. Create `src/lib/adapters/engagement/your-adapter.ts` with a factory function returning `EngagementAdapter`
2. Register it in `src/lib/adapters/engagement/register.ts` inside `initializeEngagementAdapters()`
3. Add configuration under `engagement.adapters.yourAdapter` in `config.server.ts`

