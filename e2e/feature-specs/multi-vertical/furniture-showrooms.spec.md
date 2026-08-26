---
title: Furniture Showrooms
domain: Multi-Vertical
status: approved
version: 1.0
created: 2026-08-21
last_updated: 2026-08-21
author: Syed Shehroz Hussain [Ozzy]
changelog:
  - version: 1.0
    date: 2026-08-21
    change: Initial spec for Furniture Showrooms
    author: Syed Shehroz Hussain [Ozzy]
---

# Furniture Showrooms

## Overview

Furniture shoppers can search for nearby physical showrooms at `/showrooms`, inspect their locations on a map and in an accessible list, and see product availability when arriving from a product-aware link. The experience reuses Business Manager store records and the existing Store Locator extension rather than maintaining a second fixture-backed location model.

## Design Decision

1. **Reuse Store Locator.** The route composes the OOTB Store Locator provider, search form, state, and Shopper Stores resource flow. Furniture-owned presentation and resource files live only under `src/verticals/furniture/`.
2. **Define stock status as product availability.** Shopper Stores supplies each showroom's `inventoryId`, not stock. When the URL includes `productId`, the Furniture resource loader queries Shopper Availability for that product and the returned showroom inventory lists. Results without an inventory list or availability response show an unavailable status rather than inventing stock.
3. **Keep discovery useful without a product.** A direct `/showrooms` visit searches BM-configured locations and omits product availability claims. Product-aware status is rendered only for `/showrooms?productId=<id>`.
4. **Defer the PDP link, not its contract.** This story owns the product-aware showroom URL and UI. Adding “View in a showroom” to the Furniture PDP is deferred to W-23917154 so this work does not overlap Constantin's PDP surface.
5. **Use progressive enhancement for maps and appointments.** Coordinates from Shopper Stores drive a map when the configured Google Maps API key is available; the list remains the complete accessible experience. Appointment booking is an external link only and appears when a BM store custom attribute provides a valid `http` or `https` URL.

## Acceptance Criteria

### AC1: Search BM-configured showrooms

- [ ] `VERTICAL=furniture` serves `/showrooms`.
- [ ] Postal-code and device-location searches use the existing `/resource/stores` flow and `shopperStores.searchStores`.
- [ ] Results come from Shopper Stores records; no showroom fixture array is shipped.
- [ ] Loading, no-results, geolocation-error, and fetch-error states remain available.

**Details:**
The showroom route is additive and Furniture-only. Canonical `/store-locator`, BOPIS, cart, checkout, and other verticals are unchanged.

### AC2: Present an accessible list and map

- [ ] Each result displays its showroom name, address, distance when returned, hours, phone, and email when configured.
- [ ] Results with latitude and longitude appear as map markers when Google Maps is configured.
- [ ] Selecting a result in the list identifies the corresponding map marker, and selecting a marker identifies the corresponding list item.
- [ ] If Maps is unavailable, the list remains fully usable and no empty or fake map is rendered.

### AC3: Show product-aware availability

- [ ] `/showrooms?productId=<id>` queries Shopper Availability using each returned showroom's `inventoryId`.
- [ ] An orderable inventory response is labelled “Available at this showroom.”
- [ ] A non-orderable inventory response is labelled “Not currently available at this showroom.”
- [ ] Missing inventory or unavailable availability data is labelled “Availability unavailable.”
- [ ] `/showrooms` without `productId` does not claim product stock status.

**Details:**
Shopper Availability accepts at most five inventory list IDs per request, so the server resource loader batches and combines larger result sets. The route never treats the presence of `inventoryId` itself as proof of stock.

### AC4: Use showroom terminology

- [ ] Furniture-owned shopper-facing headings, controls, statuses, and messages use “Showroom” or “Showrooms,” never “Store” or “Stores.”
- [ ] English US and English GB Furniture locale overrides contain the new copy.

### AC5: Link out for appointments

- [ ] A showroom with a valid external appointment URL displays “Book a showroom appointment.”
- [ ] The appointment opens the configured external URL in a new browsing context with safe `rel` attributes.
- [ ] No appointment control appears when the URL is absent or invalid.
- [ ] No CRM, Service Cloud, calendar, or in-app scheduling flow is implemented.

### AC6: Preserve the vertical boundary

- [ ] Product code for this feature lives under `src/verticals/furniture/`.
- [ ] No canonical source file is changed for Furniture-only behavior.
- [ ] The Furniture mirror, typecheck, lint, tests, Storybook checks, and bundle-size gate pass.

### AC7: Keep PDP ownership separate

- [ ] `/showrooms?productId=<id>` is documented and tested as the PDP entry-point contract.
- [ ] W-23917154 is named as the owner of the eventual Furniture PDP link.
- [ ] This story does not modify the Furniture PDP route or components.

## Feature Logic

### User Experience

The shopper opens Showrooms, searches by postal code or current location, and receives a scannable list. When map configuration and coordinates are available, the same results appear as synchronized markers. A product-aware visit includes availability per showroom. Location search failure leaves a clear retryable message; map failure does not block the list; availability failure degrades to an explicit unknown state.

### Implementation

**Components:**
- `src/verticals/furniture/routes/_app.showrooms.tsx`: route metadata and Furniture page shell.
- `src/verticals/furniture/routes/resource.showroom-availability.ts`: product availability lookup batched by showroom inventory list.
- `src/verticals/furniture/components/showroom-locator/`: list, map, availability, and external appointment presentation.
- `src/verticals/furniture/locales/en-US/overrides.ts` and `en-GB/overrides.ts`: Furniture terminology.

**Configuration:**
- Google Maps uses the existing `features.googleCloudAPI.apiKey` configuration.
- Appointment links use the optional BM store custom attribute `c_appointmentUrl` returned with Shopper Stores data.
- `SFNEXT_FURNITURE_DEMO` is not production behavior and is not used by this feature.

**Location:**
- Furniture-only route: `/showrooms`
- Product-aware route contract: `/showrooms?productId=<product-id>`

## Testing

**Unit Tests:**
- Route/resource tests cover availability batching, orderable/unavailable/unknown mapping, invalid input, and SCAPI failure.
- Component tests cover terminology, list rendering, map fallback, synchronized selection, product-aware statuses, and safe appointment links.

**Storybook:**
- A Controls-driven story covers map availability, product-aware statuses, and appointment-link presence without duplicating single-prop variants.
- Interaction coverage verifies list selection and map-marker synchronization.

**Local Verification:**
- Run Furniture typecheck, strict lint, focused Vitest, Storybook snapshot/interaction/a11y, mirror verification, and Furniture bundle-size checks.
- Render `/showrooms` and `/showrooms?productId=<valid-id>` in a real browser at desktop and mobile sizes.

## References

- GUS: W-23953869
- Furniture PRD §9.14, §10, §22: https://docs.google.com/document/d/1xGtT6QQYPqpEd4lzB7tGxO6XT4IXWuma37OzDxxEQ0U
- Furniture PDP story: W-23917154
- Delivery Slots epic: a3QEE000002X5Sn2AK
- OOTB Store Locator: `src/extensions/store-locator/`
- Shopper Availability: `GET /organizations/{organizationId}/availability`
- UX direction only: `upstream/feat/form-field-furniture`
