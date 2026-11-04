---
id: performance/lcp-budget
title: Largest Contentful Paint (LCP)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary]
---

## Intent
Checks that each page's median Largest Contentful Paint, measured by Lighthouse on mobile with a cold cache, is 2.5 s or less, the Core Web Vitals "good" threshold. LCP is when the largest image or block of text on screen appears, the main sign to shoppers that the page has loaded.
## Inspect
The rule script reads each page's `summary.json` and takes the mobile cold-cache cell's `medianRun.lcp`. Playhouse writes 0 for metrics it could not measure, and a rendered page always has a positive LCP, so a run with an LCP of 0 or less measured nothing. Such runs are left out: when any run failed, the script picks the median again from the measured runs the way Playhouse does (the run closest to the median LCP, ties to the earlier run) and reads that run's `runs[].row.lcp`.
## Evaluate
Pass when every measured page's median LCP is at or under 2500 ms; fail otherwise. A page without a mobile cold-cache cell, or without any measured run, is skipped. If no page can be measured, the rule is not decided.
## Evidence
One `summary.json` pointer per page, `/cells/<i>/medianRun/lcp` (or `/runs/<j>/row/lcp` when runs were left out), with the measured value and how many runs were not measured.
## Remediation
Use `opportunities.json` and `summary-lcp.json` for the failing page to find the dominant LCP subpart (TTFB, load delay, load duration or render delay). Preload or prioritize the LCP resource, serve it at the displayed size, and remove render-blocking work before it. Re-run the same Playhouse capture to confirm the mobile cold-cache median is at or under 2500 ms.
## Examples
Compliant: home median LCP 2180 ms. Problematic: pdp median LCP 3400 ms.
