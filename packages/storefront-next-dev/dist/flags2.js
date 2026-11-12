import { r as PROJECT_DIRECTORY_FLAG } from "./flags.js";
import { S as VERSION, _ as GUIDANCE, f as RUN_ID, n as SEVERITY_ORDER, y as sanitizeText } from "./results.js";
import { Command, Errors, Flags } from "@oclif/core";
import path from "node:path";
import { readFile } from "node:fs/promises";

//#region src/audit/telemetry.ts
/**
* The b2c CLI's Application Insights connection string: a public, write-only ingestion key that `@salesforce/b2c-cli`
* already ships in its package.json, not a credential. It is the fallback for `pnpm exec sfnext audit`, where no host
* CLI supplies one. It is deliberately not in this package's package.json: the SDK base classes of `push`, `scapi` and
* the other commands read `oclif.telemetry` there and would start reporting too.
*/
const AUDIT_CONNECTION_STRING = "InstrumentationKey=6fcc215f-0b11-4864-ad5c-3945ae19e2f3;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=a60f17ec-265a-4dfc-b8df-03a64695697d";
/** Events are sent every 30 s, so an audit that is killed mid-run loses at most that much. */
const FLUSH_INTERVAL_MS = 3e4;
/**
* The event name prefix (`<project>/COMMAND_START`) and `origin`, fixed so the audit's events keep one name whether
* they run under `pnpm exec sfnext` or a host CLI such as `b2c`, and never mix with the host CLI's own command events.
* The running CLI goes in `hostCli`.
*/
const TELEMETRY_PROJECT = "@salesforce/storefront-next-dev";
/**
* Starts usage telemetry for an audit command, with the host CLI's connection string (the b2c CLI has one) or
* {@link AUDIT_CONNECTION_STRING}. The B2C CLI's opt-outs apply (`SF_DISABLE_TELEMETRY`, `SFCC_DISABLE_TELEMETRY`).
* Never throws.
*/
async function startAuditTelemetry(config, command) {
	try {
		const { Telemetry, createTelemetry } = await import("@salesforce/b2c-tooling-sdk/telemetry");
		const pjson = config.pjson;
		const appInsightsKey = Telemetry.getConnectionString(pjson.oclif?.telemetry?.connectionString ?? AUDIT_CONNECTION_STRING);
		if (!appInsightsKey) return void 0;
		const telemetry = createTelemetry({
			project: TELEMETRY_PROJECT,
			appInsightsKey,
			version: config.version,
			dataDir: config.dataDir,
			flushIntervalMs: FLUSH_INTERVAL_MS,
			initialAttributes: {
				command,
				surface: "sfnext-audit",
				storefrontNextDevVersion: VERSION,
				hostCli: config.name
			}
		});
		await telemetry.start();
		return telemetry;
	} catch {
		return;
	}
}
const count = (value) => Array.isArray(value) ? value.length : 0;
/** Strings come from files in the workspace, so only values of the expected shape are sent. */
const runId = (value) => typeof value === "string" && RUN_ID.test(value) ? value : void 0;
const guidance = (value) => typeof value === "string" && GUIDANCE.includes(value) ? value : void 0;
const statusToken = (value) => typeof value === "string" && /^[a-z][a-z-]{0,23}$/.test(value) ? value : void 0;
/**
* The `command` dimension: the oclif id under the `sfnext` topic (`sfnext:audit:prepare`), the id the b2c CLI gives
* these commands, so usage segments the same way whether `pnpm exec sfnext` or `b2c sfnext` ran them.
*/
const usageCommand = (id) => `sfnext:${(id ?? "").replace(/^sfnext:/, "")}`;
/** An error's class name (`Error`, `CLIError`, `TypeError`), or `Error` when `name` holds anything else. */
const errorName = (error) => typeof error.name === "string" && /^[A-Za-z_$][\w$]{0,63}$/.test(error.name) ? error.name : "Error";
async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch {
		return;
	}
}
/**
* Counts from a run's prepared.json and bundle/analysis.json. Only counts, enums and the run id (a timestamp
* that joins a run's prepare and finalize): never URLs, page labels, paths, rule text or findings.
*/
async function preparedAttributes(preparedPath, options) {
	const [preparedFile, bundle] = await Promise.all([readJson(preparedPath), readJson(path.join(path.dirname(preparedPath), "bundle", "analysis.json"))]);
	const prepared = preparedFile ?? {};
	const run = prepared.run;
	return {
		auditRunId: runId(run?.id),
		pagesCollected: count(prepared.pages),
		pagesFailed: count(prepared.pageFailures),
		pagesMissing: count(prepared.coverage),
		rulesForAi: count(prepared.rules),
		scriptFindings: count(prepared.decidedFindings),
		runs: options.runs,
		build: options.build,
		bundleStatus: statusToken(bundle?.status)
	};
}
/** Counts and the launch guidance from a run's audit-result.json, under the same rules as {@link preparedAttributes}. */
async function finalizedAttributes(resultPath) {
	const result = await readJson(resultPath) ?? {};
	const run = result.run;
	const summary = result.summary;
	const evaluations = Array.isArray(result.evaluations) ? result.evaluations : [];
	const findings = evaluations.filter((evaluation) => evaluation.disposition === "finding");
	return {
		auditRunId: runId(run?.id),
		guidance: guidance(summary?.guidance),
		pages: count(result.pages),
		rules: evaluations.length,
		rulesByScript: evaluations.filter((evaluation) => evaluation.method === "script").length,
		rulesNotVerified: evaluations.filter((evaluation) => evaluation.disposition === "not-verified").length,
		findings: findings.length,
		...Object.fromEntries(SEVERITY_ORDER.map((severity) => [`findings${severity[0].toUpperCase()}${severity.slice(1)}`, findings.filter((finding) => finding.severity === severity).length]))
	};
}

//#endregion
//#region src/audit/command.ts
/**
* Base for the audit commands: an error's message is sanitized before oclif prints it, so a token in a `--url` stays
* out of the terminal. Each command also reports COMMAND_START, COMMAND_SUCCESS and COMMAND_ERROR
* like the B2C CLI's own commands, but without the error message, which can hold a storefront URL.
*/
var AuditCommand = class extends Command {
	/** Whether the command reports COMMAND_* events. Off for the ones an agent calls repeatedly or that keep running. */
	static reportsUsage = true;
	telemetry;
	startedAt = Date.now();
	async init() {
		await super.init();
		this.startedAt = Date.now();
		if (!this.constructor.reportsUsage) return;
		this.telemetry = await startAuditTelemetry(this.config, usageCommand(this.id));
		this.telemetry?.sendEvent("COMMAND_START", { command: usageCommand(this.id) });
		this.telemetry?.flush().catch(() => void 0);
	}
	/** Sends a usage event when telemetry is on. Building its attributes or sending it never fails the command. */
	async track(event, attributes) {
		if (!this.telemetry) return;
		try {
			this.telemetry.sendEvent(event, {
				command: usageCommand(this.id),
				...await attributes()
			});
		} catch {}
	}
	async catch(error) {
		error.message = sanitizeText(error.message);
		this.telemetry?.sendEvent("COMMAND_ERROR", {
			command: usageCommand(this.id),
			exitCode: error.oclif?.exit ?? error.exitCode ?? 1,
			duration: Date.now() - this.startedAt,
			errorName: errorName(error)
		});
		return super.catch(error);
	}
	async finally(error) {
		if (!error) this.telemetry?.sendEvent("COMMAND_SUCCESS", {
			command: usageCommand(this.id),
			duration: Date.now() - this.startedAt
		});
		await this.telemetry?.stop().catch(() => void 0);
		this.telemetry = void 0;
		return super.finally(error);
	}
};

//#endregion
//#region src/audit/flags.ts
/** A string flag that rejects an empty value (`--workspace ""` or `--workspace=`) instead of treating it as the
* current directory. Like oclif's own parse errors, it exits 2. */
const text = Flags.custom({ parse(value) {
	return value ? Promise.resolve(value) : Promise.reject(new Errors.CLIError("needs a value", { exit: 2 }));
} });
/** `--workspace`, for the verbs that act on an existing workspace. */
const workspaceFlag = (description, options = {}) => text({
	...options,
	helpValue: "<dir>",
	description: `${description} (default: <project-directory>/.site-audit)`
});
/** The audit workspace: `--workspace`, else `.site-audit` in the project directory. */
function workspaceFor(flags) {
	return path.resolve(flags.workspace ?? path.join(flags[PROJECT_DIRECTORY_FLAG], ".site-audit"));
}

//#endregion
export { finalizedAttributes as a, AuditCommand as i, workspaceFlag as n, preparedAttributes as o, workspaceFor as r, text as t };