import "./env2.js";
import { i as siteContext } from "./site-context2.js";
import "./apply-url-config.js";
import { createContext } from "react-router";
import { DataStore, DataStore as DataStore$1, DataStoreNotFoundError, DataStoreNotFoundError as DataStoreNotFoundError$1, DataStoreServiceError, DataStoreServiceError as DataStoreServiceError$1, DataStoreUnavailableError, DataStoreUnavailableError as DataStoreUnavailableError$1 } from "@salesforce/mrt-utilities/data-store";

//#region src/data-store/logger-context.ts
function formatMessage(message, metadata) {
	if (!metadata) return message;
	try {
		return `${message} ${JSON.stringify(metadata, replacerForErrors)}`;
	} catch {
		return `${message} [unserializable metadata]`;
	}
}
function replacerForErrors(_key, value) {
	if (value instanceof Error) return {
		name: value.name,
		message: value.message,
		...value.stack && { stack: value.stack }
	};
	return value;
}
/**
* Default logger used when nothing has been injected via
* {@link dataStoreLoggerContext}. Routes warnings to `console.warn` and
* errors to `console.error` so diagnostics remain visible in environments
* (tests, scripts, hosts that haven't wired a structured logger) where the
* SDK is invoked outside the storefront template. `info` and `debug` are
* no-ops to avoid noisy default output.
*/
const consoleLogger = Object.freeze({
	error(message, metadata) {
		console.error(formatMessage(message, metadata));
	},
	warn(message, metadata) {
		console.warn(formatMessage(message, metadata));
	},
	info() {},
	debug() {}
});
/**
* Router context the SDK reads to obtain a request-scoped structured logger.
*
* Hosts (e.g. the storefront template) populate this from their own logging
* middleware. When unset, {@link getDataStoreLogger} falls back to a
* console-based logger so warnings remain visible.
*
* Defaults to `null` (not `undefined`) because React Router's
* `context.get()` throws when `defaultValue === undefined`.
*/
const dataStoreLoggerContext = createContext(null);
/**
* Read the data-store logger from router context, falling back to a
* console-based default when nothing has been injected.
*
* Use this from inside SDK middleware/loaders that have access to a
* {@link RouterContextProvider}.
*/
function getDataStoreLogger(context) {
	return context.get(dataStoreLoggerContext) ?? consoleLogger;
}

//#endregion
//#region src/data-store/entry-cache.ts
/**
* Cross-request L1 cache for MRT data-store entries.
*
* The data-store table exposes every preference entry under a single partition key
* (`"${MOBIFY_PROPERTY_ID} ${DEPLOY_TARGET}"`), so a storefront under load funnels tens of thousands of reads/sec
* onto one physical DynamoDB partition and hits hot-key throttling. This cache lets a warm Lambda container serve
* repeat reads of the same (deployment- and site-scoped) entry from memory instead of re-reading DynamoDB on every
* request.
*
* ## Why the cache lives on `globalThis`
*
* A single Lambda container serves many sequential requests — for different shoppers — reusing the same process.
* To survive across those requests the cache must outlive any request-scoped structure (React Router context, the
* lazy middleware's per-request promise) AND any module-scope that the SSR bundle may re-evaluate or duplicate.
* A top-level `const` is not reliable: the server bundle can re-run the module graph or ship duplicate chunks,
* each getting its own fresh `const`, so cross-request reuse would silently never happen. Anchoring the singleton
* on `globalThis` via a registered `Symbol.for(...)` key makes every module copy resolve to the one container-global
* instance.
*
* ## Correctness invariant
*
* Because the instance is shared process-wide across all shoppers, ONLY deployment-/site-scoped state may be cached —
* never shopper-specific data. This holds for the built-in preference entries: their keys are fully qualified and
* site-prefixed (e.g. `acme-custom-site-preferences`) and the values are not shopper-bound. The cache keys on the
* resolved entry key, so per-site isolation is automatic. Only successful reads are cached; transient failures and
* missing entries are never stored, so a blip never persists for the TTL.
*
* ## Enablement and TTLs
*
* Off by default; opt in per environment. {@link DATA_STORE_CACHE_ENABLED_ENV} is the sole on/off switch: set it to
* `true` to turn the cache on (e.g. in the deployed MRT environment where the hot-partition read volume is the
* concern). Any other value, or leaving it unset, keeps the cache off, so tests and local development read straight
* through to the data store and never share cross-request state unless they ask for it.
* {@link DATA_STORE_CACHE_DEFAULT_TTL_ENV} (default {@link DATA_STORE_CACHE_DEFAULT_TTL} ms) is the base TTL used
* for the preference entries, while callers that cache slower-changing data pass an explicit `ttlMs` to
* {@link writeDataStoreCache}. Any non-positive or non-numeric TTL falls back to its default rather than disabling the
* cache. All three env vars are read once when the module is first evaluated — on MRT the environment is fixed for a
* container's lifetime, so this keeps the lookups off the per-request read/write path.
*
* ## Bounded size
*
* The store is bounded by the total UTF-8 byte size of its cached values ({@link DATA_STORE_CACHE_DEFAULT_MAXBYTES}),
* not an entry count, so a caller that stores a large value cannot grow a warm container's memory without bound and
* the bound holds regardless of how many keys are cached or how big each value is. Each value's size is measured once
* on write; a write past the byte budget evicts the least-recently-used key until the store fits again. A hit
* re-inserts its key (Map preserves insertion order), so frequently-read entries stay hot. A value larger than the
* whole budget is never cached — caching it would flush every other key — so it is read straight from DynamoDB each
* time.
*
* @env MRT_DATA_STORE_CACHE_ENABLED (optional): `'true'` enables the cache; any other value (or unset) leaves it
*   disabled. Default: `false`. Example: `MRT_DATA_STORE_CACHE_ENABLED=true`.
* @env MRT_DATA_STORE_CACHE_TTL (optional): base TTL in milliseconds (preference entries). A zero, negative, or
*   non-numeric value falls back to the default. Default: `300000`. Example: `MRT_DATA_STORE_CACHE_TTL=300000`.
* @env MRT_DATA_STORE_CACHE_MAXBYTES (optional): upper bound on the total UTF-8 byte size of cached values. A zero,
*   negative, or non-numeric value falls back to the default. Default: `131072` (128 KiB).
*   Example: `MRT_DATA_STORE_CACHE_MAXBYTES=262144`.
*/
/** Env var toggling the cache on/off. `'true'` enables it; anything else (or unset) leaves it disabled. */
const DATA_STORE_CACHE_ENABLED_ENV = "MRT_DATA_STORE_CACHE_ENABLED";
/** Env var controlling the cache TTL (ms). `0`/negative/non-numeric ⇒ falls back to the default. */
const DATA_STORE_CACHE_DEFAULT_TTL_ENV = "MRT_DATA_STORE_CACHE_TTL";
/** Default TTL (ms), applied when {@link DATA_STORE_CACHE_DEFAULT_TTL_ENV} is unset or cannot be parsed as a positive number. */
const DATA_STORE_CACHE_DEFAULT_TTL = 3e5;
/** Env var controlling the cache byte budget. `0`/negative/non-numeric ⇒ falls back to the default. */
const DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV = "MRT_DATA_STORE_CACHE_MAXBYTES";
/**
* Default byte budget (128 KiB), applied when {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV} is unset or cannot be parsed as a
* positive number. The store evicts the least-recently-used key until the total UTF-8 size of its cached values fits.
*/
const DATA_STORE_CACHE_DEFAULT_MAXBYTES = 128 * 1024;
/** Emit a cache-stats log line once every this many lookups (per warm container). */
const DATA_STORE_CACHE_LOG_INTERVAL = 100;
/** Global registry key. `Symbol.for` shares one instance across duplicated module copies. */
const CACHE_SYMBOL = Symbol.for("@salesforce/storefront-next-runtime/data-store/entry-cache");
function getState() {
	const globalWithCache = globalThis;
	return globalWithCache[CACHE_SYMBOL] ??= {
		store: /* @__PURE__ */ new Map(),
		hits: 0,
		misses: 0,
		totalBytes: 0,
		lookupsSinceLog: 0
	};
}
/** Parse a positive-integer env value, falling back to `fallback` for empty, zero, negative, or non-numeric input. */
function resolvePositiveInt(raw, fallback) {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.floor(parsed);
}
/**
* Cache configuration, resolved once when the module is first evaluated. On MRT the environment is fixed for a
* container's lifetime (set at cold start), so reading these env vars once keeps them off the per-request read/write
* path — where a native `process.env` lookup would otherwise run on every data-store access — without losing any
* runtime behaviour. Tests that exercise different configurations re-import the module after setting the env vars.
*/
const CACHE_ENABLED = process.env[DATA_STORE_CACHE_ENABLED_ENV] === "true";
const CACHE_DEFAULT_TTL_MS = resolvePositiveInt(process.env[DATA_STORE_CACHE_DEFAULT_TTL_ENV], DATA_STORE_CACHE_DEFAULT_TTL);
const CACHE_MAX_BYTES = resolvePositiveInt(process.env[DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV], DATA_STORE_CACHE_DEFAULT_MAXBYTES);
/**
* The configured TTL in milliseconds, resolved once at module load. Always a positive value: falls back to
* {@link DATA_STORE_CACHE_DEFAULT_TTL} when the env var is unset or cannot be parsed as a positive number (empty,
* zero, negative, or non-numeric). Enablement is governed solely by {@link isDataStoreCacheEnabled}.
*/
function getDataStoreCacheDefaultTtl() {
	return CACHE_DEFAULT_TTL_MS;
}
/**
* The configured byte budget, resolved once at module load. Always a positive value: falls back to
* {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES} when {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV} is unset or cannot be parsed as
* a positive number (empty, zero, negative, or non-numeric).
*/
function getDataStoreCacheDefaultMaxBytes() {
	return CACHE_MAX_BYTES;
}
/**
* Whether the L1 cache is enabled, resolved once at module load. Off by default; the sole switch is
* {@link DATA_STORE_CACHE_ENABLED_ENV} — set it to `'true'` to opt in. Any other value (or unset) leaves it disabled,
* so tests and local development never share cross-request state unless they ask for it.
*/
function isDataStoreCacheEnabled() {
	return CACHE_ENABLED;
}
/**
* Read a cached entry by its resolved (site-prefixed) key. Returns `undefined` on a miss, on a stale record (which is
* evicted), or when the cache is disabled. Records a hit/miss and, every {@link DATA_STORE_CACHE_LOG_INTERVAL} lookups,
* emits a stats line through the injected logger.
*/
function readDataStoreCache(key, logger) {
	if (!isDataStoreCacheEnabled()) return;
	const state = getState();
	const record = state.store.get(key);
	let result;
	if (!record) state.misses++;
	else if (Date.now() >= record.expiresAt) {
		removeRecord(state, key);
		state.misses++;
	} else {
		state.hits++;
		result = record.entry;
		state.store.delete(key);
		state.store.set(key, record);
	}
	maybeLogStats(state, logger);
	return result;
}
/**
* Store a successfully-fetched entry under its resolved (site-prefixed) key. No-op when the cache is disabled. Callers
* must only pass successful reads — never fallbacks, missing states, or errors — so a transient failure never persists
* for the TTL.
*
* `ttlMs` overrides the base TTL for slower-changing data; when omitted the preference TTL
* ({@link getDataStoreCacheDefaultTtl}) applies. The store is bounded by {@link getDataStoreCacheDefaultMaxBytes}; a
* write past the byte budget evicts the least-recently-used key until it fits. A value larger than the whole budget is
* never cached — it would flush every other key — and any stale record already under that key is dropped so a later
* read cannot serve it.
*/
function writeDataStoreCache(key, entry, ttlMs) {
	if (!isDataStoreCacheEnabled()) return;
	const state = getState();
	const maxBytes = getDataStoreCacheDefaultMaxBytes();
	const bytes = measureBytes(entry);
	if (bytes > maxBytes) {
		removeRecord(state, key);
		return;
	}
	const ttl = ttlMs ?? getDataStoreCacheDefaultTtl();
	removeRecord(state, key);
	state.store.set(key, {
		entry: deepFreeze(entry),
		expiresAt: Date.now() + ttl,
		bytes
	});
	state.totalBytes += bytes;
	evictUntilWithinBudget(state, maxBytes);
}
/**
* Recursively freeze a value and everything reachable from it, returning the same reference. Guards against the shared
* cache handing out mutable objects: consumers receive the frozen `entry` by reference, so a stray write throws (strict
* mode) rather than poisoning the process-global cache. Cheap for the small, tree-shaped preference values cached here.
*/
function deepFreeze(value) {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const nested of Object.values(value)) deepFreeze(nested);
	return value;
}
/** Measure the UTF-8 byte size of an entry's value. `undefined` serializes to `"null"` rather than throwing. */
function measureBytes(entry) {
	return Buffer.byteLength(JSON.stringify(entry.value ?? null), "utf8");
}
/** Delete a key from the store and decrement `totalBytes` by its size, keeping the running sum invariant. */
function removeRecord(state, key) {
	const record = state.store.get(key);
	if (!record) return;
	state.store.delete(key);
	state.totalBytes -= record.bytes;
}
/** Drop least-recently-used keys until the store's total byte size is within `maxBytes`. */
function evictUntilWithinBudget(state, maxBytes) {
	for (const oldest of state.store.keys()) {
		if (state.totalBytes <= maxBytes) break;
		removeRecord(state, oldest);
	}
}
function maybeLogStats(state, logger) {
	state.lookupsSinceLog++;
	if (state.lookupsSinceLog < DATA_STORE_CACHE_LOG_INTERVAL) return;
	state.lookupsSinceLog = 0;
	logger?.info("Data store L1 cache stats", {
		size: state.store.size,
		hits: state.hits,
		misses: state.misses,
		bytes: state.totalBytes
	});
}

//#endregion
//#region src/data-store/utils.ts
/**
* Creates a typed React Router context for data store entries.
*
* Initializes the context with `null` so middleware can populate it during requests.
*
* @returns React Router context key for data store values
*/
function createDataStoreContext() {
	return createContext(null);
}
/**
* Creates a React Router middleware that fetches a single MRT data store entry on every
* request and stores the resulting value in the supplied router context.
*
* Failure handling is controlled by `options.onUnavailable`:
* - `'throw'` (default for the factory): rethrow `DataStoreUnavailableError` and
*   `DataStoreServiceError` with a stable error message. Fail-fast — the request errors out.
* - `'fallback'`: log a warning and resolve to `options.fallbackValue` when configured, or
*   to the missing state (context not populated) when no `fallbackValue` is provided. The
*   request continues without crashing the middleware chain.
*
* `DataStoreNotFoundError` is always treated as "missing" (warn, do not populate context),
* regardless of `onUnavailable` — a not-found entry is an expected steady-state for
* features that haven't been published yet, not a service failure.
*
* Errors thrown from `options.transform` propagate to the caller — they indicate a
* programmer error in the middleware definition, not data-store unavailability.
*
* @param options - See {@link DataStoreMiddlewareOptions}.
* @returns React Router middleware for server requests.
*
* @env AWS_REGION (required): AWS region for the data store table (e.g., `us-east-1`).
* @env MOBIFY_PROPERTY_ID (required): MRT property identifier.
* @env DEPLOY_TARGET (required): MRT deploy target (e.g., `production`).
*/
function createDataStoreMiddleware(options) {
	const { entryKey, context: contextKey, onUnavailable = "throw", fallbackValue } = options;
	const transform = options.transform ?? ((value) => value);
	const dataStoreMiddleware$1 = async ({ context }, next) => {
		const result = await loadDataStoreEntry({
			entryKey: typeof entryKey === "function" ? entryKey(context) : entryKey,
			context,
			transform,
			onUnavailable,
			fallbackValue
		});
		if (result.state === "value" || result.state === "fallback") context.set(contextKey, result.value);
		return next();
	};
	return dataStoreMiddleware$1;
}
/**
* Lazy variant of {@link createDataStoreMiddleware}. Instead of fetching the
* entry up-front during middleware execution, this stores a memoized loader
* in the router context. Consumers call {@link readLazyDataStoreEntry} to
* trigger the fetch on demand — pages that never read the value never pay
* for the data-store call.
*
* Repeated reads within the same request share the in-flight promise so
* the entry is fetched at most once per request.
*
* Failure handling matches the eager variant: `onUnavailable` and
* `fallbackValue` are honored when the underlying fetch fails. The fallback
* value (or `null` for the missing state) surfaces through
* {@link readLazyDataStoreEntry}.
*
* Use this for entries that only a subset of routes consume (e.g. config
* read by a single feature) rather than entries needed on every request.
*/
function createLazyDataStoreMiddleware(options) {
	const { entryKey, context: contextKey, onUnavailable = "throw", fallbackValue } = options;
	const transform = options.transform ?? ((value) => value);
	const lazyMiddleware = async ({ context }, next) => {
		let pending;
		const loader = () => {
			if (!pending) pending = loadDataStoreEntry({
				entryKey: typeof entryKey === "function" ? entryKey(context) : entryKey,
				context,
				transform,
				onUnavailable,
				fallbackValue
			}).then((result) => result.state === "missing" ? null : result.value);
			return pending;
		};
		context.set(contextKey, loader);
		return next();
	};
	return lazyMiddleware;
}
/**
* Reads a value populated by {@link createLazyDataStoreMiddleware}. Triggers
* the underlying data-store fetch on first call and reuses the cached
* promise on subsequent calls within the same request.
*
* Returns `null` when the lazy middleware did not run (no loader in
* context) or when the entry is missing/invalid.
*/
async function readLazyDataStoreEntry(context, contextKey) {
	const loader = context.get(contextKey);
	if (typeof loader !== "function") return null;
	return loader();
}
/**
* Internal helper shared by the eager and lazy middleware factories.
* Performs the fetch + transform pipeline and resolves all three error
* paths (unavailable / not-found / service-error) consistently. Returns a
* tagged result so callers can decide whether to populate the context
* synchronously (eager middleware) or hand the value back to a lazy reader.
*
* This is the single funnel every eager and lazy data-store middleware read passes through, so the cross-request L1
* cache (see {@link readDataStoreCache}) is consulted here. A fresh cached entry is served without touching
* DynamoDB; only successful reads (a present, object-shaped `value`) are cached, so a missing entry or a thrown error
* (not-found, unavailable, service error) is never stored and transient failures don't persist for the TTL.
*/
async function loadDataStoreEntry(args) {
	const { entryKey, context, transform, onUnavailable, fallbackValue } = args;
	const logger = getDataStoreLogger(context);
	try {
		const cached = readDataStoreCache(entryKey, logger);
		const entry = cached ?? await getDataStoreEntry(entryKey);
		if (!entry?.value || typeof entry.value !== "object") {
			logger.debug(`Data store entry '${entryKey}' not found or invalid.`, { entryKey });
			return { state: "missing" };
		}
		const value = transform(entry.value);
		if (!cached) writeDataStoreCache(entryKey, entry);
		return {
			state: "value",
			value
		};
	} catch (error) {
		if (error instanceof DataStoreNotFoundError$1) {
			logger.debug(`Data store entry '${entryKey}' not found.`, { entryKey });
			return { state: "missing" };
		}
		if (error instanceof DataStoreUnavailableError$1 || error instanceof DataStoreServiceError$1) return resolveDataStoreFallback({
			entryKey,
			context,
			error,
			onUnavailable,
			fallbackValue,
			logger
		});
		throw error;
	}
}
function resolveDataStoreFallback(args) {
	const { entryKey, context, error, onUnavailable, fallbackValue, logger } = args;
	const reason = error instanceof DataStoreServiceError$1 ? "service error" : "unavailable";
	if (onUnavailable === "fallback") {
		if (typeof fallbackValue !== "undefined") {
			const resolved = typeof fallbackValue === "function" ? fallbackValue(context) : fallbackValue;
			logger.warn(`Data store ${reason} for '${entryKey}'. Using configured fallback value.`, {
				entryKey,
				reason,
				error
			});
			return {
				state: "fallback",
				value: resolved
			};
		}
		logger.warn(`Data store ${reason} for '${entryKey}'. No fallback configured; treating entry as missing.`, {
			entryKey,
			reason,
			error
		});
		return { state: "missing" };
	}
	if (error instanceof DataStoreUnavailableError$1) throw new Error("Data store is unavailable. Ensure AWS_REGION, MOBIFY_PROPERTY_ID, and DEPLOY_TARGET are set.");
	throw new Error(`Data store request failed for '${entryKey}'.`);
}
/**
* Read a data-store entry through the singleton MRT utilities API.
* The underlying implementation (production DynamoDB vs development pseudo store)
* is resolved by `@salesforce/mrt-utilities/data-store` export conditions.
*
* @param key - Data-store entry key
* @returns Data-store entry or null when missing/invalid shape
*/
async function getDataStoreEntry(key) {
	const entry = await DataStore$1.getDataStore().getEntry(key);
	if (!entry || typeof entry !== "object") return null;
	return entry;
}
/**
* Creates an entryKey function that prefixes the given suffix with the current site ID.
*
* @param suffix - The entry key suffix (e.g., "custom-site-preferences")
* @returns A function compatible with `DataStoreMiddlewareOptions.entryKey`
*/
function prefixWithSiteId(suffix) {
	return (context) => {
		const siteId = context.get(siteContext)?.site?.id;
		if (!siteId) throw new Error("Site id not found. Ensure site context middleware runs before data-store middleware.");
		return `${siteId}-${suffix}`;
	};
}

//#endregion
//#region src/data-store/middleware/custom-site-preferences.ts
const sitePreferencesContext = createDataStoreContext();
const SITE_PREFERENCES_ENTRY_KEY = prefixWithSiteId("custom-site-preferences");
const SITE_PREFERENCES_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === "throw" ? "throw" : "fallback";
/**
* Read site preferences from router context.
*
* @deprecated Use {@link getSitePreferencesLazy} with {@link customSitePreferencesMiddlewareLazy}.
* The eager pairing fetches the `custom-site-preferences` entry on every request that reaches
* the middleware — even routes that never read it — which drives avoidable DynamoDB read
* volume on the single shared data-store partition. The lazy pairing only hits the data store when
* a consumer actually reads the value.
*
* @param context - Router context provider
* @returns Site preferences data stored by data-store middleware
*/
function getSitePreferences(context) {
	const data = context.get(sitePreferencesContext);
	if (!data) {
		getDataStoreLogger(context).debug("Data store context not found. Ensure data-store middleware runs before loaders and the required env vars are set.");
		return {};
	}
	return data;
}
/**
* Read site preferences populated by {@link customSitePreferencesMiddlewareLazy}. Triggers the
* data-store fetch on first call within a request and reuses the cached promise on subsequent
* calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
* callers should coalesce to their own default (e.g. `?? {}`).
*
* @param context - Router context provider
* @returns Site preferences, or `null` when unavailable
*/
function getSitePreferencesLazy(context) {
	return readLazyDataStoreEntry(context, sitePreferencesContext);
}
/**
* Middleware that reads the site-scoped `custom-site-preferences` entry from the MRT data
* store and stores it in {@link sitePreferencesContext}. The entry key is prefixed with
* the current site id (e.g. `acme-custom-site-preferences`).
*
* @deprecated Use {@link customSitePreferencesMiddlewareLazy} with {@link getSitePreferencesLazy}.
* This eager variant fetches on every request that reaches it; the lazy variant defers the
* fetch until a consumer reads the value.
*
* Defaults to graceful degradation: if the data store is unavailable or returns a service
* error, the request continues with `{}` as the preferences value rather than crashing.
* Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
* fail-fast behavior. The env var is read once at module load.
*
* Must run after the site-context middleware (so the site id is available for the entry
* key) and before any loader that calls {@link getSitePreferences}.
*/
const customSitePreferencesMiddleware = createDataStoreMiddleware({
	entryKey: SITE_PREFERENCES_ENTRY_KEY,
	context: sitePreferencesContext,
	onUnavailable: SITE_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: {}
});
/**
* Lazy variant of {@link customSitePreferencesMiddleware}. Registers a memoized loader in
* {@link sitePreferencesContext} instead of fetching up front, so only consumers that read the
* value via {@link getSitePreferencesLazy} pay for the data-store round trip. Same entry key,
* fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager variant.
*
* Must run after the site-context middleware (so the site id is available for the entry key).
*/
const customSitePreferencesMiddlewareLazy = createLazyDataStoreMiddleware({
	entryKey: SITE_PREFERENCES_ENTRY_KEY,
	context: sitePreferencesContext,
	onUnavailable: SITE_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: {}
});

//#endregion
//#region src/data-store/middleware/custom-global-preferences.ts
const DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY = "custom-global-preferences";
const customGlobalPreferencesContext = createDataStoreContext();
const CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === "throw" ? "throw" : "fallback";
/**
* Read custom global preferences from router context.
*
* @deprecated Use {@link getCustomGlobalPreferencesLazy} with
* {@link customGlobalPreferencesMiddlewareLazy}. The eager pairing fetches the
* `custom-global-preferences` entry on every request that reaches the middleware — even routes
* that never read it — which drives avoidable DynamoDB read volume on the single shared
* data-store partition. The lazy pairing only hits the data store when a consumer actually reads the value.
*
* @param context - Router context provider
* @returns Custom global preferences data stored by data-store middleware
*/
function getCustomGlobalPreferences(context) {
	const data = context.get(customGlobalPreferencesContext);
	if (!data) {
		getDataStoreLogger(context).debug("Custom global preferences context not found. Ensure data-store middleware runs before loaders and the required env vars are set.");
		return {};
	}
	return data;
}
/**
* Read custom global preferences populated by {@link customGlobalPreferencesMiddlewareLazy}.
* Triggers the data-store fetch on first call within a request and reuses the cached promise on
* subsequent calls. Returns `null` when the lazy middleware did not run or the entry is
* missing/invalid; callers should coalesce to their own default (e.g. `?? {}`).
*
* @param context - Router context provider
* @returns Custom global preferences, or `null` when unavailable
*/
function getCustomGlobalPreferencesLazy(context) {
	return readLazyDataStoreEntry(context, customGlobalPreferencesContext);
}
/**
* Middleware that reads the global `custom-global-preferences` entry from the MRT data
* store and stores it in {@link customGlobalPreferencesContext}.
*
* @deprecated Use {@link customGlobalPreferencesMiddlewareLazy} with
* {@link getCustomGlobalPreferencesLazy}. This eager variant fetches on every request that
* reaches it; the lazy variant defers the fetch until a consumer reads the value.
*
* Defaults to graceful degradation: if the data store is unavailable or returns a service
* error, the request continues with `{}` as the preferences value rather than crashing.
* Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
* fail-fast behavior. The env var is read once at module load.
*/
const customGlobalPreferencesMiddleware = createDataStoreMiddleware({
	entryKey: DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY,
	context: customGlobalPreferencesContext,
	onUnavailable: CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: {}
});
/**
* Lazy variant of {@link customGlobalPreferencesMiddleware}. Registers a memoized loader in
* {@link customGlobalPreferencesContext} instead of fetching up front, so only consumers that
* read the value via {@link getCustomGlobalPreferencesLazy} pay for the data-store round trip.
* Same entry key, fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager
* variant.
*/
const customGlobalPreferencesMiddlewareLazy = createLazyDataStoreMiddleware({
	entryKey: DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY,
	context: customGlobalPreferencesContext,
	onUnavailable: CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: {}
});

//#endregion
//#region src/data-store/middleware/gcp-preferences.ts
const DEFAULT_GCP_PREFERENCES_KEY = "gcp";
/**
* Map keys inside the `gcp` data store entry. The ECOM MRT sync job writes
* to these exact keys; keep in sync with the sync job contract.
*/
const API_KEY_MAP_KEY = "api-key";
const gcpPreferencesContext = createDataStoreContext();
const GCP_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === "throw" ? "throw" : "fallback";
const GCP_FALLBACK = Object.freeze({ apiKey: "" });
const transformGcpPreferences = (value) => {
	const rawKey = value[API_KEY_MAP_KEY];
	return { apiKey: typeof rawKey === "string" ? rawKey : "" };
};
/**
* Read the GCP (Google Cloud Platform) preferences object from router context.
*
* @deprecated Use {@link getGcpPreferencesLazy} with {@link gcpPreferencesMiddlewareLazy}.
* The eager pairing fetches the `gcp` entry on every request that reaches the middleware —
* even routes that never read it — which drives avoidable DynamoDB read volume on the single
* shared data-store partition. The lazy pairing only hits the data store when a loader actually
* reads the value.
*
* The preferences are sourced from the MRT data store entry `gcp`, which is
* populated only for storefronts connecting to production ECOM instances.
* In non-production environments, or when the entry is missing, returns an
* object whose fields are all empty/default.
*
* @param context - Router context provider
* @returns GCP preferences object; fields are empty/default when the entry is unavailable
*/
function getGcpPreferences(context) {
	const data = context.get(gcpPreferencesContext);
	if (data === null) {
		getDataStoreLogger(context).debug("GCP preferences context not found. Ensure gcpPreferencesMiddleware runs before loaders, or expect empty values in environments without the MRT data store entry.");
		return { apiKey: "" };
	}
	return data;
}
/**
* Convenience getter for the Google Cloud API key alone.
*
* @deprecated Use {@link getGcpApiKeyLazy} with {@link gcpPreferencesMiddlewareLazy}. See
* {@link getGcpPreferences} for why the eager pairing is discouraged.
*
* Equivalent to `getGcpPreferences(context).apiKey`.
*
* @param context - Router context provider
* @returns The GCP API key, or an empty string when unavailable
*/
function getGcpApiKey(context) {
	return getGcpPreferences(context).apiKey;
}
/**
* Read GCP preferences populated by {@link gcpPreferencesMiddlewareLazy}. Triggers the
* data-store fetch on first call within a request and reuses the cached promise on subsequent
* calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
* callers should coalesce to their own default.
*
* @param context - Router context provider
* @returns GCP preferences, or `null` when unavailable
*/
function getGcpPreferencesLazy(context) {
	return readLazyDataStoreEntry(context, gcpPreferencesContext);
}
/**
* Convenience getter for the Google Cloud API key alone, backed by
* {@link gcpPreferencesMiddlewareLazy}. Coalesces the lazy `null` (middleware absent, entry
* missing, or data store unavailable) to an empty string, matching {@link getGcpApiKey}.
*
* @param context - Router context provider
* @returns The GCP API key, or an empty string when unavailable
*/
async function getGcpApiKeyLazy(context) {
	return (await getGcpPreferencesLazy(context))?.apiKey ?? "";
}
/**
* Middleware that reads the OOTB GCP preferences from the MRT data store and
* stores them in the router context. The entry shape is `{ "api-key": string, ... }`
* under data store key `gcp`. Missing/invalid fields coerce to empty/default values.
*
* @deprecated Use {@link gcpPreferencesMiddlewareLazy} with {@link getGcpApiKeyLazy}.
* This eager variant fetches on every request that reaches it; the lazy variant defers the
* fetch until a loader reads the value.
*
* Only available for storefronts connecting to production ECOM instances. When the entry
* is not synced (e.g. the GCP feature flag is off in ECOM), the underlying fetch surfaces
* as `DataStoreNotFoundError` and the context is left unset; consumers see the empty
* default `{ apiKey: '' }` via {@link getGcpPreferences}.
*
* Defaults to graceful degradation: if the data store is unavailable or returns a service
* error, the request continues with `{ apiKey: '' }` rather than crashing. Set
* `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
* fail-fast behavior. The env var is read once at module load.
*
* Must run before any loader/middleware that reads `getGcpPreferences(context)` or
* `getGcpApiKey(context)`.
*/
const gcpPreferencesMiddleware = createDataStoreMiddleware({
	entryKey: DEFAULT_GCP_PREFERENCES_KEY,
	context: gcpPreferencesContext,
	onUnavailable: GCP_ON_UNAVAILABLE,
	fallbackValue: GCP_FALLBACK,
	transform: transformGcpPreferences
});
/**
* Lazy variant of {@link gcpPreferencesMiddleware}. Registers a memoized loader in
* {@link gcpPreferencesContext} instead of fetching up front, so only routes that read the
* value via {@link getGcpApiKeyLazy} / {@link getGcpPreferencesLazy} pay for the data-store
* round trip. Same entry key, fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as
* the eager variant.
*
* The `gcp` entry is not site-scoped, so this middleware has no ordering dependency on the
* site-context middleware.
*/
const gcpPreferencesMiddlewareLazy = createLazyDataStoreMiddleware({
	entryKey: DEFAULT_GCP_PREFERENCES_KEY,
	context: gcpPreferencesContext,
	onUnavailable: GCP_ON_UNAVAILABLE,
	fallbackValue: GCP_FALLBACK,
	transform: transformGcpPreferences
});

//#endregion
//#region src/data-store/middleware/login-preferences.ts
const loginPreferencesContext = createDataStoreContext();
const LOGIN_PREFERENCES_ENTRY_KEY = prefixWithSiteId("login-preferences");
const LOGIN_PREFERENCES_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === "throw" ? "throw" : "fallback";
const LOGIN_PREFERENCES_FALLBACK = Object.freeze({ emailVerificationEnabled: false });
const unwrapLoginPreferences = (value) => value.data;
/**
* Read login preferences from router context.
*
* @deprecated Use {@link getLoginPreferencesLazy} with {@link loginPreferencesMiddlewareLazy}.
* The eager pairing fetches the `login-preferences` entry on every request that reaches the
* middleware — even routes that never read it — which drives avoidable DynamoDB read volume
* on the single shared data-store partition. The lazy pairing only hits the data store when a
* loader actually reads the value.
*
* @param context - Router context provider
* @returns Login preferences data stored by data-store middleware
*/
function getLoginPreferences(context) {
	const data = context.get(loginPreferencesContext);
	if (!data) {
		getDataStoreLogger(context).debug("Login preferences context not found. Ensure data-store middleware runs before loaders and the required env vars are set.");
		return {};
	}
	return data;
}
/**
* Read login preferences populated by {@link loginPreferencesMiddlewareLazy}. Triggers the
* data-store fetch on first call within a request and reuses the cached promise on subsequent
* calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
* callers should coalesce to their own default (e.g. `?? { emailVerificationEnabled: false }`).
*
* @param context - Router context provider
* @returns Login preferences, or `null` when unavailable
*/
function getLoginPreferencesLazy(context) {
	return readLazyDataStoreEntry(context, loginPreferencesContext);
}
/**
* Middleware that reads the site-scoped `login-preferences` entry from the MRT data store
* and stores its `data` field in {@link loginPreferencesContext}. The entry key is
* prefixed with the current site id (e.g. `acme-login-preferences`).
*
* @deprecated Use {@link loginPreferencesMiddlewareLazy} with {@link getLoginPreferencesLazy}.
* This eager variant fetches on every request that reaches it; the lazy variant defers the
* fetch until a loader reads the value.
*
* Defaults to graceful degradation: if the data store is unavailable or returns a service
* error, the request continues with `{ emailVerificationEnabled: false }` rather than
* crashing. Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back
* into fail-fast behavior. The env var is read once at module load.
*
* Must run after the site-context middleware (so the site id is available for the entry
* key) and before any loader that calls {@link getLoginPreferences}.
*/
const loginPreferencesMiddleware = createDataStoreMiddleware({
	entryKey: LOGIN_PREFERENCES_ENTRY_KEY,
	context: loginPreferencesContext,
	onUnavailable: LOGIN_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: LOGIN_PREFERENCES_FALLBACK,
	transform: unwrapLoginPreferences
});
/**
* Lazy variant of {@link loginPreferencesMiddleware}. Registers a memoized loader in
* {@link loginPreferencesContext} instead of fetching up front, so only routes that read the
* value via {@link getLoginPreferencesLazy} pay for the data-store round trip. Same entry key,
* fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager variant.
*
* Must run after the site-context middleware (so the site id is available for the entry key).
*/
const loginPreferencesMiddlewareLazy = createLazyDataStoreMiddleware({
	entryKey: LOGIN_PREFERENCES_ENTRY_KEY,
	context: loginPreferencesContext,
	onUnavailable: LOGIN_PREFERENCES_ON_UNAVAILABLE,
	fallbackValue: LOGIN_PREFERENCES_FALLBACK,
	transform: unwrapLoginPreferences
});

//#endregion
//#region src/data-store/index.ts
/**
* @deprecated Use {@link dataStoreMiddlewareLazy}. This bundle wires all four preference
* middlewares eagerly, so each fires a DynamoDB read on every request that reaches root — even
* routes that never read the values. The lazy bundle defers the site/global/login reads until a
* consumer actually reads them.
*/
const dataStoreMiddleware = [
	customSitePreferencesMiddleware,
	customGlobalPreferencesMiddleware,
	gcpPreferencesMiddleware,
	loginPreferencesMiddleware
];
/**
* Preferred data-store middleware bundle. All four preferences are registered lazily — each
* DynamoDB read fires only when a loader reads the value via the matching `get*Lazy` accessor,
* so no request pays for an entry it never reads.
*/
const dataStoreMiddlewareLazy = [
	customSitePreferencesMiddlewareLazy,
	customGlobalPreferencesMiddlewareLazy,
	gcpPreferencesMiddlewareLazy,
	loginPreferencesMiddlewareLazy
];

//#endregion
export { DataStore, DataStoreNotFoundError, DataStoreServiceError, DataStoreUnavailableError, createDataStoreContext, createDataStoreMiddleware, createLazyDataStoreMiddleware, dataStoreLoggerContext, dataStoreMiddleware, dataStoreMiddlewareLazy, getCustomGlobalPreferences, getCustomGlobalPreferencesLazy, getDataStoreEntry, getDataStoreLogger, getGcpApiKey, getGcpApiKeyLazy, getGcpPreferences, getGcpPreferencesLazy, getLoginPreferences, getLoginPreferencesLazy, getSitePreferences, getSitePreferencesLazy, readLazyDataStoreEntry };
//# sourceMappingURL=data-store.js.map