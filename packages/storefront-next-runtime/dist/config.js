import { n as defaultSecurityHeaders } from "./defaults.js";
import { createContext, useContext } from "react";
import { jsx } from "react/jsx-runtime";
import { createContext as createContext$1 } from "react-router";

//#region src/config/utils.ts
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
* Type guard to check if value is a plain object (not array, null, or other types)
*/
const isPlainObject = (value) => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};
/**
* Deep merge two objects, with source values overriding target values
* Arrays are replaced, not merged
*
* @param target - The base object
* @param source - The object with values to merge in
* @returns A new merged object
*
* @example
* deepMerge(
*   { a: { b: 1, c: 2 } },
*   { a: { b: 3, d: 4 } }
* )
* // Returns: { a: { b: 3, c: 2, d: 4 } }
*/
const deepMerge = (target, source) => {
	const result = { ...target };
	for (const key in source) {
		const sourceValue = source[key];
		const targetValue = result[key];
		if (isPlainObject(sourceValue) && isPlainObject(targetValue)) result[key] = deepMerge(targetValue, sourceValue);
		else result[key] = sourceValue;
	}
	return result;
};
/**
* Convert a path string with double underscore separators to a nested object
* Normalizes keys to match baseConfig casing (case-insensitive lookup, preserves baseConfig case)
*
* @param path - The path string (e.g., 'app__pages__cart__quantityUpdateDebounce')
* @param value - The value to set at the path
* @param baseConfig - Optional base config for case normalization
* @returns A nested object
*
* @example
* pathToObject('app__pages__cart__maxQuantity', 999)
* // Returns: { app: { pages: { cart: { maxQuantity: 999 } } } }
*
* @example
* // With baseConfig normalization:
* pathToObject('APP__SITE__LOCALE', 'en-GB', { app: { site: { locale: 'en-GB' } } })
* // Returns: { app: { site: { locale: 'en-GB' } } } (normalized to baseConfig casing)
*/
const pathToObject = (path, value, baseConfig) => {
	const keys = path.split("__");
	const result = {};
	let current = result;
	let configCurrent = baseConfig;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		let normalizedKey = key;
		if (configCurrent && typeof configCurrent === "object" && !Array.isArray(configCurrent)) {
			const actualKey = Object.keys(configCurrent).find((k) => k.toLowerCase() === key.toLowerCase());
			if (actualKey) {
				normalizedKey = actualKey;
				configCurrent = configCurrent[actualKey];
			} else configCurrent = null;
		}
		current[normalizedKey] = {};
		current = current[normalizedKey];
	}
	const lastKey = keys[keys.length - 1];
	let normalizedLastKey = lastKey;
	if (configCurrent && typeof configCurrent === "object" && !Array.isArray(configCurrent)) {
		const actualKey = Object.keys(configCurrent).find((k) => k.toLowerCase() === lastKey.toLowerCase());
		if (actualKey) normalizedLastKey = actualKey;
	}
	current[normalizedLastKey] = value;
	return result;
};
/**
* Parse environment variable value with optimistic JSON parsing
* Tries to parse as JSON first, falls back to string if invalid
* Supports multi-line formatted JSON by normalizing whitespace before parsing
*
* @param varValue - The environment variable value
* @param varName - Optional variable name for better error messages
* @returns The parsed value (JSON type if valid JSON, otherwise string)
*
* @example
* // Primitives
* parseEnvValue('42') // → 42 (number)
* parseEnvValue('true') // → true (boolean)
* parseEnvValue('hello') // → 'hello' (string)
*
* @example
* // Single-line JSON
* parseEnvValue('["Apple","Google"]') // → ['Apple', 'Google'] (array)
* parseEnvValue('{"key":"value"}') // → {key: 'value'} (object)
*
* @example
* // Multi-line formatted JSON (whitespace normalized automatically)
* parseEnvValue('[
*   {"id": "en-GB"},
*   {"id": "fr-FR"}
* ]') // → [{id: 'en-GB'}, {id: 'fr-FR'}] (array)
*/
const parseEnvValue = (varValue, varName) => {
	try {
		return JSON.parse(varValue);
	} catch {
		const trimmed = varValue.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) try {
			const normalized = varValue.replace(/\s+/g, " ").trim();
			return JSON.parse(normalized);
		} catch {
			if (process.env.NODE_ENV === "development") {
				const preview = varValue.length > 50 ? `${varValue.substring(0, 50)}...` : varValue;
				const varInfo = varName ? ` in "${varName}"` : "";
				console.warn(`[Config Warning] Value${varInfo} looks like JSON but failed to parse: "${preview}". Using as string instead. Check for syntax errors if this was meant to be JSON.`);
			}
		}
		return varValue;
	}
};
/**
* Extract all valid paths from a config object (recursively traverses the object structure)
* Returns paths in lowercase with double underscore separators
*
* @param obj - The config object to extract paths from
* @param prefix - Current path prefix (used for recursion)
* @returns Array of valid config paths
*
* @example
* extractValidPaths({ app: { site: { locale: 'en-GB' } } })
* // Returns: ['app__site__locale']
*/
const extractValidPaths = (obj, prefix = "") => {
	if (!isPlainObject(obj)) return prefix ? [prefix] : [];
	const paths = [];
	for (const [key, value] of Object.entries(obj)) {
		const normalizedKey = key.toLowerCase();
		const currentPath = prefix ? `${prefix}__${normalizedKey}` : normalizedKey;
		if (isPlainObject(value)) {
			paths.push(currentPath);
			paths.push(...extractValidPaths(value, currentPath));
		} else paths.push(currentPath);
	}
	return paths;
};
/**
* Merge environment variables with PUBLIC__ prefix into config.
*
* Uses double underscore (__) to target nested config paths.
* All PUBLIC__ prefixed variables are exposed to the client (bundled into window.__APP_CONFIG__).
*
* Server-only secrets should NEVER use this — read them directly from process.env in server code.
*
* Environment variables:
* - `PUBLIC__<path>` (optional): Override any config path. e.g. `PUBLIC__app__commerce__api__clientId=abc123`
* - `NODE_ENV` (optional): When set to 'development', enables conflict warnings for overlapping paths
*
* @param env - Environment variables object (defaults to process.env)
* @param baseConfig - Optional base config for strict path validation and case normalization
* @param options - Optional configuration including protected paths
* @returns Object with overrides to merge into base config
*
* @example
* // Environment variables (template-specific paths shown):
* // PUBLIC__app__some__nested__value=abc123
* // PUBLIC__app__some__numericKnob=1000
* // PUBLIC__app__some__listKnob=["A","B"]
*
* mergeEnvConfig()
* // Returns:
* // {
* //   app: {
* //     some: {
* //       nested: { value: 'abc123' },
* //       numericKnob: 1000,
* //       listKnob: ['A', 'B']
* //     }
* //   }
* // }
*/
const mergeEnvConfig = (env = typeof process !== "undefined" ? process.env : {}, baseConfig, options) => {
	const PUBLIC_PREFIX = "PUBLIC__";
	const MAX_VAR_NAME_LENGTH = 512;
	const MAX_TOTAL_VALUE_SIZE = 32 * 1024;
	const MAX_DEPTH = 10;
	const protectedPaths = options?.protectedPaths ?? [];
	const validPaths = baseConfig ? extractValidPaths(baseConfig) : [];
	const envVars = [];
	let totalValueSize = 0;
	for (const [varName, varValue] of Object.entries(env)) {
		if (varValue === void 0 || varValue === null || !varName.startsWith(PUBLIC_PREFIX)) continue;
		if (varName.length > MAX_VAR_NAME_LENGTH) throw new Error(`Environment variable name "${varName}" exceeds MRT limit of ${MAX_VAR_NAME_LENGTH} characters. Current length: ${varName.length} characters. Consider using shorter paths or consolidating configuration using JSON values.`);
		const path = varName.substring(8);
		if (!path) throw new Error(`Invalid environment variable "${varName}": Path cannot be empty after PUBLIC__ prefix. Expected format: PUBLIC__path__to__value (e.g., PUBLIC__app__site__locale)`);
		const depth = path.split("__").length;
		if (depth > MAX_DEPTH) throw new Error(`Environment variable "${varName}" exceeds maximum path depth of ${MAX_DEPTH}. Current depth: ${depth}. Consider consolidating with JSON values or reducing nesting levels.`);
		const normalizedPath = path.toLowerCase();
		if (protectedPaths.some((protectedPath) => {
			const normalizedProtectedPath = protectedPath.toLowerCase();
			return normalizedPath === normalizedProtectedPath || normalizedPath.startsWith(`${normalizedProtectedPath}__`);
		})) throw new Error(`Environment variable "${varName}" attempts to override protected config path "${path}".\n\nProtected paths cannot be overridden via environment variables. Update config.server.ts directly, or remove the path from \`protectedPaths\` if env override is intended.`);
		if (baseConfig && validPaths.length > 0) {
			if (!validPaths.includes(normalizedPath)) {
				console.warn(`[Config Warning] Ignoring environment variable "${varName}": Config path "${path}" does not exist in config.server.ts.`);
				continue;
			}
		}
		totalValueSize += varValue.length;
		envVars.push({
			name: varName,
			path,
			value: varValue,
			depth: path.split("__").length
		});
	}
	if (totalValueSize > MAX_TOTAL_VALUE_SIZE) throw new Error(`Total size of PUBLIC__ environment variable values exceeds MRT limit of ${MAX_TOTAL_VALUE_SIZE} bytes (32 KB). Current size: ${totalValueSize} bytes. Consider consolidating configuration using JSON values to reduce the number of variables, or move non-essential configuration to defaults in config.server.ts.`);
	envVars.sort((a, b) => a.depth - b.depth);
	const conflicts = [];
	for (let i = 0; i < envVars.length; i++) for (let j = i + 1; j < envVars.length; j++) {
		const shorter = envVars[i].path;
		if (envVars[j].path.startsWith(`${shorter}__`)) conflicts.push({
			parent: envVars[i].name,
			child: envVars[j].name
		});
	}
	if (conflicts.length > 0 && process.env.NODE_ENV === "development") console.warn(`[Config Warning] Conflicting environment variables detected. More specific paths will override parent paths:\n${conflicts.map((c) => `  ${c.parent} ← overridden by → ${c.child}`).join("\n")}`);
	let merged = {};
	for (const envVar of envVars) try {
		const parsedValue = parseEnvValue(envVar.value, envVar.name);
		const pathObject = pathToObject(envVar.path, parsedValue, baseConfig);
		merged = deepMerge(merged, pathObject);
	} catch (error) {
		throw new Error(`Failed to process environment variable "${envVar.name}" with value "${envVar.value}": ${error instanceof Error ? error.message : String(error)}`);
	}
	return merged;
};

//#endregion
//#region src/config/schema.ts
/**
* Define a type-safe storefront configuration with IDE autocomplete.
*
* Reads `process.env` at call time and merges any `PUBLIC__`-prefixed
* variables into the config (validated against the base config structure —
* env vars targeting paths that don't exist in the base config are ignored
* with a warning). This is a server-only side effect by design; calling
* `defineConfig` from a browser bundle silently no-ops because `PUBLIC__`
* vars are not present in the client environment.
*
* Environment variables:
* - `PUBLIC__<path>` (optional): Override any config path using double underscore separators.
*   e.g. `PUBLIC__app__some__nested__value=abc123` maps to `config.app.some.nested.value`
* - JSON values are parsed optimistically: numbers, booleans, arrays, and objects all work.
*   `PUBLIC__app__features__providers=["A","B"]` parses to an array.
*
* @param config - The base configuration object with all defaults
* @param options - Optional settings (e.g., protectedPaths to prevent env var overrides)
* @returns The config with environment variable overrides merged in
*
* @example
* // In config.server.ts:
* import { defineConfig } from '@salesforce/storefront-next-runtime/config';
*
* export default defineConfig({
*     metadata: { projectName: 'My Store', projectSlug: 'my-store' },
*     app: {
*         // template-specific shape
*     },
* }, { protectedPaths: ['app__analytics'] });
*/
function defineConfig(config, options) {
	return deepMerge(config, mergeEnvConfig(process.env, config, { protectedPaths: options?.protectedPaths }));
}

//#endregion
//#region src/config/context.tsx
/**
* Router context for application configuration. Populated by the template's
* app-config middleware; read via `context.get(appConfigContext)` in loaders,
* actions, and other middleware. Returns the augmented `AppConfigShape`.
*/
const appConfigContext = createContext$1();
/**
* Router context for the **client-safe view** of the application configuration —
* `appConfigContext` minus any server-only namespaces (which namespaces are server-only
* is template-defined; the SDK only owns the slot). The template's app-config middleware
* populates this with a precomputed view (the strip is identical on every request, so
* computing it per-request allocates a fresh object every render for no behavioral
* difference); the root loader reads from this context for the value it returns to React
* Router, which then ships in the SSR hydration payload. Reading the unstripped
* `appConfigContext` for the loader return would leak server-only namespaces into the
* browser via that channel.
*
* Type is `Partial<AppConfigShape>` because the client view is always a subset of the
* full shape. For a stronger narrow at the read site, augment `ClientFacingAppConfigShape`
* (the same slot that narrows `useConfig()`) and cast through `ClientFacingAppConfig`.
*/
const clientAppConfigContext = createContext$1();
/**
* Internal React context backing `useConfig()`.
*
* Not exported from the public barrel — components must read config via
* `useConfig()` so the React tree has a single source of truth.
*/
const ConfigContext = createContext(null);
/**
* React context provider for application configuration.
*
* Wrap your component tree with this to enable `useConfig()` in child components.
* Typically placed in the root layout component.
*/
function ConfigProvider({ config, children }) {
	return /* @__PURE__ */ jsx(ConfigContext.Provider, {
		value: config,
		children
	});
}

//#endregion
//#region src/config/get-config.ts
function getConfig(context) {
	if (context) {
		const config = context.get(appConfigContext);
		if (!config) throw new Error("Configuration not available in router context. Ensure appConfigMiddleware.server runs before other middleware.");
		return config;
	}
	if (typeof window !== "undefined" && window.__APP_CONFIG__) return window.__APP_CONFIG__;
	throw new Error("Configuration not available. This can happen if:\n1. Server: Pass context parameter: getConfig(context)\n2. Client: Ensure window.__APP_CONFIG__ was injected during SSR\n3. React component: Use useConfig() hook instead of getConfig()");
}
/**
* Get configuration in React components (use this instead of `getConfig` —
* React Context requires `useContext`). Returns `ClientFacingAppConfig`, which
* is the template's `ClientFacingAppConfigShape` augmentation (typically
* `Omit<AppConfig, 'serverExtension'>`) when present, and falls back to the full
* `AppConfigShape` otherwise. The fallback keeps the upgrade zero-breakage.
*/
function useConfig() {
	const config = useContext(ConfigContext);
	if (!config) throw new Error("useConfig must be used within ConfigProvider. Ensure ConfigProvider wraps your component tree in root.tsx");
	return config;
}

//#endregion
export { ConfigProvider, appConfigContext, clientAppConfigContext, defaultSecurityHeaders, defineConfig, getConfig, useConfig };
//# sourceMappingURL=config.js.map