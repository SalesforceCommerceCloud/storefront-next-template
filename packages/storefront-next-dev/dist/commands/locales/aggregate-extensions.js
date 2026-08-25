import { t as logger } from "../../logger.js";
import "../../logger2.js";
import { r as commonFlags } from "../../flags.js";
import { t as GENERATED_EXTENSION_DIRS } from "../../constants.js";
import { Command, Flags } from "@oclif/core";
import fs, { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdir, readdir, writeFile } from "fs/promises";

//#region src/i18n/aggregate-extension-locales.ts
/** Apache License 2.0 header text for generated files. Inlined to avoid path resolution issues in standalone projects. */
const APACHE_LICENSE_HEADER = [
	`Copyright ${(/* @__PURE__ */ new Date()).getFullYear()} Salesforce, Inc.`,
	"",
	"Licensed under the Apache License, Version 2.0 (the \"License\");",
	"you may not use this file except in compliance with the License.",
	"You may obtain a copy of the License at",
	"",
	"    http://www.apache.org/licenses/LICENSE-2.0",
	"",
	"Unless required by applicable law or agreed to in writing, software",
	"distributed under the License is distributed on an \"AS IS\" BASIS,",
	"WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
	"See the License for the specific language governing permissions and",
	"limitations under the License."
].join("\n");
function getDefaultDirs(projectDirectory) {
	const srcDir = join(projectDirectory, "src");
	return {
		SRC_DIR: srcDir,
		EXTENSIONS_DIR: join(srcDir, "extensions"),
		OUTPUT_DIR: join(srcDir, "extensions", "locales")
	};
}
/** Convert kebab-case to PascalCase (e.g. `store-locator` → `StoreLocator`). */
function toPascalCase(str) {
	return str.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}
/** Convert kebab-case to camelCase for variable names (e.g. `store-locator` → `storeLocator`). */
function toCamelCase(str) {
	const pascal = toPascalCase(str);
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
/** Scan main app and extension directories to find all available locale codes. */
async function discoverLocales(dirs) {
	const { SRC_DIR, EXTENSIONS_DIR } = dirs;
	const locales = /* @__PURE__ */ new Set();
	const mainLocalesPath = join(SRC_DIR, "locales");
	if (existsSync(mainLocalesPath)) try {
		const mainLocaleEntries = await readdir(mainLocalesPath, { withFileTypes: true });
		for (const entry of mainLocaleEntries) if (entry.isDirectory()) locales.add(entry.name);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	try {
		const extensions = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
		for (const extension of extensions) {
			if (!extension.isDirectory() || extension.name === GENERATED_EXTENSION_DIRS.locales || extension.name === GENERATED_EXTENSION_DIRS.config) continue;
			const localesPath = join(EXTENSIONS_DIR, extension.name, "locales");
			if (!existsSync(localesPath)) continue;
			const localeEntries = await readdir(localesPath, { withFileTypes: true });
			for (const localeEntry of localeEntries) if (localeEntry.isDirectory()) locales.add(localeEntry.name);
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return locales;
}
/** Find all extensions (NOT main app) that have a `translations.json` for the given locale. */
async function findExtensionsWithLocale(locale, extensionsDir, selectedExtensions) {
	const extensions = [];
	try {
		const extensionEntries = await readdir(extensionsDir, { withFileTypes: true });
		for (const entry of extensionEntries) {
			if (!entry.isDirectory() || entry.name === GENERATED_EXTENSION_DIRS.locales || entry.name === GENERATED_EXTENSION_DIRS.config) continue;
			if (selectedExtensions && selectedExtensions[entry.name] !== true) continue;
			if (existsSync(join(extensionsDir, entry.name, "locales", locale, "translations.json"))) extensions.push({
				name: entry.name,
				path: `@/extensions/${entry.name}/locales/${locale}/translations.json`
			});
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return extensions.sort((a, b) => a.name.localeCompare(b.name));
}
/** Generate the locale index file content that re-exports extension translations under `extPascalCase` namespaces. */
function generateLocaleFile(extensions, extensionKeys) {
	const header = `${`/**\n${APACHE_LICENSE_HEADER.split("\n").map((line) => line ? ` * ${line}` : " *").join("\n")}\n */`}

// NOTE: This file is auto-generated. Do not edit manually.
// Run 'pnpm locales:aggregate-extensions' to regenerate this file.

`;
	if (extensions.length === 0) return `${header}// No extension translations found for this locale\nexport default {};\n`;
	return `${header}${extensions.map((ext) => {
		const varName = `${toCamelCase(ext.name)}Translations`;
		return `${extensionKeys?.[ext.name] ? `// @sfdc-extension-line ${extensionKeys[ext.name]}\n` : ""}import ${varName} from '${ext.path}';`;
	}).join("\n")}

// Namespace is based on the following convention: extPascalCase, and it's the pascal case of the folder name (e.g. store-locator -> extStoreLocator)
export default {
${extensions.map((ext) => {
		const namespace = `ext${toPascalCase(ext.name)}`;
		const varName = `${toCamelCase(ext.name)}Translations`;
		return `${extensionKeys?.[ext.name] ? `    // @sfdc-extension-line ${extensionKeys[ext.name]}\n` : ""}    ${namespace}: ${varName},`;
	}).join("\n")}
};
`;
}
/**
* Generate aggregation files for extension translations only.
* Main app translations in `/src/locales/` are NOT aggregated — only per-extension `translations.json` files.
*/
async function aggregateExtensionLocales(options = {}) {
	const { projectDirectory = process.cwd(), silent = false, selectedExtensions, extensionKeys } = options;
	const dirs = options.dirs ?? getDefaultDirs(projectDirectory);
	const { OUTPUT_DIR, EXTENSIONS_DIR } = dirs;
	const log = (message, ...args) => {
		if (!silent) logger.debug(message, ...args);
	};
	try {
		log("🔍 Scanning for extension translation files...");
		const locales = await discoverLocales(dirs);
		if (locales.size === 0) {
			log("📝 No locales found in extensions. Nothing to generate.");
			return {
				generated: 0,
				locales: []
			};
		}
		log(`📝 Found ${locales.size} locale(s): ${Array.from(locales).join(", ")}`);
		await mkdir(OUTPUT_DIR, { recursive: true });
		const results = [];
		for (const locale of locales) {
			const extensions = await findExtensionsWithLocale(locale, EXTENSIONS_DIR, selectedExtensions);
			const content = generateLocaleFile(extensions, extensionKeys);
			const outputPath = join(OUTPUT_DIR, locale);
			await mkdir(outputPath, { recursive: true });
			const filePath = join(outputPath, "index.ts");
			await writeFile(filePath, content, "utf8");
			log(`✅ Generated: src/extensions/locales/${locale}/index.ts (${extensions.length} extension(s))`);
			results.push({
				locale,
				extensionCount: extensions.length,
				filePath
			});
		}
		log("✨ Extension locale generation complete!");
		return {
			generated: results.length,
			locales: results
		};
	} catch (error) {
		if (!silent) logger.error(`❌ Error generating extension locales: ${String(error)}`);
		throw error;
	}
}

//#endregion
//#region src/commands/locales/aggregate-extensions.ts
var AggregateExtensions = class AggregateExtensions extends Command {
	static description = "Aggregate extension translation files into per-locale barrel files";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> -d ./my-project",
		"<%= config.bin %> <%= command.id %> --silent"
	];
	static flags = {
		...commonFlags,
		silent: Flags.boolean({
			description: "Suppress output",
			default: false
		})
	};
	async run() {
		const { flags } = await this.parse(AggregateExtensions);
		const projectDirectory = flags["project-directory"];
		const configPath = join(projectDirectory, "src", "extensions", "config.json");
		const extensionConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")).extensions ?? {} : void 0;
		await aggregateExtensionLocales({
			projectDirectory,
			selectedExtensions: extensionConfig ? Object.fromEntries(Object.values(extensionConfig).filter((extension) => extension.folder).map((extension) => [extension.folder, true])) : void 0,
			extensionKeys: extensionConfig ? Object.fromEntries(Object.entries(extensionConfig).filter(([, extension]) => extension.folder).map(([key, extension]) => [extension.folder, key])) : void 0,
			silent: flags.silent
		});
	}
};

//#endregion
export { AggregateExtensions as default };