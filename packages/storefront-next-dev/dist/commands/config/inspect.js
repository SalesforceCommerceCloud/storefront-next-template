import { i as withLegacyMrtShortFlags, r as commonFlags } from "../../flags.js";
import { ux } from "@oclif/core";
import fs from "fs-extra";
import chalk from "chalk";
import { parseEnv } from "node:util";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MrtCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { listEnvVarsWithBackend } from "@salesforce/b2c-tooling-sdk/operations/mrt";

//#region src/utils/objects.ts
/**
* Recursively flattens a nested object into dot-notation key-value pairs.
* Arrays and primitives are treated as leaf values (not further traversed).
*
* @param obj - The object to flatten
* @param prefix - Dot-notation prefix for nested keys
*/
function flattenObject(obj, prefix = "") {
	const entries = [];
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === "object" && !Array.isArray(v)) entries.push(...flattenObject(v, key));
		else entries.push({
			key,
			value: v
		});
	}
	return entries;
}

//#endregion
//#region src/commands/config/inspect-utils.ts
/**
* Converts a PUBLIC__-prefixed env key to dot-notation config path.
* Example: PUBLIC__app__commerce__api__clientId → app.commerce.api.clientId
*/
function envKeyToConfigPath(envKey) {
	return envKey.replace(/^PUBLIC__/, "").replace(/__/g, ".");
}
/**
* Converts a dot-notation config path to a PUBLIC__-prefixed env key.
* Example: app.commerce.api.clientId → PUBLIC__app__commerce__api__clientId
*/
function configPathToEnvKey(configPath) {
	return `PUBLIC__${configPath.replace(/\./g, "__")}`;
}
/**
* Determines the source of each flattened config path.
* Returns ".env" when there is a corresponding PUBLIC__-prefixed key in envKeys;
* returns "config" otherwise.
*
* @param flattenedKeys - Array of dot-notation config paths
* @param envKeys - Set of PUBLIC__-prefixed keys found in .env
*/
function getValueSources(flattenedKeys, envKeys) {
	const sources = /* @__PURE__ */ new Map();
	for (const configPath of flattenedKeys) sources.set(configPath, envKeys.has(configPathToEnvKey(configPath)) ? ".env" : "config");
	return sources;
}
/**
* Formats the full inspection output as a string.
*/
function formatInspectOutput({ flatConfig, sources, localVars, mrtVars }) {
	const lines = [];
	const maxKeyLen = (keys) => keys.reduce((max, k) => Math.max(max, k.length), 0);
	const envOverrides = flatConfig.filter((e) => sources.get(e.key) === ".env").sort((a, b) => a.key.localeCompare(b.key));
	const totalCount = flatConfig.length;
	if (totalCount > 0) lines.push(`  Config:  config.server.ts (${totalCount} values, ${envOverrides.length} overridden by .env)`);
	else lines.push(chalk.dim("  (no config loaded)"));
	lines.push("");
	lines.push(chalk.bold("=== .env Overrides ==="));
	lines.push(chalk.dim("  Config paths overridden by PUBLIC__ env vars in .env."));
	lines.push("");
	if (envOverrides.length === 0) lines.push(chalk.dim("  (no .env overrides)"));
	else {
		const padLen = maxKeyLen(envOverrides.map((e) => e.key));
		for (const { key, value } of envOverrides) {
			const tag = mrtVars !== null && !mrtVars.has(configPathToEnvKey(key)) ? `  ${chalk.yellow("[local only]")}` : "";
			lines.push(`  ${key.padEnd(padLen)} = ${JSON.stringify(value)}${tag}`);
		}
	}
	lines.push("");
	if (mrtVars !== null) {
		lines.push(chalk.bold("=== MRT Overrides ==="));
		lines.push(chalk.dim("  Config paths overridden by PUBLIC__ env vars in MRT. Values are masked by MRT."));
		lines.push("");
		const mrtPublicEntries = [...mrtVars.entries()].filter(([key]) => key.startsWith("PUBLIC__")).map(([key, value]) => [
			key,
			value,
			envKeyToConfigPath(key)
		]).sort(([, , configPath1], [, , configPath2]) => configPath1.localeCompare(configPath2));
		if (mrtPublicEntries.length === 0) lines.push(chalk.dim("  (no MRT config overrides)"));
		else {
			const padLen = maxKeyLen(mrtPublicEntries.map(([, , configPath]) => configPath));
			for (const [key, value, configPath] of mrtPublicEntries) {
				const tag = !localVars.has(key) ? `  ${chalk.cyan("[MRT only]")}` : "";
				lines.push(`  ${configPath.padEnd(padLen)} = ${value}${tag}`);
			}
		}
		lines.push("");
	}
	return lines.join("\n");
}

//#endregion
//#region src/commands/config/inspect.ts
/**
* Show which config.server.ts values are overridden by .env or MRT.
* When MRT is configured, each override is marked [local only] or [MRT only] as applicable.
*
* Environment variables read:
*   MRT_PROJECT      (optional) - MRT project slug, overridden by --project flag
*   MRT_ENVIRONMENT  (optional) - MRT target environment, overridden by --environment flag (MRT_TARGET also accepted)
*   MRT_BACKEND      (optional) - legacy (default), scapi, or auto; overridden by --mrt-backend flag
*/
var ConfigInspect = class ConfigInspect extends MrtCommand {
	static description = "Show which config.server.ts values are overridden by .env or MRT";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --project my-project --environment staging",
		"<%= config.bin %> <%= command.id %> -d /path/to/my-storefront"
	];
	static flags = {
		...withLegacyMrtShortFlags(MrtCommand.baseFlags),
		...commonFlags
	};
	operations = {
		readEnvFile: (projectDirectory) => {
			const envPath = join(projectDirectory, ".env");
			try {
				return parseEnv(fs.readFileSync(envPath, "utf8"));
			} catch (err) {
				if (err.code === "ENOENT") return {};
				throw err;
			}
		},
		loadConfig: async (projectDirectory) => {
			return (await import(pathToFileURL(join(projectDirectory, "node_modules/@salesforce/storefront-next-runtime/dist/config-load.js")).href)).loadConfig();
		},
		listEnvVarsWithBackend
	};
	supportsScapiMrt() {
		return true;
	}
	async run() {
		const { flags, raw } = await this.parse(ConfigInspect);
		const projectDirectory = resolve(flags["project-directory"]);
		const explicitFlags = new Set(raw.filter((t) => t.type === "flag").map((t) => t.flag));
		const rawEnvVars = this.operations.readEnvFile(projectDirectory);
		if (Object.keys(rawEnvVars).length === 0) this.warn(`No .env file found in ${projectDirectory}. Showing config.server.ts defaults only.`);
		let config = {};
		const originalCwd = process.cwd();
		try {
			process.chdir(projectDirectory);
			config = await this.operations.loadConfig(projectDirectory);
		} catch (err) {
			this.warn(`Could not load storefront config: ${err.message}`);
		} finally {
			process.chdir(originalCwd);
		}
		const flatConfig = flattenObject(config);
		const envKeys = new Set(Object.keys(rawEnvVars).filter((k) => k.startsWith("PUBLIC__")));
		const sources = getValueSources(flatConfig.map((e) => e.key), envKeys);
		const project = (explicitFlags.has("project") ? flags.project : void 0) || rawEnvVars.MRT_PROJECT || this.resolvedConfig.values.mrtProject;
		const environment = (explicitFlags.has("environment") ? flags.environment : void 0) || rawEnvVars.MRT_ENVIRONMENT || rawEnvVars.MRT_TARGET || this.resolvedConfig.values.mrtEnvironment;
		let mrtVars = null;
		if (project && environment) try {
			const { preference, scapiConnection, legacyAuth } = this.getMrtBackendContext();
			const { variables } = await this.operations.listEnvVarsWithBackend({
				preference,
				scapiConnection,
				legacyAuth,
				projectSlug: project,
				environment,
				origin: this.resolvedConfig.values.mrtOrigin,
				onFallback: (reason) => this.warn(reason)
			});
			mrtVars = new Map(variables.map((v) => [v.name, v.value]));
		} catch (err) {
			this.warn(`Could not fetch MRT env vars for ${project}/${environment}: ${err.message}`);
		}
		else ux.stdout("ℹ MRT project/environment not configured. Skipping MRT comparison.\n  Use --project and --environment flags or set MRT_PROJECT/MRT_ENVIRONMENT.\n");
		const output = formatInspectOutput({
			flatConfig,
			sources,
			localVars: new Map(Object.entries(rawEnvVars)),
			mrtVars
		});
		ux.stdout(output);
	}
};

//#endregion
export { ConfigInspect as default };