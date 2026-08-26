---
name: sync-shadcn
description: |
  Sync upstream shadcn/ui updates into our forked primitives in packages/storefront-ui/src/components/ui/ via a 3-way merge that preserves our customizations (relative imports, rounded-ui/shadow-ui/border-ui shape tokens, data-slot attributes, added props), AND apply our house-style shape tokens to ANY component via `restyle`. Use when onboarding a brand-new shadcn primitive in one house-style-correct step — fork + baseline + shape tokens + unified `radix-ui`→individual `@radix-ui/react-*` imports (`add`); when shadcn ships new variants, accessibility fixes, or dependency bumps and you want to pull them into our forks without clobbering local changes (`sync`); when applying/normalizing our shape tokens on a new or existing component (`restyle`); when checking which primitives have drifted behind upstream (`status`) or off our house style (`infer`); or to see exactly what we customized for a component (`diff`). Repo-agnostic: resolves the ui dir from components.json, so it runs in a flattened customer/mirror repo, not just the monorepo.
  SKIP when: editing fashion/cosmetic primitives directly (those derive from packages/template via the mvt-* mirror skills — restyle the storefront-ui source instead); making a one-off manual tweak to a single primitive.
---

# sync-shadcn — 3-way merge for upstream shadcn updates

Our `src/components/ui/` primitives are **forks** of shadcn/ui (copy-paste, not an npm
package), edited in place with our customizations. This skill pulls upstream updates in
without losing those edits, using a 3-way merge:

| input  | what it is | where it lives |
|--------|------------|----------------|
| **base**   | pristine upstream we last synced from | `packages/<pkg>/.shadcn-baseline/<name>.tsx` |
| **theirs** | current upstream, freshly fetched | shadcn registry (`new-york-v4`) |
| **ours**   | our customized fork | `packages/<pkg>/src/components/ui/<name>.tsx` |

`git merge-file` replays the **base→theirs** delta (what upstream changed) onto **ours**.
Our customizations are the **ours↔base** delta, so they survive automatically; a conflict
appears **only** where upstream changed a line we also customized.

> The `.shadcn-baseline/` snapshots are not imported by anything — they exist solely as the
> merge's reference point. They contain vanilla `@/` imports and no copyright header, so the
> root ESLint config ignores `**/.shadcn-baseline/**` and `tsconfig` (`include: src/**`) never
> compiles them.

## Two composable mechanisms

The skill is **customization-as-merge** plus **customization-as-transform**:

| | mechanism | what it handles | needs a baseline? |
|---|---|---|---|
| **`sync`** | 3-way `git merge-file` | STRUCTURAL deltas: added props, `data-slot`, behavior, variants | yes (the `.shadcn-baseline/` anchor) |
| **`restyle`** | declarative ruleset (`ruleset.json`) | MECHANICAL shape tokens: `rounded-*`→`rounded-ui`, `shadow-*`→`shadow-ui`, `border`→`border-ui` (Card), import convention, unified `radix-ui`→individual `@radix-ui/react-*` | no — works on any file |

They compose: `sync` brings upstream structure in, then `restyle` normalizes any raw shape tokens
the merge reintroduced. A brand-new component (no baseline) gets its house style from `restyle`
alone.

## When to run

- shadcn announced a release, or you want to check for drift → `status`.
- A primitive needs an upstream a11y/variant fix → `sync <name>`.
- Onboarding a NEW shadcn primitive → `add <name>` (one step: fork + baseline + house style).
- Want to confirm forks haven't drifted off our house style → `restyle --all --check` / `infer --all`.
- Periodically (e.g. quarterly) to keep forks from drifting far.

Default package is `storefront-ui` (the canonical fork off upstream; the only package with
`.shadcn-baseline/` snapshots). For any other layout — including a **flattened customer/mirror
repo** — the skill discovers the ui dir from the nearest `components.json` (walk up from `--path`
or cwd), so no `--package` is needed. Fashion/cosmetic primitives are **out of scope** for direct
edits — they mirror `packages/template` (which inlines storefront-ui), so restyle the
`storefront-ui` source, not the mirror output.

## Commands

```bash
S=.claude/skills/sync-shadcn/sync.mjs

node $S add slider                  # ONBOARD a new primitive: fork + baseline + house style, one step
node $S status                      # behind / up-to-date / no-baseline for every primitive
node $S sync button                 # 3-way merge one component (+ auto-restyle on a clean merge)
node $S sync button dialog card     # several
node $S sync --all                  # every primitive with a baseline
node $S diff button                 # show our customizations (baseline -> fork diff)
node $S advance button              # promote baseline -> current upstream (after a clean merge)

node $S restyle button              # apply the ruleset to a fork (idempotent)
node $S restyle --all               # every fork in the resolved ui dir
node $S restyle --path src/components/ui/toggle.tsx   # a NEW component / any repo layout
node $S restyle --all --check       # dry-run conformance gate (exit 1 if anything would change)

node $S infer --all                 # report drift: raw shape tokens not yet -ui (exit 1 if any)
node $S infer card --emit           # print a ruleset inferred from baseline<->fork diffs

node $S sync --all --bootstrap      # ONE-TIME: seed every baseline from current upstream
```

## Restyle — the house-style ruleset

`ruleset.json` (beside this skill) is the declarative source of truth — token families, exclude
list, the Card-only `border` scope, and the import convention. `restyle` rewrites **only**
className / `cn()` / `cva()` string literals, matching tokens by exact variant-stripped core:

- `rounded-md`/`-lg`/`-xl`/… → `rounded-ui`; `shadow-sm`/`-xs`/… → `shadow-ui`.
- `border` → `border-ui` **only on Card** (`families.border.scope.only`). Every other primitive
  keeps literal `border` — border-ui is Card-only (see `docs/README-SHAPE-TOKENS.md`).
- **Preserved** (never members): `rounded-full`, `rounded-none`, directional/arbitrary radii
  (`rounded-t-lg`, `rounded-[2px]`), `border-2`, `border-input`, `shadow-none`.
- **Import convention** auto-adapts: where the `@/` alias resolves via tsconfig `paths` (the
  customer/mirror convention), `@/` imports are KEPT; where it does not (storefront-ui bans `@/`
  under `ui/`), they are relativized (`@/lib/utils` → `../../lib/utils`).
- **Radix unbundle** (`imports.unbundle`): upstream's unified `import { Dialog as DialogPrimitive }
  from "radix-ui"` → the individual `import * as DialogPrimitive from "@radix-ui/react-dialog"` our
  forks use (package derived from the export name, so `Dialog as SheetPrimitive` → `react-dialog`
  with the alias kept). `Slot` is an `exceptions` entry: it becomes a named import from
  `@radix-ui/react-slot` and its `Slot.Root` usage collapses to bare `Slot`. Matches only the exact
  bare `radix-ui` specifier, so it is a **no-op** on already-individual forks.

`restyle` is **idempotent** — the replacements are never members, so running twice is a no-op.

### New component flow

One command onboards a new primitive — it fetches from the correct `new-york-v4` path
(**not** the stale `new-york` that `npx shadcn add` uses), writes a house-styled fork
(shape tokens + radix unbundle + import convention), and seeds the baseline from the same
raw upstream in one step:

```bash
cd packages/storefront-ui
node $S add <name>                                    # fork + baseline + house style, one step
pnpm lint && pnpm typecheck                           # ESLint enforces the no-@/ import rule
```

Because the fork and its baseline come from a single fetch, `status`/`diff` immediately show
only our customizations — no phantom drift on the first sync. `add` refuses if the fork already
exists (use `sync` to update it, or `add <name> --force` to overwrite). The baseline stays the
pristine raw upstream (unified `radix-ui`, `@/` imports) — it is the 3-way merge anchor.

### Customer brand layer (dogfood path)

A generated customer project gets this skill in `.claude/skills/sync-shadcn/`. Customers tailor it
without editing `ruleset.json`: drop a `ruleset.customer.json` beside it (copy
`ruleset.customer.json.example`). It deep-merges OVER ours — precedence **upstream → our ruleset →
customer overlay**. Semantics are additive: `members` UNION (with explicit `removeMembers` to
subtract — so you can't accidentally un-protect `rounded-full`, which was never a member),
`replacement` overrides, `scope.only` and `relativizeAliases` UNION (with `removeAliases`).

## Workflow

1. **Check drift.** `node $S status` → lists which primitives are `BEHIND`.
2. **Sync.** `node $S sync <name>` for each behind component. The merged result (with any
   conflict markers) is written in place into the fork file. On a **clean** merge, `sync`
   auto-runs `restyle` to normalize any raw shape tokens the merge reintroduced (reported as
   `merged clean (restyled N token(s))`). The command reports per component:
   `up-to-date` / `merged clean` / `MERGED WITH CONFLICTS (N hunks)`, plus any anomalies.
3. **Resolve conflicts** (only if reported — see below). Conflicted files are **not**
   auto-restyled during `sync` (the engine won't tokenize conflict-marker lines). Once you've
   removed the markers, `advance` (step 5) normalizes any raw shape tokens you kept before
   promoting the baseline — or run `node $S restyle <name>` yourself to see the changes first.
4. **Verify** (always):
   ```bash
   cd packages/storefront-ui && pnpm lint && pnpm typecheck
   ```
   `pnpm lint` is the safety net: storefront-ui's ESLint **errors** on any `@/*` import in
   `src/components/ui/**`, so an alias import pulled in from upstream fails here, not in prod.
   If your change altered rendered DOM, also run the consuming package's snapshot tests
   (`cd packages/template && pnpm storybook:test --type=snapshot`).
5. **Advance the baseline.** Once the fork is clean and verified:
   ```bash
   node $S advance <name>
   ```
   This promotes `base` → current upstream so the next sync is conflict-free for those lines.
   `advance` **refuses** while any conflict marker remains — the baseline never advances from a
   half-merged tree. It also runs `restyle` on the (marker-free) fork first, normalizing any raw
   shape tokens a manual conflict resolution kept — idempotent, a no-op after a clean merge.
6. **Commit** the merged fork file(s) **and** the updated `.shadcn-baseline/` together.

## Conflicts — what to expect

A conflict means upstream changed a line you also customized. With `--zdiff3` you see all three
versions, so you can tell what each side changed:

```tsx
<<<<<<< ours (our fork)
      outline: "border bg-background shadow-ui hover:bg-accent ...",
||||||| base (last synced upstream)
      outline: "border bg-background shadow-xs hover:bg-accent ...",
=======
      outline: "border bg-background shadow-xs hover:bg-accent ... dark:bg-input/30",
>>>>>>> theirs (current upstream)
```

Read `base` → `ours` (we changed `shadow-xs`→`shadow-ui`) and `base` → `theirs` (upstream added
`dark:bg-input/30`). Usually the resolution is the **union**: keep our token, take their addition.
Delete the four marker lines, leaving the resolved line. Then re-run verify + `advance`.

Common customizations you'll be protecting: `rounded-md`→`rounded-ui`, `shadow-xs`→`shadow-ui`,
the `border-ui` utility, `data-slot`/`data-variant`/`data-size` attributes, relative
`../../lib/utils` imports, and added props (e.g. dialog `showCloseButton`, card `CardAction`).

## Anomalies the skill reports (does not auto-merge)

| report | meaning | action |
|--------|---------|--------|
| `[new-dependency]` | upstream declares a dep we don't have (e.g. unified `radix-ui`) | expected — the unbundle rule rewrites it to individual `@radix-ui/*`; review only if it's a non-radix dep |
| `[dep-missing]` | the fork imports a package (or an upstream dep) that isn't in `package.json` | install it at a version consistent with the other forks, then re-run `add`/`advance` |
| `[multi-file]` | upstream split the component into several files | merge the primary `<name>.tsx`; handle extra files manually |
| `[renamed]` | upstream's file basename ≠ `<name>.tsx` | likely rename/split; inspect before trusting the merge |
| `[missing-fork]` | exists upstream, not in our set | `add <name>` — onboards fork + baseline + house style in one step |
| `NOT FOUND (404)` | not published upstream (e.g. our custom `native-select`) | skipped; nothing to sync |

## Manifest fields (`.shadcn-baseline/manifest.json`)

Each component entry records:

- `contentSha256` — sha of the pristine upstream baseline (the change-detection key).
- `dependencies` — raw upstream dep **names** (e.g. `["radix-ui"]`), unchanged.
- `resolvedDependencies` — the fork's actual packages → **installed versions** (e.g.
  `{ "@radix-ui/react-slot": "1.2.3" }`), derived from the fork's post-unbundle imports and
  `package.json`. Written by `add`/`advance`/`sync --bootstrap`; pins what our fork ships.
- `syncedAt` — last **promotion** (seed / advance / add).
- `checkedAt` — last **drift-check** (also stamped by `sync`'s up-to-date path). `status` is
  read-only and does not write it.

## Notes

- No npm dependencies; uses Node global `fetch` + `node:crypto` + system `git`.
- The registry URL uses the **`-v4`** style suffix. The un-suffixed `new-york` path serves a
  stale, pre-`data-slot` snapshot older than our fork — `sync.mjs` resolves the suffix from
  `components.json` automatically; don't hardcode the un-versioned path.
- `storefront-ui` is a private package → no changeset needed for changes confined to it.
- This skill ships into generated customer projects: the customer-skills allowlist in
  `scripts/lib/ship-skills.mjs` copies it into the mirror artifact (`packages/template`'s
  `mirror.mjs`) and the standalone template (`scripts/generate-storefront.js`). Tests and fixtures
  are excluded from the shipped copy.
