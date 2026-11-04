---
id: security/dynamic-code-execution
title: eval and new Function With Untrusted Input
severity: high
appliesTo: [project]
inputs: [source.code]
---
## Intent
Checks every use of `eval` and `new Function` for input an attacker could influence, such as URL parameters, CMS content or API responses. Running that input as code would let an attacker run their own JavaScript on the site.
## Inspect
Trace eval and Function constructor inputs across trust boundaries.
## Evaluate
Finding requires dynamic or untrusted input; constant tooling code may be not-applicable.
## Evidence
Cite source, transformations, and sink.
## Remediation
Replace string execution with data-driven logic.
## Examples
Compliant: no dynamic execution. Problematic: CMS value reaches eval. Ambiguous: compile-time constant unresolved.
