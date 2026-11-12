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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditCommand } from './command';
import { finalizedAttributes, preparedAttributes, startAuditTelemetry } from './telemetry';

/** Unlike telemetry.test.ts, this runs the real SDK and only stubs the network. */
describe('audit telemetry through the real SDK', () => {
    const env = { ...process.env };
    const exitCode = process.exitCode;
    let dir: string;
    let fetchStub: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'audit-sdk-telemetry-'));
        for (const name of ['SFCC_APP_INSIGHTS_KEY', 'SF_DISABLE_TELEMETRY', 'SFCC_DISABLE_TELEMETRY'])
            delete process.env[name];
        fetchStub = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
        vi.stubGlobal('fetch', fetchStub);
    });
    afterEach(async () => {
        vi.unstubAllGlobals();
        process.env = { ...env };
        process.exitCode = exitCode; // the failing-command test goes through oclif's catch, which sets it
        await rm(dir, { recursive: true, force: true });
    });

    const config = () =>
        ({ name: '@salesforce/storefront-next-dev', version: '1.5.0', dataDir: dir, pjson: {} }) as never;

    function sentEvents(): {
        name: string;
        properties: Record<string, unknown>;
        measurements: Record<string, number>;
    }[] {
        return fetchStub.mock.calls.flatMap(([, init]) =>
            (JSON.parse((init as { body: string }).body) as { data: { baseData: never } }[]).map(
                (envelope) => envelope.data.baseData
            )
        );
    }

    it('sends the prepared summary to the constant endpoint with only counts, enums and the run id', async () => {
        const run = path.join(dir, 'run');
        await mkdir(run, { recursive: true });
        await writeFile(
            path.join(run, 'prepared.json'),
            JSON.stringify({
                run: { id: '2026-11-04T10-00-00Z' },
                pages: [{ label: 'home', url: 'https://shop.example.com/' }],
                pageFailures: [{ url: 'https://shop.example.com/x', error: 'boom at /Users/me/x' }],
                coverage: [],
                rules: [{ id: 'r1', title: 'Secret rule text' }],
                decidedFindings: [],
            })
        );

        const telemetry = await startAuditTelemetry(config(), 'audit:prepare');
        telemetry?.sendEvent('AUDIT_PREPARED', {
            command: 'audit:prepare',
            ...(await preparedAttributes(path.join(run, 'prepared.json'), { runs: 1, build: true })),
        });
        await telemetry?.stop();

        expect(String(fetchStub.mock.calls[0][0])).toMatch(
            /^https:\/\/eastus-8\.in\.applicationinsights\.azure\.com\//
        );
        const [event] = sentEvents().filter((e) => e.name.endsWith('/AUDIT_PREPARED'));
        expect(event.name).toBe('@salesforce/storefront-next-dev/AUDIT_PREPARED');
        expect(event.properties).toMatchObject({ surface: 'sfnext-audit', auditRunId: '2026-11-04T10-00-00Z' });
        const wire = JSON.stringify(fetchStub.mock.calls);
        for (const leaked of ['shop.example.com', 'Secret rule text', '/Users/me', 'boom'])
            expect(wire).not.toContain(leaked);
        expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it('keeps the event names and origin under a host CLI, and names the host in hostCli', async () => {
        const host = { name: '@salesforce/b2c-cli', version: '2.12.1', dataDir: dir, pjson: {} } as never;

        const telemetry = await startAuditTelemetry(host, 'audit:finalize');
        telemetry?.sendEvent('AUDIT_FINALIZED', { command: 'audit:finalize' });
        await telemetry?.stop();

        const [event] = sentEvents();
        expect(event.name).toBe('@salesforce/storefront-next-dev/AUDIT_FINALIZED');
        expect(event.properties).toMatchObject({
            origin: '@salesforce/storefront-next-dev',
            hostCli: '@salesforce/b2c-cli',
        });
    });

    it('drops a malformed run id, guidance and bundle status instead of sending them', async () => {
        const run = path.join(dir, 'run');
        await mkdir(path.join(run, 'bundle'), { recursive: true });
        await writeFile(path.join(run, 'bundle', 'analysis.json'), JSON.stringify({ status: 'see https://x.test/a' }));
        await writeFile(path.join(run, 'prepared.json'), JSON.stringify({ run: { id: 'https://shop.example.com/' } }));
        await writeFile(
            path.join(run, 'audit-result.json'),
            JSON.stringify({
                run: { id: '/Users/me/run' },
                summary: { guidance: 'ship it, the page https://shop.example.com is fine' },
                evaluations: [{ disposition: 'finding', severity: 'high', method: 'script' }],
            })
        );

        const telemetry = await startAuditTelemetry(config(), 'audit:finalize');
        telemetry?.sendEvent(
            'AUDIT_PREPARED',
            await preparedAttributes(path.join(run, 'prepared.json'), { runs: 1, build: true })
        );
        telemetry?.sendEvent('AUDIT_FINALIZED', await finalizedAttributes(path.join(run, 'audit-result.json')));
        await telemetry?.stop();

        const events = sentEvents();
        const finalized = events.find((e) => e.name.endsWith('/AUDIT_FINALIZED'));
        expect(finalized?.measurements).toMatchObject({ findings: 1, findingsHigh: 1, rulesByScript: 1 });
        for (const event of events)
            for (const key of ['auditRunId', 'guidance', 'bundleStatus'])
                expect(event.properties).not.toHaveProperty(key);
        const wire = JSON.stringify(fetchStub.mock.calls);
        for (const leaked of ['shop.example.com', 'x.test', '/Users/me', 'ship it']) expect(wire).not.toContain(leaked);
    });

    it('reports a failed command by error type and exit code, never by its message', async () => {
        class Failing extends AuditCommand {
            static override id = 'audit:prepare';
            run(): Promise<void> {
                return Promise.reject(new Error('fetch failed for https://shop.example.com/?token=abc123secret'));
            }
        }
        const command = new Failing([], config());
        command.id = 'audit:prepare';
        await command.init();
        // Same order as oclif's Command._run: run fails, then catch, then finally with the error.
        await command.run().catch(async (error: Error) => {
            await command['catch'](error as never).catch(() => undefined);
            await command['finally'](error);
        });

        const names = sentEvents().map((e) => e.name.split('/').pop());
        expect(names).toEqual(['COMMAND_START', 'COMMAND_ERROR']);
        const wire = JSON.stringify(fetchStub.mock.calls);
        for (const leaked of ['shop.example.com', 'abc123secret', 'fetch failed']) expect(wire).not.toContain(leaked);
        expect(sentEvents()[1].properties).toMatchObject({ command: 'sfnext:audit:prepare', errorName: 'Error' });
        expect(sentEvents()[1].measurements).toMatchObject({ exitCode: 1 });
    });

    it.each(['SF_DISABLE_TELEMETRY', 'SFCC_DISABLE_TELEMETRY'])('sends nothing with %s=true', async (name) => {
        process.env[name] = 'true';
        expect(await startAuditTelemetry(config(), 'audit:prepare')).toBeUndefined();
        expect(fetchStub).not.toHaveBeenCalled();
    });
});
