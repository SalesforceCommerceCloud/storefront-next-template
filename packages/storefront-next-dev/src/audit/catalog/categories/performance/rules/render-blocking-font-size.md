---
id: performance/render-blocking-font-size
title: Render-Blocking Font Size
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary, playhouse.lighthouse]
---

## Intent
Checks that the web fonts each page needs for its first render add up to 75 KiB or less. A font counts as render-blocking when it is preloaded, or requested before both the page's Largest Contentful Paint (LCP) and its load event: text that uses it can't appear in its final font until the file arrives, and the download competes with CSS and the LCP image for bandwidth on mobile. Fonts requested later, such as those a tag manager or a third-party widget adds after the page has loaded, are not counted.
## Inspect
The rule script reads each page's median mobile cold-cache run from `summary.json` and that run's Lighthouse result (`runs/<run>/lhr.json`). From the `network-requests` audit it takes every request Chrome classified as a font, counting each URL once at its decoded size, and compares the request's start time with the observed LCP and load event of the same run from the `metrics` audit, whichever came first (LCP alone when the load event is missing). First- and third-party fonts both count when they are render-blocking. A page whose Lighthouse result lacks these audits, an observed LCP or a font's start time is skipped; if no page can be measured, the rule is not decided.
## Evaluate
Pass when every measured page's render-blocking fonts total 75 KiB or less, including pages with no web fonts; fail otherwise.
## Evidence
For each failing page, the Lighthouse network request of its largest render-blocking fonts (up to 4 per page), with each font's size and why it counts: preloaded, or requested before LCP and the load event.
## Remediation
Start with the largest file. Subset fonts to the characters the storefront uses (for example Latin, with `unicode-range` for other scripts), serve WOFF2, and replace several static weights with one variable font. Preload only the one or two fonts used above the fold; let other weights and families load without a preload so they arrive after the first render. Re-run Playhouse to confirm.
## Examples
Compliant: one preloaded 22 KiB variable font. Problematic: four preloaded static weights of 30 KiB each (120 KiB).
