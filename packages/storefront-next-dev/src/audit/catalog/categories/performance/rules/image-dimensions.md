---
id: performance/image-dimensions
title: Image Dimensions
severity: medium
appliesTo: [home, plp, pdp]
inputs: [playhouse.lighthouse, source.code]
---

## Intent
Checks that images without `width` and `height` don't shift the page's layout as they load. A browser can only reserve space for an image when it knows its size, from its attributes or from CSS such as a fixed height or `aspect-ratio`. An image without attributes is fine when its CSS or container already reserves the space, so only images that actually shift the layout are reported.
## Inspect
The rule script reads Lighthouse's layout shift culprits insight (`cls-culprits-insight`) from each page's mobile cold-cache median run. Lighthouse links a shift to unsized images by timing, not position, so it can name the wrong image or none: the script marks a named culprit `plausible: false` when it starts below the shifted element's top (an image can only move content below or beside it), and `unsizedShift` is the worst cluster's shift that a plausible or unnamed image could have caused. `unsizedImages` lists every image Lighthouse found without dimensions, with its position. The script passes when no page's `unsizedShift` reaches `minShift`.

Otherwise, for each page with a shift of at least `minShift`, find the candidates: plausible culprits, and unsized images above or beside the shifted element (`top` at most the element's `top`). Images inside a shifted container don't move it. In the project source, find the component that renders each one and check whether its size is fixed before it loads: `width` and `height` attributes, a CSS height and width (a fixed height alone still lets the width change), `aspect-ratio`, or a wrapper with a fixed size or aspect ratio. A candidate whose size is fixed can't cause the shift.
## Evaluate
Fail when a candidate's size isn't fixed before it loads and it can move the shifted element; medium severity when the page's CLS is over 0.1, low when it's within. Pass when there is no candidate or every candidate's size is fixed, and say the shift comes from something other than an image (for example a web font or content inserted after load), naming the shifted element. Undecided only when no page could be measured.
## Evidence
The layout shift culprits insight for each page with a shift, with the shift score and the shifted element as its `value`, and the source file and line of each image that can cause it.
## Remediation
Give the image `width` and `height` attributes (`DynamicImage` passes them through), or fix its size or its container's `aspect-ratio` in CSS. Re-run Playhouse to confirm the shift is gone.
## Examples
Compliant: product tiles whose image wrapper has `aspect-ratio: 1`; a logo with a fixed CSS height and width. Problematic: a banner image with only `w-full` and no dimensions above the product grid, so the grid moves down when it loads.
