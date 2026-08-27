# AEO / GEO on PDP and PLP

Storefront Next ships built-in support for Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO) on the Product Detail Page (PDP) and Product Listing Page (PLP).

## What We Mean by AEO and GEO

- **AEO (Answer Engine Optimization)** — Making product and category facts machine-readable and consistent so **search engines and crawlers** can parse and enrich results (for example, rich product snippets), and so assistants, voice search, and other answer-style surfaces can cite accurate who, what, how much, and in stock information without guessing from unstructured HTML alone.

- **GEO (Generative Engine Optimization)** — Supplying **clear entity structure** (products, offers, collections, breadcrumbs) and **aligned metadata** (titles, descriptions, canonical URLs) so generative and retrieval-augmented systems can ground responses in your storefront’s authoritative data.

In this codebase, the main technical levers are **[schema.org](https://schema.org) JSON-LD** (`<script type="application/ld+json">`) and the **`SeoMeta`** component, which writes **document head tags** such as `<title>`, `<meta name="description">`, and Open Graph properties (these are ordinary HTML metadata—not the JSON-LD script). Canonical links and `hreflang` alternates are rendered from the root layout; see [README-SEO.md](./README-SEO.md) for that behavior (existing doc—you do not need to change it for PDP/PLP structured data work).

## Where It Is Implemented

| Concern | PDP | PLP (category) |
|--------|-----|----------------|
| Route | [`src/routes/_app.product.$productId.tsx`](../src/routes/_app.product.$productId.tsx) | [`src/routes/_app.category.$categoryId.tsx`](../src/routes/_app.category.$categoryId.tsx) |
| JSON-LD generator | [`src/utils/product-schema.ts`](../src/utils/product-schema.ts) | [`src/utils/category-schema.ts`](../src/utils/category-schema.ts) |
| Public URL helpers | [`src/utils/schema-url.ts`](../src/utils/schema-url.ts) | Same |
| JSON-LD injection | [`JsonLd`](../src/components/json-ld/index.tsx), script `id="product-schema"` | Same, `id="category-schema"` |
| Page meta | `SeoMeta` in `ProductContent` | `SeoMeta` on category page |

## Product Detail Page (PDP)

### Structured Data (`Product`)

The loader resolves product data from SCAPI, then builds a **promise** of JSON-LD via `generateProductSchema(product, productUrl)`. The schema is a `Product` graph with `@context` `https://schema.org`, including when data is available:

- **Identity** — `name`, `description` (from long / short / page description), `sku` / `productID`, `url`
- **Media** — Primary image; up to **five** large/medium image URLs (thumbnails excluded) when multiple views exist
- **Commercial** — `offers` with `Offer`: price, currency, availability (`InStock` / `OutOfStock` / `BackOrder` / `PreOrder` from inventory), product URL, `itemCondition`, optional `lowPrice` / `highPrice` for ranges, `priceValidUntil` (default horizon)
- **Merchandising** — `brand`, `mpn`, `gtin` (from EAN when present), `category` (primary category id), `color` and **`additionalProperty`** from variation attributes and custom attributes

**Important:** Product URLs in JSON-LD are built from the **public storefront origin** and current path (`getPublicOrigin` + pathname/search), **not** from `product.slugUrl`, so Managed Runtime or proxy hosts do not leak internal origins into structured data.

### Document Head Tags (`SeoMeta`)

`SeoMeta` sets the product **name** as `<title>`, **page description or short description** as the meta description, and Open Graph **`type: 'product'`** with the page URL and primary image. That complements JSON-LD: crawlers and previews still read classic head tags even when structured data is present.

### Rendering

`JsonLdWrapper` uses React `use()` on `loaderData.productSchema` inside `<Suspense>` so JSON-LD can **stream with SSR** after the product payload is ready. Failures in schema generation are logged and result in no script tag rather than breaking the page.

## Product Listing Page (PLP)

### Structured Data (`CollectionPage` + `ItemList`)

After category and search results are available, `generateCategorySchema` builds:

- **`CollectionPage`** — `name`, optional `description` (page description), `url`
- **`mainEntity` → `ItemList`** — `numberOfItems` from search total when present; **`itemListElement`** capped at **24** products for payload size, each `ListItem` wrapping a lightweight **`Product`** (name, url, image, optional `offers` with price/currency/availability/url)
- **`breadcrumb` → `BreadcrumbList`** — Built from `parentCategoryTree` when present, plus the current category; category links use `buildCategorySchemaUrl` so paths stay consistent with multi-site prefixes

**Pricing on PLP:** List-item offers use an **effective** price: lowest promotional price when promotions exist, otherwise the base price. Master products consider variant-level prices when applicable.

**Availability on PLP:** `orderable` on the hit drives `InStock` / `OutOfStock` when known. If the hit does not expose orderability but `config.search.products.refine.orderableOnly` is `true`, availability is inferred as in stock for listed hits.

The loader merges **critical** and **non-critical** search hits before schema generation so the `ItemList` reflects the **full first page** of results (up to the configured limit), not only the above-the-fold critical slice.

### Document Head Tags (`SeoMeta`)

`SeoMeta` sets the category **name** as `<title>`, **page description or general description** as the meta description, and Open Graph **`type: 'website'`** with the canonical `pageUrl` from `buildCanonicalUrl` (aligned with how the root layout builds the canonical link).

### Rendering

`CategoryJsonLd` mirrors the PDP pattern: `use()` on `categorySchema` inside `<Suspense>`, script `id="category-schema"`.

## URL Construction and Multi-Site

[`schema-url.ts`](../src/utils/schema-url.ts) centralizes:

- **`getPublicOrigin(request)`** — Respects `x-forwarded-host` / `x-forwarded-proto` (and `host`) so JSON-LD URLs match the shopper-facing domain behind CDNs and serverless runtimes.
- **`buildProductSchemaUrl` / `buildCategorySchemaUrl`** — Preserve the **site/locale path prefix** extracted from the current page URL when building linked product and category URLs inside PLP breadcrumbs and list items.

This keeps AEO/GEO signals consistent across locales and avoids broken or internal-only URLs in training and citation contexts.

## Tests and Stories

- Unit tests: [`src/utils/category-schema.test.ts`](../src/utils/category-schema.test.ts), [`src/components/json-ld/index.test.tsx`](../src/components/json-ld/index.test.tsx)
- Route-level coverage touches JSON-LD in [`src/routes/_app.category.$categoryId.test.tsx`](../src/routes/_app.category.$categoryId.test.tsx) and [`src/routes/_app.product.$productId.test.tsx`](../src/routes/_app.product.$productId.test.tsx)
- Storybook: [`src/components/json-ld/stories/index.stories.tsx`](../src/components/json-ld/stories/index.stories.tsx) (includes ItemList-oriented examples)

## Related Documentation

Optional deeper reading elsewhere in this package (unchanged by the JSON-LD work):

- [README-SEO.md](./README-SEO.md): Canonical URLs, hreflang, full `SeoMeta` prop reference, query-parameter allowlists
- [README-IMAGES.md](./README-IMAGES.md): Image URLs and alt text (complements visible HTML for accessibility and context)

## Customization Notes for Merchants

Storefront Next focuses on **portable, schema-valid** defaults. Common merchant-specific extensions for stronger AEO/GEO include:

- Enriching **`Product`** JSON-LD on PDP with **`aggregateRating` / `Review`** when a trusted review source is available (the `ProductSchema` type already allows `aggregateRating`; wiring it is project-specific).
- Adding **`FAQPage`** or **`QAPage`** JSON-LD where editorial FAQ content exists, if those blocks are part of your experience.
- Ensuring **Business Manager Catalog Fields** (`pageDescription`, `longDescription`, EAN, brand) are populated so that generators and answer engines have factual text to align with structured data.

Validate changes with [Google Rich Results Test](https://search.google.com/test/rich-results) or equivalent tools, and keep JSON-LD in sync with visible on-page content to avoid conflicting signals.
