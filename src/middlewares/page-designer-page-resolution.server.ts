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
 * Presence-only response header set when a Page Designer `getPage`
 * response was synthesized from the MRT manifest cache by
 * {@code resolveGetPageRequest}. Absent when the request fell through to
 * SCAPI and the response came from ECOM. Mirrors the cache-status header
 * convention (`X-Cache-Hit`, `Cf-Cache-Status`) so observability tooling
 * can tell at a glance which path served the response.
 */
const PAGE_MANIFEST_HIT_HEADER = 'x-page-manifest-hit';

/**
 * When `SFCC_PD_PAGE_RESOLUTION_DEBUG=true` is set, the middleware emits
 * additional debug logs containing the full resolved page response and
 * the raw page/site manifests retrieved from KVS. These payloads can be
 * very large — far too noisy for the standard debug log — so they're
 * gated behind an explicit env var that's only flipped on during
 * troubleshooting.
 *
 * Resolved once at module load: env vars don't change per-request and
 * re-reading `process.env` on every page is wasteful.
 */
const PAGE_RESOLUTION_DEBUG = process.env.SFCC_PD_PAGE_RESOLUTION_DEBUG === 'true';

type ManifestType = 'page' | 'site';
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
 * Server-only middleware that registers an SCAPI client middleware factory to
 * intercept `shopperExperience.getPage` calls and resolve Page Designer pages
 * from the MRT Data Store when available.
 *
 * The factory is evaluated lazily at `createApiClients` time (inside loaders),
 * so all context values are guaranteed to be available regardless of middleware
 * ordering. When the feature flag is disabled or the Data Store is not
 * available (e.g. local development), the factory returns `null` and `getPage`
 * calls pass through to SCAPI as usual.
 *
 * Design/preview mode requests (containing `mode` or `pdToken` query params)
 * are never intercepted — they always reach SCAPI for live content.
 */
export const pageDesignerResolutionMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
    const config = getConfig(context);

    const registry = getScapiMiddlewareRegistry(context);

    if (config.features.mrtBasedPageDesignerResolution) {
        registry.register('page-designer-page-resolution', {
            clients: ['shopperExperience'],
            factory: createPageResolutionMiddleware,
        });
    } else if (PAGE_RESOLUTION_DEBUG) {
        // Feature flag off but debug telemetry on: register a passthrough
        // SCAPI middleware that times the upstream getPage call and logs
        // the response body. Used to compare ECOM-resolved output against
        // MRT-resolved output during parity troubleshooting.
        registry.register('page-designer-page-resolution-debug', {
            clients: ['shopperExperience'],
            factory: createGetPageDebugMiddleware,
        });
    }

    return next();
};

/**
 * SCAPI middleware factory that times {@code shopperExperience.getPage}
 * round trips and logs the parsed response body. Only registered when the
 * feature flag is off and `SFCC_PD_PAGE_RESOLUTION_DEBUG=true` — keeps the
 * payload off the standard debug log unless explicitly opted in.
 *
 * Concurrent in-flight requests are kept separate via a WeakMap keyed by
 * the request object, so interleaved page resolutions don't clobber each
 * other's start-time markers.
 */
function createGetPageDebugMiddleware(
    context: RouterContextProvider | Readonly<RouterContextProvider>
): Middleware | null {
    const logger = getLogger(context);
    const startTimes = new WeakMap<Request, number>();

    return {
        onRequest: ({ request }) => {
            if (processGetPageRequest(request) != null) {
                startTimes.set(request, performance.now());
            }
        },
        onResponse: async ({ request, response }) => {
            if (processGetPageRequest(request) == null) {
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
                logger.warn('[PageResolutionMiddleware] ECOM page resolution: failed to parse response body', {
                    error,
                });
                return response;
            }

            logger.debug('[PageResolutionMiddleware] ECOM page resolution', {
                duration,
                response: body,
            });

            return response;
        },
    };
}

function processGetPageRequest(request: Request): { url: URL; pageId: string } | undefined {
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const match = url.pathname.match(GET_PAGE_PATH_RE);

    if (!match) return;

    // Design/preview mode requests must always reach SCAPI for live content
    if (url.searchParams.has('mode') || url.searchParams.has('pdToken')) return;

    // `pageId` is the empty string for `/pages` (getPages) requests and a
    // non-empty string for `/pages/{pageId}` (getPage) — callers can use
    // `!pageId` to distinguish the two.
    return {
        pageId: match[1] ? decodeURIComponent(match[1]) : '',
        url,
    };
}

/**
 * SCAPI middleware factory for Page Designer page resolution.
 *
 * Reads the Data Store, site ID, and locale from context.
 * Returns an openapi-fetch middleware that intercepts `getPage` requests,
 * or `null` if the Data Store is unavailable.
 */
function createPageResolutionMiddleware(
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
                const response = await resolveGetPageRequest({
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
                logger.error('[PageResolutionMiddleware] Unexpected error during page resolution', { error });
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
    siteManifestRetrievalStart?: number;
    siteManifestRetrievalEnd?: number;
    siteManifestUnpackStart?: number;
    siteManifestUnpackEnd?: number;
    parameters?: {
        mediaHostPrefix?: string;
        locale: string;
        defaultLocale: string;
        pageId?: string;
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
    /** Data Store key the site manifest was looked up under. See {@link pageManifestKey}. */
    siteManifestKey?: string;
    resolutionParameters?: {
        id: string;
        identifierType: IdentifierType;
        aspectType?: string;
        categoryId?: string;
        locale: string;
    };
    resolutionResult?: ShopperExperience.schemas['Page'] | null;
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
    const siteManifestRetrievalDuration = getDuration(
        metrics.siteManifestRetrievalEnd,
        metrics.siteManifestRetrievalStart
    );
    const pageManifestUnpackDuration = getDuration(metrics.pageManifestUnpackEnd, metrics.pageManifestUnpackStart);
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
        siteManifestRetrievalDuration,
        pageManifestUnpackDuration,
        siteManifestUnpackDuration
    );

    logger.debug('[PageResolutionMiddleware] page resolution', {
        resource: metrics.resource,
        resolvedPageId: metrics.resolutionResult?.id,
        resolvedPageTypeId: metrics.resolutionResult?.typeId,
        resolvedContext: metrics.resolvedContext ? sanitizeResolvedContext(metrics.resolvedContext) : null,
        resolvedParameters: metrics.resolutionParameters,
        parameters: metrics.parameters,
        metrics: {
            resolutionDuration,
            contextResolutionDuration,
            pageManifestRetrievalDuration,
            siteManifestRetrievalDuration,
            pageManifestUnpackDuration,
            siteManifestUnpackDuration,
            runtimeProcessingDuration,
            pageManifestKey: metrics.pageManifestKey,
            siteManifestKey: metrics.siteManifestKey,
            pageManifestCompressedBytes: metrics.pageManifestCompressedBytes,
            pageManifestUncompressedBytes: metrics.pageManifestUncompressedBytes,
            siteManifestCompressedBytes: metrics.siteManifestCompressedBytes,
            siteManifestUncompressedBytes: metrics.siteManifestUncompressedBytes,
        },
    });
}

/**
 * Attempts to resolve a `getPage` request from the Data Store.
 *
 * Matches GET requests to `/pages/{pageId}`, extracts the page ID and aspect
 * attributes from the URL, and resolves the page from the Data Store manifest.
 * Returns a JSON `Response` if resolution succeeds, or `undefined` to let the
 * request pass through to SCAPI.
 *
 * Requests in design/preview mode (`mode` or `pdToken` query params) are
 * never intercepted.
 */
async function resolveGetPageRequest({
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
    const processed = processGetPageRequest(request);
    if (!processed) return;
    const { pageId, url } = processed;
    // `/pages/{pageId}` (getPage) sets a non-empty pageId; `/pages`
    // (getPages) sets `pageId === ''` per processGetPageRequest's contract.
    const isGetPages = !pageId;

    // Lazy lookup — the site URL config Data Store entry is only fetched
    // here, after we've confirmed this is a page request we'd actually
    // resolve. Non-page traffic (PDPs, account, search) never pays the
    // round trip.
    const mediaHostPrefix = (await getSiteUrlConfig(context))?.mediaHostPrefix;

    // Without the ECOM-synced media host prefix we'd stamp media URLs at the
    // SCAPI request origin (the API Gateway hostname in MRT), which the
    // browser can't load. Fall through to SCAPI so it can resolve the page
    // with correct URLs instead.
    if (!mediaHostPrefix) {
        logger.warn('[PageResolutionMiddleware] mediaHostPrefix not available; falling back to SCAPI page resolution', {
            siteId,
            pageId,
            path: url.pathname,
        });
        return;
    }

    metrics.resolutionStart = performance.now();
    metrics.parameters = {
        locale,
        defaultLocale,
        pageId,
        mediaHostPrefix,
        path: url.pathname,
        search: url.search,
    };

    // `/pages/{pageId}` (getPage) carries aspect data inside the
    // `aspectAttributes` JSON query param. `/pages` (getPages) sends the
    // aspect type top-level as `aspectTypeId` and only the single most
    // specific business-object ID top-level (SCAPI rejects a call carrying
    // multiple), but still carries the full set — including the category
    // fallback a PDP drops from the top level — inside the `aspectAttributes`
    // JSON. Read that so category-level fallback survives on the manifest path.
    const aspectAttributes = isGetPages
        ? readGetPagesAspectAttributes(url, logger)
        : parseAspectAttributes(url, logger);

    Object.assign(metrics.parameters, {
        aspectType: aspectAttributes.aspectType,
        categoryId: aspectAttributes.categoryId,
        productId: aspectAttributes.productId,
    });

    const parameters = getPageResolutionParams({
        metrics,
        clients,
        dataStore,
        siteId,
        locale,
        defaultLocale,
        pageId,
        aspectAttributes,
        onError,
        request,
        mediaHostPrefix,
        logger,
    });

    metrics.resolutionParameters = {
        id: parameters.id,
        identifierType: parameters.identifierType,
        aspectType: parameters.aspectType,
        // The fallback is only ever a string here — `getPageResolutionParams`
        // never wraps it in a Promise. Narrow defensively so the metric stays
        // log-safe if that ever changes.
        categoryId: typeof parameters.categoryId === 'string' ? parameters.categoryId : undefined,
        locale: parameters.locale,
    };

    const resolved = await resolvePage(parameters);

    metrics.resolutionEnd = performance.now();

    if (resolved) {
        metrics.resolutionResult = resolved;

        // Fully resolved page is large — too noisy for the standard debug
        // stream. Gated behind SFCC_PD_PAGE_RESOLUTION_DEBUG so it's only
        // emitted when troubleshooting the manifest-vs-SCAPI parity.
        if (PAGE_RESOLUTION_DEBUG) {
            logger.debug('[PageResolutionMiddleware] resolved page response', {
                pageId: resolved.id,
                page: resolved,
            });
        }

        // Match the response shape expected by each SCAPI endpoint:
        // `getPage` returns a single Page; `getPages` returns `{ data: Page[] }`.
        return Response.json(isGetPages ? { data: [resolved] } : resolved, {
            headers: { [PAGE_MANIFEST_HIT_HEADER]: '1' },
        });
    }
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
 * Builds the parameters object required by the `resolvePage` function.
 *
 * Determines the identifier type (`product`, `category`, or `page`) based on
 * which aspect attribute is provided, and constructs the manifest storage and
 * context resolver from the given dependencies.
 */
function getPageResolutionParams({
    dataStore,
    siteId,
    locale,
    defaultLocale,
    pageId,
    aspectAttributes,
    metrics,
    onError,
    clients,
    mediaHostPrefix,
    logger,
}: {
    dataStore: DataStoreClient;
    siteId: string;
    locale: string;
    defaultLocale: string;
    pageId?: string;
    aspectAttributes: { aspectType?: string; categoryId?: string; productId?: string };
    metrics: Metrics;
    onError: (error: unknown) => void;
    clients: Clients;
    request: Request;
    /**
     * Scheme + host from the ECOM-synced
     * {@code SiteUrlConfigDalEntryProvider} DAL entry — required. The
     * caller (`resolveGetPageRequest`) guards on its presence and falls
     * through to SCAPI when missing, so by the time this runs the value is
     * guaranteed to be defined.
     */
    mediaHostPrefix: string;
    /** Logger used by the attribute resolver's onWarn handler. */
    logger: Logger;
}): Parameters<typeof resolvePage>[0] {
    const { aspectType, categoryId, productId } = aspectAttributes;
    let identifierType: IdentifierType = 'page';
    let id: string = pageId ?? '';

    if (productId) {
        identifierType = 'product';
        id = productId;
    } else if (categoryId) {
        identifierType = 'category';
        id = categoryId;
    }

    // Build the per-request attribute-resolution context. The host comes
    // from the ECOM-synced media-host-prefix DAL entry so manifest-resolved
    // URLs match what `mediaFile.getAbsURL()` would have produced on ECOM.
    // `onWarn` routes the resolver's recoverable-warning stream through the
    // request-scoped structured logger so malformed manifest envelopes
    // surface in observability instead of getting lost on stderr.
    const attrCtx = createAttributeResolutionContext({
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
        attrCtx,
        manifestStorage: getPageManifestStorage({ dataStore, siteId, onError, metrics, logger }),
        contextResolver: getContextResolver({ onError, metrics, clients }),
    };
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
 * Provides methods to retrieve page-level and site-level manifests using
 * Data Store keys derived from {@link getStorageKey}. Both manifest types are
 * base64-encoded and deflate-compressed; they are decoded and decompressed via
 * {@link getAndUnpackDataStoreEntry}. Data Store errors (not-found, unavailable,
 * service) and unpack errors are caught and forwarded to `onError`, resulting in
 * a `null` return.
 */
function getPageManifestStorage({
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
    async function getManifest(): Promise<SiteManifest | null>;
    async function getManifest(id: string): Promise<PageManifest | null>;
    async function getManifest(id?: string): Promise<PageManifest | SiteManifest | null> {
        const key = getStorageKey(siteId, id);
        const manifestType = id ? 'page' : 'site';

        if (manifestType === 'page') {
            metrics.pageManifestKey = key;
        } else {
            metrics.siteManifestKey = key;
        }

        try {
            const result = await getAndUnpackDataStoreEntry(dataStore, key, manifestType, metrics);
            // Manifests are large structured payloads — too noisy for the
            // standard debug stream. Gated behind SFCC_PD_PAGE_RESOLUTION_DEBUG
            // so it's only emitted when troubleshooting.
            if (PAGE_RESOLUTION_DEBUG) {
                logger.debug(`[PageResolutionMiddleware] ${manifestType} manifest from KVS`, {
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
        getPageManifest: (id: string) => getManifest(id),
        getSiteManifest: () => getManifest(),
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
): Promise<PageManifest | SiteManifest> {
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

        return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as PageManifest | SiteManifest;
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
 * Returns the Data Store key for a page or site manifest.
 *
 * Both `siteId` and `pageId` are sanitized via {@link sanitizeKeySegment}
 * before inclusion in the key, ensuring the key only contains characters
 * in `[A-Za-z0-9._-]` regardless of the input values.
 */
function getStorageKey(siteId: string, pageId?: string): string {
    const safeSiteId = sanitizeKeySegment(siteId);
    return pageId ? `page-manifest_${safeSiteId}_${sanitizeKeySegment(pageId)}` : `site-manifest_${safeSiteId}`;
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
        } else if (error instanceof RequiredError) {
            logger.error('[PageResolutionMiddleware] Required parameter missing during page resolution', {
                message: error.message,
            });
        } else {
            throw error;
        }
    };
}
