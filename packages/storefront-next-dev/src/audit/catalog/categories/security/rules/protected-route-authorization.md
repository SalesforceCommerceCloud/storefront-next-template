---
id: security/protected-route-authorization
title: Server-Side Access Checks for Shopper Data
severity: critical
appliesTo: [account, checkout]
inputs: [source.code, manual.authorization]
---
## Intent
Checks that the loaders and actions behind account, order, profile and checkout pages verify on the server that the shopper is signed in and allowed to see that specific record. Hiding a page in the UI isn't protection: without a server check, anyone can request another shopper's data directly.
## Inspect
Trace account, order, profile, and checkout loaders/actions through session and object authorization.
## Evaluate
Finding requires missing or bypassable server enforcement; UI guards do not count.
## Evidence
Cite route, server handler, authorization path, and reproduction where safe.
## Remediation
Enforce authentication and object-level authorization before data access.
## Examples
Compliant: loader rejects unauthorized user. Problematic: direct loader exposes orders. Ambiguous: custom guard body unavailable.
