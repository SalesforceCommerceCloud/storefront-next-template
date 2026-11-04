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
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectWithPlayhouse, readExistingPlayhouseArchive } from './playhouse';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'playhouse-archive');
const home = { label: 'home', url: 'https://example.com' };
const BASE = [
    'manifest.json',
    'summary.json',
    'opportunities.json',
    'summary-tbt.json',
    'summary-lcp.json',
    'summary-third-party.json',
];
const FAMILIES = ['main-document.json', 'network.json', 'diagnostics.json', 'report.html'];
const schemaFor = (name: string) => (name.endsWith('.html') ? { type: 'string' } : { type: 'object' });

type Setup = {
    names?: string[];
    schemas?: Record<string, unknown>;
    manifest?: (manifest: Record<string, unknown>) => void;
    runResult?: unknown;
    archiveDir?: string;
    run?: string;
};

/** A copied fixture archive and a fake Playhouse whose describe declares `names`. */
async function setup({
    names = [...BASE, ...FAMILIES],
    schemas = {},
    manifest,
    runResult,
    archiveDir,
    run,
}: Setup = {}) {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'sfnext-playhouse-edges-'));
    const archive = path.join(cwd, 'archive');
    await cp(FIXTURE, archive, { recursive: true });
    if (manifest) {
        const file = path.join(archive, 'manifest.json');
        const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        manifest(parsed);
        await writeFile(file, JSON.stringify(parsed));
    }
    const describeResult = JSON.stringify({
        tool: { version: '9.9.9' },
        archiveLifecycle: { viewability: { requiresManifest: true, stateAuthority: 'manifest.archiveState' } },
        artifacts: names.map((name) => ({ path: name, schema: schemas[name] ?? schemaFor(name) })),
        outputs: { runResult: runResult ?? { type: 'object' } },
    });
    const runAnswer =
        run ??
        `console.log(JSON.stringify({tool:'playhouse',command:'run',targetUrl:a[1],archiveDir:${JSON.stringify(archiveDir ?? 'archive')},summary:{}}))`;
    const bin = path.join(cwd, 'fake-playhouse.mjs');
    await writeFile(
        bin,
        `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeResult)});else{${runAnswer}}`
    );
    return { cwd, archive, bin };
}

describe('Playhouse archive validation', () => {
    it.each<[string, Setup, RegExp]>([
        ['a describe without a document family', { names: BASE }, /missing required document artifact descriptor/],
        [
            'a manifest that fails its schema',
            { schemas: { 'manifest.json': { type: 'object', required: ['nope'] } } },
            /manifest\.json failed its describe schema/,
        ],
        [
            'an incomplete archive',
            {
                manifest: (manifest) => {
                    manifest.archiveState = { status: 'incomplete', failures: [], warnings: [] };
                },
            },
            /archive is incomplete for home/,
        ],
        [
            'a manifest without a required summary',
            {
                manifest: (manifest) => {
                    manifest.summaryArtifacts = (manifest.summaryArtifacts as string[]).filter(
                        (name) => name !== 'summary-tbt.json'
                    );
                },
            },
            /missing required artifact: summary-tbt\.json/,
        ],
        [
            'an artifact that fails its schema',
            { schemas: { 'summary.json': { type: 'object', required: ['nope'] } } },
            /summary\.json failed its describe schema/,
        ],
    ])('rejects %s', async (_case, options, error) => {
        const { cwd, archive, bin } = await setup(options);
        await expect(readExistingPlayhouseArchive({ bin }, home, archive, cwd)).rejects.toThrow(error);
    });

    it('rejects a manifest for another page, and an archive that is a file', async () => {
        const { cwd, archive, bin } = await setup();
        await expect(
            readExistingPlayhouseArchive({ bin }, { label: 'plp', url: 'https://example.com/plp' }, archive, cwd)
        ).rejects.toThrow('Playhouse manifest target mismatch for plp');
        await expect(
            readExistingPlayhouseArchive({ bin }, home, path.join(archive, 'manifest.json'), cwd)
        ).rejects.toThrow(/archive is not a directory/);
    });
});

describe('Playhouse run results', () => {
    it.each<[string, Setup, RegExp]>([
        [
            'a result that fails its describe schema',
            { runResult: { type: 'object', required: ['nope'] } },
            /run result failed its describe schema/,
        ],
        ['an archive outside the output directory', { archiveDir: '../elsewhere' }, /escaped the controlled output/],
        ['a partial archive', { archiveDir: 'archive.partial' }, /retained a partial archive/],
        [
            'a failure without a --json error message',
            { run: `console.log('{"error":{}}');process.exit(1)` },
            /^Playhouse command failed \(run .*\): Command failed/,
        ],
    ])('rejects %s', async (_case, options, error) => {
        const { cwd, bin } = await setup(options);
        if (options.archiveDir === 'archive.partial')
            await cp(path.join(cwd, 'archive'), path.join(cwd, 'archive.partial'), { recursive: true });
        await expect(collectWithPlayhouse({ bin }, home, cwd)).rejects.toThrow(error);
    });
});
