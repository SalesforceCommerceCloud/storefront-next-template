---
id: seo/structured-data
title: Structured Data (JSON-LD)
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code]
---
## Intent
Checks that any JSON-LD structured data on the pages, such as `Product` or `BreadcrumbList`, is valid, suits the page type and matches what the page shows, for example the same price and availability. Search engines use it for rich results. Pages without structured data pass.
## Inspect
Parse delivered JSON-LD and compare types/values with visible content and generation source.
## Evaluate
Use finding for invalid or materially misleading data; absence alone is a pass.
## Evidence
Cite page, JSON-LD path/value, validation issue, and source.
## Remediation
Emit valid schema.org data from trusted page data.
## Examples
Compliant: accurate Product data. Problematic: wrong availability. Ambiguous: no business requirement established.
