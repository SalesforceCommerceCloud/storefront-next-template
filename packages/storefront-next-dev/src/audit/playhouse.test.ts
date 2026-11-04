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
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectWithPlayhouse, inspectPlayhouse, playhouseBin, readExistingPlayhouseArchive } from './playhouse';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'playhouse-archive');
const home = { label: 'home', url: 'https://example.com' };
const LIFECYCLE = { viewability: { requiresManifest: true, stateAuthority: 'manifest.archiveState' } };
const BASE = [
    'manifest.json',
    'summary.json',
    'opportunities.json',
    'summary-tbt.json',
    'summary-lcp.json',
    'summary-third-party.json',
];
const HAR = { path: 'network-{formFactor}-{cacheState}.har', producedBy: 'playhouse', contract: 'HAR 1.2' };
const schemaFor = (name: string) => (name.endsWith('.html') ? { type: 'string' } : { type: 'object' });

/** A Playhouse `describe` result as JSON, declaring `artifacts` (and optional raw artifacts). */
function describeJson(artifacts: { path: string; schema: unknown }[], extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        tool: { name: 'playhouse', version: '9.9.9' },
        archiveLifecycle: LIFECYCLE,
        artifacts,
        outputs: { runResult: { type: 'object' } },
        ...extra,
    });
}
const declared = (names: string[], prefix = '') =>
    names.map((name) => ({ path: prefix + name, schema: schemaFor(name) }));
/** The fake's `run` answer: an archive at `archive` relative to its cwd. */
const RUN_RESULT = `JSON.stringify({tool:'playhouse',command:'run',targetUrl:a[1],archiveDir:'archive',summary:{}})`;

async function tempDir(name: string): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), `sfnext-playhouse-${name}-`));
}
async function copyArchive(dest: string, { declareHar = false } = {}): Promise<void> {
    await cp(FIXTURE, dest, { recursive: true, force: true });
    if (!declareHar) return;
    const manifestPath = path.join(dest, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { medianArtifacts: string[] };
    manifest.medianArtifacts.push('network-mobile-cold.har');
    await writeFile(manifestPath, JSON.stringify(manifest));
}
/** Writes a fake Playhouse script into `cwd` and returns it. */
async function fakePlayhouse(cwd: string, source: string): Promise<string> {
    const executable = path.join(cwd, 'fake-playhouse.mjs');
    await writeFile(executable, source);
    return executable;
}

describe('collectWithPlayhouse', () => {
    it('runs the Playhouse script and consumes a complete declared archive', async () => {
        const cwd = await tempDir('collect');
        await mkdir(path.join(cwd, 'archive'));
        await copyArchive(path.join(cwd, 'archive'), { declareHar: true });
        const names = [
            ...BASE,
            'main-document.json',
            'network.json',
            'diagnostics.json',
            'report.html',
            'network-{formFactor}-{cacheState}.json',
            'diagnostics-{formFactor}-{cacheState}.json',
        ];
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names), { rawArtifacts: [HAR] }))});else console.log(JSON.stringify({tool:'playhouse',command:'run',targetUrl:a[1],archiveDir:'archive',summary:{cells:[],runs:[]}}));`
        );
        expect(await collectWithPlayhouse({ bin }, home, cwd)).toEqual({
            label: 'home',
            url: 'https://example.com/',
            archiveDir: await realpath(path.join(cwd, 'archive')),
            playhouseVersion: '9.9.9',
        });
    });

    it('passes the requested run count to Playhouse', async () => {
        const cwd = await tempDir('runs');
        await copyArchive(path.join(cwd, 'archive'), { declareHar: true });
        const argvPath = path.join(cwd, 'argv.json');
        const names = [...BASE, 'main-document.json', 'network.json', 'diagnostics.json', 'report.html'];
        const bin = await fakePlayhouse(
            cwd,
            `import{writeFile}from'node:fs/promises';const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names), { rawArtifacts: [HAR] }))});else{await writeFile(${JSON.stringify(argvPath)},JSON.stringify(a));console.log(${RUN_RESULT});}`
        );
        await collectWithPlayhouse({ bin }, home, cwd, 5);
        expect(JSON.parse(await readFile(argvPath, 'utf8'))).toEqual([
            'run',
            'https://example.com',
            '--json',
            '--runs',
            '5',
            '--retry-pattern-html',
            'a^',
        ]);
    });

    it('reports the message of a Playhouse --json error', async () => {
        const cwd = await tempDir('json-error');
        const names = [...BASE, 'main-document.json', 'network.json', 'diagnostics.json'];
        const artifacts = names.map((name) => ({ path: name, schema: { type: 'object' } }));
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(artifacts))});else{console.error('progress noise');console.log(JSON.stringify({error:{name:'Error',message:'Navigation timed out',oclif:{exit:1}}}));process.exit(1);}`
        );
        const error = await collectWithPlayhouse({ bin }, home, cwd).then(
            () => undefined,
            (reason: unknown) => reason
        );
        expect((error as Error).message).toBe(
            'Playhouse command failed (run https://example.com/ --json --runs 1 --retry-pattern-html a^): Navigation timed out'
        );
    });

    it('reads the run result from the last stdout line', async () => {
        const cwd = await tempDir('last-line');
        await copyArchive(path.join(cwd, 'archive'));
        const names = [...BASE, 'main-document.json', 'network.json', 'diagnostics.json', 'report.html'];
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names), { rawArtifacts: [HAR] }))});else{console.log('a notice before the result');console.log(${RUN_RESULT});}`
        );
        const result = await collectWithPlayhouse({ bin }, home, cwd);
        expect(result.archiveDir).toBe(await realpath(path.join(cwd, 'archive')));
    });

    it('rejects a Playhouse whose describe has no tool.version', async () => {
        const cwd = await tempDir('no-version');
        const describeResult = JSON.stringify({
            tool: { name: 'playhouse' },
            archiveLifecycle: LIFECYCLE,
            artifacts: [],
            outputs: { runResult: { type: 'object' } },
        });
        const bin = await fakePlayhouse(
            cwd,
            `if(process.argv[2]==='describe')console.log(${JSON.stringify(describeResult)});else process.exit(99)`
        );
        await expect(collectWithPlayhouse({ bin }, home, cwd)).rejects.toThrow(/version/);
    });

    it('resolves real templated Playhouse descriptors and typed artifact shapes', async () => {
        const cwd = await tempDir('real');
        await copyArchive(path.join(cwd, 'archive'), { declareHar: true });
        const names = [
            ...BASE,
            'main-document-{formFactor}-{cacheState}.html',
            'network-{formFactor}-{cacheState}.json',
            'diagnostics-{formFactor}-{cacheState}.json',
            'report-{formFactor}-{cacheState}.html',
        ];
        const prefix = 'runs/{host}/{timestamp-params}/';
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names, prefix), { rawArtifacts: [{ ...HAR, path: prefix + HAR.path }] }))});else console.log(JSON.stringify({tool:'playhouse',command:'run',targetUrl:a[1],archiveDir:'archive',summary:{cells:[],runs:[]}}));`
        );
        expect((await collectWithPlayhouse({ bin }, home, cwd)).playhouseVersion).toBe('9.9.9');
    });

    it('accepts manifest-declared HTML reports even when describe omits or incompletely lists HTML descriptors', async () => {
        const cwd = await tempDir('manifest-html');
        await copyArchive(path.join(cwd, 'archive'));
        const names = [
            ...BASE,
            'main-document-{formFactor}-{cacheState}.json',
            'network-{formFactor}-{cacheState}.json',
            'diagnostics-{formFactor}-{cacheState}.json',
            'summary.html',
        ];
        const artifacts = names.map((name) => ({
            path: `runs/{host}/{timestamp-params}/${name}`,
            schema: { type: 'object' },
        }));
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(artifacts))});else console.log(${RUN_RESULT});`
        );
        expect((await collectWithPlayhouse({ bin }, home, cwd)).label).toBe('home');
    });

    it('rejects missing descriptors, invalid schemas, and symlink artifacts', async () => {
        const cwd = await tempDir('bad');
        await mkdir(path.join(cwd, 'archive'));
        const empty = JSON.stringify({
            tool: { name: 'playhouse', version: '1' },
            archiveLifecycle: LIFECYCLE,
            artifacts: [],
            outputs: { runResult: { type: 'object' } },
        });
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(empty)});`
        );
        await expect(collectWithPlayhouse({ bin }, home, cwd)).rejects.toThrow(/required artifact descriptor/);

        await copyArchive(path.join(cwd, 'archive'));
        await writeFile(path.join(cwd, 'outside.json'), '{}');
        const names = [...BASE, 'main-document.json', 'network.json', 'diagnostics.json', 'report.html'];
        await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names), { tool: { name: 'playhouse', version: '1' } }))});else console.log(${RUN_RESULT});`
        );
        await rm(path.join(cwd, 'archive', 'summary.json'));
        await symlink(path.join(cwd, 'outside.json'), path.join(cwd, 'archive', 'summary.json'));
        await expect(collectWithPlayhouse({ bin }, home, cwd)).rejects.toThrow(/symlink/);
    });

    it("hands Playhouse the user's environment and the chosen browser", async () => {
        const cwd = await tempDir('env');
        const envPath = path.join(cwd, 'env.json');
        const describeResult = JSON.stringify({
            tool: { version: '1' },
            archiveLifecycle: LIFECYCLE,
            artifacts: [],
            outputs: { runResult: {} },
        });
        const bin = await fakePlayhouse(
            cwd,
            `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(envPath)},JSON.stringify(process.env));console.log(${JSON.stringify(describeResult)});`
        );
        process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
        try {
            await expect(collectWithPlayhouse({ bin, browser: '/opt/chrome' }, home, cwd)).rejects.toThrow(
                /required artifact descriptor/
            );
        } finally {
            delete process.env.HTTPS_PROXY;
        }
        const env = JSON.parse(await readFile(envPath, 'utf8')) as Record<string, string>;
        expect(env.PLAYHOUSE_CHROME_PATH).toBe('/opt/chrome');
        expect(env.HTTPS_PROXY).toBe('http://proxy.example.com:8080');
        expect(env.PATH).toBe(process.env.PATH);
    });
});

describe('readExistingPlayhouseArchive', () => {
    it('checks every file in the manifest inventory', async () => {
        const cwd = await tempDir('inventory');
        const archive = path.join(cwd, 'archive');
        await copyArchive(archive);
        await mkdir(path.join(archive, 'runs', 'mobile-cold-1'), { recursive: true });
        await mkdir(path.join(archive, 'scripts'), { recursive: true });
        await writeFile(path.join(archive, 'profile-mobile-cold.json'), '{}');
        await writeFile(path.join(archive, 'trace-mobile-cold.json'), '{}');
        await writeFile(path.join(archive, 'runs', 'mobile-cold-1', 'document.json'), '{}');
        await writeFile(path.join(archive, 'runs', 'mobile-cold-1', 'network.har'), '{"log":{"entries":[]}}');
        await writeFile(path.join(archive, 'scripts', 'index.json'), '{}');
        const manifestPath = path.join(archive, 'manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
        manifest.medianArtifacts = ['network-mobile-cold.har'];
        manifest.profileArtifacts = ['profile-mobile-cold.json'];
        manifest.traceArtifacts = [
            {
                runId: 'mobile-cold-profile',
                kind: 'profiling',
                formFactor: 'mobile',
                cacheState: 'cold',
                path: 'trace-mobile-cold.json',
            },
        ];
        manifest.runs = [
            {
                runId: 'mobile-cold-1',
                formFactor: 'mobile',
                cacheState: 'cold',
                index: 1,
                isMedian: true,
                files: ['document.json', 'network.har'],
            },
        ];
        manifest.scriptCount = 1;
        await writeFile(manifestPath, JSON.stringify(manifest));
        const described = [
            ...BASE,
            'main-document.json',
            'network.json',
            'diagnostics.json',
            'network-{formFactor}-{cacheState}.json',
            'diagnostics-{formFactor}-{cacheState}.json',
            'profile-{formFactor}-{cacheState}.json',
            'runs/{runId}/document.json',
            'scripts/index.json',
        ];
        const raw = [
            'network-{formFactor}-{cacheState}.har',
            'trace-{formFactor}-{cacheState}.json',
            'runs/{runId}/network.har',
            'report.html',
            'report-{formFactor}-{cacheState}.html',
        ];
        const describeResult = describeJson(
            described.map((name) => ({ path: name, schema: { type: 'object' } })),
            {
                rawArtifacts: raw.map((name) => ({
                    path: name,
                    producedBy: 'playhouse',
                    contract: name.endsWith('.har') ? 'HAR 1.2' : 'raw',
                })),
            }
        );
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeResult)});else process.exit(99)`
        );
        await readExistingPlayhouseArchive({ bin }, home, archive, cwd);
        await rm(path.join(archive, 'runs', 'mobile-cold-1', 'network.har'));
        await expect(readExistingPlayhouseArchive({ bin }, home, archive, cwd)).rejects.toThrow(/ENOENT/);
    });

    it('validates and reads without invoking Playhouse run', async () => {
        const cwd = await tempDir('existing');
        const archive = path.join(cwd, 'archive');
        await copyArchive(archive);
        const names = [...BASE, 'main-document.json', 'network.json', 'diagnostics.json', 'report.html'];
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(declared(names)))});else{console.error('run must not be invoked');process.exit(99)}`
        );
        const result = await readExistingPlayhouseArchive({ bin }, home, archive, cwd);
        expect(result.playhouseVersion).toBe('9.9.9');
        expect(result.archiveDir).toBe(await realpath(archive));
    });

    it('supports Draft 2020-12 schemas from real Playhouse describe', async () => {
        const cwd = await tempDir('2020');
        const archive = path.join(cwd, 'archive');
        await copyArchive(archive);
        const names = [...BASE, 'document.json', 'network.json', 'diagnostics.json', 'report.html'];
        const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
        const artifacts = names.map((name) => ({
            path: name,
            schema: name.endsWith('.html') ? { type: 'string' } : schema,
        }));
        const bin = await fakePlayhouse(
            cwd,
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(describeJson(artifacts, { outputs: { runResult: schema } }))});else process.exit(99)`
        );
        expect((await readExistingPlayhouseArchive({ bin }, home, archive, cwd)).playhouseVersion).toBe('9.9.9');
    });

    it('rejects relative and symlink archive paths', async () => {
        const cwd = await tempDir('existing-bad');
        const archive = path.join(cwd, 'archive');
        await copyArchive(archive);
        const link = path.join(cwd, 'archive-link');
        await symlink(archive, link);
        await expect(readExistingPlayhouseArchive({ bin: '/nonexistent' }, home, 'archive', cwd)).rejects.toThrow(
            /absolute path/
        );
        await expect(readExistingPlayhouseArchive({ bin: '/nonexistent' }, home, link, cwd)).rejects.toThrow(/symlink/);
    });
});

describe('the bundled Playhouse', () => {
    it('resolves and its describe meets our contract', async () => {
        const bin = playhouseBin();
        expect(bin).toMatch(/node_modules[\\/]@salesforce[\\/]playhouse[\\/]/);
        const { version } = await inspectPlayhouse({ bin }, os.tmpdir());
        const manifest = createRequire(import.meta.url)('@salesforce/playhouse/package.json') as { version: string };
        expect(version).toBe(manifest.version);
    });
});
