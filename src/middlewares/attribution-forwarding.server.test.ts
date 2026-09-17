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
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { attributionForwardingMiddleware } from './attribution-forwarding.server';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { scapiMiddlewareContext, ScapiMiddlewareRegistry } from '@/lib/scapi-middleware';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

// The canonical on-the-wire value from the attribution contract: percent-encoded `key=value`
// pairs joined with `&`. It contains no cookie separators, so it survives a Cookie-header
// round-trip unchanged — and must be forwarded verbatim (never re-encoded).
const ATTRIBUTION_VALUE =
    'utm_source=google&utm_medium=cpc&gclid=abc123&ref=https%3A%2F%2Fblog.com%2Fpost%3Futm_source%3Dnews';

// A realistic SCAPI shopper-orders endpoint base — the createOrder path ends in `/orders`.
const SHOPPER_ORDERS_BASE =
    'https://short.api.commercecloud.salesforce.com/checkout/shopper-orders/v1/organizations/org1';

describe('middlewares/attribution-forwarding.server.ts', () => {
    let context: Readonly<RouterContextProvider>;
    let registry: ScapiMiddlewareRegistry;
    let next: Mock<() => Promise<Response>>;

    beforeEach(() => {
        vi.clearAllMocks();
        context = createTestContext();
        registry = new ScapiMiddlewareRegistry();
        (context as RouterContextProvider).set(scapiMiddlewareContext, registry);
        next = vi.fn<() => Promise<Response>>().mockResolvedValue(new Response());
    });

    /** Invokes the router middleware with an inbound request carrying the given Cookie header. */
    async function runWithCookie(cookieHeader?: string): Promise<void> {
        const headers = new Headers();
        if (cookieHeader) headers.set('cookie', cookieHeader);
        const request = new Request('https://shop.example.com/checkout', { headers });
        await attributionForwardingMiddleware(createLoaderArgs(request, context, { pattern: '/' }), next);
    }

    /** Resolves the single registered SCAPI middleware, asserting it is scoped to shopperOrders. */
    function getRegisteredScapiMiddleware() {
        const entries = Array.from(registry.entries());
        expect(entries).toHaveLength(1);
        expect(entries[0].clients).toEqual(['shopperOrders']);
        const middleware = entries[0].factory(context, {} as never);
        if (!middleware?.onRequest) throw new Error('expected a middleware exposing onRequest');
        return middleware.onRequest;
    }

    describe('registration', () => {
        it('registers a shopperOrders-scoped factory when the attribution cookie is present', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);

            const entries = Array.from(registry.entries());
            expect(entries).toHaveLength(1);
            expect(entries[0].clients).toEqual(['shopperOrders']);
            expect(typeof entries[0].factory).toBe('function');
            expect(next).toHaveBeenCalledOnce();
        });

        it('does not register when there is no attribution cookie (but other cookies exist)', async () => {
            await runWithCookie('dwsid=abc; cc-nx-g=token');

            expect(Array.from(registry.entries())).toHaveLength(0);
            expect(next).toHaveBeenCalledOnce();
        });

        it('does not register when there is no Cookie header at all', async () => {
            await runWithCookie();

            expect(Array.from(registry.entries())).toHaveLength(0);
            expect(next).toHaveBeenCalledOnce();
        });

        it('does not register when tracking consent is declined (dw_dnt=1), even with a value', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}; dw_dnt=1`);

            expect(Array.from(registry.entries())).toHaveLength(0);
            expect(next).toHaveBeenCalledOnce();
        });

        it('registers when tracking consent is accepted (dw_dnt=0) with a value', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}; dw_dnt=0`);

            expect(Array.from(registry.entries())).toHaveLength(1);
        });

        it('registers when dw_dnt is absent (an absent opt-out permits the forward)', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);

            expect(Array.from(registry.entries())).toHaveLength(1);
        });

        it('is idempotent across a double-fire within one request (one entry, same key)', async () => {
            const headers = new Headers();
            headers.set('cookie', `dw_attribution=${ATTRIBUTION_VALUE}`);
            const request = new Request('https://shop.example.com/checkout', { headers });
            const args = createLoaderArgs(request, context, { pattern: '/' });

            await attributionForwardingMiddleware(args, next);
            await attributionForwardingMiddleware(args, next);

            expect(Array.from(registry.entries())).toHaveLength(1);
        });
    });

    describe('SCAPI forwarding (registered onRequest)', () => {
        it('appends dw_attribution to the outbound Cookie header on POST /orders', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders`, { method: 'POST' });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBe(`dw_attribution=${ATTRIBUTION_VALUE}`);
        });

        it('appends dw_attribution on the real createOrder URL shape (POST /orders?siteId=…)', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            // SCAPI createOrder always carries required query params (`siteId`, optional `locale`).
            // The path-anchored regex must still match because it tests the pathname, not the raw URL.
            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders?siteId=RefArch&locale=en-US`, {
                method: 'POST',
            });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBe(`dw_attribution=${ATTRIBUTION_VALUE}`);
        });

        it('forwards the value verbatim (does not re-encode the percent-encoded pairs)', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders`, { method: 'POST' });
            await onRequest({ request: outbound } as never);

            // The `ref` component keeps its single layer of percent-encoding — no `%253A` etc.
            expect(outbound.headers.get('cookie')).toContain('ref=https%3A%2F%2Fblog.com%2Fpost%3Futm_source%3Dnews');
            expect(outbound.headers.get('cookie')).not.toContain('%25');
        });

        it('preserves an existing outbound Cookie header (appends rather than overwrites)', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders`, {
                method: 'POST',
                headers: { cookie: 'existing=1' },
            });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBe(`existing=1; dw_attribution=${ATTRIBUTION_VALUE}`);
        });

        it('does not modify a single-order read (GET /orders/{orderNo})', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders/ABC123`, { method: 'GET' });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBeNull();
        });

        it('does not modify a non-POST request to /orders', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders`, { method: 'GET' });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBeNull();
        });

        it('does not modify a POST to a non-orders endpoint', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/baskets/basket-1/payment-instruments`, {
                method: 'POST',
            });
            await onRequest({ request: outbound } as never);

            expect(outbound.headers.get('cookie')).toBeNull();
        });
    });

    describe('fail-open', () => {
        it('never throws (and logs a warning) when setting the outbound header fails', async () => {
            await runWithCookie(`dw_attribution=${ATTRIBUTION_VALUE}`);
            const onRequest = getRegisteredScapiMiddleware();

            const outbound = new Request(`${SHOPPER_ORDERS_BASE}/orders`, { method: 'POST' });
            vi.spyOn(outbound.headers, 'set').mockImplementation(() => {
                throw new Error('boom');
            });

            // Must not throw, and must still return the request so the SCAPI call proceeds.
            const result = await onRequest({ request: outbound } as never);
            expect(result).toBe(outbound);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'dw_attribution: skipping order-cookie forwarding due to error',
                expect.objectContaining({ error: expect.any(Error) })
            );
        });
    });
});
