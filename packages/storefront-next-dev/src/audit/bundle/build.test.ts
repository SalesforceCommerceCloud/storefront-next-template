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
import { mkdir, mkdtemp, readFile, realpath, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { write } from '../__fixtures__/bundle';
import { buildForAnalysis, detectPackageManager } from './build';

describe('buildForAnalysis', () => {
    it('runs the project script twice with the visualizer switched on, then off, and never opens a browser', async () => {
        const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sfnext-build-')));
        const project = path.join(root, 'store');
        const run = path.join(root, 'run');
        await mkdir(run);
        await write(
            path.join(project, 'package.json'),
            JSON.stringify({ name: 'store', scripts: { build: 'node build.mjs' } })
        );
        await write(
            path.join(project, 'build.mjs'),
            `
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
mkdirSync('build/client/assets', { recursive: true });
writeFileSync('build/client/assets/entry-A.js', 'const a=1;');
// The no-op open shim is a POSIX script; Windows has no open command to shadow.
const opened = process.platform === 'win32' ? '' : execFileSync('open', ['build/client-bundle-size.html'], { encoding: 'utf8' });
appendFileSync('env.log', JSON.stringify({ analyze: process.env.BUNDLES_SIZE_ANALYZE ?? null, check: process.env.BUNDLES_SIZE_CHECK ?? null, open: process.env.BUNDLES_SIZE_OPEN ?? null, opened }) + '\\n');
if (process.env.BUNDLES_SIZE_ANALYZE) writeFileSync('build/client-bundle-size.html', '<html>const data = {};</html>');
`
        );
        const previous = process.env.BUNDLES_SIZE_CHECK;
        process.env.BUNDLES_SIZE_CHECK = 'true';
        try {
            const outputs = await buildForAnalysis(project, run);
            expect(outputs.notes).toEqual([]);
            expect(outputs.assetsDir).toBe(path.join(project, 'build/client/assets'));
            expect(outputs.visualizer).toBe('bundle/client-bundle-size.html');
            expect(await readFile(path.join(run, 'bundle/client-bundle-size.html'), 'utf8')).toBe(
                outputs.visualizerHtml
            );
            const env = (await readFile(path.join(project, 'env.log'), 'utf8'))
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            expect(env).toEqual([
                { analyze: 'true', check: null, open: 'false', opened: '' },
                { analyze: null, check: null, open: 'false', opened: '' },
            ]);
            expect((await readFile(path.join(run, 'bundle/build.log'), 'utf8')).includes('--- stderr ---')).toBe(true);
        } finally {
            if (previous === undefined) delete process.env.BUNDLES_SIZE_CHECK;
            else process.env.BUNDLES_SIZE_CHECK = previous;
        }
    });

    it('turns a failing or missing build into a note, and never uses stale output', async () => {
        const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sfnext-build-')));
        const project = path.join(root, 'store');
        const run = path.join(root, 'run');
        await mkdir(run);
        await write(path.join(project, 'package.json'), JSON.stringify({ name: 'store' }));
        expect((await buildForAnalysis(project, run)).notes[0]).toMatch(/no build script/);

        await write(
            path.join(project, 'package.json'),
            JSON.stringify({ name: 'store', scripts: { build: 'node -e "process.exit(3)"' } })
        );
        const failed = await buildForAnalysis(project, run);
        expect(failed.assetsDir).toBeNull();
        expect(failed.notes.join('\n')).toMatch(/analyze build failed \(exit code 3\)/);
        expect(failed.notes.join('\n')).toMatch(/production build failed \(exit code 3\)/);

        // The note carries the build's own error line, not just its exit code.
        await write(
            path.join(project, 'package.json'),
            JSON.stringify({
                name: 'store',
                scripts: {
                    build: `node -e "console.log('[warn] noisy'); console.error('  at x\\nError: Cannot find module \\'@tailwindcss/cli/package.json\\''); process.exit(1)"`,
                },
            })
        );
        const missing = (await buildForAnalysis(project, run)).notes[0];
        expect(missing).toMatch(
            /analyze build failed \(exit code 1: Error: Cannot find module '@tailwindcss\/cli\/package\.json'\)/
        );
        expect(missing).toMatch(
            /A module it needs isn't installed: run `\w+ install` in the project, then audit again\./
        );

        // An old build/ from before this run doesn't count as this build's output.
        await write(path.join(project, 'build/client/assets/old.js'), '1');
        await write(path.join(project, 'build/client-bundle-size.html'), 'old');
        const old = new Date(Date.now() - 60_000);
        await utimes(path.join(project, 'build/client/assets/old.js'), old, old);
        await utimes(path.join(project, 'build/client-bundle-size.html'), old, old);
        await write(
            path.join(project, 'package.json'),
            JSON.stringify({ name: 'store', scripts: { build: 'node -e ""' } })
        );
        const stale = await buildForAnalysis(project, run);
        expect([stale.assetsDir, stale.visualizerHtml]).toEqual([null, null]);
        expect(stale.notes.join('\n')).toMatch(/didn't write build\/client-bundle-size\.html/);
        expect(stale.notes.join('\n')).toMatch(/didn't write build\/client\/assets/);
    });
});

describe('detectPackageManager', () => {
    it('takes packageManager, else the nearest lockfile', async () => {
        const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sfnext-pm-')));
        const project = path.join(root, 'packages/store');
        await write(path.join(project, 'package.json'), JSON.stringify({ name: 'store' }));
        await write(path.join(root, 'pnpm-lock.yaml'), '');
        expect(await detectPackageManager(project)).toBe('pnpm');
        await write(
            path.join(project, 'package.json'),
            JSON.stringify({ name: 'store', packageManager: 'yarn@4.1.0' })
        );
        expect(await detectPackageManager(project)).toBe('yarn');
    });
});
