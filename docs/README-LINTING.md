# Linting & Formatting (OxLint + Biome)

This project lints with [OxLint](https://oxc.rs/docs/guide/usage/linter.html) and formats with [Biome](https://biomejs.dev/). ESLint and Prettier were removed — OxLint owns **all** linting (standard rules, custom JS-plugin rules, and type-aware rules); Biome owns **only** formatting.

## The single entry point

`pnpm lint` is the one command CI calls; it runs both the linter and the formatter check:

```bash
pnpm lint       # oxlint (+ type-aware) then `biome format` check — fails on any lint warning OR unformatted file
pnpm lint:fix   # oxlint --fix then `biome format --write` — auto-fix both
pnpm lint:a11y  # report only accessibility (jsx-a11y) findings
pnpm format     # biome format --write . (formatting only)
pnpm format:check   # biome format . (formatting check only)

node scripts/check-typescript-only.js   # check that no JavaScript files exist in source (also run in `pnpm build`)
```

Each package's `lint` script chains OxLint and the Biome format check, so `pnpm -r lint` from the repo root covers the whole monorepo. Lint is strict: `--max-warnings 0` means any warning fails CI.

## Configuration files

| File | Tool | Scope |
|------|------|-------|
| `.oxlintrc.json` (repo root) | OxLint | All lint rules + `jsPlugins` (custom rules) + `ignorePatterns` |
| `packages/template/.oxlintrc.json` | OxLint | Template overrides (extends root) |
| `biome.json` (repo root) | Biome | Root formatter config (`root: true`) |
| `packages/template/biome.json` | Biome | Template formatter config (`root: false`, `extends: "//"`) |
| `packages/template/e2e/biome.json` | Biome | Standalone (`root: true`) — e2e's formatting scope differs |

Biome is configured for **formatting only** (`linter.enabled: false`, `assist.enabled: false`): 4-space indent, 120 print width, LF line endings, single quotes (JS) / double quotes (JSX), ES5 trailing commas.

## Type-aware linting

OxLint's type-aware rules run via `oxlint-tsgolint` (the `--type-aware` flag). They require the package's `tsconfig.json` to resolve, so type-aware linting runs everywhere **except** the `e2e/` sub-package (its CodeceptJS/node10 tsconfig conflicts with tsgolint).

> **Node version:** OxLint's JS-plugin loader needs Node ≥22.6 for native `.ts` type-stripping. The repo pins Node 24 via Volta, so this is satisfied in CI and for anyone using the pinned toolchain.

### `no-unnecessary-type-assertion` is off (deliberately)

`typescript/no-unnecessary-type-assertion` is set to `"off"` in `.oxlintrc.json`. Under `oxlint-tsgolint` it produces a false-positive storm — ~760 flags across the template, overwhelmingly on `as` casts that *are* load-bearing (test fixtures narrowing `unknown`/`never` mocks, SCAPI generated-type coercions, resource-route body casts). tsgolint's type resolution doesn't yet match `tsc`'s here, so the rule can't distinguish a genuinely redundant assertion from a necessary one. Keeping it on would either bury real findings under noise or force ~760 inline suppressions. Revisit if a future tsgolint release narrows the false positives.

## Custom lint rules

Custom rules live in [`lint-plugins/`](../../../lint-plugins/) at the repo root and load via `jsPlugins` in `.oxlintrc.json` under the `custom` namespace:

- `custom/color-linter` — enforce design tokens over hard-coded colors (see [README-UI-STYLING.md](./README-UI-STYLING.md))
- `custom/header-format` — enforce the Apache 2.0 copyright header on every TS/JS file
- `custom/no-internal-mvt-comments` — block internal multi-vertical comment markers from leaking into customer code (dropped by the mirror; monorepo-only)

Their unit tests (`lint-plugins/__tests__/`) run via `pnpm test:lint-plugins` (root `vitest.config.ts`) and are gated in CI by the **Lint Plugin Tests** job.

## TypeScript enforcement

Source files must be TypeScript. `node scripts/check-typescript-only.js` (run in `pnpm build`) blocks `.js`, `.jsx`, `.mjs`, `.cjs` under `src/`; use `.ts`/`.tsx` instead. CSS, JSON, Markdown, SVG, and other non-JS files are allowed.

## Accessibility rules (`jsx-a11y`)

OxLint's `jsx-a11y` plugin reproduces the full `eslint-plugin-jsx-a11y` recommended set at `error`, plus two extra guards. Because the template runs `pnpm lint` with `--max-warnings 0`, any accessibility violation fails CI. Run `pnpm lint:a11y` to see only the `jsx-a11y/*` findings while iterating.

| Rule | Setting | Why |
|------|---------|-----|
| `jsx-a11y` recommended set | `error` | Catches the common WCAG defects (missing labels, invalid ARIA, non-interactive handlers) at lint time. |
| `jsx-a11y/no-aria-hidden-on-focusable` | `error` | Not in the recommended set. A focusable element hidden from assistive tech is a high-severity trap; the guard finds nothing today, so it only stops regressions. |
| `jsx-a11y/anchor-ambiguous-text` | `error` | Not in the recommended set. Flags link text like "click here" that gives screen-reader users no destination context. |
| `jsx-a11y/no-redundant-roles` | `['error', { ul: ['list'] }]` | `role="list"` on `<ul>` is a deliberate Safari + VoiceOver workaround: Tailwind's `list-style: none` strips list semantics in Safari, so the explicit role is kept allowed rather than flagged as redundant. |
| `jsx-a11y/alt-text` | `error`, extended to `DynamicImage`/`ProductImage` | The repo's custom image components are treated like `<img>` for alt-text enforcement. |

A few intentional patterns keep scoped `oxlint-disable-next-line` comments (autofocus on section open, arrow-key roving within swatch and option groups, the labelled carousel region, Page Designer edit-mode drag handles). Test files relax a handful of these rules, since fixtures use ad-hoc roles and handlers that never ship.

> **`anchor-ambiguous-text` only sees static JSX.** It reads the literal text in the source, not what `t(...)` resolves to at runtime, so a link whose text comes from a translation key (e.g. `<Link>{t('cta.learnMore')}</Link>`) is never checked, and a translation that renders to "click here" in some locale will not be flagged. Ambiguous *translated* link text needs a separate audit of the locale JSON, not this lint rule.

## Excluded from linting/formatting

Both tools skip generated and vendored trees — SCAPI generated clients (`src/scapi*/generated/**`), shadcn primitives (`src/components/ui/**`), the Page Designer static registry, build artifacts (`dist/`, `build/`), and `node_modules/`. See `ignorePatterns` in `.oxlintrc.json` and `files.includes` negations in the `biome.json` files for the authoritative lists.

## Performance note — `no-misused-promises` attribute check

Under ESLint, `@typescript-eslint/no-misused-promises` with its `checksVoidReturn.attributes` sub-check dominated lint runtime (customers reported `pnpm lint` exceeding 30 minutes on slow CI, 65%+ attributed to this one rule) because it type-checked every JSX event-handler attribute across thousands of TSX files. Moving to OxLint's Rust-based engine removes that bottleneck; the linter now completes in seconds rather than minutes.

## Editor integration

- **OxLint**: install the [Oxc VS Code extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) for inline diagnostics.
- **Biome**: install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) and set it as the default formatter for format-on-save.
