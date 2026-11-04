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
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, pad, visualizerHtml } from '../__fixtures__/bundle';
import { PlayhouseArtifactReader } from '../evidence';
import { analyzeBundle, routeForUrl } from './analyze';
import type { RouterManifest } from './parse';
import { bundleAnalysisSchema } from './schema';

describe('analyzeBundle', () => {
    it('keeps the live sizes apart from the local build and names the imports to make lazy', async () => {
        const { outputs, page, files, bytes } = await fixture();
        const analysis = bundleAnalysisSchema.parse(
            await analyzeBundle(outputs, [page], new PlayhouseArtifactReader([page]))
        );
        expect(analysis.status).toBe('complete');
        expect(analysis.notes).toEqual([]);
        const total = Object.values(files).reduce((sum, file) => sum + Buffer.byteLength(file.code), 0);
        const attribution = analysis.build?.attribution;
        expect(
            (attribution?.modules ?? 0) +
                (attribution?.unmappedModules ?? 0) +
                (attribution?.preloadLists ?? 0) +
                (attribution?.routerManifest ?? 0) +
                (attribution?.glue ?? 0)
        ).toBe(total);
        expect(analysis.build?.bytes).toBe(total);
        // The JSON locale the map omits gets the _app chunk's unmapped bytes, never more than its own length.
        expect(attribution?.unmappedModules).toBeGreaterThan(11000);
        expect(attribution?.unmappedModules).toBeLessThanOrEqual(12000);

        const [home] = analysis.pages;
        expect(home?.route).toEqual({ ids: ['root', 'routes/_app'], source: 'page' });
        // The tag manager is third-party; big-lib was requested after the load event.
        expect([home?.live?.scripts, home?.live?.beforeLoad, home?.live?.decodedBytes]).toEqual([5, 4, total]);
        // Locally the routes load the manifest, the entry, both route modules and _app's static import.
        expect([home?.local?.chunks, home?.local?.bytes]).toEqual([5, total]);
        expect(home?.local?.largest[0]).toEqual({
            file: 'big-lib-D.js',
            bytes: bytes('big-lib-D.js'),
            owners: [{ name: 'big-lib', bytes: bytes('big-lib-D.js') }],
        });
        expect(home?.local?.packages.slice(0, 3).map((owner) => [owner.name, owner.kind])).toEqual([
            ['big-lib', 'npm'],
            ['react-dom', 'npm'],
            ['src/locales/en.json', 'project'],
        ]);

        // react-dom is entry.client's, so never a suggestion; the drawer's inner imports are the same suggestion one level down.
        const candidates = home?.local?.candidates ?? [];
        expect(candidates.map((item) => [item.importer.file, item.importer.line, item.target, item.package])).toEqual([
            ['src/routes/_app.tsx', 3, 'src/components/drawer/index.tsx', 'src/components/drawer'],
            ['src/routes/_app.tsx', 2, 'src/components/header/index.tsx', 'src/components/header'],
        ]);
        expect(candidates[0]?.importer.excerpt).toBe("import Drawer from '@/components/drawer'");
        expect(candidates[0]?.savedModules).toBe(3);
        expect(candidates[0]?.savedBytes).toBeGreaterThan(20000);
        const bigLib = home?.local?.packages.find((owner) => owner.name === 'big-lib');
        expect([bigLib?.importerCount, bigLib?.importers[0]?.file, bigLib?.importers[0]?.line]).toEqual([
            1,
            'src/components/drawer/inner.tsx',
            1,
        ]);
        expect(bigLib?.deferrableBytes).toBe(Buffer.byteLength(pad('big', 40000)));
        expect(bigLib?.largestModules).toEqual([
            { file: 'big-lib/index.js', bytes: Buffer.byteLength(pad('big', 40000)) },
        ]);
        expect(home?.local?.packages.find((owner) => owner.name === 'react-dom')?.deferrableBytes).toBeUndefined();
        // Absolute paths never reach the analysis.
        expect(JSON.stringify(analysis).includes(outputs.projectRoot)).toBe(false);
    });

    it('never depends on the live files for the local analysis, and matches a route the build lacks by URL', async () => {
        const { outputs, page, archive, sha, data } = await fixture();
        const playhouse = new PlayhouseArtifactReader([page]);
        const baseline = (await analyzeBundle(outputs, [page], playhouse)).pages[0]?.local;
        // A live site built from other code serves other file names: the local analysis is unchanged.
        const lhrFile = path.join(archive, 'runs/mobile-cold-1/lhr.json');
        const lhr = JSON.parse(await readFile(lhrFile, 'utf8'));
        for (const item of lhr.audits['network-requests'].details.items)
            item.url = item.url.replace(/-([A-Z])\.js$/, '-Z$1.js');
        await writeFile(lhrFile, JSON.stringify(lhr));
        const rebuilt = await analyzeBundle(outputs, [page], playhouse);
        expect(rebuilt.notes).toEqual([]);
        expect(rebuilt.pages[0]?.local).toEqual(baseline);
        expect(rebuilt.pages[0]?.live?.scripts).toBe(5);

        // The live page renders a route the local build doesn't have.
        const inline = (await readFile(path.join(archive, `scripts/${sha}.js`), 'utf8')).replace(
            '"routes/_app":route1',
            '"routes/_app.home":route1'
        );
        await writeFile(path.join(archive, `scripts/${sha}.js`), inline);
        const byUrl = await analyzeBundle(outputs, [page], playhouse);
        expect(byUrl.pages[0]?.route).toEqual({ ids: ['root', 'routes/_app'], source: 'url' });
        expect(byUrl.notes[0]).toMatch(
            /^home: the live page renders routes\/_app\.home, which the local build doesn't have; its URL matches the local route routes\/_app/
        );
        expect(byUrl.pages[0]?.local).toEqual(baseline);
        const nowhere = await analyzeBundle(outputs, [{ ...page, url: 'https://shop.test/nope' }], playhouse);
        expect([nowhere.pages[0]?.route, nowhere.pages[0]?.local]).toEqual([null, null]);
        expect(nowhere.notes[0]).toMatch(/no local route matches its URL/);

        // A module that's already split with import() elsewhere is flagged on the static import that defeats it.
        data.nodeMetas.m3?.imported.push({ uid: 'm6', dynamic: true });
        const lazy = await analyzeBundle({ ...outputs, visualizerHtml: visualizerHtml(data) }, [page], playhouse);
        expect(lazy.pages[0]?.local?.candidates[0]?.lazyElsewhere).toEqual(['src/root.tsx']);
    });

    it('keeps only the composition without the module graph, and only the live totals without a build', async () => {
        const { outputs, page } = await fixture();
        const noGraph = await analyzeBundle(
            { ...outputs, visualizerHtml: null, visualizer: null },
            [page],
            new PlayhouseArtifactReader([page])
        );
        expect(noGraph.status).toBe('partial');
        expect(noGraph.pages[0]?.local?.candidates).toEqual([]);
        expect(noGraph.pages[0]?.local?.packages.length).toBeGreaterThan(0);

        const live = await analyzeBundle(
            { ...outputs, assetsDir: null, visualizerHtml: null, notes: ['not built'] },
            [page],
            new PlayhouseArtifactReader([page])
        );
        expect([live.status, live.build, live.notes, live.pages[0]?.live?.scripts, live.pages[0]?.local]).toEqual([
            'unavailable',
            null,
            ['not built'],
            5,
            null,
        ]);
        expect(live.pages[0]?.route).toEqual({ ids: ['root', 'routes/_app'], source: 'page' });
    });
});

describe('routeForUrl', () => {
    it('matches a URL to the local route React Router would render', () => {
        const route = (id: string, parentId?: string, extra: object = {}) =>
            [id, { id, ...(parentId ? { parentId } : {}), module: `${id}.js`, ...extra }] as const;
        const manifest = {
            entry: { module: 'entry.js', imports: [] },
            routes: Object.fromEntries([
                route('root'),
                route('routes/_app', 'root'),
                route('routes/_app._index', 'routes/_app', { index: true }),
                route('routes/_app.$', 'routes/_app', { path: '*' }),
                route('routes/_app.account', 'routes/_app', { path: 'account' }),
                route('routes/_app.category.$categoryId', 'routes/_app', { path: 'category/:categoryId' }),
                route('routes/_app.$slug.$productId[.html]', 'routes/_app', { path: ':slug/:productId.html' }),
                route('routes/_app.search', 'routes/_app', { path: ':locale?/search' }),
            ]),
        } as RouterManifest;
        const leaf = (pathname: string) => routeForUrl(`https://shop.test${pathname}`, manifest)?.at(-1);
        expect(routeForUrl('https://shop.test/', manifest)).toEqual(['root', 'routes/_app', 'routes/_app._index']);
        expect(leaf('/account')).toBe('routes/_app.account');
        expect(leaf('/ACCOUNT')).toBe('routes/_app.account');
        expect(leaf('/category/bags')).toBe('routes/_app.category.$categoryId');
        expect(leaf('/classic-crossbody/ACB921-BG.html')).toBe('routes/_app.$slug.$productId[.html]');
        expect(leaf('/crossbody-handbags')).toBe('routes/_app.$');
        expect(leaf('/search')).toBe('routes/_app.search');
        expect(leaf('/en-GB/search')).toBe('routes/_app.search');
        expect(leaf('/a/b/c')).toBe('routes/_app.$');
    });
});
