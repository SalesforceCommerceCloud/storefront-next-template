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
import { createContext, type MiddlewareFunction } from 'react-router';

const HEADER_CACHE_CONTROL = 'Cache-Control';

/**
 * Error statuses CloudFront caches by default (for 10 seconds) when the origin sends no `Cache-Control`.
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html#HTTPStatusCodes-cached-errors}
 */
const CDN_CACHED_ERROR_STATUSES = new Set([400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504]);

/**
 * Set to `true` by a middleware or loader just before it throws an error caused by this shopper's own request (for
 * example, their cookies) rather than by a system failure. Shared caches key pages without cookies, so caching such an
 * error would serve it to every shopper on the URL. The response is then sent with `no-store`, including on document
 * requests.
 */
export const shopperSpecificErrorContext = createContext<boolean>(false);

/**
 * Header React Router stamps on every single-fetch (`.data`) response via its internal `generateSingleFetchResponse`.
 * Present on data responses, absent on document (HTML) responses. Since react-router 7.3.0.
 */
const HEADER_DATA_RESPONSE = 'X-Remix-Response';

/**
 * Whether a request/response pair represents a React Router single-fetch data interaction rather than a document.
 *
 * React Router serves client-side navigations and fetcher calls from `<route>.data` URLs that return a turbo-stream
 * payload, while full-page (document) requests hit the bare route URL and return HTML. We detect a data interaction
 * from either signal:
 *
 * - **Request URL** — the pathname ends in `.data`. This is the future-safe signal, but it only reaches middleware
 *   once the app preserves the suffix on `request.url` (react-router ≥ 7.13.2 with `v8_passThroughRequests`,
 *   stabilized from `unstable_passThroughRequests` in 7.15).
 *   On earlier versions of React Router, the suffix is stripped before middleware runs.
 * - **Response header** — the response carries `X-Remix-Response`. This works on react-router ≥ 7.3.0, where it is the
 *   only middleware-visible signal for a data response.
 */
function isDataRequest(request: Request, response: Response): boolean {
    return new URL(request.url).pathname.endsWith('.data') || response.headers.has(HEADER_DATA_RESPONSE);
}

/**
 * Sets `Cache-Control` on a 5xx data response.
 *
 * A 503 is treated as a transient overload signal (e.g., SCAPI load shedding): we let it cache for `max-age=2` so the
 * brief shared cache acts as a system-wide cool-down that shields the origin from a retry stampede, while still
 * clearing within a couple of seconds. Every other cached 5xx (500–502, 504) is a genuine error with no backoff value,
 * so we forbid caching outright with `no-store`. Existing private/no-store directives always take precedence.
 */
function handleDataRequest(response: Response): Response {
    // A personalized error must not become shared cache backoff, even for 503.
    if (/(?:^|,)\s*(?:private|no-store)(?:\s*(?:,|$|=))/i.test(response.headers.get(HEADER_CACHE_CONTROL) ?? '')) {
        return response;
    }
    if (response.status === 503) {
        response.headers.set(HEADER_CACHE_CONTROL, 'max-age=2');
    } else {
        response.headers.set(HEADER_CACHE_CONTROL, 'no-store');
    }
    return response;
}

function handle(request: Request, response: Response, shopperSpecificError: boolean): Response {
    // The shared cache key has no cookies, so a cached error that sets cookies would hand this shopper's session
    // cookies (or their deletion) to every shopper on the URL. The same goes for an error caused by this shopper.
    if (
        CDN_CACHED_ERROR_STATUSES.has(response.status) &&
        (shopperSpecificError || response.headers.has('Set-Cookie'))
    ) {
        response.headers.set(HEADER_CACHE_CONTROL, 'no-store');
        return response;
    }
    if (response.status >= 500 && response.status <= 504 && isDataRequest(request, response)) {
        return handleDataRequest(response);
    }
    return response;
}

/**
 * Middleware to keep CloudFront from caching 5xx error responses for longer than intended.
 *
 * On responses with status 500–504 (the 5xx subset CloudFront caches by default) it sets `Cache-Control: no-store` —
 * except for 503, which it lets cache briefly (`max-age=2`) as a deliberate overload backoff. See
 * {@link handleDataRequest} for the rationale behind the 503 carve-out.
 *
 * # Scope: React Router data interactions only
 *
 * The behavior is applied only to React Router single-fetch data interactions — the client-side navigations and
 * fetcher calls that hit `<route>.data` URLs and return a turbo-stream payload. Document (full-page HTML) responses are
 * left untouched unless an exception below applies. This keeps the backoff behavior described below for error
 * responses that set no cookies, while preventing a stale cached error from sticking to an in-session shopper's data
 * fetches. See {@link isDataRequest} for how the two signals are detected.
 *
 * Exceptions, which get `no-store` on any request type and any status in {@link CDN_CACHED_ERROR_STATUSES}:
 * - The response sets cookies. A shared cache would replay them to other shoppers (for example, one guest's session
 *   cookies on a cached 404, or a full cookie clear on a cached 500).
 * - The error is flagged with {@link shopperSpecificErrorContext}.
 *
 * The auth middleware sets the `__sfdc_usertype` cookie on nearly every response, so in practice almost every error
 * that passes through this middleware is sent with `no-store`, including data 503s (no `max-age=2` backoff) and
 * document errors (no default CDN error caching). This is deliberate: replaying a cookie-setting error to other
 * shoppers is a session-sharing bug. Overload protection therefore has to come from elsewhere (SCAPI load shedding,
 * MRT concurrency limits, the `sfdc_load` headers), not from CDN error caching.
 *
 * # Note / Warning
 *
 * CloudFront caches error pages for 10 seconds by default. This has built-in downsides, some serious. During traffic
 * spikes like flash sales or Black Friday, even occasional errors can snowball into large bursts, leaving many
 * customers stuck on error pages for a while. But permanently switching off error caching is a trade-off, not a clean
 * win. Error caching also acts as a backoff mechanism. When load is high and errors are not just sporadic, that
 * 10-second cache shields your backend from being hammered by repeated failing requests. Disable it, and you lose that
 * protection. By default, we therefore only apply this cache bypass behavior to 5xx responses. Any extensions or
 * customizations should be made carefully and should always account for orthogonal signals such as 429 responses or
 * the SCAPI-emitted sfdc_load_status and sfdc_load headers.
 *
 * # CloudFront / MRT distribution config (required)
 *
 * Experiments have shown that sending the `Cache-Control` header alone is sufficient to prevent the caching of error
 * responses/pages. However, this contradicts AWS’s own documentation. It's therefore recommended to adjust the default
 * value for CloudFront's *Error Caching Minimum TTL* setting for status codes 500, 501, 502, 503, 504 in parallel.
 * AWS documents that some error statuses ignore `no-store` while that TTL is positive. The session-sharing protection
 * above depends on the distribution honoring the header, so set the minimum TTL to 0 for the statuses in
 * {@link CDN_CACHED_ERROR_STATUSES}.
 *
 * # Placement
 *
 * Register on the **root route** so it covers responses produced by the ErrorBoundary render path. A deeper placement
 * would miss errors that bubble past the registered route. Place it as high up in the middleware stack as possible, at
 * least high enough to ensure that no other middlewares placed before it make any changes to the response headers.
 *
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html}
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-expiration.html}
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html#HTTPStatusCodes-cached-errors}
 */
export const errorCacheControlMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const response = await next();
    return handle(request, response, context.get(shopperSpecificErrorContext));
};
