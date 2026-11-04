# Evaluating a site audit rule

The contract for evaluating one AI-analyzed rule from a `sfnext audit prepare` run. `<run>` is the run folder holding `prepared.json`.

For each rule id, find its entry in `<run>/prepared.json` `rules`, then read:

- the rule `file` and its category's `CATEGORY.md` (`../CATEGORY.md` from the rule file), and follow the rule's `Intent`, `Inspect`, `Evaluate`, `Evidence` and `Remediation` sections;
- the entry's `data` file, if it has one (compact script output; start there);
- only the evidence the rule's `inputs` point to, using the table below. `pages` in `prepared.json` maps each page label to its URL and Playhouse `archiveDir` (relative to the run folder).

Don't read other rules, other `results/` files, earlier audit workspaces or the audit tool's source. The audited project is read-only.

| input | where to look |
|---|---|
| `playhouse.main-document` | `curl -sL <page url>` (the archive keeps document metadata, not the HTML); cite what you saw as `manual` evidence |
| `playhouse.document` | `<archiveDir>/runs/mobile-cold-1/document.json` (status and response headers; any `runs/<cell>-<n>/` works) |
| `playhouse.network-har` | `<archiveDir>/network-mobile-cold.har` (standard HAR, a few MB; use `jq`). Rules that name a `harArtifact` in their data use that run's `runs/<run id>/network.har`, whose query values are redacted; cite the artifact the data names. |
| `playhouse.summary`, `playhouse.summary-*` | `<archiveDir>/summary*.json` |
| `playhouse.opportunities` | `<archiveDir>/opportunities.json` |
| `playhouse.diagnostics` | `<archiveDir>/diagnostics-mobile-cold.json` |
| `playhouse.scripts` | `<archiveDir>/scripts/index.json` lists every script each run loaded; inline scripts have the page URL as `url`, and their text is `<archiveDir>/scripts/<body.sha256>.js` |
| `playhouse.lighthouse` | `<archiveDir>/runs/mobile-cold-1/lhr.json` (the full Lighthouse result; use `jq` on `.audits["<audit id>"]`) |
| `source.*`, `project.config`, `deployment.config` | the project repo (`grep`, read files) |
| `manual.*`, `dependency.advisories` | not collected by the audit; decide from the rule's other inputs, or use `not-verified` when nothing else can settle it |

Write one file per rule at the entry's `output` path:

```json
{ "ruleId": "seo/meta-description", "disposition": "finding", "severity": "low",
  "summary": "The PDP has no meta description.", "remediation": "Render a product-specific description in the PDP route meta.",
  "evidence": [{ "type": "source", "file": "src/routes/_app.product.$id.tsx", "line": 42 }] }
```

- `disposition`: reach a conclusion. Use `finding` when you can point to a concrete problem; when you are unsure how much it matters, lower the severity rather than holding back the finding. Use `pass` when you checked what the rule asks and it is met, and cite what you checked: a pass needs evidence just like a finding. Use `not-applicable` when the rule doesn't apply to this project (e.g. locale alternates on a single-locale site). Use `not-verified` only when the evidence the rule needs can't be collected at all (e.g. a real checkout); its `summary` must say what would verify it. Not-verified rules are listed for manual review and don't affect the launch guidance. A rule without a file is reported as `not-verified`.
- Give every `finding` a `severity` (`critical`, `high`, `medium`, `low` or `info`), normally the rule's frontmatter `severity`. That severity is a ceiling: you may lower it when the impact is smaller, but a higher or missing value is reported at the rule's severity. `remediation` is optional.
- Evidence types, one example each:
  - `{ "type": "source", "file": "src/root.tsx", "line": 12, "excerpt": "…" }`, where `file` is project-relative;
  - `{ "type": "playhouse", "page": "home", "artifact": "network-mobile-cold.har", "pointer": "/log/entries/3/response/headers", "value": "…" }`, where `artifact` is a path relative to that page's `archiveDir` (`diagnostics-mobile-cold.json`, not `playhouse/runs/…/diagnostics-mobile-cold.json`; never `main-document`) and `pointer` is an optional JSON pointer;
  - `{ "type": "manual", "description": "Checkout was not exercised.", "location": "pdp" }`, also used for a `curl` result: `{ "type": "manual", "description": "curl -sL https://example.com/: <link rel=\"canonical\" href=\"https://example.com/\"/>", "location": "home" }`.
- Cite each fact once per page, from the mobile cold-cache artifact when the rule doesn't name one; don't repeat it for every form factor and cache state. Make a Playhouse `value` readable on its own (e.g. `max-age=15552000; includeSubDomains`); the dashboard shows the page, the artifact and that value, not the pointer.
- Some rules ask for an extra output field in their `Evidence` section (for example `waterfall` or `recommendations`); include it exactly as described there.
- Never include secrets, cookies, authorization headers or response bodies.
