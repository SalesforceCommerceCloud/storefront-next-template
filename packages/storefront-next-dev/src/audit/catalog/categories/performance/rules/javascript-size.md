---
id: performance/javascript-size
title: First-Party JavaScript Size
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.lighthouse]
---

## Intent
Checks that the storefront's own JavaScript on each page, everything served from the bundle path (`/mobify/bundle/…`) including the npm packages bundled into it, is 1.4 MB or less before compression, just above the Storefront Next template's heaviest page (its PDP, about 1.36 MB). The browser downloads, parses and runs all of it before the page responds to taps, so it adds directly to mobile load and blocking time. Scripts loaded by tags (analytics, pixels, tag managers) are third-party and aren't counted here.
## Inspect
The rule script reads the mobile cold-cache median run's `runs/<runId>/lhr.json` (the run named by `summary-lcp.json`) and keeps the `network-requests` items that are scripts served from `/mobify/bundle/`. It sums their decoded size (`resourceSize`) and transfer size, and splits them at the run's own load event (`observedLoad`). Everything here is measured on the live site; the local build never adds to it, because the live site may be built from other code.
## Evaluate
Pass when every measured page's decoded first-party JavaScript is at or under 1,400,000 bytes; fail otherwise, with high severity when a page is at or over 2,700,000 bytes and medium below that. A page whose run has no `network-requests` audit, or that loaded no first-party scripts, is skipped. If no page can be measured, the rule is not decided.
## Evidence
For each page, the run's `network-requests` items with the total decoded and transfer bytes and the script count; for a failing page, the largest scripts' `resourceSize` too.
## Remediation
See `performance/reduce-javascript-on-load`, which analyzes a local build of the project and recommends code to load later. Load code for closed overlays, below-the-fold widgets and forms with `React.lazy` or a dynamic `import()` when it's first needed. Deploy the changes and re-run the audit to confirm each page is at or under 1.4 MB.
## Examples
Compliant: a home page that loads 131 first-party scripts, 1.16 MB decoded. Problematic: a PDP that loads 2.9 MB, a third of it a carousel and a date library imported by the page route.
