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
 * Type utilities for the operation proxy client
 *
 * This file contains TypeScript type definitions that enable type-safe
 * operation method calls on the SCAPI clients.
 *
 * The proxy client transforms calls like:
 *   client.GET('/path', options)
 * Into:
 *   client.operationName(options)
 *
 * With full type safety for parameters and responses.
 */
import type { Client, FetchOptions, FetchResponse } from 'openapi-fetch';

/**
 * Helper to extract required keys from a type
 * Returns a union of all keys that are required (not optional)
 */
type RequiredKeysOf<T> = {
    [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Simplify a type by forcing TypeScript to evaluate and flatten it.
 * This improves IntelliSense display by showing the resolved type
 * instead of the type transformation (e.g., Omit<...> & Partial<...>).
 *
 * @example
 * // Without Simplify: Omit<{a: string; b: number}, "a"> & {c?: boolean}
 * // With Simplify: { b: number; c?: boolean }
 */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

// ============================================================================
// Custom Properties Type Transformation - Restrict [key: string] to [key: `c_${string}`]
// ============================================================================

/**
 * Extracts only the known (non-index) keys from a type.
 * Filters out string/number index signatures, keeping only literal property keys.
 *
 * Uses key remapping with a conditional that checks if the key K is a subtype of
 * a specific literal - index signatures like `string` or `number` fail this check
 * because `string extends 'test'` is false, while literal keys pass.
 *
 * @example
 * type TestType = { name: string; age: number } & { [key: string]: unknown };
 * type Keys = KnownKeys<TestType>; // 'name' | 'age'
 */
export type KnownKeys<T> = keyof {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/**
 * Transforms a type to replace [key: string]: unknown with [key: `c_${string}`]: unknown.
 * Only transforms at the TOP LEVEL - nested objects are not transformed.
 * Arrays are passed through unchanged.
 *
 * This ensures that only SCAPI custom properties (c_*) are allowed
 * as additional properties, while unknown properties cause TypeScript errors.
 *
 * @example
 * type Original = { name: string } & { [key: string]: unknown };
 * type Strict = WithStrictCustomProperties<Original>;
 * // { name: string } & { [key: `c_${string}`]: unknown }
 *
 * // ✅ Valid: { name: 'test', c_custom: 'value' }
 * // ❌ Error: { name: 'test', invalidProp: 'value' }
 */
export type WithStrictCustomProperties<T> = T extends object
    ? T extends readonly unknown[]
        ? T // Arrays pass through unchanged
        : { [K in KnownKeys<T>]: T[K] } & { [key: `c_${string}`]: unknown }
    : T;

// ============================================================================
// Global Request Parameter Types - Make organizationId and siteId optional
// ============================================================================

/**
 * Path parameter keys provided by global request parameters.
 * These become optional in the caller's type signature.
 */
type GlobalPathParamsKeys = 'organizationId';

/**
 * Query parameter keys provided by global request parameters.
 * These become optional in the caller's type signature.
 */
type GlobalQueryParamsKeys = 'siteId';

/**
 * Make global path parameters optional.
 * Preserves all other path parameters as-is.
 * Uses Simplify to flatten the type for better IntelliSense display.
 *
 * @example
 * type Before = { organizationId: string; id: string };
 * type After = OptionalizePathParams<Before>;
 * // { id: string; organizationId?: string }
 */
type OptionalizePathParams<P> = P extends object
    ? Simplify<Omit<P, GlobalPathParamsKeys> & Partial<Pick<P, GlobalPathParamsKeys & keyof P>>>
    : P;

/**
 * Make global query parameters optional.
 * Preserves all other query parameters as-is.
 * Uses Simplify to flatten the type for better IntelliSense display.
 *
 * @example
 * type Before = { siteId: string; expand?: string[] };
 * type After = OptionalizeQueryParams<Before>;
 * // { expand?: string[]; siteId?: string }
 */
type OptionalizeQueryParams<Q> = Q extends object
    ? Simplify<Omit<Q, GlobalQueryParamsKeys> & Partial<Pick<Q, GlobalQueryParamsKeys & keyof Q>>>
    : Q;

/**
 * Check if an object type has any required keys after removing global keys.
 * Returns true if there are remaining required keys, false otherwise.
 */
type HasRequiredKeysAfterGlobalParams<T, GlobalParamsKeys extends string> =
    Exclude<RequiredKeysOf<T>, GlobalParamsKeys> extends never ? false : true;

/**
 * Transform params to make global keys optional.
 * Also makes the entire path/query object optional if all its required keys are global.
 * Handles path-only, query-only, and combined path+query params.
 *
 * @example
 * type Before = { path: { organizationId: string; id: string }; query: { siteId: string } };
 * type After = TransformParams<Before>;
 * // { path: { id: string; organizationId?: string }; query?: { siteId?: string } }
 * // Note: query becomes optional because siteId was the only required key
 */
type TransformParams<Params> = Params extends { path: infer P; query: infer Q }
    ? (HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true
          ? { path: OptionalizePathParams<P> }
          : { path?: OptionalizePathParams<P> }) &
          (HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> extends true
              ? { query: OptionalizeQueryParams<Q> }
              : { query?: OptionalizeQueryParams<Q> }) &
          Omit<Params, 'path' | 'query'>
    : Params extends { path: infer P }
      ? (HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true
            ? { path: OptionalizePathParams<P> }
            : { path?: OptionalizePathParams<P> }) &
            Omit<Params, 'path'>
      : Params extends { query: infer Q }
        ? (HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> extends true
              ? { query: OptionalizeQueryParams<Q> }
              : { query?: OptionalizeQueryParams<Q> }) &
              Omit<Params, 'query'>
        : Params;

/**
 * Check if the transformed params have any remaining required fields.
 * This is used to determine if the entire options object can be optional.
 */
type HasRequiredTransformedParams<Params> = Params extends { path: infer P; query: infer Q }
    ? HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true
        ? true
        : HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys>
    : Params extends { path: infer P }
      ? HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys>
      : Params extends { query: infer Q }
        ? HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys>
        : false;

/**
 * Transform the body property to use strict c_* custom properties.
 * If body exists, apply WithStrictCustomProperties; otherwise pass through unchanged.
 */
type TransformBody<Opts> = Opts extends { body: infer B }
    ? Omit<Opts, 'body'> & { body: WithStrictCustomProperties<B> }
    : Opts extends { body?: infer B }
      ? Omit<Opts, 'body'> & { body?: WithStrictCustomProperties<B> }
      : Opts;

/**
 * Transform FetchOptions to:
 * 1. Make global params optional (organizationId in path, siteId in query)
 * 2. Apply strict c_* constraint to body (only allow c_* custom properties)
 *
 * The params object itself remains, but organizationId and siteId within become optional.
 * The body type is transformed to only allow known properties and c_* custom properties.
 */
type WithOptionalGlobalParams<OpDef> =
    FetchOptions<OpDef> extends infer Opts
        ? Opts extends { params: infer P }
            ? TransformBody<Omit<Opts, 'params'> & { params: TransformParams<P> }>
            : TransformBody<Opts>
        : never;

/**
 * Resolved version of FetchOptions with global params made optional.
 * This is the final type used for operation method signatures.
 *
 * Expands the type for better IntelliSense display while making
 * organizationId (in path) and siteId (in query) optional.
 */
type ResolvedGlobalParamsFetchOptions<OpDef> =
    WithOptionalGlobalParams<OpDef> extends infer Resolved
        ? {
              [K in keyof Resolved]: Resolved[K];
          }
        : never;

/**
 * Represents a single operation's metadata with base path optimization
 *
 * This format reduces bundle size by:
 * 1. Extracting common base paths into a shared constant
 * 2. Using abbreviated property names to minimize repeated keys
 *
 * Property abbreviations:
 * - m: HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
 * - b: Base path shared across operations
 * - s: Suffix path unique to this operation
 *
 * At runtime, the full path is reconstructed as `b + s`.
 *
 * @example
 * const BASE_PATH = '/organizations/{organizationId}/baskets' as const;
 * const op: OperationInfo = {
 *   m: 'GET',
 *   b: BASE_PATH,
 *   s: '/{basketId}'
 * };
 */
export interface OperationInfo {
    /** HTTP method (abbreviated: m = method) */
    m: string;
    /** Base path (abbreviated: b = base) */
    b: string;
    /** Suffix path (abbreviated: s = suffix) */
    s: string;
}

/**
 * A mapping of operation names to their metadata
 *
 * This is the shape of the generated operation map objects.
 *
 * @example
 * const BASE_PATH = '/organizations/{organizationId}/categories' as const;
 * const operations: OperationMap = {
 *   getCategories: { m: 'GET', b: BASE_PATH, s: '' },
 *   getCategory: { m: 'GET', b: BASE_PATH, s: '/{id}' }
 * };
 */
export type OperationMap = Record<string, OperationInfo>;

/**
 * Template literal type helper to reconstruct full path from base + suffix
 *
 * @typeParam Base - The base path string
 * @typeParam Suffix - The suffix path string
 * @returns The concatenated path as a literal type
 *
 * @example
 * type FullPath = ReconstructPath<'/api/v1/users', '/{id}'>; // '/api/v1/users/{id}'
 */
export type ReconstructPath<Base extends string, Suffix extends string> = `${Base}${Suffix}`;

/**
 * Extract the Paths type parameter from a Client
 *
 * @typeParam TClient - The openapi-fetch client type
 * @example
 * // Given: Client<paths, MediaType>
 * // Result: paths
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractPaths<TClient extends Client<any, any>> = TClient extends Client<infer P, any> ? P : never;

/**
 * Extract the Media type parameter from a Client
 *
 * @typeParam TClient - The openapi-fetch client type
 * @example
 * // Given: Client<paths, MediaType>
 * // Result: MediaType
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractMedia<TClient extends Client<any, any>> = TClient extends Client<any, infer M> ? M : never;

/**
 * Get the HTTP method key as lowercase
 * Converts 'GET' -> 'get', 'POST' -> 'post', etc.
 */
type LowercaseMethod<M extends string> = Lowercase<M>;

/**
 * Extract the full path from an operation
 *
 * Reconstructs the full path from `b + s` (base + suffix)
 *
 * @typeParam TOperation - The operation info
 * @returns The full path as a string literal type
 */
type ExtractOperationPath<TOperation> = TOperation extends { b: infer B; s: infer S }
    ? B extends string
        ? S extends string
            ? ReconstructPath<B, S> // Reconstruct from b (base) + s (suffix)
            : never
        : never
    : never;

/**
 * Extract success data type from operation definition
 * Gets the data type from 2xx responses
 */

type ExtractSuccessData<OpDef, Media extends `${string}/${string}`> =
    OpDef extends Record<string | number, unknown>
        ? FetchResponse<OpDef, FetchOptions<OpDef>, Media> extends { data?: infer D }
            ? D
            : never
        : never;

/**
 * Create a typed operation method by binding the path parameter
 *
 * This directly constructs the function signature using the operation's path and method.
 * The function signature is built from the OpenAPI operation definition to provide
 * full type safety for parameters and responses.
 *
 * Each operation method accepts a FetchOptions object with these properties:
 * - params: { query?, header?, path?, cookie? } - API parameters from OpenAPI spec
 * - headers?: HeadersOptions - Custom HTTP headers (e.g., Authorization, Content-Type)
 * - parseAs?: "json" | "text" | "blob" | "arrayBuffer" | "stream" - Response parsing
 * - baseUrl?: string - Override the base URL for this request
 * - querySerializer?: QuerySerializer | QuerySerializerOptions - Custom query serialization
 * - bodySerializer?: BodySerializer - Custom body serialization
 * - fetch?: typeof fetch - Custom fetch implementation
 * - middleware?: Middleware[] - Request/response middleware
 *
 * Returns a Promise with { data, response } on success.
 * Throws ApiError on non-2xx responses with typed error body from OpenAPI spec.
 *
 * @typeParam TClient - The openapi-fetch client type (Client<Paths, Media>)
 * @typeParam TOperation - The operation info with abbreviated keys (m, b, s)
 *
 * @example
 * // Given operation { m: 'GET', b: BASE_PATH, s: '/users' }
 * // Original: client.GET('/users', options) => Promise<{ data?, error?, response }>
 * // Result:   client.getUsers(options) => Promise<{ data, response }>
 * // Where options, data, and thrown errors are fully typed based on the OpenAPI spec
 */
type OperationMethod<
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    TClient extends Client<any, any>,
    TOperation extends OperationInfo,
> =
    ExtractOperationPath<TOperation> extends infer Path
        ? Path extends keyof ExtractPaths<TClient>
            ? LowercaseMethod<TOperation['m']> extends infer Method
                ? Method extends keyof ExtractPaths<TClient>[Path]
                    ? ExtractPaths<TClient>[Path][Method] extends infer OpDef
                        ? // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                          OpDef extends Record<string | number, any>
                            ? // With global params, organizationId and siteId are auto-provided.
                              // Options are optional if there are no OTHER required fields.
                              FetchOptions<OpDef> extends { params: infer P }
                                ? HasRequiredTransformedParams<P> extends true
                                    ? // Other required params exist (e.g., productId) - options required
                                      (options: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
                                          data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
                                          response: Response;
                                      }>
                                    : // Only global params were required - options now optional
                                      (options?: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
                                          data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
                                          response: Response;
                                      }>
                                : // No params at all - options optional
                                  (options?: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
                                      data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
                                      response: Response;
                                  }>
                            : never
                        : never
                    : never
                : never
            : never
        : never;

/**
 * Build the proxy client interface with ONLY operation methods
 *
 * This type creates a clean API that only exposes:
 * 1. Operation methods (getCategories, createBasket, etc.) with full type safety
 * 2. Middleware methods (use, eject) from the original client
 *
 * HTTP method syntax (GET, POST, etc.) is NOT included - operation methods only!
 *
 * Each operation method has correct parameter and return types inferred
 * from the underlying client HTTP method, with the path parameter already bound.
 *
 * @typeParam TClient - The openapi-fetch Client type (Client<Paths, Media>)
 * @typeParam TOperations - The operation map with operation names as keys
 *
 * @example
 * type MyClient = ProxyClient<
 *   Client<paths>,
 *   typeof operations
 * >;
 *
 * // MyClient exposes:
 * // - client.getCategories(options) => Promise<Response>
 * // - client.use(middleware) => void
 * // With full type inference for options and Response!
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type ProxyClient<TClient extends Client<any, any>, TOperations extends OperationMap> = {
    [K in keyof TOperations]: OperationMethod<TClient, TOperations[K]>;
} & Pick<TClient, 'use' | 'eject'>;

/**
 * Utility type that extracts only operation methods from a ProxyClient,
 * excluding middleware methods (use, eject).
 *
 * This is useful for type constraints where you want to ensure only
 * actual API operation methods are allowed, not middleware methods.
 *
 * Uses a distributive conditional type to work correctly with union types.
 *
 * @typeParam T - A ProxyClient type (or union of ProxyClient types)
 * @returns The ProxyClient type(s) with middleware methods excluded
 *
 * @example
 * type MyClient = ProxyClient<Client<paths>, typeof operations>;
 * type OperationsOnly = OperationMethodsOnly<MyClient>;
 * // OperationsOnly has getCategories, createBasket, etc., but NOT use or eject
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type OperationMethodsOnly<T> = T extends ProxyClient<any, any> ? Omit<T, 'use' | 'eject'> : never;

/**
 * Utility type to extract the Paths type from a Client
 *
 * @example
 * type MyPaths = ClientPaths<Client<paths>>; // paths
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type ClientPaths<TClient extends Client<any, any>> = TClient extends Client<infer P, any> ? P : never;

/**
 * Type guard to check if a property name is an operation method
 *
 * Used at runtime to determine if a property access should be
 * intercepted by the proxy.
 *
 * @param operations - The operation map
 * @param prop - The property being accessed
 * @returns True if prop is an operation name
 */
export function isOperationMethod<T extends OperationMap>(operations: T, prop: string | symbol): boolean {
    return typeof prop === 'string' && prop in operations;
}

/**
 * Utility type for extending the base client types with custom API clients.
 *
 * Used by template projects to extend the base `Clients` type with
 * custom API clients, adding new client entries to the type.
 *
 * @typeParam TBase - The base Clients type from the SDK
 * @typeParam TCustom - Object type with custom client entries
 *
 * @example
 * ```typescript
 * type AppClients = MergeClients<Clients, {
 *     loyalty: ProxyClient<Client<LoyaltyPaths>, typeof loyaltyOps>;
 *     storeInventory: ProxyClient<Client<InventoryPaths>, typeof inventoryOps>;
 * }>;
 * ```
 */
export type MergeClients<TBase, TCustom extends Record<string, unknown>> = Omit<TBase, keyof TCustom> & TCustom;
