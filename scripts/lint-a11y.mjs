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
 * Accessibility-only lint check.
 *
 * Runs the same ESLint config as `pnpm lint` but reports only `jsx-a11y/*`
 * findings, so contributors can check accessibility rules locally before the
 * full gate runs in CI. This does not replace `pnpm lint`; the a11y rules ship
 * at `error` in the shared config and are enforced there regardless.
 *
 * Exit code is 1 when any `jsx-a11y/*` error is found, 0 otherwise.
 *
 * Environment variables:
 * - NODE_OPTIONS (optional) — inherited; the wrapper adds
 *   `--max-old-space-size=8192` to match `pnpm lint` on large trees.
 */

import { spawnSync } from 'node:child_process';

// Reuse the same cache file as `pnpm lint` (already gitignored) so the a11y
// pass is fast after a full lint and no extra cache artifact is left behind.
const result = spawnSync('eslint', ['.', '--format', 'json', '--cache'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
});

if (result.error) {
    console.error('Failed to run eslint:', result.error.message);
    process.exit(2);
}

let files;
try {
    files = JSON.parse(result.stdout || '[]');
} catch {
    // ESLint could not produce JSON (config load error, crash) — surface its stderr.
    console.error(result.stderr || 'eslint produced no parseable output');
    process.exit(2);
}

const A11Y_PREFIX = 'jsx-a11y/';
let count = 0;

for (const file of files) {
    const a11yMessages = file.messages.filter((m) => m.ruleId && m.ruleId.startsWith(A11Y_PREFIX));
    if (a11yMessages.length === 0) continue;

    console.log(`\n${file.filePath}`);
    for (const m of a11yMessages) {
        count += 1;
        console.log(`  ${m.line}:${m.column}  ${m.ruleId}  ${m.message}`);
    }
}

if (count === 0) {
    console.log('No jsx-a11y issues found.');
    process.exit(0);
}

console.log(`\n${count} jsx-a11y issue${count === 1 ? '' : 's'} found.`);
process.exit(1);
