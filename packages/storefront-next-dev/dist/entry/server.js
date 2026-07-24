import { SpanStatusCode, context, trace } from "@opentelemetry/api";
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE, ATTR_SERVICE_NAME, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { siteContext } from "@salesforce/storefront-next-runtime/site-context";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { AlwaysOnSampler, ConsoleSpanExporter, ParentBasedSampler, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, W3CTraceContextPropagator, hrTimeToTimeStamp } from "@opentelemetry/core";
import { Resource } from "@opentelemetry/resources";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import chalk from "chalk";

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
//#region src/otel/react-router/instrumentation.ts
const tracer = process.env.SFNEXT_OTEL_ENABLED === "true" ? initTelemetry() : null;
/**
* Reads the resolved site from the router context, or `undefined` if the site
* has not been resolved yet (or the context is unavailable).
*
* `siteContext` is set by the site-context middleware (which runs early in the
* middleware chain). We resolve it from the same `@salesforce/storefront-next-runtime`
* module the template's middleware writes to, so both share the one `createContext`
* singleton and this read observes the value that middleware set. Wrapped in a
* try/catch because OTel instrumentation must never break the request pipeline.
*/
function readSiteId(context$1) {
	try {
		if (typeof context$1?.get !== "function") return void 0;
		return context$1.get(siteContext)?.site?.id;
	} catch {
		return;
	}
}
/**
* Runs `handle` inside an active OTel span, recording errors and ending the span.
* When `tracer` is null (OTel disabled), calls `handle` directly with no overhead.
*
* The resolved site id is read from `context` and stamped just before the span
* ends. It is read at span end (not span start) because the site-context
* middleware runs as part of the wrapped work — at span start the site may not be
* resolved yet; by span end it is. The site id is a bounded, low-cardinality value.
*
* It is emitted under the key `site_name` (not `sfnext.site_id`): the MRT log→trace
* bridge filters span attributes against an allow list and only keeps matching
* keys, and `site_name` is on that list (confirmed with the MRT team) while
* `site_id`/`sfnext.*` keys are not. The site config carries no separate display
* name, so the site id is the value we have. See ../README.md ("MRT log→trace bridge").
*
* Route-level spans (`sfnext.loader`/`.action`/`.middleware`) always receive the
* router `context`, so they carry `site_name`. The handler-level `sfnext.ssr` span
* does NOT: React Router passes `context: undefined` to the request-handler
* instrumentation (confirmed at runtime), so `readSiteId` returns `undefined`
* there and the attribute is simply omitted. No branching needed — the
* `if (siteId)` guard handles both cases uniformly.
*/
async function traced(spanName, attributes, context$1, handle) {
	if (!tracer) {
		await handle();
		return;
	}
	let handled = false;
	try {
		await tracer.startActiveSpan(spanName, { attributes }, async (span) => {
			try {
				handled = true;
				const result = await handle();
				if (result.status === "error" && result.error) {
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: result.error.message
					});
					span.recordException(result.error);
				}
			} finally {
				const siteId = readSiteId(context$1);
				if (siteId) span.setAttribute("site_name", siteId);
				span.end();
			}
		});
	} catch {
		if (!handled) await handle();
	}
}
/**
* HTTP attributes common to all spans.
* url.path only — url.full would expose query params which may contain auth
* tokens or PII. http.response.status_code is not available from
* InstrumentationHandlerResult.
*/
function httpAttributes(request) {
	const attrs = { [ATTR_HTTP_REQUEST_METHOD]: request.method };
	try {
		attrs[ATTR_URL_PATH] = new URL(request.url).pathname;
	} catch {}
	return attrs;
}
const platformInstrumentation = {
	handler(handler) {
		handler.instrument({ async request(handleRequest, { request, context: context$1 }) {
			await traced("sfnext.ssr", httpAttributes(request), context$1, handleRequest);
		} });
	},
	route(route) {
		function routeAttributes(pattern) {
			return { [ATTR_HTTP_ROUTE]: pattern };
		}
		route.instrument({
			async loader(handleLoader, { pattern, context: context$1 }) {
				await traced("sfnext.loader", routeAttributes(pattern), context$1, handleLoader);
			},
			async action(handleAction, { pattern, context: context$1 }) {
				await traced("sfnext.action", routeAttributes(pattern), context$1, handleAction);
			},
			async middleware(handleMiddleware, { pattern, context: context$1 }) {
				await traced("sfnext.middleware", routeAttributes(pattern), context$1, handleMiddleware);
			}
		});
	}
};

//#endregion
//#region src/entry/server.ts
/**
* Composes a server entry module with platform-level features.
*
* - Spreads all app module properties to forward unknown/future exports
* - Wraps the default handler for platform-level processing
* - Prepends a platform instrumentation to instrumentations
*/
function composeServerEntry(appModule) {
	if (process.env.NODE_ENV !== "production" && "unstable_instrumentations" in appModule && !("instrumentations" in appModule)) console.warn("[storefront-next] entry.server exports `unstable_instrumentations`, which React Router 7.18 no longer reads. Rename the export to `instrumentations` or it will not register.");
	return {
		...appModule,
		default(request, statusCode, headers, context$1, loadContext) {
			return appModule.default(request, statusCode, headers, context$1, loadContext);
		},
		instrumentations: [platformInstrumentation, ...appModule.instrumentations ?? []]
	};
}

//#endregion
export { composeServerEntry };
//# sourceMappingURL=server.js.map