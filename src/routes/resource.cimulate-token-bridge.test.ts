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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { bridgeCimulateToken } from '@/lib/cimulate/token-bridge.server';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/cimulate/token-bridge.server');

const origin = 'https://store.example.com';
const context = new RouterContextProvider();
const mockGetConfig = vi.mocked(getConfig);
const mockGetAuth = vi.mocked(getAuth);
const mockBridge = vi.mocked(bridgeCimulateToken);

function args(body: string, options: { origin?: string | null; contentType?: string; headers?: HeadersInit } = {}) {
    const headers = new Headers(options.headers);
    if (options.origin !== null) headers.set('Origin', options.origin ?? origin);
    headers.set('Content-Type', options.contentType ?? 'application/json');
    const request = new Request(`${origin}/resource/cimulate-token-bridge`, { method: 'POST', headers, body });
    return {
        request,
        context,
        url: new URL(request.url),
        params: {},
        pattern: '/resource/cimulate-token-bridge',
    };
}

async function json(response: Response) {
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    return response.json();
}

describe('resource.cimulate-token-bridge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('AGENT_MYDOMAIN', 'acme.my.salesforce.com');
        vi.stubEnv('AGENT_MYDOMAIN_ALLOWED_HOST', '');
        mockGetConfig.mockReturnValue({ cimulateAgent: { enabled: true } } as never);
        mockGetAuth.mockReturnValue({
            accessToken: 'access',
            refreshToken: 'refresh',
            idToken: 'id-token',
            userType: 'registered',
        } as never);
        mockBridge.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('loader returns JSON 405 with Allow POST and no-store', async () => {
        const { loader } = await import('./resource.cimulate-token-bridge');
        const response = loader();
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
        expect(await json(response)).toEqual({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
    });

    it('action rejects non-POST methods with Allow POST and no-store', async () => {
        const { action } = await import('./resource.cimulate-token-bridge');
        const routeArgs = args('{"auth_link_key":"key"}');
        routeArgs.request = new Request(routeArgs.request.url, { method: 'PUT', headers: routeArgs.request.headers });
        const response = await action(routeArgs as never);
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
        expect(await json(response)).toEqual({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
    });

    it.each([
        ['cross-origin', args('{"auth_link_key":"key"}', { origin: 'https://evil.test' })],
        ['missing origin and referer', args('{"auth_link_key":"key"}', { origin: null })],
    ])('rejects %s requests', async (_name, routeArgs) => {
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(routeArgs as never);
        expect(response.status).toBe(403);
        expect(await json(response)).toEqual({ success: false, error: { code: 'FORBIDDEN_ORIGIN' } });
    });

    it('accepts MRT forwarded public origin', async () => {
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(
            args('{"auth_link_key":"key"}', {
                origin: 'https://public.example.com',
                headers: {
                    Host: 'internal.lambda.amazonaws.com',
                    'X-Forwarded-Host': 'public.example.com',
                    'X-Forwarded-Proto': 'https',
                },
            })
        );
        expect(response.status).toBe(200);
    });

    it('rejects a disabled feature', async () => {
        mockGetConfig.mockReturnValue({ cimulateAgent: { enabled: false } } as never);
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(404);
        expect(await json(response)).toEqual({ success: false, error: { code: 'FEATURE_DISABLED' } });
    });

    it('does not treat the string false as enabled', async () => {
        mockGetConfig.mockReturnValue({ cimulateAgent: { enabled: 'false' } } as never);
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(404);
    });

    it.each([
        ['text/plain', '{"auth_link_key":"key"}'],
        ['application/json', 'not-json'],
        ['application/json', '[]'],
        ['application/json', '{}'],
        ['application/json', '{"auth_link_key":""}'],
        ['application/json', `{"auth_link_key":"${'x'.repeat(4097)}"}`],
        ['application/json', '{"auth_link_key":"key","refresh_token":"secret"}'],
        ['application/json', '{"auth_link_key":"key","slas_access_token":"secret"}'],
        ['application/json', '{"auth_link_key":"key","id_token":"secret"}'],
        ['application/json', '{"auth_link_key":"key","extra":true}'],
    ])('rejects invalid content type/body %s %s', async (contentType, body) => {
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args(body, { contentType }));
        expect(response.status).toBe(400);
        expect(await json(response)).toEqual({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(mockBridge).not.toHaveBeenCalled();
    });

    it('requires a server-side access token', async () => {
        mockGetAuth.mockReturnValue({ userType: 'guest' } as never);
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(401);
        expect(await json(response)).toEqual({ success: false, error: { code: 'SHOPPER_SESSION_REQUIRED' } });
    });

    it.each([
        [{ success: false, error: { code: 'INVALID_REQUEST', retryable: false } } as const, 400],
        [{ success: false, error: { code: 'TOKEN_BRIDGE_AUTHORIZATION', retryable: false } } as const, 401],
        [
            {
                success: false,
                error: { code: 'TOKEN_BRIDGE_RATE_LIMITED', retryable: true, retryAfterSeconds: 7 },
            } as const,
            429,
        ],
        [{ success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true } } as const, 503],
    ])('maps adapter result %# to status %s with no-store', async (adapterResult, status) => {
        mockBridge.mockResolvedValue(adapterResult);
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(status);
        expect(await json(response)).toEqual(adapterResult);
    });

    it('maps getAuth initialization failure to a stable shopper-session error', async () => {
        mockGetAuth.mockImplementation(() => {
            throw new Error('secret auth initialization detail');
        });
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(401);
        expect(await json(response)).toEqual({ success: false, error: { code: 'SHOPPER_SESSION_REQUIRED' } });
    });

    it('passes missing AGENT_MYDOMAIN to the adapter and returns its unavailable result', async () => {
        vi.unstubAllEnvs();
        mockBridge.mockImplementation(({ myDomain }) =>
            Promise.resolve(
                myDomain
                    ? { success: true }
                    : { success: false, error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: false } }
            )
        );
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":"key"}'));
        expect(response.status).toBe(503);
        expect(await json(response)).toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: false },
        });
        expect(mockBridge).toHaveBeenCalledWith(
            expect.objectContaining({ myDomain: undefined }),
            expect.objectContaining({ logger: expect.anything() })
        );
    });

    it.each([
        ['registered', 'refresh', 'id-token'],
        ['guest', undefined, undefined],
    ])('bridges a %s shopper using only server auth', async (userType, refreshToken, idToken) => {
        mockGetAuth.mockReturnValue({ accessToken: 'access', refreshToken, idToken, userType } as never);
        const { action } = await import('./resource.cimulate-token-bridge');
        const response = await action(args('{"auth_link_key":" key "}'));
        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ success: true });
        expect(mockBridge).toHaveBeenCalledWith(
            {
                authLinkKey: ' key ',
                accessToken: 'access',
                refreshToken,
                idToken,
                myDomain: 'acme.my.salesforce.com',
                allowedHost: '',
            },
            expect.objectContaining({ logger: expect.anything() })
        );
    });
});
