---
id: security/strict-transport-security
title: HTTPS-Only Header (HSTS)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har, playhouse.document, source.code]
---

## Intent
Checks that each page's HTML response sends `Strict-Transport-Security` with a `max-age` of at least 180 days (15552000 seconds) and `includeSubDomains`. The header tells browsers to always use HTTPS for the site, so an attacker can't intercept a first plain-HTTP request.
## Inspect
Match the final HTTPS document response in a representative sanitized HAR and inspect `Strict-Transport-Security`. Inspect edge or Storefront Next configuration only to explain the deployed value.

## Evaluate
Create a finding when HSTS is missing, `max-age` is invalid or below 15552000 seconds, or `includeSubDomains` is absent from the expected production baseline. Do not evaluate localhost or plain-HTTP development URLs. Use `not-verified` when the final HTTPS document cannot be matched.

## Evidence
Cite page, sanitized final URL, HTTPS status, and the HSTS directives needed for the conclusion. Do not cite unrelated headers or unredacted URL parameters.

## Remediation
Restore the Storefront Next or public-edge HSTS baseline and verify the deployed response. Confirm organizational ownership before adding `preload`.

## Examples
Compliant: `max-age=15552000; includeSubDomains`. Problematic: HSTS is absent on production HTTPS. Ambiguous: the audit target is localhost; mark not applicable rather than passing it.
