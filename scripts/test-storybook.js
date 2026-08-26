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
 * Unified Storybook test runner.
 *
 * Required:
 *   --type=snapshot|interaction|a11y
 *
 * Optional:
 *   --update          # snapshot only — regenerate snapshot fixtures
 *   --coverage        # snapshot only — auto-runs generate-story-tests then vitest --coverage
 *   --static          # interaction|a11y — build storybook & serve static instead of dev
 *   --reuse-build     # interaction|a11y — serve an existing static build instead of rebuilding it
 *   --stories=<name>  # snapshot only — narrow the vitest run to story files whose
 *                     #   path contains <name> (may be a nested subpath, e.g.
 *                     #   account/order-details). Ignored for interaction|a11y: the
 *                     #   test-runner runs in --index-json mode, which only filters
 *                     #   by tag, not by file path or name.
 *
 * Snapshot tests use vitest. Interaction/a11y tests orchestrate a server
 * (storybook dev or a local `serve` of the static build) plus `test-storybook`,
 * with cleanup of the server process when done.
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

// --- arg parsing -----------------------------------------------------------
const flags = {};
for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=');
    flags[key] = value === undefined ? true : value;
}

const type = flags.type;
if (!['snapshot', 'interaction', 'a11y'].includes(type)) {
    console.error('Error: --type=snapshot|interaction|a11y is required');
    process.exit(2);
}

if (flags['reuse-build'] && (!flags.static || type === 'snapshot')) {
    console.error('Error: --reuse-build requires --static with --type=interaction or --type=a11y');
    process.exit(2);
}

// `--stories` with no usable value can't filter anything: the space form
// `--stories <name>` parses to boolean `true`, and the empty form `--stories=`
// parses to `''`. The first would silently run the full suite; the second would
// push an empty positional to vitest and crash. Fail loud for both so a
// no-value form can't masquerade as a filtered run. Scoped to snapshot — the
// only type that honors `--stories`; interaction/a11y ignore it entirely, so
// erroring there would demand a value that does nothing for those types.
if (type === 'snapshot' && (flags.stories === true || flags.stories === '')) {
    console.error('Error: --stories needs a value — use --stories=<name>');
    process.exit(2);
}

// --- helpers ---------------------------------------------------------------
function run(cmd, args, env = process.env) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            env,
            stdio: 'inherit',
            shell: process.platform === 'win32',
        });
        child.on('close', (code) => resolve(code ?? 0));
        child.on('error', reject);
    });
}

// --- snapshot --------------------------------------------------------------
if (type === 'snapshot') {
    const args = ['run'];
    if (flags.update) args.push('-u');
    if (flags.coverage) {
        const genCode = await run('node', ['scripts/generate-story-tests.js']);
        if (genCode !== 0) process.exit(genCode);
        args.push('--coverage');
    }
    args.push('--config', './.storybook/vite.config.ts');
    // vitest treats trailing positionals as filename filters — narrow to story
    // files whose path contains <name>.
    if (typeof flags.stories === 'string') args.push(flags.stories);
    process.exit(await run('vitest', args));
}

// --- interaction | a11y ----------------------------------------------------
const isA11y = type === 'a11y';
const port = flags.static ? 3000 : 6006;
const url = `http://127.0.0.1:${port}`;

// a11y env vars apply only to runtime processes, NOT the static build:
// `.storybook/main.ts` inlines `process.env.STORYBOOK_A11Y_TEST_MODE` at build
// time via Vite `define`, so setting 'error' during the build would bake hard
// failures into the static bundle for every pre-existing violation. Original
// bash scripts only set these on the concurrently invocation that wraps the
// server + test-storybook — keep parity.
const testEnv = {
    ...process.env,
    ...(isA11y ? { STORYBOOK_A11Y_TEST_MODE: 'error' } : { STORYBOOK_DISABLE_A11Y: 'true' }),
};

if (flags.static && !flags['reuse-build']) {
    const buildCode = await run('pnpm', ['storybook:build']);
    if (buildCode !== 0) process.exit(buildCode);
}

if (
    flags['reuse-build'] &&
    (!existsSync('.storybook/storybook-static/index.html') || !existsSync('.storybook/storybook-static/index.json'))
) {
    console.error('Error: --reuse-build requires a completed static Storybook build');
    process.exit(1);
}

// Serve the static build with the LOCAL `serve` binary (a devDependency) via
// `pnpm exec`, NOT `npx serve`. `npx serve` resolved `serve` from the network on
// every run (it wasn't a dependency), which intermittently blew past the
// readiness window under CI load and surfaced only as a blind
// `wait-on ... Timed out` — the static-server-startup flake. `pnpm exec` uses
// the installed binary, so there's no per-run fetch. Same for `wait-on` below.
const serverCmd = flags.static
    ? { cmd: 'pnpm', args: ['exec', 'serve', '.storybook/storybook-static', '-p', String(port)] }
    : { cmd: 'pnpm', args: ['storybook'] };

const server = spawn(serverCmd.cmd, serverCmd.args, {
    env: testEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
});

// Buffer the server's output (capped) so that if it fails to come up we can
// PRINT what it said, instead of swallowing it and leaving only a bare
// `wait-on` timeout with no diagnostics. Still drained continuously so the pipe
// buffer can't fill and block the child.
let serverLog = '';
const recordServerOutput = (chunk) => {
    serverLog += chunk.toString();
    if (serverLog.length > 8192) serverLog = serverLog.slice(-8192);
};
server.stdout.on('data', recordServerOutput);
server.stderr.on('data', recordServerOutput);

// Detect the server dying before it ever became ready — otherwise we'd wait the
// full wait-on timeout for a process that's already gone. Flips to true on exit.
let serverExited = false;
let serverExitInfo = '';
server.on('exit', (code, signal) => {
    serverExited = true;
    serverExitInfo = `code=${code} signal=${signal}`;
});

const cleanup = () => {
    try {
        if (!server.killed) server.kill('SIGTERM');
    } catch {
        // already gone
    }
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
});

const failServer = (reason) => {
    console.error(`\n❌ Static Storybook server failed to start: ${reason}`);
    if (serverExited) console.error(`   server process exited early (${serverExitInfo})`);
    if (serverLog.trim()) {
        console.error('   --- server output (last 8KB) ---');
        console.error(
            serverLog
                .trim()
                .split('\n')
                .map((l) => `   ${l}`)
                .join('\n')
        );
    }
    cleanup();
    process.exit(1);
};

try {
    // Race readiness (LOCAL wait-on binary) against the server dying — no point
    // waiting the full timeout for a process that's already gone. `serverExited`
    // (set by the server.on('exit') handler above) covers the already-dead case;
    // server.once('exit') covers a death mid-wait.
    const waitCode = await Promise.race([
        run('pnpm', ['exec', 'wait-on', url, '--timeout', '120000']),
        new Promise((resolve) => {
            if (serverExited) return resolve(1);
            server.once('exit', () => resolve(1));
        }),
    ]);
    if (waitCode !== 0) {
        failServer(serverExited ? 'process exited before serving' : `timed out waiting for ${url}`);
    }
    // Give storybook a moment to settle (mirrors `sleep 1` from the original bash)
    await new Promise((r) => setTimeout(r, 1000));

    const code = await run(
        'test-storybook',
        [
            '--url',
            url,
            '--index-json',
            '--config-dir',
            '.storybook',
            '--browsers',
            'chromium',
            '--maxWorkers',
            '3',
            ...(isA11y ? ['--excludeTags', 'skip-a11y'] : ['--includeTags', 'interaction']),
        ],
        testEnv
    );
    cleanup();
    process.exit(code);
} catch (err) {
    cleanup();
    console.error(err);
    process.exit(1);
}
