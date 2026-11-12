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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '@oclif/core';
import type { Telemetry, TelemetryAttributes } from '@salesforce/b2c-tooling-sdk/telemetry';
import { VERSION } from './assets';
import { GUIDANCE } from './guidance';
import { SEVERITY_ORDER } from './results';
import { RUN_ID } from './runs';

/**
 * The b2c CLI's Application Insights connection string: a public, write-only ingestion key that `@salesforce/b2c-cli`
 * already ships in its package.json, not a credential. It is the fallback for `pnpm exec sfnext audit`, where no host
 * CLI supplies one. It is deliberately not in this package's package.json: the SDK base classes of `push`, `scapi` and
 * the other commands read `oclif.telemetry` there and would start reporting too.
 */
const AUDIT_CONNECTION_STRING =
    'InstrumentationKey=6fcc215f-0b11-4864-ad5c-3945ae19e2f3;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=a60f17ec-265a-4dfc-b8df-03a64695697d';

/** Events are sent every 30 s, so an audit that is killed mid-run loses at most that much. */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * The event name prefix (`<project>/COMMAND_START`) and `origin`, fixed so the audit's events keep one name whether
 * they run under `pnpm exec sfnext` or a host CLI such as `b2c`, and never mix with the host CLI's own command events.
 * The running CLI goes in `hostCli`.
 */
const TELEMETRY_PROJECT = '@salesforce/storefront-next-dev';

/**
 * Starts usage telemetry for an audit command, with the host CLI's connection string (the b2c CLI has one) or
 * {@link AUDIT_CONNECTION_STRING}. The B2C CLI's opt-outs apply (`SF_DISABLE_TELEMETRY`, `SFCC_DISABLE_TELEMETRY`).
 * Never throws.
 */
export async function startAuditTelemetry(config: Config, command: string): Promise<Telemetry | undefined> {
    try {
        const { Telemetry, createTelemetry } = await import('@salesforce/b2c-tooling-sdk/telemetry');
        const pjson = config.pjson as { oclif?: { telemetry?: { connectionString?: string } } };
        const appInsightsKey = Telemetry.getConnectionString(
            pjson.oclif?.telemetry?.connectionString ?? AUDIT_CONNECTION_STRING
        );
        if (!appInsightsKey) return undefined;
        const telemetry = createTelemetry({
            project: TELEMETRY_PROJECT,
            appInsightsKey,
            version: config.version,
            dataDir: config.dataDir,
            flushIntervalMs: FLUSH_INTERVAL_MS,
            initialAttributes: {
                command,
                surface: 'sfnext-audit',
                storefrontNextDevVersion: VERSION,
                hostCli: config.name,
            },
        });
        await telemetry.start();
        return telemetry;
    } catch {
        return undefined;
    }
}

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/** Strings come from files in the workspace, so only values of the expected shape are sent. */
const runId = (value: unknown): string | undefined =>
    typeof value === 'string' && RUN_ID.test(value) ? value : undefined;
const guidance = (value: unknown): string | undefined =>
    typeof value === 'string' && (GUIDANCE as readonly string[]).includes(value) ? value : undefined;
const statusToken = (value: unknown): string | undefined =>
    typeof value === 'string' && /^[a-z][a-z-]{0,23}$/.test(value) ? value : undefined;

/**
 * The `command` dimension: the oclif id under the `sfnext` topic (`sfnext:audit:prepare`), the id the b2c CLI gives
 * these commands, so usage segments the same way whether `pnpm exec sfnext` or `b2c sfnext` ran them.
 */
export const usageCommand = (id: string | undefined): string => `sfnext:${(id ?? '').replace(/^sfnext:/, '')}`;

/** An error's class name (`Error`, `CLIError`, `TypeError`), or `Error` when `name` holds anything else. */
export const errorName = (error: { name?: unknown }): string =>
    typeof error.name === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(error.name) ? error.name : 'Error';

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
    try {
        return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

/**
 * Counts from a run's prepared.json and bundle/analysis.json. Only counts, enums and the run id (a timestamp
 * that joins a run's prepare and finalize): never URLs, page labels, paths, rule text or findings.
 */
export async function preparedAttributes(
    preparedPath: string,
    options: { runs: number; build: boolean }
): Promise<TelemetryAttributes> {
    const [preparedFile, bundle] = await Promise.all([
        readJson(preparedPath),
        readJson(path.join(path.dirname(preparedPath), 'bundle', 'analysis.json')),
    ]);
    const prepared = preparedFile ?? {};
    const run = prepared.run as { id?: unknown } | undefined;
    return {
        auditRunId: runId(run?.id),
        pagesCollected: count(prepared.pages),
        pagesFailed: count(prepared.pageFailures),
        pagesMissing: count(prepared.coverage),
        rulesForAi: count(prepared.rules),
        scriptFindings: count(prepared.decidedFindings),
        runs: options.runs,
        build: options.build,
        bundleStatus: statusToken(bundle?.status),
    };
}

/** Counts and the launch guidance from a run's audit-result.json, under the same rules as {@link preparedAttributes}. */
export async function finalizedAttributes(resultPath: string): Promise<TelemetryAttributes> {
    const result = (await readJson(resultPath)) ?? {};
    const run = result.run as { id?: unknown } | undefined;
    const summary = result.summary as { guidance?: unknown } | undefined;
    const evaluations = (Array.isArray(result.evaluations) ? result.evaluations : []) as {
        disposition?: unknown;
        severity?: unknown;
        method?: unknown;
    }[];
    const findings = evaluations.filter((evaluation) => evaluation.disposition === 'finding');
    return {
        auditRunId: runId(run?.id),
        guidance: guidance(summary?.guidance),
        pages: count(result.pages),
        rules: evaluations.length,
        rulesByScript: evaluations.filter((evaluation) => evaluation.method === 'script').length,
        rulesNotVerified: evaluations.filter((evaluation) => evaluation.disposition === 'not-verified').length,
        findings: findings.length,
        ...Object.fromEntries(
            SEVERITY_ORDER.map((severity) => [
                `findings${severity[0].toUpperCase()}${severity.slice(1)}`,
                findings.filter((finding) => finding.severity === severity).length,
            ])
        ),
    };
}
