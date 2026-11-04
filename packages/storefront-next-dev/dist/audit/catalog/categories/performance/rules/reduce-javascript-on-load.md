---
id: performance/reduce-javascript-on-load
title: Reduce JavaScript on Load
severity: medium
appliesTo: [home, plp, pdp]
inputs: [project.build, source.code]
---

## Intent
Recommends changes to the storefront's code that make each page download, parse and run less JavaScript before it responds. Almost always that means loading code later: components and libraries the page bundles up front but needs only after an interaction, further down the page, or on another route. Occasionally code shouldn't reach the client at all. Every number comes from a local build of the project folder, not from the live site, which may run other code. `performance/javascript-size` reports what the live site downloads.
## Inspect
The rule script's data comes from `bundle/analysis.json`, which `prepare` writes after building the project folder: the plain build's chunks with their source maps (minified bytes per module), the module graph from the build's `BUNDLES_SIZE_ANALYZE` visualizer report, and the build's React Router manifest. A page is matched to the build by its routes only: the route ids its live HTML names (route ids are route file names, so they survive a rebuild), else the local route whose path matches its URL (`route.source` says which). Never compare the local build with the live site's files or sizes: they come from different builds. `liveDecodedBytes` is context, not something to reconcile.

For each page, `local` describes what its routes load up front in the local build: the entry, each route module and their static imports (`chunks`, `bytes`), and the imports and packages that could save at least `minSavedBytes` (30 KiB minified, about 10 KiB over the network). Anything smaller has already been left out, along with packages the app's start needs (React, React Router):

- `candidates`: static imports in project code (`importer` with file, line and the import statement as `excerpt`; the imported `target` and its `package`), each with the minified bytes (`savedBytes`) and modules the page would no longer load up front if that one import became lazy. An import inside a larger candidate is listed only when it saves noticeably less. `lazyElsewhere` names project files that already load the target with `import()`: this static import defeats that split.
- `packages`: npm packages and project folders in the page's up-front code: `bytes`, `modules`, `largestModules` (what of it the page pulls in), `versions` when more than one installed version is bundled, the project files that import an npm package statically (`importers`, the first 8 of `importerCount`) and the bytes freed if all of them became lazy (`deferrableBytes`; 0 means something the app needs to start also imports it).

The numbers are exact for the local build; don't recompute them. The audited project is read-only: read and `grep` its source, never build or change it. `<run>/bundle/client-bundle-size.html` is the visualizer report for people; you don't need it.

**Spend your effort only where the bytes are.** The recommendations worth making move 100 KiB or more off a page: a large library or component tree that loads up front but is needed only after a tap, further down the page, or on another route. Sort every page's candidates and packages by `savedBytes` (or `deferrableBytes`) and work down from the top; stop once the remaining ones are close to `minSavedBytes`. There is no quota: recommend only changes you traced and would make yourself, and if the page genuinely needs what it loads up front, recommend nothing. A well-optimized build has no recommendations, and that is a good result, not a gap to fill. One 150 KiB recommendation is worth more than ten 30 KiB ones. Code under `root` or `routes/_app` loads on every page, so one change helps them all. For each one worth a look:

1. **Find what it's used for.** Open the importer at its line and follow the imported component, hook or function to every place it renders or runs. For a package, `grep -rn "from '<name>" src` finds every import, not just the first 8. Read enough to know when the code actually runs.
2. **Decide when the page first needs it**, and pick the trigger:
   - Rendered on the first render, in view without scrolling, or needed to make the visible page interactive (the header, the visible navigation bar, the product gallery's first image, the add-to-cart button): the page needs it now. Leave that code up front. Never defer the LCP element or anything above the fold.
   - Rendered only after a tap, click, hover or focus (dialogs, drawers, the cart and search overlays, mega-menu panels, popovers, unselected tabs, closed accordions, toasts, a lightbox or zoom, a video before play, share menus, store-locator maps, chat): `interaction`.
   - Part of the target renders up front and part only later (a navigation bar whose flyout panels open on hover or whose mobile drawer opens on tap, a gallery whose zoom viewer opens on tap): don't dismiss it because of the visible part. Recommend moving the later part into its own module and loading that lazily (`lazy-component` on the candidate's `target`, with its trigger), and say in `how` what stays up front. Do this only when the later part is a large share of the target.
   - Below the fold and not needed for search or the LCP (recommendation carousels, recently viewed items, social feeds): `visible`, mounted when it nears the viewport. Content that matters for SEO (product details, reviews that are indexed) must stay server-rendered: don't recommend moving it to the client.
   - Used only by other routes, but imported from a shared module (`root.tsx`, `_app.tsx`, a provider, a barrel `index.ts`, a `utils` file): `navigation`. Move the import into the route that uses it, and React Router loads it with that route's chunk.
   - Needed after load but by nothing the shopper sees first (analytics, monitoring, experiment SDKs, prefetchers): `idle`, imported after the load event or in `requestIdleCallback`.
   - Run only on the server (loaders, actions, SDK clients, server config) but reaching the client through a shared module: `remove` it from the client bundle by moving it into a `.server.ts` module or the loader.
3. **Only when the code is needed up front, look for a narrower fix.** Most opportunities are step 2: the library stays, it just loads later. The changes below are exceptions; recommend one only on specific evidence you found in the source, never as a general preference for fewer dependencies, and never as an alternative to a lazy load that works:
   - `narrower-import`: `largestModules` shows parts of a package the project never imports, because it imports a barrel or the package's root entry (`lodash` rather than `lodash/debounce`, a meta-package rather than `@radix-ui/react-x`). Name the entry point to import instead.
   - `remove`: a second installed version of the same package (`versions`; align the ranges or add a `pnpm.overrides` entry), a polyfill for something every supported browser has, dev-only code (devtools, mocks), or an import kept only for a side effect nothing uses.
   - `replace`: rare. Only when the project uses one or two small functions of a large library that must load up front, and a platform API does the same thing exactly (for example one `Intl.DateTimeFormat` call instead of a date library imported for one format). Replacing a library costs the team time and risk, so don't recommend rewriting a library's functionality in project code, and never for security- or correctness-critical code (sanitizing, cryptography, time zones, payments).
4. **Make sure it works with server rendering.** A `React.lazy` component that renders on the server still downloads during hydration, right after load, so it saves nothing up front. A lazy component saves bytes only when it isn't rendered until the trigger: behind the `open` state, after the tab is selected, or once it's visible. Give it a fallback the same size as the content so the layout doesn't shift. Preload on intent (`onPointerEnter` or `onFocus` calling the same `import()`) so the first open still feels instant. Never defer `entry.client`, React, React Router, providers the first render needs, or styles the first paint needs.
5. **Check the saving is real.** A candidate's `savedBytes` already excludes code something else still imports. For a package-wide change use `deferrableBytes`. `bytes` is only an upper bound for narrowing, replacing or removing. Don't recommend a change you couldn't trace to its use in the source.
## Evaluate
The customer decides which recommendations to apply; they are options, not defects.

- `finding`: at least one change you traced makes a page load `minSavedBytes` or more less up front. Severity `medium` when a recommendation saves 100 KiB or more on a page, `low` otherwise.
- `pass`: you checked the largest candidates and packages, and the page needs them up front or uses them well. Cite the ones you checked and leave out `recommendations`. Prefer a pass to a weak or speculative recommendation.

Judge only from the local build and the source; the live site's sizes are reported by `performance/javascript-size`.
## Evidence
Cite each recommendation's main import as `source` evidence (file, line, and the import statement as `excerpt`). Add one `manual` evidence entry per page with recommendations, saying the figures come from the local build (for example `Local build of the project folder: home loads 61 chunks, 1,097 KiB up front`).

Also add a `recommendations` field to the output file: the changes you recommend, best first (at most 30), each saving at least `minSavedBytes` on a page; `finalize` rejects smaller ones. Expect most of them to be `lazy-component` or `dynamic-import`; a list made mostly of `replace` changes means you skipped step 2. The dashboard shows them as AI recommendations. `finalize` adds each one's savings per page from `bundle/analysis.json`, so don't include sizes:

```json
"recommendations": [
  { "pages": ["home", "plp", "pdp"], "change": "lazy-component", "trigger": "interaction",
    "target": "src/components/navigation-menu-mega/index.tsx",
    "title": "Load the mega menu's panels when a top-level category is first hovered or focused",
    "how": "The panels render only while a category is open (navigation-menu-mega/index.tsx:88). Keep the top-level bar static, move the panel into its own module and render it with React.lazy inside Suspense once `openCategory` is set; call the same import() from onPointerEnter and onFocus so it's ready before the first open.",
    "files": [{ "file": "src/routes/_app.tsx", "line": 28 }, { "file": "src/components/navigation-menu-mega/index.tsx", "line": 88 }] },
  { "pages": ["pdp"], "change": "dynamic-import", "trigger": "interaction",
    "target": "zod",
    "title": "Load the review form's validation when the form is submitted",
    "how": "zod is used only by the write-a-review form, which is closed on load (review-form.tsx:5). Import the schema module with `await import('./review-schema')` in the submit handler instead of at the top of the file, so the PDP no longer loads zod up front.",
    "files": [{ "file": "src/components/reviews/review-form.tsx", "line": 5 }] }
]
```

- `pages`: every page whose `local` data lists `target` and that the change helps.
- `target`: exactly a candidate's `target` or a package's `name` from those pages' data. Recommend each piece of code once: not both a candidate and the package it belongs to.
- `change`: `lazy-component` (a component, rendered with `React.lazy` once the trigger happens), `dynamic-import` (a function, library or data file, loaded with `await import()` where it's first used), `narrower-import`, `replace` or `remove`.
- `trigger`: `interaction`, `visible`, `navigation` or `idle`, only for `lazy-component` and `dynamic-import`.
- `title`: one line naming the change and when the code loads. `how`: what to change, in which file, and what keeps the page working, concretely enough to start on (a few sentences). `files`: where to make it, with lines.
## Remediation
Make each change in the files the recommendation names, then rebuild with `BUNDLES_SIZE_ANALYZE=true` and open `build/client-bundle-size.html` to confirm the code moved out of the page's up-front chunks. Defer a component by rendering it only once it's needed: `const CartDrawer = lazy(() => import('./cart-drawer'))`, then `{open && <Suspense fallback={<DrawerSkeleton />}><CartDrawer /></Suspense>}`. Defer a library to where it's used: `const { z } = await import('zod')` in the submit handler. Move route-specific imports out of `root.tsx`, `_app.tsx` and shared barrels into the routes that use them. Re-run the audit to see each page's local up-front JavaScript go down.
## Examples
Compliant: the cart drawer's contents load with `React.lazy` the first time it opens, and the review form loads its validation library on submit. Problematic: `src/routes/_app.tsx:28` imports the mega menu statically, so every page loads 41 KiB of menu panels that render only after a hover, even though `src/lib/page-designer/static-registry.ts` already imports the same component lazily.
