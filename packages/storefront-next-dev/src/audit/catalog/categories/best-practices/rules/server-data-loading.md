---
id: best-practices/server-data-loading
title: First-Render Data Loads on the Server
severity: high
appliesTo: [home, plp, pdp]
inputs: [source.code]
---
## Intent
Checks that the data a page needs for its first render is loaded in server loaders, not fetched in the browser after hydration (with `clientLoader` or a `useEffect` fetch). Loading it on the server sends shoppers and search engines complete HTML without waiting for JavaScript.
## Inspect
Trace clientLoader, clientAction, useEffect fetches, and route loader ownership.
## Evaluate
Finding requires first-render data being unnecessarily delayed until hydration.
## Evidence
Cite route, data need, client call, and available server path.
## Remediation
Move required initial data to a server loader/action.
## Examples
Compliant: loader-fed render. Problematic: PDP fetch starts after hydration. Ambiguous: post-interaction effect fetch.
