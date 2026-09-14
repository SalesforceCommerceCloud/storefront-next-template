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

import { decodeBase64Url } from '@/lib/url';
import { extractResponseError, getErrorMessage } from '@/lib/utils';
import { createApiClients } from '@/lib/api-clients.server';
import type { AppClients } from '@/scapi/custom-clients';
import { ApiError } from '@/scapi';
import {
    type ApiResponse,
    type CommerceSdkKeyMap,
    type CommerceSdkMethodName,
    type CommerceSdkMethodParameters,
    type CommerceSdkMethodReturnType,
} from '@/lib/scapi/types';
import { isResourceOperationAllowed, sanitizeResourceOptions } from '@/lib/scapi/resource-policy';

import type { Route } from './+types/resource.api.client.$resource';
import { getLogger } from '@/lib/logger.server';

// Selectively reloads registered `useScapiFetcher()` fetchers after a mutation, per the SCAPI revalidation policy,
// and opts the route's own fetchers out of React Router's blanket auto-revalidation.
export { shouldRevalidate } from '@/lib/revalidation/routes/api-client';

// Re-export the foundational SCAPI types for backward compatibility with any
// callers that still import from this route module. New code should import
// directly from `@/lib/scapi/types`.
export type {
    ApiResponse,
    CommerceSdkCtorFromKey,
    CommerceSdkKeyMap,
    CommerceSdkMethodName,
    CommerceSdkMethodParameters,
    CommerceSdkMethodReturnType,
} from '@/lib/scapi/types';

/** @deprecated Helper namespace operations are no longer supported by the SCAPI resource route. */
export type { HelperMethodName } from '@/lib/scapi/types';
/** @deprecated Helper namespace operations are no longer supported by the SCAPI resource route. */
export type { HelperMethodParameters } from '@/lib/scapi/types';
/** @deprecated Helper namespace operations are no longer supported by the SCAPI resource route. */
export type { HelperMethodReturnType } from '@/lib/scapi/types';
/** @deprecated Helper namespace operations are no longer supported by the SCAPI resource route. */
export type { HelperNamespaceKeyMap } from '@/lib/scapi/types';
/** @deprecated Helper namespace operations are no longer supported by the SCAPI resource route. */
export type { HelperNamespaces } from '@/lib/scapi/types';

// Default empty array string for resource parameter fallback
const DEFAULT_RESOURCE_ARRAY = '[]';

/**
 * Parses the resource parameter from the URL, handling null/undefined cases
 * @param resourceParam - The resource parameter from the URL params
 * @returns Parsed resource array [client, method, options] or throws TypeError if invalid
 */
function parseResourceParameter<T = [unknown, string, unknown[]]>(resourceParam: string | null | undefined): T {
    const resourceString = resourceParam ?? DEFAULT_RESOURCE_ARRAY;
    const resource =
        resourceString === DEFAULT_RESOURCE_ARRAY ? [] : (JSON.parse(decodeBase64Url(resourceString)) as unknown[]);

    if (!Array.isArray(resource) || resource.length !== 3) {
        throw new TypeError('Unexpected resource format');
    }

    return resource as T;
}

/**
 * A React Router server loader that's part of our Commerce SDK fetch API trinity. The trinity consists of this route's
 * loaders, the `scapi` service, and the `useScapiFetcher` hook. The purpose of these three entities is to simplify and
 * centralize the way to interact with the Commerce SDK methods right inside this loader function. This makes this
 * route virtually the heart of the Commerce SDK access/interaction.
 *
 * The loader expects a Commerce SDK client's name, a method name and method parameters to be passed as route
 * parameters. It then instantiates the targeted client, invokes the method and returns structured data.
 * If an error occurs, it returns an ApiResponse with success: false and error message.
 * @see {@link Route.LoaderArgs}
 * @see {@link import('@/hooks/use-scapi-fetcher.ts').useScapiFetcher}
 * @see {@link import('@/lib/api-clients.ts').createApiClients}
 */
export async function loader<
    R extends CommerceSdkMethodReturnType<C, M>,
    C extends CommerceSdkKeyMap,
    M extends CommerceSdkMethodName<C>,
    P extends CommerceSdkMethodParameters<C, M>,
>({ params, context }: Route.LoaderArgs): Promise<ApiResponse<Awaited<R>>> {
    const logger = getLogger(context);
    logger.debug('ApiClientResource: loader starting', { resource: params.resource });

    let resource: [C, M, P];
    try {
        resource = parseResourceParameter<[C, M, P]>(params.resource);
    } catch (error) {
        logger.warn('ApiClientResource: failed to parse resource parameter', { error });
        return {
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
    }

    try {
        const clientKey = resource[0] as keyof AppClients;
        const methodName = resource[1] as string;

        if (!isResourceOperationAllowed('loader', clientKey, methodName)) {
            throw new TypeError(`Method not found: "${String(resource[0])}.${methodName}"`);
        }

        const clients = createApiClients(context);
        const client = clients[clientKey] as Record<string, unknown>;
        if (!client || typeof client[methodName] !== 'function') {
            throw new TypeError(`Method not found: "${String(resource[0])}.${methodName}"`);
        }

        // Call the method - new API returns { data, response }
        const result = (await client[methodName](sanitizeResourceOptions(resource[2]))) as Record<string, unknown>;

        // Extract data from the new response format
        const data = result?.data as Awaited<R>;

        return {
            success: true,
            data,
        };
    } catch (reason) {
        logger.error('ApiClientResource: loader method call failed', {
            error: reason,
            client: resource[0],
            method: resource[1],
        });
        let errorMessage: string;
        // Use getErrorMessage for ApiError instances (new Commerce SDK format)
        if (reason instanceof ApiError) {
            errorMessage = getErrorMessage(reason);
        } else {
            // Fall back to extractResponseError for legacy ResponseError format
            try {
                const { responseMessage } = await extractResponseError(reason as Error);
                errorMessage = responseMessage || 'Unknown error';
            } catch {
                errorMessage = reason instanceof Error ? reason.message : 'Unknown error';
            }
        }
        return {
            success: false,
            errors: [errorMessage],
        };
    }
}

/**
 * A React Router server action that's part of our Commerce SDK fetch API trinity. The trinity consists of this route's
 * loaders/actions, the `fetch` service, and the `useScapiFetcher` hook. The purpose of these three entities is to simplify and
 * centralize the way to interact with the Commerce SDK methods right inside this action function. This makes this
 * route virtually the heart of the Commerce SDK access/interaction.
 *
 * The action expects a Commerce SDK client's name, a method name and method parameters to be passed as route
 * parameters. It then instantiates the targeted client, invokes the method and returns structured data.
 * If an error occurs, it returns an ApiResponse with success: false and error message.
 *
 * This action is specifically designed for non-GET requests (PUT, POST, DELETE, etc.) and uses the shared `act` function
 * to handle the actual Commerce SDK method invocation.
 * @see {@link Route.ActionArgs}
 * @see {@link import('@/hooks/use-scapi-fetcher.ts').useScapiFetcher}
 * @see {@link import('@/lib/api-clients.server').createApiClients}
 */
export async function action<
    R extends CommerceSdkMethodReturnType<C, M>,
    C extends CommerceSdkKeyMap,
    M extends CommerceSdkMethodName<C>,
    P extends CommerceSdkMethodParameters<C, M>,
>({ params, context, request }: Route.ActionArgs): Promise<ApiResponse<Awaited<R>>> {
    const logger = getLogger(context);
    logger.debug('ApiClientResource: action starting', { resource: params.resource });

    let resource: [C, M, P];
    try {
        resource = parseResourceParameter<[C, M, P]>(params.resource);
    } catch (error) {
        logger.warn('ApiClientResource: failed to parse resource parameter in action', { error });
        return {
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
    }

    try {
        // Body extraction is content-type aware so the same action serves both clients:
        //   - useScapiFetcher submits FormData (application/x-www-form-urlencoded / multipart)
        //   - useScapiFetchClient/useScapiFetchHelper submit JSON (application/json)
        // Match the bare MIME type (strip `; charset=utf-8`, etc.) so we don't accidentally
        // route `application/json-patch+json` or other variants through the JSON branch.
        const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
        let bodyData: Record<string, unknown>;

        if (mimeType === 'application/json') {
            // JSON path — body shape arrives as-is; no string→type coercion needed.
            try {
                bodyData = (await request.json()) as Record<string, unknown>;
            } catch {
                bodyData = {};
            }
        } else {
            // FormData path — pass values through as-is. Callers that need typed values
            // (numbers, booleans, null) should submit a plain-object payload; useScapiFetcher
            // auto-encodes plain objects as JSON so the request body is the source of truth
            // for shape. Adding per-field coercion here is a magic side-channel that doesn't
            // scale and would couple this generic resource route to specific SCAPI schemas.
            const formData = await request.formData();
            const formBody: Record<string, FormDataEntryValue> = {};
            for (const [key, value] of formData.entries()) {
                formBody[key] = value;
            }
            bodyData = formBody;
        }

        const clientKey = resource[0] as keyof AppClients;
        const methodName = resource[1] as string;

        if (!isResourceOperationAllowed('action', clientKey, methodName)) {
            throw new TypeError(`Method not found: "${String(resource[0])}.${methodName}"`);
        }

        const clients = createApiClients(context);
        const client = clients[clientKey] as Record<string, unknown>;
        if (!client || typeof client[methodName] !== 'function') {
            throw new TypeError(`Method not found: "${String(resource[0])}.${methodName}"`);
        }

        // Call the method - new API returns { data, response }
        const result = (await client[methodName]({
            ...sanitizeResourceOptions(resource[2]),
            body: bodyData,
        })) as Record<string, unknown>;

        // Extract data from the new response format
        const data = result?.data as Awaited<R>;

        return {
            success: true,
            data,
        };
    } catch (reason) {
        logger.error('ApiClientResource: action method call failed', {
            error: reason,
            client: resource[0],
            method: resource[1],
        });
        let errorMessage: string;
        // Use getErrorMessage for ApiError instances (new Commerce SDK format)
        if (reason instanceof ApiError) {
            errorMessage = getErrorMessage(reason);
        } else {
            // Fall back to extractResponseError for legacy ResponseError format
            try {
                const { responseMessage } = await extractResponseError(reason as Error);
                errorMessage = responseMessage || 'Unknown error';
            } catch {
                errorMessage = reason instanceof Error ? reason.message : 'Unknown error';
            }
        }
        return {
            success: false,
            errors: [errorMessage],
        };
    }
}
