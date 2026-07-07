# @salesforce/storefront-next-runtime/design/data

Runtime page resolution logic for Page Designer. Given a page identifier (a product ID, category ID, or direct page ID), this module resolves it through content assignments and manifest lookup, selects the correct page variation based on visibility rules, and returns a fully filtered page ready for rendering. This is SDK-level infrastructure consumed by all storefronts built on the platform.

## Page Resolution Pipeline

The `resolvePage` function orchestrates the full pipeline:

```
Input: (id, identifierType, locale, manifestStorage, contextResolver)
│
├─ 1. Resolve dynamic page ID
│     For product/category identifiers, look up the assigned page ID
│     via content assignments in the site manifest.
│     Direct page IDs pass through unchanged.
│
├─ 2. Fetch page manifest
│     Load the PageManifest for the resolved page ID and locale.
│     The manifest contains all variations and their visibility rules.
│
├─ 3. Select variation
│     Evaluate variations in order. Each variation may have a
│     visibility rule (customer groups, campaigns, schedule).
│     The first matching variation wins; otherwise the default is used.
│
├─ 4. Load qualifier context (lazy)
│     The shopper's context (active campaigns, customer group
│     memberships) is only fetched if a variation's rule requires it.
│
└─ 5. Process page
      Filter the selected page's components by their individual
      visibility rules, removing any that don't match the context.
│
Output: Page with only visible components, or null
```

## Key Concepts

**Page Manifest** — The data structure containing all variations of a single page, their visibility rules, and the order in which variations should be evaluated. Each page ID + locale pair maps to one manifest.

**Variation** — A single version of a page within a manifest. Variations are evaluated in order; the first whose visibility rule passes is selected. Every manifest has a default variation used as a fallback.

**Visibility Rules** — Conditions that control when a variation or component is shown. Rules can require specific customer groups (all must match), active campaign/promotion pairs (all must match), or a time window (start/end timestamps). All conditions in a rule must pass for the rule to be satisfied.

**Content Assignments** — Mappings in the site manifest that connect product or category identifiers to page IDs. For categories, the lookup traverses the category hierarchy from child to parent until an assignment is found.

**Qualifier Context** — Runtime state representing the current shopper's active campaign qualifiers and customer group memberships. This context is lazily resolved — it's only fetched when a visibility rule actually needs it.

## Attribute Resolution

After locale overlay and data-binding resolution, each component's `data` map is passed through `resolveAttributeValues`. This converts the manifest's host-agnostic envelopes into the same wire shape that SCAPI's `getPage` controller would have returned.

Resolution is type-driven via `componentTypes[typeId].attributeDefinitions` from the manifest. The dispatch table:

| Attribute Type | Manifest Shape | Resolved Shape |
|---|---|---|
| `image` | `{ focalPoint?, metaData?, media: { libraryDomain, path } }` | `{ focalPoint?, metaData?, url }` |
| `file` | `{ media: { libraryDomain, path } }` | URL string |
| `markup` | Raw string with `?$staticlink$` placeholders | `?$staticlink$` resolved; pipeline-action placeholders pass through |
| `cms_record` | `{ id, type: { attributeDefinitions }, attributes }` | Same shape with inner attributes recursed |
| `string`, `text`, `url`, `boolean`, `integer`, `enum`, `custom`, `product`, `category`, `page` | Pass-through | Unchanged |
| Unknown types | Pass-through | Unchanged (one-time warning logged) |

### Key Design Decisions

**`serialize(context)` is not invoked.** The `custom` field from SCAPI is not part of the manifest pipeline. Components needing dynamic request-time data must use storefront-next React composition instead of Page Designer's `serialize` function.

**`designMetadata` is not emitted.** Editor metadata is not part of the manifest wire format. Page Designer's editor continues to use the SCAPI controller directly for preview.

**`localized` flag derivation.** The `localized` boolean is derived from per-locale content presence: `Boolean(componentInfo?.content?.[locale])`. This matches SCAPI's `contentAttributes.isLocalized()` semantics.

**Unknown attribute types pass through.** When ECOM introduces a new attribute type that the MRT doesn't yet handle, the value is emitted unchanged with a deduped warning logged once per `(typeId, attrId, attrType)` triple. This ensures forward compatibility — an MRT older than ECOM still produces a page rather than dropping fields.

**Pipeline-action placeholders are not rewritten.** `$link-...$`, `$url(...)$`, `$httpUrl(...)$`, `$httpsUrl(...)$`, and `$include(...)$` placeholders in markup and url attributes pass through unchanged. Storefront-next components use React composition for navigation rather than ECOM pipeline routing, so these placeholders are not resolved at the MRT layer.

### Markup Rewriting

The `rewriteMarkup` function handles only `?$staticlink$` — library-relative image paths inside markup attributes:

`path?$staticlink$` → resolved via `ctx.resolveMediaUrl` using `ctx.pageLibraryDomain`

### AttributeResolutionContext

The resolver is platform-neutral — it imports nothing from the template, React Router, or `site-context/build-url`. All URL-building is injected via `AttributeResolutionContext`:

- `host` — storefront origin (e.g. `https://www.shop.example`)
- `resolveMediaUrl({ libraryDomain, path, locale? })` — builds static-content URLs
- `pageLibraryDomain?` — library identifier for `?$staticlink$` rewriting
- `locale?` — forwarded to `resolveMediaUrl`

Storefront-next and Page Designer each supply their own factory that builds this context from their respective environments.