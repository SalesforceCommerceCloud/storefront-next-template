---
id: seo/robots-indexing
title: Search Engines Can Index the Site
severity: critical
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code, deployment.config]
---

## Intent
Checks the production site for anything that tells search engines not to index it: `noindex` in a robots meta tag or `X-Robots-Tag` header, `Disallow` rules in `robots.txt`, or environment settings that turn these on. A leftover staging setting can remove the whole store from search results; blocking a staging site is fine.
## Inspect
Inspect delivered robots metadata, robots.txt, response headers, and environment gating for noindex/disallow controls.
## Evaluate
Finding requires production-target evidence of unintended blocking; staging noindex can be not-applicable.
## Evidence
Cite deployed URL, directive/header/file, and environment evidence.
## Remediation
Remove or correctly environment-gate the blocking directive and verify the deployed response.
## Examples
Compliant: staging-only noindex. Problematic: production home emits noindex. Ambiguous: ungated-looking source without deployment context.
