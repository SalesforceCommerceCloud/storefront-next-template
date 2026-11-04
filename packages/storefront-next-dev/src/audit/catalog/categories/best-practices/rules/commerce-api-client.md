---
id: best-practices/commerce-api-client
title: Commerce API Calls Use the SDK Clients
severity: high
appliesTo: [home, plp, pdp]
inputs: [source.code]
---

## Intent
Checks that calls to the Commerce APIs (SCAPI and OCAPI) go through the Storefront Next SDK clients instead of hand-built `fetch` requests. The SDK clients handle authentication, token refresh, routing and request correlation, which hand-built calls tend to get wrong.
## Inspect
Trace raw fetches and SCAPI/OCAPI URLs through authentication, routing, token refresh, and correlation handling; exclude generated clients.
## Evaluate
Finding requires a hand-built commerce call that bypasses the supported client, not a URL text match alone.
## Evidence
Cite call site and the data/auth path it bypasses.
## Remediation
Route the operation through the supported request-scoped SDK client.
## Examples
Compliant: createApiClients call in a server loader. Problematic: direct fetch to a commerce endpoint. Ambiguous: URL in documentation.
