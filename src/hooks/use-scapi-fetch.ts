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
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
    CommerceSdkKeyMap,
    CommerceSdkMethodName,
    HelperNamespaceKeyMap,
    HelperMethodName,
    HelperMethodParameters,
    ApiResponse,
} from '@/lib/scapi/types';
import { encodeResource, RESOURCE_API_ROUTE } from '@/lib/scapi/resource-encoding';
import type {
    CommerceSdkMethodArgs,
    CommerceSdkMethodBody,
    CommerceSdkMethodPayload,
    HelperMethodArgs,
    HelperMethodBody,
    HelperMethodPayload,
} from '@/lib/scapi/method-types';

/**
 * Per-call submit overrides. Lets callers replace path/query params at the moment of submit
 * (e.g. for item-keyed deletes where the `itemId` is only known on click). The override is
 * shallow-merged with the hook's construction-time options before re-encoding the URL.
 */
type SubmitOverride = {
    params?: Record<string, unknown>;
};

export type ScapiFetch<TData = unknown, TBody = unknown> = {
    /**
     * Submit the configured SCAPI call. Always resolves; never rejects.
     * Network failures and HTTP non-2xx responses are coerced into
     * `{ success: false, errors: [...] }`.
     */
    submit: (payload?: TBody, override?: SubmitOverride) => Promise<ApiResponse<TData>>;
    /** True while a submit is in flight. Consumers gate UI off this. */
    isPending: boolean;
};

/**
 * Shared internals for `useScapiFetchClient` and `useScapiFetchHelper`. Public hooks
 * are thin wrappers — they only differ in how the resource URL is encoded. This
 * core handles options memoization, default-URL caching, and the submit fetch
 * lifecycle.
 *
 * `buildUrl` is expected to be stable across renders (callers wrap it in
 * `useCallback`). That stability lets the inner `useMemo`/`useCallback` deps stay
 * exhaustive without disable directives.
 */
function useScapiFetchCore<TData, TBody>(
    buildUrl: (opts: unknown) => string,
    options: unknown
): ScapiFetch<TData, TBody> {
    // Memoize options to avoid re-encoding on every render. `optionsString` is the
    // stable identity key — when it doesn't change, return the previous reference so
    // downstream `useMemo`/`useCallback` deps don't churn.
    const prevKeyRef = useRef<string>('');
    const prevOptionsRef = useRef<unknown>(options);
    const optionsString = JSON.stringify(options);
    const stableOptions = useMemo(() => {
        if (prevKeyRef.current !== optionsString) {
            prevKeyRef.current = optionsString;
            prevOptionsRef.current = options;
        }
        return prevOptionsRef.current;
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- `options` is intentionally excluded; `optionsString` is its stable identity key. Including the raw object would re-run the memo on every render (parent passes a new object literal each time).
    }, [optionsString]);

    // Default URL — captured once for the common (no-override) submit path.
    const defaultUrl = useMemo(() => buildUrl(stableOptions), [buildUrl, stableOptions]);
    const [isPending, setIsPending] = useState(false);

    const submit = useCallback(
        async (payload?: unknown, override?: SubmitOverride): Promise<ApiResponse<unknown>> => {
            // If the caller provided a per-call params override, re-encode the URL for this submit.
            // The override replaces the `params` key on the construction-time options shape
            // (`{ params: { path?, query? } }`) — this matches the SCAPI SDK call signature.
            const url = override?.params
                ? buildUrl({ ...((stableOptions as Record<string, unknown>) ?? {}), params: override.params })
                : defaultUrl;

            setIsPending(true);
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload ?? {}),
                });

                if (!response.ok) {
                    let body: { errors?: string[] } | null = null;
                    try {
                        body = (await response.json()) as { errors?: string[] };
                    } catch (parseError) {
                        // Non-JSON error body — surface it instead of silently dropping it,
                        // so "what went wrong?" is debuggable when SCAPI/an upstream proxy
                        // returns HTML or text on errors.
                        // oxlint-disable-next-line no-console
                        console.error('[useScapiFetch] non-JSON error response', {
                            status: response.status,
                            statusText: response.statusText,
                            url,
                            parseError,
                        });
                    }
                    return {
                        success: false,
                        errors: body?.errors ?? [response.statusText || `HTTP ${response.status}`],
                    };
                }

                return (await response.json()) as ApiResponse<unknown>;
            } catch (e) {
                return {
                    success: false,
                    errors: [e instanceof Error ? e.message : 'Network error'],
                };
            } finally {
                setIsPending(false);
            }
        },
        [buildUrl, defaultUrl, stableOptions]
    );

    return { submit, isPending } as ScapiFetch<TData, TBody>;
}

/**
 * Mutation hook for regular SCAPI client methods. Submits to the
 * `/resource/api/client/$resource` route via plain `fetch`, **without** triggering
 * React Router's loader revalidation.
 *
 * ## When to use this vs `useScapiFetcher`
 *
 * - `useScapiFetchClient` — **localized mutations** that affect a small UI element
 *   (wishlist toggle, rating, quantity stepper, inline favorite). The whole point
 *   is to *not* refetch unrelated loader data on every click. Use this by default
 *   for new mutations.
 * - `useScapiFetcher` — mutations that *should* invalidate page data via React
 *   Router's revalidation graph (e.g. an action that requires the route's loader
 *   to re-run so other components on the page see the new state).
 *
 * Both hooks target the same SCAPI route; the difference is the transport (`fetch`
 * vs `useFetcher`) and therefore the revalidation behavior.
 *
 * ## Behavior
 *
 * - Returns `{ submit, isPending }`. `submit` always resolves — network failures
 *   and HTTP non-2xx responses are coerced into `{ success: false, errors: [...] }`.
 * - The construction-time `options` are memoized; only re-encoded when their
 *   stringified shape changes. Override `params` per-call via `submit(payload,
 *   { params })` for item-keyed deletes where the id is only known on click.
 *
 * @example
 * ```ts
 * const fetch = useScapiFetchClient('shopperCustomers', 'createCustomerProductListItem', {
 *   params: { path: { customerId, listId } },
 *   body: { productId: '', quantity: 1, type: 'product', public: false, priority: 1 },
 * });
 * await fetch.submit({ productId, quantity: 1, type: 'product', public: false, priority: 1 });
 * ```
 */
export function useScapiFetchClient<
    C extends CommerceSdkKeyMap,
    M extends CommerceSdkMethodName<C>,
    P extends CommerceSdkMethodArgs<C, M> = CommerceSdkMethodArgs<C, M>,
    B extends CommerceSdkMethodBody<C, M> = CommerceSdkMethodBody<C, M>,
>(client: C, method: M, options: P): ScapiFetch<CommerceSdkMethodPayload<C, M>, B> {
    const buildUrl = useCallback(
        (opts: unknown): string => `${RESOURCE_API_ROUTE}/${encodeResource(client, method, opts)}`,
        [client, method]
    );
    return useScapiFetchCore<CommerceSdkMethodPayload<C, M>, B>(buildUrl, options);
}

/**
 * Mutation hook for SCAPI helper namespace methods (basket, auth, etc.). Same
 * transport semantics as {@link useScapiFetchClient} — plain `fetch`, no loader
 * revalidation. Use this for helper-namespace mutations that affect a localized
 * UI element rather than page-level state.
 *
 * @example
 * ```ts
 * const fetch = useScapiFetchHelper('basket', 'getOrCreateBasket', {
 *   body: { currency: 'USD' },
 * });
 * await fetch.submit({ currency: 'USD' });
 * ```
 */
export function useScapiFetchHelper<H extends HelperNamespaceKeyMap, M extends HelperMethodName<H>>(
    namespace: H,
    helperName: M,
    // Options is required when the helper method's first parameter is required,
    // and optional when the method accepts no args or has an optional parameter.
    ...args: [] extends HelperMethodParameters<H, M>
        ? [options?: HelperMethodArgs<H, M>]
        : [options: HelperMethodArgs<H, M>]
): ScapiFetch<HelperMethodPayload<H, M>, HelperMethodBody<H, M>> {
    const options = args[0] ?? {};
    const buildUrl = useCallback(
        (opts: unknown): string =>
            `${RESOURCE_API_ROUTE}/${encodeResource('helpers', namespace, {
                helperName,
                ...((opts as Record<string, unknown>) ?? {}),
            })}`,
        [namespace, helperName]
    );
    return useScapiFetchCore<HelperMethodPayload<H, M>, HelperMethodBody<H, M>>(buildUrl, options);
}
