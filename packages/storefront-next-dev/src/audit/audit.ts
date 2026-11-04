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
import { access, cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { discoverCatalog, defaultCategoriesDir, type AuditRule } from './catalog';
import { perfFromSummary } from './measured-run';
import { resolveProject } from './project';
import {
    collectWithPlayhouse,
    ensureBrowser,
    playhouseBin,
    readExistingPlayhouseArchive,
    type PageTarget,
    type Playhouse,
    type PlayhouseCollection,
} from './playhouse';
import {
    LIGHTHOUSE_REPORT,
    auditResultSchema,
    evaluationSchema,
    parsePrepared,
    validateAuditResult,
    validateEvidence,
    validateRecommendations,
    validateWaterfall,
    type ArchiveFiles,
    type Evidence,
} from './results';
import { listArchiveFiles, PlayhouseArtifactReader } from './evidence';
import { appendEvent, latestRunEvents, readEvents } from './events';
import { latestRunDir, runDir, runIdFor } from './runs';
import { sanitizeText } from './sanitize';
import {
    aiAnalysisPathForRule,
    prepareRuleResults,
    readPreparedRuleResults,
    type PreparedRuleOutput,
} from './preparation';
import { analyzeBundle, type BuildOutputs } from './bundle/analyze';
import { buildForAnalysis } from './bundle/build';
import {
    BUNDLE_ANALYSIS,
    BUNDLE_DIR,
    BUNDLE_SCHEMA_VERSION,
    bundleAnalysisSchema,
    type BundleAnalysis,
} from './bundle/schema';

import { AUDIT_ROOT, VERSION } from './assets';

const EVALUATE_RULE_INSTRUCTIONS = path.join(AUDIT_ROOT, 'instructions', 'evaluate-rule.md');

export { VERSION };

export interface PrepareOptions {
    /** Pages to audit, as `label=url`. */
    urls?: readonly string[];
    /** Completed Playhouse archives to reuse, as `label=/absolute/dir`. */
    archives?: readonly string[];
    expectedPages?: readonly string[];
    project?: string;
    /** The audit workspace (default: <project>/.site-audit). */
    workspace?: string;
    runs?: number;
    allowHttp?: boolean;
    categories?: string;
    events?: string;
    /** Build the project for the bundle analysis (default true). */
    build?: boolean;
}
export interface FinalizeOptions {
    workspace: string;
    categories?: string;
    events?: string;
}

/** The event log of the run a step is working on, so a failure can end it with run.error. */
interface ActiveRun {
    eventsFile: string;
    stageId?: string;
}

/** Ends the run a failed step was working on with run.error, so the dashboard shows the failure instead of waiting. */
async function failRun<T>(step: (active: { run?: ActiveRun }) => Promise<T>): Promise<T> {
    const active: { run?: ActiveRun } = {};
    try {
        return await step(active);
    } catch (error) {
        if (active.run)
            await emit(active.run.eventsFile, {
                type: 'run.error',
                message: sanitizeText(error instanceof Error ? error.message : String(error)),
                ...(active.run.stageId ? { stageId: active.run.stageId } : {}),
            });
        throw error;
    }
}

const targets = (urls: readonly string[], allowHttp: boolean): PageTarget[] =>
    urls.map((entry) => {
        const split = entry.indexOf('=');
        if (split < 1) throw new Error('--url must use label=https://…');
        const target = { label: entry.slice(0, split), url: entry.slice(split + 1) };
        const parsed = new URL(target.url);
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('URL must use http(s)');
        if (parsed.username || parsed.password) throw new Error('URL credentials are not allowed');
        if (parsed.protocol === 'http:' && !allowHttp) throw new Error('HTTP requires explicit --allow-http');
        return target;
    });
const archives = (values: readonly string[]): Map<string, string> => {
    const entries = values.map((entry) => {
        const split = entry.indexOf('=');
        if (split < 1 || !path.isAbsolute(entry.slice(split + 1)))
            throw new Error('--archive must use label=/absolute/archive');
        return { label: entry.slice(0, split), value: entry.slice(split + 1) };
    });
    assertUniqueLabels(entries);
    return new Map(entries.map(({ label, value }) => [label, value]));
};
async function writeJson(file: string, value: unknown): Promise<void> {
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
const PAGE_LABEL = /^[a-z][a-z0-9-]{0,63}$/;
function assertUniqueLabels(items: readonly { label: string }[]): void {
    const labels = new Set<string>();
    for (const { label } of items) {
        if (!PAGE_LABEL.test(label)) throw new Error(`Invalid page label: ${label}`);
        if (labels.has(label)) throw new Error(`Duplicate page label: ${label}`);
        labels.add(label);
    }
}
/** The run's progress event log, unless --events <file> names another. */
export function eventsFileFor(events: string | undefined, run: string): string {
    return events === undefined ? path.join(run, 'events.ndjson') : path.resolve(events);
}
/** Best-effort event emission: progress reporting must never fail the audit. */
async function emit(file: string, event: unknown): Promise<void> {
    try {
        await appendEvent(file, event);
    } catch {
        /* progress is advisory */
    }
}

/** Strip Playhouse's animated stderr progress frames (ANSI colors and
 * `[███░░░] 42% mobile/cold run 1/3` bars) from an error message so the real
 * failure reads cleanly in the activity log. */
function stripProgressNoise(message: string): string {
    return (
        message
            // oxlint-disable-next-line no-control-regex -- matching ESC is the point
            .replace(/\x1b\[[0-9;]*m/g, '') // ANSI SGR codes
            .replace(/\[[▀-▓\s]*\]/g, '') // bracketed block-char progress bars
            .replace(/\s*\d+%\s*[\w/]*(?:\s+run\s+\d+\/\d+|\s+profiling)?/g, '') // "42% mobile/cold run 1/3"
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/** Collects Playhouse evidence for each page and writes the run's prepared.json; returns its path. */
export function prepare(options: PrepareOptions): Promise<string> {
    return failRun(async (active) => {
        const runs = options.runs ?? 1;
        const project = await resolveProject(options.project ?? process.cwd());
        const customCategories = options.categories !== undefined;
        const catalog = await discoverCatalog(options.categories ?? defaultCategoriesDir());
        const workspace = path.resolve(options.workspace ?? path.join(project.root, '.site-audit'));
        const requestedTargets = targets(options.urls ?? [], options.allowHttp === true);
        assertUniqueLabels(requestedTargets);
        const requestedArchives = archives(options.archives ?? []);
        const pages: PlayhouseCollection[] = [];
        const pageFailures: Array<PageTarget & { error: string }> = [];
        for (const label of requestedArchives.keys())
            if (!requestedTargets.some((target) => target.label === label))
                throw new Error(`--archive ${label} requires a matching --url ${label}=https://…`);
        // Seed the live progress screen: run.start carries the full step plan (one
        // Lighthouse stage per page, then analysis + compile) so the dashboard shows
        // every step from the first second. The client reducer builds its step list
        // from this event, so it must precede any stage/page events.
        const startedAt = new Date().toISOString();
        const runId = runIdFor(startedAt);
        // Each run gets a new folder that holds everything it reads and writes.
        const run = runDir(workspace, runId);
        await mkdir(path.dirname(run), { recursive: true });
        await mkdir(run);
        const preparedPath = path.join(run, 'prepared.json');
        const eventsFile = eventsFileFor(options.events, run);
        const homeTarget = requestedTargets.find((target) => target.label === 'home') ?? requestedTargets[0];
        await emit(eventsFile, {
            type: 'run.start',
            runId,
            startedAt,
            target: homeTarget ? { url: sanitizeTargetUrl(homeTarget.url) } : undefined,
            plan: [
                ...requestedTargets.map((target) => ({
                    id: target.label,
                    title: `Lighthouse · ${target.label}`,
                    detail: sanitizeTargetUrl(target.url),
                })),
                {
                    id: BUNDLE_STAGE,
                    title: 'Bundle analysis',
                    detail:
                        options.build === false
                            ? 'Measure the first-party JavaScript each page loaded'
                            : 'Build the project and break down the JavaScript each page loaded',
                },
                {
                    id: 'analyze',
                    title: 'AI code analysis',
                    detail: 'Evaluate the rule catalog against collected evidence and the repository',
                },
                {
                    id: 'compile',
                    title: 'Compile report',
                    detail: 'Validate analysis, score findings, and write the report',
                },
            ],
        });
        // From here a failure ends the run with run.error, which needs the run.start above to show.
        active.run = { eventsFile };
        // Reused archives need no browser, so an archive-only run never downloads one.
        const collects = requestedTargets.some((target) => !requestedArchives.has(target.label));
        const browser = collects
            ? await ensureBrowser((message) => emit(eventsFile, { type: 'log', level: 'info', message }))
            : undefined;
        const playhouse: Playhouse = { bin: playhouseBin(), ...(browser ? { browser } : {}) };
        const collectionDir = path.join(run, 'playhouse');
        await mkdir(collectionDir);
        for (const target of requestedTargets) {
            const safeUrl = sanitizeTargetUrl(target.url);
            await emit(eventsFile, { type: 'stage.start', stageId: target.label });
            await emit(eventsFile, { type: 'page.start', pageId: target.label, label: target.label, url: safeUrl });
            await emit(eventsFile, {
                type: 'log',
                level: 'info',
                message: `Collecting Playhouse evidence for ${target.label}`,
            });
            try {
                const archive = requestedArchives.get(target.label);
                const collection = archive
                    ? await copyArchive(
                          await readExistingPlayhouseArchive(playhouse, target, archive, collectionDir),
                          collectionDir
                      )
                    : await collectWithPlayhouse(playhouse, target, collectionDir, runs);
                pages.push(collection);
                const perf = perfFromSummary(await readJsonIfPresent(path.join(collection.archiveDir, 'summary.json')));
                await emit(eventsFile, {
                    type: 'page.complete',
                    pageId: target.label,
                    score: perf.score,
                    metrics: perf.metrics,
                });
                await emit(eventsFile, { type: 'stage.complete', stageId: target.label });
                await emit(eventsFile, { type: 'log', level: 'ok', message: `${target.label} collected` });
            } catch (error) {
                const message = sanitizeText(
                    stripProgressNoise(error instanceof Error ? error.message : String(error))
                );
                pageFailures.push({ label: target.label, url: safeUrl, error: message });
                await emit(eventsFile, {
                    type: 'page.run',
                    pageId: target.label,
                    runIndex: 1,
                    total: runs,
                    status: 'failed',
                });
                await emit(eventsFile, { type: 'stage.complete', stageId: target.label, summary: 'Collection failed' });
                await emit(eventsFile, { type: 'log', level: 'warn', message: `${target.label} failed: ${message}` });
            }
        }
        const expectedPages = options.expectedPages ?? ['home', 'plp', 'pdp'];
        const coverage = expectedPages
            .filter((label) => !pages.some((page) => page.label === label))
            .map((page) => ({
                page,
                status: 'missing' as const,
                note:
                    pageFailures.find((failure) => failure.label === page)?.error ??
                    `No URL was supplied for expected page ${page}.`,
            }));
        const bundle = await prepareBundle(project.root, run, pages, options.build !== false, eventsFile);
        const preparedRuleOutputs = await prepareRuleResults({
            catalog,
            pages,
            workspaceRoot: run,
            companionRoot: customCategories ? false : undefined,
            bundle,
        });
        const outputs = new Map(preparedRuleOutputs.map((output) => [output.reference.ruleId, output]));
        const allRules = catalog.categories.flatMap((category) => category.rules);
        const generatedAt = new Date().toISOString();
        const prepared = {
            schemaVersion: '1.0',
            run: {
                id: runId,
                generatedAt,
                toolVersion: VERSION,
                ...(pages[0] ? { playhouseVersion: pages[0].playhouseVersion } : {}),
            },
            project,
            // How to evaluate each entry in `rules`, shipped with this package so it always matches the catalog.
            instructions: EVALUATE_RULE_INSTRUCTIONS,
            pages: pages.map((page) => ({
                label: page.label,
                url: page.url,
                archiveDir: path.relative(run, page.archiveDir).split(path.sep).join('/'),
            })),
            pageFailures,
            expectedPages,
            coverage,
            // AI work: every rule its script did not decide.
            rules: allRules
                .filter((rule) => !outputs.get(rule.id)?.result.decision)
                .map((rule) => {
                    const output = outputs.get(rule.id);
                    return {
                        ruleId: rule.id,
                        title: rule.title,
                        file: rule.file,
                        ...(output ? { data: output.reference.path } : {}),
                        output: aiAnalysisPathForRule(rule.id),
                    };
                }),
            decidedFindings: allRules.flatMap((rule) => {
                const decision = outputs.get(rule.id)?.result.decision;
                return decision?.status === 'fail'
                    ? [
                          {
                              ruleId: rule.id,
                              title: rule.title,
                              severity: decision.severity ?? rule.severity,
                              summary: decision.summary,
                          },
                      ]
                    : [];
            }),
        };
        await writeJson(preparedPath, prepared);
        // Collection is done; the agent now analyzes. Mark the analysis stage active
        // so the dashboard reflects the (agent-driven) wait until `finalize` runs.
        await emit(eventsFile, { type: 'stage.start', stageId: 'analyze' });
        await emit(eventsFile, { type: 'log', level: 'info', message: 'Evidence collected; AI analysis in progress' });
        active.run = undefined;
        return preparedPath;
    });
}

/** Merges script results and ai-analysis/ into the latest run's audit-result.json; returns its path. */
export function finalize(options: FinalizeOptions): Promise<string> {
    return failRun(async (active) => {
        const workspace = await latestRunDir(path.resolve(options.workspace));
        const eventsFile = eventsFileFor(options.events, workspace);
        // A finalize that runs again rewrites audit-result.json but doesn't repeat the progress events, and a failure
        // then doesn't undo the completed run in the log. A shared --events file can hold earlier runs, so only the
        // latest one counts.
        const completed = latestRunEvents(await readEvents(eventsFile)).some((event) => event.type === 'run.complete');
        // Until finalize succeeds the agent is still analyzing; it can fix the files and run finalize again.
        if (!completed) active.run = { eventsFile, stageId: 'analyze' };
        const prepared = parsePrepared(JSON.parse(await readFile(path.join(workspace, 'prepared.json'), 'utf8')));
        assertUniqueLabels(prepared.pages);
        if (prepared.run.toolVersion !== VERSION)
            throw new Error(
                `prepared.json was written by storefront-next-dev ${prepared.run.toolVersion}, but this is ${VERSION}; re-run prepare`
            );
        const catalog = await discoverCatalog(options.categories ?? defaultCategoriesDir());
        const rules = new Map(
            catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule] as const))
        );
        for (const rule of prepared.rules)
            if (!rules.has(rule.ruleId))
                throw new Error(`prepared.json lists a rule that is not in the catalog: ${rule.ruleId}`);
        const outputs = await readPreparedRuleResults(workspace, catalog.ruleIds);
        const decided = outputs.filter((output) => output.result.decision);
        const pages = await Promise.all(
            prepared.pages.map((page) => readPage(workspace, page, prepared.run.playhouseVersion))
        );
        const archiveFiles: ArchiveFiles = new Map(pages.map((page) => [page.label, page.files]));
        const bundle = await readBundleAnalysis(workspace);
        const aiEvaluations = await readAiEvaluations(
            workspace,
            rules,
            new Set(prepared.rules.map((rule) => rule.ruleId)),
            archiveFiles,
            bundle
        );
        const summary = await readAiSummary(workspace, archiveFiles);
        const emptyCategories = catalog.categories
            .filter((category) => category.rules.length === 0)
            .map((category) => ({
                category: category.id,
                status: 'missing' as const,
                note: 'No codified rules in this category.',
            }));
        const result = validateAuditResult(
            {
                schemaVersion: '1.0',
                run: {
                    id: prepared.run.id,
                    generatedAt: prepared.run.generatedAt,
                    toolVersion: prepared.run.toolVersion,
                },
                project: { name: prepared.project.packageName },
                pages: pages.map(({ files: _files, ...page }) => page),
                catalog: {
                    categories: catalog.categories.map((category) => ({
                        id: category.id,
                        title: category.title,
                        ruleIds: category.rules.map((rule) => rule.id),
                    })),
                    ruleIds: catalog.ruleIds,
                },
                evaluations: [
                    ...decided.map((output) =>
                        deterministicEvaluation(ruleById(rules, output.reference.ruleId), output)
                    ),
                    ...aiEvaluations,
                ],
                observations: summary.observations,
                coverage: [...prepared.coverage, ...emptyCategories, ...summary.coverage],
                // Placeholder guidance: validation replaces it with guidanceFor(evaluations).
                summary: { guidance: 'go', narrative: summary.narrative, highlights: summary.highlights },
                ...(bundle ? { bundle } : {}),
            },
            catalog,
            archiveFiles
        );
        const resultPath = path.join(workspace, 'audit-result.json');
        await writeJson(resultPath, result);
        active.run = undefined;
        // Close out the live progress screen: finish the analysis + compile stages,
        // surface confirmed findings, and carry real per-page scores into completion.
        if (completed) return resultPath;
        const findingCount = result.evaluations.filter((evaluation) => evaluation.disposition === 'finding').length;
        await emit(eventsFile, {
            type: 'stage.complete',
            stageId: 'analyze',
            summary: `${findingCount} finding${findingCount === 1 ? '' : 's'} across ${result.catalog.categories.length} categories`,
        });
        await emit(eventsFile, { type: 'stage.start', stageId: 'compile' });
        for (const evaluation of result.evaluations) {
            if (evaluation.disposition !== 'finding') continue;
            await emit(eventsFile, {
                type: 'finding',
                id: evaluation.ruleId,
                severity: evaluation.severity ?? 'info',
                title: evaluation.title,
                category: evaluation.ruleId.split('/')[0],
                source: 'analysis',
                ruleId: evaluation.ruleId,
                preliminary: false,
            });
        }
        const scores = result.pages
            .map((page) => ({
                label: page.label,
                score: perfFromSummary(page.playhouse.artifacts['summary.json']).score,
            }))
            .filter((entry): entry is { label: string; score: number } => typeof entry.score === 'number');
        await emit(eventsFile, { type: 'stage.complete', stageId: 'compile', summary: 'Report compiled' });
        await emit(eventsFile, { type: 'run.complete', guidance: result.summary?.guidance, scores });
        return resultPath;
    });
}

const BUNDLE_STAGE = 'bundle';

/**
 * Builds the project (after collection, so the build never competes with a measurement) and writes
 * bundle/analysis.json. Never fails the audit: whatever goes wrong becomes a note in the analysis.
 */
async function prepareBundle(
    projectRoot: string,
    run: string,
    pages: readonly PlayhouseCollection[],
    build: boolean,
    eventsFile: string
): Promise<BundleAnalysis> {
    await emit(eventsFile, { type: 'stage.start', stageId: BUNDLE_STAGE });
    const log = (message: string): Promise<void> => emit(eventsFile, { type: 'log', level: 'info', message });
    let analysis: BundleAnalysis;
    try {
        const outputs: BuildOutputs = build
            ? await buildForAnalysis(projectRoot, run, log)
            : {
                  projectRoot,
                  packageManager: '',
                  durationMs: { analyze: null, plain: null },
                  assetsDir: null,
                  visualizerHtml: null,
                  visualizer: null,
                  notes: ["The project wasn't built (--no-build), so only what the browser loaded is reported."],
              };
        await log('Analyzing the bundle');
        analysis = bundleAnalysisSchema.parse(await analyzeBundle(outputs, pages, new PlayhouseArtifactReader(pages)));
    } catch (error) {
        analysis = {
            schemaVersion: BUNDLE_SCHEMA_VERSION,
            status: 'unavailable',
            notes: [
                sanitizeText(`The bundle analysis failed: ${error instanceof Error ? error.message : String(error)}`),
            ],
            build: null,
            pages: [],
            skipped: [],
        };
    }
    await mkdir(path.join(run, BUNDLE_DIR), { recursive: true });
    await writeJson(path.join(run, BUNDLE_ANALYSIS), analysis);
    for (const note of analysis.notes) await emit(eventsFile, { type: 'log', level: 'warn', message: note });
    const measured = `${analysis.pages.length} page${analysis.pages.length === 1 ? '' : 's'}`;
    const summary =
        analysis.status === 'complete'
            ? `${measured} analyzed`
            : analysis.status === 'partial'
              ? `${measured} analyzed (partial)`
              : `${measured} measured, no build`;
    await emit(eventsFile, { type: 'stage.complete', stageId: BUNDLE_STAGE, summary });
    return analysis;
}

function sanitizeTargetUrl(value: string): string {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    // Snapshot the keys: set() collapses duplicates mid-iteration.
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[REDACTED]');
    url.hash = '';
    return url.toString();
}
function ruleById(rules: ReadonlyMap<string, AuditRule>, ruleId: string): AuditRule {
    const rule = rules.get(ruleId);
    if (!rule) throw new Error(`Unknown rule id: ${ruleId}`);
    return rule;
}

function deterministicEvaluation(rule: AuditRule, output: PreparedRuleOutput): unknown {
    const { decision } = output.result;
    if (!decision) throw new Error(`${rule.id} has no decision from its script`);
    const remediation = decision.status === 'fail' ? section(rule.instructions, 'Remediation') : undefined;
    return {
        ruleId: rule.id,
        disposition: decision.status === 'fail' ? 'finding' : decision.status,
        title: rule.title,
        description: section(rule.instructions, 'Intent'),
        ...(decision.status === 'fail' ? { severity: decision.severity ?? rule.severity } : {}),
        summary: decision.summary,
        ...(remediation ? { remediation } : {}),
        evidence: decision.evidence,
        method: 'script',
    };
}

/** The body of a `## <name>` section in a rule's markdown. */
function section(markdown: string, name: string): string | undefined {
    const match = new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(markdown);
    return match?.[1]?.trim() || undefined;
}

async function exists(file: string): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

async function readJsonIfPresent(file: string): Promise<unknown> {
    return (await exists(file)) ? JSON.parse(await readFile(file, 'utf8')) : undefined;
}

/**
 * A reused `--archive` is copied into the run, which then owns it like a collected one.
 * Symlinks inside it are skipped, so the archive can't pull files from outside it into the run.
 */
async function copyArchive(collection: PlayhouseCollection, collectionDir: string): Promise<PlayhouseCollection> {
    const archiveDir = path.join(collectionDir, collection.label);
    await cp(collection.archiveDir, archiveDir, {
        recursive: true,
        filter: async (source) => source === collection.archiveDir || !(await lstat(source)).isSymbolicLink(),
    });
    return { ...collection, archiveDir };
}

/** Artifacts embedded in audit-result.json for the dashboard. Everything else stays in the archive. */
const DASHBOARD_ARTIFACTS = ['summary.json', 'opportunities.json', 'summary-lcp.json', 'network-mobile-cold.json'];

async function readPage(
    workspace: string,
    page: { label: string; url: string; archiveDir: string },
    playhouseVersion = 'unknown'
) {
    const archiveDir = path.resolve(workspace, page.archiveDir);
    const files = new Set(await listArchiveFiles(archiveDir));
    const manifest = z
        .object({ lighthouseVersion: z.string() })
        .passthrough()
        .parse(JSON.parse(await readFile(path.join(archiveDir, 'manifest.json'), 'utf8')));
    const artifacts: Record<string, z.core.util.JSONType> = {};
    for (const name of DASHBOARD_ARTIFACTS)
        if (files.has(name)) artifacts[name] = JSON.parse(await readFile(path.join(archiveDir, name), 'utf8'));
    if (files.has(LIGHTHOUSE_REPORT)) artifacts[LIGHTHOUSE_REPORT] = { available: true };
    return {
        label: page.label,
        url: page.url,
        files,
        playhouse: { archiveDir, version: playhouseVersion, lighthouseVersion: manifest.lighthouseVersion, artifacts },
    };
}

/** Run `check` and prefix any error with the workspace file it concerns, so the agent knows what to fix. */
async function inFile<T>(file: string, check: () => T | Promise<T>): Promise<T> {
    try {
        return await check();
    } catch (error) {
        throw new Error(
            `${file}: ${error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error)}`,
            { cause: error }
        );
    }
}

/** The run's bundle/analysis.json, when prepare wrote one. */
async function readBundleAnalysis(workspace: string): Promise<BundleAnalysis | undefined> {
    const file = path.join(workspace, BUNDLE_ANALYSIS);
    if (!(await exists(file))) return undefined;
    return inFile(BUNDLE_ANALYSIS, async () => bundleAnalysisSchema.parse(JSON.parse(await readFile(file, 'utf8'))));
}

async function readAiEvaluations(
    workspace: string,
    rules: ReadonlyMap<string, AuditRule>,
    aiRuleIds: ReadonlySet<string>,
    archiveFiles: ArchiveFiles,
    bundle: BundleAnalysis | undefined
): Promise<unknown[]> {
    const root = path.join(workspace, 'ai-analysis', 'categories');
    if (!(await exists(root))) return [];
    const evaluations: unknown[] = [];
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const file = path.relative(workspace, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
        evaluations.push(
            await inFile(file, async () => {
                const match = /^ai-analysis\/categories\/([a-z0-9-]+)\/rules\/([a-z0-9-]+)\.json$/.exec(file);
                if (!match)
                    throw new Error(
                        'unexpected file; AI evaluations go in ai-analysis/categories/<category>/rules/<rule>.json'
                    );
                const ruleId = `${match[1]}/${match[2]}`;
                if (!aiRuleIds.has(ruleId))
                    throw new Error(
                        rules.has(ruleId)
                            ? `${ruleId} was decided by its script; delete this file`
                            : `${ruleId} is not a rule in prepared.json`
                    );
                const raw = z
                    .object({ ruleId: z.string() })
                    .passthrough()
                    .parse(JSON.parse(await readFile(path.join(workspace, file), 'utf8')));
                if (raw.ruleId !== ruleId)
                    throw new Error(`ruleId ${raw.ruleId} does not match the file path (${ruleId})`);
                const rule = ruleById(rules, ruleId);
                const evaluation = evaluationSchema.parse({
                    ...raw,
                    title: rule.title,
                    description: section(rule.instructions, 'Intent'),
                    method: 'ai',
                });
                if (evaluation.disposition === 'pass' && evaluation.evidence.length === 0)
                    throw new Error(`${ruleId} pass requires evidence of what was checked`);
                for (const evidence of evaluation.evidence) validateEvidence(evidence, archiveFiles);
                validateWaterfall(evaluation, new Set(archiveFiles.keys()));
                if (evaluation.recommendations && !bundle)
                    throw new Error(`recommendations need the run's ${BUNDLE_ANALYSIS}, which prepare didn't write`);
                validateRecommendations(evaluation, new Set(archiveFiles.keys()), bundle);
                return evaluation;
            })
        );
    }
    return evaluations;
}

// Guidance is not part of the summary: finalize derives it from the findings.
const aiSummarySchema = z.object({
    narrative: z.string(),
    highlights: z.array(z.string().min(1)).max(6).optional().default([]),
    observations: auditResultSchema.shape.observations,
    coverage: auditResultSchema.shape.coverage.optional().default([]),
});

async function readAiSummary(
    workspace: string,
    archiveFiles: ArchiveFiles
): Promise<{ narrative: string; highlights: string[]; observations: unknown[]; coverage: unknown[] }> {
    const file = 'ai-analysis/summary.json';
    if (!(await exists(path.join(workspace, file))))
        return { narrative: '', highlights: [], observations: [], coverage: [] };
    return inFile(file, async () => {
        const { narrative, highlights, observations, coverage } = aiSummarySchema.parse(
            JSON.parse(await readFile(path.join(workspace, file), 'utf8'))
        );
        for (const observation of observations)
            for (const evidence of observation.evidence as Evidence[]) validateEvidence(evidence, archiveFiles);
        return { narrative, highlights, observations, coverage };
    });
}
