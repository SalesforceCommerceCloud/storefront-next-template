---
id: security/hardcoded-credentials
title: Credentials in Source Code
severity: critical
appliesTo: [project]
inputs: [source.code]
---
## Intent
Searches the project's source for real credentials written into code or config, such as API keys, passwords, client secrets and private keys, ignoring test fixtures and examples. Anyone with access to the repository can read them.
## Inspect
Search high-confidence credential formats and assignments while excluding fixtures.
## Evaluate
Finding requires a real credential-like secret in shipping source.
## Evidence
Cite credential type and location only; replace value with [redacted].
## Remediation
Remove, rotate, and load from a server-side secret manager.
## Examples
Compliant: environment lookup. Problematic: private key literal. Ambiguous: documented placeholder.
