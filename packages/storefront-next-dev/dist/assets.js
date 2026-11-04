import { t as version } from "./package.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

//#region src/audit/assets.ts
/** The storefront-next-dev version, not the host CLI's: under `b2c sfnext`, oclif's config version is b2c's. */
const VERSION = version;
function packageRoot(from) {
	for (let dir = from;; dir = path.dirname(dir)) {
		if (existsSync(path.join(dir, "package.json"))) return dir;
		if (path.dirname(dir) === dir) throw new Error(`No package.json above ${from}`);
	}
}
const here = path.dirname(fileURLToPath(import.meta.url));
const root = packageRoot(here);
/**
* The directory holding the audit's runtime assets (catalog, instructions, UI). tsdown moves shared code into
* chunks at the top of `dist`, so paths relative to a module break after bundling. This resolves to `src/audit`
* when running from source (tests) and `dist/audit` when running the build.
*/
const AUDIT_ROOT = path.join(root, path.relative(root, here).split(path.sep)[0] === "src" ? "src" : "dist", "audit");

//#endregion
export { VERSION as n, AUDIT_ROOT as t };