#!/usr/bin/env node

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

/**
 * Pulls SCAPI specs from the ECOM monorepo into `openapi-specs/`.
 *
 * Tracked APIs are the folders under `openapi-specs/` that have an `exchange.json`;
 * `ECOM_BUNDLE_LOCATIONS` says where ECOM publishes each one. For every API that is
 * out of date it swaps the spec folder for ECOM's public bundle, rewrites the `root:`
 * path in `redocly.yaml`, and regenerates the client with `pnpm scapi:generate`.
 * Every updated `exchange.json` records the ECOM ref and commit it came from.
 * Authentication is whatever git already has for the ECOM host.
 *
 * Requires `ECOM_REPO_URL` and `ECOM_BUNDLES_ROOT` (see ecom-oas.ts). They are internal and
 * not committed: export them, or put them in a gitignored `.env` in this package, which
 * `pnpm scapi:update-specs` loads. Ask the SF Next team for the values.
 *
 * Run by hand only. There is no CI job because CI runners cannot reach the ECOM git host.
 *
 * Modes:
 *   (default)            Update every out-of-date API from `master`.
 *   --check              Dry run. Reports out-of-date APIs, writes nothing. Exits 1 on drift,
 *                        2 on any error, so drift is distinguishable from a failed run.
 *   --ref <ref>          Pull from a branch, tag or commit instead of `master`.
 *   --api <key> --ref <ref>
 *                        Replace only the named API(s) with the bundle at <ref>, even if
 *                        the version is not newer, to test an ECOM branch. `--api` is
 *                        repeatable and requires `--ref`.
 *
 * @example
 * pnpm scapi:update-specs --check
 * pnpm scapi:update-specs
 * pnpm scapi:update-specs --api shopper-seo-oas-v1 --ref my-ecom-branch
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_ECOM_REF,
    ECOM_BUNDLE_LOCATIONS,
    fetchEcomBundles,
    loadBundledApi,
    readEcomSource,
} from './ecom-oas.ts';
import { rewriteRoots } from './redocly-roots.ts';
import { type SpecStatus, resolveStatus } from './spec-version.ts';

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS_DIR = path.join(PACKAGE_ROOT, 'openapi-specs');
const REDOCLY_PATH = path.join(SPECS_DIR, 'redocly.yaml');

const EXIT_DRIFT = 1;
const EXIT_ERROR = 2;

/** The `exchange.json` descriptor inside every spec folder. */
interface ExchangeMeta {
    main: string;
    assetId: string;
    version: string;
    apiVersion: string;
    [field: string]: unknown;
}

interface TrackedSpec {
    key: string;
    dir: string;
    meta: ExchangeMeta;
    location: string;
}

interface UpdatePlan {
    spec: TrackedSpec;
    version: string;
    publicSpec: string;
    status: SpecStatus;
}

interface CliOptions {
    check: boolean;
    ref: string | undefined;
    apiKeys: string[];
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { check: false, ref: undefined, apiKeys: [] };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--check') {
            options.check = true;
        } else if (flag === '--ref' || flag === '--api') {
            const value = argv[++i];
            if (!value || value.startsWith('--')) {
                throw new Error(`${flag} needs a value.`);
            }
            if (flag === '--ref') {
                options.ref = value;
            } else {
                if (!options.apiKeys.includes(value)) {
                    options.apiKeys.push(value);
                }
            }
        } else {
            throw new Error(`Unknown argument "${flag}".`);
        }
    }
    if (options.apiKeys.length > 0 && !options.ref) {
        throw new Error('--api needs --ref, because it pulls from a specific ECOM ref.');
    }
    return options;
}

function readTrackedSpecs(): TrackedSpec[] {
    return fs
        .readdirSync(SPECS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SPECS_DIR, entry.name, 'exchange.json')))
        .map((entry) => {
            const meta = JSON.parse(
                fs.readFileSync(path.join(SPECS_DIR, entry.name, 'exchange.json'), 'utf-8')
            ) as ExchangeMeta;
            const key = `${meta.assetId}-${meta.apiVersion}`;
            const location = ECOM_BUNDLE_LOCATIONS[key];
            if (!location) {
                throw new Error(`${key} is tracked in openapi-specs/ but has no entry in ECOM_BUNDLE_LOCATIONS.`);
            }
            return { key, dir: entry.name, meta, location };
        });
}

function selectSpecs(tracked: TrackedSpec[], apiKeys: string[]): TrackedSpec[] {
    if (apiKeys.length === 0) {
        return tracked;
    }
    const unknown = apiKeys.filter((key) => !tracked.some((spec) => spec.key === key));
    if (unknown.length > 0) {
        throw new Error(`Not tracked in openapi-specs/: ${unknown.join(', ')}`);
    }
    return tracked.filter((spec) => apiKeys.includes(spec.key));
}

/** Copies the bundle into a staging folder so a failure leaves `openapi-specs/` untouched. */
function stageUpdate(
    { spec, version, publicSpec }: UpdatePlan,
    stagingDir: string,
    ref: string,
    commitSha: string
): void {
    const folder = path.join(stagingDir, `${spec.meta.assetId}-${version}`);
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(publicSpec, path.join(folder, spec.meta.main));
    const meta: ExchangeMeta = { ...spec.meta, version, ecomRef: ref, ecomCommit: commitSha };
    fs.writeFileSync(path.join(folder, 'exchange.json'), JSON.stringify(meta, null, 2));
}

/**
 * Replaces the outdated spec folders with the staged ones. Every `redocly.yaml` root is
 * checked and every new folder is copied in before `redocly.yaml` is written and any old
 * folder is deleted, so a failure part-way leaves `redocly.yaml` pointing at folders that
 * still exist.
 */
function swapSpecFolders(updates: UpdatePlan[], stagingDir: string): void {
    const renames = updates.map(({ spec, version }) => ({
        from: `./${spec.dir}/${spec.meta.main}`,
        to: `./${spec.meta.assetId}-${version}/${spec.meta.main}`,
    }));
    const redocly = rewriteRoots(fs.readFileSync(REDOCLY_PATH, 'utf-8'), renames);

    const newDirs = updates.map(({ spec, version }) => `${spec.meta.assetId}-${version}`);
    newDirs.forEach((newDir) =>
        fs.cpSync(path.join(stagingDir, newDir), path.join(SPECS_DIR, newDir), { recursive: true })
    );
    fs.writeFileSync(REDOCLY_PATH, redocly);
    updates.forEach(({ spec }, i) => {
        // `--api` can re-pull the same version, in which case the old folder is the new one.
        if (spec.dir !== newDirs[i]) {
            fs.rmSync(path.join(SPECS_DIR, spec.dir), { recursive: true, force: true });
        }
    });
}

function main(): void {
    const options = parseArgs(process.argv.slice(2));
    const ecomSource = readEcomSource(process.env);
    const ref = options.ref ?? DEFAULT_ECOM_REF;
    const selected = selectSpecs(readTrackedSpecs(), options.apiKeys);
    const forceReplace = options.apiKeys.length > 0;

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-ecom-'));
    try {
        console.log(`Fetching ${selected.length} ECOM bundle(s) at ref ${ref}`);
        const { bundlesRoot, commitSha } = fetchEcomBundles(
            ecomSource,
            path.join(workDir, 'ecom'),
            ref,
            selected.map((spec) => spec.location)
        );
        console.log(`Resolved ${ref} to ECOM commit ${commitSha}`);

        // Load every bundle before changing anything, so one bad API fails the run up front.
        const plans: UpdatePlan[] = selected.map((spec) => {
            const { version, publicSpec } = loadBundledApi(bundlesRoot, spec.key, spec.location);
            return { spec, version, publicSpec, status: resolveStatus(version, spec.meta.version) };
        });
        for (const { spec, version, status } of plans) {
            const label = spec.key.padEnd(36);
            if (status === 'outdated') {
                console.log(`  ⬆️  ${label} ${spec.meta.version} → ${version}`);
            } else if (status === 'ahead') {
                console.log(`  ⏪ ${label} ${spec.meta.version} (ahead of ECOM ${version})`);
            } else {
                console.log(`  ✅ ${label} ${spec.meta.version} (up to date)`);
            }
        }

        const updates = plans.filter((plan) => forceReplace || plan.status === 'outdated');
        const outdatedCount = plans.filter((plan) => plan.status === 'outdated').length;
        const aheadCount = plans.filter((plan) => plan.status === 'ahead').length;
        // A spec ahead of ECOM is not drift: ECOM may not have released that version yet, and
        // treating it as drift would fail `--check` until ECOM catches up.
        const nothingOutdatedMessage =
            aheadCount === 0
                ? '✅ All SCAPI specs are up to date.'
                : `✅ No outdated SCAPI specs (${aheadCount} ahead of ECOM, marked above).`;
        if (options.check) {
            if (outdatedCount === 0) {
                console.log(nothingOutdatedMessage);
                return;
            }
            console.log(`Found ${outdatedCount} outdated spec(s). Run \`pnpm scapi:update-specs\` to update.`);
            process.exitCode = EXIT_DRIFT;
            return;
        }
        if (updates.length === 0) {
            console.log(nothingOutdatedMessage);
            return;
        }

        const stagingDir = path.join(workDir, 'staged');
        updates.forEach((plan) => stageUpdate(plan, stagingDir, ref, commitSha));
        swapSpecFolders(updates, stagingDir);

        console.log('\nRegenerating SCAPI client (pnpm scapi:generate)...');
        execFileSync('pnpm', ['scapi:generate'], { cwd: PACKAGE_ROOT, stdio: 'inherit' });
        console.log(`\n✅ Updated ${updates.length} spec(s) and regenerated the client.`);
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

try {
    main();
} catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_ERROR;
}
