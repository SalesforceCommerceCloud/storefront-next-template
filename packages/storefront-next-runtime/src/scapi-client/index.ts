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
export * from 'openapi-fetch';
export { default as createOpenApiFetchClient } from 'openapi-fetch';
export type * from './types';
export * from './createClients';
export * from './createClient';
export { ApiError, type ErrorDetail } from './ApiError';
export { AuthTokenInvalidError } from './AuthTokenInvalidError';
export { SLAS_AUTH_ENDPOINTS } from './constants';
export { createBasketHelpers } from './basket';
export { createAuthHelpers } from './auth';
export type {
    Basket,
    BasketHelpersConfig,
    BasketHelpersNamespace,
    GetOrCreateBasketOptions,
    ShopperBasketsV2Client,
} from './basket';
export type {
    AuthNamespace,
    AuthConfig,
    AuthResponse,
    TokenResponse,
    LoginAsGuestOptions,
    LoginWithCredentialsOptions,
    RefreshTokenOptions,
    LogoutOptions,
    PasswordlessAuthorizeOptions,
    PasswordlessExchangeTokenOptions,
    PasswordRequestResetOptions,
    PasswordResetOptions,
    SocialGetAuthorizationUrlOptions,
    SocialAuthorizationUrlResult,
    SocialExchangeCodeOptions,
} from './auth';
export type { OperationMethodsOnly, ProxyClient, OperationMap, OperationInfo, MergeClients } from './proxy-types';
export { defaultQuerySerializer } from './defaultQuerySerializer';
export {
    BUILT_IN_CLIENT_DEFAULTS,
    BUILT_IN_CLIENT_KEYS,
    isBuiltInClientKey,
    type BuiltInClientDefault,
    type BuiltInClientKey,
} from './built-in-clients';

export {
    createShopperContextHelpers,
    type NativeShopperContext,
    type ConfirmedContextChangeRequired,
} from './shopper-context';
