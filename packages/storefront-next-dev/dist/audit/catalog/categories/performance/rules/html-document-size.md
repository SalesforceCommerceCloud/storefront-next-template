---
id: performance/html-document-size
title: HTML Document Size
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har, playhouse.scripts]
---

## Intent
Checks that each page's HTML is 350 KiB or less before compression. The browser has to download and parse all of the HTML, and React then hydrates it, before the page responds, so large HTML slows the first render on mobile. The result splits each page into its main parts (page data, app config, other inline scripts and markup) so the biggest one is easy to spot.
## Inspect
The rule script takes the decoded size of each page's document response from `network-mobile-cold.har`. It splits that size using the inline scripts Playhouse archived from the same HTML (`scripts/index.json`): React Router page data (`streamController.enqueue(...)` scripts), the app config (`window.__APP_CONFIG__`), other inline scripts, and everything else, counted as markup.
## Evaluate
Pass when every measured page's decoded HTML is at or under 350 KiB; fail otherwise. A page whose document can't be matched in the HAR is skipped. If no page can be measured, the rule is not decided.
## Evidence
The document's HAR entry for each failing page, with its size and breakdown.
## Remediation
Start with the largest part of the breakdown: page data is covered by `performance/page-data-size`, the app config by `performance/app-config-size`, and markup by `performance/dom-size`. Re-run Playhouse to confirm each page's HTML is at or under 350 KiB.
## Examples
Compliant: a PLP of 290 KiB. Problematic: a PDP of 501 KiB, of which 297 KiB is page data.
