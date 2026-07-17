import * as react_router12 from "react-router";
import { MiddlewareFunction, RouterContextProvider, createContext } from "react-router";
import { DataStore, DataStoreNotFoundError, DataStoreServiceError, DataStoreUnavailableError } from "@salesforce/mrt-utilities/data-store";

//#region src/data-store/utils.d.ts

type DataStoreContextKey<T> = ReturnType<typeof createContext<T | null>>;
type DataStoreEntryKey = string | ((context: Readonly<RouterContextProvider>) => string);
type DataStoreEntry<TValue = unknown> = {
  value?: TValue;
};
/**
 * Options for {@link createDataStoreMiddleware} and {@link createLazyDataStoreMiddleware}.
 *
 * @typeParam T - The shape stored in `context` after the entry is fetched and transformed.
 */
type DataStoreMiddlewareOptions<T> = {
  /**
   * The data store entry key, or a function that derives it from request context (used
   * for site-scoped keys — see {@link prefixWithSiteId}).
   */
  entryKey: DataStoreEntryKey;
  /**
   * The React Router context the resolved value is written to. Create one with
   * {@link createDataStoreContext}.
   */
  context: DataStoreContextKey<T>;
  /**
   * Optional projection from the raw entry value to the typed shape stored in context.
   * Defaults to the identity function (the raw value cast to `T`). Throws from this
   * function propagate to the caller; do not use it as a place to handle data-store
   * errors.
   */
  transform?: (value: Record<string, unknown>) => T;
  /**
   * How the middleware reacts when the data store cannot serve the entry
   * (`DataStoreUnavailableError` or `DataStoreServiceError`). `DataStoreNotFoundError`
   * is always handled gracefully and ignores this setting.
   *
   * - `'throw'` *(factory default)*: rethrow with a stable error message. Use when the
   *   entry is required and a failure should surface as a 5xx.
   * - `'fallback'`: warn and resolve to {@link DataStoreMiddlewareOptions.fallbackValue}
   *   (or the missing state if no fallback is configured). Use for optional preferences
   *   where graceful degradation is preferred.
   *
   * The four built-in middlewares (`customSitePreferencesMiddleware`, etc.) override
   * this default to `'fallback'` so the storefront stays up during transient outages,
   * and expose `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` as an opt-in escape hatch.
   */
  onUnavailable?: 'throw' | 'fallback';
  /**
   * Value to populate the context with when `onUnavailable === 'fallback'` and the data
   * store fetch fails. Either a constant or a function that derives the value from the
   * router context (useful for fallbacks that need request-scoped information). When
   * omitted, the middleware leaves the context unset on failure (downstream consumers
   * see the context's default value, typically `null`).
   */
  fallbackValue?: T | ((context: Readonly<RouterContextProvider>) => T);
};
/**
 * Creates a typed React Router context for data store entries.
 *
 * Initializes the context with `null` so middleware can populate it during requests.
 *
 * @returns React Router context key for data store values
 */
declare function createDataStoreContext<T>(): DataStoreContextKey<T>;
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
declare function createDataStoreMiddleware<T>(options: DataStoreMiddlewareOptions<T>): MiddlewareFunction<Response>;
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
declare function createLazyDataStoreMiddleware<T>(options: DataStoreMiddlewareOptions<T>): MiddlewareFunction<Response>;
/**
 * Reads a value populated by {@link createLazyDataStoreMiddleware}. Triggers
 * the underlying data-store fetch on first call and reuses the cached
 * promise on subsequent calls within the same request.
 *
 * Returns `null` when the lazy middleware did not run (no loader in
 * context) or when the entry is missing/invalid.
 */
declare function readLazyDataStoreEntry<T>(context: Readonly<RouterContextProvider>, contextKey: DataStoreContextKey<T>): Promise<T | null>;
/**
 * Read a data-store entry through the singleton MRT utilities API.
 * The underlying implementation (production DynamoDB vs development pseudo store)
 * is resolved by `@salesforce/mrt-utilities/data-store` export conditions.
 *
 * @param key - Data-store entry key
 * @returns Data-store entry or null when missing/invalid shape
 */
declare function getDataStoreEntry<TValue = unknown>(key: string): Promise<DataStoreEntry<TValue> | null>;
//#endregion
//#region src/data-store/logger-context.d.ts
/**
 * Minimal structured-logger interface the data-store middleware depends on.
 *
 * Matches the shape of the host application's `Logger` (see the storefront
 * template's `src/lib/logger.ts`) so a host can pass through its own logger
 * object via {@link dataStoreLoggerContext} without an adapter.
 *
 * The data-store middleware emits at `warn` level today; the full interface
 * is exposed so future SDK middlewares that need richer levels stay
 * consistent with this contract.
 */
interface DataStoreLogger {
  error(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  debug(message: string, metadata?: Record<string, unknown>): void;
}
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
declare const dataStoreLoggerContext: react_router12.RouterContext<DataStoreLogger | null>;
/**
 * Read the data-store logger from router context, falling back to a
 * console-based default when nothing has been injected.
 *
 * Use this from inside SDK middleware/loaders that have access to a
 * {@link RouterContextProvider}.
 */
declare function getDataStoreLogger(context: Readonly<RouterContextProvider>): DataStoreLogger;
//#endregion
//#region src/data-store/middleware/custom-site-preferences.d.ts
type SitePreferences = Record<string, unknown>;
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
declare function getSitePreferences(context: Readonly<RouterContextProvider>): SitePreferences;
/**
 * Read site preferences populated by {@link customSitePreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default (e.g. `?? {}`).
 *
 * @param context - Router context provider
 * @returns Site preferences, or `null` when unavailable
 */
declare function getSitePreferencesLazy(context: Readonly<RouterContextProvider>): Promise<SitePreferences | null>;
//#endregion
//#region src/data-store/middleware/custom-global-preferences.d.ts
type CustomGlobalPreferences = Record<string, unknown>;
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
declare function getCustomGlobalPreferences(context: Readonly<RouterContextProvider>): CustomGlobalPreferences;
/**
 * Read custom global preferences populated by {@link customGlobalPreferencesMiddlewareLazy}.
 * Triggers the data-store fetch on first call within a request and reuses the cached promise on
 * subsequent calls. Returns `null` when the lazy middleware did not run or the entry is
 * missing/invalid; callers should coalesce to their own default (e.g. `?? {}`).
 *
 * @param context - Router context provider
 * @returns Custom global preferences, or `null` when unavailable
 */
declare function getCustomGlobalPreferencesLazy(context: Readonly<RouterContextProvider>): Promise<CustomGlobalPreferences | null>;
//#endregion
//#region src/data-store/middleware/gcp-preferences.d.ts
/**
 * OOTB Google Cloud Platform preferences sourced from the MRT data store.
 *
 * Additional fields (e.g. `projectId`, `region`) may be added here as the
 * ECOM MRT sync job expands the `gcp` entry. Consumers should read the
 * object as a whole via `getGcpPreferences`, or use a specific convenience
 * getter like `getGcpApiKey` for a single field.
 */
type GcpPreferences = {
  apiKey: string;
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
declare function getGcpPreferences(context: Readonly<RouterContextProvider>): GcpPreferences;
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
declare function getGcpApiKey(context: Readonly<RouterContextProvider>): string;
/**
 * Read GCP preferences populated by {@link gcpPreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default.
 *
 * @param context - Router context provider
 * @returns GCP preferences, or `null` when unavailable
 */
declare function getGcpPreferencesLazy(context: Readonly<RouterContextProvider>): Promise<GcpPreferences | null>;
/**
 * Convenience getter for the Google Cloud API key alone, backed by
 * {@link gcpPreferencesMiddlewareLazy}. Coalesces the lazy `null` (middleware absent, entry
 * missing, or data store unavailable) to an empty string, matching {@link getGcpApiKey}.
 *
 * @param context - Router context provider
 * @returns The GCP API key, or an empty string when unavailable
 */
declare function getGcpApiKeyLazy(context: Readonly<RouterContextProvider>): Promise<string>;
//#endregion
//#region src/data-store/middleware/login-preferences.d.ts
type LoginPreferences = {
  emailVerificationEnabled?: boolean;
};
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
declare function getLoginPreferences(context: Readonly<RouterContextProvider>): LoginPreferences;
/**
 * Read login preferences populated by {@link loginPreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default (e.g. `?? { emailVerificationEnabled: false }`).
 *
 * @param context - Router context provider
 * @returns Login preferences, or `null` when unavailable
 */
declare function getLoginPreferencesLazy(context: Readonly<RouterContextProvider>): Promise<LoginPreferences | null>;
//#endregion
//#region src/data-store/index.d.ts
/**
 * @deprecated Use {@link dataStoreMiddlewareLazy}. This bundle wires all four preference
 * middlewares eagerly, so each fires a DynamoDB read on every request that reaches root — even
 * routes that never read the values. The lazy bundle defers the site/global/login reads until a
 * consumer actually reads them.
 */
declare const dataStoreMiddleware: react_router12.MiddlewareFunction<Response>[];
/**
 * Preferred data-store middleware bundle. All four preferences are registered lazily — each
 * DynamoDB read fires only when a loader reads the value via the matching `get*Lazy` accessor,
 * so no request pays for an entry it never reads.
 */
declare const dataStoreMiddlewareLazy: react_router12.MiddlewareFunction<Response>[];
//#endregion
export { type CustomGlobalPreferences, DataStore, type DataStoreContextKey, type DataStoreEntry, type DataStoreEntryKey, type DataStoreLogger, type DataStoreMiddlewareOptions, DataStoreNotFoundError, DataStoreServiceError, DataStoreUnavailableError, type GcpPreferences, type LoginPreferences, type SitePreferences, createDataStoreContext, createDataStoreMiddleware, createLazyDataStoreMiddleware, dataStoreLoggerContext, dataStoreMiddleware, dataStoreMiddlewareLazy, getCustomGlobalPreferences, getCustomGlobalPreferencesLazy, getDataStoreEntry, getDataStoreLogger, getGcpApiKey, getGcpApiKeyLazy, getGcpPreferences, getGcpPreferencesLazy, getLoginPreferences, getLoginPreferencesLazy, getSitePreferences, getSitePreferencesLazy, readLazyDataStoreEntry };
//# sourceMappingURL=data-store.d.ts.map