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
 * Platform-level handler instrumentation.
 *
 * Uses React Router's ServerInstrumentation API to observe the
 * request lifecycle at the handler and route levels. This runs around ALL
 * requests (document + data) and provides OpenTelemetry spans for:
 * - `sfnext.ssr` — SSR render span per incoming HTTP request (handler level)
 * - `sfnext.loader` — child span per route loader
 * - `sfnext.action` — child span per route action
 * - `sfnext.middleware` — child span per route middleware
 *
 * Span names are low-cardinality operation names; the route is carried in the
 * `http.route` attribute rather than the name, so traces aggregate by operation
 * and filter by route.
 *
 * `tracer` is `null` when OTel is disabled. Each handler checks explicitly
 * and calls through immediately, so the disabled path is always obvious.
 *
 * @env SFNEXT_OTEL_ENABLED — set to `"true"` to enable OpenTelemetry tracing.
 *   Spans are written synchronously to stdout via ConsoleSpanExporter, which is
 *   compatible with both local development and the Managed Runtime serverless
 *   environment (see otel/setup.ts for the full design rationale).
 *   Example: `SFNEXT_OTEL_ENABLED=true pnpm dev`
 *
 * @see https://reactrouter.com/how-to/instrumentation
 */

import { type Tracer, type Attributes, SpanStatusCode } from '@opentelemetry/api';
import type { ServerInstrumentation } from 'react-router';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { initTelemetry } from '../setup';

const tracer: Tracer | null = process.env.SFNEXT_OTEL_ENABLED === 'true' ? initTelemetry() : null;

/**
 * The read-only router context passed to each instrumentation callback. React
 * Router types it as `ReadonlyContext`, which is a `.get`-bearing provider only
 * when the app has enabled middleware (`MiddlewareEnabled`); the SDK's own
 * tsconfig doesn't resolve that flag, so we accept an optionally-`get`-bearing
 * value and narrow structurally at runtime.
 */
type MaybeReadonlyContext = { get?: (context: typeof siteContext) => unknown } | undefined;

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
function readSiteId(context: MaybeReadonlyContext): string | undefined {
    try {
        if (typeof context?.get !== 'function') return undefined;
        const resolved = context.get(siteContext) as { site?: { id?: string } } | null | undefined;
        return resolved?.site?.id;
    } catch {
        return undefined;
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
async function traced(
    spanName: string,
    attributes: Attributes,
    context: MaybeReadonlyContext,
    handle: () => Promise<{ status: string; error?: Error }>
): Promise<void> {
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
                if (result.status === 'error' && result.error) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
                    span.recordException(result.error);
                }
            } finally {
                const siteId = readSiteId(context);
                if (siteId) span.setAttribute('site_name', siteId);
                span.end();
            }
        });
    } catch {
        // OTel failure must never break the request pipeline.
        // If handle() was already called inside the span callback, don't call it again.
        if (!handled) await handle();
    }
}

/**
 * HTTP attributes common to all spans.
 * url.path only — url.full would expose query params which may contain auth
 * tokens or PII. http.response.status_code is not available from
 * InstrumentationHandlerResult.
 */
function httpAttributes(request: { method: string; url: string }): Attributes {
    const attrs: Attributes = { [ATTR_HTTP_REQUEST_METHOD]: request.method };
    try {
        attrs[ATTR_URL_PATH] = new URL(request.url).pathname;
    } catch {
        // Malformed URL — skip url.path rather than throwing
    }
    return attrs;
}

export const platformInstrumentation: ServerInstrumentation = {
    handler(handler) {
        handler.instrument({
            async request(handleRequest, { request, context }) {
                await traced('sfnext.ssr', httpAttributes(request), context, handleRequest);
            },
        });
    },
    route(route) {
        // The request method/url.path live on the parent server span. At the route
        // level the meaningful identifier is the URL route template (`http.route`,
        // the standard semantic-convention key — a bounded, low-cardinality value,
        // never the raw path with ids). The MRT log→trace bridge filters span
        // attributes against an allow list and drops keys not on it, so we only emit
        // attributes known to survive (`http.route` is a semantic-convention key the
        // bridge keeps; the framework's `rr.route.id` is not on the list and was
        // silently dropped, so it is no longer recorded).
        function routeAttributes(pattern: string): Attributes {
            return {
                [ATTR_HTTP_ROUTE]: pattern,
            };
        }

        route.instrument({
            async loader(handleLoader, { pattern, context }) {
                await traced('sfnext.loader', routeAttributes(pattern), context, handleLoader);
            },
            async action(handleAction, { pattern, context }) {
                await traced('sfnext.action', routeAttributes(pattern), context, handleAction);
            },
            async middleware(handleMiddleware, { pattern, context }) {
                await traced('sfnext.middleware', routeAttributes(pattern), context, handleMiddleware);
            },
        });
    },
};
