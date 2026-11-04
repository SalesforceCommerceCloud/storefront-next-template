---
id: best-practices/production-integrations
title: No Mock or Demo Integrations
severity: critical
appliesTo: [cart, checkout, account]
inputs: [source.code, manual.end-to-end]
---

## Intent
Checks that cart, checkout, payment, order management, tax and loyalty flows call real systems, not mock, demo or TODO code left over from development. A stubbed integration in these flows can lose orders or revenue at launch.
## Inspect
Trace cart, checkout, payment, OMS, tax, and loyalty flows for demo/mock/TODO paths and validate opaque systems end to end.
## Evaluate
Use finding for demonstrated stub behavior; use `not-verified` for opaque integrations lacking test evidence.
## Evidence
Cite executable source path or end-to-end result, never a comment marker alone.
## Remediation
Wire the production integration or disable the feature until verified.
## Examples
Compliant: real integration plus successful E2E evidence. Problematic: mock success on place-order. Ambiguous: TODO comment beside complete code.
