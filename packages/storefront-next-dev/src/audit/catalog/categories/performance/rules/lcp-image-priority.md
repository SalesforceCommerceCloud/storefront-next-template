---
id: performance/lcp-image-priority
title: LCP Image Priority
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary-lcp, playhouse.lighthouse, playhouse.network-har]
---

## Intent
Checks that when the largest element on screen is an image, the browser finds it in the HTML and downloads it first. The LCP image should be in the server-rendered HTML (or preloaded), start at High priority with `fetchpriority="high"`, not be lazy-loaded, be downloaded once at the size shown, and not share the connection with other large images. Pages whose largest element is text are left out.
## Inspect
The rule script takes the LCP image from each page's `summary-lcp.json` (mobile cold-cache median run) and finds its request in that run's HAR and Lighthouse result. It checks:
- `not-in-html`: Lighthouse's LCP discovery insight says the request isn't discoverable in the HTML, or JavaScript started it.
- `lazy`: the image uses `loading="lazy"`.
- `low-priority`: the request didn't start at High priority (it may be raised once layout shows it's on screen, which is too late).
- `preload-mismatch`: the page preloads the same image at a different URL, so it downloads twice.
- `competing-images`: other images of 10 KiB or more start at High priority before it.
- `bandwidth`: other images downloading at the same time delay it by 100 ms or more, estimated from their share of the bytes downloaded while it loads.
- `render-blocking`: Lighthouse estimates render-blocking requests delay the LCP by 100 ms or more.
## Evaluate
Pass when no page's LCP image has an issue; fail otherwise, at high severity when a page with an issue has an LCP over 2.5 s and medium when it is within. Undecided only when no page could be measured.
## Evidence
One `playhouse` item per issue, citing the HAR entry or Lighthouse audit, with the issue as its `value`.
## Remediation
Render the LCP image in the server HTML with `fetchpriority="high"` and without `loading="lazy"` (in the storefront, `DynamicImage` with `priority="high"`), make sure any preload uses the same URL and widths as the image, give other images default priority, and lazy-load images below the fold so they don't share the connection. Re-run Playhouse to confirm.
## Examples
Compliant: a home hero preloaded at High priority that downloads before the below-the-fold images start. Problematic: a PDP whose main image downloads alongside a 2.7 MB animated GIF thumbnail, or a hero image added after hydration that starts at Low priority.
