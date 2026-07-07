# Images in Storefront Next

## Dynamic Imaging Service (DIS)

Salesforce B2C Commerce's [Dynamic Imaging Service](https://help.salesforce.com/s/articleView?id=cc.b2c_image_transformation_service.htm&type=5) (DIS) is an image transformation service that optimizes images on-the-fly. Instead of storing pre-generated image variants, DIS transforms images at request time based on URL parameters. CDNs in front of DIS can then cache the transformed results at the edge.

### Why Use DIS

Images are typically the single largest contributor to page weight. Unoptimized images directly degrade Core Web Vitals, increasing Largest Contentful Paint (LCP) and slowing Time to Interactive. DIS addresses this at the infrastructure level:

- **Format conversion**: Serves modern formats like WebP (25-35% smaller than JPEG/PNG) with automatic fallback. The `sfrm` (source format) parameter tells DIS the original format so it can transcode on the fly.
- **Server-side resizing**: Sends each device exactly the pixels it needs. A mobile phone receives a 400px-wide image, not a 1400px desktop image downscaled in the browser. When only `sw` (scale width) is set, DIS scales proportionally. When both `sw` and `sh` (scale height) are set, DIS scales the image to those exact output dimensions, constraining the aspect ratio.
- **Quality control**: The `q` parameter lets you balance visual fidelity against file size. The default `q=70` is a good baseline for commerce product photography.

### DIS URL Anatomy

Storefront Next rewrites static B2C Commerce image URLs into DIS URLs with transformation parameters:

```
Original (static asset):
https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-catalog/default/.../image.jpg

DIS URL:
https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-catalog/default/.../image.webp?sfrm=jpg&sw=720&sh=480&q=70
        └─────────────── DIS Host ──────────────┘           └ Realm ┘                                                       └─ Format(s) ─┘└──── Params ────┘
```

**Parameters used by `<DynamicImage>`:**

| Parameter | Full Name     | Description                                                                                    | Example    |
|-----------|---------------|------------------------------------------------------------------------------------------------|------------|
| `sw`      | `scaleWidth`  | Scale width — resizes to this width in pixels. When used alone, aspect ratio is preserved      | `sw=720`   |
| `sh`      | `scaleHeight` | Scale height — when combined with `sw`, scales to exact dimensions (constraining aspect ratio) | `sh=480`   |
| `q`       | `quality`     | Quality — 1 to 100. Controls compression level                                                 | `q=70`     |
| `sfrm`    | —             | Source format — tells DIS the original format for transcoding                                  | `sfrm=jpg` |

The file extension in the URL path determines the **output** format (e.g., `.webp`), while `sfrm` records the original format.

**Additional DIS parameters** not used by `<DynamicImage>` (but available for custom URL construction via `toDisImageUrl()`):

| Parameter              | Full Name                                   | Description                                                                                                                           |
|------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `sm`                   | `scaleMode`                                 | Controls scaling behavior: `fit` (default, fits within `sw`×`sh` preserving aspect ratio), `cut` (fills `sw`×`sh` and crops overflow) |
| `cx`, `cy`, `cw`, `ch` | `cropX`, `cropY`, `cropWidth`, `cropHeight` | Pixel-precise crop region — all four must be specified together                                                                       |
| `bgcolor`              | —                                           | Background color for transparent areas (6-digit hex, e.g., `bgcolor=FFFFFF`)                                                          |
| `strip`                | —                                           | Remove image metadata (EXIF, etc.)                                                                                                    |

### Configuration

DIS behavior is controlled via `config.server.ts` under the `images` key:

```typescript
images: {
  quality: 70,            // Default DIS quality (1-100)
  formats: ['webp'],      // Target format(s) for <source> elements
  fallbackFormat: 'jpg',  // Format for the <img> fallback src
  host: DIS_DEFAULT_HOST, // DIS endpoint URL
  enableDis: true,        // Master switch to enable/disable DIS
  realmHostMappings: [],  // Custom domain → realm mappings (see below)
}
```

#### Vanity Domains and Custom Realm Mappings

By default, the image system derives the Commerce Cloud realm (e.g., `ZZRF_001`) from standard SFCC hostnames:
- `*.commercecloud.salesforce.com` → extracts realm from subdomain
- DIS URLs (`/dw/image/v2/{REALM}/...`) → extracts from path

For **vanity domains** (custom storefront domains like `shop.example.com`) or non-standard SFCC hosts, the realm cannot be automatically inferred. Use `realmHostMappings` to define custom hostname suffix → realm pairs:

```typescript
images: {
  // ...other config...
  realmHostMappings: [
    { hostSuffix: 'shop.example.com', realm: 'ZZRF_001' },
    { hostSuffix: 'store.mymerchant.com', realm: 'BJNL_DEV' },
    { hostSuffix: '.internal-dev.example.com', realm: 'TEST_001' },
  ],
}
```

**Matching rules:**
- `hostSuffix` matches against the **end** of the hostname (case-insensitive)
- Prefix with `.` to match a specific subdomain and all children (e.g., `.example.com` matches `shop.example.com`, `m.example.com`, etc.)
- Realm values are automatically uppercased
- Custom mappings are checked **before** built-in SFCC patterns

**When URLs don't match any mapping:** Non-DIS URLs (no `/dw/image/v2/{REALM}/` path, no `sfrm` param) are served as-is without DIS transformation. This prevents broken images from 404ing on non-SFCC domains.

**Environment variable overrides** (useful per-environment):

```bash
PUBLIC__app__images__quality=80
PUBLIC__app__images__enableDis=false
PUBLIC__app__images__host=https://edge.dis.commercecloud.salesforce.com
```

**DIS hosts:**

- Staging: `https://edge.disstg.commercecloud.salesforce.com`
- Production: `https://edge.dis.commercecloud.salesforce.com`

When `enableDis` is `false` (e.g., in workspace environments), the image system falls back to serving static assets directly. Format conversion, server-side resizing, and `<source>` generation are all skipped.

## Image Filtering on Product Listing Pages

Search responses (`fetchSearchProducts`) include an `imageGroups` array on every hit. By default SCAPI returns every imageGroup for every variant, which on variant-heavy catalogs can be the dominant contributor to PLP payload size — most of those images are never rendered.

The template restricts the response via SCAPI's [`imgTypes` query parameter](https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-search?meta=productSearch) using `config.server.ts`:

```typescript
search: {
  products: {
    images: {
      tile: 'medium',
      swatch: 'swatch',
    },
  },
}
```

Each role names the viewType a specific consumer reads — `tile` for the product tile hero, `swatch` for the color thumbnails. The search filter derives its `imgTypes` query parameter as the union of these values (deduplicated and joined with `,`), so adding a new role automatically widens the filter. Setting a role to `undefined` opts that role out; setting all roles to `undefined` (or providing an empty `images: {}`) disables filtering entirely and returns the full payload. `imgTypes` requires `expand=images` and `allImages=true`; both are set by `fetchSearchProducts`.

Implementation: [src/lib/api/search.server.ts](../src/lib/api/search.server.ts). Full config reference: [docs/README-CONFIG-OPTIONS.md](./README-CONFIG-OPTIONS.md#searchproductsimagestile).

### Keeping role-named values aligned with consumers

If you customize the product tile to read a different viewType (e.g. switch the hero from `medium` to `large`), you must update the matching role here — otherwise the tile will receive empty image arrays for the unrequested viewType. The OOTB consumers that should eventually read from these declarations are:

- `tile` → [src/components/product-image/index.tsx](../src/components/product-image/index.tsx) (currently hardcodes `'medium'`)
- `swatch` → [src/lib/product/product-utils.ts](../src/lib/product/product-utils.ts) (`getDecoratedVariationAttributes`, defaults `swatchViewType` to `'swatch'`)

The hardcoded strings in those consumers are tracked for a follow-up cleanup that will derive them from these same role-named declarations, eliminating drift.

## `<DynamicImage>` Component

`<DynamicImage>` is a responsive image component that generates an optimized `<picture>` element with DIS-powered `<source>` elements and responsive preloading via React 19's [`preload()`](https://react.dev/reference/react-dom/preload) API.

**Import:**

```typescript
import { DynamicImage } from '@/components/dynamic-image';
```

### Basic Usage

```jsx
<DynamicImage
  src="https://example.com/image.jpg"
  alt="Product photo"
  widths={[400, 800, 1200]}
/>
```

This renders a `<picture>` with `<source>` elements sized per breakpoint, each requesting a DIS-resized WebP variant with 1x and 2x srcSet descriptors.

### The `src` Prop and Placeholder Syntax

The `src` prop accepts plain URLs or URLs with **placeholder syntax**: bracket-delimited segments that `DynamicImage` replaces with computed values.

```jsx
// Plain URL — DynamicImage appends sw/sh/q params automatically
<DynamicImage src="https://example.com/image.jpg" widths={[400, 800]} />

// Placeholder syntax — {width} and {height} are replaced per breakpoint
<DynamicImage src="https://example.com/image.jpg[?sw={width}&sh={height}]" widths={[400, 800]} heights={[300, 600]} />

// Inline placeholder in path segment
<DynamicImage src="https://example.com/image[_{width}].jpg" widths={[400, 800]} />
```

The bracket syntax `[...]` marks optional URL segments that are stripped when no dimensions are provided.

### Responsive Widths

The `widths` prop controls how wide each `<source>` requests its image from DIS. It determines the `sw` parameter value and the `sizes` attribute in the generated markup. It accepts three formats:

**Array of numbers** (interpreted as px):

```jsx
<DynamicImage src={imageSrc} widths={[400, 600, 800, 1000]} />
```

**Array of strings** (px or vw units):

```jsx
// Mixed units — vw for fluid layouts, px for fixed layouts
<DynamicImage src={imageSrc} widths={['100vw', '50vw', '680px']} />
```

When using `vw` units, `DynamicImage` calculates the actual pixel width at each breakpoint to request the correct size from DIS.

**Object with breakpoint keys** (maps to Tailwind's default breakpoints):

```jsx
<DynamicImage src={imageSrc} widths={{ base: 400, sm: 600, md: 800, lg: 1000 }} />

// With units
<DynamicImage src={imageSrc} widths={{ base: '100vw', sm: '50vw', md: '680px' }} />
```

Breakpoint keys correspond to Tailwind's default theme: `base`, `sm`, `md`, `lg`, `xl`, `2xl`. Values are carried forward: `{ base: 400, lg: 800 }` produces `[400, 400, 400, 800]`.

Use fixed px widths when the image container has a predetermined size (e.g., carousels):

```jsx
<DynamicImage src={image.src} widths={['348px', '256px', '256px', '288px']} alt={image.alt} />
```

Use vw-based widths when the image scales with the viewport (e.g., product grids, hero banners).

### Server-Side Scaling with Heights

The `heights` prop enables DIS server-side scaling via the `sh` parameter. When provided alongside `widths`, it defines exact output dimensions, giving you precise aspect ratio control across responsive breakpoints.

```jsx
// 4:3 aspect ratio maintained across all breakpoints
<DynamicImage
  src="https://example.com/image.jpg[?sw={width}&sh={height}]"
  widths={[400, 800, 1200]}
  heights={[300, 600, 900]}
/>
```

Both values are multiplied by the DPR factor. At 2x, `widths={[400]}` and `heights={[300]}` generates srcSet entries for `sw=400&sh=300` (1x) and `sw=800&sh=600` (2x).

`heights` supports the same formats as `widths` (arrays, objects with breakpoint keys, comma-separated strings for Page Designer).

When `heights` is omitted, DIS preserves the original aspect ratio based on `sw` alone.

### Loading Priority and Preloading

`DynamicImage` integrates with React 19's [`preload()`](https://react.dev/reference/react-dom/preload) to emit `<link rel="preload">` hints for high-priority images during server rendering:

```jsx
// Explicitly high priority — preloaded during SSR, loaded eagerly
<DynamicImage src={heroImage} widths={[...]} priority="high" loading="eager" />

// Auto priority (default) — determined by DynamicImageProvider context
<DynamicImage src={productImage} widths={[...]} />

// Explicitly low priority — lazy-loaded, no preload hints
<DynamicImage src={belowFoldImage} widths={[...]} priority="low" loading="lazy" />
```

When `priority` is not set, the component checks the `DynamicImageProvider` context (see below) to determine whether the image should be treated as high priority. If no context is present, it defaults to `'auto'` priority with `loading="lazy"`.

In practice, the PDP image gallery uses conditional priority to eagerly load the first visible image while lazy-loading the rest:

```jsx
<DynamicImage
  src={`${selectedImage.src}[?sw={width}]`}
  alt={selectedImage.alt || imageAltFallback}
  widths={['100vw', '680px']}
  loading={eager ? 'eager' : 'lazy'}
  priority={eager ? 'high' : undefined}
/>
```

## `DynamicImageProvider` Context

The `DynamicImageProvider` is an optional React context that controls image priority and dimensions for nested `<DynamicImage>` components. It solves a practical problem: in deep component trees (e.g., product grid → product tile → product image), determining whether an image is above-the-fold requires knowledge the image component itself doesn't have. The provider bridges that gap by separating the *decision* about importance from the *registration* of individual images.

**Import:**

```typescript
import DynamicImageProvider from '@/providers/dynamic-image';
```

### Two Separate Contracts

The provider deliberately exposes **two different interfaces**, one for the outer container that sets up the context, and one for the nested consumers that interact with it.

**Container interface** (passed via `value` prop). The container defines the business logic:

```typescript
value: {
  sources?: Set<string>;                                       // Shared source registry
  widths?: DynamicImageDimensions;                             // Responsive widths for all nested images
  heights?: DynamicImageDimensions;                            // Responsive heights for all nested images
  addSource?: (src: string, sources: Set<string>) => boolean;  // Strategy: how to register an image
  hasSource?: (src: string, sources: Set<string>) => boolean;  // Strategy: how to determine importance
}
```

The container receives the raw `Set<string>` alongside each `src`, giving it full control over the registration and lookup logic. It decides *what it means* for an image to be important.

**Consumer interface** (returned by `useDynamicImageContext()`). Consumers just register and query:

```typescript
{
  addSource: (src: string) => boolean;   // Register this image (Set is hidden)
  hasSource: (src: string) => boolean;   // Is this image important?
  widths: DynamicImageDimensions | undefined;
  heights: DynamicImageDimensions | undefined;
}
```

Consumers never see the `Set` or the strategy. They call `addSource(src)` to register themselves and read `widths`/`heights` for their dimensions. The `<DynamicImage>` component calls `hasSource(src)` internally: when it returns `true`, the image is promoted to `priority="high"` and `loading="eager"`.

This separation means the container owns all policy decisions while nested components remain generic and reusable.

### Use Case 1: Product Grid (Critical vs. Non-Critical Images)

The product grid splits tiles into critical (above-the-fold) and non-critical (below-the-fold) batches. The critical batch uses a `hasSource` that unconditionally returns `true`, so every image in that scope is high priority:

```jsx
const responsiveImageWidths = [
  '40vw', // base: 2 columns
  '25vw', // sm: 3 columns
  '18vw', // md: 4 columns
  '14vw', // lg: 4 columns with refinement panel
  '16vw', // xl: 4 columns with refinement panel
  '16vw', // 2xl: 4 columns with refinement panel
];

// Critical tiles: all images are high priority
const hasSource = useCallback(() => true, []);

<DynamicImageProvider value={{ hasSource, widths: responsiveImageWidths }}>
  {criticalProducts.map(product => <ProductTile ... />)}
</DynamicImageProvider>

// Non-critical tiles: no hasSource → all images default to lazy
<DynamicImageProvider value={{ widths: responsiveImageWidths }}>
  {nonCriticalProducts.map(product => <ProductTile ... />)}
</DynamicImageProvider>
```

The `ProductTile` component itself is identical in both batches. It doesn't know whether it's above or below the fold. The provider controls that from the outside.

Alternatively, a single provider can achieve the same result. Because `hasSource` and `addSource` both receive the shared `Set<string>`, the container can use the set's size to cap how many images are promoted. For example, treating only the first row of a 4-column grid as high priority:

```jsx
const addSource = useCallback((src, sources) => {
  if (sources.size < 4) { sources.add(src); return true; }
  return false;
}, []);
const hasSource = useCallback((src, sources) => sources.has(src), []);

<DynamicImageProvider value={{ addSource, hasSource, widths: responsiveImageWidths }}>
  {allProducts.map(product => <ProductTile ... />)}
</DynamicImageProvider>
```

The first four tiles to call `addSource` get registered; subsequent tiles are ignored. When `<DynamicImage>` later calls `hasSource`, only those four return `true`. Same tile component, same provider, just a different strategy function.

### Use Case 2: Product Tile (Selective Registration)

Inside each product tile, the `ProductImageContainer` uses `addSource` to register whichever image URL is currently selected (which depends on the active color swatch). This is where the two-step contract matters: the tile doesn't decide importance, it just registers. The grid's `hasSource` decides.

```jsx
const imageContext = useDynamicImageContext();

// Register the current image URL (resolved from the selected color variant)
currentImageUrl && imageContext?.addSource(currentImageUrl);

// Render with context-provided widths — no prop drilling needed
<ProductImage src={currentImageUrl} widths={imageContext?.widths} />
```

A more selective container could supply a `hasSource` that checks whether a specific `src` was pre-registered via `addSource`, making only certain images high-priority rather than all of them. The unconditional `() => true` in the product grid is the simplest strategy, but the same mechanism supports arbitrary filtering logic.

## Dynamic Image Utility Functions

The `@/lib/images/dynamic-image` module exports lower-level utilities for working with DIS URLs outside the `<DynamicImage>` component.

### `toImageUrl()`

Converts an image URL to a DIS-optimized URL with graceful fallback. Safe to use with any image URL; returns the original if transformation isn't possible.

```typescript
import { toImageUrl } from '@/lib/images/dynamic-image';

// SFCC URL → DIS WebP
toImageUrl({ src: 'https://demo-001.dx.commercecloud.salesforce.com/.../image.jpg', config })
// → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/.../image.webp?sfrm=jpg&q=70'

// Non-SFCC URL → returned as-is (fallback)
toImageUrl({ src: 'https://example.com/image.jpg', config })
// → 'https://example.com/image.jpg'
```

Use this when rendering images outside of `<DynamicImage>`, for example category banners or content slots with raw HTML.

### `toDisImageUrl()`

Strict variant that only handles SFCC URLs. Returns `undefined` if the URL can't be converted (non-SFCC host, missing realm, missing DIS config). Use this when you need to know definitively whether DIS transformation succeeded.

Recognized SFCC hostnames are `*.commercecloud.salesforce.com`, `*.demandware.net`, and `*.my.cc.salesforce.com`. The realm is derived from the first subdomain (e.g. `demo-001` → `DEMO_001`).

```typescript
import { toDisImageUrl } from '@/lib/images/dynamic-image';

toDisImageUrl({ src: sfccUrl, options: { width: 720, height: 480, quality: 80 }, config })
// → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/.../image.webp?sfrm=jpg&sw=720&sh=480&q=80'
```

### `toDisBaseUrl()`

Rewrites a raw SFCC static image URL into a DIS-hosted URL by inserting the `/dw/image/v2/{realm}/` prefix and switching to the configured DIS host. Unlike `toDisImageUrl()`, it **preserves the original file extension and query string** — it does not perform format conversion or append DIS transformation parameters (`sfrm`, `q`, `sw`, `sh`). Use this when downstream code (e.g. `getResponsivePictureAttributes`) handles per-breakpoint format/query generation and just needs a clean DIS-hosted base URL.

```typescript
import { toDisBaseUrl } from '@/lib/images/dynamic-image';

toDisBaseUrl({
  src: 'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/.../image.jpg',
  config,
})
// → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/.../image.jpg'
```

### `transformHtmlImageUrls()`

Batch-transforms all `<img>` tags in an HTML string to use DIS URLs. Useful for rich text content from SCAPI or Page Designer that contains embedded images.

```typescript
import { transformHtmlImageUrls } from '@/lib/images/dynamic-image';

const html = '<p>Text</p><img src="/on/demandware.static/.../banner.jpg" alt="Sale">';
const optimized = transformHtmlImageUrls(html, config);
// All <img> src attributes are transformed to DIS URLs
```

### `replaceImageFormat()`

Replaces the file extension in an image URL and adds the `sfrm` parameter to track the original format. Used internally by the component, but available for custom image handling.

```typescript
import { replaceImageFormat } from '@/lib/images/dynamic-image';

replaceImageFormat('https://example.com/image.jpg?sw=460&q=60')
// → 'https://example.com/image.webp?sw=460&q=60&sfrm=jpg'
```

## Performance Checklist

- **Above the fold**: Set `priority="high"` and `loading="eager"` on hero and LCP-candidate images. This triggers React 19 SSR preloading.
- **Below the fold**: Use the default `loading="lazy"`. Omit priority or set `priority="low"`.
- **Always set `widths` or `heights`**: Without either, `<DynamicImage>` renders a plain `<img>` with no responsive sources. The browser downloads the full-size image regardless of viewport.
- **Prefer vw for fluid layouts**: Use vw-based widths (e.g., `'50vw'`) when the image width scales with the viewport. Use px-based widths when the image has a fixed maximum size (e.g., product detail at `'680px'`).
- **Set width/height on non-DynamicImage `<img>` elements**: Always include explicit `width` and `height` attributes on standard `<img>` elements to prevent Cumulative Layout Shift (CLS). `<DynamicImage>` handles this via its responsive `<picture>` and sizing attributes.
- **Use `DynamicImageProvider` for grids**: Wrap product grids in a provider to control priority centrally rather than passing props through every tile.
- **Keep WebP as the target format**: The default `formats: ['webp']` config gives 25-35% smaller files than JPEG/PNG. The `fallbackFormat` config (default `'jpg'`) provides automatic fallback for the `<img>` src in browsers that don't support any of the `<source>` formats.
- **Tune quality per use case**: The default `quality: 70` is a good baseline. Hero banners or product zoom may benefit from higher values (80-85), thumbnails and carousels can go lower (50-60). Override globally per-environment via `PUBLIC__app__images__quality`, or per-image by adding the URL parameter `q=` to the src URL (e.g., `src="https://example.com/image.jpg?q=85"`). A `q` parameter present in the src URL takes priority over the global config.

## Image Alt Text Strategy

### Source Of Truth

For commerce product images, **SCAPI image alt text is the source of truth**.

### Fallback Order

Use this fallback order consistently for product images:

1. SCAPI image alt (`image.alt`)
2. Product name (`productName` / `name`)
3. Localized generic fallback (for example `t('common:productImageAlt')`)
4. Non-localized English fallback as a final safety net (for example `'Product Image'`)

Use explicit `||` fallback chains in components to preserve this order.

### Rules

- Always provide an `alt` attribute on rendered `<img>` elements.
- Use localized strings for generic fallback alt text, then a hardcoded English fallback as the last resort.
- Decorative images must set `alt=""` when the image is purely decorative and has no meaningful text equivalent.

### Why This Exists

This strategy keeps image accessibility predictable and avoids inconsistent alt text quality across components, while preserving SCAPI metadata as the primary content source.
