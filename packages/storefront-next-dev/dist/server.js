import { t as logger } from "./logger.js";
import { o as loadRuntimeConfig } from "./config.js";
import path from "path";
import chalk from "chalk";
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";
import compression from "compression";
import zlib from "node:zlib";
import morgan from "morgan";
import { minimatch } from "minimatch";
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";
import { ExportResultCode, W3CTraceContextPropagator, hrTimeToTimeStamp, parseTraceParent } from "@opentelemetry/core";
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_SERVICE_NAME, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { AlwaysOnSampler, ConsoleSpanExporter, ParentBasedSampler, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";

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
	if (!existsSync(tsconfigPath)) return alias;
	try {
		const tsconfigContent = readFileSync(tsconfigPath, "utf-8");
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
//#region src/server/config.ts
/**
* This is a temporary function before we move the config implementation from
* the template to the SDK.
*
* @ TODO: Remove this function after we move the config implementation from
* the template to the SDK.
*
*/
function loadConfigFromEnv() {
	const shortCode = process.env.PUBLIC__app__commerce__api__shortCode;
	const organizationId = process.env.PUBLIC__app__commerce__api__organizationId;
	const clientId = process.env.PUBLIC__app__commerce__api__clientId;
	const proxy = process.env.PUBLIC__app__commerce__api__proxy || "/mobify/proxy/api";
	const proxyHost = process.env.SCAPI_PROXY_HOST;
	if (!shortCode && !proxyHost) throw new Error("Missing PUBLIC__app__commerce__api__shortCode environment variable.\nPlease set it in your .env file or environment.");
	if (!organizationId) throw new Error("Missing PUBLIC__app__commerce__api__organizationId environment variable.\nPlease set it in your .env file or environment.");
	if (!clientId) throw new Error("Missing PUBLIC__app__commerce__api__clientId environment variable.\nPlease set it in your .env file or environment.");
	return { commerce: { api: {
		shortCode: shortCode || "",
		organizationId,
		clientId,
		proxy,
		proxyHost
	} } };
}
/**
* Load storefront-next project configuration from config.server.ts.
* Requires projectDirectory to be provided.
*
* @param projectDirectory - Project directory to load config.server.ts from
* @throws Error if config.server.ts is not found or invalid
*/
async function loadProjectConfig(projectDirectory) {
	const configPath = resolve(projectDirectory, "config.server.ts");
	const tsconfigPath = resolve(projectDirectory, "tsconfig.json");
	if (!existsSync(configPath)) throw new Error(`config.server.ts not found at ${configPath}.\nPlease ensure config.server.ts exists in your project root.`);
	const config = (await importTypescript(configPath, {
		projectDirectory,
		tsconfigPath
	})).default;
	if (!config?.app?.commerce?.api) throw new Error("Invalid config.server.ts: missing app.commerce.api configuration.\nPlease ensure your config.server.ts has the commerce API configuration.");
	const api = config.app.commerce.api;
	const proxyHost = process.env.SCAPI_PROXY_HOST;
	if (!api.shortCode && !proxyHost) throw new Error("Missing shortCode in config.server.ts commerce.api configuration");
	if (!api.organizationId) throw new Error("Missing organizationId in config.server.ts commerce.api configuration");
	if (!api.clientId) throw new Error("Missing clientId in config.server.ts commerce.api configuration");
	return { commerce: { api: {
		shortCode: api.shortCode || "",
		organizationId: api.organizationId,
		clientId: api.clientId,
		proxy: api.proxy || "/mobify/proxy/api",
		proxyHost
	} } };
}

//#endregion
//#region src/utils/paths.ts
/**
* Get the Commerce Cloud API URL from a short code
*/
function getCommerceCloudApiUrl(shortCode, proxyHost) {
	return proxyHost || `https://${shortCode}.api.commercecloud.salesforce.com`;
}
/**
* Get the configurable base path for the application.
* Reads from MRT_ENV_BASE_PATH environment variable.
*
* The base path is used for CDN routing to the correct MRT environment.
* It is prepended to all URLs: page routes, /mobify/bundle/ assets, and /mobify/proxy/api.
*
* Validation rules:
* - Must be a single path segment starting with '/'
* - Max 63 characters after the leading slash
* - Only URL-safe characters allowed
* - Returns empty string if not set
*
* @returns The sanitized base path (e.g., '/site-a' or '')
*
* @example
* // No base path configured
* getBasePath() // → ''
*
* // With base path '/storefront'
* getBasePath() // → '/storefront'
*
* // Automatically sanitizes
* // MRT_ENV_BASE_PATH='storefront/' → '/storefront'
*/
function getBasePath() {
	const basePath = process.env.MRT_ENV_BASE_PATH?.trim();
	if (!basePath) return "";
	if (!/^\/[a-zA-Z0-9_.+$~"'@:-]{1,63}$/.test(basePath)) throw new Error(`Invalid base path: "${basePath}". Base path must be a single segment starting with '/' (e.g., '/site-a'), contain only URL-safe characters, and be at most 63 characters after the leading slash.`);
	return basePath;
}
/**
* Get the bundle path for static assets
*/
function getBundlePath(bundleId) {
	return `${getBasePath()}/mobify/bundle/${bundleId}/client/`;
}

//#endregion
//#region src/server/middleware/proxy.ts
/**
* Create proxy middleware for Commerce Cloud API
* Proxies requests from /mobify/proxy/api to the Commerce Cloud API
*/
function createCommerceProxyMiddleware(config) {
	return createProxyMiddleware({
		target: getCommerceCloudApiUrl(config.commerce.api.shortCode, config.commerce.api.proxyHost),
		changeOrigin: true,
		secure: !config.commerce.api.proxyHost
	});
}

//#endregion
//#region src/server/middleware/static.ts
/**
* Create static file serving middleware for client assets
* Serves files from build/client at /mobify/bundle/{BUNDLE_ID}/client/
*/
function createStaticMiddleware(bundleId, projectDirectory) {
	const bundlePath = getBundlePath(bundleId);
	const clientBuildDir = path.join(projectDirectory, "build", "client");
	logger.info(`Serving static assets from ${clientBuildDir} at ${bundlePath}`);
	return express.static(clientBuildDir, { setHeaders: (res) => {
		res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		res.setHeader("x-local-static-cache-control", "1");
	} });
}

//#endregion
//#region src/server/middleware/compression.ts
/**
* Parse and validate COMPRESSION_LEVEL environment variable
* @returns Valid compression level (0-9) or default compression level
*/
function getCompressionLevel() {
	const raw = process.env.COMPRESSION_LEVEL;
	const DEFAULT = zlib.constants.Z_DEFAULT_COMPRESSION;
	if (raw == null || raw.trim() === "") return DEFAULT;
	const level = Number(raw);
	if (!(Number.isInteger(level) && level >= 0 && level <= 9)) {
		logger.warn(`[compression] Invalid COMPRESSION_LEVEL="${raw}". Using default (${DEFAULT}).`);
		return DEFAULT;
	}
	return level;
}
/**
* Create compression middleware for gzip/brotli compression
* Used in preview mode to optimize response sizes
*/
function createCompressionMiddleware() {
	return compression({
		filter: (req, res) => {
			if (req.headers["x-no-compression"]) return false;
			return compression.filter(req, res);
		},
		level: getCompressionLevel()
	});
}

//#endregion
//#region src/server/middleware/logging.ts
/**
* Patterns for URLs to skip logging (static assets and Vite internals)
*/
const SKIP_PATTERNS = [
	"/@vite/**",
	"/@id/**",
	"/@fs/**",
	"/@react-router/**",
	"/src/**",
	"/node_modules/**",
	"**/*.js",
	"**/*.css",
	"**/*.ts",
	"**/*.tsx",
	"**/*.js.map",
	"**/*.css.map"
];
/**
* Create request logging middleware
* Used in dev and preview modes for request visibility
*/
function createLoggingMiddleware() {
	morgan.token("status-colored", (req, res) => {
		const status = res.statusCode;
		let color = chalk.green;
		if (status >= 500) color = chalk.red;
		else if (status >= 400) color = chalk.yellow;
		else if (status >= 300) color = chalk.cyan;
		return color(String(status));
	});
	morgan.token("method-colored", (req) => {
		const method = req.method;
		const colors = {
			GET: chalk.green,
			POST: chalk.blue,
			PUT: chalk.yellow,
			DELETE: chalk.red,
			PATCH: chalk.magenta
		};
		return (method && colors[method] || chalk.white)(method);
	});
	return morgan((tokens, req, res) => {
		return [
			tokens["method-colored"](req, res),
			tokens.url(req, res),
			"-",
			tokens["status-colored"](req, res),
			chalk.gray(`(${tokens["response-time"](req, res)}ms)`)
		].join(" ");
	}, { skip: (req) => {
		return SKIP_PATTERNS.some((pattern) => minimatch(req.url, pattern, { dot: true }));
	} });
}

//#endregion
//#region src/server/middleware/host-header.ts
/**
* Normalizes the X-Forwarded-Host header to support React Router's CSRF validation features.
*
* NOTE: This middleware performs header manipulation as a temporary, internal
* solution for MRT/Lambda environments. It may be updated or removed if React Router
* introduces a first-class configuration for validating against forwarded headers.
*
* React Router v7.12+ uses the X-Forwarded-Host header (preferring it over Host)
* to validate request origins for security. In Managed Runtime (MRT) with a vanity
* domain, the eCDN automatically sets the X-Forwarded-Host to the vanity domain.
* React Router handles cases where this header contains multiple comma-separated
* values by prioritizing the first entry.
*
* This middleware ensures that X-Forwarded-Host is always present by falling back
* to a configured public domain if the header is missing (e.g., local development).
* By only modifying X-Forwarded-Host, we provide a consistent environment for
* React Router's security checks without modifying the internal 'Host' header,
* which is required for environment-specific routing logic (e.g., Hybrid Proxy).
*
* Priority order:
* 1. X-Forwarded-Host: Automatically set by eCDN for vanity domains.
* 2. EXTERNAL_DOMAIN_NAME: Fallback environment variable for the public domain
*    used when no forwarded headers are present (e.g., local development).
*/
function createHostHeaderMiddleware() {
	return (req, _res, next) => {
		if (!req.get("x-forwarded-host") && process.env.EXTERNAL_DOMAIN_NAME) req.headers["x-forwarded-host"] = process.env.EXTERNAL_DOMAIN_NAME;
		next();
	};
}

//#endregion
//#region src/server/utils.ts
/**
* Patch React Router build to rewrite asset URLs with the correct bundle path
* This is needed because the build output uses /assets/ but we preview at /mobify/bundle/{BUNDLE_ID}/client/assets/
*/
function patchReactRouterBuild(build, bundleId) {
	const bundlePath = getBundlePath(bundleId);
	const basePath = getBasePath();
	const patchedAssetsJson = JSON.stringify(build.assets).replace(/"\/assets\//g, `"${bundlePath}assets/`);
	const newAssets = JSON.parse(patchedAssetsJson);
	return Object.assign({}, build, {
		publicPath: bundlePath,
		assets: newAssets,
		...basePath && { basename: basePath }
	});
}

//#endregion
//#region src/server/modes.ts
/**
* Default feature configuration for each server mode
*/
const ServerModeFeatureMap = {
	development: {
		enableProxy: true,
		enableStaticServing: false,
		enableCompression: false,
		enableLogging: true,
		enableAssetUrlPatching: false
	},
	preview: {
		enableProxy: true,
		enableStaticServing: true,
		enableCompression: true,
		enableLogging: true,
		enableAssetUrlPatching: true
	},
	production: {
		enableProxy: false,
		enableStaticServing: false,
		enableCompression: true,
		enableLogging: true,
		enableAssetUrlPatching: true
	}
};

//#endregion
//#region src/otel/mrt-console-span-exporter.ts
var MrtConsoleSpanExporter = class extends ConsoleSpanExporter {
	export(spans, resultCallback) {
		for (const span of spans) try {
			const ctx = span.spanContext();
			const spanData = {
				traceId: ctx.traceId,
				parentId: span.parentSpanId,
				name: span.name,
				id: ctx.spanId,
				kind: span.kind,
				timestamp: hrTimeToTimeStamp(span.startTime),
				duration: span.duration,
				attributes: span.attributes,
				status: span.status,
				events: span.events,
				links: span.links,
				start_time: span.startTime,
				end_time: span.endTime,
				forwardTrace: process.env.SFNEXT_OTEL_ENABLED === "true"
			};
			console.info(JSON.stringify(spanData));
		} catch {}
		resultCallback({ code: ExportResultCode.SUCCESS });
	}
};

//#endregion
//#region src/otel/setup.ts
/**
* A privately-held W3C Trace Context propagator, used to inject `traceparent` onto
* outbound fetches WITHOUT going through OpenTelemetry's global propagator registry.
*
* ## Why not the global propagator?
*
* `UndiciInstrumentation` injects outbound headers by calling the *global* registered
* propagator (`propagation.inject()`). Registering one with `setGlobalPropagator()`
* works locally, but is a silent no-op on Managed Runtime (MRT):
*
*   - The MRT Lambda wrapper bundles its own copy of `@opentelemetry/api` (declared
*     `^1.9.1`, with core/sdk at 2.x) and boots first, creating the version-keyed
*     global registry object (`globalThis[Symbol.for('opentelemetry.js.api.1')]`,
*     stamped `version: "1.9.1"`).
*   - Our SDK bundle ships a *different* copy of `@opentelemetry/api` (`1.9.0`). When
*     our code calls `setGlobalPropagator()`, OTel's `registerGlobal()` compares the
*     registry's recorded version against ours with an EXACT string match — `"1.9.1"
*     !== "1.9.0"` — refuses the registration, and reports the error only to OTel's
*     internal diag channel (which we do not wire up). The propagation slot stays
*     empty, so undici's `propagation.inject()` injects nothing and no `traceparent`
*     reaches SCAPI. Proven on soak: `propagation.fields() === []`, 0/198 outbound
*     requests carried a header.
*
* This is the same multi-instance split that makes inbound `propagation.extract()`
* fail (see `express/middleware.ts`, which bypasses it with `parseTraceParent` +
* `trace.setSpanContext`). MRT's own data-plane tracer solves it the same way: it
* holds a private `new W3CTraceContextPropagator()` and calls `inject()`/`extract()`
* on it directly, never touching the global registry.
*
* Holding our own instance and injecting it ourselves (in the undici `requestHook`)
* makes outbound propagation deterministic and independent of MRT's bundle, its OTel
* version, and its boot order. We deliberately do NOT call `setGlobalPropagator()` —
* leaving the global propagator as the default no-op guarantees undici's own
* `propagation.inject()` (which runs right after our hook) adds nothing, so the
* `traceparent` is written exactly once in every environment.
*/
const outboundPropagator = new W3CTraceContextPropagator();
const SERVICE_NAME = "storefront-next";
/**
* Initializes OpenTelemetry and returns a Tracer from the provider directly.
*
* Returns the tracer via `provider.getTracer()` instead of the global
* `trace.getTracer()` API. In the Vite SSR module runner, the built
* dist/entry/server.js and the externalized @opentelemetry/sdk-trace-node
* resolve @opentelemetry/api to different module instances (different paths
* through pnpm's strict node_modules). Each instance has its own
* ProxyTracerProvider singleton, so `provider.register()` sets the delegate
* on sdk-trace-node's API instance while our code's `trace.getTracer()`
* reads from a separate API instance with no delegate — returning a tracer
* backed by a bare BasicTracerProvider with NoopSpanProcessor.
*
* Getting the tracer directly from the provider bypasses the global registry
* entirely, guaranteeing the tracer uses our configured span processors.
*/
let cachedTracer = null;
const UNDICI_REGISTERED_KEY = Symbol.for("sfnext.otel.undici_registered");
function initTelemetry() {
	if (cachedTracer) return cachedTracer;
	try {
		const provider = new NodeTracerProvider({
			resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
			sampler: new ParentBasedSampler({ root: new AlwaysOnSampler() })
		});
		provider.addSpanProcessor(new SimpleSpanProcessor(new MrtConsoleSpanExporter()));
		provider.register({ propagator: null });
		if (!globalThis[UNDICI_REGISTERED_KEY]) {
			globalThis[UNDICI_REGISTERED_KEY] = true;
			registerInstrumentations({
				tracerProvider: provider,
				instrumentations: [new UndiciInstrumentation({ requestHook(span, request) {
					try {
						span.updateName("sfnext.fetch");
					} catch {}
					try {
						const ctx = trace.setSpan(context.active(), span);
						outboundPropagator.inject(ctx, request, { set(req, key, value) {
							req.addHeader?.(key, value);
						} });
					} catch {}
				} })]
			});
		}
		cachedTracer = provider.getTracer(SERVICE_NAME);
		return cachedTracer;
	} catch (error) {
		logger.error("[otel] Failed to initialize OpenTelemetry:", error);
		return null;
	}
}

//#endregion
//#region src/otel/express/middleware.ts
function createOtelExpressMiddleware() {
	const maybeTracer = initTelemetry();
	if (!maybeTracer) return (_req, _res, next) => next();
	const tracer = maybeTracer;
	return (req, res, next) => {
		try {
			const url = new URL(req.originalUrl || req.url, "http://localhost").pathname;
			const method = req.method;
			const traceparent = req.headers.traceparent;
			const inboundSpanContext = typeof traceparent === "string" ? parseTraceParent(traceparent) : null;
			const parentContext = inboundSpanContext ? trace.setSpanContext(ROOT_CONTEXT, {
				...inboundSpanContext,
				isRemote: true
			}) : ROOT_CONTEXT;
			tracer.startActiveSpan("sfnext.request", {
				kind: SpanKind.SERVER,
				attributes: {
					[ATTR_HTTP_REQUEST_METHOD]: method,
					[ATTR_URL_PATH]: url
				}
			}, parentContext, (serverSpan) => {
				try {
					const spanContext = trace.getSpan(context.active())?.spanContext();
					if (spanContext) {
						const flags = spanContext.traceFlags.toString(16).padStart(2, "0");
						const responseTraceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
						res.setHeader("traceparent", responseTraceparent);
					}
				} catch {}
				const serverCtx = context.active();
				const startTime = performance.now();
				let streamingSpan = null;
				let firstByteMs = 0;
				let ended = false;
				function startStreamingSpan() {
					if (streamingSpan) return;
					try {
						firstByteMs = Math.round(performance.now() - startTime);
						streamingSpan = tracer.startSpan("sfnext.response_streaming", { attributes: {
							[ATTR_HTTP_REQUEST_METHOD]: method,
							[ATTR_URL_PATH]: url
						} }, serverCtx);
					} catch {}
				}
				const origWriteHead = res.writeHead.bind(res);
				res.writeHead = ((...args) => {
					startStreamingSpan();
					return origWriteHead(...args);
				});
				const origWrite = res.write.bind(res);
				res.write = ((...args) => {
					startStreamingSpan();
					return origWrite(...args);
				});
				function endSpans() {
					if (ended) return;
					ended = true;
					try {
						const totalMs = Math.round(performance.now() - startTime);
						const statusCode = res.statusCode;
						if (streamingSpan) {
							streamingSpan.setAttribute("http.streaming_duration_ms", totalMs - firstByteMs);
							streamingSpan.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
							if (statusCode >= 500) streamingSpan.setStatus({ code: SpanStatusCode.ERROR });
							streamingSpan.end();
						}
						serverSpan.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
						serverSpan.setAttribute("http.total_duration_ms", totalMs);
						if (statusCode >= 500) serverSpan.setStatus({ code: SpanStatusCode.ERROR });
						serverSpan.end();
					} catch {}
				}
				res.once("close", endSpans);
				res.once("finish", endSpans);
				next();
			});
		} catch {
			next();
		}
	};
}

//#endregion
//#region src/server/handlers/health-check.ts
const DEFAULT_HEALTH_DESCRIPTION = "storefront-next-dev server health";
const PACKAGE_JSON_NAME = "package.json";
const RUNTIME_PACKAGE_NAME = "@salesforce/storefront-next-runtime";
const DEV_PACKAGE_NAME = "@salesforce/storefront-next-dev";
const BUILD_FOLDER_NAME = "build";
const LOCAL_BUNDLE_ID = "local";
const HEALTH_ENDPOINT_PATH = "/sfdc-health";
/**
* Reads a package.json file and returns selected metadata.
*
* @param path - Absolute path to a package.json file
* @returns Parsed metadata, or null if missing/unreadable
*
* @example
* ```ts
* const metadata = readPackageMetadata('/app/package.json');
* console.log(metadata?.version);
* ```
*/
function readPackageMetadata(path$1) {
	if (!existsSync(path$1)) return null;
	try {
		return JSON.parse(readFileSync(path$1, "utf8"));
	} catch (error) {
		logger.debug(`Health check: failed to parse package.json at ${path$1}`, error);
		return null;
	}
}
/**
* Creates an Express handler that returns Health+JSON for the project.
*
* @param options - Handler options
* @returns Express request handler for the health endpoint
*
* @example
* ```ts
* app.get(HEALTH_ENDPOINT_PATH, createHealthCheckHandler({
*     projectDirectory: process.cwd(),
*     bundleId: LOCAL_BUNDLE_ID,
* }));
* ```
*/
function createHealthCheckHandler(options) {
	const { projectDirectory, bundleId } = options;
	const projectPackage = readPackageMetadata(bundleId === LOCAL_BUNDLE_ID ? resolve(projectDirectory, PACKAGE_JSON_NAME) : resolve(projectDirectory, BUILD_FOLDER_NAME, PACKAGE_JSON_NAME));
	const allDependencies = {
		...projectPackage?.dependencies,
		...projectPackage?.devDependencies
	};
	const devVersion = allDependencies?.[DEV_PACKAGE_NAME];
	const runtimeVersion = allDependencies?.[RUNTIME_PACKAGE_NAME];
	const notes = [devVersion ? `Built using ${DEV_PACKAGE_NAME}@${devVersion}.` : null, runtimeVersion ? `Running ${RUNTIME_PACKAGE_NAME}@${runtimeVersion}.` : null].filter(Boolean);
	return (_req, res) => {
		const healthResponse = {
			status: "pass",
			version: projectPackage?.version,
			bundleId,
			description: projectPackage?.description ?? DEFAULT_HEALTH_DESCRIPTION,
			notes: notes.length > 0 ? notes : void 0
		};
		res.status(200).type("application/health+json").json(healthResponse);
	};
}

//#endregion
//#region src/server/index.ts
/** Relative path to the middleware registry TypeScript source (development). Must match appDirectory + server dir + filename used by buildMiddlewareRegistry plugin. */
const RELATIVE_MIDDLEWARE_REGISTRY_SOURCE = "src/server/middleware-registry.ts";
/** Extensions to try for the built middlewares module (ESM first, then CJS for backwards compatibility). */
const MIDDLEWARE_REGISTRY_BUILT_EXTENSIONS = [
	".mjs",
	".js",
	".cjs"
];
/** All paths to try when loading the built middlewares (base + extension). */
const RELATIVE_MIDDLEWARE_REGISTRY_BUILT_PATHS = ["bld/server/middleware-registry", "build/server/middleware-registry"].flatMap((base) => MIDDLEWARE_REGISTRY_BUILT_EXTENSIONS.map((ext) => `${base}${ext}`));
const DEFAULT_BUNDLE_ID = "local";
/**
* Load MRT_ENV_BASE_PATH from config.server.ts so getBasePath() works in local dev/preview.
* On MRT production, this env var is already set by the Lambda from ssrParameters.envBasePath.
*
* In dev mode this must be called before Vite starts, since the React Router preset
* reads getBasePath() at config time to set the basename.
*
* @param projectDirectory - Project root directory
*/
async function initBasePathEnv(projectDirectory) {
	const runtimeConfig = await loadRuntimeConfig(projectDirectory);
	if (runtimeConfig?.ssrParameters?.envBasePath) process.env.MRT_ENV_BASE_PATH = String(runtimeConfig.ssrParameters.envBasePath);
}
/**
* Create a unified Express server for development, preview, or production mode
*/
async function createServer(options) {
	const { mode, projectDirectory = process.cwd(), config: providedConfig, vite, build, streaming = false, enableProxy = ServerModeFeatureMap[mode].enableProxy, enableStaticServing = ServerModeFeatureMap[mode].enableStaticServing, enableCompression = ServerModeFeatureMap[mode].enableCompression, enableLogging = ServerModeFeatureMap[mode].enableLogging, enableAssetUrlPatching = ServerModeFeatureMap[mode].enableAssetUrlPatching } = options;
	if (mode === "development" && !vite) throw new Error("Vite dev server instance is required for development mode");
	if ((mode === "preview" || mode === "production") && !build) throw new Error("React Router server build is required for preview/production mode");
	const config = providedConfig ?? loadConfigFromEnv();
	const bundleId = process.env.BUNDLE_ID ?? DEFAULT_BUNDLE_ID;
	const app = express();
	app.disable("x-powered-by");
	app.set("trust proxy", true);
	if (process.env.SFNEXT_OTEL_ENABLED === "true") app.use(createOtelExpressMiddleware());
	app.get(HEALTH_ENDPOINT_PATH, createHealthCheckHandler({
		projectDirectory,
		bundleId
	}));
	if (enableLogging) app.use(createLoggingMiddleware());
	if (enableCompression && !streaming) app.use(createCompressionMiddleware());
	if (enableStaticServing && build) {
		const bundlePath = getBundlePath(bundleId);
		app.use(bundlePath, createStaticMiddleware(bundleId, projectDirectory));
	}
	let registry = null;
	if (mode === "development") {
		const middlewareRegistryPath = resolve(projectDirectory, RELATIVE_MIDDLEWARE_REGISTRY_SOURCE);
		if (existsSync(middlewareRegistryPath)) registry = await importTypescript(middlewareRegistryPath, { projectDirectory });
	} else {
		const possiblePaths = RELATIVE_MIDDLEWARE_REGISTRY_BUILT_PATHS.map((p) => resolve(projectDirectory, p));
		let builtRegistryPath = null;
		for (const path$1 of possiblePaths) if (existsSync(path$1)) {
			builtRegistryPath = path$1;
			break;
		}
		if (builtRegistryPath) registry = await import(pathToFileURL(builtRegistryPath).href);
	}
	if (registry?.customMiddlewares && Array.isArray(registry.customMiddlewares)) registry.customMiddlewares.forEach((entry) => {
		app.use(entry.handler);
	});
	if (mode === "development" && vite) app.use(vite.middlewares);
	if (enableProxy) app.use(config.commerce.api.proxy, createCommerceProxyMiddleware(config));
	const basePath = getBasePath();
	if (basePath) app.use((req, res, next) => {
		if (req.path.startsWith(`${basePath}/`) || req.path === basePath) return next();
		if (req.path.startsWith("/mobify/")) return next();
		res.redirect(`${basePath}${req.originalUrl}`);
	});
	app.use(createHostHeaderMiddleware());
	app.all("*splat", await createSSRHandler(mode, bundleId, vite, build, enableAssetUrlPatching));
	return app;
}
/**
* Create the SSR request handler based on mode
*/
async function createSSRHandler(mode, bundleId, vite, build, enableAssetUrlPatching) {
	if (mode === "development" && vite) {
		const { isRunnableDevEnvironment } = await import("vite");
		return async (req, res, next) => {
			try {
				const ssrEnvironment = vite.environments.ssr;
				if (!isRunnableDevEnvironment(ssrEnvironment)) {
					next(/* @__PURE__ */ new Error("SSR environment is not runnable. Please ensure:\n  1. \"@salesforce/storefront-next-dev\" plugin is added to vite.config.ts\n  2. React Router config uses the Storefront Next preset"));
					return;
				}
				await createRequestHandler({
					build: await ssrEnvironment.runner.import("virtual:react-router/server-build"),
					mode: process.env.NODE_ENV
				})(req, res, next);
			} catch (error) {
				vite.ssrFixStacktrace(error);
				next(error);
			}
		};
	} else if (build) {
		let patchedBuild = build;
		if (enableAssetUrlPatching) patchedBuild = patchReactRouterBuild(build, bundleId);
		const requestHandlerMode = process.env.NODE_OPTIONS?.includes("--enable-source-maps") ? "development" : process.env.NODE_ENV;
		return createRequestHandler({
			build: patchedBuild,
			mode: requestHandlerMode
		});
	} else throw new Error("Invalid server configuration: no vite or build provided");
}

//#endregion
export { loadProjectConfig as i, initBasePathEnv as n, getCommerceCloudApiUrl as r, createServer as t };