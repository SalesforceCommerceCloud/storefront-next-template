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
 * Runs Chromatic on a Storybook build that contains ONLY the stories tagged
 * `chromatic-core`.
 *
 * Sets CHROMATIC_CORE_ONLY=true so .storybook/main.ts narrows its `stories` glob to
 * the tagged files. Untagged stories never enter the build, so there is nothing to
 * snapshot as TurboSnap noise — keeping snapshot counts within the Chromatic free
 * tier. (To simply view every story locally, use `pnpm storybook` instead.)
 *
 * Usage:
 *   node scripts/chromatic-core.js [chromatic-args]
 *
 * Example:
 *   node scripts/chromatic-core.js --project-token=xxx
 */

import { execSync } from 'child_process';
import path, { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findCoreStoryFiles } from './core-story-files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Find every story file tagged `chromatic-core` (shared with .storybook/main.ts).
const coreStoryFiles = findCoreStoryFiles(rootDir);

for (const file of coreStoryFiles) {
    console.log(`✓ Found core story: ${path.relative(rootDir, file)}`);
}

if (coreStoryFiles.length === 0) {
    console.error('❌ No stories found with chromatic-core tag');
    process.exit(1);
}

console.log(`\n📊 Building Storybook with ONLY these ${coreStoryFiles.length} core stories (no TurboSnap)\n`);

// Get any additional args passed to this script.
const additionalArgs = process.argv.slice(2).join(' ');

// `--exit-zero-on-changes` keeps this script non-blocking: a visual diff is
// reported but the process still exits 0. This is deliberate so LOCAL runs stay
// developer-friendly — iterating on a component shouldn't fail your shell just
// because a snapshot moved.
//
// Do NOT remove this flag to create a CI "hard gate" (a merge-blocking check).
// Deleting it here would also break local iteration, since local and CI share
// this one command. Enforce a hard gate strictly at the workflow level instead —
// e.g. drop the flag only in the CI `run:` step, or (preferred) mark the native
// Chromatic "UI Tests" status as required via branch-protection rules. That keeps
// the local/CI postures independent.
//
// The build is already scoped by CHROMATIC_CORE_ONLY, so no --only-story-files needed.
const command = `chromatic --build-script-name=storybook:build --exit-zero-on-changes ${additionalArgs}`;

console.log('Running Chromatic against the scoped build...\n');
console.log(`Command: ${command}\n`);

try {
    // CHROMATIC_CORE_ONLY is read by .storybook/main.ts to narrow its `stories` glob.
    // Inherited by the storybook:build child process spawned by the chromatic CLI.
    execSync(command, {
        stdio: 'inherit',
        cwd: rootDir,
        env: { ...process.env, CHROMATIC_CORE_ONLY: 'true' },
    });
} catch (error) {
    process.exit(error.status || 1);
}
