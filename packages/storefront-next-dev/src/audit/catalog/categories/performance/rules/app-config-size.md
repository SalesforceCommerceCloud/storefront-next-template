---
id: performance/app-config-size
title: App Config Size
severity: low
appliesTo: [home, plp, pdp]
inputs: [playhouse.scripts, source.code]
---

## Intent
Checks that the app config Storefront Next writes into every page (`window.__APP_CONFIG__`) is 12 KiB or less. The config is repeated in each page's HTML, so settings the browser never reads add to every page load. When a page is over budget, the report points to the config sections the browser doesn't need.
## Inspect
The rule script measures the archived `window.__APP_CONFIG__` script in each page's HTML. If every page is within 12 KiB, it passes and this rule needs no analysis.

Otherwise, use the `data` file (sizes are in bytes): `appConfigSections` gives each top-level config section's size, largest first, and `scripts.appConfig` names the archived config script (relative to the page's `archiveDir`). Read the largest sections in that script, then check in the project where each large section is read (`getConfig`, `useConfig`, `window.__APP_CONFIG__`) and whether the browser needs it, or only server code does. Settings browser code reads at any point, including after hydration or on interaction, are needed. Also check whether the root loader returns the same config, which embeds it in the page data a second time.
## Evaluate
Report one `finding` for the rule when any page's config is over 12 KiB; when the config is the same on every page, cite it once and say so. Name the largest sections and, for each, whether the browser reads it, with an approximate size. Suggest keeping server-only settings out of the config sent to the browser, as suggestions the customer can choose from.
## Evidence
The archived config script (`playhouse`, with its size as `value`) and `source` evidence for where the large sections are defined and read.
## Remediation
Leave settings the browser never reads out of the config sent to the browser. Re-run Playhouse to confirm the config is at or under 12 KiB.
## Examples
Compliant: a 10 KiB config. Problematic: a 15 KiB config whose largest section is only read on the server.
