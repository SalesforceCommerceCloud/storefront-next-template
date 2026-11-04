---
id: security/dependency-vulnerabilities
title: Known Vulnerabilities in Dependencies
severity: high
appliesTo: [project]
inputs: [source.manifests, dependency.advisories]
---
## Intent
Checks the production npm dependencies against a current security advisory scan from the package manager, and reports advisories that affect a version the storefront ships and code it actually uses. Without a current scan, the rule is left for manual review.
## Inspect
Identify the production dependency graph and obtain a current advisory scan from the ecosystem package manager or approved scanner; do not infer safety from lockfile text alone.
## Evaluate
Report a finding only when a current advisory maps to a shipped version and reachable production use, or use `not-verified` when no current scan is available.
## Evidence
Cite package, installed version, advisory identifier, scanner timestamp, dependency path, and reachability assessment; never include registry credentials.
## Remediation
Upgrade, replace, remove, or document a time-bound mitigation, then rerun the same scanner.
## Examples
Compliant: current scan with no applicable production advisories. Problematic: reachable critical advisory. Ambiguous: stale scan or development-only dependency.
