---
id: best-practices/deferred-ui
title: Hidden Server-Rendered UI
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.main-document, playhouse.network-har, source.code]
---
## Intent
Finds one specific deferred-UI opportunity: pages that server-render large regions hidden at a target viewport even though shoppers may never reveal them. CSS hiding can avoid layout and paint for a subtree, but it does not avoid transferring and parsing its HTML, constructing its DOM, hydrating it, or starting work requested by the hidden components.
## Inspect
The rule script measures the archived server HTML for the median mobile and desktop cold-cache runs. It counts every body element hidden by an ancestor or by the `hidden` attribute, inline `display:none`, base Tailwind `hidden` at 360 px, or breakpoint `hidden` at 1728 px. React streaming containers such as `<div hidden id="S:1">` are not hidden UI. A cell is a candidate only when at least 100 elements and at least 20% of body elements are hidden. For a candidate, inspect the listed largest hidden roots and trace them to current source. Do not count header navigation/search responsive pairs or ordinary carousel slides. Check the matching HAR when a hidden duplicate may start requests during load. Visible below-the-fold UI, such as a product-recommendation carousel, is outside this check because server HTML alone cannot establish its viewport position or whether delaying it preserves UX and SEO; evaluate that separately from source plus viewport/runtime evidence.
## Evaluate
Pass this hidden-markup check when every measured mobile and desktop cell is below the candidate gate. This pass does not claim that the page has no other client-rendering or below-the-fold deferral opportunities. For a candidate, report a finding only when current source attributes at least 100 hidden elements to other UI—such as duplicated mobile and desktop content—or when a hidden duplicate starts requests during initial load. Report `not-verified` when the source is missing or stale, attribution does not reach 100 elements, or required capture evidence is missing. A candidate is not a finding by itself.
## Evidence
Cite the page, cell, archived HTML artifact, hidden count and share, the largest hidden-root selector, and the source file and line that renders the region. For load-time work, also cite the HAR request and the source connection between that request and the hidden region.
## Remediation
Render interaction-only content when it opens, or render one responsive structure and adapt its layout with CSS instead of emitting separate mobile and desktop copies. Keep server-rendered navigation links crawlable. Avoid starting image or data requests for hidden duplicate regions. Re-run both mobile and desktop captures to confirm the hidden markup falls below the gate.
## Examples
Compliant for this check: one product gallery changes layout responsively without duplicate markup. Problematic: the HTML contains separate mobile and desktop galleries totaling 120 hidden elements. Ambiguous: 130 hidden elements are detected, but the available source cannot identify whether they belong to an allowed navigation pair. Out of scope: a visible product-recommendation carousel far below the fold may still be worth client-rendering later, but that decision needs viewport/runtime and source evidence rather than hidden-markup counts.

