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
// eslint-disable no-console
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import {
    resolvePage,
    RequiredError,
    type ManifestStorage,
    type PageManifest,
    type ComponentManifest,
    type IdentifierType,
    type ContextResolver,
    type SiteManifest,
    type QualifierContext,
    type ResolvedDataBinding,
} from '@salesforce/storefront-next-runtime/design/data';
import {
    DataStore,
    DataStoreNotFoundError,
    DataStoreUnavailableError,
    DataStoreServiceError,
} from '@salesforce/storefront-next-runtime/data-store';
import type { ShopperExperience, Middleware, Clients } from '@/scapi';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getScapiMiddlewareRegistry } from '@/lib/scapi-middleware';
import { getLogger } from '@/lib/logger.server';
import type { Logger } from '@/lib/logger';
import { createAttributeResolutionContext } from '@/lib/page-designer/attribute-resolution-context';
import { getSiteUrlConfig } from '@/middlewares/site-url-config.server';
import { createInflate } from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

type Page = ShopperExperience.schemas['Page'];
type Component = ShopperExperience.schemas['Component'];

/**
 * URL path pattern matching shopperExperience `getPage` and `getPages` requests.
 *
 * Anchored to the end of the pathname (`$`) so it only matches `/pages` or
 * `/pages/{pageId}` as the final path segment. This avoids false positives
 * from organization IDs that happen to contain the word "pages". The optional
 * capture group holds the `pageId` for `getPage` requests, or `undefined`
 * for `getPages` (page-list lookups by aspect/product/category).
 */
const GET_PAGE_PATH_RE = /\/pages(?:\/([^/?]+))?$/;

/**
 * URL path pattern matching shopperExperience `getComponent` requests.
 *
 * Anchored to the end of the pathname (`$`) so it only matches
 * `/components/{componentId}` as the final path segment. The capture group
 * holds the embedded-component id (e.g. `header`, `mini-cart`).
 */
const GET_COMPONENT_PATH_RE = /\/components\/([^/?]+)$/;

/**
 * Presence-only response header set when a Page Designer `getPage`
 * response was synthesized from the MRT manifest cache. Absent when the
 * request fell through to SCAPI and the response came from ECOM. Mirrors
 * the cache-status header convention (`X-Cache-Hit`, `Cf-Cache-Status`)
 * so observability tooling can tell at a glance which path served the response.
 */
const PAGE_MANIFEST_HIT_HEADER = 'x-page-manifest-hit';

/**
 * Presence-only response header set when a Page Designer `getComponent`
 * response was synthesized from the MRT manifest cache. See
 * {@link PAGE_MANIFEST_HIT_HEADER} for rationale.
 */
const COMPONENT_MANIFEST_HIT_HEADER = 'x-component-manifest-hit';

/**
 * When `SFCC_PD_PAGE_RESOLUTION_DEBUG=true` is set, the middleware emits
 * additional debug logs containing the full resolved page/component
 * response and the raw manifests retrieved from KVS. These payloads can
 * be very large — far too noisy for the standard debug log — so they're
 * gated behind an explicit env var that's only flipped on during
 * troubleshooting.
 *
 * The env var name retains "PAGE_RESOLUTION" for backcompat with existing
 * runbooks and Slack posts; the middleware itself now covers both pages
 * and components.
 *
 * Resolved once at module load: env vars don't change per-request and
 * re-reading `process.env` on every request is wasteful.
 */
const PAGE_RESOLUTION_DEBUG = process.env.SFCC_PD_PAGE_RESOLUTION_DEBUG === 'true';

type ManifestType = 'page' | 'component' | 'site';
type ManifestValue = {
    compressedData: string;
};
type DataStoreClient = Pick<DataStore, 'getEntry'>;

/**
 * Thrown when a Data Store entry cannot be decoded (base64), decompressed
 * (inflate), or parsed (JSON). Wraps the underlying error as `cause`.
 */
class DataStoreEntryUnpackError extends Error {
    constructor(key: string, cause: unknown) {
        super(`Failed to unpack data store entry for key: ${key}`);
        this.name = 'DataStoreEntryUnpackError';
        this.cause = cause;
    }
}

/**
 * Thrown when the SCAPI Shopper Experience `qualifiers/resolve` call fails.
 * Wraps the underlying error as `cause`.
 */
class QualifierResolveError extends Error {
    constructor(cause: unknown) {
        super('Failed to resolve qualifiers');
        this.name = 'QualifierResolveError';
        this.cause = cause;
    }
}

/**
 * Thrown when the manifest storage is invoked with an invalid input (e.g. a
 * page/component lookup with no id). Indicates a programmer error that
 * shouldn't reach runtime, but if it does, the {@link getErrorHandler} treats
 * it as fail-open: log and let the caller fall back to SCAPI.
 */
class ManifestStorageInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ManifestStorageInputError';
    }
}

/**
 * Server-only middleware that registers an SCAPI client middleware factory to
 * intercept `shopperExperience.getPage` and `shopperExperience.getComponent`
 * calls and resolve Page Designer content from the MRT Data Store when available.
 *
 * The factory is evaluated lazily at `createApiClients` time (inside loaders),
 * so all context values are guaranteed to be available regardless of middleware
 * ordering. When the feature flag is disabled or the Data Store is not
 * available (e.g. local development), the factory returns `null` and the
 * intercepted SCAPI calls pass through unchanged.
 *
 * Design/preview mode requests (containing `mode` or `pdToken` query params)
 * are never intercepted — they always reach SCAPI for live content.
 */
export const pageDesignerResolutionMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
    const config = getConfig(context);

    const registry = getScapiMiddlewareRegistry(context);

    if (config.features.mrtBasedPageDesignerResolution) {
        registry.register('page-designer-content-resolution', {
            clients: ['shopperExperience'],
            factory: createContentResolutionMiddleware,
        });
    } else if (PAGE_RESOLUTION_DEBUG) {
        // Feature flag off but debug telemetry on: register a passthrough
        // SCAPI middleware that times upstream page/component resolution
        // calls and logs the response body. Used to compare ECOM-resolved
        // output against MRT-resolved output during parity troubleshooting.
        registry.register('page-designer-content-resolution-debug', {
            clients: ['shopperExperience'],
            factory: createContentResolutionDebugMiddleware,
        });
    }

    return next();
};

/**
 * SCAPI middleware factory that times upstream page and component resolution
 * round trips and logs the parsed response body. Only registered when the
 * feature flag is off and `SFCC_PD_PAGE_RESOLUTION_DEBUG=true` — keeps the
 * payload off the standard debug log unless explicitly opted in.
 *
 * Concurrent in-flight requests are kept separate via a WeakMap keyed by
 * the request object, so interleaved resolutions don't clobber each other's
 * start-time markers.
 */
function createContentResolutionDebugMiddleware(
    context: RouterContextProvider | Readonly<RouterContextProvider>
): Middleware | null {
    const logger = getLogger(context);
    const startTimes = new WeakMap<Request, number>();

    return {
        onRequest: ({ request }) => {
            if (matchContentRequest(request) != null) {
                startTimes.set(request, performance.now());
            }
        },
        onResponse: async ({ request, response }) => {
            const match = matchContentRequest(request);
            if (match == null) {
                return response;
            }

            const startTime = startTimes.get(request);
            const duration = startTime != null ? performance.now() - startTime : undefined;
            // Clone before reading — the consumer downstream still needs
            // the original response body.
            const cloned = response.clone();
            let body: unknown;
            try {
                body = await cloned.json();
            } catch (error) {
                logger.warn(`[PageResolutionMiddleware] ECOM ${match.kind} resolution: failed to parse response body`, {
                    error,
                });
                return response;
            }

            logger.debug(`[PageResolutionMiddleware] ECOM ${match.kind} resolution`, {
                duration,
                response: body,
            });

            return response;
        },
    };
}

/** Discriminator for the per-kind dispatch. */
type ContentKind = 'page' | 'component';

/**
 * Result of matching an SCAPI shopperExperience request against the kinds
 * this middleware can resolve. `id` is empty only for the page-list
 * (`getPages`) lookup; component matches always produce a non-empty id.
 * `isList` distinguishes `/pages` (getPages) from `/pages/{id}` (getPage)
 * within the page kind; component is always a single-id read.
 */
interface ContentMatch {
    kind: ContentKind;
    id: string;
    url: URL;
    isList: boolean;
}

/**
 * Routes an incoming SCAPI request to the page or component dispatch entry,
 * returning `undefined` for everything else. Filters out non-GET methods and
 * design/preview-mode requests (`mode` / `pdToken` query params) once for both
 * kinds — those must always reach SCAPI for live content.
 */
function matchContentRequest(request: Request): ContentMatch | undefined {
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Design/preview mode requests must always reach SCAPI for live content
    if (url.searchParams.has('mode') || url.searchParams.has('pdToken')) return;

    const pageMatch = url.pathname.match(GET_PAGE_PATH_RE);
    if (pageMatch) {
        // `pageId` is the empty string for `/pages` (getPages) requests and a
        // non-empty string for `/pages/{pageId}` (getPage).
        return {
            kind: 'page',
            id: pageMatch[1] ? decodeURIComponent(pageMatch[1]) : '',
            url,
            isList: !pageMatch[1],
        };
    }

    const componentMatch = url.pathname.match(GET_COMPONENT_PATH_RE);
    if (componentMatch) {
        return {
            kind: 'component',
            id: decodeURIComponent(componentMatch[1]),
            url,
            isList: false,
        };
    }
}

/**
 * SCAPI middleware factory for Page Designer content resolution.
 *
 * Reads the Data Store, site ID, and locale from context.
 * Returns an openapi-fetch middleware that intercepts `getPage` and
 * `getComponent` requests, or `null` if the Data Store is unavailable.
 */
function createContentResolutionMiddleware(
    context: RouterContextProvider | Readonly<RouterContextProvider>,
    clients: Clients
): Middleware | null {
    const config = getConfig(context);
    const siteCtx = context.get(siteContext);
    const { i18next } = getTranslation(context);
    const siteId = siteCtx?.site.id ?? config.defaultSiteId;
    const locale = toManifestLocale(i18next.language ?? config.i18n.fallbackLng);
    const defaultLocale = toManifestLocale(config.i18n.fallbackLng);
    const logger = getLogger(context);
    const onError = getErrorHandler(logger);
    const dataStore = DataStore.getDataStore();

    return {
        async onRequest({ request }) {
            const metrics: Metrics = {
                resource: request.url,
            };

            try {
                const response = await resolvePageRequest({
                    metrics,
                    request,
                    context,
                    dataStore,
                    siteId,
                    locale,
                    defaultLocale,
                    onError,
                    clients,
                    logger,
                });

                return response;
            } catch (error: unknown) {
                // Any error here was not expected and was not already handled.
                // Log it and then throw it to be handled by the error boundary.
                logger.error('[PageResolutionMiddleware] Unexpected error during content resolution', { error });
                throw error;
            } finally {
                logMetrics(logger, metrics);
            }
        },
    };
}

/**
 * Timing markers and contextual data collected during page resolution.
 *
 * All timing fields are `performance.now()` timestamps recorded at the
 * start/end of each phase. They are converted to durations by
 * {@link logMetrics} via {@link getDuration}.
 *
 * Manifest retrieval and unpack markers are split per manifest type
 * (page vs site) because both may be fetched during a single resolution.
 */
interface Metrics {
    resource?: string;
    resolutionStart?: number;
    resolutionEnd?: number;
    contextResolutionStart?: number;
    contextResolutionEnd?: number;
    pageManifestRetrievalStart?: number;
    pageManifestRetrievalEnd?: number;
    pageManifestUnpackStart?: number;
    pageManifestUnpackEnd?: number;
    componentManifestRetrievalStart?: number;
    componentManifestRetrievalEnd?: number;
    componentManifestUnpackStart?: number;
    componentManifestUnpackEnd?: number;
    siteManifestRetrievalStart?: number;
    siteManifestRetrievalEnd?: number;
    siteManifestUnpackStart?: number;
    siteManifestUnpackEnd?: number;
    parameters?: {
        mediaHostPrefix?: string;
        locale: string;
        defaultLocale: string;
        pageId?: string;
        componentId?: string;
        aspectType?: string;
        categoryId?: string;
        productId?: string;
        path: string;
        search: string;
    };
    /**
     * Compressed byte size of the page manifest as stored in the Data Store
     * (length of the base64-decoded `compressedData` blob). O(1) to compute.
     */
    pageManifestCompressedBytes?: number;
    /**
     * Uncompressed byte size of the page manifest, accumulated by tapping
     * the inflate stream with a pass-through counter. Avoids the
     * `JSON.stringify(parsed).length` anti-pattern, which would walk the
     * full object graph after parse.
     */
    pageManifestUncompressedBytes?: number;
    /** Compressed byte size of the embedded-component manifest. See {@link pageManifestCompressedBytes}. */
    componentManifestCompressedBytes?: number;
    /** Uncompressed byte size of the embedded-component manifest. See {@link pageManifestUncompressedBytes}. */
    componentManifestUncompressedBytes?: number;
    /** Compressed byte size of the site manifest. See {@link pageManifestCompressedBytes}. */
    siteManifestCompressedBytes?: number;
    /** Uncompressed byte size of the site manifest. See {@link pageManifestUncompressedBytes}. */
    siteManifestUncompressedBytes?: number;
    /**
     * Data Store key the page manifest was looked up under. Captured for
     * troubleshooting — pairs with the corresponding compressed/uncompressed
     * byte counts so it's clear which key produced the observed payload.
     */
    pageManifestKey?: string;
    /** Data Store key the embedded-component manifest was looked up under. See {@link pageManifestKey}. */
    componentManifestKey?: string;
    /** Data Store key the site manifest was looked up under. See {@link pageManifestKey}. */
    siteManifestKey?: string;
    resolutionParameters?: {
        id: string;
        identifierType: IdentifierType;
        aspectType?: string;
        categoryId?: string;
        locale: string;
    };
    resolutionResult?: Page | Component | null;
    resolvedContext?: QualifierContext | null;
}

/**
 * Computes a duration from a sequence of values using left-to-right subtraction,
 * skipping any `null` or `undefined` entries.
 *
 * For two arguments `(end, start)` this returns `end - start`.
 * For more arguments this returns `first - second - third - ...`, which is
 * used to derive the runtime processing overhead by subtracting sub-operation
 * durations from the total.
 *
 * Returns `undefined` if fewer than two valid numbers remain after filtering,
 * since a single value cannot form a meaningful duration.
 */
function getDuration(...values: (number | undefined)[]): number | undefined {
    const defined = values.filter((v): v is number => v != null);

    if (defined.length < 2) return undefined;

    return defined.reduce((result, v) => result - v);
}

/**
 * Maximum number of characters retained from a string value when sanitizing
 * the resolved qualifier context for logging. Long values are truncated to
 * this length so the log conveys what the content is without emitting the
 * full (potentially very large) page-content payload.
 */
const MAX_LOGGED_STRING_LENGTH = 100;

/**
 * Truncates a string to {@link MAX_LOGGED_STRING_LENGTH}, appending an ellipsis
 * marker that records how many characters were dropped. Strings at or under the
 * limit are returned unchanged.
 */
function truncateString(value: string): string {
    if (value.length <= MAX_LOGGED_STRING_LENGTH) return value;

    return `${value.slice(0, MAX_LOGGED_STRING_LENGTH)}… (+${value.length - MAX_LOGGED_STRING_LENGTH} chars)`;
}

/**
 * Returns a log-safe copy of a single {@link ResolvedDataBinding}.
 *
 * Preserves the original `field → value` shape so the log conveys the actual
 * content of each binding, but truncates string values via
 * {@link truncateString} — data-binding payloads can contain large HTML/markup
 * blobs that would otherwise flood the debug stream. Non-string values (numbers,
 * booleans, etc.) are small and kept as-is.
 */
function sanitizeDataBinding(binding: ResolvedDataBinding): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(binding).map(([field, value]) => [
            field,
            typeof value === 'string' ? truncateString(value) : value,
        ])
    );
}

/**
 * Returns a log-safe copy of the resolved qualifier context.
 *
 * `campaignQualifiers` and `customerGroups` are small scalar maps and are
 * included as-is. `dataBindings` can contain arbitrary page-content payloads
 * that may be very large, so each {@link ResolvedDataBinding} is mapped through
 * {@link sanitizeDataBinding} — preserving the `type → id → field → value`
 * structure for observability while truncating long string values to a
 * reasonable length.
 */
function sanitizeResolvedContext(
    context: QualifierContext
): Omit<QualifierContext, 'dataBindings'> & { dataBindings?: Record<string, Record<string, Record<string, unknown>>> } {
    const { dataBindings, ...rest } = context;

    if (!dataBindings) return rest;

    return {
        ...rest,
        dataBindings: Object.fromEntries(
            Object.entries(dataBindings).map(([type, bindingsById]) => [
                type,
                Object.fromEntries(
                    Object.entries(bindingsById).map(([id, binding]) => [id, sanitizeDataBinding(binding)])
                ),
            ])
        ),
    };
}

/**
 * Computes durations from the collected timing markers and emits a
 * structured debug log entry.
 *
 * No-ops when resolution was never attempted (i.e. the request did not
 * match a `getPage` path or was skipped for design/preview mode), or when
 * resolution started but failed before completing (so partial timings
 * aren't emitted alongside the unexpected-error log).
 */
function logMetrics(logger: Logger, metrics: Metrics): void {
    if (metrics.resolutionStart == null || metrics.resolutionEnd == null) return;

    const resolutionDuration = getDuration(metrics.resolutionEnd, metrics.resolutionStart);
    const contextResolutionDuration = getDuration(metrics.contextResolutionEnd, metrics.contextResolutionStart);
    const pageManifestRetrievalDuration = getDuration(
        metrics.pageManifestRetrievalEnd,
        metrics.pageManifestRetrievalStart
    );
    const componentManifestRetrievalDuration = getDuration(
        metrics.componentManifestRetrievalEnd,
        metrics.componentManifestRetrievalStart
    );
    const siteManifestRetrievalDuration = getDuration(
        metrics.siteManifestRetrievalEnd,
        metrics.siteManifestRetrievalStart
    );
    const pageManifestUnpackDuration = getDuration(metrics.pageManifestUnpackEnd, metrics.pageManifestUnpackStart);
    const componentManifestUnpackDuration = getDuration(
        metrics.componentManifestUnpackEnd,
        metrics.componentManifestUnpackStart
    );
    const siteManifestUnpackDuration = getDuration(metrics.siteManifestUnpackEnd, metrics.siteManifestUnpackStart);

    // Runtime processing = total resolution minus time spent in sub-operations.
    // Missing sub-operation durations (e.g. site manifest never fetched) are
    // filtered out by getDuration, which is correct: an operation that didn't
    // happen contributes zero time. Defined whenever resolutionDuration plus
    // at least one sub-operation duration are available.
    const runtimeProcessingDuration = getDuration(
        resolutionDuration,
        contextResolutionDuration,
        pageManifestRetrievalDuration,
        componentManifestRetrievalDuration,
        siteManifestRetrievalDuration,
        pageManifestUnpackDuration,
        componentManifestUnpackDuration,
        siteManifestUnpackDuration
    );

    logger.debug('[PageResolutionMiddleware] content resolution', {
        resource: metrics.resource,
        resolvedId: metrics.resolutionResult?.id,
        resolvedTypeId: metrics.resolutionResult?.typeId,
        resolvedContext: metrics.resolvedContext ? sanitizeResolvedContext(metrics.resolvedContext) : null,
        resolvedParameters: metrics.resolutionParameters,
        parameters: metrics.parameters,
        metrics: {
            resolutionDuration,
            contextResolutionDuration,
            pageManifestRetrievalDuration,
            componentManifestRetrievalDuration,
            siteManifestRetrievalDuration,
            pageManifestUnpackDuration,
            componentManifestUnpackDuration,
            siteManifestUnpackDuration,
            runtimeProcessingDuration,
            pageManifestKey: metrics.pageManifestKey,
            componentManifestKey: metrics.componentManifestKey,
            siteManifestKey: metrics.siteManifestKey,
            pageManifestCompressedBytes: metrics.pageManifestCompressedBytes,
            pageManifestUncompressedBytes: metrics.pageManifestUncompressedBytes,
            componentManifestCompressedBytes: metrics.componentManifestCompressedBytes,
            componentManifestUncompressedBytes: metrics.componentManifestUncompressedBytes,
            siteManifestCompressedBytes: metrics.siteManifestCompressedBytes,
            siteManifestUncompressedBytes: metrics.siteManifestUncompressedBytes,
        },
    });
}

/**
 * Per-kind plumbing for the unified content-resolution dispatch.
 *
 * Pages and embedded components share everything except (1) how their
 * resolution params are built from the URL and (2) the response shape SCAPI
 * expects back. The dispatch table pulls just those two differences into the
 * per-kind entry; matching, the mediaHostPrefix guard, the resolvePage
 * call, error handling, metrics, and the design-mode bypass all live in the
 * shared {@link resolvePageRequest} body.
 */
interface ContentDispatchEntry {
    /** Builds the parameters consumed by {@link resolvePage}. */
    buildResolutionParams(args: ContentDispatchArgs): Parameters<typeof resolvePage>[0];
    /** Wraps the resolved value in the response shape SCAPI returns for this endpoint. */
    buildResponse(resolved: Page | Component, matched: ContentMatch): Response;
}

interface ContentDispatchArgs {
    matched: ContentMatch;
    clients: Clients;
    dataStore: DataStoreClient;
    siteId: string;
    locale: string;
    defaultLocale: string;
    mediaHostPrefix: string;
    metrics: Metrics;
    onError: (error: unknown) => void;
    logger: Logger;
}

const CONTENT_DISPATCH: Record<ContentKind, ContentDispatchEntry> = {
    page: {
        buildResolutionParams: getPageResolutionParams,
        // `getPage` returns a single Page; `getPages` returns `{ data: Page[] }`.
        buildResponse: (resolved, matched) =>
            Response.json(matched.isList ? { data: [resolved] } : resolved, {
                headers: { [PAGE_MANIFEST_HIT_HEADER]: '1' },
            }),
    },
    component: {
        buildResolutionParams: getComponentResolutionParams,
        buildResponse: (resolved) => Response.json(resolved, { headers: { [COMPONENT_MANIFEST_HIT_HEADER]: '1' } }),
    },
};

/**
 * Attempts to resolve a `getPage` or `getComponent` request from the Data Store.
 *
 * Matches GET requests to `/pages`, `/pages/{pageId}`, or `/components/{componentId}`,
 * builds resolution parameters via the per-kind {@link CONTENT_DISPATCH} entry,
 * and synthesizes a JSON `Response` from the resolved manifest. Returns
 * `undefined` to let the request pass through to SCAPI on a miss, missing
 * `mediaHostPrefix`, or non-matching path.
 *
 * Requests in design/preview mode (`mode` or `pdToken` query params) are
 * never intercepted.
 */
async function resolvePageRequest({
    request,
    context,
    dataStore,
    clients,
    siteId,
    locale,
    defaultLocale,
    metrics,
    onError,
    logger,
}: {
    request: Request;
    context: RouterContextProvider | Readonly<RouterContextProvider>;
    dataStore: DataStoreClient;
    siteId: string;
    locale: string;
    defaultLocale: string;
    metrics: Metrics;
    onError: (error: unknown) => void;
    clients: Clients;
    logger: Logger;
}): Promise<Response | undefined> {
    const matched = matchContentRequest(request);
    if (!matched) return;

    // Lazy lookup — the site URL config Data Store entry is only fetched
    // here, after we've confirmed this is a request we'd actually resolve.
    // Non-PD traffic (PDPs, account, search) never pays the round trip.
    const mediaHostPrefix = (await getSiteUrlConfig(context))?.mediaHostPrefix;

    // Without the ECOM-synced media host prefix we'd stamp media URLs at the
    // SCAPI request origin (the API Gateway hostname in MRT), which the
    // browser can't load. Fall through to SCAPI so it can resolve the
    // content with correct URLs instead.
    if (!mediaHostPrefix) {
        logger.warn(
            `[PageResolutionMiddleware] mediaHostPrefix not available; falling back to SCAPI ${matched.kind} resolution`,
            {
                siteId,
                kind: matched.kind,
                id: matched.id,
                path: matched.url.pathname,
            }
        );
        return;
    }

    metrics.resolutionStart = performance.now();
    metrics.parameters = {
        locale,
        defaultLocale,
        mediaHostPrefix,
        path: matched.url.pathname,
        search: matched.url.search,
        ...(matched.kind === 'page' ? { pageId: matched.id } : { componentId: matched.id }),
    };

    const dispatch = CONTENT_DISPATCH[matched.kind];
    const parameters = dispatch.buildResolutionParams({
        matched,
        clients,
        dataStore,
        siteId,
        locale,
        defaultLocale,
        mediaHostPrefix,
        metrics,
        onError,
        logger,
    });

    metrics.resolutionParameters = {
        id: parameters.id,
        identifierType: parameters.identifierType,
        aspectType: parameters.aspectType,
        // The fallback is only ever a string here — the params builders never
        // wrap it in a Promise. Narrow defensively so the metric stays
        // log-safe if that ever changes.
        categoryId: typeof parameters.categoryId === 'string' ? parameters.categoryId : undefined,
        locale: parameters.locale,
    };

    const resolved = await resolvePage(parameters);

    metrics.resolutionEnd = performance.now();

    if (!resolved) return;

    metrics.resolutionResult = resolved;

    // Fully resolved content is large — too noisy for the standard debug
    // stream. Gated behind SFCC_PD_PAGE_RESOLUTION_DEBUG so it's only
    // emitted when troubleshooting the manifest-vs-SCAPI parity.
    if (PAGE_RESOLUTION_DEBUG) {
        logger.debug(`[PageResolutionMiddleware] resolved ${matched.kind} response`, {
            id: resolved.id,
            [matched.kind]: resolved,
        });
    }

    return dispatch.buildResponse(resolved, matched);
}

/**
 * Parses aspect attributes from the `aspectAttributes` query parameter.
 * The parameter is a JSON-encoded string set by `fetchPage` when constructing
 * the `getPage` request.
 */
function parseAspectAttributes(
    url: URL,
    logger: Logger
): { aspectType?: string; categoryId?: string; productId?: string } {
    const raw = url.searchParams.get('aspectAttributes');
    if (!raw) return {};

    try {
        return JSON.parse(raw) as { aspectType?: string; categoryId?: string; productId?: string };
    } catch {
        logger.warn('[PageResolutionMiddleware] Failed to parse aspect attributes', { raw });
        return {};
    }
}

/**
 * Resolves the aspect attributes for a `/pages` (getPages) request.
 *
 * `fetchPage` sends the aspect type as the top-level `aspectTypeId` param and —
 * because SCAPI rejects a `/pages` call carrying multiple business-object IDs —
 * only the single most specific business-object ID at the top level. The full
 * set (including the category fallback a PDP drops from the top level) still
 * travels in the `aspectAttributes` JSON, so prefer that and fall back to the
 * top-level params for resilience against callers that only set them.
 */
function readGetPagesAspectAttributes(
    url: URL,
    logger: Logger
): { aspectType?: string; categoryId?: string; productId?: string } {
    const fromJson = parseAspectAttributes(url, logger);
    return {
        aspectType: fromJson.aspectType ?? url.searchParams.get('aspectTypeId') ?? undefined,
        categoryId: fromJson.categoryId ?? url.searchParams.get('categoryId') ?? undefined,
        productId: fromJson.productId ?? url.searchParams.get('productId') ?? undefined,
    };
}

/**
 * Builds the parameters object required by `resolvePage` for a page request.
 *
 * Parses aspect attributes from the URL (top-level query params for `/pages`
 * list lookups, an `aspectAttributes` JSON blob for `/pages/{pageId}` reads)
 * and determines the identifier type (`product`, `category`, or `page`) based
 * on which aspect attribute is provided.
 */
function getPageResolutionParams(args: ContentDispatchArgs): Parameters<typeof resolvePage>[0] {
    const { matched, dataStore, siteId, locale, defaultLocale, metrics, onError, clients, mediaHostPrefix, logger } =
        args;

    // `/pages/{pageId}` (getPage) carries aspect data inside the
    // `aspectAttributes` JSON query param. `/pages` (getPages) sends the
    // aspect type top-level as `aspectTypeId` and only the single most
    // specific business-object ID top-level (SCAPI rejects a call carrying
    // multiple), but still carries the full set — including the category
    // fallback a PDP drops from the top level — inside the `aspectAttributes`
    // JSON. Read that so category-level fallback survives on the manifest path.
    const aspectAttributes = matched.isList
        ? readGetPagesAspectAttributes(matched.url, logger)
        : parseAspectAttributes(matched.url, logger);

    if (metrics.parameters) {
        metrics.parameters.aspectType = aspectAttributes.aspectType;
        metrics.parameters.categoryId = aspectAttributes.categoryId;
        metrics.parameters.productId = aspectAttributes.productId;
    }

    const { aspectType, categoryId, productId } = aspectAttributes;
    let identifierType: IdentifierType = 'page';
    let id: string = matched.id;

    if (productId) {
        identifierType = 'product';
        id = productId;
    } else if (categoryId) {
        identifierType = 'category';
        id = categoryId;
    }

    // When a product ID is supplied alongside a category ID (caller-provided
    // primary category), pass the category through as a fallback so the
    // resolver can find a category-level page assignment when the product
    // itself has none. `resolveDynamicPageId` only consults this fallback
    // after the product lookup misses, so the happy path is unchanged.
    const productCategoryFallback = productId && categoryId ? categoryId : undefined;

    return {
        id,
        identifierType,
        aspectType,
        categoryId: productCategoryFallback,
        locale,
        defaultLocale,
        attrCtx: createSharedAttributeResolutionContext({ siteId, locale, mediaHostPrefix, logger }),
        manifestStorage: getManifestStorage({ dataStore, siteId, onError, metrics, logger }),
        contextResolver: getContextResolver({ onError, metrics, clients }),
    };
}

/**
 * Builds the parameters object required by `resolvePage` for a `getComponent`
 * request. Embedded components have no aspect dimension and no list lookup,
 * so the call is a direct id → manifest read.
 *
 * Note: SCAPI's `getComponent` accepts a free-form `parameters` query that
 * customizes the rendered component. The manifest path here ignores it —
 * fine for the in-scope static blocks (header, mini-cart) which never set
 * `parameters`, but a future caller passing `parameters` could see manifest
 * content diverge from what SCAPI would have rendered. Revisit when components
 * that take render-time parameters are brought into scope.
 */
function getComponentResolutionParams(args: ContentDispatchArgs): Parameters<typeof resolvePage>[0] {
    const { matched, dataStore, siteId, locale, defaultLocale, metrics, onError, clients, mediaHostPrefix, logger } =
        args;

    return {
        id: matched.id,
        identifierType: 'component',
        locale,
        defaultLocale,
        attrCtx: createSharedAttributeResolutionContext({ siteId, locale, mediaHostPrefix, logger }),
        manifestStorage: getManifestStorage({ dataStore, siteId, onError, metrics, logger }),
        contextResolver: getContextResolver({ onError, metrics, clients }),
    };
}

/**
 * Builds the per-request attribute-resolution context shared by every
 * resolvePage call this middleware issues. The host comes from the
 * ECOM-synced media-host-prefix DAL entry so manifest-resolved URLs match
 * what `mediaFile.getAbsURL()` would have produced on ECOM. `onWarn` routes
 * the resolver's recoverable-warning stream through the request-scoped
 * structured logger so malformed manifest envelopes surface in observability
 * instead of getting lost on stderr.
 */
function createSharedAttributeResolutionContext({
    siteId,
    locale,
    mediaHostPrefix,
    logger,
}: {
    siteId: string;
    locale: string;
    mediaHostPrefix: string;
    logger: Logger;
}) {
    return createAttributeResolutionContext({
        host: mediaHostPrefix,
        siteId,
        locale,
        onWarn: (warning) => {
            logger.warn(`[PageResolutionMiddleware] attribute resolution: ${warning.message}`, {
                kind: warning.kind,
                typeId: warning.typeId,
                attrId: warning.attrId,
                attrType: warning.attrType,
            });
        },
    });
}

/** Returns `true` when an array contains at least one element. */
function isPopulated(arr: unknown[] | null | undefined): boolean {
    return Array.isArray(arr) && arr.length > 0;
}

/**
 * Converts a BCP 47 locale tag (e.g. `"en-GB"`) to the underscore-separated
 * format used as keys in Page Designer manifests (e.g. `"en_GB"`).
 */
function toManifestLocale(locale: string): string {
    return locale.replaceAll('-', '_');
}

/**
 * Creates a {@link ContextResolver} that delegates to the SCAPI Shopper
 * Experience `qualifiers/resolve` endpoint.
 *
 * Forwards the resolution context (campaign qualifiers, customer groups,
 * and data bindings) and returns the resolved result. If none of the context
 * arrays contain any values the resolver returns `null` immediately without
 * making a network request. If the call fails, the error is wrapped in a
 * {@link QualifierResolveError} and passed to `onError`; the resolver then
 * returns `null`.
 */
function getContextResolver({
    onError,
    metrics,
    clients,
}: {
    onError: (error: QualifierResolveError) => void;
    metrics: Metrics;
    clients: Clients;
}): ContextResolver {
    return async (resolutionContext) => {
        const { campaignQualifiers, customerGroups, dataBindings } = resolutionContext;

        if (!isPopulated(campaignQualifiers) && !isPopulated(customerGroups) && !isPopulated(dataBindings)) {
            return null;
        }

        metrics.contextResolutionStart = performance.now();

        try {
            const result = await clients.shopperExperience.resolveQualifiers({
                params: {},
                body: { campaignQualifiers, dataBindings, customerGroups },
            });

            metrics.resolvedContext = result.data;

            return result.data;
        } catch (error: unknown) {
            onError(new QualifierResolveError(error));

            metrics.resolvedContext = null;

            return null;
        } finally {
            metrics.contextResolutionEnd = performance.now();
        }
    };
}

/**
 * Creates a {@link ManifestStorage} backed by the MRT Data Store.
 *
 * Provides methods to retrieve page, embedded-component, and site-level
 * manifests using Data Store keys derived from {@link getStorageKey}. All
 * manifest types are base64-encoded and deflate-compressed; they are decoded
 * and decompressed via {@link getAndUnpackDataStoreEntry}. Data Store errors
 * (not-found, unavailable, service) and unpack errors are caught and forwarded
 * to `onError`, resulting in a `null` return.
 */
function getManifestStorage({
    dataStore,
    siteId,
    onError,
    metrics,
    logger,
}: {
    dataStore: DataStoreClient;
    siteId: string;
    onError: (error: unknown) => void;
    metrics: Metrics;
    logger: Logger;
}): ManifestStorage {
    async function getManifest(kind: 'page', id: string): Promise<PageManifest | null>;
    async function getManifest(kind: 'component', id: string): Promise<ComponentManifest | null>;
    async function getManifest(kind: 'site'): Promise<SiteManifest | null>;
    async function getManifest(
        kind: ManifestType,
        id?: string
    ): Promise<PageManifest | ComponentManifest | SiteManifest | null> {
        try {
            let key: string;
            if (kind === 'site') {
                key = getStorageKey(siteId, 'site');
                metrics.siteManifestKey = key;
            } else {
                // Overloads guarantee `id` is supplied for non-'site' kinds; the
                // explicit check is here so TS can narrow without a non-null assertion.
                // The throw is caught by the surrounding try/catch and routed
                // through `onError`, so the request falls back to SCAPI rather
                // than failing the whole call.
                if (id == null) {
                    throw new ManifestStorageInputError(`getManifest: id is required for kind '${kind}'`);
                }
                key = getStorageKey(siteId, kind, id);
                if (kind === 'page') {
                    metrics.pageManifestKey = key;
                } else {
                    metrics.componentManifestKey = key;
                }
            }
            const result = await getAndUnpackDataStoreEntry(dataStore, key, kind, metrics);
            // Manifests are large structured payloads — too noisy for the
            // standard debug stream. Gated behind SFCC_PD_PAGE_RESOLUTION_DEBUG
            // so it's only emitted when troubleshooting.
            if (PAGE_RESOLUTION_DEBUG) {
                logger.debug(`[PageResolutionMiddleware] ${kind} manifest from KVS`, {
                    key,
                    manifest: result,
                });
            }
            return result;
        } catch (error: unknown) {
            onError(error);

            return null;
        }
    }

    return {
        getPageManifest: (id: string) => getManifest('page', id),
        getComponentManifest: (id: string) => getManifest('component', id),
        getSiteManifest: () => getManifest('site'),
    };
}

/**
 * Fetches a Data Store entry by key and unpacks it by decoding from base64,
 * decompressing with inflate, and parsing the resulting JSON.
 *
 * @throws {DataStoreEntryUnpackError} If decoding, decompression, or parsing fails.
 */
async function getAndUnpackDataStoreEntry(
    dataStore: DataStoreClient,
    key: string,
    manifestType: ManifestType,
    metrics: Metrics
): Promise<PageManifest | ComponentManifest | SiteManifest> {
    metrics[`${manifestType}ManifestRetrievalStart`] = performance.now();

    let entry: { value?: ManifestValue } | undefined;
    try {
        entry = (await dataStore.getEntry(key)) as { value?: ManifestValue } | undefined;
    } finally {
        metrics[`${manifestType}ManifestRetrievalEnd`] = performance.now();
    }

    if (!entry) {
        throw new DataStoreNotFoundError(`Data store entry not found for key: ${key}`);
    }

    try {
        metrics[`${manifestType}ManifestUnpackStart`] = performance.now();

        if (!entry.value?.compressedData) {
            // This will get caught so the error message doesn't
            // really matter here.
            throw new Error('Data store entry is blank');
        }

        // Compressed-bytes counter — O(1) byte length of the base64 string.
        metrics[`${manifestType}ManifestCompressedBytes`] = Buffer.byteLength(entry.value.compressedData, 'base64');

        // Uncompressed-bytes counter — pass-through Transform that increments
        // a counter per chunk. This avoids `JSON.stringify(parsed).length`,
        // which would walk the full object graph after parse and add real
        // time on large manifests.
        let inflatedBytes = 0;
        const counter = new Transform({
            transform(chunk: Buffer, _enc, cb) {
                inflatedBytes += chunk.length;
                cb(null, chunk);
            },
        });

        // `pipeline` propagates errors through the chain (inflate emits
        // 'error' on invalid data; bare `.pipe(...)` chains swallow it,
        // leaving an uncaught exception). We collect the JSON text into
        // a buffer so the consumer doesn't need to read a half-broken
        // stream after an error.
        const chunks: Buffer[] = [];
        const collector = new Transform({
            transform(chunk: Buffer, _enc, cb) {
                chunks.push(chunk);
                cb();
            },
        });

        await pipeline(
            Readable.from(Buffer.from(entry.value.compressedData, 'base64')),
            createInflate(),
            counter,
            collector
        );

        metrics[`${manifestType}ManifestUncompressedBytes`] = inflatedBytes;

        return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as PageManifest | ComponentManifest | SiteManifest;
    } catch (error: unknown) {
        throw new DataStoreEntryUnpackError(key, error);
    } finally {
        metrics[`${manifestType}ManifestUnpackEnd`] = performance.now();
    }
}

/** Reused across calls — TextEncoder is stateless and has no configuration. */
const keyEncoder = new TextEncoder();

/**
 * Encodes a string for use as a segment in a Data Store key.
 *
 * Data Store keys are restricted to `[A-Za-z0-9._-]`. This function encodes
 * any byte outside `[A-Za-z0-9-]` as `.XX` (uppercase hex), using `.` as the
 * escape prefix. Both `.` and `_` are always encoded (`.2E` and `.5F`) — `.`
 * because it is the escape prefix itself, and `_` because it is the segment
 * delimiter in key templates. This ensures `.` and `_` never appear bare in
 * output, making the encoding collision-free and unambiguously reversible.
 *
 * The encoding is byte-for-byte identical to the Java implementation in ecom.
 */
function sanitizeKeySegment(value: string): string {
    return [...keyEncoder.encode(value)]
        .map((b) => {
            const c = String.fromCharCode(b);
            return /[A-Za-z0-9-]/.test(c) ? c : `.${b.toString(16).toUpperCase().padStart(2, '0')}`;
        })
        .join('');
}

/**
 * Returns the Data Store key for a page, embedded-component, or site manifest.
 *
 * - `('page', pageId)` → `page-manifest_{site}_{pageId}`
 * - `('component', componentId)` → `component-manifest_{site}_{componentId}`
 * - `('site')` → `site-manifest_{site}`
 *
 * Both `siteId` and the per-entry id are sanitized via {@link sanitizeKeySegment}
 * before inclusion in the key, ensuring the key only contains characters
 * in `[A-Za-z0-9._-]` regardless of the input values.
 */
function getStorageKey(siteId: string, kind: 'page' | 'component', id: string): string;
function getStorageKey(siteId: string, kind: 'site'): string;
function getStorageKey(siteId: string, kind: ManifestType, id?: string): string {
    const safeSiteId = sanitizeKeySegment(siteId);
    if (kind === 'site') return `site-manifest_${safeSiteId}`;
    // Overloads guarantee `id` is supplied for non-'site' kinds; the explicit
    // check is here so TS can narrow without a non-null assertion. Caught by
    // the surrounding try/catch in `getManifest` and routed through `onError`.
    if (id == null) {
        throw new ManifestStorageInputError(`getStorageKey: id is required for kind '${kind}'`);
    }
    return `${kind}-manifest_${safeSiteId}_${sanitizeKeySegment(id)}`;
}

/**
 * Creates an error handler for page resolution errors.
 *
 * Returns a callback that categorises errors by type for observability.
 */
function getErrorHandler(logger: Logger): (error: unknown) => void {
    return (error: unknown) => {
        if (error instanceof DataStoreNotFoundError) {
            // Expected when a manifest hasn't been published yet — not necessarily a bug.
            logger.warn('[PageResolutionMiddleware] Data store entry not found', { message: error.message });
        } else if (error instanceof DataStoreUnavailableError) {
            logger.error('[PageResolutionMiddleware] Data store unavailable', { message: error.message });
        } else if (error instanceof DataStoreServiceError) {
            logger.error('[PageResolutionMiddleware] Data store service error', { message: error.message });
        } else if (error instanceof DataStoreEntryUnpackError) {
            logger.error('[PageResolutionMiddleware] Failed to unpack data store entry', {
                message: error.message,
                cause: error.cause,
            });
        } else if (error instanceof QualifierResolveError) {
            logger.error('[PageResolutionMiddleware] Failed to resolve qualifiers', {
                message: error.message,
                cause: error.cause,
            });
        } else if (error instanceof ManifestStorageInputError) {
            // Defensive guard — TS overloads should prevent this from ever
            // triggering. Log loudly but don't rethrow so the request falls
            // back to SCAPI instead of failing.
            logger.error('[PageResolutionMiddleware] Manifest storage input error', {
                message: error.message,
            });
        } else if (error instanceof RequiredError) {
            logger.error('[PageResolutionMiddleware] Required parameter missing during page resolution', {
                message: error.message,
            });
        } else {
            throw error;
        }
    };
}
