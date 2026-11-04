---
id: performance/cache-control
title: Browser Cache Lifetimes for Static Files
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har]
---

## Intent
Checks the `Cache-Control` header on the storefront's own scripts, stylesheets, images and fonts: at least 1 year for fingerprinted scripts and stylesheets (a content hash in the file name, e.g. `entry.client-Be9z2OkY.js`), 1 hour for other scripts and stylesheets, and 1 day for images and fonts. Long enough lifetimes let browsers and CDNs reuse files instead of downloading them again. HTML, API responses and third-party files are not checked.
## Inspect
The rule script matches the final document response in `network-mobile-cold.har` (via `network-mobile-cold.json`) for each page. Only same-host responses with status 200 are checked; third-party responses are skipped. It classifies scripts, stylesheets, images and fonts by content type, treats a script or stylesheet as fingerprinted when its file name carries a content hash (e.g. `entry.client-Be9z2OkY.js`), and reads `Cache-Control`. If no page's document can be matched, the rule is not decided.
## Evaluate
Fail when `Cache-Control` is missing, `private` or `no-store`, or its `max-age` is missing or under: 1 year for fingerprinted scripts and stylesheets, 1 hour for other scripts and stylesheets, 1 day for images and fonts. HTML and API/JSON responses are not graded. Pass otherwise.
## Evidence
The HAR entry of each failing response (up to 10), with its `Cache-Control`.
## Remediation
Set the policy at the layer that owns the response: Managed Runtime or the public edge for bundle assets, a customer CDN when it rewrites headers, application code for application-owned responses. Use `public, max-age=31536000, immutable` only for content-hashed files and shorter lifetimes for URLs that change in place. Re-run Playhouse to confirm.
## Examples
Compliant: `app-a1b2c3d4.js` with `public, max-age=31536000`. Problematic: a fingerprinted bundle with no `Cache-Control`, or a product image with `private, no-store`.
