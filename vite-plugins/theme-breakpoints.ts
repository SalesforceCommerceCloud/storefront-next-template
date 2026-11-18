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
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __unstable__loadDesignSystem } from 'tailwindcss';
import type { Plugin } from 'vite';

export const THEME_BREAKPOINTS_MODULE_ID = 'virtual:storefront-next/theme-breakpoints';
const RESOLVED_THEME_BREAKPOINTS_MODULE_ID = `\0${THEME_BREAKPOINTS_MODULE_ID}`;
const BREAKPOINT_NAMESPACE = '--breakpoint-';
/**
 * Breakpoints the template's own code looks up by name: `md` (load-more batch size, return dialog) and `lg`
 * (`isDesktopViewport()`). Keep in sync with the `minWidthQuery('…')` calls under `src/`; a test enforces it.
 */
export const DEFAULT_REQUIRED_BREAKPOINTS: readonly string[] = ['md', 'lg'];
/** The only units the image sizing and `matchMedia` code understands. */
const SUPPORTED_LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em)$/;

export interface ThemeBreakpoints {
    /** Breakpoint name (`sm`, `md`, ...) → CSS length exactly as declared in the theme (`40rem`). */
    breakpoints: Record<string, string>;
    /** Absolute paths of every stylesheet read while resolving the theme, entry included. */
    files: string[];
}

/** A package `exports` value: a path, `null` (not exported), a list of fallbacks, or a map of conditions. */
type ExportTarget = string | null | ExportTarget[] | { [condition: string]: ExportTarget };

/** The conditions a stylesheet import matches, as in `@tailwindcss/vite`: `style`, and the always-on `default`. */
const CONDITIONS = new Set(['style', 'default']);

/**
 * Resolves an `exports` target the way Node does: conditions are tried in the order the package declares them, a list
 * yields its first usable entry, and `null` blocks the path. `match` is what a subpath pattern's `*` stood for.
 *
 * @returns The path, `null` when the target blocks the path, or `undefined` when no condition matches.
 */
function resolveTarget(target: ExportTarget, match?: string): string | null | undefined {
    if (typeof target === 'string') {
        return match === undefined ? target : target.replaceAll('*', match);
    }
    if (target === null) {
        return null;
    }
    if (Array.isArray(target)) {
        // A `null` entry is skipped like any other unusable one; the list blocks the path only if nothing else resolves.
        let blocked = false;
        for (const entry of target) {
            const resolved = resolveTarget(entry, match);
            if (typeof resolved === 'string') {
                return resolved;
            }
            blocked ||= resolved === null;
        }
        return blocked ? null : undefined;
    }
    for (const [condition, value] of Object.entries(target)) {
        const resolved = CONDITIONS.has(condition) ? resolveTarget(value, match) : undefined;
        if (resolved !== undefined) {
            return resolved;
        }
    }
    return undefined;
}

/**
 * Looks `subpath` (`.` or `./x`) up in a package's `exports` like Node: an exact key wins over any pattern, and among
 * `*` patterns the longer prefix wins, then the longer key. A `*` must stand for at least one character.
 */
function resolveExports(exports: ExportTarget, subpath: string): string | null | undefined {
    const subpathMap =
        typeof exports === 'object' &&
        exports !== null &&
        !Array.isArray(exports) &&
        Object.keys(exports).some((key) => key.startsWith('.'));
    if (!subpathMap) {
        return subpath === '.' ? resolveTarget(exports) : undefined;
    }
    const map = exports as Record<string, ExportTarget>;
    if (Object.hasOwn(map, subpath) && !subpath.includes('*')) {
        return resolveTarget(map[subpath]);
    }
    let best: { key: string; prefix: string; suffix: string } | undefined;
    for (const key of Object.keys(map)) {
        const star = key.indexOf('*');
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        const matches =
            star !== -1 &&
            star === key.lastIndexOf('*') &&
            subpath.length >= key.length &&
            subpath.startsWith(prefix) &&
            subpath.endsWith(suffix);
        const beatsBest =
            !best ||
            prefix.length > best.prefix.length ||
            (prefix.length === best.prefix.length && key.length > best.key.length);
        if (matches && beatsBest) {
            best = { key, prefix, suffix };
        }
    }
    return best && resolveTarget(map[best.key], subpath.slice(best.prefix.length, subpath.length - best.suffix.length));
}

/** Walks up from `from` to the nearest `node_modules/<name>` directory, or `undefined` when there is none. */
function findPackageDirectory(name: string, from: string): string | undefined {
    for (let dir = from; ; dir = dirname(dir)) {
        const candidate = join(dir, 'node_modules', name);
        if (existsSync(join(candidate, 'package.json'))) {
            return candidate;
        }
        if (dirname(dir) === dir) {
            return undefined;
        }
    }
}

/**
 * Resolves a bare `@import` (`tailwindcss`, `tw-animate-css`, `tailwindcss/theme.css`) to a stylesheet inside the
 * installed package. Packages with `exports` are resolved like Node does, but selecting the `style` condition CSS
 * packages use (Node's own resolver cannot); a subpath the package does not export is an error. Packages without
 * `exports` fall back to `style`, `main` or `index.css`.
 */
function resolvePackageStylesheet(id: string, base: string): string {
    const segments = id.split('/');
    const nameLength = id.startsWith('@') ? 2 : 1;
    const name = segments.slice(0, nameLength).join('/');
    const subpath = segments.slice(nameLength).join('/');
    // Prefer the importing stylesheet's own node_modules, then this package's (where `tailwindcss` is installed).
    const directory =
        findPackageDirectory(name, base) ?? findPackageDirectory(name, dirname(fileURLToPath(import.meta.url)));
    if (!directory) {
        throw new Error(`Cannot resolve stylesheet package "${name}" imported from ${base}`);
    }
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
        exports?: ExportTarget;
        style?: string;
        main?: string;
    };

    let file: string;
    if (manifest.exports != null) {
        const target = resolveExports(manifest.exports, subpath ? `./${subpath}` : '.');
        if (!target) {
            throw new Error(`"${id}" is not exported by package "${name}" (imported from ${base})`);
        }
        file = resolve(directory, target);
    } else {
        file = resolve(directory, subpath || manifest.style || manifest.main || 'index.css');
    }
    const fromPackage = relative(directory, file);
    if (fromPackage === '..' || fromPackage.startsWith(`..${sep}`) || isAbsolute(fromPackage)) {
        throw new Error(`"${id}" resolves outside package "${name}" (imported from ${base})`);
    }
    return file;
}

/**
 * Resolves an `@import` of a theme stylesheet: root-absolute like Vite (`/src/x.css` under `root`), a filesystem path
 * (absolute, or relative to the importer), or a package.
 */
function resolveStylesheet(id: string, base: string, root: string | undefined): string {
    const rooted = root && id.startsWith('/') ? join(root, id) : undefined;
    if (rooted && existsSync(rooted)) {
        return rooted;
    }
    if (isAbsolute(id)) {
        return id;
    }
    return id.startsWith('.') ? resolve(base, id) : resolvePackageStylesheet(id, base);
}

/**
 * Stand-in for a JS `@plugin`. Tailwind accepts options (`@plugin 'x' { … }`) only for plugins marked as options
 * functions, and calls those to obtain the plugin definition, so this one yields a plugin whose handler does nothing.
 */
const ignoredPlugin = Object.assign(() => ({ handler: () => undefined }), { __isOptionsFunction: true as const });

/**
 * Evaluates the theme the way Tailwind does and returns its `--breakpoint-*` theme variables, so image sizing reads the
 * same breakpoints the `sm:`/`md:`/… utilities are generated from — including `@theme` overrides, additions,
 * `--breakpoint-*: initial` resets and a configured `prefix(...)`.
 *
 * Only CSS is evaluated: breakpoints declared by a JS `@plugin` or `@config` are not seen (those directives are
 * accepted, with or without options, and ignored). Stylesheet `@import`s must be relative, root-absolute, absolute or
 * package paths; `@/` aliases are not resolved. Values must be `px`, `rem` or `em` lengths.
 *
 * Relies on `tailwindcss`' `__unstable__loadDesignSystem`; the template pins `tailwindcss` exactly, and
 * `theme-breakpoints.test.ts` fails if the resolved shape changes.
 *
 * @param entry - Absolute path of the theme's entry stylesheet (the one that `@import`s `tailwindcss`).
 * @param options.root - Project root that root-absolute `@import`s (`/src/theme/x.css`) are resolved against.
 * @param options.required - Breakpoint names the theme must define; evaluation fails when one is missing.
 */
export async function loadThemeBreakpoints(
    entry: string,
    { root, required = [] }: { root?: string; required?: readonly string[] } = {}
): Promise<ThemeBreakpoints> {
    const files = [entry];
    const css = await readFile(entry, 'utf8');

    const designSystem = await __unstable__loadDesignSystem(css, {
        base: dirname(entry),
        async loadStylesheet(id, base) {
            const path = resolveStylesheet(id, base, root);
            files.push(path);
            return { path, base: dirname(path), content: await readFile(path, 'utf8') };
        },
        // JS plugins and configs cannot contribute CSS theme variables we could read here; skip them instead of
        // letting `@plugin`/`@config` abort the whole evaluation.
        loadModule: (id, base, resourceHint) =>
            Promise.resolve({ path: id, base, module: resourceHint === 'config' ? {} : ignoredPlugin }),
    });

    const namespace = designSystem.theme.prefixKey(BREAKPOINT_NAMESPACE);
    const breakpoints = Object.fromEntries(
        [...designSystem.theme.entries()]
            .filter(([key]) => key.startsWith(namespace))
            .map(([key, { value }]) => {
                const name = key.slice(namespace.length);
                if (!SUPPORTED_LENGTH.test(value)) {
                    throw new Error(
                        `${namespace}${name}: ${value} is not supported. Breakpoints must be px, rem or em lengths (${entry}).`
                    );
                }
                return [name, value];
            })
    );

    const missing = required.filter((name) => !Object.hasOwn(breakpoints, name));
    if (missing.length > 0) {
        throw new Error(
            `The theme (${entry}) is missing required breakpoints: ${missing.map((name) => `${namespace}${name}`).join(', ')}. Define them, or change the \`required\` option of themeBreakpoints().`
        );
    }

    return { breakpoints, files };
}

/** Forward-slash form of a path, which is how Vite reports file names on every platform. */
function normalizePath(file: string): string {
    return posix.normalize(file.replaceAll('\\', '/'));
}

/** Keys under which Vite may report `file`: normalised (forward slashes) and with symlinks resolved. */
function watchKeys(file: string): string[] {
    return [...new Set([normalizePath(file), normalizePath(realpathSync(file))])];
}

/**
 * Vite plugin exposing the active theme's Tailwind breakpoints as `virtual:storefront-next/theme-breakpoints`
 * (default export: `Record<string, string>`), for code that needs the same breakpoints as the CSS (responsive image
 * `sizes`, `matchMedia` queries). Stylesheets read while resolving the theme are watched; in dev, a change to one of
 * them reloads the page when the resulting breakpoints differ or the theme starts or stops evaluating, so other theme
 * edits keep hot-updating.
 *
 * Fails when the theme module is loaded (the build, or the first dev request for it) and the theme lacks a `required`
 * breakpoint, instead of letting the code that looks it up fail at runtime. While the theme does not evaluate, a change
 * to any `.css` file re-evaluates it, so fixing a stylesheet the plugin has not seen yet recovers it too.
 *
 * @param options.entry - Absolute path of the theme's entry stylesheet.
 * @param options.required - Breakpoint names the theme must define. Defaults to the ones the template code uses
 * (`md`, `lg`); list only the ones your code needs once you have replaced those usages (`[]` disables the check).
 */
export function themeBreakpoints({
    entry,
    required = DEFAULT_REQUIRED_BREAKPOINTS,
}: {
    entry: string;
    required?: readonly string[];
}): Plugin {
    let root: string | undefined;
    const watched = new Set<string>();
    /** Set while the theme does not evaluate: the stylesheets involved are then unknown, so any `.css` may fix it. */
    let broken = false;
    /**
     * Per Vite environment that requested the breakpoints: the serialized breakpoints last served, or `undefined`
     * when the last evaluation failed (so that recovering always reloads, even to identical breakpoints).
     */
    const served = new Map<string, string | undefined>();

    const watch = (files: string[]) => {
        watched.clear();
        for (const file of files) {
            for (const key of watchKeys(file)) {
                watched.add(key);
            }
        }
    };

    return {
        name: 'template:theme-breakpoints',
        configResolved(config) {
            root = config.root;
        },
        resolveId(id) {
            return id === THEME_BREAKPOINTS_MODULE_ID ? RESOLVED_THEME_BREAKPOINTS_MODULE_ID : undefined;
        },
        async load(id) {
            if (id !== RESOLVED_THEME_BREAKPOINTS_MODULE_ID) {
                return undefined;
            }
            const environment = this.environment.name;
            served.set(environment, undefined);
            let theme: ThemeBreakpoints;
            try {
                theme = await loadThemeBreakpoints(entry, { root, required });
            } catch (error) {
                broken = true;
                // The page may not have loaded the module yet (an SSR request failed first), but it must reload once fixed.
                served.set('client', undefined);
                throw error;
            }
            broken = false;
            watch(theme.files);
            for (const file of theme.files) {
                this.addWatchFile(file);
            }
            const code = JSON.stringify(theme.breakpoints);
            served.set(environment, code);
            return `export default ${code};`;
        },
        // The breakpoints are baked into dependants as plain values, and the stylesheet's own HMR update only restyles
        // the page, so a change that alters them reloads the page. An evaluation error also reloads, so that `load`
        // reports it.
        async hotUpdate({ file }) {
            const path = normalizePath(file);
            if (!watched.has(path) && !(broken && path.endsWith('.css'))) {
                return;
            }
            const { name, moduleGraph, hot } = this.environment;
            if (!served.has(name)) {
                return; // Nothing in this environment imported the breakpoints, so nothing can be stale.
            }
            try {
                const { breakpoints, files } = await loadThemeBreakpoints(entry, { root, required });
                watch(files);
                broken = false;
                if (JSON.stringify(breakpoints) === served.get(name)) {
                    return;
                }
            } catch {
                broken = true;
                served.set(name, undefined);
            }
            const virtualModule = moduleGraph.getModuleById(RESOLVED_THEME_BREAKPOINTS_MODULE_ID);
            if (virtualModule) {
                moduleGraph.invalidateModule(virtualModule);
            }
            if (name === 'client') {
                hot.send({ type: 'full-reload' });
            }
        },
    };
}
