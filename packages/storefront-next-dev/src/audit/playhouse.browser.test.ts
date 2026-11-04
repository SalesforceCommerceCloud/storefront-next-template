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
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// playwright-core reads the browser cache location once, when it loads, so point it at an empty one first.
process.env.PLAYWRIGHT_BROWSERS_PATH = await mkdtemp(path.join(os.tmpdir(), 'sfnext-browsers-'));
delete process.env.PLAYHOUSE_CHROME_PATH;
const { ensureBrowser } = await import('./playhouse');
const { chromium } = await import('playwright-core');
const expected = chromium.executablePath();
const require = createRequire(import.meta.url);

/** A stand-in for Playwright's CLI that records its arguments and runs `body`. */
async function fakeCli(body: string) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sfnext-playwright-cli-'));
    const cli = path.join(dir, 'cli.mjs');
    await writeFile(
        cli,
        `import{mkdirSync,writeFileSync}from'node:fs';import path from'node:path';writeFileSync(${JSON.stringify(path.join(dir, 'argv.json'))},JSON.stringify(process.argv.slice(2)));${body}`
    );
    return { cli, argv: async (): Promise<unknown> => JSON.parse(await readFile(path.join(dir, 'argv.json'), 'utf8')) };
}
const logs: string[] = [];
const log = (message: string): Promise<void> => {
    logs.push(message);
    return Promise.resolve();
};

describe('ensureBrowser', () => {
    it('uses a browser set with PLAYHOUSE_CHROME_PATH as is', async () => {
        const { cli, argv } = await fakeCli('process.exit(1);');
        process.env.PLAYHOUSE_CHROME_PATH = '/opt/chrome';
        try {
            expect(await ensureBrowser(log, cli)).toBe('/opt/chrome');
        } finally {
            delete process.env.PLAYHOUSE_CHROME_PATH;
        }
        // Playwright is not run.
        await expect(argv()).rejects.toThrow(/ENOENT/);
    });

    it('explains a failed download and how to install by hand', async () => {
        const { cli } = await fakeCli(
            `console.log('Downloading Chrome for Testing');console.error('Error: getaddrinfo ENOTFOUND cdn.playwright.dev\\n    at /secret/stack.js:1:1');console.log('Error: Failed to download Chrome for Testing, caused by');process.exit(1);`
        );
        const error = await ensureBrowser(log, cli).then(
            () => undefined,
            (reason: unknown) => reason
        );
        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toMatch(
            /^Could not download Chromium for Playhouse: getaddrinfo ENOTFOUND cdn\.playwright\.dev; Failed to download Chrome for Testing\n/
        );
        expect(message).toMatch(/HTTPS_PROXY/);
        expect(message).toMatch(/npx playwright-core@1\.63\.0 install chromium --no-shell$/);
        expect(message).not.toMatch(/secret/);
    });

    it('is an error when a download leaves no browser', async () => {
        const { cli } = await fakeCli('');
        await expect(ensureBrowser(log, cli)).rejects.toThrow(/still missing/);
    });

    it('installs a missing browser with Playwright, then reuses it', async () => {
        logs.length = 0;
        const { cli, argv } = await fakeCli(
            `mkdirSync(path.dirname(${JSON.stringify(expected)}),{recursive:true});writeFileSync(${JSON.stringify(expected)},'',{mode:0o755});`
        );
        expect(await ensureBrowser(log, cli)).toBe(expected);
        expect(await argv()).toEqual(['install', 'chromium', '--no-shell']);
        expect(logs).toEqual(['Downloading Chromium for Playhouse (one time, about 180 MB)']);
        await access(expected);
        const again = await fakeCli('process.exit(1);');
        expect(await ensureBrowser(log, again.cli)).toBe(expected);
        // An installed browser is not installed again.
        await expect(again.argv()).rejects.toThrow(/ENOENT/);
    });

    it('pins playwright-core to the Playwright that Playhouse is built for, so the browser revisions match', () => {
        const { version } = require('playwright-core/package.json') as { version: string };
        const playhouse = require('@salesforce/playhouse/package.json') as { dependencies: Record<string, string> };
        expect(version).toBe(playhouse.dependencies.playwright);
    });
});
