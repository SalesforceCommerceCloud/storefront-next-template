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
 * Server middleware that forwards the client-written `dw_attribution` cookie to ECOM on the SCAPI
 * order-placement call (W-23493124).
 *
 * ## Why this exists
 *
 * The `dw_attribution` first-touch marketing-attribution cookie is written in the browser (see
 * `@/lib/attribution` and the `useAttribution` hook). At order placement ECOM reads it from the
 * request `Cookie` header — `CookieMgr.getCookieValue('dw_attribution')` — and emits
 * `entryRequestURL` / `sessionReferrer` for CIP. Headless flows have no ClickStream, so the value
 * only reaches ECOM if the cookie travels on the `createOrder` request.
 *
 * PWA Kit gets this for free: its order call is a browser request proxied through
 * `/mobify/proxy/api`, so the browser's `dw_attribution` cookie rides along on the forwarded
 * `Cookie` header. SFN instead builds the SCAPI `createOrder` request server-side and forwards
 * only `Authorization` + `sfdc_dwsid` (see the auth middleware in `api-clients.server.ts`), so the
 * browser cookie would never reach ECOM. This middleware closes that gap by copying the value from
 * the inbound storefront request onto the outbound `createOrder` request's `Cookie` header.
 *
 * ## How it's wired
 *
 * A React Router root middleware reads the value from the inbound request and — when present and
 * not blocked by a tracking-consent opt-out — registers a SCAPI client middleware (scoped to the
 * `shopperOrders` client) via the shared registry. `createApiClients` applies the registered
 * middleware to the freshly built clients on every call, so it is in place before every
 * `createOrder` entry point regardless of router-middleware ordering (mirrors the Page Designer
 * resolution middleware).
 *
 * Only `dw_attribution` is forwarded — never the rest of the storefront's cookies (auth/session) —
 * and only on the `POST /orders` placement call, matching the point at which ECOM reads it. Fails
 * open: forwarding is best-effort and must never break order placement.
 */
import type { MiddlewareFunction } from 'react-router';
import type { Middleware } from '@/scapi';
import { getScapiMiddlewareRegistry } from '@/lib/scapi-middleware';
import { parseAllCookies } from '@/lib/cookie-utils.server';
import { COOKIE_TRACKING_CONSENT } from '@/middlewares/auth.utils';
import { TrackingConsent } from '@/types/tracking-consent';
// The cookie name is a cross-system contract, documented on the module that writes it. Import it
// from there (rather than redeclaring it) so the client write and this server forward can never
// drift apart.
import { ATTRIBUTION_COOKIE_NAME } from '@/lib/attribution';
import { getLogger } from '@/lib/logger.server';
import type { Logger } from '@/lib/logger';

/**
 * Matches the SCAPI shopper-orders `createOrder` path (`.../orders`). Anchored to the end of the
 * pathname so it matches order placement (`POST /orders`) but not a single-order read
 * (`GET /orders/{orderNo}`) or any other shopper-orders endpoint.
 */
const CREATE_ORDER_PATH_RE = /\/orders$/;

/**
 * Registry key. Stable so that a router middleware firing more than once within a single request
 * replaces the entry in place rather than registering the forward twice.
 */
const REGISTRY_KEY = 'attribution-forwarding';

/**
 * Registers the SCAPI forwarding middleware when the inbound request carries a `dw_attribution`
 * cookie and the shopper has not explicitly opted out of tracking.
 */
export const attributionForwardingMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const cookies = parseAllCookies(request.headers.get('cookie'));
    const attributionValue = cookies[ATTRIBUTION_COOKIE_NAME];

    // `TrackingConsent` is a string enum; the raw cookie is a plain string, so compare against the
    // enum's primitive value to keep the comparison type-safe.
    const trackingDeclined = cookies[COOKIE_TRACKING_CONSENT] === (TrackingConsent.Declined as string);

    // Only register when there is a value to forward and the shopper has not explicitly opted out.
    // The client already clears the cookie on opt-out (`dw_dnt=1`); this is defense-in-depth so a
    // value that survived a client-side clear is never forwarded when `dw_dnt=1` is present. An
    // absent `dw_dnt` permits the forward — consent is only recorded client-side, so requiring an
    // explicit `=0` would forward nothing.
    if (attributionValue && !trackingDeclined) {
        getScapiMiddlewareRegistry(context).register(REGISTRY_KEY, {
            clients: ['shopperOrders'],
            factory: (factoryContext) =>
                createAttributionForwardingMiddleware(attributionValue, getLogger(factoryContext)),
        });
    }

    return next();
};

/**
 * Builds the SCAPI client middleware that appends `dw_attribution=<value>` to the outbound
 * `Cookie` header on the `POST /orders` call.
 *
 * The value is forwarded verbatim — it is already the agreed percent-encoded `key=value&…` form
 * ECOM reads and carries no cookie separators, so it must not be re-encoded. Any existing `Cookie`
 * header is preserved (the attribution pair is appended, not overwritten).
 */
function createAttributionForwardingMiddleware(attributionValue: string, logger: Logger): Middleware {
    return {
        onRequest({ request }) {
            try {
                if (request.method !== 'POST' || !CREATE_ORDER_PATH_RE.test(new URL(request.url).pathname)) {
                    return request;
                }
                const attributionCookie = `${ATTRIBUTION_COOKIE_NAME}=${attributionValue}`;
                const existing = request.headers.get('cookie');
                request.headers.set('cookie', existing ? `${existing}; ${attributionCookie}` : attributionCookie);
            } catch (error) {
                // Fail open: attribution forwarding must never break order placement.
                logger.warn('dw_attribution: skipping order-cookie forwarding due to error', { error });
            }
            return request;
        },
    };
}
