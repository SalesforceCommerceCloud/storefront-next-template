import path, { resolve } from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import { createRequire } from "module";
import path$1, { dirname, join, relative, resolve as resolve$1 } from "path";
import { fileURLToPath } from "url";
import { parse } from "@babel/parser";
import { isArrayPattern, isClassDeclaration, isExportSpecifier, isFunctionDeclaration, isIdentifier, isJSXAttribute, isJSXElement, isJSXFragment, isJSXIdentifier, isMemberExpression, isObjectPattern, isObjectProperty, isRestElement, isVariableDeclaration, jsxClosingElement, jsxClosingFragment, jsxElement, jsxFragment, jsxIdentifier, jsxOpeningElement, jsxOpeningFragment, jsxText } from "@babel/types";
import { generate } from "@babel/generator";
import traverseModule from "@babel/traverse";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { glob } from "glob";
import { Node, Project, ts } from "ts-morph";
import fs$1, { existsSync as existsSync$1, readFileSync as readFileSync$1 } from "node:fs";
import { deadCodeElimination, findReferencedIdentifiers } from "babel-dead-code-elimination";
import httpProxy from "http-proxy";
import { brotliDecompressSync, gunzipSync, inflateSync } from "zlib";
import { extractPrefixParamValues, stripPathPrefix } from "@salesforce/storefront-next-runtime/site-context";

//#region src/utils/logger.ts
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

//#endregion
//#region src/plugins/fixReactRouterManifestUrls.ts
function patchAssetsPaths(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) patchAssetsPaths(fullPath);
		else if (entry.isFile() && entry.name.endsWith(".js")) {
			const content = fs.readFileSync(fullPath, "utf-8");
			if (content.includes("\"/assets/") || content.includes("'/assets/")) {
				fs.writeFileSync(fullPath, content.replace(/["']\/assets\//g, "(window._BUNDLE_PATH || \"/\") + \"assets/"));
				logger.debug(`patched /assets/ references in ${fullPath}`);
			}
		}
	}
}
/**
* Plugin to transform React Router client manifest URLs to use dynamic bundle paths
*/
function fixReactRouterManifestUrlsPlugin() {
	let resolvedConfig;
	return {
		name: "storefront-next:fix-react-router-manifest-urls",
		enforce: "post",
		configResolved(config) {
			resolvedConfig = config;
		},
		closeBundle() {
			const clientBuildDir = resolvedConfig.environments.client.build.outDir;
			if (fs.existsSync(clientBuildDir)) patchAssetsPaths(clientBuildDir);
		}
	};
}

//#endregion
//#region src/utils/paths.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
/**
* Normalize a file path to use forward slashes.
* On Windows, Node APIs return backslash-separated paths, but ESM import
* specifiers and Vite module IDs require forward slashes.
*/
function toPosixPath(filePath) {
	return filePath.replace(/\\/g, "/");
}

//#endregion
//#region src/plugins/readableChunkFileNames.ts
/**
* Generates human-readable chunk file names for better debugging in production builds.
*
* Transforms Rollup's default hash-based chunk names into structured paths that reflect
* the original source location, making it easier to identify and debug specific chunks.
*
* @param chunkInfo - Rollup's pre-rendered chunk information containing module IDs and metadata
* @returns A formatted string pattern for the chunk filename with one of these formats:
*   - `assets/(folder1)-(folder2)-filename.[hash].js` for source files in /src/
*   - `assets/(package)-(pkg-name)-(subfolder)-filename.[hash].js` for node_modules
*   - `assets/(chunk)-[name].[hash].js` as fallback for chunks without identifiable paths
*
* @example
* // Source file: /src/components/ui/Button.tsx
* // Output: assets/(components)-(ui)-Button.[hash].js
*
* @example
* // Node module: /node_modules/@radix-ui/react-dialog/dist/index.js
* // Output: assets/(package)-(@radix-ui)-(react-dialog)-(dist)-index.[hash].js
*/
const readableChunkFileNames = (chunkInfo) => {
	const moduleIds = chunkInfo.moduleIds;
	const defaultName = "assets/(chunk)-[name].[hash].js";
	if (!moduleIds || moduleIds.length === 0) return defaultName;
	const lastModuleId = moduleIds[moduleIds.length - 1];
	const getFileName = (pathname) => {
		const posixPath = toPosixPath(pathname);
		return path$1.posix.parse(posixPath).base.split("?")[0].replace(/\.(tsx?|jsx?|mjs|js)$/, "");
	};
	const cleanPath = (pathname) => {
		return pathname?.split("?")[0];
	};
	const normalizedModuleId = toPosixPath(lastModuleId);
	if (normalizedModuleId.includes("/src/")) {
		const match = toPosixPath(cleanPath(lastModuleId)).match(/\/src\/(.+)$/);
		if (match) {
			const parts = match[1].split("/");
			const fileName = getFileName(parts[parts.length - 1]);
			return `assets/${parts.slice(0, -1).map((f) => `(${f})`).join("-")}-${fileName}.[hash].js`;
		}
	}
	if (normalizedModuleId.includes("/node_modules/")) {
		const parts = toPosixPath(cleanPath(lastModuleId)).split("/node_modules/");
		const pathParts = parts[parts.length - 1].split("/");
		let packageName;
		let remainingPath;
		if (pathParts[0].startsWith("@")) {
			packageName = `${pathParts[0]}-${pathParts[1]}`;
			remainingPath = pathParts.slice(2);
		} else {
			packageName = pathParts[0];
			remainingPath = pathParts.slice(1);
		}
		const fileName = getFileName(remainingPath[remainingPath.length - 1]);
		const folders = remainingPath.slice(0, -1);
		return `assets/${[
			"package",
			packageName,
			...folders
		].map((s) => `(${s})`).join("-")}-${fileName}.[hash].js`;
	}
	return defaultName;
};
/**
* Vite plugin that configures Rollup to use human-readable chunk file names in production builds.
*
* Applies the `readableChunkFileNames` naming strategy to both code-split chunks and entry files,
* making it easier to identify the source of specific chunks when debugging production builds.
*
* @returns A Vite plugin that configures chunk naming for the client build environment
*
* @example
* // In vite.config.ts
* export default defineConfig({
*   plugins: [readableChunkFileNamesPlugin()]
* })
*/
const readableChunkFileNamesPlugin = () => {
	return {
		name: "storefront-next:readable-chunk-file-names",
		apply: "build",
		config() {
			return { environments: { client: { build: { rollupOptions: { output: {
				chunkFileNames: readableChunkFileNames,
				entryFileNames: readableChunkFileNames
			} } } } } };
		}
	};
};

//#endregion
//#region src/mrt/utils.ts
const MRT_BUNDLE_TYPE_SSR = "ssr";
const MRT_STREAMING_ENTRY_FILE = "streamingHandler";
/**
* Gets the MRT entry file for the given mode
* @param mode - The mode to get the MRT entry file for
* @returns The MRT entry file for the given mode
*/
const getMrtEntryFile = (mode) => {
	return process.env.MRT_BUNDLE_TYPE !== MRT_BUNDLE_TYPE_SSR && mode === "production" ? MRT_STREAMING_ENTRY_FILE : MRT_BUNDLE_TYPE_SSR;
};

//#endregion
//#region src/plugins/managedRuntimeBundle.ts
const __dirname$1 = path$1.dirname(fileURLToPath(import.meta.url));
/**
* This is a Vite plugin specifically for building the Managed Runtime production bundle.
* This plugin relies on the @react-router/dev/vite plugin to work.
* This plugin creates the Managed Runtime production bundle from the build output of the @react-router/dev/vite plugin.
*
* @returns {Plugin} A Vite plugin for building the Managed Runtime production react-router bundle
*/
const managedRuntimeBundlePlugin = () => {
	let resolvedConfig;
	let buildDirectory;
	/**
	* Creates the Managed Runtime production bundle assets
	* - ssr.mjs or streamingHandler.mjs
	* - loader.js
	* - package.json
	*
	* @returns {Promise<void>}
	*/
	const createManagedRuntimeBundleAssets = async () => {
		const loaderPath = path$1.resolve(buildDirectory, "loader.js");
		const mrtEntryFile = `${getMrtEntryFile(resolvedConfig?.mode)}.mjs`;
		const mrtEntryPath = path$1.resolve(buildDirectory, mrtEntryFile);
		await fs.ensureDir(buildDirectory);
		await fs.outputFile(loaderPath, "// This file is intentionally empty");
		const prebuiltMrtEntryPath = path$1.resolve(__dirname$1, `./mrt/${mrtEntryFile}`);
		await fs.copy(prebuiltMrtEntryPath, mrtEntryPath);
		const prebuiltMrtEntryMapPath = `${prebuiltMrtEntryPath}.map`;
		if (await fs.pathExists(prebuiltMrtEntryMapPath)) await fs.copy(prebuiltMrtEntryMapPath, `${mrtEntryPath}.map`);
		const mrtDir = path$1.resolve(__dirname$1, "./mrt");
		if (await fs.pathExists(mrtDir)) {
			const files = await fs.readdir(mrtDir);
			for (const file of files) if (file.startsWith("sfnext-server-") && file.endsWith(".mjs")) {
				await fs.copy(path$1.join(mrtDir, file), path$1.resolve(buildDirectory, file));
				const mapFile = `${file}.map`;
				if (files.includes(mapFile)) await fs.copy(path$1.join(mrtDir, mapFile), path$1.resolve(buildDirectory, mapFile));
			}
		}
		const packageJsonPath = path$1.resolve(resolvedConfig.root, "package.json");
		const buildPackageJsonPath = path$1.resolve(buildDirectory, "package.json");
		const packageJson = await fs.readJson(packageJsonPath);
		delete packageJson.type;
		await fs.writeJson(buildPackageJsonPath, packageJson, { spaces: 2 });
	};
	return {
		name: "storefront-next:managed-runtime-bundle",
		apply: "build",
		config({ mode }) {
			return {
				build: { rollupOptions: { onLog(level, log, defaultHandler) {
					if (log.code === "SOURCEMAP_ERROR" && log.message.includes("resolve original location")) return;
					defaultHandler(level, log);
				} } },
				environments: { ssr: {
					resolve: { noExternal: true },
					build: { rollupOptions: { output: { interop: "auto" } } }
				} },
				experimental: { renderBuiltUrl(filename, { type, hostType }) {
					if (mode !== "preview" && (type === "asset" || type === "public")) {
						if (hostType === "css") return { relative: true };
						return { runtime: `(typeof window !== 'undefined' ? window._BUNDLE_PATH : ((process.env.MRT_ENV_BASE_PATH??'')+'/mobify/bundle/'+(process.env.BUNDLE_ID??'local')+'/client/')) + ${JSON.stringify(filename)}` };
					}
				} }
			};
		},
		configResolved(config) {
			resolvedConfig = config;
			buildDirectory = config.__reactRouterPluginContext.reactRouterConfig.buildDirectory;
		},
		buildApp: {
			order: "post",
			handler: async () => {
				await createManagedRuntimeBundleAssets();
			}
		}
	};
};

//#endregion
//#region src/plugins/patchReactRouter.ts
const VIRTUAL_MODULE_ID = "\0patched-react-router";
const MODULE_TO_PATCH = "react-router";
/**
* This plugin intercepts imports of 'react-router' and provides patched versions
* of specific components (like Scripts) with custom logic.
*
* @returns {Plugin} A Vite plugin for patching react-router components
*/
const patchReactRouterPlugin = () => {
	let isTestMode = false;
	let isDevMode = false;
	return {
		name: "storefront-next:patch-react-router",
		enforce: "pre",
		config(_config, { mode }) {
			isTestMode = mode === "test";
			isDevMode = mode === "development";
		},
		configEnvironment(name) {
			if (isTestMode) return;
			if (isDevMode) return;
			if (name === "ssr") return { resolve: { noExternal: ["react-router"] } };
		},
		resolveId(id, importer) {
			if (isTestMode || isDevMode) return null;
			if (id === MODULE_TO_PATCH) {
				if (importer === VIRTUAL_MODULE_ID || importer?.includes("storefront-next-dev")) return null;
				return VIRTUAL_MODULE_ID;
			}
			return null;
		},
		load(id) {
			if (isTestMode || isDevMode) return null;
			if (id === VIRTUAL_MODULE_ID) return `
                    export * from 'react-router';
                    export { Scripts } from '@salesforce/storefront-next-dev/react-router/Scripts';
                `;
			return null;
		}
	};
};

//#endregion
//#region src/extensibility/target-utils.ts
const traverse$1 = traverseModule.default || traverseModule;
const TARGET_COMPONENT_TAG = "UITarget";
const TARGET_PROVIDERS_TAG = "UITargetProviders";
const TARGET_ID_ATTRIBUTE = "targetId";
const TARGET_COMPONENT_JSX_RE = /* @__PURE__ */ new RegExp(`<${TARGET_COMPONENT_TAG}[\\s/>]`);
/**
* Find and replace the TargetProviders tags with the corresponding context providers
* @param element - the AST element to replace
* @param contextProviders - the context providers to replace
*/
function findAndReplaceProviders(element, contextProviders) {
	if (isJSXIdentifier(element.node.openingElement.name, { name: TARGET_PROVIDERS_TAG })) if (contextProviders.length > 0) {
		let nested = element.node.children;
		for (let i = contextProviders.length - 1; i >= 0; i--) {
			const componentName = contextProviders[i].componentName;
			nested = [jsxElement(jsxOpeningElement(jsxIdentifier(componentName), [], false), jsxClosingElement(jsxIdentifier(componentName)), nested, false)];
		}
		element.replaceWithMultiple(nested);
	} else element.replaceWith(jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), element.node.children));
}
/**
* Find and replace the target component with the replacement code
* @param componentName - the name of the component to replace
* @param element - the AST element as the replacement candidate
* @param targetRegistry - the target registry
* @returns the targetId that was replaced, or null if no replacement was found
*/
function findAndReplaceComponent(componentName, element, targetRegistry) {
	let targetIdReplaced = null;
	if (isJSXIdentifier(element.node.openingElement.name, { name: componentName })) {
		let replaced = false;
		if (Array.isArray(element.node.openingElement.attributes)) {
			const attr = element.node.openingElement.attributes.find((a) => isJSXAttribute(a) && isJSXIdentifier(a.name, { name: TARGET_ID_ATTRIBUTE }));
			const targetId = attr && isJSXAttribute(attr) && attr.value && "value" in attr.value ? attr.value.value : void 0;
			if (targetId == null) throw new Error(`UITarget must contain a targetId attribute`);
			if (targetRegistry[targetId] && targetRegistry[targetId].length > 0) {
				if (element.node.children.length > 0) {
					let nestedChildren = element.node.children;
					for (let i = targetRegistry[targetId].length - 1; i >= 0; i--) {
						const targetComponent = targetRegistry[targetId][i];
						nestedChildren = [jsxElement(jsxOpeningElement(jsxIdentifier(targetComponent.componentName), [], false), jsxClosingElement(jsxIdentifier(targetComponent.componentName)), nestedChildren, false)];
					}
					element.replaceWith(nestedChildren[0]);
				} else {
					const components = targetRegistry[targetId].map((targetComponent) => {
						return jsxElement(jsxOpeningElement(jsxIdentifier(targetComponent.componentName), [], true), null, [], true);
					});
					if (components.length > 1) element.replaceWith(jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), components));
					else element.replaceWith(components[0]);
				}
				targetIdReplaced = targetId;
				replaced = true;
			}
		}
		if (!replaced) if (element.node.children && element.node.children.length > 0) element.replaceWith(jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), element.node.children));
		else element.replaceWith(jsxFragment(jsxOpeningFragment(), jsxClosingFragment(), []));
	}
	return targetIdReplaced;
}
/**
* Run a replacement pass on the AST
* @param ast - the AST to traverse
* @param tagName - the name of the tag to replace
* @param targetRegistry - the target registry
* @param contextProviders - the context providers to replace
* @returns a set of targetIds that were replaced
*/
function runReplacementPass(ast, tagName, targetRegistry = null, contextProviders = null) {
	const targetIdsReplaced = /* @__PURE__ */ new Set();
	const applyReplacement = (pathToReplace) => {
		if (targetRegistry) {
			const replacedId = findAndReplaceComponent(tagName, pathToReplace, targetRegistry);
			if (replacedId) targetIdsReplaced.add(replacedId);
		} else if (contextProviders) findAndReplaceProviders(pathToReplace, contextProviders);
	};
	traverse$1(ast, {
		VariableDeclaration(nodePath) {
			const declarationPaths = nodePath.get("declarations");
			const declarationsArray = Array.isArray(declarationPaths) ? declarationPaths : [declarationPaths];
			for (const declarationPath of declarationsArray) {
				const initPath = declarationPath.get("init");
				if (initPath && isJSXElement(initPath.node)) {
					const content = generate(initPath.node).code;
					if ((/* @__PURE__ */ new RegExp(`<(${tagName})(\\s|\\/|>)`)).test(content)) {
						applyReplacement(initPath);
						initPath.traverse({ JSXElement(inner) {
							applyReplacement(inner);
						} });
					}
				}
			}
		},
		ReturnStatement(nodePath) {
			const arg = nodePath.node.argument;
			if (!isJSXElement(arg) && !isJSXFragment(arg)) return;
			nodePath.traverse({ JSXElement(inner) {
				applyReplacement(inner);
			} });
		}
	});
	return targetIdsReplaced;
}
/**
* Build the import statements for the target components
* @param targetIds - the targetIds that were replaced
* @param targetRegistry - the target registry
* @returns the import statements
*/
function buildReplacementImportStatements(targetIds, targetRegistry) {
	const importStatements = /* @__PURE__ */ new Set();
	for (const targetId of targetIds) {
		const targetComponents = targetRegistry[targetId];
		for (const targetComponent of targetComponents) importStatements.add(`import ${targetComponent.componentName} from '@/${targetComponent.path.replace(".tsx", "")}';`);
	}
	return Array.from(importStatements).join("\n");
}
function transformTargets(code, targetRegistry, contextProviders) {
	if (!TARGET_COMPONENT_JSX_RE.test(code) && !code.includes(TARGET_PROVIDERS_TAG)) return null;
	const ast = parse(code, {
		sourceType: "module",
		plugins: [
			"typescript",
			"jsx",
			"decorators-legacy"
		]
	});
	if (TARGET_COMPONENT_JSX_RE.test(code)) {
		const replacementImportStatements = buildReplacementImportStatements(runReplacementPass(ast, TARGET_COMPONENT_TAG, targetRegistry, null), targetRegistry);
		traverse$1(ast, { ImportDeclaration(nodePath) {
			if (nodePath.node.source.value === "@/targets/ui-target") nodePath.replaceWith(jsxText(replacementImportStatements));
		} });
	}
	if (code.includes(TARGET_PROVIDERS_TAG)) {
		const importStatements = /* @__PURE__ */ new Set();
		for (const contextProvider of contextProviders) importStatements.add(`import ${contextProvider.componentName} from '@/${contextProvider.path.replace(".tsx", "")}';`);
		const replacementImportStatements = Array.from(importStatements).join("\n");
		traverse$1(ast, { ImportDeclaration(nodePath) {
			if (nodePath.node.source.value === "@/targets/ui-target-providers") nodePath.replaceWith(jsxText(replacementImportStatements));
		} });
		runReplacementPass(ast, TARGET_PROVIDERS_TAG, null, contextProviders);
	}
	return generate(ast).code;
}
/**
* Build the target registry from the extension directories
* @param rootDir - the root directory of the project
* @param sourceDir - the source directory of the project
* @returns the target registry
*/
function buildTargetRegistry(rootDir, options = {}) {
	const componentRegistry = {};
	const contextProviders = [];
	const actionHookRegistry = {};
	const extensionDirPath = path$1.join(rootDir, "extensions");
	const extensionDirs = fs.readdirSync(extensionDirPath, { withFileTypes: true });
	const getNamespaceAndComponentName = (dir, filePath) => {
		const namespace = dir.name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
		return {
			namespace,
			componentName: `${namespace}_${(filePath.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/, ""))?.split(/[-.]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("")}`
		};
	};
	const TARGET_CONFIG_FILENAME = "target-config.json";
	for (const dir of extensionDirs) if (dir.isDirectory()) {
		const configPath = path$1.join(extensionDirPath, dir.name, TARGET_CONFIG_FILENAME);
		if (fs.existsSync(configPath)) {
			const extensionConfig = fs.readJsonSync(configPath);
			if (options.isProduction && extensionConfig.devOnly === true) continue;
			if (extensionConfig && extensionConfig.components) for (const component of extensionConfig.components) {
				if (component.enabled === false) continue;
				const { targetId, path: componentPath, order = 0 } = component;
				if (targetId && componentPath) {
					if (!componentRegistry[targetId]) componentRegistry[targetId] = [];
					const { namespace, componentName } = getNamespaceAndComponentName(dir, componentPath);
					componentRegistry[targetId].push({
						targetId,
						path: componentPath,
						order,
						namespace,
						componentName
					});
				}
			}
			if (extensionConfig && extensionConfig.contextProviders) for (const contextProvider of extensionConfig.contextProviders) {
				const { path: providerPath, order = 0 } = contextProvider;
				if (providerPath) {
					const { namespace, componentName } = getNamespaceAndComponentName(dir, providerPath);
					contextProviders.push({
						path: providerPath,
						namespace,
						componentName,
						order
					});
				}
			}
			if (extensionConfig && extensionConfig.actionHooks) for (const hook of extensionConfig.actionHooks) {
				const { hookId, handler, order = 0 } = hook;
				if (hookId && handler) {
					if (!actionHookRegistry[hookId]) actionHookRegistry[hookId] = [];
					const { namespace, componentName: handlerName } = getNamespaceAndComponentName(dir, handler);
					actionHookRegistry[hookId].push({
						hookId,
						path: handler,
						order,
						namespace,
						handlerName
					});
				}
			}
		}
	}
	for (const targetId in componentRegistry) componentRegistry[targetId].sort((a, b) => a.order - b.order);
	contextProviders.sort((a, b) => a.order - b.order);
	for (const hookId in actionHookRegistry) actionHookRegistry[hookId].sort((a, b) => a.order - b.order);
	for (const targetId in componentRegistry) {
		const entries = componentRegistry[targetId];
		const seen = /* @__PURE__ */ new Map();
		for (const entry of entries) {
			const existing = seen.get(entry.order);
			if (existing) logger.warn(`[storefront-next] UITarget "${targetId}": components "${existing}" and "${entry.componentName}" have the same order (${entry.order}). Execution order between them is non-deterministic. Assign distinct order values.`);
			seen.set(entry.order, entry.componentName);
		}
	}
	for (const hookId in actionHookRegistry) {
		const entries = actionHookRegistry[hookId];
		const seen = /* @__PURE__ */ new Map();
		for (const entry of entries) {
			const existing = seen.get(entry.order);
			if (existing) logger.warn(`[storefront-next] Action hook "${hookId}": handlers "${existing}" and "${entry.handlerName}" have the same order (${entry.order}). Execution order between them is non-deterministic. Assign distinct order values.`);
			seen.set(entry.order, entry.handlerName);
		}
	}
	return {
		componentRegistry,
		contextProviders,
		actionHookRegistry
	};
}
const TARGET_ID_PATTERN = /<UITarget[\s][^>]*targetId=["']([^"']+)["']/g;
/**
* Recursively collect all UITarget IDs declared in template source files.
* Excludes extension directories so only "real" UITarget placements are counted.
*/
function collectUITargetIds(sourceDir) {
	const result = /* @__PURE__ */ new Set();
	function walk(dir) {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path$1.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "extensions") continue;
				walk(fullPath);
			} else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.(tsx?|jsx?)$/.test(entry.name)) {
				const content = fs.readFileSync(fullPath, "utf-8");
				TARGET_ID_PATTERN.lastIndex = 0;
				let match;
				while ((match = TARGET_ID_PATTERN.exec(content)) !== null) result.add(match[1]);
			}
		}
	}
	walk(sourceDir);
	return result;
}
/**
* Validate that all targetIds in the component registry correspond to
* UITarget declarations in the template source. Returns orphaned entries.
*/
function validateTargetRegistry(componentRegistry, declaredTargetIds) {
	const orphaned = [];
	for (const targetId in componentRegistry) if (!declaredTargetIds.has(targetId)) for (const entry of componentRegistry[targetId]) orphaned.push({
		targetId,
		extension: entry.namespace,
		componentPath: entry.path
	});
	return orphaned;
}

//#endregion
//#region src/plugins/transformTargets.ts
function transformTargetPlaceholderPlugin() {
	let componentRegistry;
	let contextProviders;
	let sourceDir;
	let isProduction = false;
	return {
		name: "storefront-next:transform-target-placeholder",
		enforce: "pre",
		configResolved(config) {
			sourceDir = config.resolve.alias.find((alias) => alias.find === "@")?.replacement || path$1.resolve(__dirname, "./src");
			isProduction = config.mode === "production";
		},
		buildStart() {
			({componentRegistry, contextProviders} = buildTargetRegistry(sourceDir, { isProduction }));
			const declaredTargetIds = collectUITargetIds(sourceDir);
			const orphaned = validateTargetRegistry(componentRegistry, declaredTargetIds);
			if (orphaned.length > 0) {
				const lines = orphaned.map((o) => `  • "${o.targetId}" (extension: ${o.extension}, component: ${o.componentPath})`);
				throw new Error(`[storefront-next] ${orphaned.length} extension component(s) target UITarget IDs that do not exist in the template:\n${lines.join("\n")}\n\nEither add a <UITarget targetId="..."> to the template or remove/disable the component in target-config.json.`);
			}
		},
		transform(code, id) {
			try {
				const transformedCode = transformTargets(code, componentRegistry, contextProviders);
				if (transformedCode) return {
					code: transformedCode,
					map: null
				};
				return null;
			} catch (err) {
				logger.error(`UITarget replace ERROR in ${id}: ${err instanceof Error ? err.stack : String(err)}`);
				throw err;
			}
		}
	};
}

//#endregion
//#region src/plugins/actionHooks.ts
const ACTION_HOOKS_VIRTUAL_ID = "virtual:action-hooks";
const ACTION_HOOKS_RESOLVED_ID = `\0${ACTION_HOOKS_VIRTUAL_ID}`;
/**
* Generate the virtual module code for the action hook registry.
*
* The generated module exports a `hookRegistry` map of hookId → handler[],
* and a `runHook` function that executes registered handlers in order.
*/
function generateActionHooksModule(actionHookRegistry) {
	const imports = [];
	const registryEntries = [];
	for (const [hookId, handlers] of Object.entries(actionHookRegistry)) {
		const handlerNames = [];
		for (const handler of handlers) {
			const importPath = `@/${handler.path.replace(/\.(ts|tsx|js|jsx)$/, "")}`;
			imports.push(`import ${handler.handlerName} from '${importPath}';`);
			handlerNames.push(handler.handlerName);
		}
		registryEntries.push(`  '${hookId}': [${handlerNames.join(", ")}]`);
	}
	return `${imports.join("\n")}

const HANDLER_TIMEOUT_MS = 5000;

const hookRegistry = {
${registryEntries.join(",\n")}
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(\`Action hook handler timed out after \${ms}ms: \${label}\`)), ms)
    ),
  ]);
}

export async function runHook(hookId, context, options = {}) {
  const handlers = hookRegistry[hookId];
  if (!handlers || handlers.length === 0) {
    return context;
  }
  let currentContext = context;
  for (const handler of handlers) {
    try {
      const result = await withTimeout(handler(currentContext), HANDLER_TIMEOUT_MS, hookId);
      currentContext = result ?? currentContext;
    } catch (error) {
      if (error && error.name === 'ActionHookError') {
        throw error;
      }
      if (options.blocking) {
        throw error;
      }
      console.error(\`[action-hooks] handler for "\${hookId}" failed, skipping to next handler\`, error);
    }
  }
  return currentContext;
}
`;
}
/**
* Vite plugin that resolves `virtual:action-hooks` to a generated module
* mapping hookIds to their registered handlers.
*/
function actionHooksPlugin() {
	let actionHookRegistry;
	let sourceDir;
	let isProduction = false;
	return {
		name: "storefront-next:action-hooks",
		enforce: "pre",
		configResolved(config) {
			sourceDir = config.resolve.alias.find((alias) => alias.find === "@")?.replacement || path$1.resolve(__dirname, "./src");
			isProduction = config.mode === "production";
		},
		buildStart() {
			actionHookRegistry = buildTargetRegistry(sourceDir, { isProduction }).actionHookRegistry;
		},
		resolveId(id) {
			if (id === ACTION_HOOKS_VIRTUAL_ID) return ACTION_HOOKS_RESOLVED_ID;
		},
		load(id) {
			if (id === ACTION_HOOKS_RESOLVED_ID) return generateActionHooksModule(actionHookRegistry);
		}
	};
}

//#endregion
//#region src/plugins/watchConfigFiles.ts
const watchConfigFilesPlugin = () => {
	let viteConfig;
	return {
		name: "storefront-next:watch-config-files",
		configResolved(config) {
			viteConfig = config;
		},
		configureServer(server) {
			const aliases = viteConfig.resolve.alias;
			const root = Object.values(aliases).find((alias) => alias.find === "@")?.replacement || "src";
			const glob$1 = path$1.posix.join(root, "extensions", "**", "target-config.json");
			server.watcher.add(glob$1);
			const onChange = (file) => {
				if (file.endsWith("target-config.json")) {
					logger.debug(`🔁 target-config.json changed: ${file}`);
					server.restart();
				}
			};
			server.watcher.on("add", onChange);
			server.watcher.on("change", onChange);
			server.watcher.on("unlink", onChange);
		}
	};
};

//#endregion
//#region src/plugins/staticRegistry.ts
const DEFAULT_COMPONENT_GROUP = "storefrontnext_base";
/**
* Extracts component ID and group from @Component decorator using ts-morph AST parsing
*/
function extractComponentInfo(decorator) {
	const callExpression = decorator.getCallExpression();
	if (!callExpression) return null;
	const args = callExpression.getArguments();
	if (args.length === 0) return null;
	const firstArg = args[0];
	let baseComponentId;
	if (Node.isStringLiteral(firstArg)) baseComponentId = firstArg.getLiteralValue();
	else if (Node.isNoSubstitutionTemplateLiteral(firstArg)) baseComponentId = firstArg.getText().slice(1, -1);
	else if (Node.isTemplateExpression(firstArg)) throw new Error(`@Component id must be a simple string literal or backtick string without interpolation. Found: ${firstArg.getText()}`);
	else return null;
	let group = DEFAULT_COMPONENT_GROUP;
	if (args.length > 1) {
		const secondArg = args[1];
		if (Node.isObjectLiteralExpression(secondArg)) {
			const groupProperty = secondArg.getProperty("group");
			if (groupProperty && Node.isPropertyAssignment(groupProperty)) {
				const initializer = groupProperty.getInitializer();
				if (initializer && Node.isStringLiteral(initializer)) group = initializer.getLiteralValue();
			}
		}
	}
	return {
		id: `${group}.${baseComponentId}`,
		group
	};
}
/**
* Checks if a source file has a specific named export using ts-morph AST parsing
*/
function hasNamedExport(sourceFile, exportName) {
	if (sourceFile.getFunctions().filter((func) => func.hasExportKeyword() && func.getName() === exportName).length > 0) return true;
	const variableStatements = sourceFile.getVariableStatements().filter((stmt) => stmt.hasExportKeyword());
	for (const stmt of variableStatements) {
		const declarations = stmt.getDeclarations();
		for (const decl of declarations) if (decl.getName() === exportName) return true;
	}
	const exportDeclarations = sourceFile.getExportDeclarations();
	for (const exportDecl of exportDeclarations) {
		const namedExports = exportDecl.getNamedExports();
		for (const namedExport of namedExports) {
			const localName = namedExport.getName();
			const aliasName = namedExport.getAliasNode()?.getText();
			if (localName === exportName || aliasName === exportName) return true;
		}
	}
	return false;
}
/**
* Checks if a source file has a fallback export (including default exports with 'fallback' in name)
*/
function hasFallbackExport(sourceFile) {
	if (hasNamedExport(sourceFile, "fallback")) return true;
	const functions = sourceFile.getFunctions().filter((func) => func.hasExportKeyword() && func.hasDefaultKeyword());
	for (const func of functions) {
		const name = func.getName();
		if (name && name.toLowerCase().includes("fallback")) return true;
	}
	return false;
}
/**
* Scans all files in the component directory for @Component decorators and extracts metadata using ts-morph
*/
async function scanComponents(project, projectRoot, componentPath, registryPath) {
	const componentFiles = await glob(`${componentPath}/**/*.{ts,tsx}`, {
		cwd: projectRoot,
		absolute: true
	});
	logger.debug(`🔍 Scanning ${componentFiles.length} files in ${componentPath}...`);
	const components = [];
	const registryDir = dirname(resolve$1(projectRoot, registryPath));
	for (const filePath of componentFiles) try {
		const content = readFileSync(filePath, "utf-8");
		const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
		const classes = sourceFile.getClasses();
		for (const classDeclaration of classes) {
			const decorators = classDeclaration.getDecorators();
			for (const decorator of decorators) if (decorator.getName() === "Component") {
				const componentInfo = extractComponentInfo(decorator);
				if (componentInfo) {
					let relativePath = relative(registryDir, filePath).replace(/\\/g, "/").replace(/\.(ts|tsx)$/, "");
					if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;
					const hasLoaderExport = hasNamedExport(sourceFile, "loader");
					const hasClientLoaderExport = hasNamedExport(sourceFile, "clientLoader");
					const hasFallback = hasFallbackExport(sourceFile);
					components.push({
						id: componentInfo.id,
						filePath,
						relativePath,
						hasLoader: hasLoaderExport,
						hasClientLoader: hasClientLoaderExport,
						hasFallback
					});
					const exports = [];
					if (hasLoaderExport) exports.push("loader");
					if (hasClientLoaderExport) exports.push("clientLoader");
					if (hasFallback) exports.push("fallback");
					const exportsText = exports.length > 0 ? ` (with ${exports.join(", ")})` : "";
					logger.debug(`  ✅ Found component: ${componentInfo.id} → ${relativePath}${exportsText}`);
				}
			}
		}
	} catch (error) {
		logger.warn(`⚠️  Could not process ${filePath}: ${error.message}`);
	}
	return components;
}
/**
* Generates the initializeRegistry function code
*/
function generateRegistryCode(components, registryIdentifier = "registry") {
	const sorted = [...components].sort((a, b) => a.id.localeCompare(b.id) || a.relativePath.localeCompare(b.relativePath));
	if (sorted.length === 0) return `
/**
 * Initialize the static component registry.
 * This function is auto-generated by the staticRegistry Vite plugin.
 *
 * DO NOT EDIT THIS FUNCTION MANUALLY - it will be overwritten on next build.
 */
export function initializeRegistry(targetRegistry = ${registryIdentifier}): void {
    // No components found with @Component decorators
}
`;
	const registrations = sorted.map(({ id, relativePath, hasLoader, hasClientLoader, hasFallback }) => {
		if (hasLoader || hasClientLoader || hasFallback) {
			const metadata = [];
			if (hasLoader) metadata.push(`loader: 'loader'`);
			if (hasClientLoader) metadata.push(`clientLoader: 'clientLoader'`);
			if (hasFallback) metadata.push(`fallback: 'fallback'`);
			return `    targetRegistry.registerImporter('${id}', () => import('${relativePath}'), { ${metadata.join(", ")} });`;
		} else return `    targetRegistry.registerImporter('${id}', () => import('${relativePath}'));`;
	}).join("\n");
	return `
/**
 * Initialize the static component registry.
 * This function is auto-generated by the staticRegistry Vite plugin.
 *
 * DO NOT EDIT THIS FUNCTION MANUALLY - it will be overwritten on next build.
 *
 * Components registered: ${sorted.map((c) => c.id).join(", ")}
 */
export function initializeRegistry(targetRegistry = ${registryIdentifier}): void {
${registrations}
}
`;
}
/**
* Formats registry file content with the project's own Prettier so the written file
* matches what the project's formatter would produce.
*
* Without this, a standalone `prettier --write` (pre-commit hook, format-on-save) rewrites
* the generated file on every commit: the generator emits one `registerImporter` call per
* line and cannot anticipate an arbitrary `printWidth`, so Prettier re-wraps long lines and
* the regenerate -> format -> regenerate loop never settles.
*
* Prettier is resolved from the registry file's own location — i.e. the consuming project's
* `node_modules`, not the SDK bundle (which keeps `node_modules` external). It is the project's
* Prettier version and config whose output must be matched. Returns the content unchanged when
* Prettier is absent or fails, so registry generation never breaks a build over formatting.
*/
let warnedNoPrettier = false;
async function formatWithProjectPrettier(content, registryFilePath) {
	try {
		const prettier = createRequire(registryFilePath)("prettier");
		const config = await prettier.resolveConfig(registryFilePath, { editorconfig: true });
		return await prettier.format(content, {
			...config,
			filepath: registryFilePath
		});
	} catch (error) {
		if (error.code === "MODULE_NOT_FOUND") {
			if (!warnedNoPrettier) {
				logger.warn("⚠️  Prettier not found in the project; static registry will be written unformatted.");
				warnedNoPrettier = true;
			}
		} else logger.warn(`⚠️  Skipping Prettier formatting for registry file: ${error.message}`);
		return content;
	}
}
/**
* Updates the registry.ts file with the generated code
*/
async function updateRegistryFile(registryFilePath, generatedCode) {
	let existingContent;
	if (!existsSync(registryFilePath)) {
		logger.debug("📝 Creating new registry file...");
		const basicRegistryContent = `import { ComponentRegistry } from '@/lib/component-registry';

// Create the component registry instance
export const registry = new ComponentRegistry();

// STATIC_REGISTRY_START
// Generated content will be inserted here by the static registry plugin
// STATIC_REGISTRY_END
`;
		writeFileSync(registryFilePath, basicRegistryContent, "utf-8");
		existingContent = basicRegistryContent;
	} else try {
		existingContent = readFileSync(registryFilePath, "utf-8");
	} catch (error) {
		throw new Error(`Failed to read registry file: ${error.message}`);
	}
	const startMarker = "// STATIC_REGISTRY_START";
	const endMarker = "// STATIC_REGISTRY_END";
	const startIndex = existingContent.indexOf(startMarker);
	const endIndex = existingContent.indexOf(endMarker);
	if (startIndex === -1 || endIndex === -1) throw new Error(`Registry file ${registryFilePath} is missing static registry markers. Please add "${startMarker}" and "${endMarker}" markers to define the generated content area.`);
	const updatedContent = await formatWithProjectPrettier(`${existingContent.slice(0, startIndex + 24)}\n${generatedCode}\n${existingContent.slice(endIndex)}`, registryFilePath);
	if (updatedContent === existingContent) {
		logger.debug(`⏭️  Registry unchanged, skipping write: ${registryFilePath}`);
		return false;
	}
	try {
		writeFileSync(registryFilePath, updatedContent, "utf-8");
		logger.debug(`💾 Updated registry file: ${registryFilePath}`);
		return true;
	} catch (error) {
		throw new Error(`Failed to write registry file: ${error.message}`);
	}
}
/**
* Vite plugin that generates static component registry based on @Component decorators.
*
* This plugin scans component files for @Component decorators and automatically generates
* a static registry function that pre-registers all components with their import paths.
* This eliminates the need for manual component registration and provides build-time
* optimization for component discovery.
*
* @param config - Configuration options for the plugin
* @returns A Vite plugin that generates static component registrations
*
* @example
* // In vite.config.ts
* export default defineConfig({
*   plugins: [
*     staticRegistryPlugin({
*       componentPath: 'src/components',
*       registryPath: 'src/lib/registry.ts',
*       verbose: true
*     })
*   ]
* })
*/
const staticRegistryPlugin = (config = {}) => {
	const { componentPath = "src/components", registryPath = "src/lib/static-registry.ts", registryIdentifier = "registry", failOnError = true } = config;
	let projectRoot;
	const runRegistryGeneration = async () => {
		logger.debug("🚀 Starting static registry generation...");
		const components = await scanComponents(new Project({ compilerOptions: {
			target: ts.ScriptTarget.Latest,
			module: ts.ModuleKind.ESNext,
			jsx: ts.JsxEmit.ReactJSX,
			allowJs: true,
			skipLibCheck: true,
			noEmit: true
		} }), projectRoot, componentPath, registryPath);
		logger.debug(`📦 Found ${components.length} components with @Component decorators`);
		const generatedCode = generateRegistryCode(components, registryIdentifier);
		const registryFilePath = resolve$1(projectRoot, registryPath);
		const changed = await updateRegistryFile(registryFilePath, generatedCode);
		logger.debug("✅ Static registry generation complete!");
		return {
			registryFilePath,
			changed
		};
	};
	return {
		name: "storefrontnext:static-registry",
		configResolved(resolvedConfig) {
			projectRoot = resolvedConfig.root;
		},
		async buildStart() {
			try {
				await runRegistryGeneration();
			} catch (error) {
				logger.error(`❌ Static registry generation failed: ${error.message}`);
				if (failOnError) throw error;
				logger.warn("⚠️  Continuing build without static registry...");
			}
		},
		async handleHotUpdate({ file, server }) {
			const normalizedComponentPath = componentPath.replace(/\\/g, "/");
			const normalizedFile = file.replace(/\\/g, "/");
			if (normalizedFile.includes(`/${normalizedComponentPath}/`) && (normalizedFile.endsWith(".ts") || normalizedFile.endsWith(".tsx"))) {
				logger.debug(`🔄 Component file changed: ${file}, regenerating registry...`);
				try {
					const { registryFilePath, changed } = await runRegistryGeneration();
					if (changed) {
						const registryModule = server.moduleGraph.getModuleById(registryFilePath);
						if (registryModule) await server.reloadModule(registryModule);
						logger.debug("✅ Registry regenerated successfully!");
					} else logger.debug("⏭️  Registry unchanged, skipping reload");
				} catch (error) {
					logger.error(`❌ Failed to regenerate registry: ${error.message}`);
				}
				return [];
			}
		}
	};
};

//#endregion
//#region src/server/ts-import.ts
/**
* Parse TypeScript paths from tsconfig.json and convert to jiti alias format.
*
* @param tsconfigPath - Path to tsconfig.json
* @param projectDirectory - Project root directory for resolving relative paths
* @returns Record of alias mappings for jiti
*
* @example
* // tsconfig.json: { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
* // Returns: { "@/": "/absolute/path/to/src/" }
*/
function parseTsconfigPaths(tsconfigPath, projectDirectory) {
	const alias = {};
	if (!existsSync$1(tsconfigPath)) return alias;
	try {
		const tsconfigContent = readFileSync$1(tsconfigPath, "utf-8");
		const tsconfig = JSON.parse(tsconfigContent);
		const paths = tsconfig.compilerOptions?.paths;
		const baseUrl = tsconfig.compilerOptions?.baseUrl || ".";
		if (paths) {
			for (const [key, values] of Object.entries(paths)) if (values && values.length > 0) {
				const aliasKey = key.replace(/\/\*$/, "/");
				alias[aliasKey] = resolve(projectDirectory, baseUrl, values[0].replace(/\/\*$/, "/").replace(/^\.\//, ""));
			}
		}
	} catch {}
	const sortedAlias = {};
	Object.keys(alias).sort((a, b) => b.length - a.length).forEach((key) => {
		sortedAlias[key] = alias[key];
	});
	return sortedAlias;
}
/**
* Import a TypeScript file using jiti with proper path alias resolution.
* This is a cross-platform alternative to tsx that works on Windows.
*
* @param filePath - Absolute path to the TypeScript file to import
* @param options - Import options including project directory
* @returns The imported module
*/
async function importTypescript(filePath, options) {
	const { projectDirectory, tsconfigPath = resolve(projectDirectory, "tsconfig.json") } = options;
	const { createJiti } = await import("jiti");
	const alias = parseTsconfigPaths(tsconfigPath, projectDirectory);
	return createJiti(import.meta.url, {
		fsCache: false,
		interopDefault: true,
		alias
	}).import(filePath);
}

//#endregion
//#region src/plugins/configLoader.ts
/**
* Load the engagement config from config.server.ts
*/
async function loadEngagementConfig(projectRoot, configPath) {
	const absoluteConfigPath = resolve$1(projectRoot, configPath);
	try {
		const config = (await importTypescript(absoluteConfigPath, { projectDirectory: projectRoot })).default;
		logger.debug(`📄 Loaded config from ${configPath}`);
		const engagement = config?.app?.engagement;
		if (!engagement) {
			logger.debug(`⚠️  No engagement config found in ${configPath}`);
			return null;
		}
		return engagement;
	} catch (error) {
		logger.warn(`⚠️  Could not load config from ${configPath}: ${error.message}`);
		return null;
	}
}

//#endregion
//#region src/plugins/eventInstrumentationValidator.ts
/**
* Extract all trackEvent calls from source files and return the event types found
*/
async function scanForInstrumentedEvents(projectRoot, scanPaths) {
	const instrumentedEvents = /* @__PURE__ */ new Set();
	const trackEventPattern = /trackEvent\s*\([^,]+,[^,]+,[^,]+,\s*['"]([^'"]+)['"]/g;
	const sendViewPagePattern = /sendViewPageEvent\s*\(/g;
	const createEventPattern = /createEvent\s*\(\s*['"]([^'"]+)['"]/g;
	for (const scanPath of scanPaths) {
		const files = await glob(join(resolve$1(projectRoot, scanPath), "**/*.{ts,tsx}"), { ignore: [
			"**/*.test.ts",
			"**/*.test.tsx",
			"**/*.spec.ts",
			"**/*.spec.tsx",
			"**/node_modules/**"
		] });
		logger.debug(`📂 Scanning ${files.length} files in ${scanPath}...`);
		for (const file of files) try {
			const content = readFileSync(file, "utf-8");
			let match;
			while ((match = trackEventPattern.exec(content)) !== null) {
				const eventType = match[1];
				instrumentedEvents.add(eventType);
				logger.debug(`  ✓ Found trackEvent('${eventType}') in ${file}`);
			}
			if (sendViewPagePattern.test(content)) {
				instrumentedEvents.add("view_page");
				logger.debug(`  ✓ Found sendViewPageEvent() in ${file}`);
			}
			while ((match = createEventPattern.exec(content)) !== null) {
				const eventType = match[1];
				instrumentedEvents.add(eventType);
				logger.debug(`  ✓ Found createEvent('${eventType}') in ${file}`);
			}
			trackEventPattern.lastIndex = 0;
			sendViewPagePattern.lastIndex = 0;
			createEventPattern.lastIndex = 0;
		} catch (error) {
			logger.warn(`⚠️  Could not read ${file}: ${error.message}`);
		}
	}
	return instrumentedEvents;
}
/**
* Extract enabled event toggles per adapter
* Dynamically iterates over all keys in eventToggles - supports custom event types
*/
function extractEnabledEvents(engagement) {
	const adapterEvents = /* @__PURE__ */ new Map();
	if (!engagement.adapters) return adapterEvents;
	for (const [adapterName, adapterConfig] of Object.entries(engagement.adapters)) {
		if (!adapterConfig.enabled) continue;
		const enabledEvents = /* @__PURE__ */ new Set();
		if (adapterConfig.eventToggles) {
			for (const [eventType, isEnabled] of Object.entries(adapterConfig.eventToggles)) if (isEnabled === true) enabledEvents.add(eventType);
		}
		if (enabledEvents.size > 0) adapterEvents.set(adapterName, enabledEvents);
	}
	return adapterEvents;
}
/**
* Vite plugin that validates event instrumentation at build time.
*
* This plugin scans source files for trackEvent() calls and validates that
* all enabled event toggles in config.server.ts have corresponding instrumentation.
*
* @param config - Configuration options for the plugin
* @returns A Vite plugin that validates event instrumentation
*
* @example
* // In vite.config.ts
* export default defineConfig({
*   plugins: [
*     eventInstrumentationValidatorPlugin({
*       configPath: 'config.server.ts',
*       scanPaths: ['src'],
*       verbose: true
*     })
*   ]
* })
*/
const eventInstrumentationValidatorPlugin = (config = {}) => {
	const { configPath = "config.server.ts", scanPaths = ["src"], failOnMissing = false } = config;
	let resolvedConfig;
	return {
		name: "storefrontnext:event-instrumentation-validator",
		apply: "build",
		configResolved(viteConfig) {
			resolvedConfig = viteConfig;
		},
		async buildStart() {
			const projectRoot = resolvedConfig.root;
			logger.debug("🔍 Validating event instrumentation...");
			const engagement = await loadEngagementConfig(projectRoot, configPath);
			if (!engagement) {
				logger.debug("ℹ️  Skipping validation - no engagement config found");
				return;
			}
			const adapterEvents = extractEnabledEvents(engagement);
			if (adapterEvents.size === 0) {
				logger.debug("ℹ️  No enabled adapters with event toggles found");
				return;
			}
			const instrumentedEvents = await scanForInstrumentedEvents(projectRoot, scanPaths);
			logger.debug(`🔎 Found ${instrumentedEvents.size} instrumented event types: ${[...instrumentedEvents].join(", ")}`);
			const missingInstrumentation = [];
			for (const [adapterName, enabledEvents] of adapterEvents) for (const eventType of enabledEvents) if (!instrumentedEvents.has(eventType)) missingInstrumentation.push({
				adapter: adapterName,
				event: eventType
			});
			if (missingInstrumentation.length === 0) {
				logger.debug("✅ All enabled events are instrumented");
				return;
			}
			for (const { adapter, event } of missingInstrumentation) logger.warn(`⚠️  ${adapter}.${event} is enabled but '${event}' is never instrumented`);
			if (failOnMissing) throw new Error(`[event-instrumentation] ${missingInstrumentation.length} event(s) are enabled but not instrumented. Either add instrumentation or disable the event toggles in config.server.ts.`);
		}
	};
};

//#endregion
//#region src/plugins/buildMiddlewareRegistry.ts
/** Source filename for the middleware registry (project source). */
const MIDDLEWARE_REGISTRY_SOURCE_FILE = "middleware-registry.ts";
/** Subdirectory under build output where the compiled registry is written (must match server/index.ts expectations). */
const SERVER_OUT_SUBDIR = "server";
/**
* Vite plugin that builds the middleware registry file for production.
*
* This plugin reads the template's middleware registry from the app's server directory
* (e.g. `src/server/middleware-registry.ts` when appDirectory is `./src`) and compiles it
* into the build output's server directory so the production server (Managed Runtime)
* can load the custom Express middlewares.
*
* Compilation uses tsdown (single TypeScript file → ESM) instead of a full Vite build.
* Paths are derived from the React Router plugin context (appDirectory, buildDirectory)
* when available; there are no env vars for these paths in this package.
*
* If the middleware registry file does not exist, the plugin silently skips the build step.
*
* @returns {Plugin} A Vite plugin that compiles the middleware registry for production
*
* @example
* // In vite.config.ts
* export default defineConfig({
*   plugins: [
*     buildMiddlewareRegistryPlugin()
*   ]
* })
*/
const buildMiddlewareRegistryPlugin = () => {
	let resolvedConfig;
	let buildDirectory;
	/** App source directory (e.g. 'src' or './src') from React Router config. */
	let appDirectory;
	return {
		name: "storefront-next:build-middleware-registry",
		apply: "build",
		configResolved(config) {
			resolvedConfig = config;
			const rr = config.__reactRouterPluginContext?.reactRouterConfig ?? {};
			buildDirectory = rr.buildDirectory ?? resolve$1(config.root, "build");
			appDirectory = rr.appDirectory ?? "src";
		},
		buildApp: {
			order: "post",
			handler: async () => {
				const projectRoot = resolvedConfig.root;
				const middlewareRegistryPath = resolve$1(projectRoot, appDirectory, SERVER_OUT_SUBDIR, MIDDLEWARE_REGISTRY_SOURCE_FILE);
				if (!existsSync(middlewareRegistryPath)) return;
				const { build } = await import("tsdown");
				const serverOutDir = resolve$1(projectRoot, buildDirectory, SERVER_OUT_SUBDIR);
				await build({
					cwd: projectRoot,
					entry: { [MIDDLEWARE_REGISTRY_SOURCE_FILE.replace(/\.ts$/, "")]: middlewareRegistryPath },
					outDir: serverOutDir,
					format: ["esm"],
					platform: "node",
					outExtensions: () => ({
						js: ".mjs",
						dts: ".d.ts"
					}),
					dts: false,
					clean: false,
					hash: false,
					noExternal: [/.*/],
					external: [/^node:/]
				});
			}
		}
	};
};

//#endregion
//#region src/plugins/platformEntry.ts
/**
* File extensions to search when detecting ejected entry files.
* Matches React Router's `entryExts` in its findEntry function.
*/
const ENTRY_EXTENSIONS = [
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".mts"
];
/**
* Query parameter appended to imports of ejected entry files within the
* generated composition code. This creates a distinct module ID so Vite
* treats it as a separate module from the one we intercept in `load`,
* breaking what would otherwise be a circular import.
*
* Vite natively handles query parameters on file imports — it strips the
* query for filesystem access but keeps it in the module ID for deduplication.
*/
const PASSTHROUGH_QUERY = "?platform-passthrough";
/**
* Finds a user-ejected entry file in the app directory.
* Returns the absolute path if found, undefined otherwise.
*/
function findUserEntry(appDirectory, basename) {
	for (const ext of ENTRY_EXTENSIONS) {
		const filePath = path.resolve(appDirectory, basename + ext);
		if (fs$1.existsSync(filePath)) return filePath;
	}
}
/**
* Generates the virtual module code for the composed server entry.
*
* The generated module imports the app's entry (user-ejected or SDK default),
* passes it through composeServerEntry(), and re-exports all ServerEntryModule
* fields. This ensures platform features are always applied.
*/
function generateServerEntryCode(appEntryImportPath) {
	const importPath = JSON.stringify(toPosixPath(appEntryImportPath));
	return `
import * as _app from ${importPath};
import { composeServerEntry } from '@salesforce/storefront-next-dev/entry/server';

const _composed = composeServerEntry(_app);

// Forward all named exports from the app entry so that any future
// React Router exports are passed through without requiring a plugin update.
// Explicit exports below take precedence over star re-exports per ESM spec.
export * from ${importPath};

// Override with composed versions for exports the platform layer enhances.
export default _composed.default;
export const handleDataRequest = _composed.handleDataRequest;
export const handleError = _composed.handleError;
export const instrumentations = _composed.instrumentations;
export const streamTimeout = _composed.streamTimeout;
`.trim();
}
/**
* Generates the virtual module code for the composed client entry.
*
* Imports the platform client setup as a side-effect (runs before the app entry),
* then re-exports everything from the app's client entry.
*/
function generateClientEntryCode(appEntryImportPath) {
	return `
import '@salesforce/storefront-next-dev/entry/client';
export * from ${JSON.stringify(toPosixPath(appEntryImportPath))};
`.trim();
}
/**
* Vite plugin that composes platform-level features into React Router entry files.
*
* This plugin uses the `load` hook to replace entry file contents with generated
* composition code, while preserving the original file path as the module ID.
* This is critical because React Router's post-build manifest lookup uses the
* original entry file paths to find built chunks — changing the module ID (via
* `resolveId`) would break that lookup.
*
* The plugin supports two modes:
* - **Non-ejected:** No entry files in the app directory. The generated code
*   imports SDK default entries from `@salesforce/storefront-next-dev/entry/defaults/`.
* - **Ejected:** Customer has created their own entry file(s). The generated code
*   imports the customer's file (with a `?platform-passthrough` query to avoid
*   circular imports) and wraps it with the platform layer.
*
* In both cases, the platform composition layer is always present. New platform
* features ship via `npm update` by modifying the composition functions, without
* changes to the plugin or customer code.
*/
function platformEntryPlugin() {
	let isTestMode = false;
	let serverEntryFilePath;
	let clientEntryFilePath;
	let appDirectory;
	let userServerEntryPath;
	let userClientEntryPath;
	return {
		name: "storefront-next:platform-entry",
		enforce: "pre",
		config(_config, { mode }) {
			isTestMode = mode === "test";
		},
		configResolved(config) {
			if (isTestMode) return;
			const ctx = config.__reactRouterPluginContext;
			if (!ctx) return;
			appDirectory = ctx.reactRouterConfig.appDirectory;
			serverEntryFilePath = ctx.entryServerFilePath;
			clientEntryFilePath = ctx.entryClientFilePath;
			userServerEntryPath = findUserEntry(appDirectory, "entry.server");
			userClientEntryPath = findUserEntry(appDirectory, "entry.client");
		},
		load(id) {
			if (isTestMode || !serverEntryFilePath || !clientEntryFilePath || !appDirectory) return null;
			if (id.includes(PASSTHROUGH_QUERY)) return null;
			const idWithoutQuery = id.split("?")[0];
			if (path.normalize(idWithoutQuery) === path.normalize(serverEntryFilePath)) return generateServerEntryCode(userServerEntryPath ? userServerEntryPath + PASSTHROUGH_QUERY : serverEntryFilePath + PASSTHROUGH_QUERY);
			if (path.normalize(idWithoutQuery) === path.normalize(clientEntryFilePath)) return generateClientEntryCode(userClientEntryPath ? userClientEntryPath + PASSTHROUGH_QUERY : clientEntryFilePath + PASSTHROUGH_QUERY);
			return null;
		},
		configureServer(server) {
			if (isTestMode || !appDirectory) return;
			const appDir = appDirectory;
			const watcher = server.watcher;
			const checkEntryChange = (filePath) => {
				const relative$1 = path.relative(appDir, filePath);
				const basename = path.basename(relative$1, path.extname(relative$1));
				if (path.dirname(relative$1) !== "." || basename !== "entry.server" && basename !== "entry.client") return;
				const ext = path.extname(relative$1);
				if (!ENTRY_EXTENSIONS.includes(ext)) return;
				const nowHasServer = findUserEntry(appDir, "entry.server") !== void 0;
				const nowHasClient = findUserEntry(appDir, "entry.client") !== void 0;
				if (nowHasServer !== (userServerEntryPath !== void 0) || nowHasClient !== (userClientEntryPath !== void 0)) server.restart();
			};
			watcher.on("add", checkEntryChange);
			watcher.on("unlink", checkEntryChange);
		}
	};
}

//#endregion
//#region src/plugins/workspace.ts
/**
* Vite plugin that automatically configures workspace-specific settings when
* SCAPI_PROXY_HOST is set. This includes:
* - Disabling DIS (Dynamic Imaging Service) via PUBLIC__app__images__enableDis
* - Adding dev server proxy rules for image paths (/dw/image, /on/demandware.static)
* - Allowing all hosts for the dev server (workspace proxies use dynamic hostnames)
*
* Environment variables:
* - `SCAPI_PROXY_HOST` — (Required) Base URL of the SCAPI proxy in workspace environments.
*    Enables workspace mode when set. Used as the proxy target for SCAPI requests and,
*    if JWEB_TARGET is not set, for static asset/image paths.
*    Example: `http://scw:25010`
* - `JWEB_TARGET` — (Optional) Separate proxy target for JWeb static asset paths
*    (`/dw/image`, `/on/demandware.static`). Falls back to SCAPI_PROXY_HOST if not set.
*    Example: `http://jweb:8080`
* - `PUBLIC__app__images__enableDis` — (Auto-set) Set to `'false'` when SCAPI_PROXY_HOST
*    is present, unless already explicitly configured. Controls whether the template
*    uses DIS for image format conversion and responsive srcsets.
*
* In workspace dev mode, this plugin also configures `optimizeDeps.entries` to scan all
* source files upfront. Without this, Vite discovers deps lazily per-route and invalidates
* the SSR module cache mid-session, leaving React in a partially-initialized state:
*   TypeError: Cannot read properties of null (reading 'useContext'/'useMemo')
*/
const workspacePlugin = () => {
	return {
		name: "storefront-next-workspace",
		config(_, { mode }) {
			const scapiProxyHost = process.env.SCAPI_PROXY_HOST;
			if (!scapiProxyHost) return;
			process.env.PUBLIC__app__images__enableDis ??= "false";
			if (mode !== "development") return;
			const jwebTarget = process.env.JWEB_TARGET;
			return {
				server: {
					allowedHosts: true,
					proxy: Object.fromEntries(["/dw/image", "/on/demandware.static"].map((path$2) => [path$2, {
						target: jwebTarget || scapiProxyHost,
						changeOrigin: true,
						secure: false
					}]))
				},
				optimizeDeps: { entries: [
					"./src/**/*.{ts,tsx}",
					"!./src/**/*.{test,spec}.{ts,tsx}",
					"!./src/**/*.stories.{ts,tsx}",
					"!./src/**/*-snapshot.tsx",
					"!./src/**/*.d.ts"
				] }
			};
		}
	};
};

//#endregion
//#region src/plugins/componentLoaders.ts
const traverse = traverseModule.default || traverseModule;
const generate$1 = generate.default || generate;
/**
* Names of exports to strip per environment.
*
* - `loader` is server-only → strip from the **client** build
* - `clientLoader` is client-only → strip from the **server** build
*/
const STRIP_FROM_CLIENT = ["loader"];
const STRIP_FROM_SERVER = ["clientLoader"];
/**
* Determines which export names should be stripped for a given Vite environment.
*/
function getExportsToStrip(environmentName) {
	if (environmentName === "client") return STRIP_FROM_CLIENT;
	if (environmentName === "ssr") return STRIP_FROM_SERVER;
	return [];
}
/**
* Returns `true` when the source code contains at least one of the given export names as a quick pre-check before
* running the full AST transform.
*/
function hasExportCandidate(code, names) {
	return names.some((name) => code.includes(name));
}
/**
* Checks whether the AST contains at least one class declaration decorated with `@Component(…)`.
*/
function hasComponentDecorator(ast) {
	let found = false;
	traverse(ast, { ClassDeclaration(path$2) {
		const decorators = path$2.node.decorators;
		if (!decorators) return;
		for (const decorator of decorators) if (decorator.expression.type === "CallExpression" && isIdentifier(decorator.expression.callee) && decorator.expression.callee.name === "Component") {
			found = true;
			path$2.stop();
			return;
		}
	} });
	return found;
}
/**
* Strips the specified named exports from the given source code using a
* Babel AST transform.
*
* The transform handles the following patterns:
*
* 1. `export const loader = …;`
* 2. `export function loader(…) {…}`
* 3. `export class Loader {…}`
* 4. `export { loader }` / `export { foo as loader }`
* 5. `export { loader } from './loaders'`
*
* Destructured exports (`export const { loader } = …` or
* `export const [loader] = …`) cannot be safely removed and will
* throw an error if encountered (matching React Router behaviour).
*
* After removing an export, the transform also:
* - Removes top-level property assignments to the stripped export
*   (e.g. `clientLoader.hydrate = true`)
* - Removes any import declarations that become unused as a result
*
* @see {@link https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/vite/remove-exports.ts React Router remove-exports}
* @returns The transformed source code, or `null` if nothing was changed.
*/
function stripExports(code, exportsToStrip, preParsedAst) {
	const ast = preParsedAst ?? parse(code, {
		sourceType: "module",
		plugins: [
			"typescript",
			"jsx",
			"decorators"
		]
	});
	let changed = false;
	const previouslyReferencedIdentifiers = findReferencedIdentifiers(ast);
	const removedExportLocalNames = /* @__PURE__ */ new Set();
	traverse(ast, { ExportNamedDeclaration(path$2) {
		const { declaration, specifiers } = path$2.node;
		if (declaration && isVariableDeclaration(declaration)) {
			const remaining = declaration.declarations.filter((decl) => {
				if (isIdentifier(decl.id) && exportsToStrip.includes(decl.id.name)) {
					removedExportLocalNames.add(decl.id.name);
					return false;
				}
				if (isArrayPattern(decl.id) || isObjectPattern(decl.id)) validateDestructuredExports(decl.id, exportsToStrip);
				return true;
			});
			if (remaining.length < declaration.declarations.length) {
				changed = true;
				if (remaining.length === 0) {
					removeLeadingEslintDisableComment(path$2);
					path$2.remove();
				} else declaration.declarations = remaining;
			}
			return;
		}
		if (declaration && isFunctionDeclaration(declaration)) {
			if (declaration.id && exportsToStrip.includes(declaration.id.name)) {
				changed = true;
				removedExportLocalNames.add(declaration.id.name);
				removeLeadingEslintDisableComment(path$2);
				path$2.remove();
				return;
			}
		}
		if (declaration && isClassDeclaration(declaration)) {
			if (declaration.id && exportsToStrip.includes(declaration.id.name)) {
				changed = true;
				removedExportLocalNames.add(declaration.id.name);
				removeLeadingEslintDisableComment(path$2);
				path$2.remove();
				return;
			}
		}
		if (specifiers.length > 0) {
			const remaining = specifiers.filter((spec) => {
				if (isExportSpecifier(spec)) {
					const exportedName = isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value;
					if (exportsToStrip.includes(exportedName)) {
						removedExportLocalNames.add(spec.local.name);
						return false;
					}
				}
				return true;
			});
			if (remaining.length < specifiers.length) {
				changed = true;
				if (remaining.length === 0) {
					removeLeadingEslintDisableComment(path$2);
					path$2.remove();
				} else path$2.node.specifiers = remaining;
			}
		}
	} });
	if (changed) traverse(ast, { ExpressionStatement(path$2) {
		if (!path$2.parentPath?.isProgram()) return;
		if (path$2.node.expression.type === "AssignmentExpression") {
			const left = path$2.node.expression.left;
			if (isMemberExpression(left) && isIdentifier(left.object) && (exportsToStrip.includes(left.object.name) || removedExportLocalNames.has(left.object.name))) {
				removeLeadingEslintDisableComment(path$2);
				path$2.remove();
			}
		}
	} });
	if (changed) deadCodeElimination(ast, previouslyReferencedIdentifiers);
	if (!changed) return null;
	return generate$1(ast, { retainLines: true }, code).code;
}
/**
* Validates that no destructured export patterns contain names that should
* be stripped. Destructured exports cannot be safely removed, so we throw
* an error instead (matching React Router behaviour).
*/
function validateDestructuredExports(id, exportsToStrip) {
	if (isArrayPattern(id)) for (const element of id.elements) {
		if (!element) continue;
		if (isIdentifier(element) && exportsToStrip.includes(element.name)) throw new Error(`Cannot remove destructured export "${element.name}"`);
		if (isRestElement(element) && isIdentifier(element.argument) && exportsToStrip.includes(element.argument.name)) throw new Error(`Cannot remove destructured export "${element.argument.name}"`);
		if (isArrayPattern(element) || isObjectPattern(element)) validateDestructuredExports(element, exportsToStrip);
	}
	if (isObjectPattern(id)) for (const property of id.properties) {
		if (!property) continue;
		if (isObjectProperty(property) && isIdentifier(property.key)) {
			if (isIdentifier(property.value) && exportsToStrip.includes(property.value.name)) throw new Error(`Cannot remove destructured export "${property.value.name}"`);
			if (isArrayPattern(property.value) || isObjectPattern(property.value)) validateDestructuredExports(property.value, exportsToStrip);
		}
		if (isRestElement(property) && isIdentifier(property.argument) && exportsToStrip.includes(property.argument.name)) throw new Error(`Cannot remove destructured export "${property.argument.name}"`);
	}
}
/**
* Removes a leading `// eslint-disable-next-line …` comment that sits on
* the line immediately before the given path.
*/
function removeLeadingEslintDisableComment(path$2) {
	const leadingComments = path$2.node.leadingComments;
	if (!leadingComments || leadingComments.length === 0) return;
	const last = leadingComments[leadingComments.length - 1];
	if (last.type === "CommentLine" && last.value.includes("eslint-disable")) leadingComments.pop();
}
/**
* Vite plugin that strips environment-specific loader exports from
* component modules.
*
* Following the React Router convention:
* - `export const loader` → server-only, stripped from the **client** bundle
* - `export const clientLoader` → client-only, stripped from the **server** bundle
*
* This ensures that server-only code (e.g. API calls, database access) is
* never included in the client bundle, and vice versa.
*
* The plugin only processes files that:
* 1. Are under the configured `componentPath` directory
* 2. Contain a `@Component` decorator (i.e. are Page Designer components)
* 3. Are not test or story files
*/
function componentLoadersPlugin(config = {}) {
	const { componentPath = "src/components" } = config;
	let isTestMode = false;
	return {
		name: "storefrontnext:component-loaders",
		enforce: "pre",
		configResolved(resolvedConfig) {
			isTestMode = resolvedConfig.mode === "test";
		},
		transform(code, id) {
			if (isTestMode) return null;
			if (!id.includes(componentPath)) return null;
			if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
			if (/\.(test|spec|stories)\.[jt]sx?$/.test(id)) return null;
			const environmentName = this.environment?.name;
			if (!environmentName) return null;
			const exportsToStrip = getExportsToStrip(environmentName);
			if (exportsToStrip.length === 0) return null;
			if (!hasExportCandidate(code, exportsToStrip)) return null;
			const ast = parse(code, {
				sourceType: "module",
				plugins: [
					"typescript",
					"jsx",
					"decorators"
				]
			});
			if (!hasComponentDecorator(ast)) return null;
			const transformed = stripExports(code, exportsToStrip, ast);
			if (!transformed) return null;
			return {
				code: transformed,
				map: null
			};
		}
	};
}

//#endregion
//#region src/plugins/ssrSourcemapFix.ts
const INLINE_SOURCEMAP_PREFIX = "//# sourceMappingURL=data:application/json;base64,";
/**
* Vite plugin that fixes SSR sourcemap `sources` to use full module paths
* instead of bare basenames.
*
* **Problem:** When the React Router `v8_viteEnvironmentApi` future flag is
* enabled, SSR modules are evaluated by Vite's Environment API module runner.
* Vite's `ssrTransform` generates inline sourcemaps with
* `sources: [path.basename(url)]` (e.g., `"search.tsx"` or `"index.tsx"`).
* V8's debugger cannot resolve bare basenames back to files on disk, so
* Chrome DevTools (via `--inspect`) displays the wrong source file content
* when pausing at breakpoints — even for files with unique names.
*
* **Why `fetchModule`:** A Vite transform plugin cannot fix this because
* `ssrTransform` runs *after* the plugin transform pipeline and overwrites
* `map.sources` with `[path.basename(url)]`. The only viable interception
* point is `fetchModule` — the public API method on `DevEnvironment` that
* returns the final transformed code (with inline sourcemaps already embedded)
* to the module runner.
*
* **Removable:** If Vite updates `ssrTransform` to use full paths instead of
* `path.basename()`, this plugin can be deleted with no other changes.
*
* Only active in development mode (`configureServer` does not run in build).
*/
function ssrSourcemapFixPlugin() {
	return {
		name: "storefront-next:ssr-sourcemap-fix",
		configureServer(server) {
			const ssrEnv = server.environments.ssr;
			if (!ssrEnv) return;
			const originalFetchModule = ssrEnv.fetchModule.bind(ssrEnv);
			ssrEnv.fetchModule = async (id, importer, options) => {
				const result = await originalFetchModule(id, importer, options);
				if (!result || "externalize" in result || "cache" in result || !("code" in result)) return result;
				const smIndex = result.code.lastIndexOf(INLINE_SOURCEMAP_PREFIX);
				if (smIndex === -1) return result;
				try {
					const base64Start = smIndex + 50;
					const base64End = result.code.indexOf("\n", base64Start);
					const base64Data = base64End === -1 ? result.code.slice(base64Start).trim() : result.code.slice(base64Start, base64End).trim();
					const mapJson = JSON.parse(Buffer.from(base64Data, "base64").toString("utf-8"));
					if (!mapJson.sources || !Array.isArray(mapJson.sources)) return result;
					const fileId = result.file || result.id;
					if (!fileId) return result;
					if (mapJson.sources.length !== 1) return result;
					const source = mapJson.sources[0];
					if (!source || source.includes("/")) return result;
					mapJson.sources = [fileId];
					const patchedBase64 = Buffer.from(JSON.stringify(mapJson)).toString("base64");
					result.code = result.code.slice(0, base64Start) + patchedBase64 + (base64End === -1 ? "" : result.code.slice(base64End));
				} catch {}
				return result;
			};
		}
	};
}

//#endregion
//#region src/plugins/i18n.ts
/**
* Vite plugin that splits locale translation files into per-language chunks.
*
* Wraps any existing `manualChunks` configuration so that locale modules are
* assigned to `locales-{lang}` chunks (e.g., `locales-en-GB`) while all other
* module IDs are delegated to the user's original `manualChunks` function or object.
*
* @param config - Optional configuration for custom locale patterns
* @returns A Vite plugin that configures locale-based code splitting
*/
function i18nPlugin(config) {
	const pattern = config?.localePattern ?? /\/src\/locales\/([^/]+)\//;
	return {
		name: "storefront-next:i18n",
		apply: "build",
		config(viteConfig) {
			const output = viteConfig.build?.rollupOptions?.output;
			if (Array.isArray(output)) return;
			const existingManualChunks = output?.manualChunks;
			return { build: { rollupOptions: { output: { manualChunks(id, meta) {
				const localeMatch = id.match(pattern);
				if (localeMatch) return `locales-${localeMatch[1]}`;
				if (typeof existingManualChunks === "function") return existingManualChunks.call(this, id, meta);
				if (existingManualChunks && typeof existingManualChunks === "object") {
					for (const [name, ids] of Object.entries(existingManualChunks)) if (ids.includes(id)) return name;
				}
			} } } } };
		}
	};
}

//#endregion
//#region src/plugins/baseConfig.ts
/**
* Vite plugin contributing the baseline Vite config required by the
* Storefront Next framework. These settings are uniform across every
* customer project and are not intended to be customized.
*
* Additional framework-level Vite defaults should be added here rather
* than in the template's vite.config.ts or in a new single-purpose plugin.
*
* Current defaults:
* - `resolve.dedupe`: prevents duplicate React / React Router copies on the
*   client. Duplicate React instances cause hooks to throw "Invalid hook call".
* - `optimizeDeps.include`: forces Vite's dep optimizer to pre-bundle
*   `react-router` and its `/internal/react-server-client` entry so the
*   React Router dev plugin resolves a single shared instance on the client.
*   It also pre-bundles the React-importing entry points of the runtime SDK
*   (`/config`, `/security/react`, `/site-context`, `/design/react/core`,
*   `/routing/app-wrapper`, `/i18n/client`). Without this, Vite optimizes the
*   app's own React first, then *discovers* these SDK subpaths the first time a
*   component imports them at request time, triggers a dep re-optimization, and
*   forces a full-page reload. During that window the SDK's React hooks
*   (`useConfig` → `useContext`) momentarily resolve against a second, freshly
*   optimized React instance — surfacing as "Invalid hook call" / "Cannot read
*   properties of null (reading 'useContext')" until the reload settles.
*   Including them up front means a single first-pass optimization with one
*   shared React, so no mid-session re-optimize and no transient duplicate.
* - `ssr.noExternal`: forces the SDK through Vite's SSR transform pipeline
*   in dev. The SDK exports module-level singletons (router contexts, etc.)
*   whose object identity is load-bearing — they're used as `Map` keys, so
*   reads and writes must reference the same object. In dev SSR, Vite can
*   externalize a package for some import sites (loaded by Node's native
*   ESM resolver) while transforming it for others (loaded by Vite's SSR
*   transform pipeline), producing two distinct module records for the
*   same file on disk. When that happens, the singletons are constructed
*   twice and the keys no longer match — context lookups silently return
*   the default value. `noExternal` collapses both paths into Vite's
*   transform cache so there is exactly one module record. Production
*   builds inline the SDK into the SSR bundle and are unaffected. We
*   don't blanket-`noExternal` every dependency because most third-party
*   packages are identity-agnostic (two copies work fine) and externalizing
*   keeps dev startup fast — only packages exporting identity-sensitive
*   singletons need this treatment.
*
* @returns {Plugin} A Vite plugin contributing the framework's base config.
*/
const baseConfigPlugin = () => ({
	name: "storefront-next:base-config",
	config() {
		return {
			resolve: { dedupe: [
				"react",
				"react-dom",
				"react-router"
			] },
			optimizeDeps: { include: [
				"react-router",
				"react-router/internal/react-server-client",
				"@salesforce/storefront-next-runtime/config",
				"@salesforce/storefront-next-runtime/security/react",
				"@salesforce/storefront-next-runtime/site-context",
				"@salesforce/storefront-next-runtime/design/react/core",
				"@salesforce/storefront-next-runtime/routing/app-wrapper",
				"@salesforce/storefront-next-runtime/i18n/client",
				"i18next-browser-languagedetector",
				"remix-i18next/middleware"
			] },
			ssr: { noExternal: ["@salesforce/storefront-next-runtime"] }
		};
	}
});

//#endregion
//#region src/storefront-next-targets.ts
/**
* Storefront Next Vite plugin that powers the React Router app.
* Supports building and optimizing for the managed runtime environment.
*
* @param config - Configuration options for the plugin
* @returns {Plugin[]} An array of Vite plugins for Storefront Next functionality
*
* @example
* // With default options
* export default defineConfig({
*   plugins: [storefrontNextTargets()]
* })
*
* @example
* // Disable readable chunk names
* export default defineConfig({
*   plugins: [storefrontNextTargets({ readableChunkNames: false })]
* })
*/
function storefrontNextTargets(config = {}) {
	const { readableChunkNames = false, staticRegistry = {
		componentPath: "",
		registryPath: ""
	}, eventInstrumentationValidator = {
		configPath: "config.server.ts",
		scanPaths: ["src"],
		failOnMissing: false
	} } = config;
	const plugins = [
		baseConfigPlugin(),
		...process.env.SCAPI_PROXY_HOST ? [workspacePlugin()] : [],
		i18nPlugin(),
		managedRuntimeBundlePlugin(),
		fixReactRouterManifestUrlsPlugin(),
		patchReactRouterPlugin(),
		platformEntryPlugin(),
		transformTargetPlaceholderPlugin(),
		actionHooksPlugin(),
		watchConfigFilesPlugin(),
		buildMiddlewareRegistryPlugin(),
		ssrSourcemapFixPlugin()
	];
	if (staticRegistry?.componentPath && staticRegistry?.registryPath) {
		plugins.push(staticRegistryPlugin(staticRegistry));
		plugins.push(componentLoadersPlugin({ componentPath: staticRegistry.componentPath }));
	}
	if (eventInstrumentationValidator !== false) plugins.push(eventInstrumentationValidatorPlugin(eventInstrumentationValidator));
	if (readableChunkNames) plugins.push(readableChunkFileNamesPlugin());
	return plugins;
}

//#endregion
//#region src/plugins/uiTargetDevMode.ts
/**
* @deprecated This plugin has been removed. It was an internal-only debugging aid
* that could cause build failures when extensions were trimmed. The export is kept
* as a no-op for backward compatibility and will be removed in v2.
*
* **Migration:** Remove any `uiTargetDevMode()` plugin from your `vite.config.ts`,
* delete `vite-plugins/ui-target-dev-mode.ts` if it exists, and remove the plugin
* from the Vite plugins array.
*
* @returns A no-op Vite plugin
*/
function uiTargetDevModePlugin(_config) {
	return { name: "storefront-next:ui-target-dev-mode-deprecated-noop" };
}

//#endregion
//#region src/plugins/hybridProxy.ts
/**
* Check if a request path should skip proxying (Vite internals, assets, etc.)
*
* @param pathname - URL pathname to check
* @returns true if the request should NOT be proxied
*/
function shouldSkipProxy(pathname) {
	if (pathname.startsWith("/@")) return true;
	if (pathname.startsWith("/__")) return true;
	if (pathname.startsWith("/src/")) return true;
	if (pathname.startsWith("/node_modules/")) return true;
	if (pathname.endsWith(".data")) return true;
	if (pathname.startsWith("/mobify/")) return true;
	if (pathname.startsWith("/on/demandware.")) return false;
	if (/\.(js|jsx|ts|tsx|css|json|map|woff2?|ttf|svg|png|jpe?g|gif|webp|ico|mp4)$/i.test(pathname)) return true;
	return false;
}
/**
* Rewrite Set-Cookie header for localhost development.
*
* Rewrites SFCC Set-Cookie headers so they work on localhost during local development.
*
* **LOCAL DEVELOPMENT ONLY** — This function is part of the hybrid proxy Vite plugin
* which only runs during `pnpm dev`. In production (MRT deployments), SFCC cookies
* flow through the eCDN unmodified.
*
* Rewrites applied:
* - **Domain**: `.salesforce.com` → `localhost` (browsers reject cross-domain cookies)
*
* Attributes intentionally preserved:
* - **Secure**: Kept. Localhost is a secure context — browsers accept `Secure` cookies
*   on `http://localhost` (see https://w3c.github.io/webappsec-secure-contexts/).
* - **SameSite**: Kept. `SameSite=None; Secure` is valid on localhost since `Secure`
*   is accepted. This keeps SFCC cookies transparent and in sync with Storefront Next
*   cookies, which is critical for hybrid auth session bridging.
*
* @param cookie - Original Set-Cookie header value from SFCC
* @returns Rewritten cookie suitable for localhost
*
* @example
* Input:  "dwsid=abc123; Domain=.salesforce.com; Path=/; Secure; SameSite=None; HttpOnly"
* Output: "dwsid=abc123; Domain=localhost; Path=/; Secure; SameSite=None; HttpOnly"
*/
function rewriteCookieForLocalhost(cookie) {
	let rewritten = cookie;
	rewritten = rewritten.replace(/Domain=[^;]+/gi, "Domain=localhost");
	if (!/Domain=/i.test(cookie)) rewritten = rewritten.replace(/^([^;]+)/, "$1; Domain=localhost");
	return rewritten.trim();
}
/**
* Inline script injected into proxied HTML responses to intercept `document.cookie` writes.
*
* **Why this is needed (Layer 3 cookie rewriting):**
*
* The hybrid proxy rewrites Set-Cookie headers from SFCC responses (Layer 1), but after
* the SFRA page fully loads, client-side JavaScript sets cookies via `document.cookie`.
* These writes bypass the proxy entirely.
*
* SFRA's JS typically checks `window.location.protocol` to decide whether to add `Secure`.
* On `http://localhost`, it sees `http:` and omits `Secure`, producing cookies like:
*
*     document.cookie = "dwsid=abc; SameSite=None"   // No Secure → browser rejects
*
* This interceptor patches `document.cookie` to:
* 1. Rewrite `Domain=...` → `Domain=localhost`
* 2. Ensure `Secure` is present (localhost is a secure context)
* 3. If `SameSite=None` is present without `Secure`, add `Secure`
*
* This keeps client-side cookie writes consistent with the proxy's Layer 1 rewrites
* and ensures hybrid auth cookies (dwsid, cc-*) stay in sync between Storefront Next
* and SFRA.
*
* **LOCAL DEVELOPMENT ONLY** — This script is only injected by the Vite dev server proxy.
*/
const COOKIE_INTERCEPTOR_SCRIPT = `<script data-hybrid-proxy="cookie-interceptor">
(function() {
    var desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (!desc || !desc.set) return;
    Object.defineProperty(document, 'cookie', {
        get: function() { return desc.get.call(this); },
        set: function(val) {
            // Rewrite Domain to localhost
            val = val.replace(/Domain=[^;]+/gi, 'Domain=localhost');
            // Ensure Secure is present if SameSite=None (localhost is a secure context)
            if (/SameSite=None/i.test(val) && !/;\\s*Secure\\b/i.test(val)) {
                val += '; Secure';
            }
            desc.set.call(this, val);
        },
        configurable: true
    });
})();
<\/script>`;
/**
* Escape special regex characters in a string for use in `new RegExp()`.
*/
function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Resolve a captured prefix segment to its canonical-cased alias, case-insensitively.
* Returns the matching entry from `aliases` (preserving the catalog's casing) so the value
* forwarded to SFRA is always the expected canonical form, or `undefined` when the segment
* isn't a known site/locale identifier.
*/
function matchAlias(segment, aliases) {
	if (segment === void 0) return void 0;
	const lower = segment.toLowerCase();
	return aliases.find((alias) => alias.toLowerCase() === lower);
}
/**
* Rewrite an incoming proxy pathname to the SFRA `/s/{siteId}/{locale}/…` shape.
*
* This is the OOTB path transform. It is `url.prefix`-aware: when `urlPrefix` is set
* it strips the configured prefix to recover the bare functional path AND reuses the
* site/locale the path already carried — so a prefixed request like `/uk/cart` becomes
* `/s/{siteId}/uk/cart` rather than the double-stacked `/s/{siteId}/{locale}/uk/cart`.
*
* It handles every standard prefix shape uniformly:
* - no prefix (`''`/`/`):     `/cart`            → `/s/{site}/{locale}/cart`
* - `/:localeId`:             `/uk/cart`         → `/s/{site}/uk/cart`
* - `/:siteId/:localeId`:     `/global/uk/cart`  → `/s/global/uk/cart`
*
* Disambiguation: a captured prefix segment is only treated as a site/locale when it is
* a known identifier (`siteAliases`/`localeAliases`). This stops a bare path like `/cart`
* under a `/:localeId` prefix — which is structurally indistinguishable from a locale
* home `/uk` — from being mis-stripped (here `cart` isn't a known locale, so the whole
* path is treated as the bare functional path and decorated with the `defaultSiteId`/
* `defaultLocale` fallbacks). When a prefix segment IS a known site/locale, that value is
* passed straight through as the SFRA path segment; SFRA resolves both the BM site-path
* alias (`uk`) and the canonical id (`en-GB`).
*
* Paths already in SFCC shape (`/s/…`, `/on/demandware.…`) are returned unchanged — the
* caller is expected to skip them, but this stays defensive.
*
* Pure function (query string handled by the caller) so it's unit-testable in isolation.
*
* @param pathname - Incoming pathname on the proxy (no query string).
* @param opts.defaultSiteId - Site to use when the path doesn't carry one.
* @param opts.defaultLocale - Locale to use when the path doesn't carry one.
* @param opts.urlPrefix - The storefront's `url.prefix` (e.g. `'/:siteId/:localeId'`).
* @param opts.localeAliases - Known locale ids + aliases.
* @param opts.siteAliases - Known site ids + aliases.
*/
function rewriteToSfraPath(pathname, opts) {
	const { defaultSiteId, defaultLocale, urlPrefix, localeAliases = [], siteAliases = [] } = opts;
	if (pathname.startsWith("/s/") || pathname.startsWith("/on/demandware.")) return pathname;
	let site = defaultSiteId;
	let locale = defaultLocale;
	let barePath = pathname;
	let localeFromPath = false;
	if (urlPrefix && urlPrefix !== "/") {
		const captured = extractPrefixParamValues({
			pathname,
			prefix: urlPrefix
		});
		const matchedSite = "siteId" in captured ? matchAlias(captured.siteId, siteAliases) : void 0;
		const matchedLocale = "localeId" in captured ? matchAlias(captured.localeId, localeAliases) : void 0;
		const siteOk = !("siteId" in captured) || matchedSite !== void 0;
		const localeOk = !("localeId" in captured) || matchedLocale !== void 0;
		if (Object.keys(captured).length > 0 && siteOk && localeOk) {
			if (matchedSite) site = matchedSite;
			if (matchedLocale) {
				locale = matchedLocale;
				localeFromPath = true;
			}
			barePath = stripPathPrefix({
				pathname,
				prefix: urlPrefix
			}) || "/";
		}
	}
	if (barePath === "/") return localeFromPath ? `/s/${site}/${locale}/` : `/s/${site}`;
	return `/s/${site}/${locale}${barePath}`;
}
/**
* Rewrite an SFCC Location header so the user stays on the proxy origin AND so
* any query params from the original request survive an SFCC redirect.
*
* SFCC frequently redirects bare paths like `/cart` to a canonical SFRA URL
* (`/s/{siteId}/{locale}/Cart-Show`) without echoing the user's query string in
* the Location header. Without this merge step, params like `?foo=bar` set by
* the storefront — including ones the destination page expects — get dropped on
* the cross-app hop.
*
* Resolution rules:
* - Off-origin Location → `{ kind: 'off-origin' }` so the caller leaves the
*   header unchanged and the browser navigates as SFCC intended.
* - Same-origin Location → rewrite the origin to the proxy host, then merge the
*   original request's query params into the redirect target's URL. Multi-value
*   keys (e.g. SFRA's `pmid=...&pmid=...`) are preserved on both sides. The
*   redirect target wins on collision so SFCC can intentionally override a key.
* - Malformed Location → `{ kind: 'malformed' }` so the caller can warn.
*
* @param locationHeader - Raw Location header value from the SFCC response.
* @param requestUrl - Original request URL on the proxy (e.g. `/cart?foo=bar`).
* @param targetOrigin - SFCC origin used as the base for relative Location values.
* @param proxyOrigin - Proxy origin (e.g. `http://localhost:5173`) the caller wants the user to stay on.
*/
function rewriteLocationForProxy({ locationHeader, requestUrl, targetOrigin, proxyOrigin }) {
	let locationUrl;
	try {
		locationUrl = new URL(locationHeader, targetOrigin);
	} catch {
		return { kind: "malformed" };
	}
	if (locationUrl.origin !== targetOrigin) return { kind: "off-origin" };
	let requestQuery;
	try {
		requestQuery = new URL(requestUrl, proxyOrigin).searchParams;
	} catch {
		requestQuery = new URLSearchParams();
	}
	const targetKeys = new Set(locationUrl.searchParams.keys());
	for (const [key, value] of requestQuery) if (!targetKeys.has(key)) locationUrl.searchParams.append(key, value);
	return {
		kind: "rewritten",
		url: `${proxyOrigin}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`
	};
}
/** Cap loud values in debug logs so a long URL doesn't drown the dev console. */
function truncateForLog(value, max = 120) {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}
/**
* Vite plugin for hybrid proxying between Storefront Next and legacy SFRA.
*
* Uses http-proxy to silently forward non-matching requests to SFCC without visible
* redirects. Rewrites Set-Cookie headers, Location headers, and HTML/JSON response
* bodies to keep all navigation within the localhost proxy.
*
* Routing decisions are delegated to the `routeMatcher` callback injected via options,
* keeping the SDK free of template-specific routing logic.
*
* @param options - Plugin configuration
* @returns Vite plugin
*/
function hybridProxyPlugin(options) {
	if (!options.enabled) {
		logger.debug("Hybrid proxy disabled (HYBRID_PROXY_ENABLED is not true)");
		return { name: "hybrid-proxy" };
	}
	if (!options.targetOrigin) {
		logger.warn("Hybrid proxy: no target origin configured (SFCC_ORIGIN required)");
		return { name: "hybrid-proxy" };
	}
	if (!options.defaultSiteId) throw new Error("Hybrid proxy is enabled but no default site ID was provided.\n\nSet PUBLIC__app__defaultSiteId in your .env file:\n  PUBLIC__app__defaultSiteId=RefArchGlobal\n\nSee docs/README-HYBRID-PROXY.md for the full reference.");
	logger.info(`Hybrid proxy enabled → ${options.targetOrigin}`);
	logger.debug(`Hybrid proxy routing rules: ${options.routingRules.slice(0, 100)}...`);
	const locale = options.locale || "default";
	const defaultSiteId = options.defaultSiteId;
	const { urlPrefix, localeAliases, siteAliases, rewritePath } = options;
	logger.debug(urlPrefix ? `Hybrid proxy path transformation: url.prefix=${urlPrefix} → /s/${defaultSiteId}/{locale}/{bare path}` : `Hybrid proxy path transformation: / → /s/${defaultSiteId}, /path → /s/${defaultSiteId}/${locale}/path`);
	const targetOriginPattern = new RegExp(escapeRegExp(options.targetOrigin), "g");
	const proxy = httpProxy.createProxyServer({
		changeOrigin: true,
		followRedirects: false,
		selfHandleResponse: true
	});
	proxy.on("proxyReq", (proxyReq, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const pathname = url.pathname;
		if (!pathname.startsWith("/s/") && !pathname.startsWith("/on/demandware.")) {
			const originalPath = proxyReq.path;
			proxyReq.path = `${rewritePath?.(pathname) ?? null ?? rewriteToSfraPath(pathname, {
				defaultSiteId,
				defaultLocale: locale,
				urlPrefix,
				localeAliases,
				siteAliases
			})}${url.search}`;
			logger.debug(`Hybrid proxy path rewrite: ${originalPath} → ${proxyReq.path}`);
		}
	});
	proxy.on("proxyRes", (proxyRes, req, res) => {
		const clientRes = res;
		const locationHeader = proxyRes.headers.location;
		const statusCode = proxyRes.statusCode || 200;
		if (typeof locationHeader === "string" && /\/404\b/.test(locationHeader) && (statusCode >= 300 && statusCode < 400 || statusCode === 200)) {
			logger.warn(`⚠️  SFCC returned a redirect to 404 for ${req.url}. This usually means your HYBRID_ROUTING_RULES are missing a pattern for this path. Stripping Set-Cookie headers to prevent session cookie corruption. Fix: add a matching pattern to HYBRID_ROUTING_RULES (e.g., "^${req.url?.split("?")[0]}.*")`);
			delete proxyRes.headers["set-cookie"];
		}
		const setCookieHeaders = proxyRes.headers["set-cookie"];
		if (setCookieHeaders && Array.isArray(setCookieHeaders)) proxyRes.headers["set-cookie"] = setCookieHeaders.map((cookie) => {
			const rewritten = rewriteCookieForLocalhost(cookie);
			logger.debug(`Hybrid proxy cookie rewrite: ${cookie.slice(0, 50)}... → ${rewritten.slice(0, 50)}...`);
			return rewritten;
		});
		if (locationHeader && typeof locationHeader === "string") {
			const proxyOrigin = `http://${req.headers.host}`;
			const result = rewriteLocationForProxy({
				locationHeader,
				requestUrl: req.url ?? "",
				targetOrigin: options.targetOrigin,
				proxyOrigin
			});
			if (result.kind === "rewritten") {
				proxyRes.headers.location = result.url;
				logger.debug(`Hybrid proxy location rewrite: ${truncateForLog(locationHeader)} → ${truncateForLog(result.url)}`);
				if (statusCode === 200) {
					proxyRes.resume();
					const redirectHeaders = { location: result.url };
					const setCookie = proxyRes.headers["set-cookie"];
					if (setCookie) redirectHeaders["set-cookie"] = setCookie;
					clientRes.writeHead(302, redirectHeaders);
					clientRes.end();
					logger.debug(`Hybrid proxy normalized 200+Location → 302 for ${req.url} (Location: ${truncateForLog(result.url)})`);
					return;
				}
			} else if (result.kind === "malformed") logger.warn(`Hybrid proxy: invalid Location header: ${truncateForLog(locationHeader)}`);
		}
		const contentType = (proxyRes.headers["content-type"] || "").split(";")[0].trim();
		if (!(contentType === "text/html" || contentType === "application/json")) {
			clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
			proxyRes.pipe(clientRes);
			return;
		}
		const chunks = [];
		proxyRes.on("data", (chunk) => chunks.push(chunk));
		proxyRes.on("end", () => {
			let body = Buffer.concat(chunks);
			const encoding = proxyRes.headers["content-encoding"];
			if (encoding === "gzip") body = gunzipSync(body);
			else if (encoding === "br") body = brotliDecompressSync(body);
			else if (encoding === "deflate") body = inflateSync(body);
			const proxyOrigin = `http://${req.headers.host}`;
			let text = body.toString("utf8");
			targetOriginPattern.lastIndex = 0;
			text = text.replace(targetOriginPattern, proxyOrigin);
			if (contentType === "text/html") {
				const headIndex = text.indexOf("<head");
				if (headIndex !== -1) {
					const insertAfter = text.indexOf(">", headIndex);
					if (insertAfter !== -1) text = text.slice(0, insertAfter + 1) + COOKIE_INTERCEPTOR_SCRIPT + text.slice(insertAfter + 1);
				}
			}
			const headers = { ...proxyRes.headers };
			delete headers["content-encoding"];
			delete headers["transfer-encoding"];
			headers["content-length"] = String(Buffer.byteLength(text, "utf8"));
			clientRes.writeHead(proxyRes.statusCode || 200, headers);
			clientRes.end(text);
			logger.debug(`Hybrid proxy rewrote ${contentType} body URLs for ${req.url}`);
		});
	});
	proxy.on("error", (err, req, res) => {
		logger.error(`Hybrid proxy error: ${err.message} ${req.url}`);
		if ("writeHead" in res && !res.headersSent) {
			res.writeHead(502, { "Content-Type": "text/plain" });
			res.end("Bad Gateway: Failed to proxy to SFCC");
		}
	});
	return {
		name: "hybrid-proxy",
		enforce: "pre",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const pathname = req.url?.split("?")[0] || "";
				if (shouldSkipProxy(pathname)) return next();
				const isSFCCPath = pathname.startsWith("/on/demandware.");
				let shouldRouteToNextApp = false;
				if (!isSFCCPath) {
					try {
						shouldRouteToNextApp = options.routeMatcher(pathname, options.routingRules);
					} catch (error) {
						logger.error(`Hybrid proxy error checking routing rules: ${String(error)}`);
						return next();
					}
					if (shouldRouteToNextApp) return next();
				}
				logger.debug(`Hybrid proxy: ${req.method} ${pathname} → ${options.targetOrigin}`);
				try {
					proxy.web(req, res, { target: options.targetOrigin });
				} catch (error) {
					logger.error(`Hybrid proxy failed to proxy request: ${String(error)}`);
					if (!res.headersSent) {
						res.writeHead(502, { "Content-Type": "text/plain" });
						res.end("Bad Gateway: Failed to proxy to SFCC");
					}
				}
			});
		}
	};
}

//#endregion
//#region src/plugins/ecdnMatcher.ts
/**
* Cloudflare eCDN Routing Rule Matcher
*
* Parses Cloudflare-style routing expressions and tests pathnames against them.
* This utility is environment-agnostic and works in both Node.js and browser contexts.
*
* @example
* ```typescript
* const rules = '(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/search.*")';
* shouldRouteToNext('/', rules);          // true - route to Storefront Next
* shouldRouteToNext('/search', rules);    // true - route to Storefront Next
* shouldRouteToNext('/checkout', rules);  // false - proxy to SFRA/legacy
* ```
*
* Environment variables used:
* - HYBRID_PROXY_ENABLED (optional) - Boolean flag to enable/disable hybrid proxy
* - HYBRID_ROUTING_RULES (optional) - Cloudflare routing expression string
* - SFCC_ORIGIN (optional) - Base URL for SFCC sandbox redirects
*/
const regexCache = /* @__PURE__ */ new Map();
/**
* Extracts regex patterns from a Cloudflare routing expression.
*
* Parses Cloudflare "matches" expressions like:
*   (http.request.uri.path matches "^/$" or http.request.uri.path matches "^/category.*")
*
* And extracts the regex patterns: ["^/$", "^/category.*"]
*
* @param expression - Cloudflare expression string
* @returns Array of regex pattern strings
*
* @example
* ```typescript
* extractPatterns('(http.request.uri.path matches "^/$")');
* // Returns: ["^/$"]
*
* extractPatterns('(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/search.*")');
* // Returns: ["^/$", "^/search.*"]
* ```
*/
function extractPatterns(expression) {
	if (!expression || typeof expression !== "string") return [];
	const regex = /http\.request\.uri\.path\s+matches\s+["']([^"']+)["']/gi;
	const patterns = [];
	let match;
	while ((match = regex.exec(expression)) !== null) patterns.push(match[1]);
	return patterns;
}
/**
* Tests if a pathname matches any of the provided regex patterns (logical OR).
* Uses caching to optimize repeated pattern compilations.
*
* @param pathname - URL pathname to test (e.g., "/search", "/category/shoes")
* @param patterns - Array of regex pattern strings
* @returns true if pathname matches any pattern, false otherwise
*
* @example
* ```typescript
* testPatterns('/category/shoes', ['^/category.*', '^/search.*']);
* // Returns: true (matches first pattern)
*
* testPatterns('/checkout', ['^/category.*', '^/search.*']);
* // Returns: false (matches no patterns)
* ```
*/
function testPatterns(pathname, patterns) {
	if (!pathname || !patterns || patterns.length === 0) return false;
	for (const pattern of patterns) try {
		let regex = regexCache.get(pattern);
		if (!regex) {
			regex = new RegExp(pattern);
			regexCache.set(pattern, regex);
		}
		if (regex.test(pathname)) return true;
	} catch (error) {
		logger.warn(`Invalid regex pattern: ${pattern} ${String(error)}`);
		continue;
	}
	return false;
}
/**
* Main function: Determines if a pathname should route to Storefront Next
* or be proxied/redirected to SFRA/legacy backend.
*
* @param pathname - URL pathname (e.g., "/search", "/checkout")
* @param routingRules - Cloudflare routing expression string (optional)
* @returns true if should route to Storefront Next, false if should proxy to SFRA
*
* @example
* ```typescript
* const rules = '(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/category.*")';
*
* shouldRouteToNext('/', rules);              // true - route to Next
* shouldRouteToNext('/category/mens', rules); // true - route to Next
* shouldRouteToNext('/checkout', rules);      // false - proxy to SFRA
* shouldRouteToNext('/any-path', undefined);  // true - no rules = default to Next
* ```
*/
function shouldRouteToNext(pathname, routingRules) {
	if (!routingRules) return true;
	const patterns = extractPatterns(routingRules);
	if (patterns.length === 0) {
		logger.warn("No valid patterns found in routing rules");
		return true;
	}
	return testPatterns(pathname, patterns);
}

//#endregion
export { storefrontNextTargets as default, hybridProxyPlugin, shouldRouteToNext, transformTargetPlaceholderPlugin, uiTargetDevModePlugin };
//# sourceMappingURL=index.js.map