import { _ as ShopperProducts, a as ShopperBasketsV1, b as ShopperSeo, c as ShopperConsents, d as ShopperDeliveryEstimates, f as ShopperExperience, g as ShopperPayments, h as ShopperOrders, i as ShopperAvailability, l as ShopperContext, m as ShopperLogin, n as hasInventoryStock, o as ShopperBasketsV2, p as ShopperGiftCertificates, r as hasUsableInventoryStock, s as ShopperConfigurations, t as InventoryRecord, u as ShopperCustomers, v as ShopperPromotions, x as ShopperStores, y as ShopperSearch } from "./inventory-stock.js";
import createOpenApiFetchClient, { Client, ClientOptions, FetchOptions, FetchResponse, Middleware } from "openapi-fetch";
export * from "openapi-fetch";

//#region src/scapi-client/proxy-types.d.ts

/**
 * Helper to extract required keys from a type
 * Returns a union of all keys that are required (not optional)
 */
type RequiredKeysOf<T> = { [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K }[keyof T];
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
type KnownKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };
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
type WithStrictCustomProperties<T> = T extends object ? T extends readonly unknown[] ? T : { [K in KnownKeys<T>]: T[K] } & {
  [key: `c_${string}`]: unknown;
} : T;
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
type OptionalizePathParams<P$1> = P$1 extends object ? Simplify<Omit<P$1, GlobalPathParamsKeys> & Partial<Pick<P$1, GlobalPathParamsKeys & keyof P$1>>> : P$1;
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
type OptionalizeQueryParams<Q$1> = Q$1 extends object ? Simplify<Omit<Q$1, GlobalQueryParamsKeys> & Partial<Pick<Q$1, GlobalQueryParamsKeys & keyof Q$1>>> : Q$1;
/**
 * Check if an object type has any required keys after removing global keys.
 * Returns true if there are remaining required keys, false otherwise.
 */
type HasRequiredKeysAfterGlobalParams<T, GlobalParamsKeys extends string> = Exclude<RequiredKeysOf<T>, GlobalParamsKeys> extends never ? false : true;
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
type TransformParams<Params> = Params extends {
  path: infer P;
  query: infer Q;
} ? (HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true ? {
  path: OptionalizePathParams<P>;
} : {
  path?: OptionalizePathParams<P>;
}) & (HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> extends true ? {
  query: OptionalizeQueryParams<Q>;
} : {
  query?: OptionalizeQueryParams<Q>;
}) & Omit<Params, 'path' | 'query'> : Params extends {
  path: infer P;
} ? (HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true ? {
  path: OptionalizePathParams<P>;
} : {
  path?: OptionalizePathParams<P>;
}) & Omit<Params, 'path'> : Params extends {
  query: infer Q;
} ? (HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> extends true ? {
  query: OptionalizeQueryParams<Q>;
} : {
  query?: OptionalizeQueryParams<Q>;
}) & Omit<Params, 'query'> : Params;
/**
 * Check if the transformed params have any remaining required fields.
 * This is used to determine if the entire options object can be optional.
 */
type HasRequiredTransformedParams<Params> = Params extends {
  path: infer P;
  query: infer Q;
} ? HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> extends true ? true : HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> : Params extends {
  path: infer P;
} ? HasRequiredKeysAfterGlobalParams<P, GlobalPathParamsKeys> : Params extends {
  query: infer Q;
} ? HasRequiredKeysAfterGlobalParams<Q, GlobalQueryParamsKeys> : false;
/**
 * Transform the body property to use strict c_* custom properties.
 * If body exists, apply WithStrictCustomProperties; otherwise pass through unchanged.
 */
type TransformBody<Opts$1> = Opts$1 extends {
  body: infer B;
} ? Omit<Opts$1, 'body'> & {
  body: WithStrictCustomProperties<B>;
} : Opts$1 extends {
  body?: infer B;
} ? Omit<Opts$1, 'body'> & {
  body?: WithStrictCustomProperties<B>;
} : Opts$1;
/**
 * Transform FetchOptions to:
 * 1. Make global params optional (organizationId in path, siteId in query)
 * 2. Apply strict c_* constraint to body (only allow c_* custom properties)
 *
 * The params object itself remains, but organizationId and siteId within become optional.
 * The body type is transformed to only allow known properties and c_* custom properties.
 */
type WithOptionalGlobalParams<OpDef$1> = FetchOptions<OpDef$1> extends infer Opts ? Opts extends {
  params: infer P;
} ? TransformBody<Omit<Opts, 'params'> & {
  params: TransformParams<P>;
}> : TransformBody<Opts> : never;
/**
 * Resolved version of FetchOptions with global params made optional.
 * This is the final type used for operation method signatures.
 *
 * Expands the type for better IntelliSense display while making
 * organizationId (in path) and siteId (in query) optional.
 */
type ResolvedGlobalParamsFetchOptions<OpDef$1> = WithOptionalGlobalParams<OpDef$1> extends infer Resolved ? { [K in keyof Resolved]: Resolved[K] } : never;
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
interface OperationInfo {
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
type OperationMap = Record<string, OperationInfo>;
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
type ReconstructPath<Base extends string, Suffix extends string> = `${Base}${Suffix}`;
/**
 * Extract the Paths type parameter from a Client
 *
 * @typeParam TClient - The openapi-fetch client type
 * @example
 * // Given: Client<paths, MediaType>
 * // Result: paths
 */
type ExtractPaths<TClient extends Client<any, any>> = TClient extends Client<infer P, any> ? P : never;
/**
 * Extract the Media type parameter from a Client
 *
 * @typeParam TClient - The openapi-fetch client type
 * @example
 * // Given: Client<paths, MediaType>
 * // Result: MediaType
 */
type ExtractMedia<TClient extends Client<any, any>> = TClient extends Client<any, infer M> ? M : never;
/**
 * Get the HTTP method key as lowercase
 * Converts 'GET' -> 'get', 'POST' -> 'post', etc.
 */
type LowercaseMethod<M$1 extends string> = Lowercase<M$1>;
/**
 * Extract the full path from an operation
 *
 * Reconstructs the full path from `b + s` (base + suffix)
 *
 * @typeParam TOperation - The operation info
 * @returns The full path as a string literal type
 */
type ExtractOperationPath<TOperation> = TOperation extends {
  b: infer B;
  s: infer S;
} ? B extends string ? S extends string ? ReconstructPath<B, S> : never : never : never;
/**
 * Extract success data type from operation definition
 * Gets the data type from 2xx responses
 */
type ExtractSuccessData<OpDef$1, Media extends `${string}/${string}`> = OpDef$1 extends Record<string | number, unknown> ? FetchResponse<OpDef$1, FetchOptions<OpDef$1>, Media> extends {
  data?: infer D;
} ? D : never : never;
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
type OperationMethod<TClient extends Client<any, any>, TOperation extends OperationInfo> = ExtractOperationPath<TOperation> extends infer Path ? Path extends keyof ExtractPaths<TClient> ? LowercaseMethod<TOperation['m']> extends infer Method ? Method extends keyof ExtractPaths<TClient>[Path] ? ExtractPaths<TClient>[Path][Method] extends infer OpDef ? OpDef extends Record<string | number, any> ? FetchOptions<OpDef> extends {
  params: infer P;
} ? HasRequiredTransformedParams<P> extends true ? (options: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
  data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
  response: Response;
}> : (options?: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
  data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
  response: Response;
}> : (options?: ResolvedGlobalParamsFetchOptions<OpDef>) => Promise<{
  data: ExtractSuccessData<OpDef, ExtractMedia<TClient>>;
  response: Response;
}> : never : never : never : never : never : never;
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
type ProxyClient<TClient extends Client<any, any>, TOperations extends OperationMap> = { [K in keyof TOperations]: OperationMethod<TClient, TOperations[K]> } & Pick<TClient, 'use' | 'eject'>;
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
type OperationMethodsOnly<T> = T extends ProxyClient<any, any> ? Omit<T, 'use' | 'eject'> : never;
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
type MergeClients<TBase, TCustom extends Record<string, unknown>> = Omit<TBase, keyof TCustom> & TCustom;
//#endregion
//#region src/scapi-client/auth/utils.d.ts
/**
 * Creates a cryptographically secure random code verifier for PKCE.
 *
 * Uses native Web Crypto API (crypto.getRandomValues) which provides
 * cryptographically secure random values. The output is 128 characters
 * using URL-safe alphabet (A-Za-z0-9-_).
 *
 * @returns A 128-character URL-safe random string suitable for PKCE code_verifier
 */
declare function createCodeVerifier(): string;
//#endregion
//#region src/scapi-client/generated/auth-v1.operations.d.ts
declare const operations$10: {
  readonly authenticateCustomer: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/login";
  };
  readonly authorizePasswordlessCustomer: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/passwordless/login";
  };
  readonly logoutCustomer: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/logout";
  };
  readonly authorizeCustomer: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/authorize";
  };
  readonly getAccessToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/token";
  };
  readonly getSessionBridgeAccessToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/session-bridge/token";
  };
  readonly getTrustedSystemAccessToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/trusted-system/token";
  };
  readonly getTrustedAgentAuthorizationToken: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/trusted-agent/authorize";
  };
  readonly getTrustedAgentAccessToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/trusted-agent/token";
  };
  readonly getPasswordResetToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/password/reset";
  };
  readonly resetPassword: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/password/action";
  };
  readonly getPasswordLessAccessToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/passwordless/token";
  };
  readonly revokeToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/revoke";
  };
  readonly introspectToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/introspect";
  };
  readonly getUserInfo: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/userinfo";
  };
  readonly getWellknownOpenidConfiguration: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/.well-known/openid-configuration";
  };
  readonly getJwksUri: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/jwks";
  };
  readonly authorizeWebauthnRegistration: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/register/authorize";
  };
  readonly startWebauthnUserRegistration: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/register/start";
  };
  readonly finishWebauthnUserRegistration: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/register/finish";
  };
  readonly startWebauthnAuthentication: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/authenticate/start";
  };
  readonly finishWebauthnAuthentication: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/authenticate/finish";
  };
  readonly getPasskeyUserByLoginId: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/passkey/user/{loginId}";
  };
  readonly deletePasskeyUser: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/passkey/user/{loginId}";
  };
  readonly deletePasskeyCredential: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/webauthn/passkey/user/{loginId}/credentials/{credentialId}";
  };
  readonly requestOtp: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/otp/request";
  };
  readonly verifyOtp: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/oauth2";
    readonly s: "/otp/verify";
  };
};
//#endregion
//#region src/scapi-client/auth/types.d.ts
/** WebAuthn credential as returned by the browser's navigator.credentials API. */
type PublicKeyCredentialJson = ShopperLogin.schemas['PublicKeyCredentialJson'];
/**
 * Re-export TokenResponse from the generated SLAS types for convenience.
 * This is the base response structure from SLAS token endpoints.
 */
type TokenResponse = ShopperLogin.schemas['TokenResponse'];
/**
 * Authentication response returned by all auth methods.
 *
 * Extends TokenResponse with the dwsid (DemandWare Session ID) which is
 * automatically extracted from the Set-Cookie response header. The dwsid
 * is used by hybrid storefronts for session management.
 */
type AuthResponse = TokenResponse & {
  /** DemandWare Session ID extracted from Set-Cookie header (for hybrid storefronts) */
  dwsid?: string;
};
/**
 * The ShopperLogin client type used internally by auth helpers.
 */
type ShopperLoginClient = ProxyClient<Client<ShopperLogin.endpoints>, typeof operations$10>;
/** Dedicated public-client configuration; never inherits ordinary shopper credentials. */
type TrustedAgentConfig = Pick<AuthConfig, 'shopperLoginClient' | 'clientId' | 'organizationId' | 'siteId' | 'redirectUri'>;
interface TrustedAgentAuthorizeOptions {
  /** Exact registered shopper login; not a customer number. */
  loginId: string;
  /** Optional server-prepared verifier, already persisted in a protected authorization transaction. */
  codeVerifier?: string;
}
interface TrustedAgentAuthorization {
  authorizationUrl: string;
  /** Server-only transaction secret. Persist in protected HttpOnly state. */
  codeVerifier: string;
}
interface TrustedAgentExchangeOptions extends TrustedAgentAuthorizeOptions {
  code: string;
  codeVerifier: string;
  /** Provider callback state, when supplied; not an application-generated authorize parameter. */
  state?: string;
  /** Protected current USID for renewal only. Omit when switching shoppers. */
  usid?: string;
  /** Protected current actor for renewal. Never accept from browser input. */
  agentId?: string;
}
/** Parsed identity, not proof of JWT signature verification. Times are milliseconds. */
interface TrustedAgentIdentity {
  loginId: string;
  customerId: string;
  agentId: string;
  usid: string;
  tokenExpiresAt: number;
}
/** TAOB deliberately has no refresh credential and is not an ordinary AuthResponse. */
interface TrustedAgentResponse {
  accessToken: string;
  identity: TrustedAgentIdentity;
  dwsid?: string;
}
interface TrustedAgentHelpers {
  authorizeRegistered(options: TrustedAgentAuthorizeOptions): Promise<TrustedAgentAuthorization>;
  exchangeCode(options: TrustedAgentExchangeOptions): Promise<TrustedAgentResponse>;
}
/**
 * Configuration required to create auth helpers.
 *
 * These parameters are provided at client creation time and are used
 * by all auth methods automatically.
 */
interface AuthConfig {
  /** The configured ShopperLogin client instance */
  shopperLoginClient: ShopperLoginClient;
  /** SLAS client ID */
  clientId: string;
  /** SLAS client secret (required for private client operations) */
  clientSecret?: string;
  /** OAuth redirect URI - must be registered in SLAS */
  redirectUri: string;
  /** Commerce Cloud organization ID */
  organizationId: string;
  /** Commerce Cloud site ID (channel ID) */
  siteId: string;
  /** Base URL for Commerce API (e.g., 'https://{shortCode}.api.commercecloud.salesforce.com') */
  baseUrl: string;
  /** Direct SCAPI proxy URL for workspace environments. When set, guest login uses client_credentials grant directly. */
  proxyHost?: string;
}
/**
 * Options for guest login.
 */
interface LoginAsGuestOptions {
  /** Unique Shopper Identifier to link to a previous session */
  usid?: string;
  /** Enable Do Not Track for the user */
  dnt?: boolean;
}
/**
 * Options for registered user login with credentials.
 */
interface LoginWithCredentialsOptions {
  /** User's email/username */
  username: string;
  /** User's password */
  password: string;
  /** Unique Shopper Identifier to link to a previous session */
  usid?: string;
  /** Enable Do Not Track for the user */
  dnt?: boolean;
}
/**
 * Options for refreshing an access token.
 */
interface RefreshTokenOptions {
  /** The refresh token to exchange for a new access token */
  refreshToken: string;
  /** Enable Do Not Track for the user */
  dnt?: boolean;
}
/**
 * Options for logging out a user.
 */
interface LogoutOptions {
  /** The current access token */
  accessToken: string;
  /** The current refresh token */
  refreshToken: string;
}
/**
 * Delivery modes for passwordless login and password reset.
 * - 'callback': SLAS calls your callback URL with the token (requires Marketing Cloud for email)
 * - 'sms': SLAS sends an SMS with the code directly
 * - 'email': SLAS sends an email with the OTP code directly (no Marketing Cloud needed)
 */
type PasswordActionMode = 'callback' | 'sms' | 'email';
/**
 * Options for initiating passwordless login.
 */
interface PasswordlessAuthorizeOptions {
  /** User identifier (email or phone) */
  userId: string;
  /** Callback URI for the magic link (required for 'callback' mode) */
  callbackUri?: string;
  /** Unique Shopper Identifier to link to a previous session */
  usid?: string;
  /** Method to receive OTP */
  mode: PasswordActionMode;
  /** Locale of the template */
  locale?: string;
  /** When true, creates a new customer profile if one doesn't exist */
  registerCustomer?: boolean;
  /** User's last name (required when registerCustomer is true) */
  lastName?: string;
  /** User's email address (required when registerCustomer is true and userId is not an email) */
  email?: string;
  /** User's first name (optional when registerCustomer is true) */
  firstName?: string;
  /** User's phone number (optional when registerCustomer is true) */
  phoneNumber?: string;
  /** Customer number to assign (optional when registerCustomer is true) */
  customerNo?: string;
  /**
   * When true, sends `strict_verify=true` as a query parameter to SLAS.
   * SLAS will return HTTP 400 for shoppers whose email is registered but unverified.
   * The default behavior (without this flag) is HTTP 200 with an OTP sent to the
   * unverified email — useful for the verify-and-sign-in flow on the login page,
   * but undesirable on checkout where we route unverified shoppers to standard
   * password login up front.
   */
  strictVerify?: boolean;
}
/**
 * Options for exchanging a passwordless login token for access tokens.
 */
interface PasswordlessExchangeTokenOptions {
  /** The passwordless login token from the magic link */
  pwdlessLoginToken: string;
  /**
   * The same user ID (email or phone) that was passed as `userId` to `passwordless.authorize()`
   * for this login. SLAS validates that this exactly matches the ID used during passwordless
   * login (no case or whitespace normalization) and rejects the exchange on mismatch.
   */
  loginId: string;
  /** Enable Do Not Track for the user */
  dnt?: boolean;
}
/**
 * Options for requesting a password reset.
 */
interface PasswordRequestResetOptions {
  /** User's email address */
  userId: string;
  /** Callback URI for the password reset link */
  callbackUri?: string;
  /** Locale of the template */
  locale?: string;
  /** Method to receive OTP */
  mode: PasswordActionMode;
  /** PKCE code challenge (required when hint is not cross_device) */
  codeChallenge?: string;
  /** Hint for password action. If not provided, 'cross_device' is sent by default. */
  hint?: string;
}
/**
 * Options for resetting a password with a token.
 */
interface PasswordResetOptions {
  /** User's email address */
  userId: string;
  /** Password reset token from the magic link */
  token: string;
  /** New password to set */
  newPassword: string;
  /** PKCE code verifier (required when hint is not cross_device) */
  codeVerifier?: string;
  /** Hint for password action. If not provided, 'cross_device' is sent by default. */
  hint?: string;
}
/**
 * Options for requesting an OTP code.
 */
interface OtpRequestOptions {
  /** User login ID (email or phone) */
  userId: string;
  /** Recipient email address (required when mode is 'email') */
  email?: string;
  /** Method to receive OTP */
  mode: PasswordActionMode;
  /** Locale of the template (e.g., 'en-us') */
  locale?: string;
  /** Callback URI (required when mode is 'callback') */
  callbackUri?: string;
}
/**
 * Options for verifying an OTP code.
 */
interface OtpVerifyOptions {
  /** The OTP code received by the user (6-8 digit numeric) */
  pwdActionToken: string;
  /** User login ID (email or phone) */
  userId: string;
}
/**
 * Options for getting a social login authorization URL.
 */
interface SocialGetAuthorizationUrlOptions {
  /**
   * The identity provider hint (e.g., 'google', 'facebook', 'apple').
   * This determines which social login provider to redirect to.
   */
  hint: string;
  /** Override the default redirect URI for this request */
  redirectUri?: string;
  /** Unique Shopper Identifier to link to a previous session */
  usid?: string;
}
/**
 * Result from getAuthorizationUrl containing the redirect URL and code verifier.
 */
interface SocialAuthorizationUrlResult {
  /**
   * The URL to redirect the user to for social login. For a public client this is the SLAS
   * authorize URL; for a private client it's the identity provider URL that SLAS redirected to,
   * because authorize is called server-side so the client credentials can be sent.
   */
  url: string;
  /**
   * The PKCE code verifier that must be stored and passed to exchangeCode().
   * Store this securely (e.g., in an httpOnly cookie) until the user returns.
   */
  codeVerifier: string;
}
/**
 * Options for exchanging a social login authorization code for tokens.
 */
interface SocialExchangeCodeOptions {
  /** The authorization code from the social provider callback */
  code: string;
  /** The PKCE code verifier from getAuthorizationUrl() */
  codeVerifier: string;
  /** The redirect URI that was used for authorization (must match) */
  redirectUri: string;
  /** Unique Shopper Identifier to link to a previous session */
  usid?: string;
  /** Enable Do Not Track for the user */
  dnt?: boolean;
}
/**
 * Options for authorizing WebAuthn registration.
 * Sends a TOTP to the user via the specified channel to verify identity before passkey creation.
 */
interface WebAuthnAuthorizeRegistrationOptions {
  /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
  userId: string;
  /** Delivery mode for the verification code */
  mode: PasswordActionMode;
  /** Callback URI (required when mode is 'callback') */
  callbackUri?: string;
  /** Locale for the verification message */
  locale?: string;
}
/**
 * Options for starting WebAuthn registration.
 */
interface WebAuthnRegistrationStartOptions {
  /** The OTP/TOTP received by the user */
  pwdActionToken: string;
  /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Must match the `userId` passed to `authorizeRegistration`. */
  userId: string;
  /** Display name for the passkey (e.g. user's full name) */
  displayName?: string;
  /** Nickname for the passkey device (e.g. "My iPhone") */
  nickName?: string;
}
/**
 * Options for finishing WebAuthn registration.
 * The credential is the JSON response from the browser's WebAuthn API.
 */
interface WebAuthnRegistrationFinishOptions {
  /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Must match the `userId` passed to `authorizeRegistration` and `startRegistration`. */
  userId: string;
  /** The OTP token used in startRegistration */
  pwdActionToken: string;
  /** Serialized PublicKeyCredential from navigator.credentials.create() */
  credential: PublicKeyCredentialJson;
}
/**
 * Options for starting WebAuthn authentication.
 */
interface WebAuthnAuthenticationStartOptions {
  /** Shopper's email address (SLAS login identifier). When omitted, a discoverable-credential (usernameless) flow is used and the authenticator selects the credential. */
  userId?: string;
}
/**
 * Options for finishing WebAuthn authentication.
 * The credential is the JSON response from the browser's WebAuthn API.
 */
interface WebAuthnAuthenticationFinishOptions {
  /** Serialized PublicKeyCredential from navigator.credentials.get() */
  credential: PublicKeyCredentialJson;
  /** Optional USID to carry over from the current guest session */
  usid?: string;
}
/**
 * Options for retrieving or deleting passkey user data.
 */
interface WebAuthnPasskeyUserOptions {
  /** Shopper access token */
  accessToken: string;
  /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
  loginId: string;
}
/**
 * Options for deleting a specific passkey credential.
 */
interface WebAuthnDeletePasskeyCredentialOptions {
  /** Shopper access token */
  accessToken: string;
  /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
  loginId: string;
  /** The credential ID to delete */
  credentialId: string;
}
/**
 * WebAuthn / passkey namespace.
 * Works with either a public or private SLAS client — a private client (clientSecret present)
 * sends the Basic auth header, a public client identifies via client_id in the request body.
 * Requires the `sfcc.pwdless_login` scope on the SLAS client.
 */
interface WebAuthnNamespace {
  /**
   * Step 1 of passkey registration: authorize the user by sending them a TOTP.
   *
   * @param options - User ID and delivery mode
   */
  authorizeRegistration(options: WebAuthnAuthorizeRegistrationOptions): ReturnType<ShopperLoginClient['authorizeWebauthnRegistration']>;
  /**
   * Step 2 of passkey registration: start registration and get credential creation options.
   * Pass the returned options to `navigator.credentials.create()`.
   *
   * @param options - TOTP and user details
   */
  startRegistration(options: WebAuthnRegistrationStartOptions): ReturnType<ShopperLoginClient['startWebauthnUserRegistration']>;
  /**
   * Step 3 of passkey registration: finish registration by submitting the authenticator response.
   *
   * @param options - Credential from `navigator.credentials.create()`
   */
  finishRegistration(options: WebAuthnRegistrationFinishOptions): ReturnType<ShopperLoginClient['finishWebauthnUserRegistration']>;
  /**
   * Step 1 of passkey authentication: get credential request options.
   * Pass the returned options to `navigator.credentials.get()`.
   *
   * @param options - Optional user ID (omit for discoverable-credential flow)
   */
  startAuthentication(options?: WebAuthnAuthenticationStartOptions): ReturnType<ShopperLoginClient['startWebauthnAuthentication']>;
  /**
   * Step 2 of passkey authentication: verify the assertion and get tokens.
   *
   * @param options - Credential from `navigator.credentials.get()`
   * @returns Promise resolving to AuthResponse with access tokens and dwsid
   */
  finishAuthentication(options: WebAuthnAuthenticationFinishOptions): Promise<AuthResponse>;
  /**
   * Retrieve passkey user information and all registered credentials.
   * Requires a valid shopper access token.
   *
   * @param options - Access token and login ID
   */
  getPasskeyUser(options: WebAuthnPasskeyUserOptions): ReturnType<ShopperLoginClient['getPasskeyUserByLoginId']>;
  /**
   * Delete a passkey user and all associated credentials.
   * Requires a valid shopper access token.
   *
   * @param options - Access token and login ID
   */
  deletePasskeyUser(options: WebAuthnPasskeyUserOptions): ReturnType<ShopperLoginClient['deletePasskeyUser']>;
  /**
   * Delete a specific passkey credential for a user.
   * Requires a valid shopper access token.
   *
   * @param options - Access token, login ID, and credential ID
   */
  deletePasskeyCredential(options: WebAuthnDeletePasskeyCredentialOptions): ReturnType<ShopperLoginClient['deletePasskeyCredential']>;
}
/**
 * Social/IDP login namespace.
 * Provides methods for social login via identity providers (Google, Facebook, Apple, etc.).
 */
interface SocialNamespace {
  /**
   * Get the authorization URL for social login.
   *
   * Generates a PKCE code verifier and returns the URL to redirect the user to.
   * The code verifier must be stored securely and passed to exchangeCode() after
   * the user returns from the social provider.
   *
   * @param options - The IDP hint and optional parameters
   * @returns Promise resolving to the authorization URL and code verifier
   *
   * @example
   * ```typescript
   * const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
   *   hint: 'google',
   * });
   * // Store codeVerifier in httpOnly cookie
   * // Redirect user to url
   * ```
   */
  getAuthorizationUrl(options: SocialGetAuthorizationUrlOptions): Promise<SocialAuthorizationUrlResult>;
  /**
   * Exchange an authorization code from a social provider for access tokens.
   *
   * Called after the user returns from the social provider with an authorization code.
   * Requires the code verifier that was returned from getAuthorizationUrl().
   *
   * @param options - The authorization code, code verifier, and redirect URI
   * @returns Promise resolving to AuthResponse with access tokens and dwsid
   *
   * @example
   * ```typescript
   * const tokens = await clients.auth.social.exchangeCode({
   *   code: callbackParams.code,
   *   codeVerifier: storedCodeVerifier,
   *   redirectUri: 'https://example.com/social-callback',
   * });
   * console.log(tokens.access_token, tokens.dwsid);
   * ```
   */
  exchangeCode(options: SocialExchangeCodeOptions): Promise<AuthResponse>;
}
/**
 * Passwordless login namespace.
 * Only available when clientSecret is configured (private SLAS client).
 */
interface PasswordlessNamespace {
  /**
   * Initiate passwordless login by sending a magic link to the user.
   *
   * @param options - User identifier and callback configuration
   * @returns Promise resolving to the API response (inferred from ShopperLogin client)
   */
  authorize(options: PasswordlessAuthorizeOptions): ReturnType<ShopperLoginClient['authorizePasswordlessCustomer']>;
  /**
   * Exchange a passwordless login token for access tokens.
   *
   * @param options - The passwordless token and optional parameters
   * @returns Promise resolving to AuthResponse with access tokens and dwsid
   */
  exchangeToken(options: PasswordlessExchangeTokenOptions): Promise<AuthResponse>;
}
/**
 * Password management namespace.
 */
interface PasswordNamespace {
  /**
   * Request a password reset token to be sent to the user's email.
   *
   * @param options - User email and callback URI
   * @returns Promise resolving to the API response (inferred from ShopperLogin client)
   */
  requestReset(options: PasswordRequestResetOptions): ReturnType<ShopperLoginClient['getPasswordResetToken']>;
  /**
   * Reset a user's password using a reset token.
   *
   * @param options - Email, reset token, and new password
   * @returns Promise resolving to the API response (inferred from ShopperLogin client)
   */
  reset(options: PasswordResetOptions): ReturnType<ShopperLoginClient['resetPassword']>;
}
/**
 * OTP (One-Time Password) namespace.
 * Only available when clientSecret is configured (private SLAS client).
 */
interface OtpNamespace {
  /**
   * Request an OTP code to be sent to the user.
   *
   * @param options - User identifier, mode, and delivery settings
   * @returns Promise resolving to void (202 Accepted, no body)
   */
  request(options: OtpRequestOptions): ReturnType<ShopperLoginClient['requestOtp']>;
  /**
   * Verify an OTP code.
   *
   * @param options - User identifier and OTP code
   * @returns Promise resolving to void (204 No Content, no body)
   */
  verify(options: OtpVerifyOptions): ReturnType<ShopperLoginClient['verifyOtp']>;
}
/**
 * Core authentication namespace.
 *
 * Provides methods for authentication operations:
 * - Guest login (public or private client)
 * - Registered user login with credentials
 * - Token refresh
 * - Logout
 * - Passwordless login (via `passwordless` sub-namespace)
 * - Password reset (via `password` sub-namespace)
 *
 * All methods that complete login return an AuthResponse containing access_token, refresh_token,
 * and dwsid (automatically extracted from the Set-Cookie response header for hybrid storefronts).
 */
interface AuthNamespace {
  /**
   * Login as a guest user.
   *
   * For public SLAS clients, uses PKCE (Proof Key for Code Exchange) flow.
   * For private SLAS clients (with clientSecret), uses client_credentials grant.
   *
   * @param options - Optional parameters for guest login
   * @returns Promise resolving to AuthResponse with access tokens and dwsid
   *
   * @example
   * ```typescript
   * // Simple guest login
   * const tokens = await clients.auth.loginAsGuest();
   * console.log(tokens.access_token, tokens.dwsid);
   *
   * // With session linking
   * const tokens = await clients.auth.loginAsGuest({ usid: 'previous-session-id' });
   * ```
   */
  loginAsGuest(options?: LoginAsGuestOptions): Promise<AuthResponse>;
  /**
   * Login with username and password credentials.
   *
   * Uses the B2C registered user login flow with PKCE.
   * For private SLAS clients, the client secret is used for enhanced security.
   *
   * @param credentials - User credentials and optional parameters
   * @returns Promise resolving to AuthResponse with access tokens and dwsid
   *
   * @example
   * ```typescript
   * const tokens = await clients.auth.loginWithCredentials({
   *   username: 'user@example.com',
   *   password: 'password123'
   * });
   * console.log(tokens.access_token, tokens.dwsid);
   * ```
   */
  loginWithCredentials(credentials: LoginWithCredentialsOptions): Promise<AuthResponse>;
  /**
   * Refresh an access token using a refresh token.
   *
   * Use this to obtain a new access token when the current one expires.
   * The refresh token has a longer lifetime (typically 30 days).
   *
   * @param options - The refresh token and optional parameters
   * @returns Promise resolving to AuthResponse with new tokens and dwsid
   *
   * @example
   * ```typescript
   * const newTokens = await clients.auth.refreshToken({
   *   refreshToken: storedRefreshToken
   * });
   * console.log(newTokens.access_token, newTokens.dwsid);
   * ```
   */
  refreshToken(options: RefreshTokenOptions): Promise<AuthResponse>;
  /**
   * Logout a shopper and revoke tokens.
   *
   * Revokes both the access token and refresh token.
   * After logout, the tokens can no longer be used.
   *
   * @param options - The access and refresh tokens to revoke
   * @returns Promise resolving to TokenResponse
   *
   * @example
   * ```typescript
   * await clients.auth.logout({
   *   accessToken: currentAccessToken,
   *   refreshToken: currentRefreshToken
   * });
   * ```
   */
  logout(options: LogoutOptions): Promise<TokenResponse>;
  /**
   * Social/IDP login namespace.
   * Provides methods for social login via Google, Facebook, Apple, etc.
   *
   * @example
   * ```typescript
   * // Step 1: Get authorization URL and redirect user
   * const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
   *   hint: 'google',
   * });
   * // Store codeVerifier securely, then redirect user to url
   *
   * // Step 2: After user returns, exchange code for tokens
   * const tokens = await clients.auth.social.exchangeCode({
   *   code: callbackParams.code,
   *   codeVerifier: storedCodeVerifier,
   *   redirectUri: 'https://example.com/social-callback',
   * });
   * console.log(tokens.access_token, tokens.dwsid);
   * ```
   */
  social: SocialNamespace;
  /**
   * Passwordless login namespace.
   * Only available when clientSecret is configured (private SLAS client).
   *
   * @example
   * ```typescript
   * // Send magic link
   * await clients.auth.passwordless.authorize({
   *   userId: 'user@example.com',
   *   callbackUri: 'https://example.com/passwordless-callback',
   *   mode: 'callback'
   * });
   *
   * // Exchange token from magic link - loginId must match the userId used above
   * const tokens = await clients.auth.passwordless.exchangeToken({
   *   pwdlessLoginToken: tokenFromUrl,
   *   loginId: 'user@example.com'
   * });
   * console.log(tokens.access_token, tokens.dwsid);
   * ```
   */
  passwordless: PasswordlessNamespace;
  /**
   * Password management namespace.
   *
   * @example
   * ```typescript
   * // Request password reset
   * await clients.auth.password.requestReset({
   *   userId: 'user@example.com',
   *   callbackUri: 'https://example.com/reset-password'
   * });
   *
   * // Reset password with token
   * await clients.auth.password.reset({
   *   userId: 'user@example.com',
   *   token: tokenFromUrl,
   *   newPassword: 'newSecurePassword123'
   * });
   * ```
   */
  password: PasswordNamespace;
  /**
   * OTP (One-Time Password) namespace.
   * Only available when clientSecret is configured (private SLAS client).
   *
   * @example
   * ```typescript
   * // Request OTP code
   * await clients.auth.otp.request({
   *   userId: 'user@example.com',
   *   email: 'user@example.com',
   *   usid: 'session-id',
   *   mode: 'email'
   * });
   *
   * // Verify OTP code
   * await clients.auth.otp.verify({
   *   userId: 'user@example.com',
   *   pwdActionToken: '12345678'
   * });
   * ```
   */
  otp: OtpNamespace;
  /**
   * WebAuthn / passkey namespace.
   * Registration and authentication (start/finish) both work with either a public or
   * private SLAS client — only a private client (clientSecret present) sends the Basic
   * auth header, while a public client identifies via client_id in the request body;
   * management (get/delete passkey) authenticates with the shopper's access token.
   * Requires the `sfcc.pwdless_login` scope on the SLAS client.
   *
   * @example
   * ```typescript
   * // Registration flow
   * await clients.auth.webAuthn.authorizeRegistration({
   *   userId: 'user@example.com',
   *   mode: 'email',
   * });
   * const options = await clients.auth.webAuthn.startRegistration({
   *   pwdActionToken: '12345678',
   *   userId: 'user@example.com',
   * });
   * const credential = await navigator.credentials.create({ publicKey: options.data });
   * await clients.auth.webAuthn.finishRegistration({ userId: 'user@example.com', credential });
   *
   * // Authentication flow
   * const challengeOptions = await clients.auth.webAuthn.startAuthentication({
   *   userId: 'user@example.com',
   * });
   * const assertion = await navigator.credentials.get({ publicKey: challengeOptions.data });
   * const tokens = await clients.auth.webAuthn.finishAuthentication({ credential: assertion });
   * ```
   */
  webAuthn: WebAuthnNamespace;
}
//#endregion
//#region src/scapi-client/auth/trusted-agent.d.ts
/** Safe to log: contains no callback URL, login, code, token, or upstream response body. */
declare class TrustedAgentError extends Error {
  readonly stage: 'configuration' | 'authorize' | 'exchange' | 'claims';
  readonly status?: number | undefined;
  constructor(stage: 'configuration' | 'authorize' | 'exchange' | 'claims', status?: number | undefined);
}
/** Validate without rewriting the registered login identifier. */
declare function validateTrustedAgentLogin(loginId: string): void;
/**
 * Parse and cross-check SLAS identity segments. This does NOT verify a signature.
 * Only use with a token from a successful server exchange or authenticated cookie provenance.
 * Expiry is returned even when elapsed so protected sessions can retain recovery identity.
 */
declare function parseTrustedAgentToken(token: string, expected: Pick<TrustedAgentConfig, 'clientId' | 'siteId' | 'organizationId'> & {
  loginId: string;
  usid?: string;
  agentId?: string;
}): TrustedAgentIdentity;
/**
 * Registered TAOB protocol for server-side callers. Uses the configured SDK transport,
 * including custom clients/proxies; never follows the human's Account Manager navigation.
 * Keep the verifier, code, and exchange response on the server.
 */
declare function createTrustedAgentHelpers(config: TrustedAgentConfig): TrustedAgentHelpers;
//#endregion
//#region src/scapi-client/auth/protected-state.d.ts
interface ProtectedStateKey {
  id: string;
  /** 256-bit deployment secret, injected by server-only configuration. */
  key: Uint8Array;
}
interface ProtectedStateBinding {
  purpose: string;
  siteId: string;
  origin: string;
}
/** Authenticated encryption with key rotation. Callers validate payload shape and transaction age. */
declare function createProtectedStateCodec(keys: readonly ProtectedStateKey[]): {
  seal(value: unknown, binding: ProtectedStateBinding): Promise<string>;
  open(value: string, binding: ProtectedStateBinding): Promise<unknown>;
};
//#endregion
//#region src/scapi-client/auth/index.d.ts
/**
 * Creates the auth helpers namespace.
 *
 * This factory function creates an auth namespace with methods for:
 * - Guest login (public or private SLAS client)
 * - Registered user login with credentials
 * - Token refresh
 * - Logout
 *
 * @param config - Configuration containing the ShopperLogin client and auth parameters
 * @returns The auth namespace with all authentication methods
 *
 * @example
 * ```typescript
 * const auth = createAuthHelpers({
 *   shopperLoginClient: clients.shopperLogin,
 *   clientId: 'your-client-id',
 *   clientSecret: process.env.SLAS_SECRET, // optional, for private client
 *   redirectUri: 'https://example.com/callback',
 *   organizationId: 'f_ecom_xxx',
 *   siteId: 'RefArch',
 * });
 *
 * const tokens = await auth.loginAsGuest();
 * ```
 */
declare function createAuthHelpers(config: AuthConfig): AuthNamespace;
//#endregion
//#region src/scapi-client/generated/shopper-baskets-v2.operations.d.ts
declare const operations$2: {
  readonly createBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "";
  };
  readonly transferBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/actions/transfer";
  };
  readonly mergeBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/actions/merge";
  };
  readonly getBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly deleteBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly updateBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly promoteTemporaryBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/actions/promote";
  };
  readonly updateAsAgentBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/agent";
  };
  readonly updateBillingAddressForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/billing-address";
  };
  readonly addCouponToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/coupons";
  };
  readonly removeCouponFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/coupons/{couponItemId}";
  };
  readonly updateCustomerForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/customer";
  };
  readonly addGiftCertificateItemToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items";
  };
  readonly removeGiftCertificateItemFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items/{giftCertificateItemId}";
  };
  readonly updateGiftCertificateItemInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items/{giftCertificateItemId}";
  };
  readonly addItemToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items";
  };
  readonly updateItemsInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items";
  };
  readonly removeItemFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}";
  };
  readonly updateItemInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}";
  };
  readonly addTaxesForBasketItem: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}/taxes";
  };
  readonly addPaymentInstrumentToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments";
  };
  readonly removePaymentInstrumentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly updatePaymentInstrumentInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly getPaymentMethodsForBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-methods";
  };
  readonly addPriceAdjustmentToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments";
  };
  readonly removePriceAdjustmentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments/{priceAdjustmentId}";
  };
  readonly updatePriceAdjustmentInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments/{priceAdjustmentId}";
  };
  readonly getPriceBooksForBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-books";
  };
  readonly addPriceBooksToBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-books";
  };
  readonly createShipmentForBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments";
  };
  readonly removeShipmentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}";
  };
  readonly updateShipmentForBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}";
  };
  readonly updateShippingAddressForShipment: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-address";
  };
  readonly updateShippingMethodForShipment: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-method";
  };
  readonly getShippingMethodsForShipment: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-methods";
  };
  readonly updateAsStorefrontBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/storefront";
  };
  readonly getTaxesFromBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/taxes";
  };
  readonly addTaxesForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/taxes";
  };
};
//#endregion
//#region src/scapi-client/basket/types.d.ts
/**
 * Basket schema from Shopper Baskets V2.
 */
type Basket = ShopperBasketsV2.schemas['Basket'];
/**
 * Shopper Baskets V2 client type used by basket helpers.
 */
type ShopperBasketsV2Client = ProxyClient<Client<ShopperBasketsV2.endpoints>, typeof operations$2>;
/**
 * Configuration required for basket helpers.
 */
interface BasketHelpersConfig {
  shopperBasketsClient: ShopperBasketsV2Client;
}
interface BasketHelpersNamespace {
  getOrCreateBasket: (options: GetOrCreateBasketOptions) => Promise<Basket>;
}
/**
 * Query parameters accepted by the Shopper Baskets V2 `getBasket` operation (global params like
 * `siteId` are auto-injected, so they're optional here). Callers request expansions; the SDK never
 * hardcodes a value.
 */
type GetBasketQuery = NonNullable<NonNullable<Parameters<ShopperBasketsV2Client['getBasket']>[0]>['params']>['query'];
/**
 * Options for retrieving or creating a basket.
 */
interface GetOrCreateBasketOptions {
  params: {
    path?: {
      basketId?: string;
    };
    /** Optional query forwarded to the GET basket operation (e.g. `{ expand: ['approaching_discounts'] }`). */
    query?: GetBasketQuery;
  };
  body: {
    currency: string;
  };
}
//#endregion
//#region src/scapi-client/basket/index.d.ts
/**
 * Get an existing basket or create a new one when missing/unavailable.
 *
 * Currency is passed via the basket request body (Shopper Baskets V2).
 *
 * @param config - Helper configuration containing the Shopper Baskets client
 * @param options - Basket identifiers and create options
 * @returns Basket instance (existing or newly created)
 *
 * @example
 * ```ts
 * const basketHelpers = createBasketHelpers({ shopperBasketsClient: clients.shopperBasketsV2 });
 * const basket = await basketHelpers.getOrCreateBasket({
 *   params: { path: { basketId } },
 *   body: { currency: 'USD' },
 * });
 * ```
 */
declare function createBasketHelpers(config: BasketHelpersConfig): BasketHelpersNamespace;
//#endregion
//#region src/scapi-client/generated/shopper-availability-v1.operations.d.ts
declare const operations: {
  readonly getAvailability: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/availability";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-baskets-v1.operations.d.ts
declare const operations$1: {
  readonly createBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "";
  };
  readonly transferBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/actions/transfer";
  };
  readonly mergeBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/actions/merge";
  };
  readonly getBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly deleteBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly updateBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}";
  };
  readonly updateAsAgentBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/agent";
  };
  readonly updateBillingAddressForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/billing-address";
  };
  readonly addCouponToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/coupons";
  };
  readonly removeCouponFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/coupons/{couponItemId}";
  };
  readonly updateCustomerForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/customer";
  };
  readonly addGiftCertificateItemToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items";
  };
  readonly removeGiftCertificateItemFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items/{giftCertificateItemId}";
  };
  readonly updateGiftCertificateItemInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/gift-certificate-items/{giftCertificateItemId}";
  };
  readonly addItemToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items";
  };
  readonly updateItemsInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items";
  };
  readonly removeItemFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}";
  };
  readonly updateItemInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}";
  };
  readonly addTaxesForBasketItem: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/items/{itemId}/taxes";
  };
  readonly addPaymentInstrumentToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments";
  };
  readonly removePaymentInstrumentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly updatePaymentInstrumentInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly getPaymentMethodsForBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/payment-methods";
  };
  readonly addPriceAdjustmentToBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments";
  };
  readonly removePriceAdjustmentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments/{priceAdjustmentId}";
  };
  readonly updatePriceAdjustmentInBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-adjustments/{priceAdjustmentId}";
  };
  readonly getPriceBooksForBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-books";
  };
  readonly addPriceBooksToBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/price-books";
  };
  readonly createShipmentForBasket: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments";
  };
  readonly removeShipmentFromBasket: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}";
  };
  readonly updateShipmentForBasket: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}";
  };
  readonly updateShippingAddressForShipment: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-address";
  };
  readonly updateShippingMethodForShipment: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-method";
  };
  readonly getShippingMethodsForShipment: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/shipments/{shipmentId}/shipping-methods";
  };
  readonly updateAsStorefrontBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/storefront";
  };
  readonly getTaxesFromBasket: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/taxes";
  };
  readonly addTaxesForBasket: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/baskets";
    readonly s: "/{basketId}/taxes";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-configurations-v1.operations.d.ts
declare const operations$3: {
  readonly getConfigurations: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/configurations";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-consents-v1.operations.d.ts
declare const operations$4: {
  readonly getSubscriptions: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/subscriptions";
    readonly s: "";
  };
  readonly updateSubscription: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/subscriptions";
    readonly s: "";
  };
  readonly updateSubscriptions: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/subscriptions";
    readonly s: "/actions/bulk";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-context-v1.operations.d.ts
declare const operations$5: {
  readonly getShopperContext: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/shopper-context/{usid}";
    readonly s: "";
  };
  readonly createShopperContext: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}/shopper-context/{usid}";
    readonly s: "";
  };
  readonly deleteShopperContext: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/shopper-context/{usid}";
    readonly s: "";
  };
  readonly updateShopperContext: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/shopper-context/{usid}";
    readonly s: "";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-customers-v1.operations.d.ts
declare const operations$6: {
  readonly registerCustomer: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers";
  };
  readonly resetPassword: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/password/actions/reset";
  };
  readonly getResetPasswordToken: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/password/actions/create-reset-token";
  };
  readonly getExternalProfile: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/external-profile";
  };
  readonly registerExternalProfile: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/external-profile";
  };
  readonly getCustomer: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}";
  };
  readonly updateCustomer: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}";
  };
  readonly createCustomerAddress: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/addresses";
  };
  readonly getCustomerAddress: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/addresses/{addressName}";
  };
  readonly removeCustomerAddress: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/addresses/{addressName}";
  };
  readonly updateCustomerAddress: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/addresses/{addressName}";
  };
  readonly getCustomerBaskets: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/baskets";
  };
  readonly getCustomerOrders: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/orders";
  };
  readonly updateCustomerPassword: {
    readonly m: "PUT";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/password";
  };
  readonly createCustomerPaymentInstrument: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-instruments";
  };
  readonly getCustomerPaymentInstrument: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly deleteCustomerPaymentInstrument: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly updateCustomerPaymentInstrument: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-instruments/{paymentInstrumentId}";
  };
  readonly deleteCustomerPaymentMethodReference: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-method-references/{paymentMethodReferenceId}";
  };
  readonly setupCustomerPaymentMethodReference: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-method-references/actions/setup";
  };
  readonly completeCustomerPaymentMethodReferenceSetup: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/payment-method-references/actions/complete";
  };
  readonly getCustomerProductLists: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists";
  };
  readonly createCustomerProductList: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists";
  };
  readonly getCustomerProductList: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}";
  };
  readonly deleteCustomerProductList: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}";
  };
  readonly updateCustomerProductList: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}";
  };
  readonly createCustomerProductListItem: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}/items";
  };
  readonly getCustomerProductListItem: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}/items/{itemId}";
  };
  readonly deleteCustomerProductListItem: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}/items/{itemId}";
  };
  readonly updateCustomerProductListItem: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/customers/{customerId}/product-lists/{listId}/items/{itemId}";
  };
  readonly getPublicProductListsBySearchTerm: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/product-lists";
  };
  readonly getPublicProductList: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/product-lists/{listId}";
  };
  readonly getPublicProductListItems: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/product-lists/{listId}/items";
  };
  readonly getProductListItem: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/product-lists/{listId}/items/{itemId}";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-delivery-estimates-v1.operations.d.ts
declare const operations$7: {
  readonly getDeliveryEstimates: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/delivery-estimates";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-experience-v1.operations.d.ts
declare const operations$8: {
  readonly getPages: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/pages";
  };
  readonly getPage: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/pages/{pageId}";
  };
  readonly getSlot: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/slots/{slotId}";
  };
  readonly getComponent: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/components/{componentId}";
  };
  readonly getContent: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/contents/{id}";
  };
  readonly getMultipleContent: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/contents";
  };
  readonly searchContent: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/content-search";
  };
  readonly getContentFolder: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/folders/{id}";
  };
  readonly getContentFolders: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/folders";
  };
  readonly applyPreviewContext: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/preview-context/apply";
  };
  readonly resolveQualifiers: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/qualifiers/resolve";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-gift-certificates-v1.operations.d.ts
declare const operations$9: {
  readonly getGiftCertificate: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/gift-certificate";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-orders-v1.operations.d.ts
declare const operations$11: {
  readonly createOrder: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "";
  };
  readonly getOmsMetaData: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/oms-meta-data";
  };
  readonly getOrder: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}";
  };
  readonly guestOrderLookup: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/lookup";
  };
  readonly failOrder: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/actions/fail";
  };
  readonly attemptOrderTransition: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/actions/attempt-transition";
  };
  readonly cancelOmsOrder: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/actions/oms-cancel-order";
  };
  readonly returnOmsOrder: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/actions/oms-return-order";
  };
  readonly requestOrderAccessCode: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/actions/request-access-code";
  };
  readonly createPaymentInstrumentForOrder: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/payment-instruments";
  };
  readonly removePaymentInstrumentFromOrder: {
    readonly m: "DELETE";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/payment-instruments/{paymentInstrumentId}";
  };
  readonly updatePaymentInstrumentForOrder: {
    readonly m: "PATCH";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/payment-instruments/{paymentInstrumentId}";
  };
  readonly getPaymentMethodsForOrder: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/payment-methods";
  };
  readonly getTaxesFromOrder: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/orders";
    readonly s: "/{orderNo}/taxes";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-payments-v1.operations.d.ts
declare const operations$12: {
  readonly getPaymentConfiguration: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/payment-";
    readonly s: "configuration";
  };
  readonly getPaymentInstrumentBalance: {
    readonly m: "POST";
    readonly b: "/organizations/{organizationId}/payment-";
    readonly s: "instruments/balance";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-products-v1.operations.d.ts
declare const operations$13: {
  readonly getProducts: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/products";
  };
  readonly getProduct: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/products/{id}";
  };
  readonly getProductImages: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/products/{productId}/images";
  };
  readonly getProductPrices: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/products/{productId}/prices";
  };
  readonly getProductPromotions: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/products/{productId}/promotions";
  };
  readonly getCategories: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/categories";
  };
  readonly getCategory: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/categories/{id}";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-promotions-v1.operations.d.ts
declare const operations$14: {
  readonly getPromotions: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/promotions";
    readonly s: "";
  };
  readonly getPromotionsForCampaign: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/promotions";
    readonly s: "/campaigns/{campaignId}";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-search-v1.operations.d.ts
declare const operations$15: {
  readonly productSearch: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/product-search";
  };
  readonly getSearchSuggestions: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/search-suggestions";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-seo-v1.operations.d.ts
declare const operations$16: {
  readonly getUrlMapping: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/url-mapping";
  };
  readonly getPageMetaTags: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}";
    readonly s: "/page-meta-tags/{scope}";
  };
};
//#endregion
//#region src/scapi-client/generated/shopper-stores-v1.operations.d.ts
declare const operations$17: {
  readonly getStores: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/store";
    readonly s: "s";
  };
  readonly searchStores: {
    readonly m: "GET";
    readonly b: "/organizations/{organizationId}/store";
    readonly s: "-search";
  };
};
//#endregion
//#region src/scapi-client/createClients.d.ts
/**
 * Configuration for creating Commerce API clients.
 *
 * Extends openapi-fetch ClientOptions with required organizationId and siteId
 * which will be automatically merged into all API calls as global request parameters.
 */
interface CommerceApiClientConfig extends ClientOptions {
  /** Base URL for Commerce API (required for building auth URLs) */
  baseUrl: string;
  /** Organization ID - automatically merged into path parameters */
  organizationId: string;
  /** Site ID - automatically merged into query parameters */
  siteId: string;
  /** Locale - automatically merged into query parameters (optional) */
  locale?: string;
  /** SLAS client ID - required for auth operations */
  clientId: string;
  /** SLAS client secret - required for private client auth operations */
  clientSecret?: string;
  /** OAuth redirect URI - must be registered in SLAS configuration */
  redirectUri: string;
  /** Optional callback when access token is invalidated */
  onAuthTokenInvalid?: (response: Response) => void;
  /**
   * Direct SCAPI proxy URL for workspace environments (e.g., 'https://scw:25010').
   * When set, the SDK automatically:
   * - Strips 'f_ecom_' prefix from organizationId for SLAS auth endpoints
   * - Rewrites org IDs back to full form for product/search API endpoints
   * - Uses client_credentials grant for guest login (no PKCE)
   */
  proxyHost?: string;
}
type Clients = {
  shopperAvailability: ProxyClient<Client<ShopperAvailability.endpoints>, typeof operations>;
  shopperBasketsV1: ProxyClient<Client<ShopperBasketsV1.endpoints>, typeof operations$1>;
  shopperBasketsV2: ProxyClient<Client<ShopperBasketsV2.endpoints>, typeof operations$2>;
  shopperConfigurations: ProxyClient<Client<ShopperConfigurations.endpoints>, typeof operations$3>;
  shopperConsents: ProxyClient<Client<ShopperConsents.endpoints>, typeof operations$4>;
  shopperContext: ProxyClient<Client<ShopperContext.endpoints>, typeof operations$5>;
  shopperCustomers: ProxyClient<Client<ShopperCustomers.endpoints>, typeof operations$6>;
  shopperDeliveryEstimates: ProxyClient<Client<ShopperDeliveryEstimates.endpoints>, typeof operations$7>;
  shopperExperience: ProxyClient<Client<ShopperExperience.endpoints>, typeof operations$8>;
  shopperGiftCertificates: ProxyClient<Client<ShopperGiftCertificates.endpoints>, typeof operations$9>;
  shopperLogin: ProxyClient<Client<ShopperLogin.endpoints>, typeof operations$10>;
  shopperOrders: ProxyClient<Client<ShopperOrders.endpoints>, typeof operations$11>;
  shopperPayments: ProxyClient<Client<ShopperPayments.endpoints>, typeof operations$12>;
  shopperProducts: ProxyClient<Client<ShopperProducts.endpoints>, typeof operations$13>;
  shopperPromotions: ProxyClient<Client<ShopperPromotions.endpoints>, typeof operations$14>;
  shopperSearch: ProxyClient<Client<ShopperSearch.endpoints>, typeof operations$15>;
  shopperSeo: ProxyClient<Client<ShopperSeo.endpoints>, typeof operations$16>;
  shopperStores: ProxyClient<Client<ShopperStores.endpoints>, typeof operations$17>;
  /** Authentication helpers for SLAS operations */
  auth: AuthNamespace;
  /** Basket helper utilities */
  basket: BasketHelpersNamespace;
  use: (middleware: Middleware) => void;
};
declare function createCommerceApiClients(config: CommerceApiClientConfig): Clients;
//#endregion
//#region src/scapi-client/createClient.d.ts
/**
 * Optional hooks for client behavior.
 */
interface CreateClientOptions {
  /** Callback invoked when an auth token is deemed invalid */
  onAuthTokenInvalid?: (response: Response) => void;
}
/**
 * Global request parameters that are automatically merged into every API call.
 *
 * When provided to createClient, these values will be merged into every
 * operation call, eliminating the need to pass them manually each time.
 */
interface GlobalRequestParameters {
  /** Organization ID to merge into path parameters */
  organizationId: string;
  /** Site ID to merge into query parameters */
  siteId: string;
  /** Locale to merge into query parameters (optional) */
  locale?: string;
}
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
declare function createClient<TClient extends Client<any, any>, TOperations extends OperationMap>(client: TClient, operations: TOperations, globalParams?: GlobalRequestParameters, options?: CreateClientOptions): ProxyClient<TClient, TOperations>;
//#endregion
//#region src/scapi-client/ApiError.d.ts
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
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
interface ErrorDetail {
  /** A URI reference that identifies the problem type */
  type: string;
  /** A short, human-readable summary of the problem type */
  title: string;
  /** A human-readable explanation specific to this occurrence of the problem */
  detail: string;
  /** Additional properties that may be included in the error response */
  [key: string]: unknown;
}
/**
 * Custom error class for API errors
 *
 * This error is thrown when an API request returns a non-2xx status code.
 * It includes comprehensive information about the error including the parsed
 * and raw response bodies, headers, status code, and request details.
 *
 * The error body is always typed as ErrorDetail (RFC 7807), which matches
 * the standard error format used by Salesforce Commerce APIs. If the response
 * cannot be parsed as JSON, an empty ErrorDetail object is returned.
 *
 * @example
 * ```typescript
 * try {
 *   const { data } = await client.getProduct({ params: { path: { id: 'invalid' } } });
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.log(error.status); // 404
 *     console.log(error.statusText); // "Not Found"
 *     console.log(error.body.title); // "Product Not Found" (always typed!)
 *     console.log(error.body.detail); // Detailed error message (always typed!)
 *     console.log(error.rawBody); // Raw response text
 *     console.log(error.headers.get('content-type')); // Access headers
 *     console.log(error.url); // Request URL
 *     console.log(error.method); // HTTP method
 *   }
 * }
 * ```
 */
declare class ApiError extends Error {
  /**
   * HTTP status code (e.g., 404, 500)
   */
  readonly status: number;
  /**
   * HTTP status text (e.g., "Not Found", "Internal Server Error")
   */
  readonly statusText: string;
  /**
   * Response headers
   */
  readonly headers: Headers;
  /**
   * Parsed response body as ErrorDetail
   * Automatically parsed from JSON if the response is valid JSON.
   * If parsing fails, returns an empty ErrorDetail object with empty strings.
   */
  readonly body: ErrorDetail;
  /**
   * Raw response body as text
   * Useful for debugging when the body couldn't be parsed as JSON
   */
  readonly rawBody: string;
  /**
   * Request URL that caused the error
   */
  readonly url: string;
  /**
   * HTTP method used for the request (e.g., "GET", "POST")
   */
  readonly method: string;
  /**
   * Creates an ApiError instance
   *
   * @param options - Error details
   * @param options.status - HTTP status code
   * @param options.statusText - HTTP status message
   * @param options.headers - Response headers
   * @param options.body - Parsed response body as ErrorDetail
   * @param options.rawBody - Raw response body text
   * @param options.url - Request URL
   * @param options.method - HTTP method
   */
  constructor(options: {
    status: number;
    statusText: string;
    headers: Headers;
    body: ErrorDetail;
    rawBody: string;
    url: string;
    method: string;
  });
  /**
   * Returns a JSON representation of the error
   * Useful for logging and debugging
   */
  toJSON(): {
    name: string;
    message: string;
    status: number;
    statusText: string;
    body: ErrorDetail;
    rawBody: string;
    url: string;
    method: string;
    headers: {
      [k: string]: string;
    };
  };
}
//#endregion
//#region src/scapi-client/AuthTokenInvalidError.d.ts
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
declare class AuthTokenInvalidError extends Error {
  constructor(message?: string);
}
//#endregion
//#region src/scapi-client/inventory.d.ts
/**
 * Read one explicit inventory list without modifying Shopper Context. API failures propagate.
 * Missing products/records stay absent; a response for another list is a configuration error.
 * Native invalid-list responses can omit inventories even though the schema requires the field.
 * Batches respect the native 24-product limit with at most four requests in flight.
 */
declare function fetchInventoryRecords(client: Clients['shopperAvailability'], productIds: string[], inventoryId: string): Promise<Map<string, InventoryRecord>>;
/** Invalid or unrepresentable consumption; distinct from missing stock and API failures. */
declare class InventoryQuantityError extends TypeError {
  constructor();
}
/**
 * Multiply component consumption or rescale a native child total to a new parent quantity.
 * Keep the decimal operands exact through multiplication/division, then convert once to the
 * numeric API representation. Never clamp fractional parent quantities or apply a stock epsilon.
 */
declare function scaleInventoryQuantity(quantity: number, multiplier: number, divisor?: number): number;
/**
 * Aggregate consumption of a SKU across lines/options. Callers supply total component quantities.
 * Sum decimal quantities before converting back to a number so duplicate fractional units do not
 * exceed exact stock through binary addition (for example, 0.1 + 0.2 against stock 0.3).
 */
declare function aggregateInventoryQuantities(lines: ReadonlyArray<{
  productId?: string;
  quantity?: number;
}>): Map<string, number>;
//#endregion
//#region src/scapi-client/constants.d.ts
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
 * Path patterns for SLAS authentication endpoints.
 * These endpoints handle their own authentication (Basic auth, PKCE, etc.)
 * and should NOT have Bearer tokens auto-injected by middleware.
 *
 * Use with URL.pathname.includes() to check if a request targets a SLAS auth endpoint.
 *
 * @example
 * ```typescript
 * const isSlasAuthEndpoint = SLAS_AUTH_ENDPOINTS.some(path => url.pathname.includes(path));
 * if (isSlasAuthEndpoint) {
 *     // Skip Bearer token injection - endpoint handles its own auth
 *     return request;
 * }
 * ```
 */
declare const SLAS_AUTH_ENDPOINTS: readonly ["/oauth2/token", "/oauth2/authorize", "/oauth2/logout", "/oauth2/login", "/oauth2/passwordless", "/oauth2/password", "/oauth2/session-bridge", "/oauth2/trusted-agent", "/oauth2/trusted-system", "/oauth2/revoke", "/oauth2/introspect", "/oauth2/webauthn"];
//#endregion
//#region src/scapi-client/defaultQuerySerializer.d.ts
/**
 * Default query serializer for Commerce Cloud APIs
 * - Most arrays use comma-separated format (explode: false)
 *   e.g., expand=promotions,variations,prices
 * - Certain parameters use repeated format (explode: true)
 *   e.g., refine=price=(0..10)&refine=c_refinementColor=green
 * - Some parameters are automatically grouped by attribute ID before serialization
 *   e.g., ['c_color=Black', 'c_color=Green'] => 'c_color=Black|Green'
 */
declare function defaultQuerySerializer(queryParams: Record<string, unknown>): string;
//#endregion
//#region src/scapi-client/built-in-clients.d.ts
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
 * Single source of truth for built-in SCAPI client configuration.
 *
 * Both `createCommerceApiClients` (runtime) and `sfnext scapi add` (dev CLI) read from
 * this map so an override registered via the CLI inherits the same per-client semantics
 * the SDK uses internally — locale-awareness, base-path — and the two stay in sync by
 * construction rather than by hand-mirroring.
 *
 * Each built-in SCAPI schema includes `/organizations/{organizationId}` in its path
 * patterns (and thus in the generated ops map's BASE_PATH), so the URL-prefix here is
 * the part *before* the org segment. Both the runtime and the CLI build the final URL
 * the same way: `${apiBaseUrl}${client.basePath}` with `/organizations/{organizationId}`
 * supplied via the ops map at request time.
 */
interface BuiltInClientDefault {
  /** URL prefix for this client's API, joined with the SCAPI baseUrl at request time. */
  basePath: string;
  /** Whether this API accepts a `locale` query parameter on its operations. */
  supportsLocale: boolean;
}
declare const BUILT_IN_CLIENT_DEFAULTS: {
  readonly shopperAvailability: {
    readonly basePath: "/product/shopper-availability/v1";
    readonly supportsLocale: false;
  };
  readonly shopperBasketsV1: {
    readonly basePath: "/checkout/shopper-baskets/v1";
    readonly supportsLocale: true;
  };
  readonly shopperBasketsV2: {
    readonly basePath: "/checkout/shopper-baskets/v2";
    readonly supportsLocale: true;
  };
  readonly shopperConfigurations: {
    readonly basePath: "/configuration/shopper-configurations/v1";
    readonly supportsLocale: false;
  };
  readonly shopperConsents: {
    readonly basePath: "/shopper/shopper-consents/v1";
    readonly supportsLocale: true;
  };
  readonly shopperContext: {
    readonly basePath: "/shopper/shopper-context/v1";
    readonly supportsLocale: false;
  };
  readonly shopperCustomers: {
    readonly basePath: "/customer/shopper-customers/v1";
    readonly supportsLocale: false;
  };
  readonly shopperDeliveryEstimates: {
    readonly basePath: "/product/shopper-delivery-estimates/v1";
    readonly supportsLocale: false;
  };
  readonly shopperExperience: {
    readonly basePath: "/experience/shopper-experience/v1";
    readonly supportsLocale: true;
  };
  readonly shopperGiftCertificates: {
    readonly basePath: "/pricing/shopper-gift-certificates/v1";
    readonly supportsLocale: false;
  };
  readonly shopperLogin: {
    readonly basePath: "/shopper/auth/v1";
    readonly supportsLocale: false;
  };
  readonly shopperOrders: {
    readonly basePath: "/checkout/shopper-orders/v1";
    readonly supportsLocale: true;
  };
  readonly shopperPayments: {
    readonly basePath: "/checkout/shopper-payments/v1";
    readonly supportsLocale: false;
  };
  readonly shopperProducts: {
    readonly basePath: "/product/shopper-products/v1";
    readonly supportsLocale: true;
  };
  readonly shopperPromotions: {
    readonly basePath: "/pricing/shopper-promotions/v1";
    readonly supportsLocale: true;
  };
  readonly shopperSearch: {
    readonly basePath: "/search/shopper-search/v1";
    readonly supportsLocale: true;
  };
  readonly shopperSeo: {
    readonly basePath: "/site/shopper-seo/v1";
    readonly supportsLocale: true;
  };
  readonly shopperStores: {
    readonly basePath: "/store/shopper-stores/v1";
    readonly supportsLocale: true;
  };
};
type BuiltInClientKey = keyof typeof BUILT_IN_CLIENT_DEFAULTS;
declare const BUILT_IN_CLIENT_KEYS: readonly BuiltInClientKey[];
declare function isBuiltInClientKey(key: string): key is BuiltInClientKey;
//#endregion
//#region src/scapi-client/shopper-context.d.ts
type NativeShopperContext = ShopperContext.schemas['ShopperContext'];
/**
 * Request-scoped native context access. PATCH merges individual qualifier keys;
 * null removes one key. Never replace existing native context from a cookie replica.
 * An empty patch reconciles the native result without changing qualification.
 * Native errors propagate, including unsupported missing-context behavior.
 */
declare function createShopperContextHelpers({
  client,
  usid
}: {
  client: Clients['shopperContext'];
  usid: string;
}): {
  /** Resolve once before dependent reads, including an expired/missing context. */
  resolve: () => Promise<{
    effectiveDateTime?: string | null;
    sourceCode?: string | null;
    customerGroupIds?: string[];
    customQualifiers?: {
      [key: string]: string | null;
    };
    assignmentQualifiers?: {
      [key: string]: string | null;
    };
    clientIp?: string;
    geoLocation?: {
      city?: string;
      country?: string;
      countryCode?: string;
      latitude?: number;
      longitude?: number;
      metroCode?: string;
      postalCode?: string;
      region?: string;
      regionCode?: string;
    };
    couponCodes?: string[];
  }>;
  /** Store only native success; callers must publish their replicas afterwards. */
  update: (body: NativeShopperContext, options?: {
    initialContext?: NativeShopperContext;
  }) => Promise<{
    effectiveDateTime?: string | null;
    sourceCode?: string | null;
    customerGroupIds?: string[];
    customQualifiers?: {
      [key: string]: string | null;
    };
    assignmentQualifiers?: {
      [key: string]: string | null;
    };
    clientIp?: string;
    geoLocation?: {
      city?: string;
      country?: string;
      countryCode?: string;
      latitude?: number;
      longitude?: number;
      metroCode?: string;
      postalCode?: string;
      region?: string;
      regionCode?: string;
    };
    couponCodes?: string[];
  }>;
};
/** Server-owned handoff to the preview/consent/recalculation workstream. */
type ConfirmedContextChangeRequired<T> = {
  success: false;
  code: 'STORE_CHANGE_CONFIRMATION_REQUIRED';
  current: T | null;
  candidate: T | null;
};
//#endregion
export { ApiError, type AuthConfig, type AuthNamespace, type AuthResponse, AuthTokenInvalidError, BUILT_IN_CLIENT_DEFAULTS, BUILT_IN_CLIENT_KEYS, type Basket, type BasketHelpersConfig, type BasketHelpersNamespace, type BuiltInClientDefault, type BuiltInClientKey, Clients, CommerceApiClientConfig, type ConfirmedContextChangeRequired, CreateClientOptions, type ErrorDetail, type GetOrCreateBasketOptions, GlobalRequestParameters, InventoryQuantityError, type InventoryRecord, type LoginAsGuestOptions, type LoginWithCredentialsOptions, type LogoutOptions, type MergeClients, type NativeShopperContext, type OperationInfo, type OperationMap, type OperationMethodsOnly, type PasswordRequestResetOptions, type PasswordResetOptions, type PasswordlessAuthorizeOptions, type PasswordlessExchangeTokenOptions, type ProtectedStateBinding, type ProtectedStateKey, type ProxyClient, type RefreshTokenOptions, SLAS_AUTH_ENDPOINTS, ShopperAvailability, ShopperBasketsV1, ShopperBasketsV2, type ShopperBasketsV2Client, ShopperConfigurations, ShopperConsents, ShopperContext, ShopperCustomers, ShopperDeliveryEstimates, ShopperExperience, ShopperGiftCertificates, ShopperLogin, ShopperOrders, ShopperPayments, ShopperProducts, ShopperPromotions, ShopperSearch, ShopperSeo, ShopperStores, type SocialAuthorizationUrlResult, type SocialExchangeCodeOptions, type SocialGetAuthorizationUrlOptions, type TokenResponse, type TrustedAgentAuthorization, type TrustedAgentAuthorizeOptions, type TrustedAgentConfig, TrustedAgentError, type TrustedAgentExchangeOptions, type TrustedAgentHelpers, type TrustedAgentIdentity, type TrustedAgentResponse, aggregateInventoryQuantities, createAuthHelpers, createBasketHelpers, createClient, createCodeVerifier, createCommerceApiClients, createOpenApiFetchClient, createProtectedStateCodec, createShopperContextHelpers, createTrustedAgentHelpers, defaultQuerySerializer, fetchInventoryRecords, hasInventoryStock, hasUsableInventoryStock, isBuiltInClientKey, parseTrustedAgentToken, scaleInventoryQuantity, validateTrustedAgentLogin };
//# sourceMappingURL=scapi.d.ts.map