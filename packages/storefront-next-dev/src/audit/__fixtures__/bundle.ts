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
/** Test-only: a small built storefront and its Playhouse archive, shared by the bundle analysis tests. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encode, type SourceMapSegment } from '@jridgewell/sourcemap-codec';
import type { BuildOutputs } from '../bundle/analyze';
import type { PlayhouseCollection } from '../playhouse';

export const write = async (file: string, text: string): Promise<void> => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
};
export const pad = (name: string, bytes: number): string => `const ${name}="${'x'.repeat(bytes)}";`;

/**
 * A chunk whose map gives each listed line to one source (relative to the assets dir); `null` leaves a line unmapped.
 * Returns the code and its map.
 */
export function chunk(lines: [string | null, string][]): { code: string; map: string } {
    const sources = [...new Set(lines.flatMap(([source]) => (source ? [source] : [])))];
    const mappings = lines.map(([source]): SourceMapSegment[] => (source ? [[0, sources.indexOf(source), 0, 0]] : []));
    return {
        code: lines.map(([, text]) => text).join('\n'),
        map: JSON.stringify({ version: 3, sources, mappings: encode(mappings) }),
    };
}

/** A visualizer report embedding `data`, as rollup-plugin-visualizer writes it. */
export const visualizerHtml = (data: unknown): string =>
    `<!DOCTYPE html>\n<html><body><script>\n/*<!--*/\nconst data = ${JSON.stringify(data)};\n/*-->*/\n</script></body></html>\n`;

type NodeMeta = {
    id: string;
    moduleParts: Record<string, string>;
    imported: { uid: string; dynamic?: boolean }[];
    importedBy: unknown[];
    isEntry?: boolean;
};
export type VisualizerData = {
    version: number;
    tree: object;
    options: object;
    env: object;
    nodeParts: Record<string, object>;
    nodeMetas: Record<string, NodeMeta>;
};

/**
 * A small storefront: entry.client hydrates with react-dom; the _app route imports a header (with a JSON locale the
 * maps omit) and a drawer that pulls a large library through an inner component.
 */
export async function fixture() {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sfnext-bundle-')));
    const project = path.join(root, 'store');
    await write(path.join(project, 'package.json'), JSON.stringify({ name: 'store' }));
    await write(path.join(project, 'src/entry.client.tsx'), "import { hydrateRoot } from 'react-dom/client';\n");
    await write(path.join(project, 'src/root.tsx'), 'export default function Root() {}\n');
    await write(
        path.join(project, 'src/routes/_app.tsx'),
        "import type { Props } from '@/components/header';\nimport Header from '@/components/header';\nimport Drawer from '@/components/drawer';\n"
    );
    await write(path.join(project, 'src/components/header/index.tsx'), "import en from '../../locales/en.json';\n");
    await write(path.join(project, 'src/components/drawer/index.tsx'), "import Inner from './inner';\n");
    await write(path.join(project, 'src/components/drawer/inner.tsx'), "import { big } from 'big-lib';\n");
    await write(path.join(project, 'node_modules/big-lib/package.json'), JSON.stringify({ name: 'big-lib' }));

    const assets = path.join(project, 'build/client/assets');
    const up = '../../../';
    const entry = chunk([
        [null, 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/root-B.js"])))=>i.map(i=>d[i]);'],
        [`${up}src/entry.client.tsx?platform-passthrough`, 'const entry=1;'],
        [`${up}node_modules/react-dom/client.js`, pad('reactDom', 15000)],
    ]);
    const rootChunk = chunk([[`${up}src/root.tsx`, 'export default function Root(){}']]);
    const app = chunk([
        [null, 'import"./big-lib-D.js";'],
        [`${up}src/routes/_app.tsx`, 'const app=1;'],
        [`${up}src/components/header/index.tsx`, pad('header', 600)],
        [`${up}src/components/drawer/index.tsx`, pad('drawer', 400)],
        [`${up}src/components/drawer/inner.tsx`, pad('inner', 300)],
        [null, pad('en', 11000)],
    ]);
    const big = chunk([[`${up}node_modules/big-lib/index.js`, pad('big', 40000)]]);
    const manifest =
        'window.__reactRouterManifest={"entry":{"module":(window._BUNDLE_PATH || "/") + "assets/entry.client-A.js","imports":[]},"routes":{"root":{"id":"root","module":(window._BUNDLE_PATH || "/") + "assets/root-B.js"},"routes/_app":{"id":"routes/_app","parentId":"root","module":(window._BUNDLE_PATH || "/") + "assets/_app-C.js","imports":["/assets/big-lib-D.js"]}}};';
    const files: Record<string, { code: string; map?: string }> = {
        'entry.client-A.js': entry,
        'root-B.js': rootChunk,
        '_app-C.js': app,
        'big-lib-D.js': big,
    };
    for (const [name, { code, map = '' }] of Object.entries(files)) {
        await write(path.join(assets, name), code);
        await write(path.join(assets, `${name}.map`), map);
    }
    await write(path.join(assets, 'manifest-E.js'), manifest);
    files['manifest-E.js'] = { code: manifest };
    const bytes = (name: string): number => Buffer.byteLength(files[name]?.code ?? '');

    // The analyze build: readable chunk names, ids relative to the project.
    const metas: Record<
        string,
        { id: string; chunk: string; size: number; entry?: boolean; imports: [string, boolean?][] }
    > = {
        m1: {
            id: '/src/entry.client.tsx?platform-passthrough',
            chunk: 'assets/entry.client.js',
            size: 20,
            entry: true,
            imports: [['m2']],
        },
        m2: { id: '/node_modules/react-dom/client.js', chunk: 'assets/entry.client.js', size: 16000, imports: [] },
        m3: {
            id: '/src/root.tsx?__react-router-build-client-route',
            chunk: 'assets/root.js',
            size: 40,
            entry: true,
            imports: [],
        },
        m4: {
            id: '/src/routes/_app.tsx?__react-router-build-client-route',
            chunk: 'assets/_app.js',
            size: 20,
            entry: true,
            imports: [['m5'], ['m6'], ['m9', true]],
        },
        m5: { id: '/src/components/header/index.tsx', chunk: 'assets/_app.js', size: 700, imports: [['m8']] },
        m6: { id: '/src/components/drawer/index.tsx', chunk: 'assets/_app.js', size: 500, imports: [['m7']] },
        m7: { id: '/src/components/drawer/inner.tsx', chunk: 'assets/_app.js', size: 400, imports: [['m10']] },
        m8: { id: '/src/locales/en.json', chunk: 'assets/_app.js', size: 12000, imports: [] },
        m9: { id: '/src/components/lazy-thing.tsx', chunk: 'assets/lazy-thing.js', size: 900, imports: [] },
        m10: { id: '/node_modules/big-lib/index.js', chunk: 'assets/big-lib.js', size: 21000, imports: [] },
        m11: { id: '\0vite/preload-helper.js', chunk: 'assets/entry.client.js', size: 300, imports: [] },
    };
    const data: VisualizerData = {
        version: 2,
        tree: {},
        options: { gzip: false, brotli: false, sourcemap: false },
        env: { rollup: '4.62.2' },
        nodeParts: Object.fromEntries(
            Object.entries(metas).map(([uid, meta]) => [
                `p-${uid}`,
                { renderedLength: meta.size, gzipLength: 0, brotliLength: 0, metaUid: uid },
            ])
        ),
        nodeMetas: Object.fromEntries(
            Object.entries(metas).map(([uid, meta]) => [
                uid,
                {
                    id: meta.id,
                    moduleParts: { [meta.chunk]: `p-${uid}` },
                    imported: meta.imports.map(([target, dynamic]) => ({
                        uid: target,
                        ...(dynamic ? { dynamic: true } : {}),
                    })),
                    importedBy: [],
                    ...(meta.entry ? { isEntry: true } : {}),
                },
            ])
        ),
    };

    // Playhouse: one mobile cold-cache run that loaded every chunk, a tag, and the inline route script.
    const archive = path.join(root, 'archive');
    const url = (name: string): string => `https://shop.test/mobify/bundle/7/client/assets/${name}`;
    const order = ['manifest-E.js', 'entry.client-A.js', 'root-B.js', '_app-C.js', 'big-lib-D.js'];
    const items = [
        {
            url: 'https://shop.test/',
            resourceType: 'Document',
            statusCode: 200,
            resourceSize: 50000,
            transferSize: 9000,
            networkRequestTime: 0,
        },
        ...order.map((name, index) => ({
            url: url(name),
            resourceType: 'Script',
            statusCode: 200,
            resourceSize: bytes(name),
            transferSize: 100 + index,
            networkRequestTime: name === 'big-lib-D.js' ? 2600 : 100 + index,
        })),
        {
            url: 'https://cdn.test/gtm.js',
            resourceType: 'Script',
            statusCode: 200,
            resourceSize: 90000,
            transferSize: 30000,
            networkRequestTime: 300,
        },
    ];
    await write(
        path.join(archive, 'summary-lcp.json'),
        JSON.stringify({ cells: [{ formFactor: 'mobile', cacheState: 'cold', median: { runId: 'mobile-cold-1' } }] })
    );
    await write(
        path.join(archive, 'runs/mobile-cold-1/lhr.json'),
        JSON.stringify({
            audits: {
                'network-requests': { details: { items } },
                metrics: { details: { items: [{ observedLoad: 2000 }] } },
            },
        })
    );
    const inline = `import "${url('manifest-E.js')}";\nimport * as route0 from "${url('root-B.js')}";\nimport * as route1 from "${url('_app-C.js')}";\nwindow.__reactRouterRouteModules = {"root":route0,"routes/_app":route1};\nimport("${url('entry.client-A.js')}");`;
    const sha = createHash('sha256').update(inline).digest('hex');
    await write(path.join(archive, `scripts/${sha}.js`), inline);
    await write(
        path.join(archive, 'scripts/index.json'),
        JSON.stringify({
            version: 2,
            observations: [
                { runId: 'mobile-cold-1', url: 'https://shop.test/', body: { status: 'captured', sha256: sha } },
            ],
        })
    );

    const page: PlayhouseCollection = {
        label: 'home',
        url: 'https://shop.test/',
        archiveDir: archive,
        playhouseVersion: '0.1.2',
    };
    const outputs: BuildOutputs = {
        projectRoot: project,
        packageManager: 'npm',
        durationMs: { analyze: 1, plain: 1 },
        assetsDir: assets,
        visualizerHtml: visualizerHtml(data),
        visualizer: 'bundle/client-bundle-size.html',
        notes: [],
    };
    return { root, project, assets, archive, files, bytes, data, page, outputs, sha };
}
