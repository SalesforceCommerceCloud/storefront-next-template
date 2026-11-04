---
id: performance/image-transformation
title: Image Transformation
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har, source.code]
---

## Intent
Checks that product and content images from B2C Commerce are served through the Dynamic Imaging Service (DIS), which resizes them to the width the page asks for and converts them to WebP or AVIF. An image linked as uploaded (`/on/demandware.static/...` instead of `/dw/image/v2/...`) is sent at its full original size and format, often several times larger than needed. Vector images (SVG) and animated GIFs are left out: DIS doesn't help them, and `performance/large-images` covers GIFs.
## Inspect
The rule script lists every image of 10 KiB or more that each page's mobile cold-cache median run downloaded from B2C Commerce, and flags three problems: `bypasses-dis` (a static file URL, not DIS), `not-resized` (a DIS URL without `sw` or `sh`) and `legacy-format` (DIS returned JPEG or PNG instead of WebP or AVIF). If no image has a problem, it passes and this rule needs no analysis.

Otherwise, use the `data` file (sizes are in bytes): each page lists the flagged `images` with their HAR `entry`, size, response type, problems, and whether the image is the page's LCP image (`lcp`) or was requested before the LCP. The HAR is the run's `harArtifact`, which redacts query values; cite it as the data does. For each, find where the project builds the image URL. The storefront's `DynamicImage` component and its URL helpers (`toImageUrl`, `getSrc`) produce DIS URLs; images usually bypass DIS when a component renders the API's `link` directly instead of `disBaseLink`, when a content asset's HTML embeds static URLs, or when a host isn't recognized as DIS-capable (check `images.host` and `images.realmHostMappings` in the app config).
## Evaluate
Report one `finding` for the rule, covering every flagged image. Group images by the component or content that renders them. Base severity on size: high when a flagged image is 200 KiB or more, or the flagged images on a page total 200 KiB or more; medium at 50 KiB or more; low otherwise. Raise it one level when a flagged image is the page's LCP image or is requested before the LCP, since it then slows the page's main content. Suggest rendering the image through `DynamicImage` (or its URL helpers) with widths that match the layout.
## Evidence
For each component or content source: one flagged image (`playhouse`, citing the HAR with pointer `/log/entries/<entry>` and a `value` such as `CEP754_B1245_01.jpg, 640 KiB, image/jpeg: not through DIS`), and `source` evidence for where its URL is built.
## Remediation
Build Commerce image URLs through `DynamicImage` or its URL helpers from the image's `disBaseLink`, with `widths` for each breakpoint, so DIS resizes and converts them. Re-run Playhouse to confirm every Commerce image is a resized DIS URL served as WebP or AVIF.
## Examples
Compliant: `/dw/image/v2/ABCD_PRD/on/demandware.static/.../shoe.webp?sw=720&q=70&sfrm=jpg`, served as `image/webp`. Problematic: `/on/demandware.static/-/Sites-catalog/default/dw1234/images/large/shoe.jpg`, the 2400-pixel original, used as a gallery thumbnail.
