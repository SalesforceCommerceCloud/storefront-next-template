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
import type {
    CimulateAuthLinkResult,
    CimulateIdentityLinkResult,
    CimulateTokenBridgeError,
} from '@/lib/cimulate/types';
import { resourceRoutes } from '@/route-paths';

const MAX_AUTH_LINK_KEY_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAuthError(error: unknown): boolean {
    if (!isRecord(error)) return false;
    return (
        error.type === 'auth' ||
        error.name === 'AgentforceAuthError' ||
        error.statusCode === 401 ||
        error.statusCode === 403
    );
}

export async function requestCimulateAuthLinkKey(): Promise<CimulateAuthLinkResult> {
    const sdk = window.CimulateMessaging;
    const getAuthLinkKey = sdk?.getAuthLinkKey;
    if (typeof getAuthLinkKey !== 'function') {
        return { success: false, error: { code: 'AUTH_LINK_UNAVAILABLE', retryable: true } };
    }

    try {
        const value: unknown = await getAuthLinkKey.call(sdk);
        if (typeof value !== 'string') {
            return { success: false, error: { code: 'AUTH_LINK_INVALID_RESPONSE', retryable: false } };
        }
        if (!value.trim() || value.length > MAX_AUTH_LINK_KEY_LENGTH) {
            return { success: false, error: { code: 'AUTH_LINK_INVALID_RESPONSE', retryable: false } };
        }
        return { success: true, authLinkKey: value };
    } catch (error) {
        return isAuthError(error)
            ? { success: false, error: { code: 'AUTH_LINK_AUTHORIZATION', retryable: false } }
            : { success: false, error: { code: 'AUTH_LINK_UNAVAILABLE', retryable: true } };
    }
}

const BRIDGE_ERROR_CODES = new Set<CimulateTokenBridgeError['code']>([
    'INVALID_REQUEST',
    'FORBIDDEN_ORIGIN',
    'METHOD_NOT_ALLOWED',
    'FEATURE_DISABLED',
    'SHOPPER_SESSION_REQUIRED',
    'TOKEN_BRIDGE_AUTHORIZATION',
    'TOKEN_BRIDGE_RATE_LIMITED',
    'TOKEN_BRIDGE_UNAVAILABLE',
]);

function parseBridgeResult(value: unknown): CimulateIdentityLinkResult | null {
    if (!isRecord(value) || typeof value.success !== 'boolean') return null;
    if (value.success === true) return { success: true };
    if (!isRecord(value.error) || !BRIDGE_ERROR_CODES.has(value.error.code as CimulateTokenBridgeError['code'])) {
        return null;
    }
    const code = value.error.code as CimulateTokenBridgeError['code'];
    const retryable = typeof value.error.retryable === 'boolean' ? value.error.retryable : undefined;
    const retryAfterSeconds =
        Number.isSafeInteger(value.error.retryAfterSeconds) &&
        Number(value.error.retryAfterSeconds) >= 0 &&
        Number(value.error.retryAfterSeconds) <= 3600
            ? Number(value.error.retryAfterSeconds)
            : undefined;
    return {
        success: false,
        error: {
            code,
            ...(retryable === undefined ? {} : { retryable }),
            ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        },
    };
}

export async function linkCimulateIdentity({
    fetchImpl = fetch,
}: {
    fetchImpl?: typeof fetch;
} = {}): Promise<CimulateIdentityLinkResult> {
    const authLinkResult = await requestCimulateAuthLinkKey();
    if (!authLinkResult.success) return authLinkResult;

    try {
        const bridgeResponse = await fetchImpl(resourceRoutes.cimulateTokenBridge, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_link_key: authLinkResult.authLinkKey }),
        });
        const result = parseBridgeResult(await bridgeResponse.json());
        return result ?? { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true } };
    } catch {
        return { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true } };
    }
}
