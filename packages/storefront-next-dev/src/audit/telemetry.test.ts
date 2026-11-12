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
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorName, finalizedAttributes, preparedAttributes, startAuditTelemetry, usageCommand } from './telemetry';

const sdk = vi.hoisted(() => ({
    start: vi.fn(() => Promise.resolve()),
    createTelemetry: vi.fn(),
}));
vi.mock('@salesforce/b2c-tooling-sdk/telemetry', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/b2c-tooling-sdk/telemetry')>();
    return {
        ...actual,
        createTelemetry: sdk.createTelemetry.mockImplementation(() => ({ start: sdk.start })),
    };
});

const CONNECTION = 'InstrumentationKey=00000000-0000-0000-0000-000000000000';
const config = (telemetry?: object) =>
    ({ name: '@salesforce/b2c-cli', version: '2.11.0', dataDir: '/data', pjson: { oclif: { telemetry } } }) as never;

/** No attribute may carry a URL, a host or a path. */
function expectNoLocations(attributes: object): void {
    for (const value of Object.values(attributes))
        if (typeof value === 'string') expect(value).not.toMatch(/[/\\]|example\.com|https?:/);
}

describe('startAuditTelemetry', () => {
    const env = { ...process.env };
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.SFCC_APP_INSIGHTS_KEY;
        delete process.env.SF_DISABLE_TELEMETRY;
        delete process.env.SFCC_DISABLE_TELEMETRY;
    });
    afterEach(() => {
        process.env = { ...env };
    });

    it("starts with the running CLI's connection string, as the b2c CLI has", async () => {
        await expect(
            startAuditTelemetry(config({ connectionString: CONNECTION }), 'audit:prepare')
        ).resolves.toBeDefined();

        expect(sdk.createTelemetry).toHaveBeenCalledWith({
            project: '@salesforce/storefront-next-dev',
            appInsightsKey: CONNECTION,
            version: '2.11.0',
            dataDir: '/data',
            flushIntervalMs: 30_000,
            initialAttributes: {
                command: 'audit:prepare',
                surface: 'sfnext-audit',
                storefrontNextDevVersion: expect.any(String),
                hostCli: '@salesforce/b2c-cli',
            },
        });
        expect(sdk.start).toHaveBeenCalledOnce();
    });

    it("falls back to the b2c CLI's public ingestion key when no CLI supplies one, as under pnpm exec", async () => {
        await expect(startAuditTelemetry(config(), 'audit:prepare')).resolves.toBeDefined();

        expect(sdk.createTelemetry).toHaveBeenCalledWith(
            expect.objectContaining({ appInsightsKey: expect.stringMatching(/^InstrumentationKey=[0-9a-f-]{36};/) })
        );
    });

    it('lets SFCC_APP_INSIGHTS_KEY override the key', async () => {
        process.env.SFCC_APP_INSIGHTS_KEY = CONNECTION;

        await startAuditTelemetry(config(), 'audit:prepare');

        expect(sdk.createTelemetry).toHaveBeenCalledWith(expect.objectContaining({ appInsightsKey: CONNECTION }));
    });

    it("keeps the key out of this package's package.json, so push, scapi and the other commands send nothing", async () => {
        const pjson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
            oclif: { telemetry?: unknown };
        };

        // The SDK base classes (MrtCommand, OAuthCommand, ...) start telemetry from oclif.telemetry, with raw error
        // messages and tenant details; only the audit commands may report.
        expect(pjson.oclif.telemetry).toBeUndefined();
    });

    it.each(['SF_DISABLE_TELEMETRY', 'SFCC_DISABLE_TELEMETRY'])('honors %s', async (variable) => {
        process.env[variable] = 'true';

        await expect(
            startAuditTelemetry(config({ connectionString: CONNECTION }), 'audit:prepare')
        ).resolves.toBeUndefined();
        expect(sdk.createTelemetry).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
        sdk.start.mockRejectedValueOnce(new Error('offline'));

        await expect(
            startAuditTelemetry(config({ connectionString: CONNECTION }), 'audit:prepare')
        ).resolves.toBeUndefined();
    });
});

describe('usage attributes', () => {
    let run: string;
    beforeEach(async () => {
        run = await mkdtemp(path.join(os.tmpdir(), 'audit-telemetry-'));
    });
    afterEach(async () => {
        await rm(run, { recursive: true, force: true });
    });

    it('counts a prepared run without its URLs, labels or paths', async () => {
        const preparedPath = path.join(run, 'prepared.json');
        await writeFile(
            preparedPath,
            JSON.stringify({
                run: { id: '2026-11-04T10-00-00Z' },
                project: { root: '/work/shop', packageName: 'shop' },
                pages: [
                    { label: 'home', url: 'https://example.com/', archiveDir: 'playhouse/home' },
                    { label: 'plp', url: 'https://example.com/c/shoes', archiveDir: 'playhouse/plp' },
                ],
                pageFailures: [{ label: 'pdp', url: 'https://example.com/p/1', error: 'timed out' }],
                coverage: [{ page: 'pdp', status: 'missing', note: 'timed out' }],
                rules: [{ ruleId: 'seo/title', title: 'Title', file: '/rules/seo/title.md', output: 'ai/seo.json' }],
                decidedFindings: [{ ruleId: 'performance/lcp', title: 'LCP', severity: 'high', summary: '4.1 s' }],
            })
        );
        await mkdir(path.join(run, 'bundle'));
        await writeFile(path.join(run, 'bundle', 'analysis.json'), JSON.stringify({ status: 'complete' }));

        const attributes = await preparedAttributes(preparedPath, { runs: 1, build: true });

        expect(attributes).toEqual({
            auditRunId: '2026-11-04T10-00-00Z',
            pagesCollected: 2,
            pagesFailed: 1,
            pagesMissing: 1,
            rulesForAi: 1,
            scriptFindings: 1,
            runs: 1,
            build: true,
            bundleStatus: 'complete',
        });
        expectNoLocations(attributes);
    });

    it('drops strings that are not a run id, a guidance value or a status token', async () => {
        const preparedPath = path.join(run, 'prepared.json');
        await writeFile(preparedPath, JSON.stringify({ run: { id: 'https://shop.example.com/' } }));
        await mkdir(path.join(run, 'bundle'));
        await writeFile(
            path.join(run, 'bundle', 'analysis.json'),
            JSON.stringify({ status: 'failed for /work/shop/build' })
        );
        const resultPath = path.join(run, 'audit-result.json');
        await writeFile(
            resultPath,
            JSON.stringify({ run: { id: 'shop' }, summary: { guidance: 'ship it, /work/shop looks fine' } })
        );

        const prepared = await preparedAttributes(preparedPath, { runs: 1, build: false });
        const finalized = await finalizedAttributes(resultPath);

        expect(prepared).toMatchObject({ auditRunId: undefined, bundleStatus: undefined });
        expect(finalized).toMatchObject({ auditRunId: undefined, guidance: undefined });
    });

    it('counts a finalized run by disposition and severity, with its guidance', async () => {
        const resultPath = path.join(run, 'audit-result.json');
        await writeFile(
            resultPath,
            JSON.stringify({
                run: { id: '2026-11-04T10-00-00Z' },
                pages: [{ label: 'home', url: 'https://example.com/' }],
                evaluations: [
                    { ruleId: 'a', disposition: 'finding', severity: 'critical', method: 'script', summary: 'x' },
                    { ruleId: 'b', disposition: 'finding', severity: 'medium', method: 'ai', summary: 'y' },
                    { ruleId: 'c', disposition: 'pass', method: 'ai', summary: 'z' },
                    { ruleId: 'd', disposition: 'not-verified', method: 'ai', summary: 'w' },
                ],
                summary: { guidance: 'no-go', narrative: 'Fix https://example.com/ first.' },
            })
        );

        const attributes = await finalizedAttributes(resultPath);

        expect(attributes).toEqual({
            auditRunId: '2026-11-04T10-00-00Z',
            guidance: 'no-go',
            pages: 1,
            rules: 4,
            rulesByScript: 1,
            rulesNotVerified: 1,
            findings: 2,
            findingsCritical: 1,
            findingsHigh: 0,
            findingsMedium: 1,
            findingsLow: 0,
            findingsInfo: 0,
        });
        expectNoLocations(attributes);
    });

    it('reports zeros when the files are unreadable', async () => {
        await expect(preparedAttributes(path.join(run, 'missing.json'), { runs: 1, build: false })).resolves.toEqual(
            expect.objectContaining({
                pagesCollected: 0,
                rulesForAi: 0,
                auditRunId: undefined,
                bundleStatus: undefined,
            })
        );
        await expect(finalizedAttributes(path.join(run, 'missing.json'))).resolves.toEqual(
            expect.objectContaining({ rules: 0, findings: 0, guidance: undefined })
        );
    });
});

describe('errorName', () => {
    it.each([
        [new Error('x'), 'Error'],
        [new TypeError('x'), 'TypeError'],
        [Object.assign(new Error('x'), { name: 'CLIError' }), 'CLIError'],
        [Object.assign(new Error('x'), { name: 'see https://shop.example.com/' }), 'Error'],
        [Object.assign(new Error('x'), { name: '' }), 'Error'],
        [{ name: 42 }, 'Error'],
    ])('reports %o as %s', (error, expected) => {
        expect(errorName(error)).toBe(expected);
    });
});

describe('usageCommand', () => {
    it.each([
        ['audit:prepare', 'sfnext:audit:prepare'],
        ['sfnext:audit:finalize', 'sfnext:audit:finalize'],
    ])('reports %s as %s', (id, expected) => {
        expect(usageCommand(id)).toBe(expected);
    });
});
