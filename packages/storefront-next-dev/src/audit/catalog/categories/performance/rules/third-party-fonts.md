---
id: performance/third-party-fonts
title: Third-Party Fonts
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary, playhouse.lighthouse, playhouse.network-har]
---

## Intent
Checks that the fonts a page needs for its first render are served from the storefront's own origin. A font from a font service such as Google Fonts or Adobe Fonts usually arrives through a stylesheet from that service, often pulled in with a CSS `@import`: the browser has to fetch the page's CSS, then the service's stylesheet, then the font, each from a new origin with its own DNS and TLS setup. Text that uses the font can't render in its final font until the whole chain finishes, and the page shifts when it swaps in.
## Inspect
The rule script reads each page's median mobile cold-cache run from `summary.json`, that run's Lighthouse result (`runs/<run>/lhr.json`) and its HAR (`runs/<run>/network.har`). From the `network-requests` audit it takes every font, and every stylesheet that loads one, from another site than the document (Lighthouse's entity, else the host). It counts one when it is preloaded, or requested before both the run's observed LCP and its load event, the same cutoff as `performance/render-blocking-font-size`. The HAR's initiators name the stylesheet that requested each font, and whether that stylesheet was itself imported by another one. Third-party fonts requested later, such as those a tag manager or a widget adds, are reported but not counted. A page whose Lighthouse result lacks these audits, an observed LCP or a document request is skipped; if no page can be measured, the rule is not decided.
## Evaluate
Pass when no measured page requests a third-party font or font stylesheet before LCP and the load event, including pages with no web fonts; fail otherwise.
## Evidence
For each failing page, the Lighthouse network request of each third-party font and font stylesheet in its first render (up to 4 per page), with its origin, when it was requested or that it was preloaded, and the stylesheet that requested or imported it.
## Remediation
Self-host the fonts when their license allows it (Google Fonts are open-source licensed; check commercial fonts with their vendor). Download WOFF2 files subset to the characters the storefront uses (for example Latin, with `unicode-range` for other scripts), preferably one variable font instead of several static weights. In a Storefront Next project, put the files in `public/fonts`, declare them with `@font-face` and `font-display: swap` in the theme CSS, remove the `@import` or `<link>` to the font service and its preconnect, and preload only the face used above the fold from the root route's `links`. If the license only allows the vendor's hosted service, load its stylesheet with a `<link>` in the document instead of an `@import`, and preconnect to the font origin. Re-run Playhouse to confirm the fonts now come from the storefront's origin.
## Examples
Compliant: Inter self-hosted as one 35 KiB subset variable WOFF2, preloaded from the root route. Problematic: `@import url('https://fonts.googleapis.com/css2?family=Inter…')` in the theme CSS, which loads the font from `fonts.gstatic.com` after two stylesheet round trips.
