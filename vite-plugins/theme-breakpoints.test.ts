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
import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_REQUIRED_BREAKPOINTS,
    loadThemeBreakpoints,
    THEME_BREAKPOINTS_MODULE_ID,
    themeBreakpoints,
} from './theme-breakpoints';

const TAILWIND_DEFAULTS = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' };

let dir: string;

function writeCss(name: string, content: string): string {
    const file = join(dir, name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'theme-breakpoints-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('loadThemeBreakpoints', () => {
    it('returns the Tailwind defaults when the theme declares no breakpoints', async () => {
        const entry = writeCss('index.css', `@import 'tailwindcss' source(none);`);

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual(TAILWIND_DEFAULTS);
    });

    it('applies overrides and additions declared via @theme', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);
@theme { --breakpoint-2xl: 100rem; --breakpoint-3xl: 120rem; }`
        );

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ ...TAILWIND_DEFAULTS, '2xl': '100rem', '3xl': '120rem' });
    });

    it('removes a single default set to `initial`', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);
@theme { --breakpoint-2xl: initial; }`
        );

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem' });
    });

    it('replaces all defaults with `--breakpoint-*: initial`', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);
@theme { --breakpoint-*: initial; --breakpoint-tablet: 40rem; --breakpoint-desktop: 80rem; }`
        );

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ tablet: '40rem', desktop: '80rem' });
    });

    it('follows relative @import chains and reports every stylesheet it read', async () => {
        const entry = writeCss(
            'theme/index.css',
            `@import 'tailwindcss' source(none);\n@import './nested/tokens.css';`
        );
        const tokens = writeCss('theme/nested/tokens.css', `@theme { --breakpoint-xs: 30rem; }`);

        const { breakpoints, files } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ xs: '30rem', ...TAILWIND_DEFAULTS });
        expect(files).toContain(entry);
        expect(files).toContain(tokens);
    });

    describe('bare package imports', () => {
        function writePackage(name: string, manifest: object, files: Record<string, string>) {
            writeCss(`node_modules/${name}/package.json`, JSON.stringify({ name, ...manifest }));
            for (const [file, content] of Object.entries(files)) {
                writeCss(`node_modules/${name}/${file}`, content);
            }
        }

        const kit = (name: string, rem: number) => `@theme { --breakpoint-${name}: ${rem}rem; }`;

        it('selects the `style` export condition', async () => {
            writePackage(
                'css-kit',
                { exports: { '.': { style: './dist/kit.css', default: './dist/kit.js' } } },
                { 'dist/kit.css': '@theme { --breakpoint-kit: 33rem; }' }
            );
            const entry = writeCss('theme/index.css', `@import 'css-kit';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ kit: '33rem' });
        });

        it('resolves string exports and package subpaths, including scoped packages', async () => {
            writePackage(
                '@scope/css-kit',
                { exports: { '.': './index.css', './extra': { style: './extra.css' } } },
                { 'index.css': '@theme { --breakpoint-a: 10rem; }', 'extra.css': '@theme { --breakpoint-b: 20rem; }' }
            );
            const entry = writeCss('theme/index.css', `@import '@scope/css-kit';\n@import '@scope/css-kit/extra';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '10rem', b: '20rem' });
        });

        it('falls back to the `style`/`main` field and plain subpaths when there is no matching export', async () => {
            writePackage('legacy-kit', { main: './legacy.css' }, { 'legacy.css': '@theme { --breakpoint-l: 11rem; }' });
            writePackage('legacy-kit2', { style: './s.css' }, { 's.css': '@theme { --breakpoint-s: 12rem; }' });
            writePackage('legacy-kit3', {}, { 'sub/x.css': '@theme { --breakpoint-x: 13rem; }' });
            writePackage('legacy-kit4', {}, { 'index.css': '@theme { --breakpoint-i: 14rem; }' });
            const entry = writeCss(
                'index.css',
                `@import 'legacy-kit';\n@import 'legacy-kit2';\n@import 'legacy-kit3/sub/x.css';\n@import 'legacy-kit4';`
            );

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({
                l: '11rem',
                s: '12rem',
                x: '13rem',
                i: '14rem',
            });
        });

        it('resolves a top-level string `exports` and a bare condition map', async () => {
            writePackage(
                'str-kit',
                { exports: './dist/kit.css', main: './index.js' },
                { 'dist/kit.css': kit('a', 10) }
            );
            writePackage(
                'cond-kit',
                { exports: { style: './dist/c.css', default: './dist/c.js' } },
                { 'dist/c.css': kit('b', 20) }
            );
            const entry = writeCss('index.css', `@import 'str-kit';\n@import 'cond-kit';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '10rem', b: '20rem' });
        });

        it('resolves subpath patterns, preferring the longest matching prefix', async () => {
            writePackage(
                'pat-kit',
                { exports: { './*': './dist/*', './themes/*.css': { style: './themes-dist/*.css' } } },
                { 'dist/bp.css': kit('a', 10), 'themes-dist/dark.css': kit('b', 20) }
            );
            const entry = writeCss('index.css', `@import 'pat-kit/bp.css';\n@import 'pat-kit/themes/dark.css';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '10rem', b: '20rem' });
        });

        it('tries conditions in the order the package declares them', async () => {
            writePackage(
                'order-kit',
                { exports: { '.': { default: './b.css', style: './a.css' } } },
                { 'a.css': kit('a', 10), 'b.css': kit('b', 20) }
            );
            const entry = writeCss('index.css', `@import 'order-kit';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ b: '20rem' });
        });

        it('resolves nested conditions and takes the first usable entry of a fallback list', async () => {
            writePackage(
                'nested-kit',
                {
                    exports: {
                        '.': { import: './no.js', style: { default: './a.css' } },
                        './list': [{ import: './no.js' }, null, './b.css'],
                    },
                },
                { 'a.css': kit('a', 10), 'b.css': kit('b', 20) }
            );
            const entry = writeCss('index.css', `@import 'nested-kit';\n@import 'nested-kit/list';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '10rem', b: '20rem' });
        });

        it('lets the longer key win among patterns with the same prefix, whatever their order', async () => {
            writePackage(
                'tie-kit',
                {
                    exports: {
                        './a/*': './generic/*',
                        './a/*.css': './specific/*.css',
                        './a/*s': './third/*s',
                    },
                },
                { 'generic/x.css': kit('g', 10), 'specific/x.css': kit('s', 20), 'third/x.css': kit('t', 30) }
            );
            const entry = writeCss('index.css', `@import 'tie-kit/a/x.css';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ s: '20rem' });
        });

        it('falls back to the `style`/`main` fields only when the package has no `exports`', async () => {
            writePackage('null-kit', { exports: null, main: './m.css' }, { 'm.css': kit('m', 10) });
            const entry = writeCss('index.css', `@import 'null-kit';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ m: '10rem' });
        });

        it.each([
            ['exports a wildcard', { exports: { './*': './*' } }],
            ['has no `exports`', {}],
        ])('rejects an import that climbs out of a package that %s', async (_, manifest) => {
            writePackage('open-kit', manifest, {});
            writeCss('node_modules/outside.css', kit('a', 10));
            const entry = writeCss('index.css', `@import 'open-kit/../outside.css';`);

            await expect(loadThemeBreakpoints(entry)).rejects.toThrow(/resolves outside package "open-kit"/);
        });

        it('accepts a file inside the package whose name merely starts with dots', async () => {
            writePackage('dot-kit', { exports: { './*': './*' } }, { '..dots.css': kit('a', 10) });
            const entry = writeCss('index.css', `@import 'dot-kit/..dots.css';`);

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '10rem' });
        });

        describe('rejects a subpath the package does not export', () => {
            it.each([
                ['no key or pattern matches', { './a/*.css': './a/*.css', './*.js': './*.js' }, 'plain.css'],
                ['a pattern would match nothing', { './theme*.css': './dist/theme*.css' }, 'theme.css'],
                ['a key has several `*`', { './*/*': './x/*' }, 'a/b'],
                ['a fallback list has no usable entry', { './x.css': [{ import: './no.js' }] }, 'x.css'],
                [
                    'a list of `null`s precedes a usable condition',
                    { './x.css': { style: [null], default: './y.css' } },
                    'x.css',
                ],
                ['a fallback list holds only `null`s', { './x.css': [null, { import: './no.js' }, null] }, 'x.css'],
                ['the longest match is `null`', { './*': './*', './internal/*': null }, 'internal/x.css'],
                ['a condition map has no usable condition', { './x.css': { import: './no.js' } }, 'x.css'],
                ['the package exports a single target', './index.css', 'sub.css'],
                ['the package exports a bare condition map', { style: './index.css' }, 'sub.css'],
            ])('when %s', async (_, exports, subpath) => {
                writePackage('strict-kit', { exports }, { [subpath]: kit('a', 10), 'index.css': kit('b', 20) });
                const entry = writeCss('index.css', `@import 'strict-kit/${subpath}';`);

                await expect(loadThemeBreakpoints(entry)).rejects.toThrow(
                    `"strict-kit/${subpath}" is not exported by package "strict-kit"`
                );
            });
        });

        it('rejects when the package is not installed', async () => {
            const entry = writeCss('index.css', `@import 'not-installed-css-kit';`);

            await expect(loadThemeBreakpoints(entry)).rejects.toThrow(/not-installed-css-kit/);
        });
    });

    it('ignores JS `@plugin` and `@config` directives instead of failing', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);
@plugin './my-plugin.js';
@config './tailwind.config.js';
@theme { --breakpoint-3xl: 120rem; }`
        );

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ ...TAILWIND_DEFAULTS, '3xl': '120rem' });
    });

    it('accepts `@plugin` with options', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);\n@plugin './my-plugin.js' { themes: light; }`
        );

        expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual(TAILWIND_DEFAULTS);
    });

    it('resolves root-absolute `@import`s against `root`, falling back to the filesystem path', async () => {
        const rooted = writeCss('src/rooted.css', `@theme { --breakpoint-r: 10rem; }`);
        const absolute = writeCss('elsewhere/abs.css', `@theme { --breakpoint-a: 20rem; }`);
        const entry = writeCss('index.css', `@import '/src/rooted.css';\n@import '${absolute}';`);

        const { breakpoints, files } = await loadThemeBreakpoints(entry, { root: dir });

        expect(breakpoints).toEqual({ r: '10rem', a: '20rem' });
        expect(files).toEqual(expect.arrayContaining([rooted, absolute]));
    });

    it('treats root-absolute `@import`s as filesystem paths when no `root` is given', async () => {
        const absolute = writeCss('elsewhere/abs.css', `@theme { --breakpoint-a: 20rem; }`);
        const entry = writeCss('index.css', `@import '${absolute}';`);

        expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({ a: '20rem' });
    });

    it('reads breakpoints under a configured Tailwind prefix', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' prefix(tw) source(none);
@theme { --breakpoint-3xl: 120rem; }`
        );

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(breakpoints).toEqual({ ...TAILWIND_DEFAULTS, '3xl': '120rem' });
    });

    it.each(['calc(40rem + 1px)', 'var(--x)', '40', '40vw'])('rejects the unsupported value `%s`', async (value) => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);\n@theme { --breakpoint-sm: ${value}; }`
        );

        await expect(loadThemeBreakpoints(entry)).rejects.toThrow(/--breakpoint-sm.*px, rem or em/);
    });

    it.each(['.5rem', '40.5px', '48em', '0px'])('accepts the value `%s`', async (value) => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);\n@theme { --breakpoint-sm: ${value}; }`
        );

        expect((await loadThemeBreakpoints(entry)).breakpoints.sm).toBe(value);
    });

    it('rejects a very long malformed length in linear time', async () => {
        const entry = writeCss(
            'index.css',
            `@import 'tailwindcss' source(none);\n@theme { --breakpoint-sm: ${'1'.repeat(200_000)}x; }`
        );
        const start = performance.now();

        await expect(loadThemeBreakpoints(entry)).rejects.toThrow(/--breakpoint-sm/);

        // A backtracking pattern needs ~15 s for this input, a linear one a fraction of a second.
        expect(performance.now() - start).toBeLessThan(4_000);
    });

    it('ignores other theme variables', async () => {
        const entry = writeCss('index.css', `@import 'tailwindcss' source(none);\n@theme { --color-brand: red; }`);

        const { breakpoints } = await loadThemeBreakpoints(entry);

        expect(Object.keys(breakpoints)).toEqual(Object.keys(TAILWIND_DEFAULTS));
    });

    describe('required breakpoints', () => {
        const withoutLg = `@import 'tailwindcss' source(none);\n@theme { --breakpoint-lg: initial; --breakpoint-xl: initial; }`;

        it('rejects with every missing name and the stylesheet', async () => {
            const entry = writeCss('index.css', withoutLg);

            await expect(loadThemeBreakpoints(entry, { required: ['md', 'lg', 'xl'] })).rejects.toThrow(
                /index\.css.*missing required breakpoints: --breakpoint-lg, --breakpoint-xl/
            );
        });

        it('accepts a theme that defines them', async () => {
            const entry = writeCss('index.css', withoutLg);

            expect((await loadThemeBreakpoints(entry, { required: ['sm', 'md'] })).breakpoints).toEqual({
                sm: '40rem',
                md: '48rem',
                '2xl': '96rem',
            });
        });

        it('does not mistake inherited object properties for defined breakpoints', async () => {
            const entry = writeCss('index.css', `@import 'tailwindcss' source(none);`);

            await expect(loadThemeBreakpoints(entry, { required: ['toString'] })).rejects.toThrow(
                /missing required breakpoints: --breakpoint-toString/
            );
        });

        it('requires nothing by default', async () => {
            const entry = writeCss(
                'index.css',
                `@import 'tailwindcss' source(none);\n@theme { --breakpoint-*: initial; }`
            );

            expect((await loadThemeBreakpoints(entry)).breakpoints).toEqual({});
        });

        it('names the prefixed variable when a prefix is configured', async () => {
            const entry = writeCss(
                'index.css',
                `@import 'tailwindcss' prefix(tw) source(none);\n@theme { --breakpoint-lg: initial; }`
            );

            await expect(loadThemeBreakpoints(entry, { required: ['lg'] })).rejects.toThrow(/--tw-breakpoint-lg/);
        });
    });

    it('rejects when the entry stylesheet does not exist', async () => {
        await expect(loadThemeBreakpoints(join(dir, 'missing.css'))).rejects.toThrow(/missing\.css/);
    });
});

describe('themeBreakpoints plugin', () => {
    const VIRTUAL_ID = `\0${THEME_BREAKPOINTS_MODULE_ID}`;

    type Environment = ReturnType<typeof environment>;

    function environment(name: string) {
        return {
            name,
            hot: { send: vi.fn() },
            moduleGraph: {
                getModuleById: vi.fn((id: string) => (id === VIRTUAL_ID ? { id } : undefined)),
                invalidateModule: vi.fn(),
            },
        };
    }

    function pluginFor(entry: string, root?: string, required?: string[]) {
        const plugin = themeBreakpoints({ entry, ...(required && { required }) }) as Plugin & {
            configResolved: (config: { root: string }) => void;
            resolveId: (id: string) => string | undefined;
            load: (
                this: { addWatchFile: (f: string) => void; environment: Environment },
                id: string
            ) => Promise<string | undefined>;
            hotUpdate: (this: { environment: Environment }, options: { file: string }) => Promise<void>;
        };
        if (root) {
            plugin.configResolved({ root });
        }
        return {
            plugin,
            load: (env: Environment, addWatchFile = vi.fn()) =>
                plugin.load.call({ addWatchFile, environment: env }, VIRTUAL_ID),
            hotUpdate: (env: Environment, file: string) => plugin.hotUpdate.call({ environment: env }, { file }),
        };
    }

    it('resolves only its own virtual module id', () => {
        const { plugin } = pluginFor(join(dir, 'index.css'));

        expect(plugin.resolveId(THEME_BREAKPOINTS_MODULE_ID)).toBe(VIRTUAL_ID);
        expect(plugin.resolveId('some-other-module')).toBeUndefined();
    });

    it('serves the resolved breakpoints as the default export and watches every stylesheet', async () => {
        const entry = writeCss('index.css', `@import 'tailwindcss' source(none);\n@import './tokens.css';`);
        const tokens = writeCss('tokens.css', `@theme { --breakpoint-3xl: 120rem; }`);
        const addWatchFile = vi.fn();

        const code = await pluginFor(entry).load(environment('client'), addWatchFile);

        expect(code).toBe(`export default ${JSON.stringify({ ...TAILWIND_DEFAULTS, '3xl': '120rem' })};`);
        expect(addWatchFile).toHaveBeenCalledWith(entry);
        expect(addWatchFile).toHaveBeenCalledWith(tokens);
    });

    it('resolves root-absolute `@import`s against the Vite root', async () => {
        writeCss('theme/tokens.css', `@theme { --breakpoint-3xl: 120rem; }`);
        const entry = writeCss('index.css', `@import 'tailwindcss' source(none);\n@import '/theme/tokens.css';`);

        const code = await pluginFor(entry, dir).load(environment('client'));

        expect(code).toContain('"3xl":"120rem"');
    });

    describe('required breakpoints', () => {
        const withoutLg = () =>
            writeCss('index.css', `@import 'tailwindcss' source(none);\n@theme { --breakpoint-lg: initial; }`);

        it('fails to load when the theme lacks a breakpoint the template code needs', async () => {
            await expect(pluginFor(withoutLg()).load(environment('client'))).rejects.toThrow(/--breakpoint-lg/);
        });

        it('loads when `required` lists only breakpoints the theme defines', async () => {
            const code = await pluginFor(withoutLg(), undefined, ['md']).load(environment('client'));

            expect(code).not.toContain('"lg"');
        });

        it('checks nothing when `required` is empty', async () => {
            await expect(pluginFor(withoutLg(), undefined, []).load(environment('client'))).resolves.toBeDefined();
        });
    });

    it('does not load unrelated modules', async () => {
        const { plugin } = pluginFor(join(dir, 'index.css'));

        expect(
            await plugin.load.call({ addWatchFile: vi.fn(), environment: environment('client') }, '/src/app.tsx')
        ).toBeUndefined();
    });

    describe('hotUpdate', () => {
        const themeCss = (extra = '') => `@import 'tailwindcss' source(none);\n@import './tokens.css';${extra}`;
        const tokensCss = (breakpoint = '120rem', color = 'red') =>
            `@theme { --breakpoint-3xl: ${breakpoint}; --color-brand: ${color}; }`;

        /** A plugin that has served the breakpoints to a client environment. */
        async function servedPlugin(entryPath = 'index.css') {
            const entry = writeCss(entryPath, themeCss());
            const tokens = writeCss('tokens.css', tokensCss());
            const subject = pluginFor(entry);
            const client = environment('client');
            await subject.load(client);
            return { ...subject, client, entry, tokens };
        }

        function expectReloaded(env: Environment) {
            expect(env.moduleGraph.invalidateModule).toHaveBeenCalledWith({ id: VIRTUAL_ID });
            expect(env.hot.send).toHaveBeenCalledWith({ type: 'full-reload' });
        }

        function expectUntouched(env: Environment) {
            expect(env.moduleGraph.invalidateModule).not.toHaveBeenCalled();
            expect(env.hot.send).not.toHaveBeenCalled();
        }

        it('reloads the page when an imported stylesheet changes the breakpoints', async () => {
            const { hotUpdate, client, tokens } = await servedPlugin();
            writeCss('tokens.css', tokensCss('130rem'));

            await hotUpdate(client, tokens);

            expectReloaded(client);
        });

        it('reloads the page when the entry stylesheet changes the breakpoints', async () => {
            const { hotUpdate, client, entry } = await servedPlugin();
            writeCss('index.css', themeCss('\n@theme { --breakpoint-4xl: 150rem; }'));

            await hotUpdate(client, entry);

            expectReloaded(client);
        });

        it('leaves other theme edits to Vite when the breakpoints are unchanged', async () => {
            const { hotUpdate, client, tokens } = await servedPlugin();
            writeCss('tokens.css', tokensCss('120rem', 'blue'));

            await hotUpdate(client, tokens);

            expectUntouched(client);
        });

        it('reloads once the breakpoints change after an edit that did not', async () => {
            const { hotUpdate, client, tokens } = await servedPlugin();
            writeCss('tokens.css', tokensCss('120rem', 'blue'));
            await hotUpdate(client, tokens);
            writeCss('tokens.css', tokensCss('140rem', 'blue'));

            await hotUpdate(client, tokens);

            expectReloaded(client);
        });

        it('recognises a stylesheet reported under its real path when it was reached through a symlink', async () => {
            const link = `${dir}-link`;
            symlinkSync(dir, link, 'junction');
            try {
                writeCss('index.css', themeCss());
                const tokens = writeCss('tokens.css', tokensCss());
                const subject = pluginFor(join(link, 'index.css'));
                const client = environment('client');
                await subject.load(client);
                writeCss('tokens.css', tokensCss('130rem'));

                await subject.hotUpdate(client, realpathSync(tokens));

                expectReloaded(client);
            } finally {
                unlinkSync(link);
            }
        });

        it('reloads when the theme no longer evaluates, so that the error is reported on load', async () => {
            const { hotUpdate, client, tokens } = await servedPlugin();
            writeCss('tokens.css', tokensCss('calc(1px + 1rem)'));

            await hotUpdate(client, tokens);

            expectReloaded(client);
        });

        describe('while the theme does not evaluate', () => {
            const brokenTokens = `@theme { --breakpoint-x: calc(1px + 70rem); }`;

            it('reloads again when a stylesheet imported by the breaking edit is fixed', async () => {
                const { hotUpdate, client, entry } = await servedPlugin();
                const extra = writeCss('extra.css', brokenTokens);
                writeCss('index.css', themeCss("\n@import './extra.css';"));
                await hotUpdate(client, entry);
                client.hot.send.mockClear();
                writeCss('extra.css', `@theme { --breakpoint-x: 70rem; }`);

                await hotUpdate(client, extra);

                expectReloaded(client);
            });

            it('reloads on recovery even when the breakpoints end up as they were', async () => {
                const { hotUpdate, client, tokens } = await servedPlugin();
                writeCss('tokens.css', tokensCss('calc(1px + 1rem)'));
                await hotUpdate(client, tokens);
                client.hot.send.mockClear();
                writeCss('tokens.css', tokensCss());

                await hotUpdate(client, tokens);

                expect(client.hot.send).toHaveBeenCalledWith({ type: 'full-reload' });
            });

            it('recovers from a theme that failed on first load once any stylesheet is fixed', async () => {
                const entry = writeCss('index.css', `@import 'tailwindcss' source(none);\n@import './tokens.css';`);
                const tokens = writeCss('tokens.css', brokenTokens);
                const subject = pluginFor(entry);
                const client = environment('client');
                await expect(subject.load(client)).rejects.toThrow(/--breakpoint-x/);
                writeCss('tokens.css', tokensCss());

                await subject.hotUpdate(client, tokens);

                expectReloaded(client);
            });

            it('stops treating every stylesheet as relevant once the theme evaluates again', async () => {
                const { hotUpdate, client, tokens } = await servedPlugin();
                writeCss('tokens.css', brokenTokens);
                await hotUpdate(client, tokens);
                writeCss('tokens.css', tokensCss());
                await hotUpdate(client, tokens);
                client.hot.send.mockClear();

                await hotUpdate(client, join(dir, 'other.css'));

                expect(client.hot.send).not.toHaveBeenCalled();
            });

            it('stops treating every stylesheet as relevant once a load succeeds', async () => {
                const entry = writeCss('index.css', themeCss());
                writeCss('tokens.css', brokenTokens);
                const subject = pluginFor(entry);
                const client = environment('client');
                await expect(subject.load(client)).rejects.toThrow(/--breakpoint-x/);
                writeCss('tokens.css', tokensCss());
                await subject.load(client);
                writeCss('tokens.css', brokenTokens);

                // An unrelated stylesheet is not even evaluated, so the theme breaking behind its back goes unnoticed.
                await subject.hotUpdate(client, join(dir, 'other.css'));

                expectUntouched(client);
            });

            it('reloads the page after a failure that only another environment saw', async () => {
                const entry = writeCss('index.css', themeCss());
                const tokens = writeCss('tokens.css', brokenTokens);
                const subject = pluginFor(entry);
                await expect(subject.load(environment('ssr'))).rejects.toThrow(/--breakpoint-x/);
                writeCss('tokens.css', tokensCss());
                const client = environment('client');

                await subject.hotUpdate(client, tokens);

                expectReloaded(client);
            });

            it('still ignores files that are not stylesheets', async () => {
                const { hotUpdate, client, tokens } = await servedPlugin();
                writeCss('tokens.css', brokenTokens);
                await hotUpdate(client, tokens);
                client.hot.send.mockClear();

                await hotUpdate(client, join(dir, 'app.tsx'));

                expect(client.hot.send).not.toHaveBeenCalled();
            });
        });

        it('invalidates other environments without sending a reload', async () => {
            const { plugin, hotUpdate, tokens } = await servedPlugin();
            const ssr = environment('ssr');
            await plugin.load.call({ addWatchFile: vi.fn(), environment: ssr }, VIRTUAL_ID);
            writeCss('tokens.css', tokensCss('130rem'));

            await hotUpdate(ssr, tokens);

            expect(ssr.moduleGraph.invalidateModule).toHaveBeenCalled();
            expect(ssr.hot.send).not.toHaveBeenCalled();
        });

        it('ignores environments that never served the breakpoints', async () => {
            const { hotUpdate, tokens } = await servedPlugin();
            const ssr = environment('ssr');
            writeCss('tokens.css', tokensCss('130rem'));

            await hotUpdate(ssr, tokens);

            expectUntouched(ssr);
        });

        it('ignores unrelated files', async () => {
            const { hotUpdate, client } = await servedPlugin();

            await hotUpdate(client, join(dir, 'other.css'));

            expectUntouched(client);
        });

        it('tolerates the virtual module not being in the graph', async () => {
            const { hotUpdate, client, tokens } = await servedPlugin();
            client.moduleGraph.getModuleById.mockReturnValue(undefined);
            writeCss('tokens.css', tokensCss('130rem'));

            await hotUpdate(client, tokens);

            expect(client.moduleGraph.invalidateModule).not.toHaveBeenCalled();
            expect(client.hot.send).toHaveBeenCalledWith({ type: 'full-reload' });
        });
    });
});

describe('DEFAULT_REQUIRED_BREAKPOINTS', () => {
    function sourceFiles(directory: string): string[] {
        return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                return sourceFiles(path);
            }
            return /\.tsx?$/.test(entry.name) && !/\.(test|spec|stories)\./.test(entry.name) ? [path] : [];
        });
    }

    it('lists exactly the breakpoints the template looks up with `minWidthQuery`', () => {
        const used = new Set(
            sourceFiles(join(__dirname, '../src')).flatMap((file) =>
                [...readFileSync(file, 'utf8').matchAll(/minWidthQuery\(\s*['"]([\w-]+)['"]/g)].map(([, name]) => name)
            )
        );

        expect([...used].sort()).toEqual([...DEFAULT_REQUIRED_BREAKPOINTS].sort());
    });
});
