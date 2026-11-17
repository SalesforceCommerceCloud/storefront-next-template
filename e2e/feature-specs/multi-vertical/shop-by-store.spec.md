---
title: Shop by Store
domain: Multi-Vertical
status: proposed
version: 1.0
created: 2026-09-30
last_updated: 2026-09-30
---

# Shop by Store

## Overview

Shoppers can choose a store before browsing. The selection is confirmed against
Shopper Stores, persisted for the guest session, and reflected in the storefront
header. Store-specific experiences can use the selected store without maintaining
a separate client-side location model.

## Design Decisions

1. **Reuse Store Locator.** Shop by Store composes the existing Store Locator
   extension, its search flow, and the Shopper Stores resource route.
2. **Confirm selection on the server.** The selection action resolves the submitted
   store ID through Shopper Stores before persisting it. The client never treats an
   arbitrary submitted ID as a selected store.
3. **Persist canonical metadata only.** The selected-store cookie contains the
   confirmed store metadata needed to restore the experience. It is HTTP-only and
   is written only by the server action.
4. **Keep profile persistence separate.** This feature covers guest-session
   selection only. Persisting a preference to a registered shopper profile is a
   separate capability.
5. **Expose state clearly.** Pending, successful, and failed selections remain
   distinguishable in the chooser and the header. Errors are associated with the
   selection control programmatically.

## Acceptance Criteria

### AC1: Search and select a store

- [ ] Shoppers can open a store chooser from the configured entry point.
- [ ] The chooser uses the existing Store Locator search and result flow.
- [ ] Each available result can be selected.
- [ ] Loading, empty, geolocation-error, and request-error states remain usable.

### AC2: Confirm and persist the selection

- [ ] Selecting a store submits its ID to the server selection action.
- [ ] The action resolves the ID through Shopper Stores before it writes a cookie.
- [ ] An invalid, unavailable, or unresolved ID does not update the selection.
- [ ] The selected-store cookie is HTTP-only and restores the confirmed selection
  on a subsequent request.

### AC3: Reflect the selected store in the UI

- [ ] Before selection, the entry point prompts the shopper to choose a store.
- [ ] While a selection is pending, the chooser prevents duplicate submissions and
  communicates progress.
- [ ] After confirmation, the entry point displays the confirmed store metadata.
- [ ] A failed selection leaves the existing confirmed selection unchanged and
  presents an actionable error on the selection control.

### AC4: Preserve extension and vertical boundaries

- [ ] Shared selection behavior remains in the Store Locator extension.
- [ ] Brand-specific copy and presentation are supplied by the consuming vertical
  or storefront configuration.
- [ ] The feature does not introduce a parallel store fixture model for production
  behavior.
- [ ] The feature does not assume a particular catalog, product type, fulfillment
  method, or store taxonomy.

## Implementation

**Shared components and routes:**
- `src/extensions/store-locator/components/store-locator/`: store search and
  selection interface.
- `src/extensions/store-locator/hooks/use-store-locator-list.ts`: selection state
  and result interactions.
- `src/extensions/store-locator/routes/action.set-selected-store.ts`: canonical
  server-side selection and persistence.
- `src/extensions/store-locator/middlewares/selected-store.server.ts`: selected
  store restoration for requests that need it.

**Data source:**
- Shopper Stores is the source of truth for store identity and metadata.

**Persistence:**
- A server-managed selected-store cookie restores the guest's confirmed selection.

## Testing

**Unit tests:**
- The selection action rejects missing, invalid, and unresolved store IDs.
- A valid resolved store writes only canonical selected-store metadata.
- The cookie middleware restores the selected store on a later request.
- The chooser reflects pending, success, and error states without replacing a
  previously confirmed selection on failure.

**Storybook:**
- Stories cover unselected, selected, pending, and selection-error states.
- Accessibility coverage verifies the selection error is exposed through the
  control's invalid state and programmatic description.

**Local verification:**
- Run focused Store Locator tests, template typecheck, strict lint, and relevant
  Storybook snapshot and accessibility tests.
- Verify the configured vertical mirrors continue to build without importing a
  vertical from canonical source.

## References

- Store Locator extension: `src/extensions/store-locator/`
- Shopper Stores: `GET /organizations/{organizationId}/stores`
- Work item: W-24310358
