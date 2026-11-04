---
id: best-practices/route-revalidation
title: "Layout Loaders Don't Rerun Needlessly"
severity: medium
appliesTo: [home, plp, pdp]
inputs: [source.code]
---
## Intent
Checks that loaders for layouts that stay on screen across pages, such as the app shell, use `shouldRevalidate` so they don't fetch the same data again on every navigation. Rerunning an expensive layout loader slows down every page change.
## Inspect
Identify persistent layout loaders and inspect shouldRevalidate against their actual inputs.
## Evaluate
Finding requires repeated expensive work without a valid revalidation need.
## Evidence
Cite loader, mounted scope, calls, and revalidation behavior.
## Remediation
Gate revalidation to meaningful input changes.
## Examples
Compliant: scoped shouldRevalidate. Problematic: shell fan-out each navigation. Ambiguous: cheap loader.
