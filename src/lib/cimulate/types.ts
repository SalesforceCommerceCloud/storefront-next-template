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
export type CimulateAuthLinkErrorCode =
    | 'AUTH_LINK_UNAVAILABLE'
    | 'AUTH_LINK_INVALID_RESPONSE'
    | 'AUTH_LINK_AUTHORIZATION';

export type CimulateTokenBridgeErrorCode =
    | 'INVALID_REQUEST'
    | 'FORBIDDEN_ORIGIN'
    | 'METHOD_NOT_ALLOWED'
    | 'FEATURE_DISABLED'
    | 'SHOPPER_SESSION_REQUIRED'
    | 'TOKEN_BRIDGE_AUTHORIZATION'
    | 'TOKEN_BRIDGE_RATE_LIMITED'
    | 'TOKEN_BRIDGE_UNAVAILABLE';

interface CimulateError<Code extends string> {
    code: Code;
    retryable?: boolean;
    retryAfterSeconds?: number;
}

export type CimulateAuthLinkError = CimulateError<CimulateAuthLinkErrorCode>;

export type CimulateAuthLinkResult =
    | { success: true; authLinkKey: string }
    | { success: false; error: CimulateAuthLinkError };

export interface CimulateTokenBridgeRequest {
    auth_link_key: string;
}

export type CimulateTokenBridgeError = CimulateError<CimulateTokenBridgeErrorCode>;

export type CimulateTokenBridgeResult = { success: true } | { success: false; error: CimulateTokenBridgeError };

export type CimulateIdentityLinkResult = CimulateTokenBridgeResult | Exclude<CimulateAuthLinkResult, { success: true }>;
