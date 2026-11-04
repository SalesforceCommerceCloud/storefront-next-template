---
id: performance/ttfb-budget
title: Time to First Byte (TTFB)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary]
---

## Intent
Checks that each page's server response time from its representative mobile cold-cache run is 800 ms or less. The representative run is the run selected by median LCP. TTFB isolates the time from sending the document request until its first response byte, without counting DNS, TCP, TLS, or redirect time.
## Inspect
The rule script reads each page's `summary.json` and takes the mobile cold-cache cell's `medianRun.ttfb`, which Playhouse derives from Lighthouse's `server-response-time` audit. A valid run must have both a positive LCP and a positive TTFB. Playhouse can write 0 for either metric when it could not measure it, so those runs are left out. When any run is invalid, the script picks the median again from the valid runs the way Playhouse does (the run closest to the median LCP, ties to the earlier run) and reads that run's `runs[].row.ttfb`.
## Evaluate
Pass when every measured page's representative-run TTFB is at or under 800 ms; fail otherwise. A failure is medium severity, or high above 1,800 ms. A page without a mobile cold-cache cell, or without any measured run, is skipped. If no page can be measured, the rule is not decided.
## Evidence
One `summary.json` pointer per page, `/cells/<i>/medianRun/ttfb` (or `/runs/<j>/row/ttfb` when runs were left out), with the measured value, the measured min–max spread when several runs exist, and how many runs were not measured. The verdict stays limited to the stable server-response measurement; captured network timing and response headers can be inspected separately when diagnosing a failure.
## Remediation
Use application and platform traces, plus existing response timing and cache headers when available, to locate the delay. Parallelize independent server work and reduce blocking SCAPI or CMS calls. Do not prescribe shared HTML caching without confirming with the merchant that the response does not vary by shopper. Re-run the same Playhouse capture to confirm the mobile cold-cache representative-run TTFB is at or under 800 ms.
## Examples
Compliant: home representative-run TTFB 480 ms. Problematic: PLP representative-run TTFB 1,250 ms.
