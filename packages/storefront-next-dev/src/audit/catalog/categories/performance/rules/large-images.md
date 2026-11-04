---
id: performance/large-images
title: Large Images
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.lighthouse, playhouse.network-har, source.code]
---

## Intent
Checks for images that are much larger than they need to be: delivered at more pixels than the screen shows, in an older format, or animated GIFs that would be far smaller as video. Each image is compared with what its own spot on the page needs, at the phone's pixel density, so there is no page-wide image budget. When an image would save 10 KiB or more, the report points to the component that renders it.
## Inspect
The rule script reads Lighthouse's image delivery insight (`image-delivery-insight`) from each page's mobile cold-cache median run. Lighthouse compares each image with its displayed size in CSS pixels, which overstates the savings on high-density screens, so the script recomputes the resize savings at the emulated pixel density (`dpr`, usually 3). It keeps an image only when it has at least twice the pixels the screen needs and would save 10 KiB or more, and keeps Lighthouse's format and animated GIF savings of 10 KiB or more. Lighthouse's compression-only estimate is left out: it assumes a fixed number of bytes per CSS pixel, so it flags images that are right-sized for the screen. If no image qualifies, it passes and this rule needs no analysis.

Otherwise, use the `data` file (sizes are in bytes). Each page lists its `images`, largest savings first, with the delivered (`intrinsic`) and displayed (`shown`) sizes, the `reasons` and their savings, the element's `selector` and `label` (usually its alt text; the URL's file name also helps find it), and whether it is above the fold or requested before the LCP. `dropped` counts the images Lighthouse listed that are right-sized for the pixel density, and `totalSavingsBytes` sums the page's savings. For each image, find the component that renders it: product images usually come from the `DynamicImage` component or a helper that builds DIS URLs, and content images from Page Designer components or content assets. Check the `widths` (or `sizes`) it passes, or whether it uses a fixed `sw` or the original image URL. Images bundled with the app (imported from the project, not served by B2C Commerce) don't go through DIS.
## Evaluate
Report one `finding` for the rule, covering every page with qualifying images. Group images rendered by the same component, and lead with the largest savings. Use medium severity when an image is above the fold or requested before the LCP, since it competes with the most important content, or when a page's images would save 100 KiB or more in total; otherwise low. Typical fixes: give `DynamicImage` `widths` that match the layout at each breakpoint, so the browser can pick a smaller file; set the widths of Page Designer image components; show a still image or a video instead of an animated GIF; for a bundled asset such as a logo, use SVG or ship it as WebP. Phrase each one as a suggestion.
## Evidence
For each component: one image it renders (`playhouse`, citing the Lighthouse result with pointer `/audits/image-delivery-insight/details/items/<item>` and a `value` such as `1200×1200 delivered for a 186×186 slot; about 56 KiB smaller at 558×558`), and `source` evidence for the component and the widths it passes.
## Remediation
Request each image at the width its slot needs on each breakpoint, through `DynamicImage` `widths` or the DIS `sw` parameter, and replace animated GIFs with video or a still image. Re-run Playhouse to confirm the images no longer appear in the data.
## Examples
Compliant: a product tile that requests 360-, 720- and 1080-pixel candidates for a tile shown 360 pixels wide on a 3× phone. Problematic: a home page content card that loads a 1200-pixel image into a 186-pixel slot, or a 2.7 MB animated GIF shown as a 60-pixel thumbnail.
