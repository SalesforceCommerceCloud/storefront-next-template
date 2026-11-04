---
id: seo/canonical-url
title: Canonical URL
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, source.code]
---

## Intent
Checks that each page declares a canonical URL (`<link rel="canonical">`) pointing to its own clean URL, and that variants such as query strings, locales and filtered category pages point to the right one. Search engines use it to merge duplicate URLs into one result.
## Inspect
Compare each delivered canonical with the final URL and inspect handling of query, locale, PLP, and PDP variants.
## Evaluate
Finding requires missing, malformed, cross-page, or incorrect canonical output on a captured page.
## Evidence
Cite page URL, delivered canonical value, and generation source.
## Remediation
Emit one absolute self-consistent canonical for the clean page URL.
## Examples
Compliant: PDP canonical drops tracking parameters. Problematic: every page canonicalizes to home. Ambiguous: helper exists but output was not captured.
