---
id: seo/page-title
title: Page Title
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code]
---
## Intent
Checks that each page has a `<title>` that is unique and describes that page. The title is the main text of a search result and the label of the browser tab.
## Inspect
Compare delivered titles across pages and trace route metadata.
## Evaluate
Finding requires missing, duplicate, or misleading delivered title.
## Evidence
Cite page, title value, comparison, and source.
## Remediation
Emit page-specific route metadata.
## Examples
Compliant: product-specific PDP title. Problematic: all pages share Home. Ambiguous: title helper only.
