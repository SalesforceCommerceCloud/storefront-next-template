# Consent Tracking

How analytics consent works, how to configure it, and how to customize it for granular consent management.

## Overview

The storefront supports a two-layer consent system:

1. **Binary consent** (default) — A shopper accepts or declines all tracking via a consent banner. This is what ships out of the box.
2. **Per-adapter granular consent** — Each analytics adapter declares which consent category it requires (e.g., `'analytics'`, `'marketing'`). Events only reach an adapter if the shopper has granted that category. This enables GDPR-style category-level consent.

Both layers work together. The binary consent banner produces a set of **consent preferences** (granted categories), which are then checked by each adapter before it sends events.

## How It Works by Default

### Consent Banner

When `trackingConsent.enabled` is `true` in config, a consent banner appears for new visitors. The shopper can accept or decline tracking. This choice is persisted via the SLAS token (stored as the `dw_dnt` cookie).

### Data Flow

```
Shopper Action (Accept/Decline)
  → TrackingConsent enum (Accepted | Declined)
    → buildConsentPreferences()
      → ConsentPreferences (array of granted category strings)
        → Passed to each adapter's sendEvent()
          → Adapter calls hasConsent() to check its required category
```

1. The `useTrackingConsent` hook reads the shopper's binary consent from the auth session.
2. `buildConsentPreferences()` converts the binary consent into a `ConsentPreferences` array:
   - **Accepted** → All configured categories are granted (e.g., `['necessary', 'analytics', 'marketing', 'personalization']`)
   - **Declined** → Empty array `[]` (no categories granted)
   - **Undetermined** → `undefined` (consent not yet provided by the shopper)
3. The `useAnalytics` hook and `PageViewTracker` block all tracking when `consentPreferences` is `undefined` or empty — no events are sent until the shopper has explicitly accepted.
4. When consent is accepted, `ConsentPreferences` are forwarded through the event mediator to every adapter, where each adapter calls `hasConsent(config.consentCategory, consentPreferences)` to decide whether to send.

### Default Consent Categories

The default configuration defines four categories:

```typescript
// config.server.ts
trackingConsent: {
    enabled: true,
    defaultTrackingConsent: TrackingConsent.Declined,
    consentCategories: ['necessary', 'analytics', 'marketing', 'personalization'],
    position: 'bottom-right',
},
```

These align with common GDPR consent management conventions:

| Category | Purpose |
|---|---|
| `necessary` | Essential cookies/tracking required for site functionality |
| `analytics` | Usage analytics and performance measurement |
| `marketing` | Advertising, retargeting, and campaign tracking |
| `personalization` | Product recommendations and personalized experiences |

### Default Adapter Consent

Out of the box, all three shipped adapters — Einstein, Data 360, and Active Data — set `consentCategory: 'analytics'`. Each fires only once the shopper has granted the `analytics` category. With the default binary consent banner, granting consent maps to all configured categories, so `'analytics'` effectively means "the shopper accepted tracking"; the binary accept/decline at the hook layer is the first gate — no events flow until consent is explicitly accepted.

The `consentCategory` gate matters once you offer granular, per-category consent (see [Configuration](#configuration) below): an adapter set to `'analytics'` then stays silent for a shopper who accepted, say, only `'marketing'`.

## Configuration

### Consent Categories

Define the categories your project supports in `config.server.ts`:

```typescript
trackingConsent: {
    enabled: true,
    defaultTrackingConsent: TrackingConsent.Declined,
    consentCategories: ['necessary', 'analytics', 'marketing', 'personalization'],
},
```

These are arbitrary strings — you can define whatever categories match your consent management platform (e.g., OneTrust, Cookiebot, Usercentrics). There is no hardcoded set.

### Per-Adapter Consent Category

Assign a consent category to each adapter so it only fires when the shopper has granted that category:

```typescript
// config.server.ts → engagement.adapters
einstein: {
    enabled: true,
    consentCategory: 'analytics',
    // ... other config
},
data360: {
    enabled: true,
    consentCategory: 'analytics',
    // ... other config
},
activeData: {
    enabled: true,
    consentCategory: 'analytics',
    // ... other config
},
```

**Behavior when `consentCategory` is set:**

| Shopper Consent | `consentPreferences` | Adapter fires? |
|---|---|---|
| Accepted all | `['necessary', 'analytics', 'marketing', 'personalization']` | Yes |
| Accepted only `necessary` | `['necessary']` | No (unless adapter's category is `'necessary'`) |
| Declined all | `[]` | No (blocked at hook layer) |
| Not yet determined | `undefined` | No (blocked at hook layer before reaching adapters) |

**Behavior when `consentCategory` is omitted:**

The adapter does not perform any additional consent filtering — it fires for every event that reaches it. However, the hook layer (`useAnalytics` / `PageViewTracker`) still blocks all events when consent is undetermined or declined, so omitting `consentCategory` does not bypass consent entirely. It just means the adapter defers to the hook-level gate instead of adding its own category check. This is useful for adapters that manage consent internally (e.g., a Google Tag Manager adapter where consent mode is handled by GTM itself).

## Customization

### Adding Granular Consent UI

The default consent banner is binary (accept all / decline all). To support category-level choices, you need to:

1. **Build a consent preferences UI** that lets shoppers toggle individual categories.
2. **Modify `buildConsentPreferences()`** in `src/lib/adapters/utils.ts` to return only the categories the shopper has granted, instead of all-or-nothing.

Currently, `buildConsentPreferences()` maps the binary consent to the full or empty category array:

```typescript
// src/lib/adapters/utils.ts
export function buildConsentPreferences(
    trackingConsent: TrackingConsent | undefined,
    consentCategories: ConsentCategory[]
): ConsentPreferences | undefined {
    if (trackingConsent === TrackingConsent.Accepted) {
        return [...consentCategories]; // All categories granted
    }
    if (trackingConsent === TrackingConsent.Declined) {
        return []; // No categories granted
    }
    return undefined; // Consent not yet determined
}
```

To support granular consent, replace this with logic that reads the shopper's per-category choices. For example, if you store category preferences in a cookie or state:

```typescript
export function buildConsentPreferences(
    trackingConsent: TrackingConsent | undefined,
    consentCategories: ConsentCategory[]
): ConsentPreferences | undefined {
    if (trackingConsent === undefined) {
        return undefined;
    }

    // Read granular preferences from your consent management system
    const grantedCategories = getGrantedCategoriesFromCMP();

    // Always include 'necessary' if the shopper has accepted anything
    if (trackingConsent === TrackingConsent.Accepted) {
        return consentCategories.filter(
            (cat) => cat === 'necessary' || grantedCategories.includes(cat)
        );
    }

    return [];
}
```

### Adding a Custom Adapter with Consent

When creating a new adapter, declare its `consentCategory` in the config and check consent in `sendEvent`:

```typescript
import { hasConsent, type EngagementAdapter, type EngagementAdapterConfig } from '@/lib/adapters';
import type { AnalyticsEvent, ConsentPreferences, EventSiteInfo } from '@salesforce/storefront-next-runtime/events';

export function createMyAdapter(config: EngagementAdapterConfig): EngagementAdapter {
    return {
        name: 'my-adapter',
        sendEvent: async (
            event: AnalyticsEvent,
            siteInfo?: EventSiteInfo,
            consentPreferences?: ConsentPreferences
        ) => {
            if (!hasConsent(config.consentCategory, consentPreferences)) {
                return;
            }
            // Send the event...
        },
    };
}
```

Then register it with a consent category in `config.server.ts`:

```typescript
myAdapter: {
    enabled: true,
    consentCategory: 'marketing',
    eventToggles: { /* ... */ },
},
```

### Adapters That Manage Consent Internally

Some third-party systems (e.g., Google Tag Manager with Google Consent Mode) handle consent checks on their side. For these adapters, **omit `consentCategory`** from the config so the adapter does not perform its own category check.

However, the hook layer (`useAnalytics` / `PageViewTracker`) blocks all events when consent is undetermined or declined — before events ever reach adapters. If your adapter needs to receive events regardless of consent state (because it handles consent internally), you will need to modify `buildConsentPreferences()` in `src/lib/adapters/utils.ts` so that it returns a non-empty array even when consent is undetermined. For example, you could return `['necessary']` as a default to allow events to flow through to adapters that don't require a specific category:

```typescript
export function buildConsentPreferences(
    trackingConsent: TrackingConsent | undefined,
    consentCategories: ConsentCategory[]
): ConsentPreferences | undefined {
    if (trackingConsent === TrackingConsent.Accepted) {
        return [...consentCategories];
    }
    if (trackingConsent === TrackingConsent.Declined) {
        return [];
    }
    // Return a baseline category so adapters that manage consent
    // internally (e.g., GTM) still receive events before the
    // shopper has interacted with the consent banner.
    return ['necessary'];
}
```

With this approach, adapters that declare a `consentCategory` other than `'necessary'` (e.g., `'analytics'`, `'marketing'`) will still be blocked until the shopper accepts, while adapters that omit `consentCategory` will fire immediately.
