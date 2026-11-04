---
id: best-practices/error-boundaries
title: Route Error Pages
severity: medium
appliesTo: [route]
inputs: [source.code, manual.failure-state]
---
## Intent
Checks that when a route's loader, action or rendering fails, shoppers see a clear error page with the right HTTP status and a way to continue, and that the error is logged. Without this, a failure shows a blank or misleading page.
## Inspect
Trace representative route failures to their route-level error handling and inspect the user-visible status, recovery action, and logging boundary.
## Evaluate
Report missing or misleading handling for a demonstrated production failure path; do not require a particular framework abstraction by name.
## Evidence
Cite the failure path, route source, response/status behavior, and visible fallback.
## Remediation
Add scoped error handling that preserves status semantics, safe messaging, recovery, and server-side diagnostics.
## Examples
Compliant: failed product load renders a scoped retry state with correct status. Problematic: uncaught failure renders blank content. Ambiguous: global platform handling not observable.
