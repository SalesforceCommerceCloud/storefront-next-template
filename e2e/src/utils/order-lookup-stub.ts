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
 * Per-scenario stub for Guest Order Lookup routes.
 * OTP codes are emailed server-side and cannot be received in E2E, so the
 * verify and results steps are exercised by faking BFF responses instead.
 * Server-side branching is covered by each route's own `*.test.ts`.
 */

import type { Route, Request } from 'playwright';

/** One of the GLO action routes this stub can fake a response for. */
export type OrderLookupActionName =
    | 'order-lookup-request-code'
    | 'order-lookup-verify'
    | 'order-lookup-cancel'
    | 'order-lookup-return';

/**
 * Install a Playwright route handler that fulfills a GLO action's single-fetch
 * `data()` response. `response` becomes the fetcher's `fetcher.data` on the client.
 */
export async function stubOrderLookupAction(
    actionName: OrderLookupActionName,
    response: unknown,
    status = 200
): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo(`stub ${actionName} response`, async ({ page }) => {
        await page.route(`**/action/${actionName}*`, async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status,
                headers: {
                    'content-type': 'text/x-script; charset=utf-8',
                    'x-remix-response': 'yes',
                },
                body: turboStreamEncode(response),
            });
        });
    });
}

/** Drop the stub so the real BFF action runs again. */
export async function clearOrderLookupActionStub(actionName: OrderLookupActionName): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo(`clear ${actionName} stub`, async ({ page }) => {
        await page.unroute(`**/action/${actionName}*`);
    });
}

/**
 * React Router v7 route IDs for the results page loader and the root route.
 * flatRoutes derives route IDs from the filename relative to `src/routes/`.
 */
const ROOT_ROUTE_ID = 'root';
const RESULTS_LOADER_ROUTE_ID = 'routes/_app.order-lookup.results.$orderNo';

/**
 * Stub the results page loader (GET `<url>.data` single-fetch request).
 *
 * The results page fetches its order data via the server-side loader, not a
 * client-side action fetch, so it can't be stubbed the same way actions are.
 * This function intercepts the React Router single-fetch GET request for the
 * results page and returns fake loader data so the server (and its cookie check)
 * is never reached.
 *
 * Loader data shape: `{ result, email, orderNumber }` where `result` is
 * `FetchGuestOrderResult | null` (see `_app.order-lookup.results.$orderNo.tsx`).
 *
 * Root data is included in the stub response because React Router's programmatic
 * navigate() triggers root revalidation (defaultShouldRevalidate=true when
 * actionStatus==null), causing root to appear in the `_routes` query parameter
 * alongside the results route. If a route appears in `_routes` but is absent from
 * the response, React Router throws `SingleFetchNoResultError`. We snapshot the
 * live root loader data from `window.__reactRouterDataRouter.state.loaderData`
 * (the client-side router state, set in React Router's dom-export) before
 * registering the stub so the App component continues to render correctly.
 */
export async function stubOrderLookupResultsLoader(
    loaderData: { result: unknown; email?: string; orderNumber?: string },
    status = 200
): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('stub order-lookup results loader', async ({ page }) => {
        // Snapshot the live root loader data from the React Router client-side router.
        // `window.__reactRouterDataRouter` is set by React Router's dom-export.mjs on
        // hydration and always reflects the current router state — unlike the SSR handoff
        // object (`window.__reactRouterContext`), which has no `state` property on the client.
        // We omit getI18next (function, not serializable; client uses i18nextOnClient instead)
        // and maintenance (may contain Promise members not safe to re-encode).
        const rootLoaderData: Record<string, unknown> = await page.evaluate((): Record<string, unknown> => {
            interface DataRouter {
                state: { loaderData: Record<string, Record<string, unknown>> };
            }
            const router = (window as Window & { __reactRouterDataRouter?: DataRouter }).__reactRouterDataRouter;
            const root = router?.state?.loaderData?.['root'];
            if (!root) return {};
            const result: Record<string, unknown> = { ...root };
            delete result['getI18next'];
            delete result['maintenance'];
            return result;
        });

        await page.route('**/order-lookup/results/**.data*', async (route: Route, request: Request) => {
            if (request.method() !== 'GET') {
                await route.continue();
                return;
            }
            // Single-fetch loader responses are keyed by route ID with a { data: loaderReturn }
            // wrapper per route. Both root and results must be present: root is listed in _routes
            // because isRevalidationRequired=true after the verify fetcher action.
            await route.fulfill({
                status,
                headers: {
                    'content-type': 'text/x-script; charset=utf-8',
                    'x-remix-response': 'yes',
                },
                body: turboStreamEncodeRaw({
                    [ROOT_ROUTE_ID]: { data: rootLoaderData },
                    [RESULTS_LOADER_ROUTE_ID]: { data: loaderData },
                }),
            });
        });
    });
}

/** Drop the results loader stub. */
export async function clearOrderLookupResultsLoaderStub(): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('clear order-lookup results loader stub', async ({ page }) => {
        await page.unroute('**/order-lookup/results/**.data*');
    });
}

/**
 * Minimal React Router single-fetch encoder for plain objects with primitive
 * leaves. Mirrors the upstream flatten/stringify walk so output is byte-for-byte
 * decodable by `decodeViaTurboStream`. Handles only the subset this stub needs
 * (same shape produced by `login-prefs-stub.ts`'s private encoder).
 */
function _encodeTurboStream(input: unknown): string {
    const slots: string[] = [];
    const indices = new Map<unknown, number>();

    function flatten(value: unknown): number {
        const existing = indices.get(value);
        if (existing !== undefined) return existing;
        const index = slots.length;
        indices.set(value, index);
        slots.push('');
        slots[index] = stringify(value);
        return index;
    }

    function stringify(value: unknown): string {
        if (value === null) return 'null';
        switch (typeof value) {
            case 'boolean':
            case 'number':
            case 'string':
                return JSON.stringify(value);
            case 'object': {
                if (Array.isArray(value)) {
                    return `[${value.map(flatten).join(',')}]`;
                }
                const obj = value as Record<string, unknown>;
                const parts = Object.keys(obj).map((k) => `"_${flatten(k)}":${flatten(obj[k])}`);
                return `{${parts.join(',')}}`;
            }
        }
        throw new Error(`turboStreamEncode: unsupported value of type ${typeof value}`);
    }

    flatten(input);
    return `[${slots.join(',')}]\n`;
}

/** Action stub encoder — wraps in `{ data: input }` as React Router action single-fetch expects. */
function turboStreamEncode(input: unknown): string {
    return _encodeTurboStream({ data: input });
}

/** Loader stub encoder — no outer wrapper; the route ID map IS the top-level value. */
function turboStreamEncodeRaw(input: unknown): string {
    return _encodeTurboStream(input);
}
