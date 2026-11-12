import { S as VERSION, a as evidenceSchema, b as sanitizeUrl, c as validateAuditResult, d as validateWaterfall, g as runIdFor, h as runDir, i as evaluationSchema, l as validateEvidence, n as SEVERITY_ORDER, o as parsePrepared, p as latestRunDir, r as auditResultSchema, t as LIGHTHOUSE_REPORT, u as validateRecommendations, v as sanitizeJsonValue, x as AUDIT_ROOT, y as sanitizeText } from "./results.js";
import { n as discoverCatalog, t as defaultCategoriesDir } from "./catalog.js";
import { i as perfFromSummary } from "./measured-run.js";
import { i as BUNDLE_VISUALIZER, n as BUNDLE_DIR, o as bundleAnalysisSchema, r as BUNDLE_SCHEMA_VERSION, t as BUNDLE_ANALYSIS } from "./schema.js";
import { i as latestRunEvents, o as readEvents, t as appendEvent } from "./events.js";
import { a as parseRouterManifest, i as parseChunk, n as lexerReady, o as parseVisualizerHtml, r as moduleIdResolver, t as readLivePage } from "./live.js";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { constants, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { access, chmod, copyFile, cp, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { z } from "zod";
import AjvModule from "ajv/dist/2020.js";

//#region src/audit/project.ts
async function resolveProject(root) {
	const requested = path.resolve(root);
	if ((await lstat(requested)).isSymbolicLink()) throw new Error(`Project root must not be a symlink: ${requested}`);
	const resolved = await realpath(requested);
	if (!(await lstat(resolved)).isDirectory()) throw new Error(`Project is not a directory: ${resolved}`);
	let packageName;
	try {
		packageName = JSON.parse(await readFile(path.join(resolved, "package.json"), "utf8")).name;
	} catch {}
	return {
		root: resolved,
		...packageName ? { packageName } : {}
	};
}

//#endregion
//#region src/audit/playhouse.ts
const exec = promisify(execFile);
const Ajv = AjvModule;
const jsonObject = z.record(z.string(), z.unknown());
const artifactDescriptor = z.object({
	path: z.string().min(1),
	schema: z.record(z.string(), z.unknown())
}).passthrough();
const rawArtifactDescriptor = z.object({
	path: z.string().min(1),
	producedBy: z.string(),
	contract: z.string().min(1)
}).passthrough();
const describeSchema = z.object({
	tool: z.object({
		name: z.string().optional(),
		version: z.string().min(1)
	}).passthrough(),
	archiveLifecycle: z.object({ viewability: z.object({
		requiresManifest: z.literal(true),
		stateAuthority: z.literal("manifest.archiveState")
	}).passthrough() }).passthrough(),
	artifacts: z.array(artifactDescriptor),
	rawArtifacts: z.array(rawArtifactDescriptor).optional().default([]),
	outputs: z.object({ runResult: z.record(z.string(), z.unknown()) }).passthrough()
}).passthrough();
const runResultSchema = z.object({
	tool: z.literal("playhouse"),
	command: z.literal("run"),
	targetUrl: z.string(),
	archiveDir: z.string().min(1),
	summary: jsonObject
}).passthrough();
const manifestSchema = z.object({
	targetUrl: z.string(),
	lighthouseVersion: z.string(),
	summaryArtifacts: z.array(z.string()),
	medianArtifacts: z.array(z.string()).optional().default([]),
	profileArtifacts: z.array(z.string()).optional().default([]),
	traceArtifacts: z.array(z.object({ path: z.string() }).passthrough()).optional().default([]),
	runs: z.array(z.object({
		runId: z.string(),
		files: z.array(z.string())
	}).passthrough()).optional().default([]),
	scriptCount: z.number().int().nonnegative().optional().default(0),
	archiveState: z.object({
		status: z.enum(["complete", "incomplete"]),
		failures: z.array(z.unknown()),
		warnings: z.array(z.unknown())
	})
}).passthrough();
const requiredArtifacts = [
	"summary.json",
	"opportunities.json",
	"summary-tbt.json",
	"summary-lcp.json",
	"summary-third-party.json"
];
const representativeArtifacts = /(?:main-document|document|network|diagnostic)|\.html$/i;
/**
* How long one Playhouse or Playwright command may run before it is killed.
*
* Environment variables:
* - `SFNEXT_AUDIT_PLAYHOUSE_TIMEOUT_MS` (optional): a positive number of milliseconds, e.g. `1200000`. Default 10 minutes.
*/
const parsedTimeoutOverride = Number(process.env.SFNEXT_AUDIT_PLAYHOUSE_TIMEOUT_MS);
const DEFAULT_TIMEOUT_MS = Number.isFinite(parsedTimeoutOverride) && parsedTimeoutOverride > 0 ? parsedTimeoutOverride : 10 * 6e4;
const basename$1 = (value) => value.split("/").at(-1) ?? value;
const descriptorMatches = (pattern, name) => {
	const escaped = basename$1(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}/g, "[^/]+");
	return (/* @__PURE__ */ new RegExp(`^${escaped}$`)).test(basename$1(name));
};
/** With `--json`, Playhouse prints its result, or `{"error":{"message":…}}` on failure, as the last stdout line. */
const lastJson = (stdout) => JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
function jsonErrorMessage(stdout) {
	if (typeof stdout !== "string") return void 0;
	try {
		const message = lastJson(stdout)?.error?.message;
		return typeof message === "string" ? message : void 0;
	} catch {
		return;
	}
}
async function invoke(playhouse, args, cwd) {
	const env = {
		...process.env,
		...playhouse.browser ? { PLAYHOUSE_CHROME_PATH: playhouse.browser } : {}
	};
	try {
		return (await exec(process.execPath, [playhouse.bin, ...args], {
			cwd,
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
			timeout: DEFAULT_TIMEOUT_MS,
			killSignal: "SIGKILL",
			env
		})).stdout.trim();
	} catch (error) {
		throw new Error(sanitizeText(`Playhouse command failed (${args.join(" ")}): ${jsonErrorMessage(error.stdout) ?? (error instanceof Error ? error.message : String(error))}`));
	}
}
const require = createRequire(import.meta.url);
/** The script a dependency's package.json `bin` names, for running with `node`. */
function packageBin(name, command) {
	const manifest = require.resolve(`${name}/package.json`);
	const { bin } = require(manifest);
	const script = typeof bin === "string" ? bin : bin?.[command];
	if (!script) throw new Error(`${name} has no ${command} bin`);
	return path.resolve(path.dirname(manifest), script);
}
/**
* The bundled @salesforce/playhouse CLI.
*
* Environment variables:
* - `SFNEXT_AUDIT_PLAYHOUSE_BIN` (optional): another Playhouse script to run with this Node, for tests,
*   e.g. `/tmp/fake-playhouse.mjs`.
*/
function playhouseBin() {
	return process.env.SFNEXT_AUDIT_PLAYHOUSE_BIN || packageBin("@salesforce/playhouse", "playhouse");
}
/**
* The Chrome that Playhouse measures with: PLAYHOUSE_CHROME_PATH when the user set it, else the Chrome for Testing
* that our playwright-core (pinned to Playhouse's) expects in the shared Playwright browser cache. Playwright
* installs it there when it is missing, and reuses it otherwise. Left to itself, Playhouse would take whatever
* browser revision another tool cached, or system Chrome, which managed-device policy can break.
*
* Environment variables:
* - `PLAYHOUSE_CHROME_PATH` (optional): a Chrome executable to measure with instead, e.g.
*   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
* - `HTTPS_PROXY` and `NODE_EXTRA_CA_CERTS` (optional): read by Playwright when it downloads Chromium behind a
*   proxy, e.g. `http://proxy.example.com:8080` and `/etc/ssl/corp-ca.pem`.
*/
async function ensureBrowser(log, cli = packageBin("playwright-core", "playwright-core")) {
	if (process.env.PLAYHOUSE_CHROME_PATH) return process.env.PLAYHOUSE_CHROME_PATH;
	const { chromium } = await import("playwright-core");
	const executable = chromium.executablePath();
	if (await present(executable)) return executable;
	await log("Downloading Chromium for Playhouse (one time, about 180 MB)");
	const command = [
		"install",
		"chromium",
		"--no-shell"
	];
	try {
		await exec(process.execPath, [cli, ...command], {
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
			timeout: DEFAULT_TIMEOUT_MS,
			killSignal: "SIGKILL"
		});
	} catch (error) {
		const { stdout, stderr } = error;
		const errors = `${String(stderr ?? "")}\n${String(stdout ?? "")}`.split("\n").flatMap((line) => /^Error: (.+?)(?:, caused by)?$/.exec(line.trim())?.[1] ?? []);
		const reason = errors.length ? [...new Set(errors)].join("; ") : error instanceof Error ? error.message : String(error);
		const { version } = require("playwright-core/package.json");
		throw new Error(`Could not download Chromium for Playhouse: ${sanitizeText(reason)}\nBehind a proxy, set HTTPS_PROXY (and NODE_EXTRA_CA_CERTS for a TLS-inspecting proxy) and run prepare again, or install it yourself with: npx playwright-core@${version} ${command.join(" ")}`);
	}
	if (!await present(executable)) throw new Error("Playwright reported installing Chromium, but it is still missing");
	return executable;
}
async function present(file) {
	try {
		await access(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
function contained$2(base, candidate) {
	const relative$1 = path.relative(base, candidate);
	return relative$1 === "" || !relative$1.startsWith("..") && !path.isAbsolute(relative$1);
}
async function assertNoSymlinks(base, target) {
	if (!contained$2(base, target)) throw new Error(`Path escaped the controlled output directory: ${target}`);
	let current = base;
	for (const part of path.relative(base, target).split(path.sep).filter(Boolean)) {
		current = path.join(current, part);
		if ((await lstat(current)).isSymbolicLink()) throw new Error(`Playhouse path must not contain a symlink: ${current}`);
	}
}
async function assertAbsolutePathHasNoSymlinks(target) {
	if (!path.isAbsolute(target)) throw new Error("Playhouse archive must use an absolute path");
	if ((await lstat(target)).isSymbolicLink()) throw new Error(`Playhouse path must not contain a symlink: ${target}`);
}
async function inspectPlayhouse(playhouse, cwd) {
	const describe = describeSchema.parse(JSON.parse(await invoke(playhouse, ["describe"], cwd)));
	for (const name of ["manifest.json", ...requiredArtifacts]) if (!describe.artifacts.some((item) => basename$1(item.path) === name)) throw new Error(`Playhouse describe is missing required artifact descriptor: ${name}`);
	for (const family of [
		{
			label: "document",
			pattern: /(?:main-)?document/i
		},
		{
			label: "network",
			pattern: /network/i
		},
		{
			label: "diagnostic",
			pattern: /diagnostic/i
		}
	]) if (!describe.artifacts.some((item) => family.pattern.test(item.path))) throw new Error(`Playhouse describe is missing required ${family.label} artifact descriptor`);
	return {
		version: describe.tool.version,
		describe
	};
}
async function collectWithPlayhouse(playhouse, target, outputCwd, runs = 1) {
	const contract = await inspectPlayhouse(playhouse, outputCwd);
	const ajv = new Ajv({ strict: false });
	const resultInput = lastJson(await invoke(playhouse, [
		"run",
		target.url,
		"--json",
		"--runs",
		String(runs),
		"--retry-pattern-html",
		"a^"
	], outputCwd));
	if (!ajv.validate(contract.describe.outputs.runResult, resultInput)) throw new Error(`Playhouse run result failed its describe schema: ${ajv.errorsText()}`);
	const result = runResultSchema.parse(resultInput);
	const outputRoot = await realpath(outputCwd);
	const archiveDir = path.resolve(outputRoot, result.archiveDir);
	await assertNoSymlinks(outputRoot, archiveDir);
	const canonicalArchive = await realpath(archiveDir);
	if (!contained$2(outputRoot, canonicalArchive)) throw new Error(`Playhouse archive escaped the controlled output directory: ${canonicalArchive}`);
	if (archiveDir.endsWith(".partial")) throw new Error(`Playhouse retained a partial archive: ${archiveDir}`);
	return readValidatedArchive(contract, target, canonicalArchive, async (artifactPath) => assertNoSymlinks(outputRoot, artifactPath));
}
async function readExistingPlayhouseArchive(playhouse, target, archiveDir, cwd) {
	await assertAbsolutePathHasNoSymlinks(archiveDir);
	const canonicalArchive = await realpath(archiveDir);
	if (!(await lstat(canonicalArchive)).isDirectory()) throw new Error(`Playhouse archive is not a directory: ${canonicalArchive}`);
	return readValidatedArchive(await inspectPlayhouse(playhouse, cwd), target, canonicalArchive, async (artifactPath) => assertNoSymlinks(canonicalArchive, artifactPath));
}
async function readValidatedArchive(contract, target, canonicalArchive, validatePath) {
	const ajv = new Ajv({ strict: false });
	const manifestPath = path.join(canonicalArchive, "manifest.json");
	await validatePath(manifestPath);
	const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const manifestDescriptor = contract.describe.artifacts.find((item) => basename$1(item.path) === "manifest.json");
	if (!manifestDescriptor) throw new Error("Playhouse describe is missing required artifact descriptor: manifest.json");
	if (!ajv.validate(manifestDescriptor.schema, rawManifest)) throw new Error(`manifest.json failed its describe schema: ${ajv.errorsText()}`);
	const manifest = manifestSchema.parse(rawManifest);
	if (manifest.targetUrl !== target.url) throw new Error(`Playhouse manifest target mismatch for ${target.label}`);
	if (manifest.archiveState.status !== "complete" || manifest.archiveState.failures.length) throw new Error(`Playhouse archive is incomplete for ${target.label}`);
	for (const name of requiredArtifacts) if (!manifest.summaryArtifacts.includes(name)) throw new Error(`Playhouse manifest is missing required artifact: ${name}`);
	const declaredArtifacts = [
		...manifest.summaryArtifacts,
		...manifest.medianArtifacts,
		...manifest.profileArtifacts,
		...manifest.traceArtifacts.map((item) => item.path),
		...manifest.runs.flatMap((run) => run.files.map((file) => `runs/${run.runId}/${file}`)),
		...manifest.scriptCount > 0 ? ["scripts/index.json"] : []
	];
	const names = declaredArtifacts.filter((name, index) => declaredArtifacts.indexOf(name) === index);
	for (const name of names) {
		const artifactPath = path.join(canonicalArchive, name);
		await validatePath(artifactPath);
		const descriptor = contract.describe.artifacts.find((item) => descriptorMatches(item.path, name));
		const rawDescriptor = contract.describe.rawArtifacts.find((item) => descriptorMatches(item.path, name));
		if (!descriptor && !rawDescriptor && !name.endsWith(".html")) continue;
		await access(artifactPath, constants.R_OK);
		if (descriptor && !name.startsWith("runs/") && name.endsWith(".json") && (requiredArtifacts.includes(name) || representativeArtifacts.test(name)) && !ajv.validate(descriptor.schema, jsonObject.parse(JSON.parse(await readFile(artifactPath, "utf8"))))) throw new Error(`${name} failed its describe schema: ${ajv.errorsText()}`);
	}
	return {
		label: target.label,
		url: sanitizeUrl(target.url),
		archiveDir: canonicalArchive,
		playhouseVersion: contract.version
	};
}

//#endregion
//#region src/audit/evidence.ts
function contained$1(base, candidate) {
	const relative$1 = path.relative(base, candidate);
	return relative$1 === "" || !relative$1.startsWith("..") && !path.isAbsolute(relative$1);
}
async function safeFile(root, relativePath, maxBytes) {
	if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error(`Unsafe relative path: ${relativePath}`);
	const base = await realpath(root);
	const candidate = path.resolve(base, relativePath);
	if (!contained$1(base, candidate)) throw new Error(`Path escaped its root: ${relativePath}`);
	let current = base;
	for (const part of path.relative(base, candidate).split(path.sep).filter(Boolean)) {
		current = path.join(current, part);
		if ((await lstat(current)).isSymbolicLink()) throw new Error(`Path must not contain a symlink: ${relativePath}`);
	}
	const info = await lstat(candidate);
	if (!info.isFile()) throw new Error(`Path is not a file: ${relativePath}`);
	if (maxBytes !== void 0 && info.size > maxBytes) throw new Error(`File exceeds ${maxBytes} bytes: ${relativePath}`);
	return candidate;
}
/** Every file under `root`, as sorted POSIX paths relative to it. Symlinks are skipped. */
async function listArchiveFiles(root) {
	return (await readdir(root, {
		recursive: true,
		withFileTypes: true
	})).filter((entry) => entry.isFile()).map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).slice().sort();
}
async function exists$2(file) {
	try {
		await lstat(file);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
var PlayhouseArtifactReader = class {
	#pages;
	constructor(pages) {
		this.#pages = new Map(pages.map((page) => [page.label, page]));
	}
	artifactNames(pageLabel) {
		return listArchiveFiles(this.#page(pageLabel).archiveDir);
	}
	async readJson(pageLabel, artifactName, schema) {
		const text = await this.readText(pageLabel, artifactName);
		if (text === void 0) return void 0;
		const parsed = schema.safeParse(JSON.parse(text));
		if (!parsed.success) throw new Error(`${pageLabel}/${artifactName} is invalid: ${parsed.error.message}`);
		return parsed.data;
	}
	async readText(pageLabel, artifactName, maxBytes) {
		const page = this.#page(pageLabel);
		if (!await exists$2(path.join(page.archiveDir, artifactName))) return void 0;
		return readFile(await safeFile(page.archiveDir, artifactName, maxBytes), "utf8");
	}
	#page(label) {
		const page = this.#pages.get(label);
		if (!page) throw new Error(`Unknown prepared page: ${label}`);
		return page;
	}
};

//#endregion
//#region src/audit/preparation.ts
const decisionSchema = z.object({
	status: z.enum([
		"pass",
		"fail",
		"not-verified"
	]),
	severity: z.enum(SEVERITY_ORDER).optional(),
	summary: z.string().min(1),
	evidence: z.array(evidenceSchema)
}).strict().refine((value) => value.status === "not-verified" || value.evidence.length > 0, {
	message: "a pass or fail decision requires evidence",
	path: ["evidence"]
});
const preparedRuleResultSchema = z.object({
	data: z.json(),
	decision: decisionSchema.optional()
}).strict();
function contained(base, candidate) {
	const relative$1 = path.relative(base, candidate);
	return relative$1 === "" || !relative$1.startsWith("..") && !path.isAbsolute(relative$1);
}
function ruleParts(ruleId) {
	const match = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(ruleId);
	if (!match) throw new Error(`Invalid rule id: ${ruleId}`);
	return {
		category: match[1],
		name: match[2]
	};
}
function resultPathForRule(ruleId) {
	const { category, name } = ruleParts(ruleId);
	return path.posix.join("results", "categories", category, "rules", `${name}.json`);
}
/** Where the AI writes its evaluation of an undecided rule. */
function aiAnalysisPathForRule(ruleId) {
	const { category, name } = ruleParts(ruleId);
	return path.posix.join("ai-analysis", "categories", category, "rules", `${name}.json`);
}
function defaultCompanionRoot() {
	return path.join(AUDIT_ROOT, "catalog", "categories");
}
async function exists$1(file) {
	try {
		await access(file);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
async function discoverCompanions(root, catalog) {
	if (!await exists$1(root)) return /* @__PURE__ */ new Map();
	const canonicalRoot = await realpath(root);
	const known = new Set(catalog.ruleIds);
	const companions = /* @__PURE__ */ new Map();
	for (const category of (await readdir(canonicalRoot, { withFileTypes: true })).slice().sort((a, b) => a.name.localeCompare(b.name))) {
		if (!category.isDirectory() || !/^[a-z0-9-]+$/.test(category.name)) continue;
		const rulesDirectory = path.join(canonicalRoot, category.name, "rules");
		if (!await exists$1(rulesDirectory)) continue;
		if ((await lstat(rulesDirectory)).isSymbolicLink()) throw new Error(`Companion rules directory must not be a symlink: ${category.name}`);
		for (const entry of (await readdir(rulesDirectory, { withFileTypes: true })).slice().sort((a, b) => a.name.localeCompare(b.name))) {
			const match = /^(.+)\.[jt]s$/.exec(entry.name);
			if (!entry.isFile() || !match || /\.(?:test|d)$/.test(match[1])) continue;
			const name = match[1];
			if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid companion filename: ${entry.name}`);
			const ruleId = `${category.name}/${name}`;
			if (!known.has(ruleId)) throw new Error(`Companion has no matching catalog rule: ${ruleId}`);
			const file = path.join(rulesDirectory, entry.name);
			const canonicalFile = await realpath(file);
			if (!contained(canonicalRoot, canonicalFile) || (await lstat(file)).isSymbolicLink()) throw new Error(`Unsafe companion path for ${ruleId}`);
			companions.set(ruleId, canonicalFile);
		}
	}
	return companions;
}
function moduleShape(value, ruleId) {
	const candidate = value;
	if (typeof candidate?.default !== "function" || !candidate.dataSchema || typeof candidate.dataSchema.safeParse !== "function") throw new Error(`Companion for ${ruleId} must export dataSchema and a default function`);
	return candidate;
}
async function prepareRuleResults(options) {
	if (options.companionRoot === false) return [];
	const companions = await discoverCompanions(options.companionRoot ?? defaultCompanionRoot(), options.catalog);
	const rules = new Map(options.catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule])));
	const playhouse = new PlayhouseArtifactReader(options.pages);
	const outputs = [];
	for (const [ruleId, modulePath] of [...companions].sort(([a], [b]) => a.localeCompare(b))) {
		const rule = rules.get(ruleId);
		if (!rule) throw new Error(`Rule script ${ruleId} has no rule in the catalog`);
		const module = moduleShape(await import(pathToFileURL(modulePath).href), ruleId);
		const common = preparedRuleResultSchema.parse(await module.default({
			rule,
			pages: options.pages,
			playhouse,
			...options.bundle ? { bundle: options.bundle } : {}
		}));
		const parsedData = module.dataSchema.parse(common.data);
		const sanitized = preparedRuleResultSchema.parse(sanitizeJsonValue({
			...common,
			data: parsedData
		}));
		const result = {
			...sanitized,
			data: module.dataSchema.parse(sanitized.data)
		};
		const relativePath = resultPathForRule(ruleId);
		const outputPath = path.resolve(options.workspaceRoot, relativePath);
		if (!contained(path.resolve(options.workspaceRoot), outputPath)) throw new Error(`Result path escaped workspace for ${ruleId}`);
		await mkdir(path.dirname(outputPath), { recursive: true });
		const canonicalWorkspace = await realpath(options.workspaceRoot);
		const canonicalParent = await realpath(path.dirname(outputPath));
		if (!contained(canonicalWorkspace, canonicalParent)) throw new Error(`Result path escaped workspace for ${ruleId}`);
		await writeFile(path.join(canonicalParent, path.basename(outputPath)), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
		outputs.push({
			reference: {
				ruleId,
				path: relativePath
			},
			result
		});
	}
	return outputs;
}
/** Read the rule script results present in `results/` for the given rules. Rules without a script have no file. */
async function readPreparedRuleResults(workspaceRoot, ruleIds) {
	const workspace = path.resolve(workspaceRoot);
	const outputs = [];
	for (const ruleId of ruleIds) {
		const relativePath = resultPathForRule(ruleId);
		const file = path.resolve(workspace, relativePath);
		if (!await exists$1(file)) continue;
		if ((await lstat(file)).isSymbolicLink() || !contained(await realpath(workspace), await realpath(file))) throw new Error(`Unsafe prepared result path: ${relativePath}`);
		const parsed = preparedRuleResultSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
		if (!parsed.success) throw new Error(`${relativePath} is invalid: ${parsed.error.message}`);
		outputs.push({
			reference: {
				ruleId,
				path: relativePath
			},
			result: parsed.data
		});
	}
	return outputs;
}

//#endregion
//#region src/audit/bundle/analyze.ts
/** An import that frees less than this isn't worth a candidate. */
const MIN_CANDIDATE_BYTES = 10 * 1024;
const MAX_CANDIDATES = 25;
const MAX_IMPORTERS = 8;
const MAX_CHUNK_OWNERS = 3;
const MAX_CHUNKS = 10;
const MAX_PACKAGE_MODULES = 5;
async function analyzeBundle(outputs, pages, playhouse) {
	const notes = [...outputs?.notes ?? []];
	let model = null;
	if (outputs?.assetsDir) try {
		model = await readBuild(outputs, notes);
	} catch (error) {
		notes.push(`The build output could not be read: ${error instanceof Error ? error.message : String(error)}`);
	}
	const result = {
		schemaVersion: BUNDLE_SCHEMA_VERSION,
		status: model?.graph ? "complete" : model ? "partial" : "unavailable",
		notes,
		build: model && outputs ? {
			packageManager: outputs.packageManager,
			durationMs: outputs.durationMs,
			visualizer: model.graph ? outputs.visualizer : null,
			chunks: model.chunks.size,
			withMaps: [...model.chunks.values()].filter((chunk) => chunk.hasMap).length,
			bytes: [...model.chunks.values()].reduce((total, chunk) => total + chunk.bytes, 0),
			attribution: model.attribution
		} : null,
		pages: [],
		skipped: []
	};
	for (const page of pages) try {
		const live = await readLivePage(playhouse, page.label);
		if ("reason" in live) {
			result.skipped.push({
				page: page.label,
				reason: live.reason
			});
			continue;
		}
		result.pages.push(analyzePage(live, page.url, model, notes));
	} catch (error) {
		result.skipped.push({
			page: page.label,
			reason: error instanceof Error ? error.message : String(error)
		});
	}
	return result;
}
async function readBuild(outputs, notes) {
	await lexerReady;
	const { assetsDir, projectRoot } = outputs;
	if (!assetsDir) throw new Error("The build has no client assets directory.");
	const chunks = /* @__PURE__ */ new Map();
	for (const file of (await readdir(assetsDir)).filter((name) => name.endsWith(".js")).slice().sort()) {
		const code = await readFile(path.join(assetsDir, file), "utf8");
		const mapFile = path.join(assetsDir, `${file}.map`);
		const map = existsSync(mapFile) ? await readFile(mapFile, "utf8") : void 0;
		chunks.set(file, {
			...parseChunk(file, code, map, assetsDir),
			assigned: /* @__PURE__ */ new Map()
		});
	}
	if (!chunks.size) throw new Error(`${path.relative(projectRoot, assetsDir)} has no JavaScript.`);
	const manifests = [...chunks.values()].filter((chunk) => chunk.routerManifest);
	let manifest = null;
	const manifestFile = manifests.length === 1 ? manifests[0].file : null;
	if (manifestFile) manifest = parseRouterManifest(await readFile(path.join(assetsDir, manifestFile), "utf8"));
	else notes.push(manifests.length ? `The build has ${manifests.length} React Router manifests; routes can't be read from it.` : "The build has no React Router manifest; routes can't be read from it.");
	const withoutMaps = [...chunks.values()].filter((chunk) => !chunk.hasMap && !chunk.routerManifest);
	if (withoutMaps.length) notes.push(`${withoutMaps.length} of ${chunks.size} chunks have no source map, so their modules aren't known.`);
	let graph = null;
	if (outputs.visualizerHtml) {
		const rootEntries = new Set(readdirSync(projectRoot));
		try {
			graph = parseVisualizerHtml(outputs.visualizerHtml, moduleIdResolver(projectRoot, rootEntries));
		} catch (error) {
			notes.push(`The visualizer report could not be read, so import suggestions are unavailable: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (graph) assignUnmappedModules(chunks, graph);
	const moduleBytes = /* @__PURE__ */ new Map();
	const attribution = {
		modules: 0,
		unmappedModules: 0,
		preloadLists: 0,
		routerManifest: 0,
		glue: 0
	};
	for (const chunk of chunks.values()) {
		if (chunk.routerManifest) {
			attribution.routerManifest += chunk.bytes;
			continue;
		}
		let mapped = 0;
		let assigned = 0;
		for (const [id, size] of chunk.modules) {
			moduleBytes.set(id, (moduleBytes.get(id) ?? 0) + size);
			mapped += size;
		}
		for (const [id, size] of chunk.assigned) {
			moduleBytes.set(id, (moduleBytes.get(id) ?? 0) + size);
			assigned += size;
		}
		attribution.modules += mapped;
		attribution.unmappedModules += assigned;
		attribution.preloadLists += chunk.preloadList;
		attribution.glue += chunk.bytes - mapped - assigned - chunk.preloadList;
	}
	if (graph) {
		const missing = [...moduleBytes.keys()].filter((id) => !graph.has(id)).length;
		if (missing) notes.push(`${missing} modules in the build's source maps aren't in the visualizer's module graph; the two builds may differ.`);
	}
	const { owner, display } = ownership(projectRoot);
	return {
		projectRoot,
		chunks,
		moduleBytes,
		manifest,
		manifestFile,
		graph,
		attribution,
		owner,
		display
	};
}
/**
* JSON modules (translations, mostly) have no mappings, so their bytes are unattributed in the map. The analyze
* build's chunk with the same modules says which modules those bytes belong to; they're split in proportion to the
* visualizer's pre-minification lengths, never more than the bytes left.
*/
function assignUnmappedModules(chunks, graph) {
	const byAnalyzeChunk = /* @__PURE__ */ new Map();
	for (const node of graph.values()) for (const name of node.chunks) {
		const ids = byAnalyzeChunk.get(name) ?? /* @__PURE__ */ new Set();
		byAnalyzeChunk.set(name, ids.add(node.id));
	}
	const mappedSomewhere = new Set([...chunks.values()].flatMap((chunk) => [...chunk.modules.keys()]));
	for (const chunk of chunks.values()) {
		if (!chunk.modules.size || chunk.unattributed <= 0) continue;
		const overlap = /* @__PURE__ */ new Map();
		for (const id of chunk.modules.keys()) for (const name of graph.get(id)?.chunks ?? []) overlap.set(name, (overlap.get(name) ?? 0) + 1);
		let best;
		let bestScore = 0;
		for (const [name, shared] of overlap) {
			const score = shared / (chunk.modules.size + (byAnalyzeChunk.get(name)?.size ?? 0) - shared);
			if (score > bestScore) {
				best = name;
				bestScore = score;
			}
		}
		if (!best) continue;
		const missing = [...byAnalyzeChunk.get(best) ?? []].filter((id) => !mappedSomewhere.has(id) && (graph.get(id)?.rendered ?? 0) > 0);
		const rendered = missing.reduce((total, id) => total + (graph.get(id)?.rendered ?? 0), 0);
		if (!rendered) continue;
		const budget = Math.min(chunk.unattributed, rendered);
		const shares = missing.map((id) => {
			const exact = budget * (graph.get(id)?.rendered ?? 0) / rendered;
			return {
				id,
				size: Math.floor(exact),
				rest: exact % 1
			};
		});
		let left = budget - shares.reduce((total, share) => total + share.size, 0);
		for (const share of shares.slice().sort((a, b) => b.rest - a.rest)) {
			if (left <= 0) break;
			share.size += 1;
			left -= 1;
		}
		for (const share of shares) if (share.size) chunk.assigned.set(share.id, share.size);
	}
}
/** Who owns a module, and how to show its path without the machine's directories. */
function ownership(projectRoot) {
	const packages = /* @__PURE__ */ new Map();
	const nearestPackage = (dir) => {
		if (packages.has(dir)) return packages.get(dir) ?? null;
		let found = null;
		try {
			const { name, version } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
			if (typeof name === "string" && name) found = {
				name,
				dir,
				...typeof version === "string" ? { version } : {}
			};
		} catch {}
		const parent = path.dirname(dir);
		if (!found && parent !== dir) found = nearestPackage(parent);
		packages.set(dir, found);
		return found;
	};
	const inProject = (id) => id.startsWith(projectRoot + path.sep);
	const afterNodeModules = (id) => {
		const at = id.lastIndexOf(`${path.sep}node_modules${path.sep}`);
		return at < 0 ? null : id.slice(at + 14).split(path.sep).join("/");
	};
	const packageName = (rest) => {
		const parts = rest.split("/");
		return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
	};
	return {
		owner: (id) => {
			const rest = afterNodeModules(id);
			if (rest) {
				const name = packageName(rest);
				const version = nearestPackage(id.slice(0, id.lastIndexOf(`${path.sep}node_modules${path.sep}`) + 14) + name.split("/").join(path.sep))?.version;
				return {
					name,
					kind: "npm",
					...version ? { version } : {}
				};
			}
			if (inProject(id)) {
				const parts = path.relative(projectRoot, id).split(path.sep);
				return {
					name: parts.slice(0, Math.min(parts.length, 3)).join("/"),
					kind: "project"
				};
			}
			const pkg = nearestPackage(path.dirname(id));
			return pkg ? {
				name: pkg.name,
				kind: "npm",
				...pkg.version ? { version: pkg.version } : {}
			} : {
				name: "Other",
				kind: "build"
			};
		},
		display: (id) => {
			const rest = afterNodeModules(id);
			if (rest) return rest;
			if (inProject(id)) return path.relative(projectRoot, id).split(path.sep).join("/");
			const pkg = nearestPackage(path.dirname(id));
			return pkg ? `${pkg.name}/${path.relative(pkg.dir, id).split(path.sep).join("/")}` : path.basename(id);
		}
	};
}
const BUILD_OWNERS = {
	preloadLists: "Preload lists",
	routerManifest: "React Router manifest",
	glue: "Module glue"
};
function analyzePage(live, url, model, notes) {
	const scripts = live.scripts;
	const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
	const beforeLoad = scripts.filter((script) => script.beforeLoad);
	const page = {
		page: live.page,
		runId: live.runId,
		lighthouseArtifact: live.lighthouseArtifact,
		observedLoadMs: live.observedLoadMs,
		live: {
			scripts: scripts.length,
			decodedBytes: sum(scripts, "decodedBytes"),
			transferBytes: sum(scripts, "transferBytes"),
			beforeLoad: beforeLoad.length,
			beforeLoadDecodedBytes: sum(beforeLoad, "decodedBytes"),
			beforeLoadTransferBytes: sum(beforeLoad, "transferBytes")
		},
		route: live.rendered ? {
			ids: live.rendered.routes.map((route) => route.id),
			source: "page"
		} : null,
		local: null
	};
	if (!model?.manifest) return page;
	page.route = pageRoute(page.route, url, model.manifest, live.page, notes);
	if (page.route) page.local = localPage(page.route.ids, model, model.manifest, live.page, notes);
	return page;
}
/**
* The live page's route ids when the local build has all of them (route ids are route file names, so they survive a
* rebuild); else the local route branch whose paths match the page URL.
*/
function pageRoute(rendered, url, manifest, page, notes) {
	const missing = rendered?.ids.filter((id) => !manifest.routes[id]) ?? [];
	if (rendered && !missing.length) return rendered;
	const ids = routeForUrl(url, manifest);
	const why = rendered ? `the live page renders ${missing.join(", ")}, which the local build doesn't have` : "the live page's HTML doesn't name its routes";
	notes.push(`${page}: ${why}; ${ids ? `its URL matches the local route ${ids.at(-1)}, which is analyzed instead` : "no local route matches its URL, so the page isn't analyzed in the local build"}.`);
	return ids ? {
		ids,
		source: "url"
	} : null;
}
/** The local route branch, root first, that React Router would render for a URL. */
function routeForUrl(url, manifest) {
	let segments;
	try {
		segments = new URL(url).pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
	} catch {
		return null;
	}
	let best = null;
	for (const id of Object.keys(manifest.routes)) {
		const ids = [];
		for (let route = manifest.routes[id]; route && ids.length < 32; route = route.parentId ? manifest.routes[route.parentId] : void 0) ids.unshift(route.id);
		const score = matchPath(ids.flatMap((item) => (manifest.routes[item].path ?? "").split("/").filter(Boolean)), segments);
		if (score !== null && (!best || score > best.score || score === best.score && ids.length > best.ids.length)) best = {
			ids,
			score
		};
	}
	return best?.ids ?? null;
}
/**
* React Router's ranking, simplified: a static segment outranks a dynamic one, and a splat loses to any route that
* matches without one (an index route at `/`). Null when the path doesn't match.
*/
function matchPath(pattern, segments) {
	const [part, ...rest] = pattern;
	if (part === void 0) return segments.length ? null : 0;
	if (part === "*") return -1;
	const optional = part.endsWith("?");
	const text = optional ? part.slice(0, -1) : part;
	const tail$1 = segments.length && segmentPattern(text).test(segments[0]) ? matchPath(rest, segments.slice(1)) : null;
	const matched = tail$1 === null ? null : tail$1 + (text.startsWith(":") ? 3 : 10);
	const skipped = optional ? matchPath(rest, segments) : null;
	return matched === null ? skipped : skipped === null ? matched : Math.max(matched, skipped);
}
const segmentPattern = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/^:[\w-]+/, "[^/]+")}$`, "i");
/** What the page's routes load up front in the local build, what that code is, and the imports that pull in the most of it. */
function localPage(routeIds, model, manifest, page, notes) {
	const files = /* @__PURE__ */ new Set();
	const missing = /* @__PURE__ */ new Set();
	const add = (file) => {
		if (files.has(file)) return;
		const chunk = model.chunks.get(file);
		if (!chunk) {
			missing.add(file);
			return;
		}
		files.add(file);
		for (const next of chunk.imports) add(next);
	};
	if (model.manifestFile) add(model.manifestFile);
	for (const file of [
		manifest.entry.module,
		...manifest.entry.imports,
		...routeIds.flatMap((id) => [manifest.routes[id].module, ...manifest.routes[id].imports ?? []])
	]) add(file);
	if (missing.size) notes.push(`${page}: ${missing.size} chunks the local manifest names aren't in the build's client assets.`);
	const chunks = [...files].flatMap((file) => model.chunks.get(file) ?? []);
	const pageBytes = /* @__PURE__ */ new Map();
	for (const chunk of chunks) for (const [id, size] of [...chunk.modules, ...chunk.assigned]) pageBytes.set(id, (pageBytes.get(id) ?? 0) + size);
	const owners = /* @__PURE__ */ new Map();
	for (const chunk of chunks) for (const row of chunkOwnerTable(chunk, model)) {
		const entry = owners.get(row.name) ?? {
			name: row.name,
			kind: row.kind,
			bytes: 0,
			modules: 0,
			largestModules: [],
			importers: [],
			importerCount: 0
		};
		entry.bytes += row.bytes;
		entry.modules += row.modules;
		owners.set(row.name, entry);
	}
	const ownerModules = /* @__PURE__ */ new Map();
	for (const [id, size] of pageBytes) {
		const owner = model.owner(id);
		const modules = ownerModules.get(owner.name) ?? [];
		ownerModules.set(owner.name, modules);
		modules.push({
			file: model.display(id),
			bytes: size,
			...owner.version ? { version: owner.version } : {}
		});
	}
	for (const [name, modules] of ownerModules) {
		const entry = owners.get(name);
		if (!entry) continue;
		entry.largestModules = largest(modules, MAX_PACKAGE_MODULES).map(({ file, bytes }) => ({
			file,
			bytes
		}));
		const versions = [...new Set(modules.flatMap((module) => module.version ? [module.version] : []))].slice().sort();
		if (entry.kind === "npm" && versions.length > 1) entry.versions = versions;
	}
	const local = {
		chunks: chunks.length,
		bytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
		largest: largest(chunks, MAX_CHUNKS).map((chunk) => ({
			file: chunk.file,
			bytes: chunk.bytes,
			owners: largest(chunkOwnerTable(chunk, model), MAX_CHUNK_OWNERS).map(({ name, bytes }) => ({
				name,
				bytes
			}))
		})),
		packages: [...owners.values()].sort((a, b) => b.bytes - a.bytes),
		candidates: []
	};
	const graph = model.graph;
	if (!graph) return local;
	const { roots, hydration } = rootModules(routeIds, model, manifest);
	if (!roots.size) return local;
	const reach = new Reachability(graph, roots);
	const imports = new ImportLines(model.projectRoot);
	const isImporter = (id) => model.owner(id).kind === "project" && !hydration.has(id);
	for (const entry of local.packages) {
		if (entry.kind !== "npm") continue;
		const edges = [];
		for (const from of reach.reached) {
			if (!isImporter(from)) continue;
			for (const to of graph.get(from)?.static ?? []) if (reach.reached.has(to) && model.owner(to).name === entry.name && model.owner(to).kind === "npm") edges.push([from, to]);
		}
		if (!edges.length) continue;
		const importers = [...new Map(edges).entries()];
		entry.importerCount = importers.length;
		entry.importers = importers.slice(0, MAX_IMPORTERS).map(([from, to]) => ({
			file: model.display(from),
			...imports.find(from, to, model)
		}));
		entry.deferrableBytes = reach.freedBy(edges, pageBytes).bytes;
	}
	const candidates = [];
	for (const from of reach.reached) {
		if (!isImporter(from)) continue;
		for (const to of graph.get(from)?.static ?? []) {
			if (roots.has(to) || !reach.reached.has(to)) continue;
			const freed = reach.freedBy([[from, to]], pageBytes);
			if (freed.bytes >= MIN_CANDIDATE_BYTES) candidates.push({
				from,
				to,
				freed
			});
		}
	}
	const kept = [];
	for (const candidate of candidates.slice().sort((a, b) => b.freed.bytes - a.freed.bytes || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) {
		if (kept.some((outer) => outer.freed.ids.has(candidate.from) && outer.freed.bytes - candidate.freed.bytes < MIN_CANDIDATE_BYTES)) continue;
		kept.push(candidate);
		if (kept.length === MAX_CANDIDATES) break;
	}
	const lazyImporters = /* @__PURE__ */ new Map();
	for (const node of graph.values()) {
		if (model.owner(node.id).kind !== "project") continue;
		for (const to of node.dynamic) lazyImporters.set(to, [...lazyImporters.get(to) ?? [], model.display(node.id)]);
	}
	local.candidates = kept.map(({ from, to, freed }) => {
		const lazy = lazyImporters.get(to) ?? [];
		return {
			importer: {
				file: model.display(from),
				...imports.find(from, to, model)
			},
			target: model.display(to),
			package: model.owner(to).name,
			savedBytes: freed.bytes,
			savedModules: freed.ids.size,
			...lazy.length ? { lazyElsewhere: lazy.slice(0, MAX_IMPORTERS) } : {}
		};
	});
	return local;
}
/**
* The modules the page starts from, found in the build's chunks for entry.client and the route modules; `hydration`
* is entry.client's share of them.
*/
function rootModules(routeIds, model, manifest) {
	const roots = /* @__PURE__ */ new Set();
	const hydration = /* @__PURE__ */ new Set();
	const files = [manifest.entry.module, ...routeIds.map((id) => manifest.routes[id].module)];
	for (const [index, file] of files.entries()) {
		const chunk = model.chunks.get(file);
		if (!chunk) continue;
		const modules = [...chunk.modules.keys(), ...chunk.assigned.keys()];
		const entries = modules.filter((id) => model.graph?.get(id)?.entry);
		for (const id of entries.length ? entries : modules) {
			roots.add(id);
			if (index === 0) hydration.add(id);
		}
	}
	return {
		roots,
		hydration
	};
}
function chunkOwnerTable(chunk, model) {
	const table = /* @__PURE__ */ new Map();
	const add = (owner, size, modules) => {
		if (size <= 0) return;
		const entry = table.get(owner.name) ?? {
			name: owner.name,
			kind: owner.kind,
			bytes: 0,
			modules: 0
		};
		entry.bytes += size;
		entry.modules += modules;
		table.set(owner.name, entry);
	};
	if (chunk.routerManifest) {
		add({
			name: BUILD_OWNERS.routerManifest,
			kind: "build"
		}, chunk.bytes, 0);
		return [...table.values()];
	}
	let attributed = chunk.preloadList;
	for (const [id, size] of [...chunk.modules, ...chunk.assigned]) {
		add(model.owner(id), size, 1);
		attributed += size;
	}
	add({
		name: BUILD_OWNERS.preloadLists,
		kind: "build"
	}, chunk.preloadList, 0);
	add({
		name: BUILD_OWNERS.glue,
		kind: "build"
	}, chunk.bytes - attributed, 0);
	return [...table.values()];
}
const largest = (items, count) => items.slice().sort((a, b) => b.bytes - a.bytes).slice(0, count);
/** Static reachability from the page's roots, and what removing some import edges would stop loading. */
var Reachability = class {
	reached;
	constructor(graph, roots) {
		this.graph = graph;
		this.roots = roots;
		this.reached = this.#walk(/* @__PURE__ */ new Set());
	}
	freedBy(edges, moduleBytes) {
		const remaining = this.#walk(new Set(edges.map(([from, to]) => `${from}\n${to}`)));
		const ids = /* @__PURE__ */ new Set();
		let bytes = 0;
		for (const id of this.reached) if (!remaining.has(id)) {
			bytes += moduleBytes.get(id) ?? 0;
			ids.add(id);
		}
		return {
			bytes,
			ids
		};
	}
	#walk(skip) {
		const seen = /* @__PURE__ */ new Set();
		const stack = [...this.roots];
		for (let id = stack.pop(); id !== void 0; id = stack.pop()) {
			if (seen.has(id)) continue;
			seen.add(id);
			for (const to of this.graph.get(id)?.static ?? []) if (!skip.size || !skip.has(`${id}\n${to}`)) stack.push(to);
		}
		return seen;
	}
};
/** Finds the import statement in a project file that brings in a module, when exactly one does. */
var ImportLines = class {
	#files = /* @__PURE__ */ new Map();
	constructor(projectRoot) {
		this.projectRoot = projectRoot;
	}
	find(from, to, model) {
		const text = this.#read(from);
		if (!text) return {};
		const target = model.owner(to);
		const matches = [];
		for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\1/g)) {
			const start$1 = Math.max(text.lastIndexOf("import", match.index), text.lastIndexOf("export", match.index));
			if (start$1 < 0 || /^(?:import|export)\s+type\b/.test(text.slice(start$1))) continue;
			if (this.#resolves(match[2], from, to, target)) matches.push({
				start: start$1,
				end: match.index + match[0].length
			});
		}
		if (matches.length !== 1) return {};
		const { start, end } = matches[0];
		const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();
		return {
			line: text.slice(0, start).split("\n").length,
			excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 157)}…` : excerpt
		};
	}
	#resolves(specifier, from, to, target) {
		if (target.kind === "npm") return specifier === target.name || specifier.startsWith(`${target.name}/`);
		const bare = to.replace(/\.[cm]?[jt]sx?$/, "");
		const candidates = path.basename(bare) === "index" ? [bare, path.dirname(bare)] : [bare];
		if (specifier.startsWith(".")) {
			const resolved = path.resolve(path.dirname(from), specifier).replace(/\.[cm]?[jt]sx?$/, "");
			return candidates.includes(resolved);
		}
		const alias = specifier.match(/^(?:@|~|#[^/]*|src)\/(.+)$/)?.[1];
		return alias !== void 0 && candidates.some((candidate) => candidate.endsWith(`${path.sep}${alias.replace(/\.[cm]?[jt]sx?$/, "").split("/").join(path.sep)}`));
	}
	#read(file) {
		if (!this.#files.has(file)) {
			let text = null;
			if (file.startsWith(this.projectRoot + path.sep) && /\.[cm]?[jt]sx?$/.test(file)) try {
				text = readFileSync(file, "utf8");
			} catch {}
			this.#files.set(file, text);
		}
		return this.#files.get(file) ?? null;
	}
};

//#endregion
//#region src/audit/bundle/build.ts
const runFile = promisify(execFile);
const BUILD_TIMEOUT_MS = 600 * 1e3;
const LOG_TAIL_CHARS = 64 * 1024;
const LOCKFILES = [
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["package-lock.json", "npm"]
];
/** Where React Router writes the client build and the template's visualizer writes its report. */
const ASSETS_DIR = "build/client/assets";
const VISUALIZER_REPORT = "build/client-bundle-size.html";
/** The package manager the project declares (`packageManager`), else the one whose lockfile is nearest. */
async function detectPackageManager(projectRoot) {
	try {
		const declared = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")).packageManager;
		const name = typeof declared === "string" ? declared.split("@")[0] : void 0;
		if (name && [
			"npm",
			"pnpm",
			"yarn",
			"bun"
		].includes(name)) return name;
	} catch {}
	for (let dir = projectRoot;; dir = path.dirname(dir)) {
		const found = LOCKFILES.find(([file]) => existsSync(path.join(dir, file)));
		if (found) return found[1];
		if (path.dirname(dir) === dir) return "npm";
	}
}
/** Runs both builds and returns what they produced; failures become notes, never exceptions. */
async function buildForAnalysis(projectRoot, runDir$1, progress = () => void 0) {
	const outDir = path.join(runDir$1, BUNDLE_DIR);
	await mkdir(outDir, { recursive: true });
	const packageManager = await detectPackageManager(projectRoot);
	const outputs = {
		projectRoot,
		packageManager,
		durationMs: {
			analyze: null,
			plain: null
		},
		assetsDir: null,
		visualizerHtml: null,
		visualizer: null,
		notes: []
	};
	let scripts = {};
	try {
		scripts = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")).scripts ?? {};
	} catch {}
	if (typeof scripts.build !== "string") {
		outputs.notes.push("The project's package.json has no build script, so the bundle wasn't built.");
		return outputs;
	}
	const shims = await openShims(outDir);
	const before = await gitStatus(projectRoot);
	await progress("Building with the bundle visualizer");
	const analyze = await runBuild(projectRoot, packageManager, shims, true, path.join(outDir, "build-analyze.log"));
	outputs.durationMs.analyze = analyze.durationMs;
	if (analyze.error) outputs.notes.push(`The analyze build failed (${analyze.error}); see ${BUNDLE_DIR}/build-analyze.log.${installHint(analyze, packageManager)} Import suggestions are unavailable.`);
	else {
		const report = path.join(projectRoot, VISUALIZER_REPORT);
		if (await writtenSince(report, analyze.startedAt)) {
			await copyFile(report, path.join(runDir$1, BUNDLE_VISUALIZER));
			outputs.visualizerHtml = await readFile(report, "utf8");
			outputs.visualizer = BUNDLE_VISUALIZER;
		} else outputs.notes.push(`The build didn't write ${VISUALIZER_REPORT} with BUNDLES_SIZE_ANALYZE set (the template's bundle-visualizer Vite plugin), so import suggestions are unavailable.`);
	}
	await progress("Building for production");
	const plain = await runBuild(projectRoot, packageManager, shims, false, path.join(outDir, "build.log"));
	outputs.durationMs.plain = plain.durationMs;
	if (plain.error) outputs.notes.push(`The production build failed (${plain.error}); see ${BUNDLE_DIR}/build.log.${installHint(plain, packageManager)} The bundle's composition is unknown.`);
	else if (await scriptsWrittenSince(path.join(projectRoot, ASSETS_DIR), plain.startedAt)) outputs.assetsDir = path.join(projectRoot, ASSETS_DIR);
	else outputs.notes.push(`The production build didn't write ${ASSETS_DIR}, so the bundle's composition is unknown.`);
	const after = await gitStatus(projectRoot);
	if (before !== null && after !== null && before !== after) outputs.notes.push("The build changed files outside build/ (git status differs before and after); review them in the project.");
	return outputs;
}
/** A module the build can't resolve almost always means node_modules is older than the lockfile. */
const installHint = (run, packageManager) => run.missingModule ? ` A module it needs isn't installed: run \`${packageManager} install\` in the project, then audit again.` : "";
/**
* Runs the project's `build` script once, with the user's environment plus:
* - `BUNDLES_SIZE_ANALYZE`: `true` for the module-graph build, unset for the plain one;
* - `BUNDLES_SIZE_OPEN`: `false`, so the visualizer doesn't open its report;
* - `BUNDLES_SIZE_CHECK`: always unset.
*/
async function runBuild(projectRoot, packageManager, shims, analyze, logFile) {
	const env = {
		...process.env,
		PATH: [shims, process.env.PATH ?? ""].join(path.delimiter),
		BUNDLES_SIZE_OPEN: "false"
	};
	delete env.BUNDLES_SIZE_CHECK;
	if (analyze) env.BUNDLES_SIZE_ANALYZE = "true";
	else delete env.BUNDLES_SIZE_ANALYZE;
	const startedAt = Date.now();
	try {
		const { stdout, stderr } = await runFile(packageManager, ["run", "build"], {
			cwd: projectRoot,
			env,
			encoding: "utf8",
			maxBuffer: 256 * 1024 * 1024,
			timeout: BUILD_TIMEOUT_MS,
			killSignal: "SIGKILL",
			shell: process.platform === "win32"
		});
		await writeLog(logFile, stdout, stderr);
		return {
			startedAt,
			durationMs: Date.now() - startedAt
		};
	} catch (error) {
		const failure = error;
		await writeLog(logFile, failure.stdout ?? "", failure.stderr ?? "");
		const cause = errorLine(failure.stderr ?? "") ?? errorLine(failure.stdout ?? "");
		const reason = failure.killed ? `timed out after ${BUILD_TIMEOUT_MS / 6e4} minutes` : failure.code === "ENOENT" ? `${packageManager} isn't installed or isn't on PATH` : typeof failure.code === "number" ? `exit code ${failure.code}${cause ? `: ${cause}` : ""}` : sanitizeText(failure.message ?? String(error));
		const missingModule = /Cannot find (?:module|package)|MODULE_NOT_FOUND/.test(`${failure.stderr ?? ""}\n${failure.stdout ?? ""}`);
		return {
			startedAt,
			durationMs: Date.now() - startedAt,
			error: reason,
			missingModule
		};
	}
}
const MAX_CAUSE_CHARS = 200;
/** The first line that reads like the build's error (`Error: Cannot find module 'x'`), so the note says why. */
function errorLine(output) {
	const line = output.split("\n").map((item) => item.trim()).find((item) => /^(?:\w*Error|error|ERR_[A-Z_]+)\b/.test(item));
	if (!line) return void 0;
	const text = sanitizeText(line);
	return text.length > MAX_CAUSE_CHARS ? `${text.slice(0, MAX_CAUSE_CHARS - 1)}…` : text;
}
const tail = (text) => text.length > LOG_TAIL_CHARS ? `…\n${text.slice(-LOG_TAIL_CHARS)}` : text;
async function writeLog(file, stdout, stderr) {
	await writeFile(file, sanitizeText(`${tail(stdout)}\n--- stderr ---\n${tail(stderr)}\n`));
}
/**
* Projects from before `BUNDLES_SIZE_OPEN` always open the visualizer report. For them, no-op `open` and `xdg-open`
* first on PATH keep it from launching a browser on macOS; the visualizer runs Linux's and Windows' openers by path.
*/
async function openShims(outDir) {
	const dir = path.join(outDir, ".bin");
	await mkdir(dir, { recursive: true });
	for (const name of ["open", "xdg-open"]) {
		const file = path.join(dir, name);
		await writeFile(file, "#!/bin/sh\nexit 0\n");
		await chmod(file, 493);
	}
	return dir;
}
async function writtenSince(file, startedAt) {
	try {
		return (await stat(file)).mtimeMs >= startedAt - 1e3;
	} catch {
		return false;
	}
}
/** A directory's own time changes only when entries come and go, so its scripts are checked instead. */
async function scriptsWrittenSince(dir, startedAt) {
	let names;
	try {
		names = (await readdir(dir)).filter((name) => name.endsWith(".js"));
	} catch {
		return false;
	}
	for (const name of names) if (await writtenSince(path.join(dir, name), startedAt)) return true;
	return false;
}
async function gitStatus(projectRoot) {
	try {
		return (await runFile("git", [
			"status",
			"--porcelain",
			"--",
			"."
		], {
			cwd: projectRoot,
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
			timeout: 3e4
		})).stdout;
	} catch {
		return null;
	}
}

//#endregion
//#region src/audit/audit.ts
const EVALUATE_RULE_INSTRUCTIONS = path.join(AUDIT_ROOT, "instructions", "evaluate-rule.md");
/** Ends the run a failed step was working on with run.error, so the dashboard shows the failure instead of waiting. */
async function failRun(step) {
	const active = {};
	try {
		return await step(active);
	} catch (error) {
		if (active.run) await emit(active.run.eventsFile, {
			type: "run.error",
			message: sanitizeText(error instanceof Error ? error.message : String(error)),
			...active.run.stageId ? { stageId: active.run.stageId } : {}
		});
		throw error;
	}
}
const targets = (urls, allowHttp) => urls.map((entry) => {
	const split = entry.indexOf("=");
	if (split < 1) throw new Error("--url must use label=https://…");
	const target = {
		label: entry.slice(0, split),
		url: entry.slice(split + 1)
	};
	const parsed = new URL(target.url);
	if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("URL must use http(s)");
	if (parsed.username || parsed.password) throw new Error("URL credentials are not allowed");
	if (parsed.protocol === "http:" && !allowHttp) throw new Error("HTTP requires explicit --allow-http");
	return target;
});
const archives = (values) => {
	const entries = values.map((entry) => {
		const split = entry.indexOf("=");
		if (split < 1 || !path.isAbsolute(entry.slice(split + 1))) throw new Error("--archive must use label=/absolute/archive");
		return {
			label: entry.slice(0, split),
			value: entry.slice(split + 1)
		};
	});
	assertUniqueLabels(entries);
	return new Map(entries.map(({ label, value }) => [label, value]));
};
async function writeJson(file, value) {
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
const PAGE_LABEL = /^[a-z][a-z0-9-]{0,63}$/;
function assertUniqueLabels(items) {
	const labels = /* @__PURE__ */ new Set();
	for (const { label } of items) {
		if (!PAGE_LABEL.test(label)) throw new Error(`Invalid page label: ${label}`);
		if (labels.has(label)) throw new Error(`Duplicate page label: ${label}`);
		labels.add(label);
	}
}
/** The run's progress event log, unless --events <file> names another. */
function eventsFileFor(events, run) {
	return events === void 0 ? path.join(run, "events.ndjson") : path.resolve(events);
}
/** Best-effort event emission: progress reporting must never fail the audit. */
async function emit(file, event) {
	try {
		await appendEvent(file, event);
	} catch {}
}
/** Strip Playhouse's animated stderr progress frames (ANSI colors and
* `[███░░░] 42% mobile/cold run 1/3` bars) from an error message so the real
* failure reads cleanly in the activity log. */
function stripProgressNoise(message) {
	return message.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[[▀-▓\s]*\]/g, "").replace(/\s*\d+%\s*[\w/]*(?:\s+run\s+\d+\/\d+|\s+profiling)?/g, "").replace(/\s+/g, " ").trim();
}
/** Collects Playhouse evidence for each page and writes the run's prepared.json; returns its path. */
function prepare(options) {
	return failRun(async (active) => {
		const runs = options.runs ?? 1;
		const project = await resolveProject(options.project ?? process.cwd());
		const customCategories = options.categories !== void 0;
		const catalog = await discoverCatalog(options.categories ?? defaultCategoriesDir());
		const workspace = path.resolve(options.workspace ?? path.join(project.root, ".site-audit"));
		const requestedTargets = targets(options.urls ?? [], options.allowHttp === true);
		assertUniqueLabels(requestedTargets);
		const requestedArchives = archives(options.archives ?? []);
		const pages = [];
		const pageFailures = [];
		for (const label of requestedArchives.keys()) if (!requestedTargets.some((target) => target.label === label)) throw new Error(`--archive ${label} requires a matching --url ${label}=https://…`);
		const startedAt = (/* @__PURE__ */ new Date()).toISOString();
		const runId = runIdFor(startedAt);
		const run = runDir(workspace, runId);
		await mkdir(path.dirname(run), { recursive: true });
		await mkdir(run);
		const preparedPath = path.join(run, "prepared.json");
		const eventsFile = eventsFileFor(options.events, run);
		const homeTarget = requestedTargets.find((target) => target.label === "home") ?? requestedTargets[0];
		await emit(eventsFile, {
			type: "run.start",
			runId,
			startedAt,
			target: homeTarget ? { url: sanitizeTargetUrl(homeTarget.url) } : void 0,
			plan: [
				...requestedTargets.map((target) => ({
					id: target.label,
					title: `Lighthouse · ${target.label}`,
					detail: sanitizeTargetUrl(target.url)
				})),
				{
					id: BUNDLE_STAGE,
					title: "Bundle analysis",
					detail: options.build === false ? "Measure the first-party JavaScript each page loaded" : "Build the project and break down the JavaScript each page loaded"
				},
				{
					id: "analyze",
					title: "AI code analysis",
					detail: "Evaluate the rule catalog against collected evidence and the repository"
				},
				{
					id: "compile",
					title: "Compile report",
					detail: "Validate analysis, score findings, and write the report"
				}
			]
		});
		active.run = { eventsFile };
		const browser = requestedTargets.some((target) => !requestedArchives.has(target.label)) ? await ensureBrowser((message) => emit(eventsFile, {
			type: "log",
			level: "info",
			message
		})) : void 0;
		const playhouse = {
			bin: playhouseBin(),
			...browser ? { browser } : {}
		};
		const collectionDir = path.join(run, "playhouse");
		await mkdir(collectionDir);
		for (const target of requestedTargets) {
			const safeUrl = sanitizeTargetUrl(target.url);
			await emit(eventsFile, {
				type: "stage.start",
				stageId: target.label
			});
			await emit(eventsFile, {
				type: "page.start",
				pageId: target.label,
				label: target.label,
				url: safeUrl
			});
			await emit(eventsFile, {
				type: "log",
				level: "info",
				message: `Collecting Playhouse evidence for ${target.label}`
			});
			try {
				const archive = requestedArchives.get(target.label);
				const collection = archive ? await copyArchive(await readExistingPlayhouseArchive(playhouse, target, archive, collectionDir), collectionDir) : await collectWithPlayhouse(playhouse, target, collectionDir, runs);
				pages.push(collection);
				const perf = perfFromSummary(await readJsonIfPresent(path.join(collection.archiveDir, "summary.json")));
				await emit(eventsFile, {
					type: "page.complete",
					pageId: target.label,
					score: perf.score,
					metrics: perf.metrics
				});
				await emit(eventsFile, {
					type: "stage.complete",
					stageId: target.label
				});
				await emit(eventsFile, {
					type: "log",
					level: "ok",
					message: `${target.label} collected`
				});
			} catch (error) {
				const message = sanitizeText(stripProgressNoise(error instanceof Error ? error.message : String(error)));
				pageFailures.push({
					label: target.label,
					url: safeUrl,
					error: message
				});
				await emit(eventsFile, {
					type: "page.run",
					pageId: target.label,
					runIndex: 1,
					total: runs,
					status: "failed"
				});
				await emit(eventsFile, {
					type: "stage.complete",
					stageId: target.label,
					summary: "Collection failed"
				});
				await emit(eventsFile, {
					type: "log",
					level: "warn",
					message: `${target.label} failed: ${message}`
				});
			}
		}
		const expectedPages = options.expectedPages ?? [
			"home",
			"plp",
			"pdp"
		];
		const coverage = expectedPages.filter((label) => !pages.some((page) => page.label === label)).map((page) => ({
			page,
			status: "missing",
			note: pageFailures.find((failure) => failure.label === page)?.error ?? `No URL was supplied for expected page ${page}.`
		}));
		const bundle = await prepareBundle(project.root, run, pages, options.build !== false, eventsFile);
		const preparedRuleOutputs = await prepareRuleResults({
			catalog,
			pages,
			workspaceRoot: run,
			companionRoot: customCategories ? false : void 0,
			bundle
		});
		const outputs = new Map(preparedRuleOutputs.map((output) => [output.reference.ruleId, output]));
		const allRules = catalog.categories.flatMap((category) => category.rules);
		await writeJson(preparedPath, {
			schemaVersion: "1.0",
			run: {
				id: runId,
				generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				toolVersion: VERSION,
				...pages[0] ? { playhouseVersion: pages[0].playhouseVersion } : {}
			},
			project,
			instructions: EVALUATE_RULE_INSTRUCTIONS,
			pages: pages.map((page) => ({
				label: page.label,
				url: page.url,
				archiveDir: path.relative(run, page.archiveDir).split(path.sep).join("/")
			})),
			pageFailures,
			expectedPages,
			coverage,
			rules: allRules.filter((rule) => !outputs.get(rule.id)?.result.decision).map((rule) => {
				const output = outputs.get(rule.id);
				return {
					ruleId: rule.id,
					title: rule.title,
					file: rule.file,
					...output ? { data: output.reference.path } : {},
					output: aiAnalysisPathForRule(rule.id)
				};
			}),
			decidedFindings: allRules.flatMap((rule) => {
				const decision = outputs.get(rule.id)?.result.decision;
				return decision?.status === "fail" ? [{
					ruleId: rule.id,
					title: rule.title,
					severity: decision.severity ?? rule.severity,
					summary: decision.summary
				}] : [];
			})
		});
		await emit(eventsFile, {
			type: "stage.start",
			stageId: "analyze"
		});
		await emit(eventsFile, {
			type: "log",
			level: "info",
			message: "Evidence collected; AI analysis in progress"
		});
		active.run = void 0;
		return preparedPath;
	});
}
/** Merges script results and ai-analysis/ into the latest run's audit-result.json; returns its path. */
function finalize(options) {
	return failRun(async (active) => {
		const workspace = await latestRunDir(path.resolve(options.workspace));
		const eventsFile = eventsFileFor(options.events, workspace);
		const completed = latestRunEvents(await readEvents(eventsFile)).some((event) => event.type === "run.complete");
		if (!completed) active.run = {
			eventsFile,
			stageId: "analyze"
		};
		const prepared = parsePrepared(JSON.parse(await readFile(path.join(workspace, "prepared.json"), "utf8")));
		assertUniqueLabels(prepared.pages);
		if (prepared.run.toolVersion !== VERSION) throw new Error(`prepared.json was written by storefront-next-dev ${prepared.run.toolVersion}, but this is ${VERSION}; re-run prepare`);
		const catalog = await discoverCatalog(options.categories ?? defaultCategoriesDir());
		const rules = new Map(catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule])));
		for (const rule of prepared.rules) if (!rules.has(rule.ruleId)) throw new Error(`prepared.json lists a rule that is not in the catalog: ${rule.ruleId}`);
		const decided = (await readPreparedRuleResults(workspace, catalog.ruleIds)).filter((output) => output.result.decision);
		const pages = await Promise.all(prepared.pages.map((page) => readPage(workspace, page, prepared.run.playhouseVersion)));
		const archiveFiles = new Map(pages.map((page) => [page.label, page.files]));
		const bundle = await readBundleAnalysis(workspace);
		const aiEvaluations = await readAiEvaluations(workspace, rules, new Set(prepared.rules.map((rule) => rule.ruleId)), archiveFiles, bundle);
		const summary = await readAiSummary(workspace, archiveFiles);
		const emptyCategories = catalog.categories.filter((category) => category.rules.length === 0).map((category) => ({
			category: category.id,
			status: "missing",
			note: "No codified rules in this category."
		}));
		const result = validateAuditResult({
			schemaVersion: "1.0",
			run: {
				id: prepared.run.id,
				generatedAt: prepared.run.generatedAt,
				toolVersion: prepared.run.toolVersion
			},
			project: { name: prepared.project.packageName },
			pages: pages.map(({ files: _files,...page }) => page),
			catalog: {
				categories: catalog.categories.map((category) => ({
					id: category.id,
					title: category.title,
					ruleIds: category.rules.map((rule) => rule.id)
				})),
				ruleIds: catalog.ruleIds
			},
			evaluations: [...decided.map((output) => deterministicEvaluation(ruleById(rules, output.reference.ruleId), output)), ...aiEvaluations],
			observations: summary.observations,
			coverage: [
				...prepared.coverage,
				...emptyCategories,
				...summary.coverage
			],
			summary: {
				guidance: "go",
				narrative: summary.narrative,
				highlights: summary.highlights
			},
			...bundle ? { bundle } : {}
		}, catalog, archiveFiles);
		const resultPath = path.join(workspace, "audit-result.json");
		await writeJson(resultPath, result);
		active.run = void 0;
		if (completed) return resultPath;
		const findingCount = result.evaluations.filter((evaluation) => evaluation.disposition === "finding").length;
		await emit(eventsFile, {
			type: "stage.complete",
			stageId: "analyze",
			summary: `${findingCount} finding${findingCount === 1 ? "" : "s"} across ${result.catalog.categories.length} categories`
		});
		await emit(eventsFile, {
			type: "stage.start",
			stageId: "compile"
		});
		for (const evaluation of result.evaluations) {
			if (evaluation.disposition !== "finding") continue;
			await emit(eventsFile, {
				type: "finding",
				id: evaluation.ruleId,
				severity: evaluation.severity ?? "info",
				title: evaluation.title,
				category: evaluation.ruleId.split("/")[0],
				source: "analysis",
				ruleId: evaluation.ruleId,
				preliminary: false
			});
		}
		const scores = result.pages.map((page) => ({
			label: page.label,
			score: perfFromSummary(page.playhouse.artifacts["summary.json"]).score
		})).filter((entry) => typeof entry.score === "number");
		await emit(eventsFile, {
			type: "stage.complete",
			stageId: "compile",
			summary: "Report compiled"
		});
		await emit(eventsFile, {
			type: "run.complete",
			guidance: result.summary?.guidance,
			scores
		});
		return resultPath;
	});
}
const BUNDLE_STAGE = "bundle";
/**
* Builds the project (after collection, so the build never competes with a measurement) and writes
* bundle/analysis.json. Never fails the audit: whatever goes wrong becomes a note in the analysis.
*/
async function prepareBundle(projectRoot, run, pages, build, eventsFile) {
	await emit(eventsFile, {
		type: "stage.start",
		stageId: BUNDLE_STAGE
	});
	const log = (message) => emit(eventsFile, {
		type: "log",
		level: "info",
		message
	});
	let analysis;
	try {
		const outputs = build ? await buildForAnalysis(projectRoot, run, log) : {
			projectRoot,
			packageManager: "",
			durationMs: {
				analyze: null,
				plain: null
			},
			assetsDir: null,
			visualizerHtml: null,
			visualizer: null,
			notes: ["The project wasn't built (--no-build), so only what the browser loaded is reported."]
		};
		await log("Analyzing the bundle");
		analysis = bundleAnalysisSchema.parse(await analyzeBundle(outputs, pages, new PlayhouseArtifactReader(pages)));
	} catch (error) {
		analysis = {
			schemaVersion: BUNDLE_SCHEMA_VERSION,
			status: "unavailable",
			notes: [sanitizeText(`The bundle analysis failed: ${error instanceof Error ? error.message : String(error)}`)],
			build: null,
			pages: [],
			skipped: []
		};
	}
	await mkdir(path.join(run, BUNDLE_DIR), { recursive: true });
	await writeJson(path.join(run, BUNDLE_ANALYSIS), analysis);
	for (const note of analysis.notes) await emit(eventsFile, {
		type: "log",
		level: "warn",
		message: note
	});
	const measured = `${analysis.pages.length} page${analysis.pages.length === 1 ? "" : "s"}`;
	await emit(eventsFile, {
		type: "stage.complete",
		stageId: BUNDLE_STAGE,
		summary: analysis.status === "complete" ? `${measured} analyzed` : analysis.status === "partial" ? `${measured} analyzed (partial)` : `${measured} measured, no build`
	});
	return analysis;
}
function sanitizeTargetUrl(value) {
	const url = new URL(value);
	url.username = "";
	url.password = "";
	for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
	url.hash = "";
	return url.toString();
}
function ruleById(rules, ruleId) {
	const rule = rules.get(ruleId);
	if (!rule) throw new Error(`Unknown rule id: ${ruleId}`);
	return rule;
}
function deterministicEvaluation(rule, output) {
	const { decision } = output.result;
	if (!decision) throw new Error(`${rule.id} has no decision from its script`);
	const remediation = decision.status === "fail" ? section(rule.instructions, "Remediation") : void 0;
	return {
		ruleId: rule.id,
		disposition: decision.status === "fail" ? "finding" : decision.status,
		title: rule.title,
		description: section(rule.instructions, "Intent"),
		...decision.status === "fail" ? { severity: decision.severity ?? rule.severity } : {},
		summary: decision.summary,
		...remediation ? { remediation } : {},
		evidence: decision.evidence,
		method: "script"
	};
}
/** The body of a `## <name>` section in a rule's markdown. */
function section(markdown, name) {
	return new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(markdown)?.[1]?.trim() || void 0;
}
async function exists(file) {
	try {
		await access(file);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
async function readJsonIfPresent(file) {
	return await exists(file) ? JSON.parse(await readFile(file, "utf8")) : void 0;
}
/**
* A reused `--archive` is copied into the run, which then owns it like a collected one.
* Symlinks inside it are skipped, so the archive can't pull files from outside it into the run.
*/
async function copyArchive(collection, collectionDir) {
	const archiveDir = path.join(collectionDir, collection.label);
	await cp(collection.archiveDir, archiveDir, {
		recursive: true,
		filter: async (source) => source === collection.archiveDir || !(await lstat(source)).isSymbolicLink()
	});
	return {
		...collection,
		archiveDir
	};
}
/** Artifacts embedded in audit-result.json for the dashboard. Everything else stays in the archive. */
const DASHBOARD_ARTIFACTS = [
	"summary.json",
	"opportunities.json",
	"summary-lcp.json",
	"network-mobile-cold.json"
];
async function readPage(workspace, page, playhouseVersion = "unknown") {
	const archiveDir = path.resolve(workspace, page.archiveDir);
	const files = new Set(await listArchiveFiles(archiveDir));
	const manifest = z.object({ lighthouseVersion: z.string() }).passthrough().parse(JSON.parse(await readFile(path.join(archiveDir, "manifest.json"), "utf8")));
	const artifacts = {};
	for (const name of DASHBOARD_ARTIFACTS) if (files.has(name)) artifacts[name] = JSON.parse(await readFile(path.join(archiveDir, name), "utf8"));
	if (files.has(LIGHTHOUSE_REPORT)) artifacts[LIGHTHOUSE_REPORT] = { available: true };
	return {
		label: page.label,
		url: page.url,
		files,
		playhouse: {
			archiveDir,
			version: playhouseVersion,
			lighthouseVersion: manifest.lighthouseVersion,
			artifacts
		}
	};
}
/** Run `check` and prefix any error with the workspace file it concerns, so the agent knows what to fix. */
async function inFile(file, check) {
	try {
		return await check();
	} catch (error) {
		throw new Error(`${file}: ${error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
}
/** The run's bundle/analysis.json, when prepare wrote one. */
async function readBundleAnalysis(workspace) {
	const file = path.join(workspace, BUNDLE_ANALYSIS);
	if (!await exists(file)) return void 0;
	return inFile(BUNDLE_ANALYSIS, async () => bundleAnalysisSchema.parse(JSON.parse(await readFile(file, "utf8"))));
}
async function readAiEvaluations(workspace, rules, aiRuleIds, archiveFiles, bundle) {
	const root = path.join(workspace, "ai-analysis", "categories");
	if (!await exists(root)) return [];
	const evaluations = [];
	for (const entry of await readdir(root, {
		recursive: true,
		withFileTypes: true
	})) {
		if (!entry.isFile()) continue;
		const file = path.relative(workspace, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
		evaluations.push(await inFile(file, async () => {
			const match = /^ai-analysis\/categories\/([a-z0-9-]+)\/rules\/([a-z0-9-]+)\.json$/.exec(file);
			if (!match) throw new Error("unexpected file; AI evaluations go in ai-analysis/categories/<category>/rules/<rule>.json");
			const ruleId = `${match[1]}/${match[2]}`;
			if (!aiRuleIds.has(ruleId)) throw new Error(rules.has(ruleId) ? `${ruleId} was decided by its script; delete this file` : `${ruleId} is not a rule in prepared.json`);
			const raw = z.object({ ruleId: z.string() }).passthrough().parse(JSON.parse(await readFile(path.join(workspace, file), "utf8")));
			if (raw.ruleId !== ruleId) throw new Error(`ruleId ${raw.ruleId} does not match the file path (${ruleId})`);
			const rule = ruleById(rules, ruleId);
			const evaluation = evaluationSchema.parse({
				...raw,
				title: rule.title,
				description: section(rule.instructions, "Intent"),
				method: "ai"
			});
			if (evaluation.disposition === "pass" && evaluation.evidence.length === 0) throw new Error(`${ruleId} pass requires evidence of what was checked`);
			for (const evidence of evaluation.evidence) validateEvidence(evidence, archiveFiles);
			validateWaterfall(evaluation, new Set(archiveFiles.keys()));
			if (evaluation.recommendations && !bundle) throw new Error(`recommendations need the run's ${BUNDLE_ANALYSIS}, which prepare didn't write`);
			validateRecommendations(evaluation, new Set(archiveFiles.keys()), bundle);
			return evaluation;
		}));
	}
	return evaluations;
}
const aiSummarySchema = z.object({
	narrative: z.string(),
	highlights: z.array(z.string().min(1)).max(6).optional().default([]),
	observations: auditResultSchema.shape.observations,
	coverage: auditResultSchema.shape.coverage.optional().default([])
});
async function readAiSummary(workspace, archiveFiles) {
	const file = "ai-analysis/summary.json";
	if (!await exists(path.join(workspace, file))) return {
		narrative: "",
		highlights: [],
		observations: [],
		coverage: []
	};
	return inFile(file, async () => {
		const { narrative, highlights, observations, coverage } = aiSummarySchema.parse(JSON.parse(await readFile(path.join(workspace, file), "utf8")));
		for (const observation of observations) for (const evidence of observation.evidence) validateEvidence(evidence, archiveFiles);
		return {
			narrative,
			highlights,
			observations,
			coverage
		};
	});
}

//#endregion
export { finalize as n, prepare as r, eventsFileFor as t };