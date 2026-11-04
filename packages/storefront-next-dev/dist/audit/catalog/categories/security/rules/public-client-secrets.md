---
id: security/public-client-secrets
title: Secrets Exposed to the Browser
severity: critical
appliesTo: [project]
inputs: [source.code, project.config]
---

## Intent
Checks the configuration sent to the browser (`PUBLIC__` variables and other client-side config) for secret keys, while allowing values meant to be public, such as site ids and publishable keys. Every visitor can read anything in client config.
## Inspect
Inspect PUBLIC__ and client-exposed config for secret-shaped keys/values while recognizing intentionally public site and publishable keys.
## Evaluate
Finding requires a credential with secret capability exposed to the client.
## Evidence
Cite only key name and source location with value replaced by [redacted].
## Remediation
Move server-side and rotate the exposed credential.
## Examples
Compliant: referrer-restricted public site key. Problematic: client secret under PUBLIC__. Ambiguous: high-entropy non-secret identifier.
