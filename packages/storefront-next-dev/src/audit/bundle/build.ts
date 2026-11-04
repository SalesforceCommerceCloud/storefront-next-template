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
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { sanitizeText } from '../sanitize';
import type { BuildOutputs } from './analyze';
import { BUNDLE_DIR, BUNDLE_VISUALIZER } from './schema';

const runFile = promisify(execFile);
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const LOG_TAIL_CHARS = 64 * 1024;
const LOCKFILES: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
];
/** Where React Router writes the client build and the template's visualizer writes its report. */
const ASSETS_DIR = 'build/client/assets';
const VISUALIZER_REPORT = 'build/client-bundle-size.html';

/** The package manager the project declares (`packageManager`), else the one whose lockfile is nearest. */
export async function detectPackageManager(projectRoot: string): Promise<string> {
    try {
        const declared = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')).packageManager;
        const name = typeof declared === 'string' ? declared.split('@')[0] : undefined;
        if (name && ['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return name;
    } catch {
        /* fall through to lockfiles */
    }
    for (let dir = projectRoot; ; dir = path.dirname(dir)) {
        const found = LOCKFILES.find(([file]) => existsSync(path.join(dir, file)));
        if (found) return found[1];
        if (path.dirname(dir) === dir) return 'npm';
    }
}

export type BuildProgress = (message: string) => Promise<void> | void;

/** Runs both builds and returns what they produced; failures become notes, never exceptions. */
export async function buildForAnalysis(
    projectRoot: string,
    runDir: string,
    progress: BuildProgress = () => undefined
): Promise<BuildOutputs> {
    const outDir = path.join(runDir, BUNDLE_DIR);
    await mkdir(outDir, { recursive: true });
    const packageManager = await detectPackageManager(projectRoot);
    const outputs: BuildOutputs = {
        projectRoot,
        packageManager,
        durationMs: { analyze: null, plain: null },
        assetsDir: null,
        visualizerHtml: null,
        visualizer: null,
        notes: [],
    };
    let scripts: Record<string, unknown> = {};
    try {
        scripts = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')).scripts ?? {};
    } catch {
        /* reported below */
    }
    if (typeof scripts.build !== 'string') {
        outputs.notes.push("The project's package.json has no build script, so the bundle wasn't built.");
        return outputs;
    }

    const shims = await openShims(outDir);
    const before = await gitStatus(projectRoot);

    await progress('Building with the bundle visualizer');
    const analyze = await runBuild(projectRoot, packageManager, shims, true, path.join(outDir, 'build-analyze.log'));
    outputs.durationMs.analyze = analyze.durationMs;
    if (analyze.error)
        outputs.notes.push(
            `The analyze build failed (${analyze.error}); see ${BUNDLE_DIR}/build-analyze.log.${installHint(analyze, packageManager)} Import suggestions are unavailable.`
        );
    else {
        const report = path.join(projectRoot, VISUALIZER_REPORT);
        if (await writtenSince(report, analyze.startedAt)) {
            await copyFile(report, path.join(runDir, BUNDLE_VISUALIZER));
            outputs.visualizerHtml = await readFile(report, 'utf8');
            outputs.visualizer = BUNDLE_VISUALIZER;
        } else
            outputs.notes.push(
                `The build didn't write ${VISUALIZER_REPORT} with BUNDLES_SIZE_ANALYZE set (the template's bundle-visualizer Vite plugin), so import suggestions are unavailable.`
            );
    }

    await progress('Building for production');
    const plain = await runBuild(projectRoot, packageManager, shims, false, path.join(outDir, 'build.log'));
    outputs.durationMs.plain = plain.durationMs;
    if (plain.error)
        outputs.notes.push(
            `The production build failed (${plain.error}); see ${BUNDLE_DIR}/build.log.${installHint(plain, packageManager)} The bundle's composition is unknown.`
        );
    else if (await scriptsWrittenSince(path.join(projectRoot, ASSETS_DIR), plain.startedAt))
        outputs.assetsDir = path.join(projectRoot, ASSETS_DIR);
    else outputs.notes.push(`The production build didn't write ${ASSETS_DIR}, so the bundle's composition is unknown.`);

    const after = await gitStatus(projectRoot);
    if (before !== null && after !== null && before !== after)
        outputs.notes.push(
            'The build changed files outside build/ (git status differs before and after); review them in the project.'
        );
    return outputs;
}

type BuildRun = { startedAt: number; durationMs: number; error?: string; missingModule?: boolean };

/** A module the build can't resolve almost always means node_modules is older than the lockfile. */
const installHint = (run: BuildRun, packageManager: string): string =>
    run.missingModule
        ? ` A module it needs isn't installed: run \`${packageManager} install\` in the project, then audit again.`
        : '';

/**
 * Runs the project's `build` script once, with the user's environment plus:
 * - `BUNDLES_SIZE_ANALYZE`: `true` for the module-graph build, unset for the plain one;
 * - `BUNDLES_SIZE_OPEN`: `false`, so the visualizer doesn't open its report;
 * - `BUNDLES_SIZE_CHECK`: always unset.
 */
async function runBuild(
    projectRoot: string,
    packageManager: string,
    shims: string,
    analyze: boolean,
    logFile: string
): Promise<BuildRun> {
    // The project's toolchain needs the user's environment; only the bundle switches and PATH are controlled.
    // BUNDLES_SIZE_CHECK stays off in both: it renames chunks and fails the build over its own budgets.
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [shims, process.env.PATH ?? ''].join(path.delimiter),
        BUNDLES_SIZE_OPEN: 'false',
    };
    delete env.BUNDLES_SIZE_CHECK;
    if (analyze) env.BUNDLES_SIZE_ANALYZE = 'true';
    else delete env.BUNDLES_SIZE_ANALYZE;
    const startedAt = Date.now();
    try {
        const { stdout, stderr } = await runFile(packageManager, ['run', 'build'], {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
            timeout: BUILD_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            // npm, pnpm and yarn are .cmd scripts on Windows.
            shell: process.platform === 'win32',
        });
        await writeLog(logFile, stdout, stderr);
        return { startedAt, durationMs: Date.now() - startedAt };
    } catch (error) {
        const failure = error as {
            stdout?: string;
            stderr?: string;
            killed?: boolean;
            code?: unknown;
            message?: string;
        };
        await writeLog(logFile, failure.stdout ?? '', failure.stderr ?? '');
        const cause = errorLine(failure.stderr ?? '') ?? errorLine(failure.stdout ?? '');
        const reason = failure.killed
            ? `timed out after ${BUILD_TIMEOUT_MS / 60_000} minutes`
            : failure.code === 'ENOENT'
              ? `${packageManager} isn't installed or isn't on PATH`
              : typeof failure.code === 'number'
                ? `exit code ${failure.code}${cause ? `: ${cause}` : ''}`
                : sanitizeText(failure.message ?? String(error));
        const missingModule = /Cannot find (?:module|package)|MODULE_NOT_FOUND/.test(
            `${failure.stderr ?? ''}\n${failure.stdout ?? ''}`
        );
        return { startedAt, durationMs: Date.now() - startedAt, error: reason, missingModule };
    }
}

const MAX_CAUSE_CHARS = 200;

/** The first line that reads like the build's error (`Error: Cannot find module 'x'`), so the note says why. */
function errorLine(output: string): string | undefined {
    const line = output
        .split('\n')
        .map((item) => item.trim())
        .find((item) => /^(?:\w*Error|error|ERR_[A-Z_]+)\b/.test(item));
    if (!line) return undefined;
    const text = sanitizeText(line);
    return text.length > MAX_CAUSE_CHARS ? `${text.slice(0, MAX_CAUSE_CHARS - 1)}…` : text;
}

const tail = (text: string): string => (text.length > LOG_TAIL_CHARS ? `…\n${text.slice(-LOG_TAIL_CHARS)}` : text);
async function writeLog(file: string, stdout: string, stderr: string): Promise<void> {
    await writeFile(file, sanitizeText(`${tail(stdout)}\n--- stderr ---\n${tail(stderr)}\n`));
}

/**
 * Projects from before `BUNDLES_SIZE_OPEN` always open the visualizer report. For them, no-op `open` and `xdg-open`
 * first on PATH keep it from launching a browser on macOS; the visualizer runs Linux's and Windows' openers by path.
 */
async function openShims(outDir: string): Promise<string> {
    const dir = path.join(outDir, '.bin');
    await mkdir(dir, { recursive: true });
    for (const name of ['open', 'xdg-open']) {
        const file = path.join(dir, name);
        await writeFile(file, '#!/bin/sh\nexit 0\n');
        await chmod(file, 0o755);
    }
    return dir;
}

async function writtenSince(file: string, startedAt: number): Promise<boolean> {
    // A second of slack for filesystems with coarse timestamps.
    try {
        return (await stat(file)).mtimeMs >= startedAt - 1000;
    } catch {
        return false;
    }
}

/** A directory's own time changes only when entries come and go, so its scripts are checked instead. */
async function scriptsWrittenSince(dir: string, startedAt: number): Promise<boolean> {
    let names: string[];
    try {
        names = (await readdir(dir)).filter((name) => name.endsWith('.js'));
    } catch {
        return false;
    }
    for (const name of names) if (await writtenSince(path.join(dir, name), startedAt)) return true;
    return false;
}

async function gitStatus(projectRoot: string): Promise<string | null> {
    try {
        return (
            await runFile('git', ['status', '--porcelain', '--', '.'], {
                cwd: projectRoot,
                encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024,
                timeout: 30_000,
            })
        ).stdout;
    } catch {
        return null;
    }
}
