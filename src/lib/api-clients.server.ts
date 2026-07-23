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
import type { RouterContextProvider } from 'react-router';
import {
    createCommerceApiClients,
    createClient,
    createOpenApiFetchClient,
    createAuthHelpers,
    createBasketHelpers,
    defaultQuerySerializer,
    SLAS_AUTH_ENDPOINTS,
    type OperationMap,
    type Middleware,
} from '@salesforce/storefront-next-runtime/scapi';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { AUTH_TOKEN_INVALID_ERROR, authContext, authStorageContext } from '@/middlewares/auth.utils';
import { correlationContext } from '@/lib/correlation';
import { getLogger } from '@/lib/logger.server';
import { maintenanceContext } from '@/lib/maintenance';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getScapiBaseUrl, isAbsoluteURL } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { customClients, type AppClients } from '@/scapi/custom-clients';
import { scapiMiddlewareContext } from '@/lib/scapi-middleware';

type CustomClientConfigEntry = {
    key: string;
    basePath: string;
    ops: OperationMap;
    locale: boolean;
    orgPrefix: boolean;
};

type ContextLike = RouterContextProvider | Readonly<RouterContextProvider>;

/** Header name for SFCC Session ID */
const DWSID_HEADER = 'sfdc_dwsid';

/** Module-local registry. See `createApiClients` for lifetime/TTL semantics. */
const REGISTRIES = new WeakMap<ContextLike, Map<string, Promise<Response>>>();

/**
 * Query keys whose values are global SCAPI request parameters (site/locale routing). They are not PII or secrets and
 * are highly useful in logs for diagnosing per-site / per-locale behavior, so `maskUrl` preserves their values verbatim
 * instead of replacing them with `*`.
 */
const UNMASKED_QUERY_KEYS = new Set(['locale', 'siteId']);

const LOGGER_PREFIX = '[ApiClients]';

/**
 * Per-request marker for "we've already warned about an invalid `MRT_REQUEST_TIMEOUT` in this request", so multiple
 * `createApiClients` calls within a single request produce at most one warn line. Keyed by the request context, same
 * lifetime model as `REGISTRIES`.
 */
const MRT_TIMEOUT_WARNED = new WeakSet<ContextLike>();

function getRegistry(context: ContextLike): Map<string, Promise<Response>> {
    let map = REGISTRIES.get(context);
    if (!map) {
        map = new Map();
        REGISTRIES.set(context, map);
    }
    return map;
}

/**
 * Build a request-scoped cache key from a method+URL pair. The URL's query string is sorted so that the same
 * logical request issued with differently-ordered query parameters resolves to the same key.
 */
function buildDedupeKey(method: string, url: string): string {
    const normalized = new URL(url);
    normalized.searchParams.sort();
    return `${method.toUpperCase()} ${normalized.toString()}`;
}

/**
 * Race `promise` against `signal`'s abort event. If the signal aborts first, the returned promise rejects with
 * an `AbortError` and `promise` is left to settle on its own; if `promise` settles first, the abort listener is
 * removed.
 *
 * Used by `createDedupedFetch` so each caller can abort their own `await` without cascading the abort to the
 * shared underlying fetch (which other callers are also awaiting).
 */
async function abortable<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            }
        );
    });
}

/**
 * Render a URL for logging: pathname + sorted query parameter keys with values masked. Preserves enough structure to
 * diagnose cache behavior (which endpoint, which params were sent) without leaking values that may include access
 * tokens, basket IDs, customer IDs, or other PII/secrets.
 *
 * Values for keys in `UNMASKED_QUERY_KEYS` (`locale`, `siteId`) are kept verbatim — they are global SCAPI routing
 * parameters, never sensitive, and useful for diagnostics.
 *
 * @example
 * `/baskets/abc?token=xyz&siteId=site&locale=en-US` → `/baskets/abc?locale=en-US&siteId=site&token=*`
 */
function maskUrl(url: string): string {
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()].sort();
    if (!keys.length) {
        return parsed.pathname;
    }
    const masked = [...new Set(keys)]
        .map((k) => (UNMASKED_QUERY_KEYS.has(k) ? `${k}=${parsed.searchParams.get(k) ?? ''}` : `${k}=*`))
        .join('&');
    return `${parsed.pathname}?${masked}`;
}

/**
 * Resolve the hard-timeout for outgoing SCAPI fetches from the platform-provided environment variable.
 *
 * @env {string} [MRT_REQUEST_TIMEOUT] - Optional. Per-request budget in milliseconds, set by Managed Runtime
 *   to communicate the platform's request window. Example: `"15000"`. Unset or non-positive → no timeout.
 *   Misconfiguration (set but unparseable to a finite number) → no timeout.
 */
export function getMrtRequestTimeoutMs(): number | null {
    const raw = process.env.MRT_REQUEST_TIMEOUT;
    if (!raw) {
        return null;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Wrap a base `fetch` so SCAPI requests within a single React Router request share fetches and invalidate on
 * mutation. Pass the result as the `fetch` option to `createCommerceApiClients` and to `createOpenApiFetchClient`
 * for any custom clients so every SCAPI call routes through this wrapper, including those issued via the SDK's
 * `clients.auth.*` and `clients.basket.*` helpers.
 *
 * # Behavior
 *
 * - **Reads (GET/HEAD)**: identical concurrent calls share one underlying fetch promise. Cache key is
 *   `METHOD URL` with sorted query params. Each cache hit returns a `clone()` of the shared response so
 *   independent callers can each consume the body.
 * - **Mutations (POST/PUT/PATCH/DELETE)**: never cached. On settle (success or failure) they clear the entire
 *   registry so any subsequent read re-fetches. Concurrent in-flight reads are unaffected — they complete
 *   against their pre-mutation snapshot.
 * - **Rejections**: cached read entries are evicted on rejection so transient failures don't poison the cache.
 *
 * # Cache scope
 *
 * The registry is `WeakMap<RouterContextProvider, Map>`. Two requests cannot share entries even when their
 * URLs are byte-identical, and the per-request Map is dropped at end-of-request when the context is GC'd.
 *
 * # Cache key — what is keyed and what is not
 *
 * The key is `METHOD URL` with sorted query params. It does **not** include request headers or request body.
 * That is safe for this template because every header that varies between callers is derived from per-request context
 * inside `openapi-fetch` middleware, not from per-call state. Two concurrent calls under the same context produce
 * identical headers, and collapsing them into one network call doesn't change semantics.
 *
 * Customer extensions that add headers via custom middleware MUST follow the same discipline: derive header
 * values from `context`, not from per-call arguments. A header derived from per-call state (e.g. a multi-tenant
 * tenant ID resolved from a method argument) would cause cross-tenant cache hits within a single request and
 * silently leak data between callers. If you need per-call header variance, key on the header explicitly (extend
 * `buildDedupeKey`) or skip dedupe for that path.
 *
 * # Whole-registry invalidation on mutation — and why
 *
 * Any mutation clears the **entire** per-request registry, not just entries that look related to the mutated
 * resource. SCAPI domains are deeply interdependent and the dependency graph is not stable enough to model
 * statically in template code:
 *
 * - Adding to basket affects baskets, promotions (auto-applied), inventory, and recommendations.
 * - Updating the customer affects baskets (linked customer info), orders, and addresses.
 * - Placing an order clears the basket, appends to order history, and may update the customer.
 * - Changing locale or currency affects basket prices, product detail, search results, and content slots.
 * - Wishlist mutations affect product-display (in-wishlist marker) and customer-product-list summaries.
 *
 * Any narrower invalidation strategy (per-domain, per-URL prefix, tag-based) would have to encode this graph
 * in the template and stay correct as SCAPI evolves. The cost of being wrong is stale data on the page after a
 * mutation; the cost of being conservative is at most a handful of re-fetches inside a single SSR request, which
 * the dedupe itself collapses back to one network call per unique URL on the next render pass. We chose the
 * conservative default. Customers who can prove a narrower invariant for their storefront are free to replace
 * this fetch wrapper with one that exempts those mutations.
 *
 * # Middleware behavior — what cache hits change and what they do not
 *
 * openapi-fetch runs `onRequest` and `onResponse` middleware **per caller**, not once per underlying fetch. Per-
 * caller observability (per-call correlation IDs, per-call logger entries, per-call response inspection) works as
 * written.
 *
 * What a cache hit changes is **which Request actually goes over the wire**: when N callers collide on the same
 * key, the *first* caller's `onRequest` chain produces the Request that hits the network. Subsequent callers'
 * `onRequest` middleware still runs and still produces a Request, but that Request is discarded — they receive a
 * cloned copy of the shared Response. This is invisible as long as headers do not legitimately vary between
 * concurrent callers (see "Cache key" above). Logging shows real durations for the first caller and near-zero
 * durations for cache hits, which is the correct picture of what happened.
 *
 * # Abort handling
 *
 * The caller's signal — whether passed via `init.signal` or carried on a `Request` input — is **not** forwarded
 * to the underlying fetch. Instead, each caller's `await` is raced against its own signal: if the caller aborts,
 * their `await` rejects with an `AbortError`, but the shared underlying fetch keeps running for the benefit of
 * any other caller. This avoids the "first-caller's abort cascades to everyone else" hazard that a naive
 * shared-fetch design would produce.
 *
 * The trade-off is that an orphaned fetch (every caller has aborted) still runs to completion. For SSR within
 * a short-lived React Router request that's bounded and acceptable.
 *
 * @param context - React Router request context, used as the per-request cache key (WeakMap).
 * @param baseFetch - The underlying `fetch` implementation to call when a cache miss occurs.
 */
export function createDedupedFetch(context: ContextLike, baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const isRequest = input instanceof Request;
        const method = (init?.method ?? (isRequest ? input.method : 'GET')).toString().toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        // Strip the caller's signal before invoking the underlying fetch. The signal can come from `init.signal`
        // OR from a `Request` input — both must be neutralized so an abort from one caller can't tear down a
        // fetch that other callers are still awaiting. Each caller awaits its own copy via `abortable(...)`.
        // `init.signal` takes precedence over a Request-borne signal, mirroring the Fetch spec.
        const callerSignal = init?.signal ?? (isRequest ? input.signal : null) ?? null;
        let effectiveInput: typeof input = input;
        let effectiveInit: typeof init = init;
        if (isRequest) {
            // Always reconstruct when input is a Request so the underlying fetch sees a Request whose signal
            // is independent of the caller's. We use a fresh AbortController whose signal will never abort, so
            // the new Request's signal is guaranteed not to follow `input.signal`.
            effectiveInput = new Request(input, { signal: new AbortController().signal });
        }
        if (callerSignal && init) {
            effectiveInit = { ...init, signal: undefined };
        }

        if (method !== 'GET' && method !== 'HEAD') {
            const result = baseFetch(effectiveInput, effectiveInit);
            // Invalidate on settle (not on start) so concurrent in-flight reads complete against the
            // pre-mutation snapshot they were already awaiting. The trailing `.catch` is a no-op handler on the
            // .finally chain so a rejected mutation doesn't surface as an unhandled rejection — the caller's
            // own `await` is what observes and propagates the rejection.
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            result.finally(() => REGISTRIES.get(context)?.clear()).catch(() => {});
            return abortable(result, callerSignal);
        }

        const map = getRegistry(context);
        const key = buildDedupeKey(method, url);

        const cached = map.get(key);
        if (cached) {
            getLogger(context).info(`${LOGGER_PREFIX} fetch cache hit ${method} ${maskUrl(url)}`);
            return (await abortable(cached, callerSignal)).clone();
        }

        const promise = baseFetch(effectiveInput, effectiveInit);
        map.set(key, promise);
        // Evict on rejection so transient failures don't poison subsequent identical reads. Concurrent callers
        // awaiting this same promise still observe the rejection; only *new* calls after rejection retry.
        promise.catch(() => map.delete(key));
        return (await abortable(promise, callerSignal)).clone();
    };
}

/**
 * Wrap a base `fetch` with a hard timeout. When `timeoutMs` is `null`, returns `baseFetch` unchanged so the
 * wrapper has zero overhead and zero behavior change for environments that don't opt in. When `timeoutMs` is a
 * positive number, every call gets a fresh `AbortController` whose signal is forwarded to `baseFetch`; if the
 * timer fires before the fetch settles, the controller aborts the underlying network request with a
 * `DOMException('fetch timed out after Nms', 'TimeoutError')`.
 *
 * # Why "hard"
 *
 * Aborting the underlying fetch — not just the caller's `await` — is deliberate. With this layered *under* the
 * dedupe wrapper (see `createApiClients`), the abort propagates: the shared promise stored in the dedupe registry
 * rejects, the registry entry is evicted, and every caller awaiting that same promise (via `abortable(...)`)
 * rejects with the same `TimeoutError`. No orphaned in-flight fetch survives the timeout, and a subsequent call
 * to the same URL starts fresh.
 *
 * # Composition with `createDedupedFetch`
 *
 * Wrap `globalThis.fetch` with this helper, then pass the result into `createDedupedFetch`. That ordering means
 * **one timer per real network call**, not per caller — N concurrent callers colliding on the same dedupe key
 * share one timeout, and on expiry all N reject together. Reversing the order (dedupe inside, timeout outside)
 * would arm a fresh timer for every caller of a deduped fetch, which is wasteful and produces N log lines per
 * underlying timeout event.
 *
 * # Logging
 *
 * On timeout, emits exactly one `warn`-level log via the request-scoped logger:
 *
 *     [ApiClients] fetch timeout {METHOD} {maskedUrl}
 *         timeoutMs: 15000
 *
 * The URL is masked via `maskUrl()` so query values are not leaked. The existing `loggingMiddleware.onResponse`
 * inside `createApiClients` doesn't fire on timeout (no `Response` object), so this log line is the only
 * record of the timeout event at the fetch layer. Per-caller errors propagate through openapi-fetch's middleware
 * chain and surface to loaders/actions as the rejected `TimeoutError`.
 *
 * # Signal handling
 *
 * The caller's `AbortSignal` (from `init.signal`, or carried on a `Request` input per the fetch spec) is merged
 * with the timeout controller's signal via `AbortSignal.any`, so an abort from either source aborts the
 * underlying fetch. Whichever fires first wins; the rejection carries that source's reason
 * (`TimeoutError` for the timer, the caller's reason for an external abort).
 *
 * When this wrapper is composed *under* `createDedupedFetch` (the wired-in case for `createApiClients`), the
 * dedupe wrapper has already stripped the caller's signal from `init` and reconstructed any `Request` input with
 * a no-op signal. So the merge is functionally just the controller's signal, and caller aborts are still raced
 * against each caller's `await` separately by the dedupe wrapper. This means caller aborts never tear down the
 * underlying fetch in the dedupe-composed case, which is intentional: shared fetches must outlive any single
 * caller's abort. In standalone use (no dedupe), the merge ensures caller aborts reach the network.
 *
 * @param context - Used for the request-scoped logger. Not used as a cache or registry key.
 * @param baseFetch - The underlying `fetch` to invoke and time out.
 * @param timeoutMs - Hard timeout in milliseconds. Pass `null` (or any non-positive / non-Integer value) to
 * disable (returns `baseFetch` unchanged).
 */
export function createTimeoutFetch(
    context: ContextLike,
    baseFetch: typeof fetch,
    timeoutMs: number | null
): typeof fetch {
    if (timeoutMs == null) {
        return baseFetch;
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        if (!MRT_TIMEOUT_WARNED.has(context)) {
            MRT_TIMEOUT_WARNED.add(context);
            getLogger(context).warn(
                `${LOGGER_PREFIX} ignoring invalid timeoutMs; expected a positive integer, no timeout will be applied`,
                { timeoutMs }
            );
        }
        return baseFetch;
    }
    return async (input, init) => {
        const controller = new AbortController();
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toString().toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        // `init.signal` takes precedence over a Request-borne signal, mirroring the Fetch spec.
        const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
        const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
        const timer = setTimeout(() => {
            controller.abort(new DOMException(`fetch timed out after ${timeoutMs}ms`, 'TimeoutError'));
            getLogger(context).warn(`${LOGGER_PREFIX} fetch timeout ${method} ${maskUrl(url)}`, { timeoutMs });
        }, timeoutMs);
        try {
            return await baseFetch(input, { ...init, signal });
        } finally {
            clearTimeout(timer);
        }
    };
}

/**
 * Wrap a base `fetch` to observe SCAPI health signals and emit one concrete log line per occurrence. Every line shares
 * the `SCAPI health` token after `${LOGGER_PREFIX}` so all categories can be pulled from logs with a single search.
 *
 * # Categories
 *
 * - **Load shedding** (resolve path). SCAPI advertises capacity pressure via response headers, documented at
 *   https://developer.salesforce.com/docs/commerce/commerce-api/guide/throttle-rates.html:
 *   - `sfdc_load` — system capacity in use, integer 0–100 (percent). Present only on origin-backed responses.
 *   - `sfdc_load_status` — `WARN` at 80% capacity, `THROTTLE` at 90%. Present on both the advertised (still-served)
 *     responses and the synthetic 503 the edge worker returns when it actually sheds a request.
 *
 *   The log **level is driven by HTTP status, not the header value**: a load signal on a served response (non-503)
 *   logs at `warn` (the request still succeeded); the shed `503` logs at `error`. On the shed 503 `sfdc_load` is
 *   absent (the worker generates the 503 itself and has no origin load value to copy through), so `load` is `null`.
 *
 *   Load shedding is **per-realm** and is **not applied** to checkout (Shopper Baskets/Orders) or OCI. `shopper/auth`
 *   (SLAS) does participate in edge load shedding and can emit `WARN`/`THROTTLE`; SLAS additionally has its own
 *   per-tenant token rate limits with no advance signal.
 *
 * - **Rate limiting** (resolve path). An HTTP `429` logs at `warn`, with the raw `Retry-After` header value recorded
 *   verbatim (`retryAfter`, or `null` when the header is absent).
 *
 * # Composition order
 *
 * Designed to sit *innermost* (closest to `globalThis.fetch`) so every real network response is observed once. Cache
 * hits served from `createDedupedFetch` do **not** re-emit a log — observation happens once per actual fetch.
 *
 * # Logging
 *
 *     [ApiClients] SCAPI health load GET /products/abc?...   {status: 'warn', load: '82'}
 *     [ApiClients] SCAPI health load GET /products/abc?...   {status: 'throttle', load: null}   (503 → error)
 *     [ApiClients] SCAPI health rate GET /products/abc?...   {retryAfter: '30'}
 */
export function createHealthObserverFetch(context: ContextLike, baseFetch: typeof fetch): typeof fetch {
    const getMethod = (input: URL | RequestInfo, init?: RequestInit) =>
        (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const getUrl = (input: URL | RequestInfo) =>
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    return async (input, init) => {
        const response = await baseFetch(input, init);
        const loadStatus = response.headers.get('sfdc_load_status')?.trim();
        if (loadStatus) {
            const method = getMethod(input, init);
            const url = getUrl(input);
            const load = response.headers.get('sfdc_load');
            const message = `${LOGGER_PREFIX} SCAPI health load ${method} ${maskUrl(url)}`;
            const meta = { status: loadStatus.toLowerCase(), load: load ?? null };
            const logger = getLogger(context);
            // Level is driven by status, not header value: a served response (non-503) is a warning; the shed 503 is an
            // error. A request that succeeded despite advertised pressure didn't actually fail.
            if (response.status === 503) {
                logger.error(message, meta);
            } else {
                logger.warn(message, meta);
            }
        } else if (response.status === 429) {
            const method = getMethod(input, init);
            const url = getUrl(input);
            const retryAfter = response.headers.get('Retry-After');
            getLogger(context).error(`${LOGGER_PREFIX} SCAPI health rate ${method} ${maskUrl(url)}`, {
                retryAfter: retryAfter ?? null,
            });
        }

        return response;
    };
}

/**
 * Get the SLAS client secret from environment variable.
 * Only returns the secret on the server - client secrets must never reach client code.
 */
const getSlasClientSecret = (): string | undefined => {
    // Only access process.env on the server to avoid "process is not defined" on client
    if (typeof window !== 'undefined') {
        return undefined;
    }
    return process.env.COMMERCE_API_SLAS_SECRET;
};

/**
 * Create Commerce API clients with authentication middleware.
 *
 * API requests always target the B2C Commerce API endpoints directly (server-side). All SCAPI calls flow through
 * React Router loaders, actions, and resource routes.
 *
 * # Request-scoped fetch deduplication (opinionated reference implementation)
 *
 * The base `fetch` passed to the SCAPI clients is wrapped with `createDedupedFetch` so that identical concurrent
 * GET/HEAD calls within the same request share one underlying fetch promise, and any mutation
 * (POST/PUT/PATCH/DELETE) clears the registry on settle. This is an opinionated optimization that ships with the
 * storefront template — customers are free to keep, modify, replace, or remove it entirely (different cache scope,
 * eviction strategy, observability hooks, alternative key construction, etc.). The only SDK surface it consumes is
 * the standard `fetch` injection point, which is openapi-fetch's public API.
 *
 * Because the wrapper sits at the `fetch` layer, it covers every SCAPI request — including those issued via the
 * SDK's `clients.auth.*` and `clients.basket.*` helpers. See `createDedupedFetch` for the full behavior, including
 * caveats around middleware on cache hits.
 *
 * # Hard timeout (opt-in)
 *
 * When the `MRT_REQUEST_TIMEOUT` environment variable is set (Managed Runtime provides this to communicate the
 * platform's per-request budget), every outgoing SCAPI fetch is bracketed with a hard timeout sourced from
 * that value. The timeout layer sits *under* the dedupe layer, so one timer governs each real network call: on
 * expiry the underlying fetch aborts, the dedupe registry evicts the entry, and every caller awaiting the same
 * deduped promise rejects with a `TimeoutError`. When the env var is unset (or invalid) the wrapper is a no-op.
 * See `createTimeoutFetch`.
 *
 * ## Lifetime
 *
 * The registry is a module-local `WeakMap<RouterContextProvider, Map>`. Cache entries are dropped when:
 * 1. A mutation through any client settles — clears the registry so revalidating loaders re-fetch fresh data
 *    after actions that mutated SCAPI state.
 * 2. The request's `RouterContextProvider` is garbage-collected at end-of-request — the Map becomes unreachable.
 *
 * There's no timer, no LRU, no per-key TTL.
 *
 * ## No cross-request leakage
 *
 * Each request receives a fresh `RouterContextProvider`. Because the registry is keyed by that object and held in
 * a `WeakMap`, two requests never share a Map even if the underlying SCAPI URLs are byte-identical.
 *
 * ## Not a substitute for SCAPI server-side web-tier caching
 *
 * This dedupe layer is per-request, mutation-invalidated, and user-scoped — it collapses identical reads within a
 * single storefront request. SCAPI's server-side web-tier cache is cross-request, TTL-driven, and shared across users
 * for cacheable endpoints. The two layers are complementary, not substitutes: this one does nothing for cross-request
 * load, and SCAPI's cache does nothing for the N loaders/components in one render that all need the same basket.
 *
 * @param context - React Router context provider
 * @returns Configured commerce API clients
 */
export function createApiClients(context: RouterContextProvider | Readonly<RouterContextProvider>): AppClients {
    const appOrigin = getAppOrigin(context);
    const config = getConfig(context);
    const { shortCode, callback, organizationId, clientId } = config.commerce.api;

    // Site ID is always resolved by site context middleware
    const siteCtx = context.get(siteContext);
    if (!siteCtx?.site?.id) {
        throw new Error('Site context not initialized. Ensure site context middleware is configured.');
    }
    const siteId = siteCtx.site.id;
    const scapiProxyHost = typeof window === 'undefined' ? process.env.SCAPI_PROXY_HOST : undefined;

    const baseUrl = scapiProxyHost || getScapiBaseUrl(shortCode);
    // Use absolute URL if provided, otherwise construct from app origin
    const redirectUri = callback && isAbsoluteURL(callback) ? callback : `${appOrigin}${callback || ''}`;

    // Get current locale from i18next context
    const { i18next } = getTranslation(context);
    const locale = i18next.language ?? config.i18n.fallbackLng;

    const onAuthTokenInvalid = () => {
        try {
            const authStorage = context.get(authStorageContext);
            if (authStorage && !authStorage.has('error')) {
                authStorage.set('error', AUTH_TOKEN_INVALID_ERROR);
            }
        } catch {
            // Intentionally ignore if auth storage is unavailable (client-side)
        }
    };

    // Wrap the base fetch so every SCAPI request participates in request-scoped GET/HEAD deduplication and
    // mutation invalidation. Layer order is `dedupe(timeout(healthObserver(globalThis.fetch)))`:
    //   - SCAPI health observer innermost: every real network response is inspected so we log SCAPI's
    //     `sfdc_load_status` capacity pressure and HTTP 429 rate limiting once per actual fetch (not once per
    //     deduped caller). Detection/logging only — no retry.
    //   - timeout in the middle: one timer governs EACH real network call — the deadline comes from the
    //     MRT-provided `MRT_REQUEST_TIMEOUT` env var.
    //   - dedupe outermost: identical concurrent reads collapse to one underlying fetch and one timer, then
    //     receive cloned copies of the resolved response.
    // See `createHealthObserverFetch`, `createTimeoutFetch`, and `createDedupedFetch`.
    const dedupedFetch = createDedupedFetch(
        context,
        createTimeoutFetch(context, createHealthObserverFetch(context, globalThis.fetch), getMrtRequestTimeoutMs())
    );

    // Note: Currency is NOT passed as a global parameter because not all Shopper* APIs support it.
    // Each caller should read currency from context and pass it in their specific API calls.
    const clients = createCommerceApiClients({
        baseUrl,
        organizationId,
        siteId,
        locale,
        clientId,
        clientSecret: getSlasClientSecret(),
        redirectUri,
        onAuthTokenInvalid,
        proxyHost: scapiProxyHost, // SDK handles org ID rewriting and auth flow selection internally
        fetch: dedupedFetch,
    } as Parameters<typeof createCommerceApiClients>[0]);

    // Add authentication middleware - inject Bearer token and sfdc_dwsid from auth context
    const authMiddleware: Middleware = {
        async onRequest({ request }) {
            const url = new URL(request.url);
            const isSlasAuthEndpoint = SLAS_AUTH_ENDPOINTS.some((path) => url.pathname.includes(path));

            // Get the auth session from context
            const authPromise = context.get(authContext);
            const session = await authPromise.ref;

            // Inject sfdc_dwsid when available:
            // - For SCAPI endpoints: always send it (maintains app-server affinity)
            // - For SLAS refresh_token calls: send it (reuses existing bridged session)
            // - For other SLAS calls (login, guest, social, passwordless): skip it
            //   so SLAS issues a fresh session-bridged dwsid for the new auth state
            if (session?.dwsid) {
                if (!isSlasAuthEndpoint) {
                    request.headers.set(DWSID_HEADER, session.dwsid);
                } else {
                    // For SLAS token endpoint, only send dwsid for refresh_token grant
                    const clonedRequest = request.clone();
                    const bodyText = await clonedRequest.text();
                    const params = new URLSearchParams(bodyText);
                    if (params.get('grant_type') === 'refresh_token') {
                        request.headers.set(DWSID_HEADER, session.dwsid);
                    }
                }
            }

            // SLAS auth endpoints handle their own Authorization header (Basic auth or PKCE)
            if (!isSlasAuthEndpoint) {
                if (!session) {
                    throw new Error('No session found');
                }
                request.headers.set('Authorization', `Bearer ${session.accessToken}`);
            }

            return request;
        },
    };

    // Provide compatibility with (previously) proxied requests and identify the source of requests
    // to SCAPI
    const identifyingHeadersMiddleware: Middleware = {
        onRequest({ request }) {
            request.headers.set('x-mobify', 'true');
            return request;
        },
    };

    const correlationMiddleware: Middleware = {
        onRequest({ request }) {
            const correlationId = context.get(correlationContext);
            if (correlationId) {
                // see https://developer.salesforce.com/docs/commerce/commerce-api/guide/scapi-logs-request-tracking.html
                request.headers.set('correlation-id', correlationId);
            }
            return request;
        },
    };

    /**
     * Middleware to ensure that at least one SCAPI call per route request detects maintenance mode from API responses.
     * It keeps track of all SCAPI requests running until the first response is received.
     */
    const requestMap = new Map<Request, [(...args: unknown[]) => void, (reason?: unknown) => void]>();
    const maintenanceMiddleware: Middleware = {
        onRequest({ request }) {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            let requestResolver: (...args: unknown[]) => void = () => {};
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            let requestRejecter: (reason?: unknown) => void = () => {};
            const promise = new Promise((resolve, reject) => {
                requestResolver = resolve;
                requestRejecter = reject;
            });
            requestMap.set(request, [requestResolver, requestRejecter]);

            const maintenance = context.get(maintenanceContext);
            void maintenance.set(request, promise);
            return request;
        },
        onResponse({ request, response }) {
            const maintenanceHeader = response.headers.get('sfdc_maintenance');
            const maintenance = context.get(maintenanceContext);
            const [requestResolver, requestRejecter] = requestMap.get(request) ?? [];

            if (maintenance.gate(request) && (maintenanceHeader === 'system' || maintenanceHeader === 'site')) {
                // This will be handled by the middleware, which is waiting for the first promise to resolve
                requestRejecter?.(new Response('Maintenance', { status: 503 }));
            } else {
                requestResolver?.(response);
            }

            requestMap.delete(request);
            return response;
        },
    };

    /**
     * Logging middleware for SCAPI fetch requests.
     *
     * Logs all outgoing SCAPI requests on response with method, URL, status, and duration.
     * - Success responses (< 400): logged at `debug` level
     * - Error responses (>= 400): logged at `error` level
     * - Server-side only
     *
     * @example
     * ```
     * [13:21:24.337] DEBUG: fetch GET /search/shopper-search/v1/.../product-search?q=shoes
     *     status: 200
     *     duration: 1280
     * ```
     */
    const requestTimings = new WeakMap<Request, number>();
    const loggingMiddleware: Middleware = {
        onRequest({ request }) {
            requestTimings.set(request, performance.now());
            return request;
        },
        onResponse({ request, response }) {
            const logger = getLogger(context);
            const url = new URL(request.url);
            const startTime = requestTimings.get(request);
            const duration = startTime != null ? Math.round(performance.now() - startTime) : undefined;
            const metadata: Record<string, unknown> = {
                status: response.status,
                ...(duration != null && { duration }),
            };
            const message = `${LOGGER_PREFIX} fetch ${request.method} ${url.pathname}`;
            if (response.status >= 400) {
                logger.error(message, metadata);
            } else {
                logger.debug(message, metadata);
            }
            return response;
        },
    };

    // Build clients from the declarative registry (see src/scapi/custom-clients.ts).
    // Each entry is either an *override* (key matches a built-in SDK client like
    // `shopperProducts`) or an *addition* (a new custom API). Overrides replace the SDK
    // client in place so middleware and helper rewiring stay consistent; additions are
    // spread onto `clients` afterwards.
    const globalParams = { organizationId, siteId, locale };
    const globalParamsWithoutLocale = { organizationId, siteId };
    const clientOptions = { querySerializer: defaultQuerySerializer, fetch: dedupedFetch };

    // Heterogeneous OperationMap shapes — at this layer we only need `use(middleware)`,
    // which every proxy client exposes.
    type MiddlewareCapable = { use(mw: Middleware): void };
    const additionEntries: Record<string, MiddlewareCapable> = {};
    const allCustomClientList: MiddlewareCapable[] = [];
    let shopperLoginOverridden = false;
    let shopperBasketsV2Overridden = false;

    // The set of built-in client keys must stay in sync with the runtime SDK's `Clients`
    // type. Kept inline (rather than imported) because runtime `Clients` is a type, not a
    // value; encoding it as a string set keeps this file decoupled from generated code.
    const BUILT_IN_KEYS = new Set<string>([
        'shopperAvailability',
        'shopperBasketsV1',
        'shopperBasketsV2',
        'shopperConfigurations',
        'shopperConsents',
        'shopperContext',
        'shopperCustomers',
        'shopperDeliveryEstimates',
        'shopperExperience',
        'shopperGiftCertificates',
        'shopperLogin',
        'shopperOrders',
        'shopperPayments',
        'shopperProducts',
        'shopperPromotions',
        'shopperSearch',
        'shopperSeo',
        'shopperStores',
    ]);

    for (const {
        key,
        basePath,
        ops,
        locale: supportsLocale,
        orgPrefix,
    } of customClients as readonly CustomClientConfigEntry[]) {
        const orgPath = orgPrefix ? `/organizations/${organizationId}` : '';
        const c = createClient(
            createOpenApiFetchClient({ baseUrl: `${baseUrl}${basePath}${orgPath}`, ...clientOptions }),
            ops,
            supportsLocale ? globalParams : globalParamsWithoutLocale,
            { onAuthTokenInvalid }
        );
        allCustomClientList.push(c);

        if (BUILT_IN_KEYS.has(key)) {
            // Substitute the SDK client in place. `clients.use(mw)` still iterates the
            // SDK's internal client list (which holds the original instance), so we apply
            // middleware to the override via `allCustomClientList` below.
            (clients as unknown as Record<string, MiddlewareCapable>)[key] = c;
            if (key === 'shopperLogin') shopperLoginOverridden = true;
            if (key === 'shopperBasketsV2') shopperBasketsV2Overridden = true;
        } else {
            additionEntries[key] = c;
        }
    }

    // Rebuild auth/basket helpers when their underlying clients are overridden so the
    // helper namespaces talk to the override schema rather than the original SDK client.
    if (shopperLoginOverridden) {
        clients.auth = createAuthHelpers({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shopperLoginClient: clients.shopperLogin as any,
            clientId,
            clientSecret: getSlasClientSecret(),
            redirectUri,
            organizationId,
            siteId,
            baseUrl,
            ...(scapiProxyHost ? { proxyHost: scapiProxyHost } : {}),
        });
    }
    if (shopperBasketsV2Overridden) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clients.basket = createBasketHelpers({ shopperBasketsClient: clients.shopperBasketsV2 as any });
    }

    // Apply middleware to all clients (base SDK clients + override + addition clients)
    const applyToAllClients = (mw: Middleware) => {
        clients.use(mw);
        allCustomClientList.forEach((c) => c.use(mw));
    };

    // Middleware registration order matters: openapi-fetch runs onRequest in registration
    // order, but onResponse in reverse order. Logging is registered first so its onResponse
    // runs last, after all other middleware have processed the request/response.
    if (typeof window === 'undefined') {
        applyToAllClients(loggingMiddleware);
    }
    applyToAllClients(correlationMiddleware);
    applyToAllClients(authMiddleware);
    applyToAllClients(identifyingHeadersMiddleware);
    // We only detect the maintenance mode from the server, where we actually get data
    // We currently don't do it from client data access, which will require a client router middleware
    // Client calls to SCAPI should be rare (basket?), and often shadowed by server calls regarding maintenance
    if (typeof window === 'undefined') {
        applyToAllClients(maintenanceMiddleware);
    }

    const appClients = { ...clients, ...additionEntries, use: applyToAllClients } as AppClients;

    // Apply context-registered SCAPI middleware factories. The context
    // default is `null` — only middleware that actually registered
    // factories for this request will have populated the registry.
    // Iteration order matches the order keys were first registered so
    // consumers can control middleware ordering deterministically.
    const registry = context.get(scapiMiddlewareContext);

    if (registry) {
        for (const entry of registry.entries()) {
            const middleware = entry.factory(context, appClients);
            if (!middleware) continue;

            if (entry.clients) {
                for (const clientName of entry.clients) {
                    clients[clientName].use(middleware);
                }
            } else {
                applyToAllClients(middleware);
            }
        }
    }

    return appClients;
}
