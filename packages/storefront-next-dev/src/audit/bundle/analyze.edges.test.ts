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
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunk, fixture, pad, visualizerHtml, write } from '../__fixtures__/bundle';
import { PlayhouseArtifactReader } from '../evidence';
import { analyzeBundle } from './analyze';

const analyze = async (
    outputs: Awaited<ReturnType<typeof fixture>>['outputs'],
    page: Awaited<ReturnType<typeof fixture>>['page']
) => analyzeBundle(outputs, [page], new PlayhouseArtifactReader([page]));

describe('analyzeBundle on unusual builds', () => {
    it('reports a build with no JavaScript as unreadable', async () => {
        const { outputs, page } = await fixture();
        const empty = await mkdtemp(path.join(os.tmpdir(), 'sfnext-empty-assets-'));
        const analysis = await analyze({ ...outputs, assetsDir: empty }, page);
        expect(analysis.status).toBe('unavailable');
        expect(analysis.notes[0]).toMatch(/^The build output could not be read: .* has no JavaScript\.$/);
        expect(analysis.pages[0]?.local).toBeNull();
    });

    it('reads no routes from a build with several router manifests or none', async () => {
        const { outputs, page, assets } = await fixture();
        await copyFile(path.join(assets, 'manifest-E.js'), path.join(assets, 'manifest-F.js'));
        const several = await analyze(outputs, page);
        expect(several.notes).toContain("The build has 2 React Router manifests; routes can't be read from it.");
        expect(several.pages[0]?.local).toBeNull();

        await rm(path.join(assets, 'manifest-E.js'));
        await rm(path.join(assets, 'manifest-F.js'));
        const none = await analyze(outputs, page);
        expect(none.notes).toContain("The build has no React Router manifest; routes can't be read from it.");
    });

    it('notes chunks without source maps, chunks the manifest names but the build lacks, and modules the graph lacks', async () => {
        const { outputs, page, assets, data } = await fixture();
        await rm(path.join(assets, 'big-lib-D.js.map'));
        const noMap = await analyze(outputs, page);
        expect(noMap.notes).toContain("1 of 5 chunks have no source map, so their modules aren't known.");

        await rm(path.join(assets, 'big-lib-D.js'));
        const missing = await analyze(outputs, page);
        expect(missing.notes).toContain("home: 1 chunks the local manifest names aren't in the build's client assets.");

        delete data.nodeMetas.m2;
        delete data.nodeParts['p-m2'];
        for (const meta of Object.values(data.nodeMetas))
            meta.imported = meta.imported.filter((item) => item.uid !== 'm2');
        const partialGraph = await analyze({ ...outputs, visualizerHtml: visualizerHtml(data) }, page);
        expect(
            partialGraph.notes.some((note) => /modules in the build's source maps aren't in the visualizer/.test(note))
        ).toBe(true);
    });

    it('keeps the composition when the visualizer report is unreadable', async () => {
        const { outputs, page } = await fixture();
        const analysis = await analyze({ ...outputs, visualizerHtml: '<html></html>' }, page);
        expect(analysis.status).toBe('partial');
        expect(analysis.notes[0]).toMatch(
            /^The visualizer report could not be read, so import suggestions are unavailable: /
        );
        expect(analysis.pages[0]?.local?.candidates).toEqual([]);
    });

    it('names packages outside node_modules and modules no package owns', async () => {
        const { outputs, page, project, assets, root } = await fixture();
        await write(
            path.join(root, 'shared-pkg/package.json'),
            JSON.stringify({ name: 'shared-pkg', version: '2.0.0' })
        );
        await write(
            path.join(project, 'node_modules/react-dom/package.json'),
            JSON.stringify({ name: 'react-dom', version: '19.0.0' })
        );
        const up = '../../../';
        const rootChunk = chunk([
            [`${up}src/root.tsx`, 'export default function Root(){}'],
            [`${up}../shared-pkg/lib/util.js`, pad('util', 3000)],
            [`${up}../loose/file.js`, pad('loose', 2000)],
        ]);
        await writeFile(path.join(assets, 'root-B.js'), rootChunk.code);
        await writeFile(path.join(assets, 'root-B.js.map'), rootChunk.map);
        const analysis = await analyze({ ...outputs, visualizerHtml: null, visualizer: null }, page);
        const packages = analysis.pages[0]?.local?.packages ?? [];
        const shared = packages.find((item) => item.name === 'shared-pkg');
        expect([shared?.kind, shared?.largestModules?.[0]?.file]).toEqual(['npm', 'shared-pkg/lib/util.js']);
        expect(packages.find((item) => item.name === 'Other')?.largestModules?.[0]?.file).toBe('file.js');
        expect(packages.find((item) => item.name === 'react-dom')?.kind).toBe('npm');
    });

    it('skips a page whose live artifacts are missing or unreadable, and keeps the others', async () => {
        const { outputs, page } = await fixture();
        const bare = await mkdtemp(path.join(os.tmpdir(), 'sfnext-bare-archive-'));
        const missing = { ...page, label: 'bare', archiveDir: bare };
        const unknown = { ...page, label: 'unknown' };
        const analysis = await analyzeBundle(
            outputs,
            [page, missing, unknown],
            new PlayhouseArtifactReader([page, missing])
        );
        expect(analysis.pages.map((item) => item.page)).toEqual(['home']);
        expect(analysis.skipped.map((item) => item.page)).toEqual(['bare', 'unknown']);
        expect(analysis.skipped[1]?.reason).toBe('Unknown prepared page: unknown');
    });
});
