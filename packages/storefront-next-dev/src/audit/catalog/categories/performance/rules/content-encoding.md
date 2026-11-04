---
id: performance/content-encoding
title: HTML, JavaScript and CSS Compression
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har]
---

## Intent
Checks that the storefront's own HTML (1 KiB or more), JavaScript and CSS (10 KiB or more) are sent compressed with Brotli, gzip or zstd, so pages download fewer bytes. Third-party files and smaller responses are not checked. Managed Runtime compresses by default, so a failure usually points to a CDN or proxy in front of it.
## Inspect
The rule script matches the final document response in `network-mobile-cold.har` (via `network-mobile-cold.json`) for each page. Only same-host responses with status 200 are checked; third-party responses are skipped. It reads the content type and decoded size (`response.content`) and `Content-Encoding`. If no page's document can be matched, the rule is not decided.
## Evaluate
Fail when HTML of at least 1 KiB, or JavaScript or CSS of at least 10 KiB (decoded size), has no `br`, `gzip` or `zstd` `Content-Encoding`. Responses without a known type or size are skipped. Pass otherwise.
## Evidence
The HAR entry of each failing response (up to 10), with its size, `Content-Type` and `Content-Encoding`.
## Remediation
Check that the public edge and every customer CDN in front of Managed Runtime preserve its compression; do not add application-level compression on Managed Runtime. Escalate an MRT-owned miss to Salesforce. For a non-MRT origin, enable Brotli or gzip. Re-run Playhouse to confirm.
## Examples
Compliant: a 180 KiB bundle with `Content-Encoding: br`. Problematic: a 40 KiB stylesheet with no `Content-Encoding`.
