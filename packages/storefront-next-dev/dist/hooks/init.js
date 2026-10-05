import { n as PROJECT_DIRECTORY_FLAG, t as PROJECT_DIRECTORY_CHAR } from "../flags.js";
import { join, resolve } from "node:path";
import { B2CPluginManager } from "@salesforce/b2c-tooling-sdk/plugins";
import { getLogger } from "@salesforce/b2c-tooling-sdk/logging";

//#region src/cli-plugins.ts
let manager;
let initialized = false;
/**
* Initializes the b2c-cli plugin system.
*
* Discovers plugins installed via `b2c plugins:install`, invokes their hooks,
* and registers middleware and config sources with the global registries.
* All failures are non-fatal — the CLI continues to work without plugin support.
*/
async function initializePlugins() {
	if (initialized) return;
	initialized = true;
	try {
		const logger = getLogger();
		manager = new B2CPluginManager({ logger });
		await manager.initialize();
		manager.applyMiddleware();
		if (manager.pluginNames.length > 0) logger.info(`Loaded ${manager.pluginNames.length} plugin(s): ${manager.pluginNames.join(", ")}`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		try {
			getLogger().warn(`Plugin initialization failed: ${message}`);
		} catch {}
		manager = void 0;
	}
}

//#endregion
//#region src/hooks/init.ts
/**
* Oclif init hook — runs before any command executes.
*
* Resolves the project directory from --project-directory / -d early — before
* oclif parses flags — and loads the project's .env file into process.env.
* Using the hook instead of bin/run.js keeps the flag name as a single source
* of truth (imported from flags.ts) and keeps run.js minimal.
*
* Also discovers b2c-cli plugins (installed via `b2c plugins:install`) and
* registers their middleware and config sources with the global registries.
*
* @env {string} [MRT_PROJECT] - Project name for MRT deployments
* @env {string} [MRT_ENVIRONMENT] - Target environment for MRT deployments (MRT_TARGET also accepted)
*/
const hook = async function(opts) {
	if (!(this.config.bin === "sfnext" || opts.id === "sfnext" || (opts.id?.startsWith("sfnext:") ?? false))) return;
	const args = opts.argv ?? [];
	let projectDir = process.cwd();
	for (let i = 0; i < args.length; i++) {
		if ((args[i] === `--${PROJECT_DIRECTORY_FLAG}` || args[i] === `-${PROJECT_DIRECTORY_CHAR}`) && args[i + 1] && !args[i + 1].startsWith("-")) {
			projectDir = resolve(args[i + 1]);
			break;
		}
		const m = args[i].match(/* @__PURE__ */ new RegExp(`^--${PROJECT_DIRECTORY_FLAG}=(.+)$`));
		if (m) {
			projectDir = resolve(m[1]);
			break;
		}
	}
	try {
		process.loadEnvFile(join(projectDir, ".env"));
	} catch {}
	await initializePlugins();
};
var init_default = hook;

//#endregion
export { init_default as default };