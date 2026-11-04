---
id: performance/dom-size
title: DOM Size (Number of Elements)
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.lighthouse, playhouse.scripts, source.code]
---

## Intent
Checks that each page has 1,400 HTML elements or fewer after it loads, the limit Lighthouse used to flag. Every element adds to the HTML download and to the browser's style, layout and hydration work, so pages with large DOMs render and respond more slowly. When a page is over the limit, the report points to the components that render markup the shopper doesn't need yet.
## Inspect
The rule script reads the element count and DOM depth from Lighthouse's DOM size insight (`dom-size-insight`) in each page's mobile cold-cache Lighthouse result. If every page has 1,400 elements or fewer, it passes and this rule needs no analysis.

Otherwise, use the `data` file and the Lighthouse result it names (`lighthouseArtifact`). The insight also names the deepest element and the element with the most children. Fetch the page (`curl -sL <url>`) to see which parts of the markup repeat most, then find the components in the project that render them.
## Evaluate
Report a `finding` for each page over 1,400 elements. Name the parts of the page that add the most elements and the components behind them. Typical causes: a mega menu that renders every category up front, every carousel slide or variant panel rendered while hidden, long lists without pagination, and deeply nested wrapper elements. Suggest rendering hidden or below-the-fold markup only when it's needed, as suggestions the customer can choose from.
## Evidence
The Lighthouse DOM size insight for each page over the limit (`playhouse`, with the element count as `value`), and `source` evidence for each component that renders the most markup.
## Remediation
Render menus, hidden panels and off-screen slides when they open, paginate long lists, and remove wrapper elements that add no styling. Re-run Playhouse to confirm each page has 1,400 elements or fewer.
## Examples
Compliant: a PLP with 720 elements. Problematic: a PLP with 1,620 elements because every product tile renders all of its color swatches.
