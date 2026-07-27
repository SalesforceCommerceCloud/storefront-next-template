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
 * Runs the same OxLint config as `pnpm lint` but reports only `jsx-a11y/*`
 * findings, so contributors can check accessibility rules locally before the
 * full gate runs in CI. This does not replace `pnpm lint`; the a11y rules ship
 * at `error` in the shared config and are enforced there regardless.
 *
 * Exit code is 1 when any `jsx-a11y/*` finding is present, 0 otherwise, 2 when
 * OxLint itself fails to run or produce parseable output.
 */

import { spawnSync } from 'node:child_process';

// Mirror the `lint` script's invocation so the a11y pass sees the exact same
// rule surface (type-aware, e2e excluded). `-f json` gives us machine-readable
// diagnostics to filter; a non-zero exit here is expected whenever findings
// exist, so we key off parsed output rather than the exit code.
const result = spawnSync('oxlint', ['--type-aware', '--ignore-pattern', 'e2e/**', '-f', 'json', '.'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
    console.error('Failed to run oxlint:', result.error.message);
    process.exit(2);
}

let report;
try {
    report = JSON.parse(result.stdout || '{}');
} catch {
    // OxLint could not produce JSON (config load error, crash) — surface its stderr.
    console.error(result.stderr || 'oxlint produced no parseable output');
    process.exit(2);
}

// OxLint codes look like `jsx-a11y(alt-text)`; match the plugin prefix.
const isA11y = (code) => typeof code === 'string' && code.startsWith('jsx-a11y(');
const diagnostics = Array.isArray(report.diagnostics) ? report.diagnostics : [];

const byFile = new Map();
for (const d of diagnostics) {
    if (!isA11y(d.code)) continue;
    const list = byFile.get(d.filename) ?? [];
    list.push(d);
    byFile.set(d.filename, list);
}

let count = 0;
for (const [filename, messages] of byFile) {
    console.log(`\n${filename}`);
    for (const m of messages) {
        count += 1;
        const span = m.labels?.[0]?.span;
        const loc = span ? `${span.line}:${span.column}` : '?:?';
        console.log(`  ${loc}  ${m.code}  ${m.message}`);
    }
}

if (count === 0) {
    console.log('No jsx-a11y issues found.');
    process.exit(0);
}

console.log(`\n${count} jsx-a11y issue${count === 1 ? '' : 's'} found.`);
process.exit(1);
