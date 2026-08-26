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
 * Local-only entrypoint for `pnpm e2e:turnstile`.
 *
 * - Refuses real CI (`CI=true`, `CI=1`, etc.).
 * - Strips `CI=false` / `CI=0` before spawning Codecept. Dotenv often sets
 *   `CI=false`; that string is truthy in JS, so Codecept's empty-run listener
 *   treats it as CI and exits 1 when every matched scenario is pending.
 * - Copies Turnstile server-verification flags from the storefront app `.env`
 *   into the e2e process when unset, so VerificationScenario gates match the
 *   running app without duplicating secrets in `e2e/.env`.
 *
 * Env vars:
 * - `CI` (optional): when a real CI value, this script exits 1. Local sentinels
 *   `false` / `0` / `no` are cleared before the runner starts.
 * - Example real CI: `CI=true`
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

/**
 * True when `CI` indicates an actual CI environment.
 * Treats empty, `false`, `0`, and `no` as local (not CI).
 */
export function isRealCi(value: string | undefined): boolean {
    if (value == null || value.trim() === '') return false;
    const normalized = value.trim().toLowerCase();
    return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
}

/** Keys that gate VerificationScenario / server siteverify paths. */
const APP_TURNSTILE_ENV_KEYS = ['TURNSTILE_VERIFICATION_ENABLED', 'TURNSTILE_SECRET_KEYS'] as const;

/**
 * Read Turnstile verification flags from packages/template/.env when the e2e
 * process does not already define them.
 */
export function loadAppTurnstileEnv(appEnvPath = resolve(process.cwd(), '..', '.env')): Record<string, string> {
    if (!existsSync(appEnvPath)) return {};
    try {
        const parsed = parseDotenv(readFileSync(appEnvPath));
        const out: Record<string, string> = {};
        for (const key of APP_TURNSTILE_ENV_KEYS) {
            if (!process.env[key] && typeof parsed[key] === 'string' && parsed[key].length > 0) {
                out[key] = parsed[key];
            }
        }
        return out;
    } catch {
        return {};
    }
}

function main(): void {
    const ci = process.env.CI;

    if (isRealCi(ci)) {
        process.stderr.write(
            'e2e:turnstile is local-only. CI detected — unset CI to run locally.\n' +
                '  unset CI\n' +
                'Also remove `CI=false` from packages/template/e2e/.env if present: the string\n' +
                '"false" is truthy and Codecept treats it as CI on empty runs.\n'
        );
        process.exit(1);
    }

    // Neutralize CI=false (and similar) so Codecept empty-run does not fail.
    // dotenv does not override existing keys — set CI to '' (falsy) before the
    // child loads e2e/.env so a CI=false line cannot reintroduce a truthy value.
    const env = { ...process.env, CI: '', ...loadAppTurnstileEnv() };

    const result = spawnSync('tsx', ['src/scripts/cli/test-runner.ts', '--grep', '@turnstile'], {
        stdio: 'inherit',
        env,
        cwd: process.cwd(),
        shell: true,
    });

    process.exit(result.status ?? 1);
}

// e2e tsconfig uses CommonJS (export = for Codecept inject), so avoid import.meta.
// Match the script path the same way report-runner detects ci-report-runner.
const isDirectRun = process.argv[1]?.includes('run-turnstile-e2e') ?? false;

if (isDirectRun) {
    main();
}
