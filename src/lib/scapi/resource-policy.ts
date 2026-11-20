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

type ResourceRequestKind = 'loader' | 'action';

type ResourceOperations = Readonly<Record<string, readonly string[]>>;

const LOADER_OPERATIONS: ResourceOperations = {
    shopperBasketsV2: ['getBasket'],
    shopperProducts: ['getProduct', 'getProducts'],
    shopperSearch: ['getSearchSuggestions'],
};
const ACTION_OPERATIONS: ResourceOperations = {
    shopperCustomers: [
        'createCustomerAddress',
        'updateCustomerAddress',
        'updateCustomer',
        'updateCustomerPassword',
        'removeCustomerAddress',
    ],
};

const SERVER_OWNED_PATH_PARAMETERS = new Set(['organizationId']);
const SERVER_OWNED_QUERY_PARAMETERS = new Set(['siteId', 'locale']);

export type SanitizedResourceOptions = {
    params?: {
        path?: Record<string, unknown>;
        query?: Record<string, unknown>;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function copyOperationParameters(value: unknown, serverOwnedKeys: ReadonlySet<string>): Record<string, unknown> {
    if (!isRecord(value)) {
        return {};
    }

    return Object.fromEntries(Object.entries(value).filter(([key]) => !serverOwnedKeys.has(key)));
}

/**
 * Returns whether a browser-facing resource request may invoke the selected SCAPI operation.
 * Loaders are intentionally read-only; mutations are intentionally action-only.
 */
function isOperationAllowed(operations: ResourceOperations, client: unknown, method: unknown): boolean {
    if (typeof client !== 'string' || typeof method !== 'string') {
        return false;
    }

    return operations[client]?.includes(method) ?? false;
}

/** Shared read policy; browser consumers do not need the action allowlist. */
export function isResourceLoaderAllowed(client: unknown, method: unknown): boolean {
    return isOperationAllowed(LOADER_OPERATIONS, client, method);
}

/** Returns whether the resource route may invoke the operation for this request kind. */
export function isResourceOperationAllowed(kind: ResourceRequestKind, client: unknown, method: unknown): boolean {
    return kind === 'loader'
        ? isResourceLoaderAllowed(client, method)
        : isOperationAllowed(ACTION_OPERATIONS, client, method);
}

/**
 * Constructs the complete caller-controlled portion of an SDK request from a narrow schema.
 * Transport options, headers, request bodies, and server-owned routing parameters are ignored.
 */
export function sanitizeResourceOptions(value: unknown): SanitizedResourceOptions {
    if (!isRecord(value) || !isRecord(value.params)) {
        return {};
    }

    const path = copyOperationParameters(value.params.path, SERVER_OWNED_PATH_PARAMETERS);
    const query = copyOperationParameters(value.params.query, SERVER_OWNED_QUERY_PARAMETERS);

    if (Object.keys(path).length === 0 && Object.keys(query).length === 0) {
        return {};
    }

    return {
        params: {
            ...(Object.keys(path).length > 0 ? { path } : {}),
            ...(Object.keys(query).length > 0 ? { query } : {}),
        },
    };
}
