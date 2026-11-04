---
id: seo/locale-alternates
title: Language and Region Links (hreflang)
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code]
---
## Intent
For sites with more than one locale, checks that each page links to its other-language versions with `hreflang` tags and that those versions link back. Search engines use these links to show shoppers the page in their language. Single-locale sites don't need them.
## Inspect
Determine locale scope, then verify reciprocal delivered hreflang URLs.
## Evaluate
Use not-applicable for single-locale sites; finding requires broken multi-locale output.
## Evidence
Cite locale config and delivered alternate pairs.
## Remediation
Emit reciprocal valid locale alternates.
## Examples
Compliant: reciprocal en/fr URLs. Problematic: hreflang points to 404. Ambiguous: locale scope unknown.
