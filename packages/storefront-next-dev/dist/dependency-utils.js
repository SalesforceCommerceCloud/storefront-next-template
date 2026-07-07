import { t as logger } from "./logger.js";
import path from "path";
import { createRequire } from "module";
import fs from "fs";

//#region src/extensibility/path-util.ts
const FILE_EXTENSIONS = [
	".tsx",
	".ts",
	".d.ts"
];
function isSupportedFileExtension(fileName) {
	return FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

//#endregion
//#region src/extensibility/trim-extensions.ts
const SINGLE_LINE_MARKER = "@sfdc-extension-line";
const BLOCK_MARKER_START = "@sfdc-extension-block-start";
const BLOCK_MARKER_END = "@sfdc-extension-block-end";
const FILE_MARKER = "@sfdc-extension-file";
async function trimExtensions(directory, selectedExtensions, extensionConfig) {
	const startTime = Date.now();
	const configuredExtensions = extensionConfig?.extensions || {};
	const extensions = {};
	Object.keys(configuredExtensions).forEach((targetKey) => {
		extensions[targetKey] = Boolean(selectedExtensions?.[targetKey]) || false;
	});
	if (Object.keys(extensions).length === 0) {
		logger.debug("No targets found, skipping trim");
		return;
	}
	const processDirectory = (dir) => {
		fs.readdirSync(dir).forEach((file) => {
			const filePath = path.join(dir, file);
			const stats = fs.statSync(filePath);
			if (!filePath.includes("node_modules")) {
				if (stats.isDirectory()) processDirectory(filePath);
				else if (isSupportedFileExtension(file)) processFile(filePath, extensions);
			}
		});
	};
	processDirectory(directory);
	if (extensionConfig?.extensions) {
		await updateExtensionConfig(directory, extensions);
		deleteExtensionFolders(directory, extensions, extensionConfig);
	}
	const endTime = Date.now();
	logger.debug(`Trim extensions took ${endTime - startTime}ms`);
}
/**
* Update the extension config file to only include the selected extensions.
* @param projectDirectory - The project directory
* @param extensionSelections - The selected extensions
*/
async function updateExtensionConfig(projectDirectory, extensionSelections) {
	const extensionConfigPath = path.join(projectDirectory, "src", "extensions", "config.json");
	const extensionConfig = JSON.parse(fs.readFileSync(extensionConfigPath, "utf8"));
	Object.keys(extensionConfig.extensions).forEach((extensionKey) => {
		if (!extensionSelections[extensionKey]) delete extensionConfig.extensions[extensionKey];
	});
	const json = JSON.stringify({ extensions: extensionConfig.extensions }, null, 4);
	fs.writeFileSync(extensionConfigPath, await formatWithProjectPrettier(json, extensionConfigPath), "utf8");
}
/**
* Format generated JSON/JS so the written file matches what the project's
* `prettier --write` / `pnpm lint` would produce.
*
* `trimExtensions` runs during `create-storefront`, BEFORE the generated project's
* `pnpm install` — so the project's own Prettier is usually not on disk yet. We therefore
* prefer the consumer's Prettier when it happens to be present (re-runs, manage-extensions
* after install), but fall back to the SDK-bundled `prettier` (a hard dependency of this
* package, pinned to the template's version) so formatting is deterministic and available
* at generate time. Relying on the consumer's copy alone resolved only by accident in the
* monorepo harness, where the generated dir is nested under the monorepo and `createRequire`
* walks up to the monorepo's Prettier; a customer in a clean directory would get unformatted
* output and fail lint on first run (W-23074938).
*
* NOTE: mirror of the helper in
* packages/template/scripts/generate-eslint-config.js — kept separate because
* the two live in different packages/module systems. Keep the parser/config-resolution
* behavior in sync; the fallback chains INTENTIONALLY differ — this copy has a two-level
* fallback (consumer Prettier → SDK-bundled `import('prettier')` → unformatted) because it
* runs pre-install, while the generator copy has a single fallback (consumer Prettier →
* unformatted). Don't "fix" that asymmetry or you reintroduce the pre-install bug (W-23074938).
*
* @param content - The serialized file content to format.
* @param filePath - The file's path (drives parser selection + config resolution).
* @returns The Prettier-formatted content. Returns the content unchanged only if no Prettier
*   can be resolved at all; a genuine format/config error throws rather than silently shipping
*   unformatted output.
*/
async function formatWithProjectPrettier(content, filePath) {
	let prettier;
	try {
		prettier = createRequire(filePath)("prettier");
	} catch {
		try {
			prettier = (await import("prettier")).default;
		} catch {
			logger.warn("⚠️  Prettier could not be resolved; extension config.json will be written unformatted.");
			return content;
		}
	}
	try {
		const config = await prettier.resolveConfig(filePath, { editorconfig: true });
		return await prettier.format(content, {
			...config,
			filepath: filePath
		});
	} catch (error) {
		throw new Error(`Prettier formatting failed for ${path.basename(filePath)}: ${error.message}`);
	}
}
/**
* Process a file to trim extension-specific code based on markers.
* @param filePath - The file path to process
* @param extensions - The extension selections
*/
function processFile(filePath, extensions) {
	const source = fs.readFileSync(filePath, "utf-8");
	if (source.includes(FILE_MARKER)) {
		const markerLine = source.split("\n").find((line) => line.includes(FILE_MARKER));
		const extMatch = Object.keys(extensions).find((ext) => markerLine.includes(ext));
		if (!extMatch) logger.warn(`File ${filePath} is marked with ${markerLine} but it does not match any known extensions`);
		else if (extensions[extMatch] === false) {
			try {
				fs.unlinkSync(filePath);
				logger.debug(`Deleted file ${filePath}`);
			} catch (e) {
				const error = e;
				logger.error(`Error deleting file ${filePath}: ${error.message}`);
				throw e;
			}
			return;
		}
	}
	const extKeys = Object.keys(extensions);
	if (new RegExp(extKeys.join("|"), "g").test(source)) {
		const lines = source.split("\n");
		const newLines = [];
		const blockMarkers = [];
		let skippingBlock = false;
		let i = 0;
		while (i < lines.length) {
			const line = lines[i];
			if (line.includes(SINGLE_LINE_MARKER)) {
				const matchingExtension = Object.keys(extensions).find((extension) => line.includes(extension));
				if (matchingExtension && extensions[matchingExtension] === false) {
					i += 2;
					continue;
				}
			} else if (line.includes(BLOCK_MARKER_START)) {
				const matchingExtension = Object.keys(extensions).find((extension) => line.includes(extension));
				if (matchingExtension) {
					blockMarkers.push({
						extension: matchingExtension,
						line: i
					});
					skippingBlock = extensions[matchingExtension] === false;
				} else logger.warn(`Unknown marker found in ${filePath} at line ${i}: \n${line}`);
			} else if (line.includes(BLOCK_MARKER_END)) {
				if (Object.keys(extensions).find((extension) => line.includes(extension))) {
					const extension = Object.keys(extensions).find((p) => line.includes(p));
					if (blockMarkers.length === 0) throw new Error(`Block marker mismatch in ${filePath}, encountered end marker ${extension} without a matching start marker at line ${i}:\n${lines[i]}`);
					const startMarker = blockMarkers.pop();
					if (!extension || startMarker.extension !== extension) throw new Error(`Block marker mismatch in ${filePath}, expected end marker for ${startMarker.extension} but got ${extension} at line ${i}:\n${lines[i]}`);
					if (extensions[extension] === false) {
						skippingBlock = false;
						i++;
						continue;
					}
				}
			}
			if (!skippingBlock) newLines.push(line);
			i++;
		}
		if (blockMarkers.length > 0) throw new Error(`Unclosed end marker found in ${filePath}: ${blockMarkers[blockMarkers.length - 1].extension}`);
		const newSource = newLines.join("\n");
		if (newSource !== source) try {
			fs.writeFileSync(filePath, newSource);
			logger.debug(`Updated file ${filePath}`);
		} catch (e) {
			const error = e;
			logger.error(`Error updating file ${filePath}: ${error.message}`);
			throw e;
		}
	}
}
/**
* Delete extension folders for disabled extensions.
* @param projectRoot - The project root directory
* @param extensions - The extension selections
* @param extensionConfig - The extension configuration
*/
function deleteExtensionFolders(projectRoot, extensions, extensionConfig) {
	const extensionsDir = path.join(projectRoot, "src", "extensions");
	if (!fs.existsSync(extensionsDir)) return;
	const configuredExtensions = extensionConfig.extensions;
	Object.keys(extensions).filter((ext) => extensions[ext] === false).forEach((extKey) => {
		const extensionMeta = configuredExtensions[extKey];
		if (extensionMeta?.folder) {
			const extensionFolderPath = path.join(extensionsDir, extensionMeta.folder);
			if (fs.existsSync(extensionFolderPath)) try {
				fs.rmSync(extensionFolderPath, {
					recursive: true,
					force: true
				});
				logger.debug(`Deleted extension folder: ${extensionFolderPath}`);
			} catch (err) {
				const error = err;
				if (error.code === "EPERM") logger.error(`Permission denied - cannot delete ${extensionFolderPath}. You may need to run with sudo or check permissions.`);
				else logger.error(`Error deleting ${extensionFolderPath}: ${error.message}`);
			}
		}
	});
}

//#endregion
//#region src/extensibility/dependency-utils.ts
/**
* Resolve full transitive dependency chain in topological order (dependencies first).
* Example: resolveDependencies('BOPIS', config) → ['Store Locator', 'BOPIS']
*
* @param extensionKey - The extension key to resolve dependencies for
* @param config - The extension configuration
* @returns Array of extension keys in topological order (dependencies first, then the extension itself)
*/
function resolveDependencies(extensionKey, config) {
	const visited = /* @__PURE__ */ new Set();
	const result = [];
	function visit(key) {
		if (visited.has(key)) return;
		visited.add(key);
		const extension = config.extensions[key];
		if (!extension) return;
		const dependencies = extension.dependencies || [];
		for (const dep of dependencies) visit(dep);
		result.push(key);
	}
	visit(extensionKey);
	return result;
}
/**
* Reverse lookup: find immediate extensions that depend on this one.
* Example: getDependents('Store Locator', config) → ['BOPIS']
*
* @param extensionKey - The extension key to find dependents for
* @param config - The extension configuration
* @returns Array of extension keys that directly depend on this extension
*/
function getDependents(extensionKey, config) {
	const dependents = [];
	for (const [key, extension] of Object.entries(config.extensions)) if ((extension.dependencies || []).includes(extensionKey)) dependents.push(key);
	return dependents;
}
/**
* Resolve full transitive dependent chain in reverse topological order (dependents first).
* Example: resolveDependents('Store Locator', config) → ['BOPIS', 'Store Locator']
*
* @param extensionKey - The extension key to resolve dependents for
* @param config - The extension configuration
* @returns Array of extension keys in reverse topological order (dependents first, then the extension itself)
*/
function resolveDependents(extensionKey, config) {
	const visited = /* @__PURE__ */ new Set();
	const result = [];
	function visit(key) {
		if (visited.has(key)) return;
		visited.add(key);
		const dependents = getDependents(key, config);
		for (const dep of dependents) visit(dep);
		result.push(key);
	}
	visit(extensionKey);
	return result;
}
/**
* Validate that no circular dependencies exist in the configuration.
* Throws a descriptive error if a cycle is found.
*
* @param config - The extension configuration to validate
* @throws Error if a circular dependency is detected
*/
function validateNoCycles(config) {
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	function visit(key, path$1) {
		if (visited.has(key)) return;
		if (visiting.has(key)) {
			const cycleStart = path$1.indexOf(key);
			const cyclePath = [...path$1.slice(cycleStart), key];
			throw new Error(`Circular dependency detected: ${cyclePath.join(" -> ")}`);
		}
		visiting.add(key);
		path$1.push(key);
		const extension = config.extensions[key];
		if (extension) {
			const dependencies = extension.dependencies || [];
			for (const dep of dependencies) visit(dep, path$1);
		}
		path$1.pop();
		visiting.delete(key);
		visited.add(key);
	}
	for (const key of Object.keys(config.extensions)) visit(key, []);
}
/**
* Filter resolved dependencies to only those not yet installed.
* Returns dependencies in topological order (install order).
*
* @param extensionKey - The extension key to check dependencies for
* @param installedExtensions - Array of already installed extension keys
* @param config - The extension configuration
* @returns Array of missing extension keys in topological order (install order)
*/
function getMissingDependencies(extensionKey, installedExtensions, config) {
	const allDependencies = resolveDependencies(extensionKey, config);
	const installedSet = new Set(installedExtensions);
	return allDependencies.filter((key) => !installedSet.has(key));
}
/**
* Resolve dependencies for multiple extensions, merging and deduplicating the results.
* Returns all dependencies in topological order.
*
* @param extensionKeys - Array of extension keys to resolve dependencies for
* @param config - The extension configuration
* @returns Array of all extension keys in topological order (dependencies first)
*/
function resolveDependenciesForMultiple(extensionKeys, config) {
	const allDeps = /* @__PURE__ */ new Set();
	const result = [];
	for (const key of extensionKeys) {
		const deps = resolveDependencies(key, config);
		for (const dep of deps) if (!allDeps.has(dep)) {
			allDeps.add(dep);
			result.push(dep);
		}
	}
	return result;
}
/**
* Resolve dependents for multiple extensions, merging and deduplicating the results.
* Returns all dependents in reverse topological order (uninstall order).
*
* @param extensionKeys - Array of extension keys to resolve dependents for
* @param config - The extension configuration
* @returns Array of all extension keys in reverse topological order (dependents first)
*/
function resolveDependentsForMultiple(extensionKeys, config) {
	const allDeps = /* @__PURE__ */ new Set();
	const result = [];
	for (const key of extensionKeys) {
		const deps = resolveDependents(key, config);
		for (const dep of deps) if (!allDeps.has(dep)) {
			allDeps.add(dep);
			result.push(dep);
		}
	}
	return result;
}

//#endregion
export { trimExtensions as a, validateNoCycles as i, resolveDependenciesForMultiple as n, resolveDependentsForMultiple as r, getMissingDependencies as t };