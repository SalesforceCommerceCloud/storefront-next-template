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
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Command } from '@oclif/core';
import { afterEach, describe, it, expect, vi } from 'vitest';
import Catalog from './catalog';
import Finalize from './finalize';
import Prepare from './prepare';
import Progress from './progress';
import Serve from './serve';
import { VERSION } from '../../audit/assets';

// The audit verbs run in process, against the source, with a fake Playhouse script in place of the bundled one.

const FIXTURE_ARCHIVE = path.resolve(import.meta.dirname, '..', '..', 'audit', '__fixtures__', 'playhouse-archive');

// Just enough oclif config for Command.parse, which runs the preparse hook; Config.load would read the package's
// command manifest instead of these source classes.
const config = { bin: 'sfnext', runHook: () => Promise.resolve({ successes: [], failures: [] }) } as never;
afterEach(() => {
    vi.unstubAllEnvs();
});

type AuditCommand = new (argv: string[], config: never) => Command;
interface Outcome {
    /** What the command logged, one line per log call. */
    stdout: string;
    /** 0 on success; oclif's exit code (2 for usage errors) or 1 for any other error. */
    status: number;
    message: string;
}
async function sfnext(Cmd: AuditCommand, argv: string[]): Promise<Outcome> {
    const cmd = new Cmd(argv, config);
    const lines: string[] = [];
    vi.spyOn(cmd, 'log').mockImplementation((message?: string) => {
        lines.push(message ?? '');
    });
    try {
        await cmd.run();
        return { stdout: lines.join('\n'), status: 0, message: '' };
    } catch (error) {
        const exit = (error as { oclif?: { exit?: number } }).oclif?.exit;
        return {
            stdout: lines.join('\n'),
            status: exit ?? 1,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

/** A fresh temporary directory. */
const temp = (prefix: string) => mkdtemp(path.join(os.tmpdir(), prefix));

/** A project folder with only a package.json. */
async function project(name = 'store'): Promise<string> {
    const root = await temp('sfnext-audit-project-');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name }));
    return root;
}

/** Writes a fake Playhouse script and points prepare at it. Collection gets a stand-in browser unless `browser` is
 * false, so nothing is downloaded. */
async function fakePlayhouse(source: string, { browser = true } = {}): Promise<string> {
    const executable = path.join(await temp('sfnext-audit-bin-'), 'fake-playhouse.mjs');
    await writeFile(executable, source);
    vi.stubEnv('SFNEXT_AUDIT_PLAYHOUSE_BIN', executable);
    vi.stubEnv('PLAYHOUSE_CHROME_PATH', browser ? '/fake/chrome' : '');
    return executable;
}
/** An empty Playwright browser cache and an unreachable download host. */
async function noDownload(): Promise<void> {
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', await temp('sfnext-audit-browsers-'));
    vi.stubEnv('PLAYWRIGHT_DOWNLOAD_HOST', 'http://127.0.0.1:9');
}

/** A `describe` result listing `names`, each with a permissive schema. */
const describeResult = (names: string[], extra: Record<string, unknown> = {}) => ({
    tool: { name: 'playhouse', version: '9.9.9' },
    archiveLifecycle: { viewability: { requiresManifest: true, stateAuthority: 'manifest.archiveState' } },
    artifacts: names.map((name) => ({
        path: name,
        schema: name.endsWith('.html') ? { type: 'string' } : { type: 'object' },
    })),
    outputs: { runResult: { type: 'object' } },
    ...extra,
});
const SCHEMA_NAMES = [
    'manifest.json',
    'summary.json',
    'opportunities.json',
    'summary-tbt.json',
    'summary-lcp.json',
    'summary-third-party.json',
    'main-document.json',
    'network.json',
    'diagnostics.json',
    'report.html',
];

const RUN_ID = '2026-09-16T00-00-00Z';
/** A workspace's only run folder; the finalize tests below each create one run. */
const runOf = (workspace: string) => path.join(workspace, 'runs', RUN_ID);

/** A prepared workspace with one run and one page whose archive lives at playhouse/archive in the run. */
async function preparedWorkspace(overrides: Record<string, unknown> = {}): Promise<string> {
    const workspace = await temp('sfnext-audit-e2e-');
    await cp(FIXTURE_ARCHIVE, path.join(runOf(workspace), 'playhouse', 'archive'), { recursive: true });
    const prepared = {
        schemaVersion: '1.0',
        run: { id: RUN_ID, generatedAt: '2026-09-16T00:00:00.000Z', toolVersion: VERSION, playhouseVersion: '1.0.0' },
        project: { root: '/tmp/store', packageName: 'fixture-store' },
        pages: [{ label: 'home', url: 'https://example.com/?token=page-secret', archiveDir: 'playhouse/archive' }],
        pageFailures: [],
        expectedPages: ['home'],
        coverage: [],
        rules: [
            {
                ruleId: 'seo/meta-description',
                title: 'Meta Description',
                file: 'meta-description.md',
                output: 'ai-analysis/categories/seo/rules/meta-description.json',
            },
        ],
        decidedFindings: [],
        ...overrides,
    };
    await writeFile(path.join(runOf(workspace), 'prepared.json'), JSON.stringify(prepared));
    return workspace;
}
/** Write `file` relative to `run`, a run folder. */
async function writeAi(run: string, file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(path.join(run, file)), { recursive: true });
    await writeFile(path.join(run, file), JSON.stringify(value));
}
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const readEvents = async (file: string) =>
    (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { type: string; stageId?: string; message?: string });
const finalizeIn = (workspace: string, ...argv: string[]) => sfnext(Finalize, ['--workspace', workspace, ...argv]);
type Evaluation = { ruleId: string; disposition: string; severity?: string; method?: string; title?: string };
const evaluation = (audit: { evaluations: Evaluation[] }, ruleId: string) => {
    const found = audit.evaluations.find((item) => item.ruleId === ruleId);
    if (!found) throw new Error(`No evaluation for ${ruleId}`);
    return found;
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('audit finalize', () => {
    it('merges ai-analysis/ and writes a sanitized audit-result.json', async () => {
        const workspace = await preparedWorkspace();
        const summaryPath = path.join(runOf(workspace), 'playhouse/archive/summary.json');
        const summary = await readJson(summaryPath);
        summary.console = [{ text: 'access_token=console-secret', url: 'https://example.com/?api_key=url-secret' }];
        summary.nestedPath = '/Users/alice/private/summary.json';
        await writeFile(summaryPath, JSON.stringify(summary));
        await writeAi(runOf(workspace), 'ai-analysis/categories/seo/rules/meta-description.json', {
            ruleId: 'seo/meta-description',
            disposition: 'finding',
            severity: 'low',
            summary: 'Missing description',
            evidence: [{ type: 'playhouse', page: 'home', artifact: 'report.html' }],
        });
        await writeAi(runOf(workspace), 'ai-analysis/summary.json', {
            narrative: 'Fixture',
            highlights: ['Fix the PDP meta description.'],
            observations: [],
            coverage: [],
        });

        const result = await finalizeIn(workspace);

        expect(result.status, result.message).toBe(0);
        expect(result.stdout).toBe(path.join(runOf(workspace), 'audit-result.json'));
        const persisted = await readFile(path.join(runOf(workspace), 'audit-result.json'), 'utf8');
        for (const secret of ['page-secret', 'console-secret', 'url-secret', '/Users/alice/private', workspace])
            expect(persisted).not.toMatch(new RegExp(escape(secret)));
        expect(persisted).toMatch(/\[REDACTED\]/);
        expect(persisted).toMatch(/fixture-store/);
        const audit = JSON.parse(persisted);
        const meta = evaluation(audit, 'seo/meta-description');
        expect(meta.title).toBe('Meta Description');
        expect(audit.pages[0].playhouse.lighthouseVersion).toBe('13.0.0');
        expect(Object.keys(audit.pages[0].playhouse.artifacts).sort()).toEqual([
            'network-mobile-cold.json',
            'opportunities.json',
            'report-mobile-cold.html',
            'summary-lcp.json',
            'summary.json',
        ]);
        expect(meta.method).toBe('ai');
        // An analysis may lower the rule severity.
        expect(meta.severity).toBe('low');
        expect(audit.evaluations.some((item: Evaluation) => item.disposition === 'not-verified')).toBe(true);
        expect(audit.summary.highlights).toEqual(['Fix the PDP meta description.']);
        // Guidance comes from the findings; not-verified rules never change it.
        expect(audit.summary.guidance).toBe('go');
    });

    it('names the ai-analysis file it rejects', async () => {
        const cases: Array<[string, unknown, RegExp]> = [
            [
                'ai-analysis/categories/seo/rules/meta-description.json',
                { ruleId: 'seo/title', disposition: 'not-verified', summary: 'x', evidence: [] },
                /meta-description\.json: ruleId seo\/title does not match/,
            ],
            [
                'ai-analysis/categories/seo/rules/meta-description.json',
                { ruleId: 'seo/meta-description', disposition: 'maybe', summary: 'x', evidence: [] },
                /meta-description\.json:.*disposition/s,
            ],
            [
                'ai-analysis/categories/seo/rules/meta-description.json',
                {
                    ruleId: 'seo/meta-description',
                    disposition: 'finding',
                    summary: 'x',
                    evidence: [{ type: 'playhouse', page: 'home', artifact: 'nope.json' }],
                },
                /meta-description\.json: Unknown Playhouse evidence artifact/,
            ],
            [
                'ai-analysis/categories/security/rules/strict-transport-security.json',
                { ruleId: 'security/strict-transport-security', disposition: 'pass', summary: 'x', evidence: [] },
                /strict-transport-security\.json: security\/strict-transport-security was decided by its script/,
            ],
            [
                'ai-analysis/categories/seo/rules/meta-description.json',
                {
                    ruleId: 'seo/meta-description',
                    disposition: 'not-verified',
                    summary: 'x',
                    evidence: [],
                    waterfall: { pages: [] },
                },
                /meta-description\.json: waterfall is only supported on performance\/server-request-waterfall/,
            ],
            [
                'ai-analysis/categories/seo/rules/meta-description.json',
                { ruleId: 'seo/meta-description', disposition: 'pass', summary: 'x', evidence: [] },
                /meta-description\.json: seo\/meta-description pass requires evidence/,
            ],
            ['ai-analysis/summary.json', { observations: [] }, /ai-analysis\/summary\.json:.*narrative/s],
            [
                'ai-analysis/summary.json',
                { narrative: 'x', highlights: ['1', '2', '3', '4', '5', '6', '7'], observations: [] },
                /ai-analysis\/summary\.json:.*highlights/s,
            ],
        ];
        for (const [file, value, pattern] of cases) {
            const workspace = await preparedWorkspace();
            await writeAi(runOf(workspace), file, value);
            const result = await finalizeIn(workspace);
            expect(result.status, file).not.toBe(0);
            expect(result.message, file).toMatch(pattern);
        }
    });

    it('ends the run with run.error when it fails, and completes it once when fixed', async () => {
        const workspace = await preparedWorkspace();
        const eventsFile = path.join(runOf(workspace), 'events.ndjson');
        const file = 'ai-analysis/categories/seo/rules/meta-description.json';
        await writeAi(runOf(workspace), file, {
            ruleId: 'seo/meta-description',
            disposition: 'maybe',
            summary: 'x',
            evidence: [],
        });
        expect((await finalizeIn(workspace)).status).not.toBe(0);
        const [failure] = await readEvents(eventsFile);
        expect(failure?.type).toBe('run.error');
        expect(failure?.stageId).toBe('analyze');
        expect(failure?.message).toMatch(/meta-description\.json:.*disposition/s);

        await writeAi(runOf(workspace), file, {
            ruleId: 'seo/meta-description',
            disposition: 'not-verified',
            summary: 'x',
            evidence: [],
        });
        for (let attempt = 0; attempt < 2; attempt++)
            expect((await finalizeIn(workspace)).status, `finalize ${attempt + 1}`).toBe(0);
        const types = (await readEvents(eventsFile)).map((event) => event.type);
        // Finalizing again does not repeat run.complete.
        expect(types.filter((type) => type === 'run.complete')).toHaveLength(1);
        expect(types.at(-1)).toBe('run.complete');

        // A later finalize that fails reports it, but the completed run stays complete in the log.
        await writeAi(runOf(workspace), file, {
            ruleId: 'seo/meta-description',
            disposition: 'maybe',
            summary: 'x',
            evidence: [],
        });
        const again = await finalizeIn(workspace);
        expect(again.status).not.toBe(0);
        expect(again.message).toMatch(/disposition/);
        expect((await readEvents(eventsFile)).map((event) => event.type)).toEqual(types);
    });

    it('completes each run in an --events file shared across runs', async () => {
        const shared = path.join(await temp('sfnext-audit-shared-events-'), 'events.ndjson');
        const start = (runId: string) =>
            `${JSON.stringify({ type: 'run.start', runId, startedAt: '2026-09-16T00:00:00.000Z', plan: [], at: '2026-09-16T00:00:00.000Z' })}\n`;
        for (const runId of ['first', 'second']) {
            const workspace = await preparedWorkspace();
            await writeAi(runOf(workspace), 'ai-analysis/categories/seo/rules/meta-description.json', {
                ruleId: 'seo/meta-description',
                disposition: 'not-verified',
                summary: 'x',
                evidence: [],
            });
            await writeFile(shared, start(runId), { flag: 'a' });
            const result = await finalizeIn(workspace, '--events', shared);
            expect(result.status, result.message).toBe(0);
        }
        const types = (await readEvents(shared)).map((event) => event.type);
        // The second run completes too.
        expect(types.filter((type) => type === 'run.complete')).toHaveLength(2);
        expect(types.at(-1)).toBe('run.complete');
    });

    it('rejects a prepared.json written by another tool version', async () => {
        const workspace = await preparedWorkspace();
        const preparedPath = path.join(runOf(workspace), 'prepared.json');
        const prepared = await readJson(preparedPath);
        prepared.run.toolVersion = '0.0.1';
        await writeFile(preparedPath, JSON.stringify(prepared));
        const result = await finalizeIn(workspace);
        expect(result.status).not.toBe(0);
        expect(result.message).toBe(
            `prepared.json was written by storefront-next-dev 0.0.1, but this is ${VERSION}; re-run prepare`
        );
    });

    it('rejects invalid prepared provenance', async () => {
        const workspace = await temp('sfnext-audit-prepared-');
        await mkdir(runOf(workspace), { recursive: true });
        await writeFile(
            path.join(runOf(workspace), 'prepared.json'),
            JSON.stringify({ project: { root: '/tmp/store' } })
        );
        const result = await finalizeIn(workspace);
        expect(result.status).not.toBe(0);
        expect(result.message).toMatch(/prepared\.json.*invalid/i);
    });

    it('finalizes .site-audit in the project directory when --workspace is absent', async () => {
        const workspace = await preparedWorkspace();
        const root = await project();
        await cp(workspace, path.join(root, '.site-audit'), { recursive: true });
        await writeAi(runOf(path.join(root, '.site-audit')), 'ai-analysis/categories/seo/rules/meta-description.json', {
            ruleId: 'seo/meta-description',
            disposition: 'not-verified',
            summary: 'x',
            evidence: [],
        });
        const result = await sfnext(Finalize, ['-d', root]);
        expect(result.status, result.message).toBe(0);
        expect(result.stdout).toBe(path.join(runOf(path.join(root, '.site-audit')), 'audit-result.json'));
    });
});

describe('audit prepare', () => {
    it('preserves successful pages, records failures and missing defaults, and finalize cannot override provenance', async () => {
        const root = await project();
        const binDir = await temp('sfnext-audit-argv-');
        const argvPath = path.join(binDir, 'argv.json');
        await fakePlayhouse(
            `import{cp,readFile,writeFile}from'node:fs/promises';const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(JSON.stringify(describeResult(SCHEMA_NAMES)))});else if(a[1].includes('/bad'))process.exit(4);else{await writeFile(${JSON.stringify(argvPath)},JSON.stringify(a));await cp(${JSON.stringify(FIXTURE_ARCHIVE)},'archive-home',{recursive:true});const m=JSON.parse(await readFile('archive-home/manifest.json'));m.targetUrl=a[1];await writeFile('archive-home/manifest.json',JSON.stringify(m));console.log(JSON.stringify({tool:'playhouse',command:'run',targetUrl:a[1],archiveDir:'archive-home',summary:{}}));}`
        );

        const prepare = await sfnext(Prepare, [
            '-d',
            root,
            '--no-build',
            '--url',
            'home=https://example.com/?session=secret#private',
            '--url',
            'plp=https://example.com/bad?token=secret#private',
        ]);

        expect(prepare.status, prepare.message).toBe(0);
        expect(await readJson(argvPath)).toEqual([
            'run',
            'https://example.com/?session=secret#private',
            '--json',
            '--runs',
            '1',
            '--retry-pattern-html',
            'a^',
        ]);
        const workspace = path.join(root, '.site-audit');
        // prepare prints the new run's prepared.json.
        const run = path.dirname(prepare.stdout.trim());
        expect(path.dirname(run)).toBe(path.join(await realpath(workspace), 'runs'));
        const prepared = await readJson(path.join(run, 'prepared.json'));
        expect(prepared.run.id).toBe(path.basename(run));
        expect(prepared.pages.map((page: { label: string }) => page.label)).toEqual(['home']);
        expect(prepared.pages[0].url).toBe('https://example.com/?session=%5BREDACTED%5D');
        expect(prepared.pageFailures[0].label).toBe('plp');
        expect(prepared.pageFailures[0].url).toBe('https://example.com/bad?token=%5BREDACTED%5D');
        expect(JSON.stringify({ pages: prepared.pages, pageFailures: prepared.pageFailures })).not.toMatch(
            /secret|#private/
        );
        expect(
            prepared.coverage.some(
                (item: { page: string; status: string }) => item.page === 'pdp' && item.status === 'missing'
            )
        ).toBe(true);
        expect(prepared.pages[0].archiveDir).toBe('playhouse/archive-home');
        expect(prepared.run.playhouseVersion).toBe('9.9.9');
        expect(prepared.rules.length).toBeGreaterThan(0);
        await expect(readFile(path.join(run, 'analysis-template.json'))).rejects.toThrow(/ENOENT/);

        await mkdir(path.join(run, 'ai-analysis'));
        await writeFile(
            path.join(run, 'ai-analysis/summary.json'),
            JSON.stringify({
                narrative: 'x',
                project: { root: '/evil' },
                pages: [],
                catalog: { categories: [], ruleIds: [] },
            })
        );
        const finalize = await finalizeIn(workspace);
        expect(finalize.status, finalize.message).toBe(0);
        const result = await readJson(path.join(run, 'audit-result.json'));
        expect(result.project.root).toBeUndefined();
        expect(result.project.name).toBe('store');
        expect(result.pages.map((page: { label: string }) => page.label)).toEqual(['home']);
        expect(result.catalog.ruleIds.length).toBeGreaterThan(prepared.rules.length - 1);
    });

    it('ends its run with run.error when it fails part-way', async () => {
        const root = await project();
        // The page fails to collect, and a folder where prepared.json goes makes writing it fail after run.start.
        await fakePlayhouse(
            `import{mkdir}from'node:fs/promises';await mkdir('../prepared.json',{recursive:true});process.exit(4);`
        );
        const prepare = await sfnext(Prepare, ['-d', root, '--no-build', '--url', 'home=https://example.com/']);
        expect(prepare.status).not.toBe(0);
        expect(prepare.message).toMatch(/EISDIR/);
        const [run = ''] = await readdir(path.join(root, '.site-audit', 'runs'));
        const events = await readEvents(path.join(root, '.site-audit', 'runs', run, 'events.ndjson'));
        expect(events[0]?.type).toBe('run.start');
        expect(events.at(-1)?.type).toBe('run.error');
        // A failed prepare is not resumable.
        expect(events.at(-1)?.stageId).toBeUndefined();
    });

    it('ends the run with run.error before any page is collected when the Chromium download fails', {
        timeout: 120_000,
    }, async () => {
        const root = await project();
        await fakePlayhouse(`console.error('Playhouse must not run');process.exit(99);`, { browser: false });
        await noDownload();
        const prepare = await sfnext(Prepare, ['-d', root, '--no-build', '--url', 'home=https://example.com/']);
        expect(prepare.status).not.toBe(0);
        expect(prepare.message).toMatch(/Could not download Chromium for Playhouse: connect ECONNREFUSED/);
        expect(prepare.message).toMatch(/npx playwright-core@\d+\.\d+\.\d+ install chromium --no-shell/);
        const [run = ''] = await readdir(path.join(root, '.site-audit', 'runs'));
        const events = await readEvents(path.join(root, '.site-audit', 'runs', run, 'events.ndjson'));
        expect(events.some((event) => event.type === 'log' && /Downloading Chromium/.test(event.message ?? ''))).toBe(
            true
        );
        expect(events.at(-1)?.type).toBe('run.error');
        expect(events.at(-1)?.message).toMatch(/Could not download Chromium/);
        // No page starts without a browser.
        expect(events.some((event) => event.type === 'stage.start')).toBe(false);
    });

    it('rejects non-positive and non-integer run counts', async () => {
        const root = await project();
        for (const runs of ['0', '-1', '1.5', 'nope', '999999999999999999999']) {
            const result = await sfnext(Prepare, ['-d', root, '--runs', runs]);
            expect(result.status, runs).toBe(2);
            expect(result.message, runs).toMatch(/Parsing --runs|Flag --runs expects a value/);
        }
    });

    it('reuses an archive, prepares pilot rules, and finalizes deterministic passes', { timeout: 30_000 }, async () => {
        const root = await project('archive-store');
        const archive = path.join(await temp('sfnext-audit-archive-'), 'home');
        await cp(FIXTURE_ARCHIVE, archive, { recursive: true });
        const manifestPath = path.join(archive, 'manifest.json');
        const manifest = await readJson(manifestPath);
        manifest.targetUrl = 'https://example.com/';
        manifest.medianArtifacts.push('network-mobile-cold.har');
        await writeFile(manifestPath, JSON.stringify(manifest));
        // A link out of the archive (a junction on Windows, which needs no admin rights) must not be copied into the run.
        const outside = await temp('sfnext-audit-outside-');
        await writeFile(path.join(outside, 'secret.txt'), 'not for the run');
        await symlink(outside, path.join(archive, 'outside'), 'junction');
        const names = [
            ...SCHEMA_NAMES,
            'network-{formFactor}-{cacheState}.json',
            'diagnostics-{formFactor}-{cacheState}.json',
        ];
        const describeJson = describeResult(names, {
            rawArtifacts: [
                { path: 'network-{formFactor}-{cacheState}.har', producedBy: 'playhouse', contract: 'HAR 1.2' },
            ],
        });
        await fakePlayhouse(
            `const a=process.argv.slice(2);if(a[0]==='describe')console.log(${JSON.stringify(JSON.stringify(describeJson))});else process.exit(99)`,
            { browser: false }
        );
        await noDownload();
        const out = path.join(root, '.site-audit');
        const prepareArgs = [
            '-d',
            root,
            '--no-build',
            '--workspace',
            out,
            '--url',
            'home=https://example.com/',
            '--archive',
            `home=${archive}`,
            '--expected-page',
            'home',
        ];
        const prepare = await sfnext(Prepare, prepareArgs);
        expect(prepare.status, prepare.message).toBe(0);
        const run = path.dirname(prepare.stdout.trim());
        const prepared = await readJson(path.join(run, 'prepared.json'));
        expect(prepared.pages.map((page: { label: string }) => page.label)).toEqual(['home']);
        expect(prepared.pageFailures).toHaveLength(0);
        await expect(access(path.join(run, prepared.pages[0].archiveDir, 'outside'))).rejects.toThrow();
        await expect(access(path.join(run, prepared.pages[0].archiveDir, 'manifest.json'))).resolves.toBeUndefined();
        const ruleIds = prepared.rules.map((rule: { ruleId: string }) => rule.ruleId);
        // Script-decided rules never reach the AI.
        expect(ruleIds).not.toContain('security/strict-transport-security');
        const decided = [
            'performance/lcp-budget',
            'performance/tbt-budget',
            'performance/cls-budget',
            'performance/ttfb-budget',
            'security/content-security-policy',
            'security/browser-hardening-headers',
            'performance/content-encoding',
            'performance/cache-control',
            'performance/render-blocking-font-size',
        ];
        for (const ruleId of decided) expect(ruleIds, `${ruleId} is decided by its script`).not.toContain(ruleId);
        const csp = prepared.rules.find(
            (rule: { ruleId: string }) => rule.ruleId === 'security/csp-runtime-compatibility'
        );
        expect(csp).toEqual({
            ruleId: 'security/csp-runtime-compatibility',
            title: csp.title,
            file: csp.file,
            output: 'ai-analysis/categories/security/rules/csp-runtime-compatibility.json',
        });
        expect(prepared.decidedFindings).toEqual([]);
        // A reused archive is copied into the run.
        expect(prepared.pages[0].archiveDir).toBe('playhouse/home');
        await readFile(path.join(run, 'playhouse/home/manifest.json'));
        await writeAi(run, csp.output, {
            ruleId: csp.ruleId,
            disposition: 'pass',
            summary: 'No CSP violations were captured.',
            evidence: [{ type: 'playhouse', page: 'home', artifact: 'summary.json' }],
        });
        const finalize = await finalizeIn(out);
        expect(finalize.status, finalize.message).toBe(0);
        const result = await readJson(path.join(run, 'audit-result.json'));
        expect(evaluation(result, 'security/strict-transport-security').disposition).toBe('pass');
        for (const ruleId of decided) expect(evaluation(result, ruleId).disposition, ruleId).toBe('pass');
        expect(evaluation(result, 'security/csp-runtime-compatibility').disposition).toBe('pass');
        expect(evaluation(result, 'security/strict-transport-security').method).toBe('script');

        const hstsResultPath = path.join(run, 'results/categories/security/rules/strict-transport-security.json');
        const hstsResult = await readJson(hstsResultPath);
        hstsResult.decision.status = 'fail';
        hstsResult.decision.summary = 'The HSTS baseline failed.';
        await writeFile(hstsResultPath, JSON.stringify(hstsResult));
        const finalizeFailure = await finalizeIn(out);
        expect(finalizeFailure.status, finalizeFailure.message).toBe(0);
        const hsts = evaluation(
            await readJson(path.join(run, 'audit-result.json')),
            'security/strict-transport-security'
        ) as Evaluation & { remediation: string; description: string };
        expect(hsts.disposition).toBe('finding');
        expect(hsts.severity).toBe('high');
        // Remediation comes from the rule markdown; the description from its Intent.
        expect(hsts.remediation).toMatch(/\S/);
        expect(hsts.description).toMatch(/always use HTTPS/);
        // A script can lower a failure's severity by its measured impact, but not raise it past the rule's.
        for (const [severity, expected] of [
            ['low', 'low'],
            ['critical', 'high'],
        ] as const) {
            hstsResult.decision.severity = severity;
            await writeFile(hstsResultPath, JSON.stringify(hstsResult));
            expect((await finalizeIn(out)).status).toBe(0);
            expect(
                evaluation(await readJson(path.join(run, 'audit-result.json')), 'security/strict-transport-security')
                    .severity,
                severity
            ).toBe(expected);
        }

        // Run ids have one-second resolution.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const again = await sfnext(Prepare, prepareArgs);
        expect(again.status, again.message).toBe(0);
        const next = path.dirname(again.stdout.trim());
        // Every prepare starts a new run, without analysis.
        expect(next).not.toBe(run);
        await expect(readFile(path.join(next, csp.output))).rejects.toThrow(/ENOENT/);
        await readFile(path.join(run, 'audit-result.json'));
        // Finalize works on the latest run.
        expect((await finalizeIn(out)).status).toBe(0);
        await readFile(path.join(next, 'audit-result.json'));
    });
});

describe('audit command usage errors', () => {
    it('rejects bad flags with exit code 2', async () => {
        const root = await project();
        const cases: Array<[AuditCommand, string[], RegExp]> = [
            [Catalog, ['--nonexistent'], /Nonexistent flag: --nonexistent/],
            [Serve, ['--open=yes'], /Unexpected argument: yes/],
            [Prepare, ['-d', root, '--runs'], /Flag --runs expects a value/],
            [Serve, ['--port', '8787', '--port', '8788'], /--port=8788 also provided|can only be specified once/],
            [Serve, ['--port', '99999'], /Parsing --port/],
            [Catalog, ['extra'], /Unexpected argument: extra/],
            [Prepare, ['-d', root, '--url', 'home=https://example.com/', 'stray'], /Unexpected argument: stray/],
            [Serve, ['--workspace', root, '--input', path.join(root, 'audit-result.json')], /cannot also be provided/],
            [Progress, ['-d', root], /Missing required flag event/],
        ];
        for (const [Cmd, argv, pattern] of cases) {
            const result = await sfnext(Cmd, argv);
            expect(result.status, argv.join(' ')).toBe(2);
            expect(result.message, argv.join(' ')).toMatch(pattern);
        }
    });

    it('rejects an empty --workspace instead of using the current directory', async () => {
        for (const [Cmd, argv] of [
            [Finalize, ['--workspace', '']],
            [Finalize, ['--workspace=']],
            [Serve, ['--workspace', '']],
            [Progress, ['--workspace', '', '--event', '{"type":"log","level":"info","message":"x"}']],
            [Prepare, ['--workspace', '']],
        ] as Array<[AuditCommand, string[]]>) {
            const result = await sfnext(Cmd, argv);
            expect(result.status, argv.join(' ')).toBe(2);
            expect(result.message, argv.join(' ')).toMatch(/Parsing --workspace\s+needs a value/);
        }
    });

    it('fails progress with exit 1 for an --event that is not JSON', async () => {
        const result = await sfnext(Progress, ['-d', await project(), '--event', 'nope']);
        expect(result.status).toBe(1);
        expect(result.message).toBe('--event must be a JSON object');
    });

    it('reports a busy serve port as a usable error', async () => {
        const blocker = createServer();
        await new Promise<void>((resolve) => blocker.listen(0, 'localhost', resolve));
        const address = blocker.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        try {
            const result = await sfnext(Serve, ['-d', await project(), '--no-open', '--port', String(port)]);
            expect(result.status).toBe(1);
            expect(result.stdout).toBe('');
            expect(result.message).toBe(`Port ${port} is in use; pass --port <n> to use another one`);
            expect(result.message).not.toMatch(/EADDRINUSE|\n\s+at /);
        } finally {
            blocker.close();
        }
    });
});
