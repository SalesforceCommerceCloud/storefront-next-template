---
id: security/browser-hardening-headers
title: Basic Security Headers
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.network-har]
---

## Intent
Checks that each page's HTML response sends four standard security headers: `X-Content-Type-Options: nosniff`, so browsers don't run a file as a different type than declared; CSP `frame-ancestors` or `X-Frame-Options`, so other sites can't show the page in a hidden frame and trick clicks (clickjacking); a `Referrer-Policy` that doesn't send full page URLs to other sites; and a `Permissions-Policy` that limits browser features such as the camera or location.
## Inspect
The rule script matches the final document response in `network-mobile-cold.har` (via `network-mobile-cold.json`) for each page. It reads `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and CSP `frame-ancestors`. If no page's document can be matched, the rule is not decided.
## Evaluate
Fail when `X-Content-Type-Options` is not `nosniff`; neither CSP `frame-ancestors` nor `X-Frame-Options` is set; `Referrer-Policy` is missing or its effective (last) value is not `no-referrer`, `same-origin`, `strict-origin` or `strict-origin-when-cross-origin`; or `Permissions-Policy` is missing. Pass otherwise.
## Evidence
The HAR entry of each failing document, with the reasons and the four header values.
## Remediation
Restore the Storefront Next security-header defaults at the response owner or public edge (Managed Runtime, CDN or application), keeping only documented integration-specific exceptions, then re-run Playhouse and confirm the headers on the final document response.
## Examples
Compliant: `nosniff`, `strict-origin-when-cross-origin`, CSP `frame-ancestors 'self'` and a `Permissions-Policy`. Problematic: no `frame-ancestors` and no `X-Frame-Options`.
