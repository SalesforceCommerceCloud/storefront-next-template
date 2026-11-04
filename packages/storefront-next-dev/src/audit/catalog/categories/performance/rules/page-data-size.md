---
id: performance/page-data-size
title: Page Data Size
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.scripts, source.code]
---

## Intent
Checks that the loader data React Router embeds in each page's HTML is 200 KiB or less. Everything a loader returns is serialized into the page so the browser can hydrate it, including fields the page never shows. Loaders that return raw Commerce API responses are the usual cause: every product's full image list, long absolute image URLs, variation and promotion details, custom attributes and whole category trees. When a page is over budget, the report points to the loaders and fields that could be trimmed.
## Inspect
The rule script adds up the page data scripts Playhouse archived from each page's HTML (`window.__reactRouterContext.streamController.enqueue(...)`, including streamed data). If every page is within 200 KiB, it passes and this rule needs no analysis.

Otherwise, use the `data` file (sizes are in bytes): each page lists its sizes and `scripts.pageData`, the archived page data scripts largest first (relative to the page's `archiveDir`). Read the largest ones; they hold React Router's turbo-stream encoding, in which strings appear once and objects refer to them by index. Find which route's data the large strings belong to (keys such as `loaderData` and route ids such as `routes/_app.category.$categoryId`) and which fields take the most space. Then read that route's loaders in the project and the components that render their data, and list the returned fields the components never read.
## Evaluate
Report one `finding` for the rule, covering every page over 200 KiB. Lead with the fields that would save the most, with an approximate size for each, and the loader that returns them. Typical trims: map the API response to the fields the page renders before returning it from the loader; request fewer `expand` options; return only the images a product tile shows instead of every image group; return image paths instead of repeated absolute URLs. Data the page renders, or that client code needs later (for example, every color's images so a shopper can switch colors without a request), or that SEO or client-side navigation needs, stays. The customer decides which trims to apply, so phrase each one as a suggestion.
## Evidence
For each page over budget: its largest page data script (`playhouse`, with its size as `value`), and `source` evidence for each loader that returns the unused fields and for the components that read the fields that stay.
## Remediation
Shape loader data into what the page renders before returning it, so only that is serialized into the HTML. Re-run Playhouse to confirm each page's data is at or under 200 KiB.
## Examples
Compliant: a PLP loader that returns, for each product tile, its name, price, link and one image. Problematic: a PLP loader that returns the raw `productSearch` response, embedding every hit's swatch image URLs and variant UPC lists the tiles never show.
