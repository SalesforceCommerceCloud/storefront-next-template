---
id: performance/font-display
title: Web Font Display Policy
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.summary, playhouse.trace, playhouse.network-har, source]
---

## Intent
Checks that web fonts do not hide text while they download. A blocking `font-display` policy can leave shoppers looking at invisible text, while `swap` and `optional` allow fallback text to render immediately.
## Inspect
The rule script reads the median mobile and desktop cold-cache runs from `summary.json`. In each run's trace it finds `BeginRemoteFontLoad` events and reads the font URL and display policy that Chrome used. It compares those URLs with downloaded font responses in the same run's HAR. Chrome does not emit this trace event for every preloaded font, so a downloaded font with no matching event is left undecided for source inspection rather than treated as a pass. For those candidates, inspect the matching `@font-face` declaration in project or fetched stylesheet CSS.
The layout-shift portion of the original rule specification is deferred until the audit captures a deterministic mapping between layout-shift events and the web font that caused them; this rule currently reports display policy only.
## Evaluate
Fail when Chrome reports `auto`, `block`, `fallback`, or any policy other than `swap` or `optional`. Pass only when every downloaded font in both measured cold-cache runs has a trace event and every event uses `swap` or `optional`. When a downloaded font has no matching event, the script leaves the rule undecided; source analysis fails a matching `@font-face` without `swap` or `optional`, passes it when the policy is present, and reports not verified when the declaration cannot be found. A missing trace or HAR also leaves the rule undecided.
## Evidence
For a deterministic failure, the trace event's font URL, display policy, form factor and run. For an undecided downloaded font, its HAR URL and the matching `@font-face` declaration when source analysis can find it.
## Remediation
Set `font-display: swap` for brand fonts that should replace fallback text as soon as they arrive, or `font-display: optional` when avoiding a late swap is more important than using the web font on the first visit. Add fallback metrics such as `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` when a font swap contributes to layout shift. Replace icon fonts with inline SVG or an SVG sprite so icons do not depend on a blocking font. Self-host third-party fonts when licensing permits; otherwise preload only critical faces and preconnect to the font origin. Apply the policy to every relevant `@font-face`, including preloaded faces, and re-run both mobile and desktop cold-cache captures.
## Examples
Compliant: `@font-face { font-family: Brand; src: url('/fonts/brand.woff2') format('woff2'); font-display: swap; }`. Problematic: a downloaded face whose trace reports `font-display: block`, or a preloaded face whose declaration omits `font-display`.
