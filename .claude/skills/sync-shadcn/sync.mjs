#!/usr/bin/env node
/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * sync-shadcn — 3-way merge engine for syncing upstream shadcn/ui updates into
 * our forked primitives while preserving local customizations.
 *
 * The three inputs per component:
 *   base   = pristine upstream snapshot we last synced from (.shadcn-baseline/<name>.tsx)
 *   theirs = freshly-fetched current upstream shadcn
 *   ours   = our customized fork file (src/components/ui/<name>.tsx)
 *
 * `git merge-file` replays the base->theirs delta (what upstream changed) onto
 * ours, so our customizations (the ours<->base delta) survive automatically and
 * conflicts only appear where upstream touched a line we also customized.
 *
 * Subcommands:
 *   sync    <names|--all> [--package <pkg>] [--bootstrap]   fetch + 3-way merge
 *   diff    <names|--all> [--package <pkg>]                 show baseline<->fork customizations
 *   advance <names|--all> [--package <pkg>]                 promote baseline -> current upstream
 *   status              [--package <pkg>]                   behind / up-to-date / no-baseline
 *
 * Usage:
 *   node .claude/skills/sync-shadcn/sync.mjs sync button
 *   node .claude/skills/sync-shadcn/sync.mjs sync --all --bootstrap
 *   node .claude/skills/sync-shadcn/sync.mjs diff button
 *   node .claude/skills/sync-shadcn/sync.mjs advance button
 *   node .claude/skills/sync-shadcn/sync.mjs status
 *
 * No environment variables. No npm dependencies (Node >=20 global fetch + node:crypto).
 */

import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, basename, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Repo root: this script lives at <repo>/.claude/skills/sync-shadcn/sync.mjs */
const REPO_ROOT = resolve(__dirname, '../../..');

const DEFAULT_REGISTRY = 'https://ui.shadcn.com/r';

/**
 * shadcn publishes Tailwind-v4 styles under a `-v4` suffix. The un-suffixed
 * path (e.g. `new-york`) serves a STALE, pre-data-slot snapshot that predates
 * our fork — fetching from it would try to revert our customizations. Always
 * resolve to the versioned style. See README in this skill for the gotcha.
 */
const STYLE_SUFFIX = '-v4';

/**
 * Back-compat `--package` aliases mapping to a directory under `packages/`.
 * `storefront-ui` is the canonical shadcn fork (the merge/restyle target with
 * `.shadcn-baseline/` snapshots). Outside these aliases — including a flattened
 * customer/mirror repo — the context is discovered from `components.json`
 * (see `resolveContext`); no package layout is assumed.
 */
const PACKAGES = {
    'storefront-ui': 'storefront-ui',
};
const DEFAULT_PACKAGE = 'storefront-ui';

const BASELINE_DIR = '.shadcn-baseline';
const MANIFEST_NAME = 'manifest.json';

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no IO, no network)
// ---------------------------------------------------------------------------

/**
 * Resolve a components.json `style` to the versioned registry style.
 * Already-versioned styles (e.g. `new-york-v4`) pass through unchanged.
 */
export function resolveStyle(style) {
    if (typeof style !== 'string' || style.length === 0) {
        throw new Error('components.json "style" is missing or not a string');
    }
    return /-v\d+$/.test(style) ? style : style + STYLE_SUFFIX;
}

/** Build the registry URL for a single component. */
export function buildRegistryUrl(registry, resolvedStyle, name) {
    return `${registry}/styles/${resolvedStyle}/${name}.json`;
}

/**
 * Pick the component's primary source file from a registry payload.
 * A payload may carry multiple files (split components / new deps); the primary
 * is the one whose basename matches `<name>.tsx`, falling back to the first.
 */
export function extractPrimaryFile(json, name) {
    if (!json || !Array.isArray(json.files) || json.files.length === 0) {
        throw new Error(`registry payload for "${name}" has no files[]`);
    }
    const wanted = `${name}.tsx`;
    const match = json.files.find((f) => basename(f.path || '') === wanted);
    return match ?? json.files[0];
}

/** sha256 hex of a string — the idempotency / change-detection key. */
export function sha256(content) {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Normalize a source string to a single trailing newline. The registry's
 * `content` strings vary in trailing whitespace; pinning this on all three
 * merge inputs avoids a spurious last-line conflict.
 */
export function normalizeContent(content) {
    return content.replace(/\s*$/, '') + '\n';
}

/** Count `<<<<<<<` conflict-start markers in merged content. */
export function countConflictMarkers(content) {
    const m = content.match(/^<{7}/gm);
    return m ? m.length : 0;
}

/** True if any git conflict marker (any of the four) remains. */
export function hasConflictMarkers(content) {
    return /^(<{7}|={7}|>{7}|\|{7})/m.test(content);
}

/**
 * Detect things the skill should REPORT but not auto-merge.
 * @param {{files: Array<{path:string}>, dependencies?: string[]}} payload fetched registry JSON
 * @param {{name: string, forkExists: boolean, pkgDeps: string[]}} ctx
 * @returns {Array<{type: string, message: string}>}
 */
export function detectAnomalies(payload, ctx) {
    const anomalies = [];
    const files = payload.files || [];
    const wanted = `${ctx.name}.tsx`;

    if (files.length > 1) {
        const extra = files.map((f) => basename(f.path || '')).filter((b) => b !== wanted);
        anomalies.push({
            type: 'multi-file',
            message: `upstream ships ${files.length} files (${files
                .map((f) => basename(f.path || ''))
                .join(', ')}); merging only ${wanted}. Handle extra files manually: ${extra.join(', ')}`,
        });
    } else if (files.length === 1 && basename(files[0].path || '') !== wanted) {
        anomalies.push({
            type: 'renamed',
            message: `upstream file is "${basename(files[0].path || '')}", not "${wanted}" — possible rename/split.`,
        });
    }

    const deps = payload.dependencies || [];
    const newDeps = deps.filter((d) => !ctx.pkgDeps.includes(d));
    if (newDeps.length > 0) {
        anomalies.push({
            type: 'new-dependency',
            message: `upstream declares dependencies not in package.json: ${newDeps.join(
                ', '
            )}. Review before adding (our fork may intentionally use different packages).`,
        });
    }

    if (!ctx.forkExists) {
        anomalies.push({
            type: 'missing-fork',
            message: `no fork file for "${ctx.name}" — exists upstream but not in our set. Use \`npx shadcn add\` to introduce it (a separate customization task).`,
        });
    }

    return anomalies;
}

// ---------------------------------------------------------------------------
// Restyle engine — customization-as-transform (pure, exported for unit tests)
//
// The mechanical house-style edits (rounded-* -> rounded-ui, shadow-* ->
// shadow-ui, border -> border-ui on Card, @/ imports -> relative) are
// SUBSTITUTION RULES expressed in ruleset.json. `restyleContent` applies them to
// ANY component — existing forks idempotently, and brand-new ones with no
// baseline. It is the post-merge normalizer that composes with the 3-way merge.
//
// SAFETY: substitutions touch ONLY className string literals — strings reachable
// from a `className=` attribute or a class-merge call (cn/cva/...). Comments,
// identifiers, and unrelated string literals are never in a located range, so
// they are provably never rewritten. Matching is by EXACT token equality on the
// variant-stripped core (rounded-md, not a `rounded` prefix), so rounded-full,
// rounded-t-lg, border-input, border-2 are structurally incapable of matching.
// ---------------------------------------------------------------------------

/** Class-merge function names whose string args are className strings. */
const CLASS_FNS = ['cn', 'cva', 'clsx', 'cx', 'tv'];

const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * Locate className string-literal content ranges in TSX source.
 *
 * Returns `[{ start, end }]` byte ranges (the chars BETWEEN the quotes) of
 * single/double-quoted strings that are reachable from a `className=` attribute
 * or a class-merge call argument. Template literals are scanned (to parse
 * correctly) but not rewritten — the forks use plain string literals, and any
 * missed token surfaces in `infer`/`restyle --check` rather than silently.
 *
 * @param {string} content TSX source
 * @returns {Array<{start:number,end:number}>}
 */
export function tokenizeClassStrings(content) {
    const ranges = [];
    // Scope stack: each open ( { [ pushes an entry; a class string is one whose
    // nearest enclosing call-paren is a class fn (object/array braces are
    // transparent so cva variant-value strings stay eligible).
    const scopes = [];
    const n = content.length;
    let i = 0;
    let lastIdent = '';
    let identActive = false; // true right after an identifier, through following whitespace
    let pendingClassName = false; // saw `className` `=`, awaiting the value

    const eligibleNow = () => {
        for (let s = scopes.length - 1; s >= 0; s--) {
            if (scopes[s].kind === 'paren') return scopes[s].class;
            if (scopes[s].kind === 'classbrace') return true;
            // 'brace' / 'bracket' are object/array literals — transparent.
        }
        return false;
    };

    while (i < n) {
        const c = content[i];
        const c2 = content[i + 1];

        // line comment
        if (c === '/' && c2 === '/') {
            i += 2;
            while (i < n && content[i] !== '\n') i++;
            identActive = false;
            continue;
        }
        // block comment
        if (c === '/' && c2 === '*') {
            i += 2;
            while (i < n && !(content[i] === '*' && content[i + 1] === '/')) i++;
            i += 2;
            identActive = false;
            continue;
        }
        // single / double quoted string
        if (c === '"' || c === "'") {
            const start = i + 1;
            let j = start;
            while (j < n) {
                if (content[j] === '\\') {
                    j += 2;
                    continue;
                }
                if (content[j] === c) break;
                j++;
            }
            if (pendingClassName || eligibleNow()) ranges.push({ start, end: j });
            pendingClassName = false;
            identActive = false;
            i = j + 1;
            continue;
        }
        // template literal — scan past it (incl. ${ } interpolations); not rewritten
        if (c === '`') {
            i++;
            while (i < n) {
                if (content[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (content[i] === '`') {
                    i++;
                    break;
                }
                if (content[i] === '$' && content[i + 1] === '{') {
                    i += 2;
                    let depth = 1;
                    while (i < n && depth > 0) {
                        const cc = content[i];
                        if (cc === '\\') {
                            i += 2;
                            continue;
                        }
                        if (cc === '{') depth++;
                        else if (cc === '}') depth--;
                        else if (cc === '"' || cc === "'" || cc === '`') {
                            i++;
                            while (i < n) {
                                if (content[i] === '\\') {
                                    i += 2;
                                    continue;
                                }
                                if (content[i] === cc) break;
                                i++;
                            }
                        }
                        i++;
                    }
                    continue;
                }
                i++;
            }
            pendingClassName = false;
            identActive = false;
            continue;
        }
        // open / close scopes
        if (c === '(') {
            scopes.push({ kind: 'paren', class: identActive && CLASS_FNS.includes(lastIdent) });
            identActive = false;
            pendingClassName = false;
            i++;
            continue;
        }
        if (c === '{') {
            scopes.push({ kind: pendingClassName ? 'classbrace' : 'brace', class: false });
            identActive = false;
            pendingClassName = false;
            i++;
            continue;
        }
        if (c === '[') {
            scopes.push({ kind: 'bracket', class: false });
            identActive = false;
            i++;
            continue;
        }
        if (c === ')' || c === '}' || c === ']') {
            scopes.pop(); // source is balanced; strings/comments already consumed
            identActive = false;
            i++;
            continue;
        }
        // identifier
        if (IDENT_CHAR.test(c)) {
            let j = i;
            while (j < n && IDENT_CHAR.test(content[j])) j++;
            lastIdent = content.slice(i, j);
            identActive = true;
            i = j;
            continue;
        }
        // whitespace keeps identActive / pendingClassName alive (between `=` and value)
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            i++;
            continue;
        }
        // `className=` (single `=`, not `==`/`=>`)
        if (c === '=' && c2 !== '=' && c2 !== '>') {
            if (identActive && lastIdent === 'className') pendingClassName = true;
            identActive = false;
            i++;
            continue;
        }
        // any other punctuation
        identActive = false;
        pendingClassName = false;
        i++;
    }
    return ranges;
}

/**
 * Split a Tailwind class token into its variant prefix, `!` important marker,
 * and utility core. The prefix is everything up to and including the last `:`
 * that is NOT inside brackets (so `data-[state=open]:` and
 * `[&_svg:not(...)]:` are handled, and `[--ui-radius:...]` has no depth-0 colon).
 *
 * @param {string} token a single whitespace-delimited class token
 * @returns {{prefix:string, important:string, core:string}}
 */
export function splitClassToken(token) {
    let depth = 0;
    let lastColon = -1;
    for (let i = 0; i < token.length; i++) {
        const c = token[i];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === ':' && depth === 0) lastColon = i;
    }
    const prefix = lastColon >= 0 ? token.slice(0, lastColon + 1) : '';
    let core = lastColon >= 0 ? token.slice(lastColon + 1) : token;
    let important = '';
    if (core.startsWith('!')) {
        important = '!';
        core = core.slice(1);
    }
    return { prefix, important, core };
}

/** True if a class token's variant-stripped core is exactly one of `members`. */
export function matchesFamilyMember(token, members) {
    return members.includes(splitClassToken(token).core);
}

/**
 * Rewrite a single class token if its core matches a ruleset family member.
 * Border-family substitution applies only to files in `family.scope.only`.
 * @returns {{rewritten:string, family:string|null}}
 */
function rewriteToken(token, ruleset, fileBase) {
    const { prefix, important, core } = splitClassToken(token);
    for (const [family, fam] of Object.entries(ruleset.families || {})) {
        if (fam.scope?.only && !fam.scope.only.includes(fileBase)) continue;
        if ((fam.members || []).includes(core)) {
            // No replacement → leave the token untouched rather than emit the
            // literal "undefined". loadRuleset/mergeRulesets reject this case, so
            // this is a defensive backstop for any other ruleset source.
            if (!fam.replacement) return { rewritten: token, family: null };
            return { rewritten: prefix + important + fam.replacement, family };
        }
    }
    return { rewritten: token, family: null };
}

/** Rewrite every member token inside one className string, preserving whitespace. */
function rewriteClassString(str, ruleset, fileBase, edits) {
    const parts = str.split(/(\s+)/);
    for (let k = 0; k < parts.length; k++) {
        const tok = parts[k];
        if (tok === '' || /^\s+$/.test(tok)) continue;
        const { rewritten, family } = rewriteToken(tok, ruleset, fileBase);
        if (rewritten !== tok) {
            edits.push({ family, from: tok, to: rewritten });
            parts[k] = rewritten;
        }
    }
    return parts.join('');
}

/**
 * Rewrite an aliased import specifier (e.g. `@/lib/utils`) to a path relative to
 * `fromFile`. Returns the specifier unchanged if it matches none of `aliases`.
 *
 * @param {string} specifier import specifier as written
 * @param {string} fromFile absolute path of the file containing the import
 * @param {string} srcRoot absolute path the alias resolves to (e.g. <pkg>/src)
 * @param {string[]} aliases alias prefixes to relativize (e.g. ['@/'])
 * @returns {string}
 */
export function relativizeImport(specifier, fromFile, srcRoot, aliases = ['@/']) {
    for (const alias of aliases) {
        if (specifier.startsWith(alias)) {
            const targetAbs = resolve(srcRoot, specifier.slice(alias.length));
            let rel = relative(dirname(resolve(fromFile)), targetAbs).split(sep).join('/');
            if (!rel.startsWith('.')) rel = './' + rel;
            return rel;
        }
    }
    return specifier;
}

/** Relativize aliased specifiers in `from '...'`, `import '...'`, `import('...')`. */
function relativizeImports(content, aliases, fromFile, srcRoot, edits) {
    return content.replace(
        /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g,
        (m, pre, q, spec) => {
            const rel = relativizeImport(spec, fromFile, srcRoot, aliases);
            if (rel === spec) return m;
            edits.push({ family: 'import', from: spec, to: rel });
            return pre + q + rel + q;
        }
    );
}

/**
 * Apply the ruleset to TSX source. Rewrites className member tokens and (when
 * srcRoot/fromFile are given and the ruleset relativizes aliases) import
 * specifiers. Idempotent: replacements are never family members, so a second
 * pass reports `changed: false`.
 *
 * @param {string} content TSX source
 * @param {object} ruleset resolved ruleset (families + imports)
 * @param {{fileBase?:string, srcRoot?:string, fromFile?:string}} [opts]
 *   fileBase = component basename without extension (drives border scope).
 * @returns {{content:string, changed:boolean, edits:Array<{family:string,from:string,to:string}>}}
 */
export function restyleContent(content, ruleset, opts = {}) {
    const fileBase = opts.fileBase || '';
    const edits = [];

    // 1. className token rewrites — right-to-left so earlier ranges stay valid.
    let out = content;
    const ranges = tokenizeClassStrings(content);
    for (let r = ranges.length - 1; r >= 0; r--) {
        const { start, end } = ranges[r];
        const original = out.slice(start, end);
        const rewritten = rewriteClassString(original, ruleset, fileBase, edits);
        if (rewritten !== original) out = out.slice(0, start) + rewritten + out.slice(end);
    }

    // 2. import relativization (new-component support).
    const aliases = ruleset.imports?.relativizeAliases || [];
    if (aliases.length && opts.srcRoot && opts.fromFile) {
        out = relativizeImports(out, aliases, opts.fromFile, opts.srcRoot, edits);
    }

    return { content: out, changed: edits.length > 0, edits };
}

// ---------------------------------------------------------------------------
// Repo-agnostic path resolution (pure helpers, exported for unit tests)
//
// Resolve the ui directory from components.json `aliases.ui` (+ tsconfig
// `paths`), so the skill runs in any layout — the monorepo packages/ tree AND a
// flattened customer/mirror repo with a single components.json at its root.
// ---------------------------------------------------------------------------

/**
 * Resolve an aliased path (e.g. `@/components/ui`) to an absolute filesystem
 * path. The alias prefix maps to `srcRoot`; anything after it joins onto it.
 *
 * @param {string} aliased the aliased path from components.json (e.g. `@/components/ui`)
 * @param {string} aliasPrefix the alias root (e.g. `@/`)
 * @param {string} srcRoot absolute dir the alias resolves to (e.g. `<pkg>/src`)
 * @returns {string} absolute path
 */
export function aliasToPath(aliased, aliasPrefix, srcRoot) {
    const rest = aliased.startsWith(aliasPrefix) ? aliased.slice(aliasPrefix.length) : aliased;
    return resolve(srcRoot, rest);
}

/**
 * Resolve the ui dir + src root + utils path for a package, from its
 * components.json and (optionally) its tsconfig `compilerOptions.paths`.
 *
 * The `@/` alias root comes from tsconfig `paths["@/*"]` -> e.g. `./src/*`
 * (strip the trailing `/*`), falling back to the sensible default `@/` -> `src/`
 * when no tsconfig paths entry exists. Pure: callers read the files.
 *
 * `aliasResolves` is true when tsconfig maps the alias (e.g. `@/* -> ./src/*`).
 * It is the discriminator for the import convention: when the alias resolves,
 * `@/` imports work and are KEPT (the customer/mirror convention); when it does
 * NOT (e.g. storefront-ui, which bans `@/` under ui/), imports are relativized.
 *
 * @param {object} componentsJson parsed components.json
 * @param {object|null} tsconfig parsed tsconfig.json (or null)
 * @param {string} pkgRoot absolute package root (dir holding components.json)
 * @returns {{aliasPrefix:string, srcRoot:string, uiDir:string, libUtilsPath:string, aliasResolves:boolean}}
 */
export function resolveUiDirFromComponents(componentsJson, tsconfig, pkgRoot) {
    const aliasesCfg = componentsJson.aliases || {};
    const uiAlias = aliasesCfg.ui || '@/components/ui';
    const utilsAlias = aliasesCfg.utils || '@/lib/utils';
    // Alias prefix = everything up to and including the first `/` (e.g. `@/`).
    const slash = uiAlias.indexOf('/');
    const aliasPrefix = slash >= 0 ? uiAlias.slice(0, slash + 1) : '@/';

    // Map the alias prefix to a src root via tsconfig paths, else default to src/.
    let srcRel = 'src';
    let aliasResolves = false;
    const paths = tsconfig?.compilerOptions?.paths || {};
    for (const [pattern, targets] of Object.entries(paths)) {
        // Match `@/*` (or whatever the alias prefix is, with a `*`).
        if (pattern === `${aliasPrefix}*` && Array.isArray(targets) && targets[0]) {
            srcRel = targets[0].replace(/^\.\//, '').replace(/\/\*$/, '');
            aliasResolves = true;
            break;
        }
    }
    const srcRoot = resolve(pkgRoot, srcRel);
    return {
        aliasPrefix,
        srcRoot,
        uiDir: aliasToPath(uiAlias, aliasPrefix, srcRoot),
        libUtilsPath: aliasToPath(utilsAlias, aliasPrefix, srcRoot),
        aliasResolves,
    };
}

// ---------------------------------------------------------------------------
// Ruleset loading + customer layering
//   Precedence: upstream shadcn -> our ruleset.json -> ruleset.customer.json.
// ---------------------------------------------------------------------------

const RULESET_NAME = 'ruleset.json';
const CUSTOMER_RULESET_NAME = 'ruleset.customer.json';

const uniq = (arr) => [...new Set(arr)];

/**
 * Deep-merge a customer overlay over our ruleset. Additive by design so a
 * customer can extend but not silently weaken our protections:
 *   - families.<f>.members      UNION (then minus removeMembers)
 *   - families.<f>.replacement  customer overrides if present
 *   - families.<f>.scope.only   UNION
 *   - families the customer adds wholesale are included
 *   - imports.relativizeAliases UNION (then minus removeAliases)
 *   - imports.utilsAlias        customer overrides if present
 *
 * @param {object} ours shipped ruleset.json
 * @param {object} [customer] ruleset.customer.json (may be undefined/empty)
 * @returns {object} resolved ruleset
 */
export function mergeRulesets(ours, customer) {
    if (!customer) return ours;
    const families = {};
    const names = uniq([
        ...Object.keys(ours.families || {}),
        ...Object.keys(customer.families || {}),
    ]);
    for (const name of names) {
        const a = (ours.families || {})[name] || {};
        const b = (customer.families || {})[name] || {};
        const members = uniq([...(a.members || []), ...(b.members || [])]).filter(
            (m) => !(b.removeMembers || []).includes(m)
        );
        const replacement = b.replacement ?? a.replacement;
        // A family with members but no replacement would rewrite those tokens to
        // the literal string "undefined". Fail loud at load time instead — this is
        // almost always a customer adding a new family and forgetting `replacement`.
        if (members.length && !replacement) {
            throw new Error(
                `ruleset.customer.json family "${name}" has members but no "replacement". ` +
                    `Add a replacement class (e.g. "${name}-ui") or remove the family.`
            );
        }
        const family = { replacement, members };
        const scopeOnly = uniq([...(a.scope?.only || []), ...(b.scope?.only || [])]);
        if (a.scope?.only || b.scope?.only) family.scope = { only: scopeOnly };
        families[name] = family;
    }

    const oursImp = ours.imports || {};
    const custImp = customer.imports || {};
    const relativizeAliases = uniq([
        ...(oursImp.relativizeAliases || []),
        ...(custImp.relativizeAliases || []),
    ]).filter((al) => !(custImp.removeAliases || []).includes(al));

    return {
        version: ours.version,
        families,
        imports: {
            relativizeAliases,
            utilsAlias: custImp.utilsAlias ?? oursImp.utilsAlias,
        },
    };
}

/**
 * Load the resolved ruleset: ours (shipped beside this script) deep-merged with
 * an optional customer overlay. The overlay is looked for beside the script
 * first, then (so a generated customer repo can keep it with the skill) it is
 * already colocated — both resolve to the same dir.
 *
 * @returns {object} resolved ruleset
 */
function loadRuleset() {
    const ours = JSON.parse(readFileSync(join(__dirname, RULESET_NAME), 'utf8'));
    const customerPath = join(__dirname, CUSTOMER_RULESET_NAME);
    const customer = existsSync(customerPath)
        ? JSON.parse(readFileSync(customerPath, 'utf8'))
        : undefined;
    return mergeRulesets(ours, customer);
}

// ---------------------------------------------------------------------------
// IO / package resolution
// ---------------------------------------------------------------------------

/** Walk up from `dir` to the nearest ancestor containing `components.json`. */
function findComponentsJson(dir) {
    let cur = resolve(dir);
    for (;;) {
        if (existsSync(join(cur, 'components.json'))) return cur;
        const parent = dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

/**
 * Resolve the working context (ui dir, baselines, style, deps) for a target.
 *
 * Resolution order:
 *   1. Back-compat: `--package <alias>` mapping to an existing
 *      `packages/<dir>/components.json` under the monorepo root.
 *   2. Discovery: walk up from `startDir` (cwd, or the dir of an explicit
 *      `--path`) to the nearest `components.json` — works in a flattened repo.
 *
 * The ui dir is derived from `components.json` `aliases.ui` (+ tsconfig paths),
 * never hardcoded. Returns the field names the rest of sync.mjs consumes.
 *
 * @param {{packageAlias?:string, startDir?:string}} [opts]
 * @returns {object} context
 */
function resolveContext({ packageAlias, startDir } = {}) {
    let pkgDir = null;

    // An explicit but unknown alias is a typo or a removed alias — error rather
    // than silently discovering some other components.json from cwd (which would
    // sync/restyle the wrong package). The default `storefront-ui` is a known
    // alias, so it passes here and still falls through to discovery in a
    // flattened repo where `packages/storefront-ui` doesn't exist. `--path`
    // passes `packageAlias: undefined`, bypassing this check entirely.
    if (packageAlias && !PACKAGES[packageAlias]) {
        throw new Error(
            `unknown --package "${packageAlias}". Known: ${Object.keys(PACKAGES).join(', ')}. ` +
                `For any other layout, omit --package (discovered from components.json) or use --path.`
        );
    }
    if (packageAlias && PACKAGES[packageAlias]) {
        const candidate = join(REPO_ROOT, 'packages', PACKAGES[packageAlias]);
        if (existsSync(join(candidate, 'components.json'))) pkgDir = candidate;
    }
    if (!pkgDir) {
        pkgDir = findComponentsJson(startDir || process.cwd());
    }
    if (!pkgDir) {
        throw new Error(
            `no components.json found (searched up from ${
                startDir || process.cwd()
            }). Run from inside a shadcn project, or pass --package/--path.`
        );
    }

    const componentsJson = JSON.parse(readFileSync(join(pkgDir, 'components.json'), 'utf8'));
    const tsconfigPath = join(pkgDir, 'tsconfig.json');
    const tsconfig = existsSync(tsconfigPath)
        ? JSON.parse(readFileSync(tsconfigPath, 'utf8'))
        : null;
    const { srcRoot, uiDir, libUtilsPath, aliasResolves } = resolveUiDirFromComponents(
        componentsJson,
        tsconfig,
        pkgDir
    );

    const packageJsonPath = join(pkgDir, 'package.json');
    const pkgJson = existsSync(packageJsonPath)
        ? JSON.parse(readFileSync(packageJsonPath, 'utf8'))
        : { dependencies: {} };

    const baselineDir = join(pkgDir, BASELINE_DIR);
    return {
        alias: packageAlias,
        pkgDir,
        repoRoot: existsSync(REPO_ROOT) ? REPO_ROOT : pkgDir,
        srcRoot,
        uiDir,
        libUtilsPath,
        // When the `@/` alias resolves via tsconfig, `@/` imports work and are
        // the right convention here — keep them. Relativize only where the alias
        // does NOT resolve (e.g. storefront-ui bans `@/` under ui/).
        relativizeImports: !aliasResolves,
        baselineDir,
        manifestPath: join(baselineDir, MANIFEST_NAME),
        style: componentsJson.style,
        resolvedStyle: resolveStyle(componentsJson.style),
        pkgDeps: Object.keys(pkgJson.dependencies || {}),
    };
}

function forkPath(pkg, name) {
    return join(pkg.uiDir, `${name}.tsx`);
}

function baselinePath(pkg, name) {
    return join(pkg.baselineDir, `${name}.tsx`);
}

function listForkComponents(pkg) {
    if (!existsSync(pkg.uiDir)) return [];
    return readdirSync(pkg.uiDir)
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => f.replace(/\.tsx$/, ''))
        .sort();
}

function loadManifest(pkg) {
    if (!existsSync(pkg.manifestPath)) {
        return { registry: DEFAULT_REGISTRY, style: pkg.resolvedStyle, components: {} };
    }
    return JSON.parse(readFileSync(pkg.manifestPath, 'utf8'));
}

function saveManifest(pkg, manifest) {
    mkdirSync(pkg.baselineDir, { recursive: true });
    writeFileSync(pkg.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/** Fetch a component's registry payload. Returns null on 404. */
async function fetchUpstream(pkg, name) {
    const url = buildRegistryUrl(DEFAULT_REGISTRY, pkg.resolvedStyle, name);
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return { url, json };
}

/** Run `git merge-file` in place into the fork file; returns conflict count. */
function gitMergeFile(forkAbs, baselineAbs, theirsAbs) {
    try {
        execFileSync(
            'git',
            [
                'merge-file',
                '--zdiff3',
                '--diff-algorithm=histogram',
                '-L',
                'ours (our fork)',
                '-L',
                'base (last synced upstream)',
                '-L',
                'theirs (current upstream)',
                forkAbs,
                baselineAbs,
                theirsAbs,
            ],
            { stdio: 'pipe' }
        );
        return 0;
    } catch (e) {
        // git merge-file exits with the conflict count (1..127). 255/-1 = fatal.
        if (typeof e.status === 'number' && e.status > 0 && e.status < 128) {
            return e.status;
        }
        throw new Error(`git merge-file failed: ${e.stderr?.toString() || e.message}`);
    }
}

function gitDiffNoIndex(aAbs, bAbs) {
    try {
        return execFileSync('git', ['diff', '--no-index', '--', aAbs, bAbs], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
    } catch (e) {
        // git diff --no-index exits 1 when files differ; stdout still holds the diff.
        if (e.status === 1 && typeof e.stdout === 'string') return e.stdout;
        throw new Error(`git diff failed: ${e.stderr?.toString() || e.message}`);
    }
}

function writeTemp(name, content) {
    const dir = join(tmpdir(), `sync-shadcn-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${name}.theirs.tsx`);
    writeFileSync(p, content);
    return { path: p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function resolveTargets(pkg, names, all) {
    if (all) return listForkComponents(pkg);
    if (names.length === 0) {
        throw new Error('no components named. Pass component names or --all.');
    }
    return names;
}

async function cmdSync(pkg, names, { all, bootstrap }) {
    const manifest = loadManifest(pkg);
    const ruleset = loadRuleset();
    const targets = resolveTargets(pkg, names, all);
    const report = { seeded: [], upToDate: [], merged: [], conflicts: [], skipped: [] };

    for (const name of targets) {
        const fork = forkPath(pkg, name);
        const forkExists = existsSync(fork);

        const upstream = await fetchUpstream(pkg, name);
        if (!upstream) {
            console.log(`  ${name}: NOT FOUND upstream (404) — likely a custom/removed component. Skipped.`);
            report.skipped.push(name);
            continue;
        }

        const file = extractPrimaryFile(upstream.json, name);
        const theirs = normalizeContent(file.content);
        const theirsSha = sha256(theirs);
        const anomalies = detectAnomalies(upstream.json, {
            name,
            forkExists,
            pkgDeps: pkg.pkgDeps,
        });
        for (const a of anomalies) console.log(`  ${name}: [${a.type}] ${a.message}`);

        if (!forkExists) {
            report.skipped.push(name);
            continue;
        }

        const baselineAbs = baselinePath(pkg, name);
        const hasBaseline = existsSync(baselineAbs);

        // Bootstrap: seed baseline, never merge. (Explicit --bootstrap, or first
        // run when no baseline exists — a true 3-way merge is impossible without a base.)
        if (bootstrap || !hasBaseline) {
            mkdirSync(pkg.baselineDir, { recursive: true });
            writeFileSync(baselineAbs, theirs);
            manifest.components[name] = manifestEntry(upstream, file, theirsSha);
            console.log(
                `  ${name}: SEEDED baseline${hasBaseline ? ' (re-seeded)' : ''} — no merge performed.`
            );
            report.seeded.push(name);
            continue;
        }

        // Up-to-date: upstream sha matches what we last synced.
        if (manifest.components[name]?.contentSha256 === theirsSha) {
            console.log(`  ${name}: up-to-date.`);
            report.upToDate.push(name);
            continue;
        }

        // 3-way merge, in place into the fork file.
        const tmp = writeTemp(name, theirs);
        try {
            const conflicts = gitMergeFile(fork, baselineAbs, tmp.path);
            const merged = readFileSync(fork, 'utf8');
            const markerCount = countConflictMarkers(merged);
            if (conflicts > 0 || markerCount > 0) {
                console.log(
                    `  ${name}: MERGED WITH CONFLICTS (${markerCount || conflicts} hunk(s)) — resolve <<<<<<< markers in ${forkRel(pkg, name)}, then \`advance ${name}\`.`
                );
                report.conflicts.push(name);
            } else {
                // Post-merge normalize: the merge may have reintroduced raw
                // upstream tokens (shadow-xs, rounded-md) on lines upstream
                // rewrote. restyle is the normalizer; the two compose. Only safe
                // on a clean (marker-free) merge — never tokenize conflict lines.
                const { content: normalized, edits } = restyleContent(merged, ruleset, {
                    fileBase: name,
                });
                if (edits.length) writeFileSync(fork, normalized);
                const note = edits.length ? ` (restyled ${edits.length} token(s))` : '';
                console.log(
                    `  ${name}: merged clean${note} — review ${forkRel(pkg, name)}, then \`advance ${name}\`.`
                );
                report.merged.push(name);
            }
        } finally {
            tmp.cleanup();
        }
    }

    saveManifest(pkg, manifest);
    summarize(report);
    return report;
}

/**
 * Resolve restyle targets to a list of `{ file, fileBase }`. With `--path`, the
 * path may be a single .tsx file or a directory of them (a brand-new component,
 * a flattened customer repo). Otherwise targets are named forks / `--all` in the
 * resolved package's ui dir.
 */
function resolveRestyleTargets(pkg, names, { all, path: explicitPath }) {
    if (explicitPath) {
        const abs = resolve(explicitPath);
        if (!existsSync(abs)) throw new Error(`--path not found: ${explicitPath}`);
        const files = isDir(abs)
            ? readdirSync(abs)
                  .filter((f) => f.endsWith('.tsx'))
                  .sort()
                  .map((f) => join(abs, f))
            : [abs];
        return files.map((file) => ({ file, fileBase: basename(file).replace(/\.tsx$/, '') }));
    }
    return resolveTargets(pkg, names, all).map((name) => ({
        file: forkPath(pkg, name),
        fileBase: name,
    }));
}

function isDir(p) {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/**
 * `restyle` — apply the ruleset idempotently to forks / a path. Standalone
 * normalizer for new components and post-merge cleanup. `--check` is a dry-run
 * conformance gate (exit 1 if anything would change).
 */
function cmdRestyle(pkg, names, opts) {
    const ruleset = loadRuleset();
    const targets = resolveRestyleTargets(pkg, names, opts);
    let changed = 0;
    let wouldChange = 0;

    for (const { file, fileBase } of targets) {
        if (!existsSync(file)) {
            console.log(`  ${fileBase}: no file at ${file} — skipped.`);
            continue;
        }
        const original = readFileSync(file, 'utf8');
        const { content, edits } = restyleContent(original, ruleset, {
            fileBase,
            // Only relativize imports where the `@/` alias does not resolve
            // (storefront-ui convention); keep `@/` in customer/mirror repos.
            ...(pkg.relativizeImports ? { srcRoot: pkg.srcRoot, fromFile: file } : {}),
        });
        if (edits.length === 0) {
            console.log(`  ${fileBase}: clean.`);
            continue;
        }
        const summary = summarizeEdits(edits);
        if (opts.check) {
            console.log(`  ${fileBase}: would restyle (${summary}).`);
            wouldChange++;
        } else {
            writeFileSync(file, content);
            console.log(`  ${fileBase}: restyled (${summary}).`);
            changed++;
        }
    }

    if (opts.check) {
        console.log(
            `\n${wouldChange ? `${wouldChange} file(s) would change` : 'all clean'}.`
        );
        if (wouldChange) process.exitCode = 1;
    } else {
        console.log(`\n${changed ? `${changed} file(s) restyled` : 'nothing to restyle'}.`);
    }
}

/** Group edits into a `2 radius, 1 shadow, 1 import` style summary. */
function summarizeEdits(edits) {
    const counts = {};
    for (const e of edits) counts[e.family] = (counts[e.family] || 0) + 1;
    return Object.entries(counts)
        .map(([fam, n]) => `${n} ${fam}`)
        .join(', ');
}

/**
 * `infer` — derive/audit the ruleset from baseline<->fork diffs, scoped to the
 * known token vocabulary. Default: report drift (raw member tokens still in the
 * fork that the ruleset would rewrite) + confirmed substitutions. `--emit`:
 * print a proposed ruleset to stdout (review/paste; never written).
 */
function cmdInfer(pkg, names, opts) {
    const ruleset = loadRuleset();
    const targets = resolveTargets(pkg, names, opts.all);
    // family -> Set(member cores observed as raw->-ui in the fork)
    const observed = {};
    const scopeOnly = {}; // family -> Set(fileBase that carries the -ui replacement)
    let uncovered = 0;

    for (const name of targets) {
        const baselineAbs = baselinePath(pkg, name);
        const fork = forkPath(pkg, name);
        if (!existsSync(fork)) {
            console.log(`  ${name}: no fork file — skipped.`);
            continue;
        }
        // Compute each token's core once (not per-family) — {token, core} pairs.
        const forkCores = classTokens(readFileSync(fork, 'utf8')).map((tok) => ({
            tok,
            core: splitClassToken(tok).core,
        }));
        const baseCores = existsSync(baselineAbs)
            ? classTokens(readFileSync(baselineAbs, 'utf8')).map((tok) => splitClassToken(tok).core)
            : null;
        const forkCoreSet = new Set(forkCores.map((t) => t.core));

        const drift = [];
        const confirmed = [];
        for (const [family, fam] of Object.entries(ruleset.families || {})) {
            const members = fam.members || [];
            const inScope = !fam.scope?.only || fam.scope.only.includes(name);
            // Raw member tokens still present in the fork = uncovered drift.
            if (inScope) {
                for (const { tok, core } of forkCores) {
                    if (members.includes(core)) drift.push(tok);
                }
            }
            // Fork carries the replacement but baseline had a raw member = confirmed.
            if (forkCoreSet.has(fam.replacement)) {
                (scopeOnly[family] ||= new Set()).add(name);
                if (baseCores) {
                    for (const core of baseCores) {
                        if (members.includes(core)) {
                            (observed[family] ||= new Set()).add(core);
                            confirmed.push(`${core}->${fam.replacement}`);
                        }
                    }
                }
            }
        }
        const driftNote = drift.length ? `, ${drift.length} uncovered (${uniq(drift).join(', ')})` : '';
        console.log(`  ${name}: ${confirmed.length} covered${driftNote}`);
        if (drift.length) uncovered++;
    }

    if (opts.emit) {
        console.log('\n# Proposed ruleset (review before adopting):');
        console.log(JSON.stringify(buildInferredRuleset(ruleset, observed, scopeOnly), null, 2));
    }
    if (uncovered) {
        console.log(`\n${uncovered} component(s) have uncovered drift.`);
        process.exitCode = 1;
    } else {
        console.log('\nno uncovered drift.');
    }
}

/** Extract the set of class tokens from all className strings in source. */
function classTokens(content) {
    const out = [];
    for (const { start, end } of tokenizeClassStrings(content)) {
        for (const tok of content.slice(start, end).split(/\s+/)) {
            if (tok) out.push(tok);
        }
    }
    return out;
}

/** Build an inferred ruleset object from observed member cores + scopes. */
function buildInferredRuleset(ruleset, observed, scopeOnly) {
    const families = {};
    for (const [family, fam] of Object.entries(ruleset.families || {})) {
        const members = uniq([...(observed[family] || [])]).sort();
        const entry = { replacement: fam.replacement, members };
        // Card-only style scoping is inferred from which files actually carry
        // the replacement (e.g. only `card` has border-ui).
        if (fam.scope?.only && scopeOnly[family]) {
            entry.scope = { only: [...scopeOnly[family]].sort() };
        }
        families[family] = entry;
    }
    return { version: ruleset.version, families, imports: ruleset.imports };
}

async function cmdAdvance(pkg, names, { all }) {
    const manifest = loadManifest(pkg);
    const ruleset = loadRuleset();
    const targets = resolveTargets(pkg, names, all);
    let advanced = 0;
    let refused = 0;

    for (const name of targets) {
        const fork = forkPath(pkg, name);
        if (!existsSync(fork)) {
            console.log(`  ${name}: no fork file — skipped.`);
            continue;
        }
        const forkContent = readFileSync(fork, 'utf8');
        if (hasConflictMarkers(forkContent)) {
            console.log(`  ${name}: REFUSED — unresolved conflict markers in ${forkRel(pkg, name)}.`);
            refused++;
            continue;
        }
        // Now that markers are resolved, normalize any raw shape tokens the manual
        // resolution kept (the conflicted-merge path skipped the auto-restyle that
        // clean merges get). Idempotent — a no-op after a clean merge.
        const { content: normalized, edits } = restyleContent(forkContent, ruleset, {
            fileBase: name,
            ...(pkg.relativizeImports ? { srcRoot: pkg.srcRoot, fromFile: fork } : {}),
        });
        if (edits.length) {
            writeFileSync(fork, normalized);
            console.log(`  ${name}: restyled ${edits.length} token(s) before advancing.`);
        }
        const upstream = await fetchUpstream(pkg, name);
        if (!upstream) {
            console.log(`  ${name}: NOT FOUND upstream (404) — baseline left unchanged.`);
            continue;
        }
        const file = extractPrimaryFile(upstream.json, name);
        const theirs = normalizeContent(file.content);
        mkdirSync(pkg.baselineDir, { recursive: true });
        writeFileSync(baselinePath(pkg, name), theirs);
        manifest.components[name] = manifestEntry(upstream, file, sha256(theirs));
        console.log(`  ${name}: baseline advanced to current upstream.`);
        advanced++;
    }

    saveManifest(pkg, manifest);
    console.log(`\nAdvanced ${advanced} baseline(s)${refused ? `, refused ${refused}` : ''}.`);
    if (refused) process.exitCode = 1;
}

function cmdDiff(pkg, names, { all }) {
    const targets = resolveTargets(pkg, names, all);
    for (const name of targets) {
        const baselineAbs = baselinePath(pkg, name);
        const fork = forkPath(pkg, name);
        if (!existsSync(baselineAbs)) {
            console.log(`# ${name}: no baseline — run \`sync ${name}\` first.\n`);
            continue;
        }
        if (!existsSync(fork)) {
            console.log(`# ${name}: no fork file.\n`);
            continue;
        }
        const diff = gitDiffNoIndex(baselineAbs, fork);
        console.log(`# ${name} — our customizations (baseline -> fork):`);
        console.log(diff.trim() ? diff : '(identical — no local customizations)\n');
    }
}

async function cmdStatus(pkg) {
    const manifest = loadManifest(pkg);
    const components = listForkComponents(pkg);
    console.log(`Package: ${pkg.alias}  Style: ${pkg.resolvedStyle}\n`);
    const rows = await Promise.all(
        components.map(async (name) => {
            const entry = manifest.components[name];
            if (!entry) return { name, state: 'no-baseline', detail: '' };
            const upstream = await fetchUpstream(pkg, name);
            if (!upstream) return { name, state: 'upstream-404', detail: 'removed/custom' };
            const file = extractPrimaryFile(upstream.json, name);
            const theirsSha = sha256(normalizeContent(file.content));
            return theirsSha === entry.contentSha256
                ? { name, state: 'up-to-date', detail: `synced ${entry.syncedAt}` }
                : { name, state: 'BEHIND', detail: `synced ${entry.syncedAt}` };
        })
    );
    for (const r of rows) {
        console.log(`  ${r.name.padEnd(18)} ${r.state.padEnd(13)} ${r.detail}`);
    }
    const behind = rows.filter((r) => r.state === 'BEHIND').map((r) => r.name);
    if (behind.length) console.log(`\n${behind.length} behind: ${behind.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

function manifestEntry(upstream, file, contentSha256) {
    return {
        url: upstream.url,
        contentSha256,
        syncedAt: new Date().toISOString().slice(0, 10),
        files: (upstream.json.files || []).map((f) => f.path),
        dependencies: upstream.json.dependencies || [],
    };
}

function forkRel(pkg, name) {
    const rel = relative(pkg.repoRoot, forkPath(pkg, name)).split(sep).join('/');
    return rel.startsWith('..') ? forkPath(pkg, name) : rel;
}

function summarize(report) {
    const parts = [];
    if (report.seeded.length) parts.push(`${report.seeded.length} seeded`);
    if (report.upToDate.length) parts.push(`${report.upToDate.length} up-to-date`);
    if (report.merged.length) parts.push(`${report.merged.length} merged clean`);
    if (report.conflicts.length) parts.push(`${report.conflicts.length} with conflicts`);
    if (report.skipped.length) parts.push(`${report.skipped.length} skipped`);
    console.log(`\n${parts.join(', ') || 'nothing to do'}.`);
    if (report.merged.length || report.conflicts.length) {
        console.log(
            'Next: review the merged fork file(s), run `pnpm lint && pnpm typecheck`, then `advance`.'
        );
    }
    if (report.conflicts.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
    const [command, ...rest] = argv;
    const names = [];
    const opts = {
        all: false,
        bootstrap: false,
        check: false,
        emit: false,
        path: undefined,
        package: DEFAULT_PACKAGE,
    };
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === '--all') opts.all = true;
        else if (arg === '--bootstrap') opts.bootstrap = true;
        else if (arg === '--check') opts.check = true;
        else if (arg === '--emit') opts.emit = true;
        else if (arg === '--path') opts.path = rest[++i];
        else if (arg.startsWith('--path=')) opts.path = arg.slice('--path='.length);
        else if (arg === '--package') opts.package = rest[++i];
        else if (arg.startsWith('--package=')) opts.package = arg.slice('--package='.length);
        else if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
        else names.push(arg);
    }
    return { command, names, opts };
}

async function main() {
    const { command, names, opts } = parseArgs(process.argv.slice(2));
    if (!command || command === 'help' || command === '--help') {
        console.log(
            'Usage: sync.mjs <sync|restyle|infer|diff|advance|status> [names...|--all] ' +
                '[--path <file|dir>] [--package <pkg>] [--bootstrap] [--check] [--emit]'
        );
        return;
    }

    // `restyle --path` may point anywhere (a brand-new component, a flattened
    // customer repo) — resolve the context by discovering `components.json` from
    // that path, NOT from the (defaulted) package alias. Without `--path` the
    // back-compat alias (default `storefront-ui`) selects the package.
    const startDir = opts.path ? dirname(resolve(opts.path)) : process.cwd();
    const pkg = resolveContext({
        packageAlias: opts.path ? undefined : opts.package,
        startDir,
    });

    switch (command) {
        case 'sync':
            await cmdSync(pkg, names, opts);
            break;
        case 'restyle':
            cmdRestyle(pkg, names, opts);
            break;
        case 'infer':
            cmdInfer(pkg, names, opts);
            break;
        case 'advance':
            await cmdAdvance(pkg, names, opts);
            break;
        case 'diff':
            cmdDiff(pkg, names, opts);
            break;
        case 'status':
            await cmdStatus(pkg);
            break;
        default:
            throw new Error(`unknown command: ${command}`);
    }
}

// Only run the CLI when executed directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main().catch((e) => {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    });
}
