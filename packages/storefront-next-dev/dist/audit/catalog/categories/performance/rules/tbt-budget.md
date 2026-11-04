---
id: performance/tbt-budget
title: Total Blocking Time (TBT)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary]
---

## Intent
Checks that each page's median Total Blocking Time, measured by Lighthouse on mobile with a cold cache, is 200 ms or less, Lighthouse's "good" threshold. TBT adds up how long JavaScript blocks the main thread while the page loads, which delays the page's response to taps and clicks.
## Inspect
The rule script reads each page's `summary.json` and takes the mobile cold-cache cell's `medianRun.tbt`. Playhouse writes 0 for metrics it could not measure, and a rendered page always has a positive LCP, so a run with an LCP of 0 or less measured nothing. Such runs are left out: when any run failed, the script picks the median again from the measured runs the way Playhouse does (the run closest to the median LCP, ties to the earlier run) and reads that run's `runs[].row.tbt`.
## Evaluate
Pass when every measured page's median TBT is at or under 200 ms; fail otherwise. A page without a mobile cold-cache cell, or without any measured run, is skipped. If no page can be measured, the rule is not decided.
## Evidence
One `summary.json` pointer per page, `/cells/<i>/medianRun/tbt` (or `/runs/<j>/row/tbt` when runs were left out), with the measured value and how many runs were not measured.
## Remediation
Use `opportunities.json` and `summary-tbt.json` for the failing page to find the long tasks and the scripts behind them. Defer or remove non-critical third-party scripts, split large bundles, and move hydration-heavy work off the initial load. Re-run the same Playhouse capture to confirm the mobile cold-cache median is at or under 200 ms.
## Examples
Compliant: home median TBT 120 ms. Problematic: pdp median TBT 650 ms.
