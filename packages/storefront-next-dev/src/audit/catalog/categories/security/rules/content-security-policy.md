---
id: security/content-security-policy
title: Content Security Policy (CSP)
severity: high
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har]
---

## Intent
Checks that each page's HTML response sends an enforced `Content-Security-Policy` header (report-only isn't enough) that restricts where scripts can come from, doesn't allow `'unsafe-eval'`, and sets `frame-ancestors` and `form-action`. A CSP limits what an injected script can do.
## Inspect
The rule script matches the final document response in `network-mobile-cold.har` (via `network-mobile-cold.json`) for each page. It parses `Content-Security-Policy` (every enforced policy) and notes `Content-Security-Policy-Report-Only`. If no page's document can be matched, the rule is not decided.
## Evaluate
Fail when there is no enforcing CSP (report-only alone fails); any directive allows `'unsafe-eval'`; no policy restricts scripts (`script-src`, or `default-src` when `script-src` is absent, is missing or contains `*`); or `frame-ancestors` or `form-action` is missing. `'wasm-unsafe-eval'` is not `'unsafe-eval'`. Pass otherwise.
## Evidence
The HAR entry of each failing document, with the reasons and the CSP header values.
## Remediation
Start from the Storefront Next CSP defaults, keep nonce/hash-based script protection, and extend only the directives audited integrations need. Remove `'unsafe-eval'`, add `frame-ancestors` and `form-action`, and use report-only only as a temporary rollout step before enforcing. Re-run Playhouse and confirm the header on the final document response.
## Examples
Compliant: `script-src 'self' 'strict-dynamic' 'nonce-…'; frame-ancestors 'self'; form-action 'self'`. Problematic: only `Content-Security-Policy-Report-Only`, or `script-src * 'unsafe-eval'`.
