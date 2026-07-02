import os from "os";
import chalk from "chalk";
import { createRequire } from "module";

//#region package.json
var version = "1.2.0-dev";

//#endregion
//#region src/utils/logger.ts
/**
* Get the local network IPv4 address
*/
function getNetworkAddress() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		const iface = interfaces[name];
		if (!iface) continue;
		for (const alias of iface) if (alias.family === "IPv4" && !alias.internal) return alias.address;
	}
}
/**
* Get the version of a package from the project's package.json
*/
function getPackageVersion(packageName, projectDir) {
	try {
		const require = createRequire(import.meta.url);
		return require(require.resolve(`${packageName}/package.json`, { paths: [projectDir] })).version;
	} catch {
		return "unknown";
	}
}
const LEVEL_PRIORITY = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3
};
let overrideLevel;
/**
* Returns true when the `DEBUG` env var targets sfnext or is a general enable flag.
* Avoids accidentally enabling debug mode when DEBUG is set for unrelated libraries
* (e.g. `DEBUG=express:*`).
*/
function debugEnablesSfnext() {
	const raw = process.env.DEBUG?.trim();
	if (!raw) return false;
	const normalized = raw.toLowerCase();
	if ([
		"1",
		"true",
		"yes",
		"on"
	].includes(normalized)) return true;
	return raw.split(",").some((token) => {
		const value = token.trim();
		return value === "*" || value === "sfnext" || value === "sfnext:*";
	});
}
function resolveLevel() {
	if (overrideLevel) return overrideLevel;
	const envLevel = process.env.MRT_LOG_LEVEL ?? process.env.SFCC_LOG_LEVEL;
	if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel;
	if (debugEnablesSfnext()) return "debug";
	if (process.env.NODE_ENV === "production") return "warn";
	return "info";
}
function shouldLog(level) {
	return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[resolveLevel()];
}
const logger = {
	error(msg, ...args) {
		if (!shouldLog("error")) return;
		console.error(chalk.red("[sfnext:error]"), msg, ...args);
	},
	warn(msg, ...args) {
		if (!shouldLog("warn")) return;
		console.warn(chalk.yellow("[sfnext:warn]"), msg, ...args);
	},
	info(msg, ...args) {
		if (!shouldLog("info")) return;
		console.log(chalk.cyan("[sfnext:info]"), msg, ...args);
	},
	debug(msg, ...args) {
		if (!shouldLog("debug")) return;
		console.log(chalk.gray("[sfnext:debug]"), msg, ...args);
	},
	setLevel(level) {
		overrideLevel = level;
	},
	getLevel() {
		return resolveLevel();
	}
};
/**
* Print the server information banner with URLs and versions
*/
function printServerInfo(mode, port, startTime, projectDir) {
	const elapsed = Date.now() - startTime;
	const sfnextVersion = version;
	const reactVersion = getPackageVersion("react", projectDir);
	const reactRouterVersion = getPackageVersion("react-router", projectDir);
	const viteVersion = getPackageVersion("vite", projectDir);
	const modeLabel = mode === "development" ? "Development Mode" : "Preview Mode";
	console.log();
	console.log(`  ${chalk.cyan.bold("⚡ SFCC Storefront Next")} ${chalk.dim(`v${sfnextVersion}`)}`);
	console.log(`  ${chalk.green.bold(modeLabel)}`);
	console.log();
	const logLevel = resolveLevel();
	const logLevelColors = {
		error: chalk.red,
		warn: chalk.yellow,
		info: chalk.cyan,
		debug: chalk.gray
	};
	console.log(`  ${chalk.dim("react")} ${chalk.green(`v${reactVersion}`)} ${chalk.dim("|")} ${chalk.dim("react-router")} ${chalk.green(`v${reactRouterVersion}`)} ${chalk.dim("|")} ${chalk.dim("vite")} ${chalk.green(`v${viteVersion}`)}`);
	console.log(`  ${chalk.dim("log level")} ${logLevelColors[logLevel](logLevel)} ${chalk.dim("|")} ${chalk.green(`ready in ${elapsed}ms`)}`);
	console.log();
}
/**
* Print server configuration details (proxy, static, etc.)
*/
function printServerConfig(config) {
	const { port, enableProxy, enableStaticServing, enableCompression, proxyPath, proxyHost, shortCode, organizationId, clientId } = config;
	console.log(`  ${chalk.bold("Environment Configuration:")}`);
	if (enableProxy && proxyPath && proxyHost && shortCode) {
		console.log(`    ${chalk.green("✓")} ${chalk.bold("Proxy:")} ${chalk.cyan(`localhost:${port}${proxyPath}`)} ${chalk.dim("→")} ${chalk.cyan(proxyHost)}`);
		console.log(`      ${chalk.dim("Short Code:      ")}${chalk.dim(shortCode)}`);
		if (organizationId) console.log(`      ${chalk.dim("Organization ID: ")}${chalk.dim(organizationId)}`);
		if (clientId) console.log(`      ${chalk.dim("Client ID:       ")}${chalk.dim(clientId)}`);
	} else console.log(`    ${chalk.bold("Proxy:           ")} ${chalk.dim("disabled")}`);
	if (enableStaticServing) console.log(`    ${chalk.bold("Static:          ")} ${chalk.dim("enabled")}`);
	if (enableCompression) console.log(`    ${chalk.bold("Compression:     ")} ${chalk.dim("enabled")}`);
	const localUrl = `http://localhost:${port}`;
	const networkAddress = process.env.SHOW_NETWORK === "true" ? getNetworkAddress() : void 0;
	const networkUrl = networkAddress ? `http://${networkAddress}:${port}` : void 0;
	console.log();
	console.log(`  ${chalk.bold("Local:  ")} ${chalk.cyan(localUrl)}`);
	if (networkUrl) console.log(`  ${chalk.bold("Network:")} ${chalk.cyan(networkUrl)}`);
	console.log();
	console.log(`  ${chalk.dim("Press")} ${chalk.bold("Ctrl+C")} ${chalk.dim("to stop the server")}`);
	console.log();
}
/**
* Print shutdown message
*/
function printShutdownMessage() {
	console.log(`\n  ${chalk.yellow("⚡")} ${chalk.dim("Server shutting down...")}\n`);
}

//#endregion
export { printShutdownMessage as i, printServerConfig as n, printServerInfo as r, logger as t };