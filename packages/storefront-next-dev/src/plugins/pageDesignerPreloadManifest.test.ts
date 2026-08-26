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

import { describe, expect, it, vi } from 'vitest';
import type { Rollup } from 'vite';
import type { ComponentInfo } from './staticRegistry';
import {
    buildPageDesignerPreloadManifest,
    createEmptyPageDesignerPreloadManifest,
    normalizePageDesignerPreloadManifestConfig,
    normalizeSourceId,
    parseViteManifestAsset,
    validateEmbeddedPageDesignerPreloadManifest,
    type ViteManifest,
} from './pageDesignerPreloadManifest';

type OutputFixture =
    | Pick<Rollup.OutputAsset, 'type' | 'fileName' | 'source'>
    | (Pick<Rollup.OutputChunk, 'type' | 'fileName' | 'code'> & Partial<Pick<Rollup.OutputChunk, 'modules'>>);

const outputBundle = (outputs: Record<string, OutputFixture>): Rollup.OutputBundle =>
    outputs as unknown as Rollup.OutputBundle;

const component = (id = 'Content.hero', filePath = '/app/src/components/hero.tsx'): ComponentInfo => ({
    id,
    filePath,
    relativePath: './components/hero',
    hasLoader: false,
    hasClientLoader: false,
    hasFallback: false,
});

const viteManifest: ViteManifest = {
    'src/components/hero.tsx': {
        file: 'assets/hero.js',
        src: 'src/components/hero.tsx',
        isDynamicEntry: true,
        imports: ['_vendor.js'],
        css: ['assets/hero.css'],
    },
    '_vendor.js': { file: 'assets/vendor.js' },
};
const bundle = outputBundle({
    'assets/hero.js': { type: 'chunk', fileName: 'assets/hero.js', code: 'export default 1' },
    'assets/vendor.js': { type: 'chunk', fileName: 'assets/vendor.js', code: 'export const x = 1' },
    'assets/hero.css': { type: 'asset', fileName: 'assets/hero.css', source: '.hero{color:red}' },
});

describe('Page Designer preload build manifest', () => {
    it('creates an empty manifest with normalized compression settings', () => {
        const config = normalizePageDesignerPreloadManifestConfig(true);

        expect(createEmptyPageDesignerPreloadManifest(config)).toEqual({
            version: 1,
            compression: config.compression,
            resources: [],
            components: {},
        });
    });

    it('correlates source, walks static imports and CSS, and produces deterministic sizes', () => {
        const config = normalizePageDesignerPreloadManifestConfig(true);
        const first = buildPageDesignerPreloadManifest([component()], viteManifest, bundle, '/app', config, vi.fn());
        const second = buildPageDesignerPreloadManifest([component()], viteManifest, bundle, '/app', config, vi.fn());
        expect(first).toEqual(second);
        expect(first.compression).toEqual({ brotli: { quality: 9 }, gzip: { level: 6 } });
        expect(first.resources.map(({ file, kind }) => ({ file, kind }))).toEqual([
            { file: 'assets/hero.css', kind: 'style' },
            { file: 'assets/hero.js', kind: 'module' },
            { file: 'assets/vendor.js', kind: 'module' },
        ]);
        expect(first.components['Content.hero']).toEqual({ styles: [0], entries: [1], dependencies: [2] });
        expect(first.resources[0].bytes).toBe(Buffer.byteLength('.hero{color:red}'));
    });

    it('preserves Vite dependency-first stylesheet order instead of sorting hashed filenames', () => {
        const result = buildPageDesignerPreloadManifest(
            [component()],
            {
                'src/components/hero.tsx': {
                    file: 'assets/hero.js',
                    src: 'src/components/hero.tsx',
                    isDynamicEntry: true,
                    imports: ['_base.js'],
                    css: ['assets/a-component.css'],
                },
                '_base.js': {
                    file: 'assets/base.js',
                    css: ['assets/z-dependency.css'],
                },
            },
            outputBundle({
                'assets/hero.js': { type: 'chunk', fileName: 'assets/hero.js', code: 'export default 1' },
                'assets/base.js': { type: 'chunk', fileName: 'assets/base.js', code: 'export const base = 1' },
                'assets/z-dependency.css': {
                    type: 'asset',
                    fileName: 'assets/z-dependency.css',
                    source: '.button{color:red}',
                },
                'assets/a-component.css': {
                    type: 'asset',
                    fileName: 'assets/a-component.css',
                    source: '.button{color:blue}',
                },
            }),
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );

        expect(result.components['Content.hero'].styles?.map((index) => result.resources[index].file)).toEqual([
            'assets/z-dependency.css',
            'assets/a-component.css',
        ]);
    });

    it('records eager components as non-preloadable', () => {
        const eager = {
            ...viteManifest,
            'src/components/hero.tsx': { ...viteManifest['src/components/hero.tsx'], isDynamicEntry: false },
        };
        const result = buildPageDesignerPreloadManifest(
            [component()],
            eager,
            bundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );
        expect(result.components['Content.hero']).toEqual({});
    });

    it('correlates a component merged into a shared chunk through Rollup module metadata', () => {
        const mergedManifest: ViteManifest = {
            shared: {
                file: 'assets/shared.js',
                imports: ['_vendor.js'],
                css: ['assets/hero.css'],
            },
            '_vendor.js': viteManifest['_vendor.js'],
        };
        const mergedBundle = outputBundle({
            'assets/shared.js': {
                type: 'chunk',
                fileName: 'assets/shared.js',
                code: 'export default 1',
                modules: { '/app/src/components/hero.tsx': {} as Rollup.RenderedModule },
            },
            'assets/vendor.js': bundle['assets/vendor.js'],
            'assets/hero.css': bundle['assets/hero.css'],
        });

        const result = buildPageDesignerPreloadManifest(
            [component()],
            mergedManifest,
            mergedBundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );

        expect(result.components['Content.hero']).toEqual({ styles: [0], entries: [1], dependencies: [2] });
    });

    it('warns and omits optional uncorrelated components but fails required ones', () => {
        const warn = vi.fn();
        const result = buildPageDesignerPreloadManifest(
            [component()],
            {},
            bundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            warn
        );
        expect(result.components).toEqual({});
        expect(warn).toHaveBeenCalledOnce();
        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                {},
                bundle,
                '/app',
                normalizePageDesignerPreloadManifestConfig({ requiredTypeIds: ['Content.hero'] }),
                vi.fn()
            )
        ).toThrow('requiredTypeIds');
    });

    it('fails duplicate type IDs and ambiguous source correlations', () => {
        const config = normalizePageDesignerPreloadManifestConfig(true);
        expect(() =>
            buildPageDesignerPreloadManifest([component(), component()], viteManifest, bundle, '/app', config, vi.fn())
        ).toThrow('Duplicate Page Designer typeId');
        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                { ...viteManifest, duplicate: { ...viteManifest['src/components/hero.tsx'] } },
                bundle,
                '/app',
                config,
                vi.fn()
            )
        ).toThrow('Ambiguous Vite manifest correlation');
    });

    it('validates custom compression bounds and records custom values', () => {
        expect(
            normalizePageDesignerPreloadManifestConfig({ compression: { brotli: { quality: 4 }, gzip: { level: 2 } } })
                .compression
        ).toEqual({ brotli: { quality: 4 }, gzip: { level: 2 } });
        expect(() => normalizePageDesignerPreloadManifestConfig({ compression: { brotli: { quality: 2.5 } } })).toThrow(
            'preloadManifest.compression.brotli.quality'
        );
        expect(() => normalizePageDesignerPreloadManifestConfig({ compression: { gzip: { level: 10 } } })).toThrow(
            'preloadManifest.compression.gzip.level'
        );
    });

    it('normalizes configured paths, required IDs, and source IDs', () => {
        expect(
            normalizePageDesignerPreloadManifestConfig({
                path: '.vite/custom.json',
                requiredTypeIds: ['Layout.grid', 'Content.hero', 'Content.hero'],
            })
        ).toEqual({
            path: '.vite/custom.json',
            requiredTypeIds: ['Content.hero', 'Layout.grid'],
            compression: { brotli: { quality: 9 }, gzip: { level: 6 } },
        });
        expect(normalizeSourceId('/app/', '/app')).toBe('');
        expect(normalizeSourceId('/app', '/app/src/hero.tsx?raw')).toBe('src/hero.tsx');
        expect(normalizeSourceId('/app', 'src\\hero.tsx')).toBe('src/hero.tsx');
        expect(normalizeSourceId('/app', '/outside/hero.tsx')).toBe('../outside/hero.tsx');
    });

    it('parses exactly one standard Vite manifest asset', () => {
        const source = Buffer.from(JSON.stringify(viteManifest));
        expect(
            parseViteManifestAsset(
                outputBundle({
                    'assets/manifest.json': { type: 'asset', fileName: '.vite/manifest.json', source },
                    'assets/app.js': bundle['assets/hero.js'],
                })
            )
        ).toEqual(viteManifest);
        expect(() => parseViteManifestAsset(outputBundle({}))).toThrow('found 0');
        expect(() =>
            parseViteManifestAsset(
                outputBundle({
                    first: { type: 'asset', fileName: 'manifest.json', source: '{}' },
                    second: { type: 'asset', fileName: '.vite/manifest.json', source: '{}' },
                })
            )
        ).toThrow('found 2');
        expect(() =>
            parseViteManifestAsset(outputBundle({ broken: { type: 'asset', fileName: 'manifest.json', source: '{' } }))
        ).toThrow('Could not parse');
    });

    it.each([
        [null, 'expected a top-level object'],
        ['manifest', 'expected a top-level object'],
        [[], 'expected a top-level object'],
        [{ entry: null }, 'record "entry" must be an object'],
        [{ entry: 'record' }, 'record "entry" must be an object'],
        [{ entry: [] }, 'record "entry" must be an object'],
        [{ entry: {} }, 'record "entry" must have a non-empty string "file"'],
        [{ entry: { file: '' } }, 'record "entry" must have a non-empty string "file"'],
        [{ entry: { file: 42 } }, 'record "entry" must have a non-empty string "file"'],
    ])('rejects an invalid Vite manifest structure: %j', (value, message) => {
        expect(() =>
            parseViteManifestAsset(
                outputBundle({
                    manifest: {
                        type: 'asset',
                        fileName: '.vite/manifest.json',
                        source: JSON.stringify(value),
                    },
                })
            )
        ).toThrow(message);
    });

    it('validates the embedded manifest shape', () => {
        const valid = buildPageDesignerPreloadManifest(
            [component()],
            viteManifest,
            bundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );
        expect(() => validateEmbeddedPageDesignerPreloadManifest(valid)).not.toThrow();
        for (const invalid of [null, {}, { version: 2 }, { version: 1 }, { version: 1, compression: {} }]) {
            expect(() => validateEmbeddedPageDesignerPreloadManifest(invalid)).toThrow('manifest');
        }
    });

    it('fails broken resource graphs and undiscovered required type IDs', () => {
        const config = normalizePageDesignerPreloadManifestConfig(true);
        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                { 'src/components/hero.tsx': { ...viteManifest['src/components/hero.tsx'], imports: ['missing'] } },
                bundle,
                '/app',
                config,
                vi.fn()
            )
        ).toThrow('imports missing record');
        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                viteManifest,
                { ...bundle, 'assets/hero.css': undefined } as unknown as Rollup.OutputBundle,
                '/app',
                config,
                vi.fn()
            )
        ).toThrow('missing emitted resource');
        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                viteManifest,
                bundle,
                '/app',
                normalizePageDesignerPreloadManifestConfig({ requiredTypeIds: ['Layout.missing'] }),
                vi.fn()
            )
        ).toThrow('was not discovered');
    });

    it('rejects resources classified as both style and module', () => {
        const conflictingManifest: ViteManifest = {
            'src/components/hero.tsx': {
                file: 'assets/shared.css',
                src: 'src/components/hero.tsx',
                isDynamicEntry: true,
                css: ['assets/shared.css'],
            },
        };

        expect(() =>
            buildPageDesignerPreloadManifest(
                [component()],
                conflictingManifest,
                outputBundle({
                    'assets/shared.css': {
                        type: 'asset',
                        fileName: 'assets/shared.css',
                        source: '.shared{}',
                    },
                }),
                '/app',
                normalizePageDesignerPreloadManifestConfig(true),
                vi.fn()
            )
        ).toThrow('classified as both style and module');
    });

    it('dedupes cyclic imports and accepts binary asset sources', () => {
        const cyclicManifest: ViteManifest = {
            ...viteManifest,
            '_vendor.js': { file: 'assets/vendor.js', imports: ['src/components/hero.tsx'] },
        };
        const binaryBundle = outputBundle({
            ...bundle,
            'assets/hero.css': {
                type: 'asset',
                fileName: 'assets/hero.css',
                source: Buffer.from('.hero{color:red}'),
            },
        });
        const result = buildPageDesignerPreloadManifest(
            [component()],
            cyclicManifest,
            binaryBundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );
        expect(result.components['Content.hero']).toEqual({ styles: [0], entries: [1], dependencies: [2] });
    });

    it('stores shared resource metadata once and references it from each component', () => {
        const result = buildPageDesignerPreloadManifest(
            [component(), component('Layout.grid', '/app/src/components/grid.tsx')],
            {
                ...viteManifest,
                'src/components/grid.tsx': {
                    file: 'assets/grid.js',
                    src: 'src/components/grid.tsx',
                    isDynamicEntry: true,
                    imports: ['_vendor.js'],
                },
            },
            outputBundle({
                ...bundle,
                'assets/grid.js': { type: 'chunk', fileName: 'assets/grid.js', code: 'export default 2' },
            }),
            '/app',
            normalizePageDesignerPreloadManifestConfig(true),
            vi.fn()
        );

        const vendorIndex = result.resources.findIndex(({ file }) => file === 'assets/vendor.js');
        expect(vendorIndex).toBeGreaterThanOrEqual(0);
        expect(result.resources.filter(({ file }) => file === 'assets/vendor.js')).toHaveLength(1);
        expect(result.components['Content.hero'].dependencies).toContain(vendorIndex);
        expect(result.components['Layout.grid'].dependencies).toContain(vendorIndex);
    });

    it('supports source correlation through record metadata and components without styles or dependencies', () => {
        const entryOnlyManifest: ViteManifest = {
            alias: {
                file: 'assets/hero.js',
                src: 'src/components/hero.tsx',
                isDynamicEntry: true,
            },
        };
        const result = buildPageDesignerPreloadManifest(
            [component()],
            entryOnlyManifest,
            bundle,
            '/app',
            normalizePageDesignerPreloadManifestConfig({ requiredTypeIds: ['Content.hero'] }),
            vi.fn()
        );

        expect(result.components['Content.hero']).toEqual({ entries: [0] });
    });
});
