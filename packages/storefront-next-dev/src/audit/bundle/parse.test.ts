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
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunk, fixture, visualizerHtml } from '../__fixtures__/bundle';
import {
    lexerReady,
    moduleIdResolver,
    parseChunk,
    parseRouteModulesScript,
    parseRouterManifest,
    parseVisualizerHtml,
} from './parse';

describe('bundle parsing', () => {
    it('attributes a chunk byte for byte to its modules, preload list and glue', async () => {
        await lexerReady;
        const assets = path.resolve('/p/build/client/assets');
        // Multibyte text: map columns count UTF-16 units, sizes count bytes.
        const { code, map } = chunk([
            [null, 'const __vite__mapDeps=(i)=>i;'],
            ['../../../src/a.tsx?url', 'import"./b-X.js";const a="héllo";'],
            [null, 'const json={"k":"ü"};'],
        ]);
        const parsed = parseChunk('a-X.js', `${code}\nimport("./c-Y.js");`, map, assets);
        expect(parsed.preloadList).toBe(Buffer.byteLength('const __vite__mapDeps=(i)=>i;\n'));
        expect([...parsed.modules]).toEqual([
            [path.resolve('/p/src/a.tsx'), Buffer.byteLength('import"./b-X.js";const a="héllo";')],
        ]);
        expect([...parsed.modules.values()].reduce((a, b) => a + b, 0) + parsed.preloadList + parsed.unattributed).toBe(
            parsed.bytes
        );
        expect([parsed.imports, parsed.dynamicImports, parsed.hasMap]).toEqual([['b-X.js'], ['c-Y.js'], true]);
        // Without a map everything but the preload list is unattributed.
        const bare = parseChunk('a-X.js', code, undefined, assets);
        expect(bare.preloadList + bare.unattributed).toBe(bare.bytes);
        expect(bare.hasMap).toBe(false);
    });

    it('merges query variants in the visualizer graph, skips virtual modules and keeps dynamic edges dynamic', async () => {
        const { data, project } = await fixture();
        const graph = parseVisualizerHtml(
            visualizerHtml(data),
            moduleIdResolver(project, new Set(['src', 'node_modules', 'package.json']))
        );
        const app = graph.get(path.join(project, 'src/routes/_app.tsx'));
        expect(app?.entry).toBe(true);
        expect([...(app?.static ?? [])].map((id) => path.relative(project, id))).toEqual([
            path.join('src/components/header/index.tsx'),
            path.join('src/components/drawer/index.tsx'),
        ]);
        expect([...(app?.dynamic ?? [])].map((id) => path.relative(project, id))).toEqual([
            path.join('src/components/lazy-thing.tsx'),
        ]);
        expect([...graph.keys()].some((id) => id.includes('preload-helper'))).toBe(false);
        expect(() => parseVisualizerHtml(visualizerHtml({ ...data, version: 3 }), (id) => id)).toThrow(
            /Unsupported visualizer data version 3/
        );
        expect(() => parseVisualizerHtml('<html></html>', (id) => id)).toThrow(/no embedded/);
    });

    it('reads the router manifest and the inline route script as text, never running them', () => {
        const manifest = parseRouterManifest(
            'window.__reactRouterManifest={"entry":{"module":(window._BUNDLE_PATH || "/") + "assets/entry-A.js","imports":[]},"routes":{"root":{"id":"root","module":(window._BUNDLE_PATH || "/") + "assets/root-B.js?v=1"}}};'
        );
        expect([manifest.entry.module, manifest.routes.root?.module]).toEqual(['entry-A.js', 'root-B.js']);
        expect(() => parseRouterManifest('alert(1)')).toThrow(/Not a React Router manifest/);
        expect(
            parseRouteModulesScript(
                'import * as route0 from "/a/root-B.js";\nwindow.__reactRouterRouteModules = {"root":route0};\nimport("/a/entry-A.js");'
            )
        ).toEqual({ routes: [{ id: 'root', file: 'root-B.js' }], entry: 'entry-A.js' });
        expect(parseRouteModulesScript('window.dataLayer = [];')).toBeUndefined();
    });
});
