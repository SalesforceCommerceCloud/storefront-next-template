---
id: performance/cls-budget
title: Cumulative Layout Shift (CLS)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary]
---

## Intent
Checks that each page's median Cumulative Layout Shift, measured by Lighthouse on mobile with a cold cache, is 0.1 or less, the Core Web Vitals "good" threshold. A high CLS means content jumps around while the page loads.
## Inspect
The rule script reads each page's `summary.json` and takes the mobile cold-cache cell's `medianRun.cls`. Playhouse writes 0 for metrics it could not measure, and a rendered page always has a positive LCP, so a run with an LCP of 0 or less measured nothing. Such runs are left out: when any run failed, the script picks the median again from the measured runs the way Playhouse does (the run closest to the median LCP, ties to the earlier run) and reads that run's `runs[].row.cls`.
## Evaluate
Pass when every measured page's median CLS is at or under 0.1; fail otherwise. A page without a mobile cold-cache cell, or without any measured run, is skipped. If no page can be measured, the rule is not decided.
## Evidence
One `summary.json` pointer per page, `/cells/<i>/medianRun/cls` (or `/runs/<j>/row/cls` when runs were left out), with the measured value and how many runs were not measured.
## Remediation
Use `opportunities.json` and `report-mobile-cold.html` for the failing page to find the shifting elements. Reserve space for images, embeds and late-loading content (explicit width/height or aspect-ratio), and avoid inserting content above existing content. Re-run the same Playhouse capture to confirm the mobile cold-cache median is at or under 0.1.
## Examples
Compliant: home median CLS 0.04. Problematic: pdp median CLS 0.22.
