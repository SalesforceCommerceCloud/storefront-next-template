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
import { describe, expect, it, vi } from 'vitest';
import { bridgeCimulateToken } from './token-bridge.server';

const input = {
    authLinkKey: 'auth-key',
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    idToken: 'id-secret',
    myDomain: 'acme.my.salesforce.com',
};

describe('bridgeCimulateToken', () => {
    it('performs exactly one hardened POST and returns no upstream body', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('sensitive upstream body', { status: 200 }));
        await expect(bridgeCimulateToken(input, { fetchImpl })).resolves.toEqual({ success: true });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith('https://acme.my.salesforce.com/agent/identity/bridge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'SLAS access-secret' },
            body: JSON.stringify({
                auth_link_key: 'auth-key',
                refresh_token: 'refresh-secret',
                id_token: 'id-secret',
            }),
            redirect: 'error',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: expect.any(AbortSignal),
        });
    });

    it('omits empty optional shopper tokens', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        await bridgeCimulateToken({ ...input, refreshToken: ' ', idToken: ' ' }, { fetchImpl });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ auth_link_key: 'auth-key' });
    });

    it('uses the configured exact-host override', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        await bridgeCimulateToken(
            {
                ...input,
                myDomain: 'orgfarm-123.test2.my.pc-rnd.salesforce.com',
                allowedHost: 'orgfarm-123.test2.my.pc-rnd.salesforce.com',
            },
            { fetchImpl }
        );
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://orgfarm-123.test2.my.pc-rnd.salesforce.com/agent/identity/bridge',
            expect.anything()
        );
    });

    it.each([
        [400, 'INVALID_REQUEST', false],
        [401, 'TOKEN_BRIDGE_AUTHORIZATION', false],
        [403, 'TOKEN_BRIDGE_AUTHORIZATION', false],
        [429, 'TOKEN_BRIDGE_RATE_LIMITED', true],
        [500, 'TOKEN_BRIDGE_UNAVAILABLE', true],
        [502, 'TOKEN_BRIDGE_UNAVAILABLE', true],
        [503, 'TOKEN_BRIDGE_UNAVAILABLE', true],
        [504, 'TOKEN_BRIDGE_UNAVAILABLE', true],
        [418, 'TOKEN_BRIDGE_UNAVAILABLE', false],
    ])('maps upstream %s without leaking its body', async (status, code, retryable) => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(
                new Response('raw-secret-body', { status, headers: status === 429 ? { 'Retry-After': '12' } : {} })
            );
        const result = await bridgeCimulateToken(input, { fetchImpl });
        expect(result).toEqual({
            success: false,
            error: { code, retryable, ...(status === 429 ? { retryAfterSeconds: 12 } : {}) },
        });
        expect(JSON.stringify(result)).not.toContain('raw-secret-body');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['-1'],
        ['1.5'],
        ['3601'],
        ['not-a-number'],
    ])('omits invalid or out-of-range Retry-After value %s', async (retryAfter) => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(null, {
                status: 429,
                headers: { 'Retry-After': retryAfter },
            })
        );

        await expect(bridgeCimulateToken(input, { fetchImpl })).resolves.toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_RATE_LIMITED', retryable: true },
        });
    });

    it('redacts network failures and does not retry', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('access-secret auth-key acme.my.salesforce.com'));
        const result = await bridgeCimulateToken(input, { fetchImpl });
        expect(result).toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true },
        });
        expect(JSON.stringify(result)).not.toContain('access-secret');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('classifies timeout rejection as retryable and performs exactly one fetch', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new DOMException('timed out with secret', 'TimeoutError'));
        await expect(bridgeCimulateToken(input, { fetchImpl })).resolves.toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true },
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
});
