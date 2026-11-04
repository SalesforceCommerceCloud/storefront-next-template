---
id: seo/meta-description
title: Meta Description
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code]
---
## Intent
Checks that each page has a `<meta name="description">` that is specific to that page, not missing or copied across pages. Search engines often show it as the text under the result.
## Inspect
Compare delivered descriptions across captured pages and source generation.
## Evaluate
Finding requires missing, duplicate, or unsuitable delivered content.
## Evidence
Cite page, delivered value, and source.
## Remediation
Generate concise page-specific descriptions.
## Examples
Compliant: PDP description reflects product. Problematic: absent description. Ambiguous: helper exists only.
