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
 * Proxy client factory for operation-based API calls
 *
 * This module creates a proxied version of an openapi-fetch client that
 * allows calling operations by their operation name instead of using
 * HTTP methods and path strings.
 *
 * Example transformation:
 *   Before: client.GET('/organizations/{organizationId}/categories', options)
 *   After:  client.getCategories(options)
 *
 * The proxy maintains full type safety and has minimal runtime overhead.
 */
import type { Client } from 'openapi-fetch';
import type { OperationMap, ProxyClient } from './proxy-types';
import { ApiError, type ErrorDetail } from './ApiError';
import { AuthTokenInvalidError } from './AuthTokenInvalidError';
import { SLAS_AUTH_ENDPOINTS } from './constants';

/**
 * Optional hooks for client behavior.
 */
export interface CreateClientOptions {
    /** Callback invoked when an auth token is deemed invalid */
    onAuthTokenInvalid?: (response: Response) => void;
}

/**
 * Global request parameters that are automatically merged into every API call.
 *
 * When provided to createClient, these values will be merged into every
 * operation call, eliminating the need to pass them manually each time.
 */
export interface GlobalRequestParameters {
    /** Organization ID to merge into path parameters */
    organizationId: string;
    /** Site ID to merge into query parameters */
    siteId: string;
    /** Locale to merge into query parameters (optional) */
    locale?: string;
}

/**
 * Build request options by applying global request parameters as defaults.
 *
 * This function specifically places:
 * - organizationId into params.path
 * - siteId and locale into params.query
 *
 * Caller-provided values take precedence over global defaults, allowing
 * overrides when needed while reducing boilerplate for the common case.
 *
 * @param options - The options provided by the caller (may be undefined)
 * @param globalParams - The global request parameters containing organizationId, siteId, and locale
 * @returns Options with global values applied as defaults
 */
function buildRequestOptions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    globalParams?: GlobalRequestParameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    if (!globalParams) return options;

    return {
        ...options,
        params: {
            ...options?.params,
            path: {
                organizationId: globalParams.organizationId, // Global default
                ...options?.params?.path, // Caller-provided overrides
            },
            query: {
                siteId: globalParams.siteId, // Global default
                ...(globalParams.locale ? { locale: globalParams.locale } : {}), // Global default (if provided)
                ...options?.params?.query, // Caller-provided overrides
            },
        },
    };
}

// `/oauth2/webauthn/passkey/*` is Bearer-authenticated (unlike register/authenticate, which use
// Basic auth), so a 401 there is a real expired/invalid token that must go through the normal
// refresh flow. It's excluded here even though it matches the broader SLAS_AUTH_ENDPOINTS entry
// used elsewhere to skip Bearer auto-injection.
const isSlasAuthResponse = (pathname: string): boolean =>
    !pathname.includes('/oauth2/webauthn/passkey') && SLAS_AUTH_ENDPOINTS.some((path) => pathname.includes(path));

const isTokenInvalidExemptResponse = (url: string): boolean => {
    try {
        return isSlasAuthResponse(new URL(url).pathname);
    } catch {
        return isSlasAuthResponse(url);
    }
};

const isOtpEndpoint = (url: string): boolean => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.includes('/oauth2/otp/');
    } catch {
        return url.includes('/oauth2/otp/');
    }
};

/**
 * Create a proxied client with operation methods
 *
 * This function wraps an openapi-fetch client with a JavaScript Proxy that
 * intercepts property access. When an operation method is called, it:
 *
 * 1. Looks up the operation in the operation map
 * 2. Extracts the HTTP method (m) and path (b + s)
 * 3. Reconstructs the full path from base + suffix
 * 4. Calls the appropriate client method with the path and options
 *
 * Operation format uses abbreviated keys for bundle size optimization:
 * - m: HTTP method (GET, POST, etc.)
 * - b: Base path shared across operations
 * - s: Suffix path unique to this operation
 *
 * All other property accesses (like .use(), .eject(), etc.) are passed
 * through to the original client unchanged.
 *
 * @typeParam TClient - The openapi-fetch Client type
 * @typeParam TOperations - The operation map type
 *
 * @param client - The base openapi-fetch client instance
 * @param operations - The operation map object (generated at build time)
 * @param globalParams - Optional global request parameters to merge into every call (organizationId, siteId)
 * @returns A proxied client with operation methods
 *
 * @example
 * ```typescript
 * import createClient from 'openapi-fetch';
 * import { operations } from './generated/shopper-products-v1.operations';
 * import type { paths } from './generated/shopper-products-v1';
 *
 * const baseClient = createClient<paths>({ baseUrl: 'https://api.example.com' });
 *
 * // Without global params - caller must provide organizationId and siteId
 * const client = createClient(baseClient, operations);
 *
 * // With global params - organizationId and siteId are automatically merged
 * const clientWithGlobalParams = createClient(baseClient, operations, {
 *   organizationId: 'f_ecom_xxx',
 *   siteId: 'RefArch'
 * });
 *
 * // Now you can call operations without passing organizationId/siteId:
 * const response = await clientWithGlobalParams.getCategories({
 *   params: {
 *     query: { ids: ['root'] }
 *   }
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient<TClient extends Client<any, any>, TOperations extends OperationMap>(
    client: TClient,
    operations: TOperations,
    globalParams?: GlobalRequestParameters,
    options?: CreateClientOptions
): ProxyClient<TClient, TOperations> {
    // Create and return the proxy
    return new Proxy(client, {
        /**
         * Proxy get trap - intercepts property access
         *
         * When a property is accessed on the proxy client:
         * 1. Check if it's an operation method name
         * 2. If yes, return a function that calls the appropriate HTTP method
         * 3. If no, return the original client property
         *
         * @param target - The original client instance
         * @param prop - The property being accessed
         * @returns The property value or operation method function
         */
        get(target, prop) {
            // Check if this is an operation method
            if (typeof prop === 'string' && prop in operations) {
                const operationInfo = operations[prop];

                // Extract operation info with abbreviated keys
                // m: HTTP method, b: base path, s: suffix path
                const { m: method, b: base, s: suffix } = operationInfo;

                // Reconstruct the full path from base + suffix
                const path = base + suffix;

                // Return an async function that calls the HTTP method and handles errors
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return async function (this: any, callOptions?: any) {
                    // Get the HTTP method function (GET, POST, etc.)
                    const httpMethod = method.toUpperCase();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const clientMethod = (target as any)[httpMethod];

                    if (typeof clientMethod !== 'function') {
                        throw new Error(
                            `Client method ${httpMethod} not found. This is likely a bug in the proxy client.`
                        );
                    }

                    // Build request options with global params (organizationId, siteId) applied as defaults
                    const mergedOptions = buildRequestOptions(callOptions, globalParams);

                    // Call the HTTP method with the path and merged options
                    // The path is bound, options are passed from the operation call
                    // openapi-fetch returns { data, error, response }
                    // Only pass options if they're defined (maintains backward compatibility)
                    const result =
                        mergedOptions !== undefined
                            ? await clientMethod.call(target, path, mergedOptions)
                            : await clientMethod.call(target, path);

                    // If there's an error, throw ApiError with the parsed error from openapi-fetch
                    if (result.error !== undefined) {
                        const response = result.response;

                        // OTP and WebAuthn register/authenticate endpoints return 401 for invalid
                        // OTP/credential, not invalid tokens. Don't treat those 401s as auth token
                        // invalidation.
                        if (
                            response.status === 401 &&
                            !isTokenInvalidExemptResponse(response.url) &&
                            !isOtpEndpoint(response.url)
                        ) {
                            options?.onAuthTokenInvalid?.(response);
                            throw new AuthTokenInvalidError();
                        }

                        // openapi-fetch has already parsed the response body into result.error
                        // Don't try to clone/read the response again as the body is already consumed
                        const parsedError = result.error;

                        // Convert to ErrorDetail structure
                        let body: ErrorDetail;
                        if (
                            parsedError &&
                            typeof parsedError === 'object' &&
                            'type' in parsedError &&
                            'title' in parsedError &&
                            'detail' in parsedError
                        ) {
                            // Valid ErrorDetail response - use it directly
                            body = parsedError as ErrorDetail;
                        } else {
                            // Non-ErrorDetail response (string, HTML, or other format)
                            // Create a generic ErrorDetail with helpful defaults
                            body = {
                                type: 'Unknown Error',
                                title: response.statusText || 'API Error',
                                detail: `The API returned a ${response.status} error. See rawBody for details.`,
                            };
                        }

                        // Try to stringify the error for rawBody
                        let rawBody: string;
                        try {
                            rawBody = typeof parsedError === 'string' ? parsedError : JSON.stringify(parsedError);
                        } catch {
                            rawBody = String(parsedError);
                        }

                        // Throw a typed ApiError with all response details
                        throw new ApiError({
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                            body,
                            rawBody,
                            url: response.url,
                            method: httpMethod,
                        });
                    }

                    // On success, return { data, response } without the error property
                    return {
                        data: result.data,
                        response: result.response,
                    };
                };
            }

            // Only pass through middleware methods (use, eject)
            // All other properties (GET, POST, etc.) are intentionally hidden
            if (prop === 'use' || prop === 'eject') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const value = (target as any)[prop];
                if (typeof value === 'function') {
                    return value.bind(target);
                }
                return value;
            }

            // Undefined for any other property access
            return undefined;
        },
    }) as ProxyClient<TClient, TOperations>;
}
