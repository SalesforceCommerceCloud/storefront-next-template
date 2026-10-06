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
import type { Route } from './+types/resource.cimulate-token-bridge';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { resolveRequestOrigin } from '@/lib/origin';
import { isCimulateEnabled, resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { bridgeCimulateToken } from '@/lib/cimulate/token-bridge.server';
import type { CimulateTokenBridgeErrorCode, CimulateTokenBridgeResult } from '@/lib/cimulate/types';

const JSON_NO_STORE_HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } as const;

function response(body: CimulateTokenBridgeResult, status = 200, headers?: HeadersInit): Response {
    return Response.json(body, { status, headers: { ...JSON_NO_STORE_HEADERS, ...headers } });
}

function error(code: CimulateTokenBridgeErrorCode, status: number): Response {
    return response({ success: false, error: { code } }, status);
}

function isSameOrigin(request: Request): boolean {
    let publicOrigin: string;
    let requestOrigin: string;
    try {
        publicOrigin = new URL(resolveRequestOrigin(request) ?? request.url).origin;
        requestOrigin = new URL(request.url).origin;
    } catch {
        return false;
    }

    const source = request.headers.get('Origin') ?? request.headers.get('Referer');
    if (!source) return false;
    try {
        const sourceOrigin = new URL(source).origin;
        return sourceOrigin === publicOrigin || sourceOrigin === requestOrigin;
    } catch {
        return false;
    }
}

export function loader(): Response {
    return response({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { Allow: 'POST' });
}

/**
 * Exchanges a single-use AuthLink key using the server-side shopper session.
 *
 * @env AGENT_MYDOMAIN — Optional feature environment variable containing the Core
 * My Domain hostname. Example: `example.my.salesforce.com`.
 * @env AGENT_MYDOMAIN_ALLOWED_HOST — Optional exact hostname that permits a non-public
 * Core My Domain for controlled environments. Example: `example.internal.salesforce.com`.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return response({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { Allow: 'POST' });
    }
    if (!isSameOrigin(request)) return error('FORBIDDEN_ORIGIN', 403);
    const shopperAgent = resolveShopperAgentConfig(getConfig(context));
    if (!isCimulateEnabled(shopperAgent?.enabled)) return error('FEATURE_DISABLED', 404);
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return error('INVALID_REQUEST', 400);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return error('INVALID_REQUEST', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('INVALID_REQUEST', 400);
    const record = body as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'auth_link_key')) {
        return error('INVALID_REQUEST', 400);
    }
    if (typeof record.auth_link_key !== 'string') return error('INVALID_REQUEST', 400);
    const authLinkKey = record.auth_link_key;
    if (!authLinkKey.trim() || authLinkKey.length > 4096) return error('INVALID_REQUEST', 400);

    let auth: ReturnType<typeof getAuth>;
    try {
        auth = getAuth(context);
    } catch {
        return error('SHOPPER_SESSION_REQUIRED', 401);
    }
    if (!auth.accessToken) return error('SHOPPER_SESSION_REQUIRED', 401);

    const result = await bridgeCimulateToken(
        {
            authLinkKey,
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
            idToken: auth.idToken,
            myDomain: process.env.AGENT_MYDOMAIN,
            allowedHost: process.env.AGENT_MYDOMAIN_ALLOWED_HOST,
        },
        { logger: getLogger(context) }
    );
    if (result.success) return response(result);

    const statuses: Record<CimulateTokenBridgeErrorCode, number> = {
        INVALID_REQUEST: 400,
        FORBIDDEN_ORIGIN: 403,
        METHOD_NOT_ALLOWED: 405,
        FEATURE_DISABLED: 404,
        SHOPPER_SESSION_REQUIRED: 401,
        TOKEN_BRIDGE_AUTHORIZATION: 401,
        TOKEN_BRIDGE_RATE_LIMITED: 429,
        TOKEN_BRIDGE_UNAVAILABLE: 503,
    };
    return response(result, statuses[result.error.code]);
}
