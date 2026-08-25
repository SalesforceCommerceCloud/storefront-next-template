import { t as logger } from "./logger.js";
import { spawnSync } from "child_process";
import { dirname, join, relative } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

//#region src/utils/format-with-project-biome.ts
/** This module's own path — the resolution root for the SDK-bundled Biome fallback. */
const HERE = fileURLToPath(import.meta.url);
/**
* Format every file Biome recognizes under `directory` in place with the consuming project's
* Biome, so generated files (e.g. cartridge metadata JSON) match `biome format` / `pnpm lint:fix`.
*
* Unlike {@link formatWithProjectBiome} (single file via stdin), this runs `biome format --write`
* against the directory so Biome discovers the project's `biome.json` by walking up from it and
* applies the project's formatting to the written files directly.
*
* Fail-safe: when Biome can't be resolved or the run fails, the files are left as written (valid,
* just unformatted) and a warning is logged — generation never breaks over formatting.
*
* @param directory - Directory whose Biome-recognized files should be formatted in place.
*/
function formatDirectoryWithProjectBiome(directory) {
	const biomeBin = resolveBiomeBin(join(directory, "biome-resolution-root.js"));
	if (!biomeBin) {
		logger.warn(`⚠️  Biome could not be resolved; generated files in ${directory} were left unformatted.`);
		return;
	}
	const result = spawnSync(process.execPath, [
		biomeBin,
		"format",
		"--write",
		"."
	], {
		cwd: directory,
		encoding: "utf8"
	});
	if (result.status !== 0) {
		const detail = result.stderr?.trim() || `exit code ${result.status}`;
		logger.warn(`⚠️  Some generated files in ${directory} could not be formatted by Biome: ${detail}`);
		return;
	}
	logger.debug(`✅ Formatted generated files in ${directory} with Biome`);
}
/**
* Format only files changed by generation with the SDK-bundled Biome.
*
* Extension trimming can touch customer-owned source files, so formatting the project root would
* rewrite unrelated files. The SDK's pinned Biome keeps this automatic path independent of any
* target-project executable while the target project's biome.json still determines formatting.
*
* @param directory - Project root containing the Biome configuration.
* @param filePaths - Absolute paths of files changed by generation.
*/
function formatFilesWithBundledBiome(directory, filePaths) {
	if (filePaths.length === 0) return;
	const biomeBin = resolveBiomeBin(HERE);
	if (!biomeBin) {
		logger.warn(`⚠️  Biome could not be resolved; generated files in ${directory} were left unformatted.`);
		return;
	}
	const result = spawnSync(process.execPath, [
		biomeBin,
		"format",
		"--write",
		...filePaths.map((filePath) => relative(directory, filePath))
	], {
		cwd: directory,
		encoding: "utf8"
	});
	if (result.status !== 0) {
		const detail = result.stderr?.trim() || `exit code ${result.status}`;
		logger.warn(`⚠️  Some generated files in ${directory} could not be formatted by Biome: ${detail}`);
		return;
	}
	logger.debug(`✅ Formatted ${filePaths.length} generated files in ${directory} with Biome`);
}
/**
* Resolve a Biome CLI binary path, preferring the consuming project's install and falling back
* to the SDK-bundled copy (available pre-install). Returns null when neither resolves.
*/
function resolveBiomeBin(filePath) {
	for (const fromPath of [filePath, HERE]) try {
		const req = createRequire(fromPath);
		const biomePkgJson = req.resolve("@biomejs/biome/package.json");
		const { bin } = req(biomePkgJson);
		return join(dirname(biomePkgJson), bin.biome);
	} catch {}
	return null;
}

//#endregion
export { formatFilesWithBundledBiome as n, formatDirectoryWithProjectBiome as t };