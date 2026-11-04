---
id: security/csp-runtime-compatibility
title: Site Features Blocked by the CSP
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.diagnostics, playhouse.network-har, playhouse.document, source.code]
---

## Intent
Checks what the Content Security Policy blocked while the pages loaded, from the browser console and DevTools issues, and whether any of it is something the storefront needs: its own scripts, checkout or account features, or an approved integration. Blocked probes, browser extensions and one-off messages are ignored.
## Inspect
For every representative Playhouse cell, inspect diagnostics `sourceStatus`, normalized `contentSecurityPolicyIssue` counts (from CDP `ContentSecurityPolicyIssue`) and `contentSecurityPolicyViolationType:*` reason codes, CSP-related warning/error entries, and network failures with a CSP blocked reason. Correlate sanitized hosts, resource types, and source locations to first-party code or an owned integration, then confirm the relevant deployed directive in the HAR and its source configuration. Identify whether the update belongs in Storefront Next CSP configuration, a tag manager/container, customer edge configuration, or vendor code.

## Evaluate
Create a finding only when repeated evidence shows CSP blocks a required first-party resource, checkout/account behavior, or an approved integration. Probes, malicious attempts, browser extensions, and isolated unexplained messages don't fail the rule. A blocked optional tracker that needs ownership review is a `low` finding that must name the affected integration or host, resource type, likely owner surface, and safe next action. Report-only violations are rollout evidence, not proof of enforcement. Use `not-verified` only when diagnostics sources are missing or invalid.

## Evidence
Cite page, form factor, cache state, diagnostics source status, issue type/count, stable reason codes, sanitized blocked host/path, resource type, likely integration owner, and relevant configuration or source location. Quote only the minimum sanitized console fragment needed; console text can contain arbitrary customer or application data.

## Remediation
State where the change belongs. For an approved blocked resource, prefer the exact HTTPS origin in the narrow resource directive over broadening policy globally. For tag-manager integrations, identify the container/tag owner and update or remove the owning tag before changing application CSP; if ownership is unresolved, keep it a `low` finding that asks for that decision rather than proposing an allowlist. For code that requires `eval`, remove, replace, or obtain a CSP-compatible vendor implementation; never recommend `unsafe-eval` as the shortcut. Repeat the affected journey and confirm required functionality works without introducing a high-risk CSP exception.

## Examples
Compliant: diagnostics were captured and required storefront resources have no CSP failures; no change is required. Problematic: every PDP capture blocks a required first-party product script; cite the source/configuration owner and narrow directive. Ambiguous: an image analytics pixel is blocked; record the exact host and `Image` resource type, ask the tag owner whether it is required, then either remove the tag or allow that origin only in `img-src`. A vendor script attempts `eval`; recommend removing or replacing that integration, never enabling `unsafe-eval`.
