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
import type { Logger } from '@/lib/logger';
import { getTokenBridgeUrl } from './salesforce-domains.server';
import type { CimulateTokenBridgeResult } from './types';

interface TokenBridgeInput {
    authLinkKey: string;
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    myDomain?: string;
    allowedHost?: string;
}

interface TokenBridgeOptions {
    fetchImpl?: typeof fetch;
    logger?: Logger;
}

function boundedRetryAfter(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 3600 ? seconds : undefined;
}

/**
 * Log Core's raw downstream response for a failed Token Bridge exchange.
 *
 * Server-side only — never forwarded to the browser, which only ever sees the masked
 * `CimulateTokenBridgeErrorCode`. Never pass request headers/tokens here.
 */
async function logBridgeErrorResponse(logger: Logger | undefined, response: Response): Promise<void> {
    if (!logger) return;
    let body: unknown;
    try {
        body = await response.clone().text();
    } catch (readError) {
        logger.error('Cimulate token bridge: failed to read downstream error response body', {
            status: response.status,
            error: readError,
        });
        return;
    }
    logger.error('Cimulate token bridge: downstream error response', {
        status: response.status,
        statusText: response.statusText,
        body,
    });
}

export async function bridgeCimulateToken(
    input: TokenBridgeInput,
    { fetchImpl = fetch, logger }: TokenBridgeOptions = {}
): Promise<CimulateTokenBridgeResult> {
    const url = getTokenBridgeUrl(input.myDomain, input.allowedHost);
    if (!url) return { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: false } };

    try {
        const refreshToken = input.refreshToken?.trim();
        const idToken = input.idToken?.trim();
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `SLAS ${input.accessToken}` },
            body: JSON.stringify({
                auth_link_key: input.authLinkKey,
                ...(refreshToken ? { refresh_token: refreshToken } : {}),
                ...(idToken ? { id_token: idToken } : {}),
            }),
            redirect: 'error',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return { success: true };
        await logBridgeErrorResponse(logger, response);
        if (response.status === 400) {
            return { success: false, error: { code: 'INVALID_REQUEST', retryable: false } };
        }
        if (response.status === 401 || response.status === 403) {
            return { success: false, error: { code: 'TOKEN_BRIDGE_AUTHORIZATION', retryable: false } };
        }
        if (response.status === 429) {
            const retryAfterSeconds = boundedRetryAfter(response.headers.get('Retry-After'));
            return {
                success: false,
                error: {
                    code: 'TOKEN_BRIDGE_RATE_LIMITED',
                    retryable: true,
                    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
                },
            };
        }
        const retryable = [500, 502, 503, 504].includes(response.status);
        return { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable } };
    } catch (fetchError) {
        logger?.error('Cimulate token bridge: request to downstream identity bridge failed', {
            error: fetchError,
        });
        return { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true } };
    }
}
