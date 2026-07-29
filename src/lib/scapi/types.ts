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
import type { AppClients } from '@/scapi/custom-clients';
import type { OperationMethodsOnly } from '@/scapi';

/**
 * Single source of truth for which Clients namespaces are helpers.
 * Runtime allow-list that also drives the type-level allow-list below.
 * Prevents crafted URLs from accessing non-helper namespaces (e.g., shopperCustomers).
 *
 * To expose a new helper namespace via `useScapiFetcher('helpers', ...)`:
 *   1. Add the namespace to the `Clients` type in storefront-next-runtime/scapi
 *   2. Add it to this record — types and runtime validation update automatically
 *
 * `Pick<Clients, ...>` will error if a key here doesn't exist on `Clients`.
 */
export const HELPER_NAMESPACE_MAP = { auth: true, basket: true } as const;
export const HELPER_NAMESPACES = new Set(Object.keys(HELPER_NAMESPACE_MAP));

/**
 * Keys for helper namespaces (e.g., 'auth', 'basket'), derived from the runtime allow-list.
 */
export type HelperNamespaceKeyMap = keyof typeof HELPER_NAMESPACE_MAP;

/**
 * Helper namespaces available on the Clients object from `@salesforce/storefront-next-runtime/scapi`.
 * Unlike SCAPI proxy clients (e.g. `shopperProducts`, `shopperCustomers`), helper namespaces
 * expose domain-specific utility methods that aren't direct 1:1 SCAPI endpoint proxies.
 */
export type HelperNamespaces = Pick<AppClients, HelperNamespaceKeyMap>;

/**
 * Type representing Commerce SDK client names (camelCase)
 * These are the keys from the app's merged client map, including custom clients.
 */
export type CommerceSdkKeyMap = Exclude<keyof AppClients, 'use' | HelperNamespaceKeyMap>;

/**
 * Type helper to get the client type from a client name
 */
export type CommerceSdkCtorFromKey<C extends CommerceSdkKeyMap> = AppClients[C];

/**
 * Type representing valid operation method names for a Commerce SDK client.
 * This relies on OperationMethodsOnly (from storefront-next-runtime) to exclude
 * 'use' and 'eject' methods. The intersection with keyof CommerceSdkCtorFromKey<C>
 * is needed for type inference, but TypeScript's intersection of keyof types can
 * reintroduce excluded keys, so we explicitly exclude them again as a safeguard.
 * @template C - The Commerce SDK client key
 */
export type CommerceSdkMethodName<C extends CommerceSdkKeyMap> = Exclude<
    keyof OperationMethodsOnly<CommerceSdkCtorFromKey<C>> & string & keyof CommerceSdkCtorFromKey<C>,
    'use' | 'eject'
>;

/**
 * Type helper to extract the return type of a Commerce SDK method.
 * @template C - The Commerce SDK client key
 * @template M - The method name on the Commerce SDK client
 */
export type CommerceSdkMethodReturnType<C extends CommerceSdkKeyMap, M extends CommerceSdkMethodName<C>> = ReturnType<
    CommerceSdkCtorFromKey<C>[M] extends (...a: any[]) => any ? CommerceSdkCtorFromKey<C>[M] : never // oxlint-disable-line @typescript-eslint/no-explicit-any
>;

/**
 * Type helper to extract the parameters of a Commerce SDK method.
 * @template C - The Commerce SDK client key
 * @template M - The method name on the Commerce SDK client
 */
export type CommerceSdkMethodParameters<C extends CommerceSdkKeyMap, M extends CommerceSdkMethodName<C>> = Parameters<
    CommerceSdkCtorFromKey<C>[M] extends (...a: any[]) => any ? CommerceSdkCtorFromKey<C>[M] : never // oxlint-disable-line @typescript-eslint/no-explicit-any
>;

/**
 * Type representing valid callable method names for a helper namespace.
 * Filters to only include functions (excludes sub-namespaces which are objects).
 * @template H - The helper namespace key
 */
export type HelperMethodName<H extends HelperNamespaceKeyMap> = {
    [K in keyof AppClients[H]]: AppClients[H][K] extends (...args: any[]) => any ? K : never; // oxlint-disable-line @typescript-eslint/no-explicit-any
}[keyof AppClients[H]] &
    string;

/**
 * Type helper to extract the return type of a helper method.
 * @template H - The helper namespace key
 * @template M - The method name on the helper namespace
 */
export type HelperMethodReturnType<
    H extends HelperNamespaceKeyMap,
    M extends HelperMethodName<H>,
> = M extends keyof AppClients[H] ? (AppClients[H][M] extends (...args: any[]) => infer R ? R : never) : never; // oxlint-disable-line @typescript-eslint/no-explicit-any

/**
 * Type helper to extract the parameters of a helper method.
 * @template H - The helper namespace key
 * @template M - The method name on the helper namespace
 */
export type HelperMethodParameters<
    H extends HelperNamespaceKeyMap,
    M extends HelperMethodName<H>,
> = M extends keyof AppClients[H] ? (AppClients[H][M] extends (...args: infer P) => any ? P : never) : never; // oxlint-disable-line @typescript-eslint/no-explicit-any

/**
 * Structured response type for API operations
 * @template T - The type of data returned on success
 */
export interface ApiResponse<T = unknown> {
    /** Whether the operation was successful */
    success: boolean;
    /** Array of error messages if the operation failed */
    errors?: string[];
    /** Data returned on successful operation */
    data?: T;
}
