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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type FetcherSubmitOptions, type FetcherWithComponents, type SubmitTarget, useFetcher } from 'react-router';
import { createFetcherRegistration } from '@/lib/scapi/fetcher-registry';
import type {
    ApiResponse,
    CommerceSdkKeyMap,
    CommerceSdkMethodName,
    HelperMethodName,
    HelperMethodParameters,
    HelperNamespaceKeyMap,
} from '@/lib/scapi/types';
import { encodeResource, RESOURCE_API_ROUTE } from '@/lib/scapi/resource-encoding';
import type {
    CommerceSdkMethodArgs,
    CommerceSdkMethodBody,
    CommerceSdkMethodPayload,
    HelperMethodArgs,
    HelperMethodBody,
    HelperMethodPayload,
    UnwrapApiResponse,
} from '@/lib/scapi/method-types';

/**
 * Custom fetcher interface for Commerce SDK operations.
 * Built from React Router's FetcherWithComponents but with simplified load and submit methods.
 * Now works with structured ApiResponse format instead of throwing errors.
 */
export type ScapiFetcher<TData = unknown, TSubmitPayload = unknown> = Omit<
    FetcherWithComponents<TData>,
    'load' | 'submit' | 'data'
> & {
    /** Load data using the configured Commerce SDK client and method (no URL needed) */
    load: () => Promise<void>;
    /**
     * Submit data using the configured Commerce SDK client and method.
     * Payload is the method body shape (JSON-serializable); it will be wrapped in FormData.
     */
    submit: (payload?: TSubmitPayload, opts?: Omit<FetcherSubmitOptions, 'action' | 'method'>) => Promise<void>;
    /** Convenience property to access the actual data when success is true */
    data: UnwrapApiResponse<TData> | undefined;
    /** Convenience property to access error messages when success is false */
    errors: string[] | undefined;
    /** Convenience property to check if the operation was successful */
    success: boolean;
};

/**
 * A React hook that's part of our Commerce SDK fetch API trinity. The trinity consists of this hook, the `fetch`
 * service, and finally the route (and its loaders/actions) for processing requests from the first two. The purpose of these
 * three entities is to simplify and centralize the way to interact with the Commerce SDK methods inside the mentioned
 * route.
 *
 * Under the hood, this hook uses React Router's `useFetcher` hook to perform the actual requests. By doing so we're
 * able to synchronize our hook with React Router's lifecycle and error handling. The response data is available
 * in the `data` property of the returned fetcher object. If the caller is interested in the request's state,
 * it can access the `state` property of the hook.
 *
 * The hook exclusively interacts with the route `${RESOURCE_API_ROUTE}/{resource}` and its related loader and action functions.
 * It expects a Commerce SDK client's name, a method name and method parameters to be passed as parameters.
 *
 * The hook provides two main methods:
 * - `load()`: For GET requests using loader/clientLoader functions
 * - `submit()`: For non-GET requests (PUT, POST, DELETE, etc.) using action/clientAction functions
 *
 * Additionally, the hook supports optional callbacks for handling success and error states:
 * - `onSuccess`: Called when a request completes successfully
 * - `onError`: Called when a request fails
 *
 * Tracking upstream: {@link https://github.com/remix-run/react-router/issues/14207} — manual reset/abort for fetchers.
 * @see {@link import('react-router').useFetcher}
 * @see {@link import('@/routes/resource.api.client.$resource.ts').loader}
 * @see {@link import('@/routes/resource.api.client.$resource.ts').clientLoader}
 * @see {@link import('@/routes/resource.api.client.$resource.ts').action}
 * @see {@link import('@/routes/resource.api.client.$resource.ts').clientAction}
 * @see {@link import('@/lib/api-clients.ts').createApiClients}
 * @example
 * import { useEffect } from 'react';
 * import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
 *
 * export default function MyComponent() {
 *   const config = useConfig();
 *   const fetcher = useScapiFetcher('shopperProducts', 'getCategory', {
 *     params: {
 *       query: { id: 'test', levels: 2 }
 *     }
 *   });
 *
 *   useEffect(() => {
 *     fetcher.load().then(() => {
 *       // Request completed, data available in fetcher.data
 *     });
 *   }, [fetcher]);
 *
 *   // Access data from fetcher.data
 *   const data = fetcher.data;
 * }
 *
 * @example
 * import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
 *
 * export default function MyComponent() {
 *   const fetcher = useScapiFetcher('shopperCustomers', 'updateCustomer', {
 *     params: {
 *       path: { customerId: 'customer-123' }
 *     },
 *     body: {}
 *   });
 *
 *   const handleUpdate = (formData) => {
 *     fetcher.submit(formData, { method: 'POST' }).then(() => {
 *       // Request completed, data available in fetcher.data
 *     });
 *   };
 * }
 */
/**
 * Overload for calling helper namespace methods.
 * Helpers are domain-specific utility methods (e.g., basket, auth) that are not direct SCAPI proxy operations.
 *
 * @deprecated Helper namespace operations are no longer supported by the SCAPI resource route.
 *
 * @example
 * ```typescript
 * const fetcher = useScapiFetcher('helpers', 'basket', 'getOrCreateBasket', {
 *   params: { path: { basketId: 'basket-123' } },
 *   body: { currency: 'USD' }
 * });
 * ```
 */
export function useScapiFetcher<H extends HelperNamespaceKeyMap, M extends HelperMethodName<H>>(
    type: 'helpers',
    namespace: H,
    method: M,
    // Options is required when the helper method's first parameter is required,
    // and optional when the method accepts no args or has an optional parameter.
    ...args: [] extends HelperMethodParameters<H, M>
        ? [options?: HelperMethodArgs<H, M>]
        : [options: HelperMethodArgs<H, M>]
): ScapiFetcher<HelperMethodPayload<H, M>, HelperMethodBody<H, M>>;

/**
 * Overload for calling regular Commerce SDK client methods.
 *
 * @example
 * ```typescript
 * const fetcher = useScapiFetcher('shopperProducts', 'getCategory', {
 *   params: { query: { id: 'test', levels: 2 } }
 * });
 * ```
 */
export function useScapiFetcher<
    C extends CommerceSdkKeyMap,
    M extends CommerceSdkMethodName<C>,
    P extends CommerceSdkMethodArgs<C, M> = CommerceSdkMethodArgs<C, M>,
    B extends CommerceSdkMethodBody<C, M> = CommerceSdkMethodBody<C, M>,
>(client: C, method: M, options: P): ScapiFetcher<CommerceSdkMethodPayload<C, M>, B>;

export function useScapiFetcher(
    clientOrHelpers: string,
    methodOrNamespace: string,
    optionsOrMethod?: unknown,
    helperOptions?: unknown
): ScapiFetcher<unknown, unknown> {
    const isHelper = clientOrHelpers === 'helpers';
    const options = isHelper ? (helperOptions ?? {}) : optionsOrMethod;

    // Memoize the method parameters to prevent creating new fetchers on every render
    // We use refs to track the previous options string and params for deep comparison
    const prevOptionsStringRef = useRef<string>('');
    const prevMethodParamsRef = useRef(options);
    const currentOptionsRef = useRef(options);

    // Update the current options ref on every render
    currentOptionsRef.current = options;
    const optionsString = JSON.stringify(options);

    // Only update methodParams when the stringified options actually change
    const methodParams = useMemo(() => {
        if (prevOptionsStringRef.current !== optionsString) {
            prevOptionsStringRef.current = optionsString;
            prevMethodParamsRef.current = currentOptionsRef.current;
        }
        return prevMethodParamsRef.current;
    }, [optionsString]);

    // Build the resource encoding via shared util.
    const resource = isHelper
        ? encodeResource('helpers', methodOrNamespace, {
              helperName: optionsOrMethod as string,
              ...(methodParams as Record<string, unknown>),
          })
        : encodeResource(clientOrHelpers, methodOrNamespace, methodParams);

    const fetcher = useFetcher<ApiResponse<unknown>>({ key: resource });

    // Fetcher registration
    const registration = useMemo(() => createFetcherRegistration(resource), [resource]);
    useEffect(() => registration.unregister, [registration]);

    /**
     * Load method for handling GET requests using loader/clientLoader functions.
     * This method invokes the fetcher's load method which triggers the loader/clientLoader functions on the server.
     * The response data will be available in fetcher.data once the request completes.
     *
     * @returns Promise that resolves when the request completes
     */
    const load = useCallback((): Promise<void> => {
        // Register this fetcher's `load` under its resource key so the resource route's own `shouldRevalidate` can
        // selectively reload it after a mutation. This is the only place where the fetcher's identity (`resource`) and its
        // `load` are both in scope. That `shouldRevalidate` is consulted without the evaluated fetcher's identity, so it
        // resolves each candidate through this registry instead.
        const href = `${RESOURCE_API_ROUTE}/${resource}`;
        registration.register(fetcher.load, href);

        // Invoke fetcher load method for loaders with the resource URL
        return fetcher.load(href);
    }, [registration, fetcher, resource]);

    /**
     * Submit method for handling non-GET requests (PUT, POST, DELETE, etc.) using action/clientAction functions.
     * This method invokes the fetcher's submit method which triggers the action/clientAction functions on the server.
     * The response data will be available in fetcher.data once the request completes.
     *
     * Encoding is auto-picked from the payload shape so callers don't have to specify it:
     * plain-object payloads are submitted as `application/json` (so numbers/booleans/null
     * survive intact end-to-end); `FormData` / `HTMLFormElement` / `URLSearchParams` payloads
     * use the default `application/x-www-form-urlencoded` / `multipart/form-data`. Pass an
     * explicit `encType` in `opts` to override.
     *
     * @param target - The data to submit (plain object, FormData, or HTMLFormElement). If not provided, an empty object is used.
     * @param opts - Optional configuration
     * @returns Promise that resolves when the request completes
     */
    const submit = useCallback(
        (payload?: unknown, _opts?: Omit<FetcherSubmitOptions, 'action' | 'method'>): Promise<void> => {
            // Default to JSON encoding for plain-object payloads so typed values (numbers,
            // booleans, null) survive the round-trip without string→type coercion in the
            // server action. FormData / HTMLFormElement / URLSearchParams payloads keep
            // their native encoding (form-urlencoded). Callers can still override via
            // `_opts.encType`.
            const isFormPayload =
                (typeof FormData !== 'undefined' && payload instanceof FormData) ||
                (typeof HTMLFormElement !== 'undefined' && payload instanceof HTMLFormElement) ||
                (typeof URLSearchParams !== 'undefined' && payload instanceof URLSearchParams);
            const encType = _opts?.encType ?? (isFormPayload ? undefined : 'application/json');

            const target = (payload ?? {}) as SubmitTarget;
            const submitOptions: FetcherSubmitOptions = {
                ..._opts,
                method: 'POST',
                action: `${RESOURCE_API_ROUTE}/${resource}`,
                ...(encType ? { encType } : {}),
            };
            return fetcher.submit(target, submitOptions);
        },
        [fetcher, resource]
    );

    return {
        ...fetcher,
        load,
        submit,
        // Convenience properties for easier access to structured response
        get data() {
            return fetcher.data?.data;
        },
        get errors() {
            return fetcher.data?.errors;
        },
        get success() {
            return fetcher.data?.success ?? false;
        },
    };
}
