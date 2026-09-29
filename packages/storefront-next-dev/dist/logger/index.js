import chalk from "chalk";

//#region src/utils/logger.ts
const LEVEL_PRIORITY = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3
};
/**
* Type guard for a {@link LogLevel} name. Uses `Object.hasOwn` (not `in`) so
* inherited properties like `toString` don't falsely validate an env value.
*/
function isLogLevel(value) {
	return Object.hasOwn(LEVEL_PRIORITY, value);
}
/**
* Managed Runtime injects `MRT_LOG_LEVEL` as a numeric string from its own
* `LogLevel` enum (`0=TRACE, 1=DEBUG, 2=INFO, 3=WARN, 4=ERROR, 5=FATAL`), not a
* level name — so it must be mapped, not matched against {@link LEVEL_PRIORITY}'s
* keys. `TRACE` and `FATAL` clamp to the closest level this logger supports.
*/
const MRT_NUMERIC_TO_LEVEL = {
	"0": "debug",
	"1": "debug",
	"2": "info",
	"3": "warn",
	"4": "error",
	"5": "error"
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
	const mrtLevel = process.env.MRT_LOG_LEVEL;
	if (mrtLevel && mrtLevel in MRT_NUMERIC_TO_LEVEL) return MRT_NUMERIC_TO_LEVEL[mrtLevel];
	const sfccLevel = process.env.SFCC_LOG_LEVEL;
	if (sfccLevel && isLogLevel(sfccLevel)) return sfccLevel;
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

//#endregion
export { logger };
//# sourceMappingURL=index.js.map