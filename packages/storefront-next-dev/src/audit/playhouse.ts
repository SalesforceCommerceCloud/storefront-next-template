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
import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import type AjvCore from 'ajv';
import AjvModule from 'ajv/dist/2020.js';
import { z } from 'zod';
import { sanitizeText, sanitizeUrl } from './sanitize';

const exec = promisify(execFile);
const Ajv = AjvModule as unknown as new (options?: { strict?: boolean }) => AjvCore;
const jsonObject = z.record(z.string(), z.unknown());
const artifactDescriptor = z
    .object({ path: z.string().min(1), schema: z.record(z.string(), z.unknown()) })
    .passthrough();
const rawArtifactDescriptor = z
    .object({ path: z.string().min(1), producedBy: z.string(), contract: z.string().min(1) })
    .passthrough();
const describeSchema = z
    .object({
        tool: z.object({ name: z.string().optional(), version: z.string().min(1) }).passthrough(),
        archiveLifecycle: z
            .object({
                viewability: z
                    .object({ requiresManifest: z.literal(true), stateAuthority: z.literal('manifest.archiveState') })
                    .passthrough(),
            })
            .passthrough(),
        artifacts: z.array(artifactDescriptor),
        rawArtifacts: z.array(rawArtifactDescriptor).optional().default([]),
        outputs: z.object({ runResult: z.record(z.string(), z.unknown()) }).passthrough(),
    })
    .passthrough();
const runResultSchema = z
    .object({
        tool: z.literal('playhouse'),
        command: z.literal('run'),
        targetUrl: z.string(),
        archiveDir: z.string().min(1),
        summary: jsonObject,
    })
    .passthrough();
const manifestSchema = z
    .object({
        targetUrl: z.string(),
        lighthouseVersion: z.string(),
        summaryArtifacts: z.array(z.string()),
        medianArtifacts: z.array(z.string()).optional().default([]),
        profileArtifacts: z.array(z.string()).optional().default([]),
        traceArtifacts: z
            .array(z.object({ path: z.string() }).passthrough())
            .optional()
            .default([]),
        runs: z
            .array(z.object({ runId: z.string(), files: z.array(z.string()) }).passthrough())
            .optional()
            .default([]),
        scriptCount: z.number().int().nonnegative().optional().default(0),
        archiveState: z.object({
            status: z.enum(['complete', 'incomplete']),
            failures: z.array(z.unknown()),
            warnings: z.array(z.unknown()),
        }),
    })
    .passthrough();
const requiredArtifacts = [
    'summary.json',
    'opportunities.json',
    'summary-tbt.json',
    'summary-lcp.json',
    'summary-third-party.json',
] as const;
const representativeArtifacts = /(?:main-document|document|network|diagnostic)|\.html$/i;
/**
 * How long one Playhouse or Playwright command may run before it is killed.
 *
 * Environment variables:
 * - `SFNEXT_AUDIT_PLAYHOUSE_TIMEOUT_MS` (optional): a positive number of milliseconds, e.g. `1200000`. Default 10 minutes.
 */
const parsedTimeoutOverride = Number(process.env.SFNEXT_AUDIT_PLAYHOUSE_TIMEOUT_MS);
const DEFAULT_TIMEOUT_MS =
    Number.isFinite(parsedTimeoutOverride) && parsedTimeoutOverride > 0 ? parsedTimeoutOverride : 10 * 60_000;

const basename = (value: string): string => value.split('/').at(-1) ?? value;
const descriptorMatches = (pattern: string, name: string): boolean => {
    const escaped = basename(pattern)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\{[^}]+\\\}/g, '[^/]+');
    return new RegExp(`^${escaped}$`).test(basename(name));
};

export type PageTarget = { label: string; url: string };
/** The Playhouse CLI script, run with this Node, and the Chrome it measures with. */
export type Playhouse = { bin: string; browser?: string };
/** A validated archive for one page. Artifacts are read from `archiveDir` on demand. */
export type PlayhouseCollection = { label: string; url: string; archiveDir: string; playhouseVersion: string };

/** With `--json`, Playhouse prints its result, or `{"error":{"message":…}}` on failure, as the last stdout line. */
const lastJson = (stdout: string): unknown => JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
function jsonErrorMessage(stdout: unknown): string | undefined {
    if (typeof stdout !== 'string') return undefined;
    try {
        const message = (lastJson(stdout) as { error?: { message?: unknown } } | null)?.error?.message;
        return typeof message === 'string' ? message : undefined;
    } catch {
        return undefined;
    }
}

async function invoke(playhouse: Playhouse, args: string[], cwd: string): Promise<string> {
    // Playhouse is our own bundled dependency, so it gets the user's full environment (proxy, temp dirs, Windows system vars).
    const env = { ...process.env, ...(playhouse.browser ? { PLAYHOUSE_CHROME_PATH: playhouse.browser } : {}) };
    try {
        return (
            await exec(process.execPath, [playhouse.bin, ...args], {
                cwd,
                encoding: 'utf8',
                maxBuffer: 20 * 1024 * 1024,
                timeout: DEFAULT_TIMEOUT_MS,
                killSignal: 'SIGKILL',
                env,
            })
        ).stdout.trim();
    } catch (error) {
        // No `cause`: the raw error may hold unredacted paths or secrets; only the sanitized message leaves.
        throw new Error(
            sanitizeText(
                `Playhouse command failed (${args.join(' ')}): ${jsonErrorMessage((error as { stdout?: unknown }).stdout) ?? (error instanceof Error ? error.message : String(error))}`
            )
        );
    }
}

const require = createRequire(import.meta.url);
/** The script a dependency's package.json `bin` names, for running with `node`. */
function packageBin(name: string, command: string): string {
    const manifest = require.resolve(`${name}/package.json`);
    const { bin } = require(manifest) as { bin?: string | Record<string, string> };
    const script = typeof bin === 'string' ? bin : bin?.[command];
    if (!script) throw new Error(`${name} has no ${command} bin`);
    return path.resolve(path.dirname(manifest), script);
}

/**
 * The bundled @salesforce/playhouse CLI.
 *
 * Environment variables:
 * - `SFNEXT_AUDIT_PLAYHOUSE_BIN` (optional): another Playhouse script to run with this Node, for tests,
 *   e.g. `/tmp/fake-playhouse.mjs`.
 */
export function playhouseBin(): string {
    return process.env.SFNEXT_AUDIT_PLAYHOUSE_BIN || packageBin('@salesforce/playhouse', 'playhouse');
}

/**
 * The Chrome that Playhouse measures with: PLAYHOUSE_CHROME_PATH when the user set it, else the Chrome for Testing
 * that our playwright-core (pinned to Playhouse's) expects in the shared Playwright browser cache. Playwright
 * installs it there when it is missing, and reuses it otherwise. Left to itself, Playhouse would take whatever
 * browser revision another tool cached, or system Chrome, which managed-device policy can break.
 *
 * Environment variables:
 * - `PLAYHOUSE_CHROME_PATH` (optional): a Chrome executable to measure with instead, e.g.
 *   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
 * - `HTTPS_PROXY` and `NODE_EXTRA_CA_CERTS` (optional): read by Playwright when it downloads Chromium behind a
 *   proxy, e.g. `http://proxy.example.com:8080` and `/etc/ssl/corp-ca.pem`.
 */
export async function ensureBrowser(
    log: (message: string) => Promise<void>,
    cli = packageBin('playwright-core', 'playwright-core')
): Promise<string> {
    if (process.env.PLAYHOUSE_CHROME_PATH) return process.env.PLAYHOUSE_CHROME_PATH;
    const { chromium } = await import('playwright-core');
    const executable = chromium.executablePath();
    if (await present(executable)) return executable;
    await log('Downloading Chromium for Playhouse (one time, about 180 MB)');
    const command = ['install', 'chromium', '--no-shell'];
    try {
        await exec(process.execPath, [cli, ...command], {
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024,
            timeout: DEFAULT_TIMEOUT_MS,
            killSignal: 'SIGKILL',
        });
    } catch (error) {
        // Playwright prints each retry's error with a stack; keep the distinct `Error:` lines.
        const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
        const errors = `${String(stderr ?? '')}\n${String(stdout ?? '')}`
            .split('\n')
            .flatMap((line) => /^Error: (.+?)(?:, caused by)?$/.exec(line.trim())?.[1] ?? []);
        const reason = errors.length
            ? [...new Set(errors)].join('; ')
            : error instanceof Error
              ? error.message
              : String(error);
        const { version } = require('playwright-core/package.json') as { version: string };
        // No `cause`, as in invoke(): the raw error holds unsanitized output.
        throw new Error(
            `Could not download Chromium for Playhouse: ${sanitizeText(reason)}\nBehind a proxy, set HTTPS_PROXY (and NODE_EXTRA_CA_CERTS for a TLS-inspecting proxy) and run prepare again, or install it yourself with: npx playwright-core@${version} ${command.join(' ')}`
        );
    }
    if (!(await present(executable)))
        throw new Error('Playwright reported installing Chromium, but it is still missing');
    return executable;
}

async function present(file: string): Promise<boolean> {
    try {
        await access(file, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function contained(base: string, candidate: string): boolean {
    const relative = path.relative(base, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
async function assertNoSymlinks(base: string, target: string): Promise<void> {
    if (!contained(base, target)) throw new Error(`Path escaped the controlled output directory: ${target}`);
    let current = base;
    for (const part of path.relative(base, target).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        if ((await lstat(current)).isSymbolicLink())
            throw new Error(`Playhouse path must not contain a symlink: ${current}`);
    }
}

async function assertAbsolutePathHasNoSymlinks(target: string): Promise<void> {
    if (!path.isAbsolute(target)) throw new Error('Playhouse archive must use an absolute path');
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`Playhouse path must not contain a symlink: ${target}`);
}

export async function inspectPlayhouse(
    playhouse: Playhouse,
    cwd: string
): Promise<{ version: string; describe: z.infer<typeof describeSchema> }> {
    const describe = describeSchema.parse(JSON.parse(await invoke(playhouse, ['describe'], cwd)));
    for (const name of ['manifest.json', ...requiredArtifacts])
        if (!describe.artifacts.some((item) => basename(item.path) === name))
            throw new Error(`Playhouse describe is missing required artifact descriptor: ${name}`);
    const families = [
        { label: 'document', pattern: /(?:main-)?document/i },
        { label: 'network', pattern: /network/i },
        { label: 'diagnostic', pattern: /diagnostic/i },
    ];
    for (const family of families)
        if (!describe.artifacts.some((item) => family.pattern.test(item.path)))
            throw new Error(`Playhouse describe is missing required ${family.label} artifact descriptor`);
    return { version: describe.tool.version, describe };
}

export async function collectWithPlayhouse(
    playhouse: Playhouse,
    target: PageTarget,
    outputCwd: string,
    runs = 1
): Promise<PlayhouseCollection> {
    const contract = await inspectPlayhouse(playhouse, outputCwd);
    const ajv = new Ajv({ strict: false });
    const resultInput = lastJson(
        await invoke(
            playhouse,
            [
                'run',
                target.url,
                '--json',
                '--runs',
                String(runs),
                // Playhouse currently saves main-document.html only when HTML retry matching is enabled.
                // This impossible pattern enables the artifact without retrying; remove it once Playhouse
                // always saves the main document or exposes a dedicated capture flag.
                '--retry-pattern-html',
                'a^',
            ],
            outputCwd
        )
    );
    if (!ajv.validate(contract.describe.outputs.runResult, resultInput))
        throw new Error(`Playhouse run result failed its describe schema: ${ajv.errorsText()}`);
    const result = runResultSchema.parse(resultInput);
    const outputRoot = await realpath(outputCwd);
    const archiveDir = path.resolve(outputRoot, result.archiveDir);
    await assertNoSymlinks(outputRoot, archiveDir);
    const canonicalArchive = await realpath(archiveDir);
    if (!contained(outputRoot, canonicalArchive))
        throw new Error(`Playhouse archive escaped the controlled output directory: ${canonicalArchive}`);
    if (archiveDir.endsWith('.partial')) throw new Error(`Playhouse retained a partial archive: ${archiveDir}`);
    return readValidatedArchive(contract, target, canonicalArchive, async (artifactPath) =>
        assertNoSymlinks(outputRoot, artifactPath)
    );
}

export async function readExistingPlayhouseArchive(
    playhouse: Playhouse,
    target: PageTarget,
    archiveDir: string,
    cwd: string
): Promise<PlayhouseCollection> {
    await assertAbsolutePathHasNoSymlinks(archiveDir);
    const canonicalArchive = await realpath(archiveDir);
    if (!(await lstat(canonicalArchive)).isDirectory())
        throw new Error(`Playhouse archive is not a directory: ${canonicalArchive}`);
    const contract = await inspectPlayhouse(playhouse, cwd);
    return readValidatedArchive(contract, target, canonicalArchive, async (artifactPath) =>
        assertNoSymlinks(canonicalArchive, artifactPath)
    );
}

async function readValidatedArchive(
    contract: Awaited<ReturnType<typeof inspectPlayhouse>>,
    target: PageTarget,
    canonicalArchive: string,
    validatePath: (artifactPath: string) => Promise<void>
): Promise<PlayhouseCollection> {
    const ajv = new Ajv({ strict: false });
    const manifestPath = path.join(canonicalArchive, 'manifest.json');
    await validatePath(manifestPath);
    const rawManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const manifestDescriptor = contract.describe.artifacts.find((item) => basename(item.path) === 'manifest.json');
    if (!manifestDescriptor)
        throw new Error('Playhouse describe is missing required artifact descriptor: manifest.json');
    if (!ajv.validate(manifestDescriptor.schema, rawManifest))
        throw new Error(`manifest.json failed its describe schema: ${ajv.errorsText()}`);
    const manifest = manifestSchema.parse(rawManifest);
    if (manifest.targetUrl !== target.url) throw new Error(`Playhouse manifest target mismatch for ${target.label}`);
    if (manifest.archiveState.status !== 'complete' || manifest.archiveState.failures.length)
        throw new Error(`Playhouse archive is incomplete for ${target.label}`);
    for (const name of requiredArtifacts)
        if (!manifest.summaryArtifacts.includes(name))
            throw new Error(`Playhouse manifest is missing required artifact: ${name}`);
    const declaredArtifacts = [
        ...manifest.summaryArtifacts,
        ...manifest.medianArtifacts,
        ...manifest.profileArtifacts,
        ...manifest.traceArtifacts.map((item) => item.path),
        ...manifest.runs.flatMap((run) => run.files.map((file) => `runs/${run.runId}/${file}`)),
        ...(manifest.scriptCount > 0 ? ['scripts/index.json'] : []),
    ];
    const names = declaredArtifacts.filter((name, index) => declaredArtifacts.indexOf(name) === index);
    for (const name of names) {
        const artifactPath = path.join(canonicalArchive, name);
        await validatePath(artifactPath);
        const descriptor = contract.describe.artifacts.find((item) => descriptorMatches(item.path, name));
        const rawDescriptor = contract.describe.rawArtifacts.find((item) => descriptorMatches(item.path, name));
        if (!descriptor && !rawDescriptor && !name.endsWith('.html')) continue;
        await access(artifactPath, constants.R_OK);
        const validated =
            descriptor &&
            !name.startsWith('runs/') &&
            name.endsWith('.json') &&
            (requiredArtifacts.includes(name as (typeof requiredArtifacts)[number]) ||
                representativeArtifacts.test(name));
        if (
            validated &&
            !ajv.validate(descriptor.schema, jsonObject.parse(JSON.parse(await readFile(artifactPath, 'utf8'))))
        )
            throw new Error(`${name} failed its describe schema: ${ajv.errorsText()}`);
    }
    return {
        label: target.label,
        url: sanitizeUrl(target.url),
        archiveDir: canonicalArchive,
        playhouseVersion: contract.version,
    };
}
