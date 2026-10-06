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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkCimulateIdentity, requestCimulateAuthLinkKey } from './cimulate-identity-link';
import { resourceRoutes } from '@/route-paths';

describe('requestCimulateAuthLinkKey', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('calls the public SDK exactly once and returns its bounded key', async () => {
        const sdk = {
            marker: 'sdk-context',
            getAuthLinkKey: vi.fn(function (this: { marker: string }) {
                if (this.marker !== 'sdk-context') throw new Error('lost SDK receiver');
                return Promise.resolve(' single-use-key ');
            }),
        };
        vi.stubGlobal('CimulateMessaging', sdk);
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('must not fetch')))
        );
        const storageSpy = vi.spyOn(Storage.prototype, 'getItem');

        await expect(requestCimulateAuthLinkKey()).resolves.toEqual({ success: true, authLinkKey: ' single-use-key ' });
        expect(sdk.getAuthLinkKey).toHaveBeenCalledTimes(1);
        expect(fetch).not.toHaveBeenCalled();
        expect(storageSpy).not.toHaveBeenCalled();
        storageSpy.mockRestore();
    });

    it.each([
        [undefined, 'AUTH_LINK_UNAVAILABLE', true],
        [{}, 'AUTH_LINK_UNAVAILABLE', true],
        [{ getAuthLinkKey: vi.fn().mockResolvedValue(42) }, 'AUTH_LINK_INVALID_RESPONSE', false],
        [{ getAuthLinkKey: vi.fn().mockResolvedValue('   ') }, 'AUTH_LINK_INVALID_RESPONSE', false],
        [{ getAuthLinkKey: vi.fn().mockResolvedValue('x'.repeat(4097)) }, 'AUTH_LINK_INVALID_RESPONSE', false],
        [
            { getAuthLinkKey: vi.fn().mockRejectedValue(new Error('secret raw SDK body')) },
            'AUTH_LINK_UNAVAILABLE',
            true,
        ],
        [
            // @cimulate/agentforce-sdk 1.6 AgentforceAuthError contract.
            { getAuthLinkKey: vi.fn().mockRejectedValue({ type: 'auth', responseBody: 'secret' }) },
            'AUTH_LINK_AUTHORIZATION',
            false,
        ],
        [
            // @cimulate/agentforce-sdk 1.6 AgentforceAuthError contract.
            { getAuthLinkKey: vi.fn().mockRejectedValue({ name: 'AgentforceAuthError' }) },
            'AUTH_LINK_AUTHORIZATION',
            false,
        ],
        [
            // @cimulate/agentforce-sdk 1.6 AgentforceApiError contract.
            { getAuthLinkKey: vi.fn().mockRejectedValue({ statusCode: 403 }) },
            'AUTH_LINK_AUTHORIZATION',
            false,
        ],
    ])('returns a stable redacted error for %j', async (sdk, code, retryable) => {
        vi.stubGlobal('CimulateMessaging', sdk);
        const result = await requestCimulateAuthLinkKey();
        expect(result).toEqual({ success: false, error: { code, retryable } });
        expect(JSON.stringify(result)).not.toContain('secret raw SDK body');
        expect(JSON.stringify(result)).not.toContain('responseBody');
    });
});

describe('linkCimulateIdentity', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('obtains one opaque key then posts only that key to the same-origin bridge', async () => {
        const getAuthLinkKey = vi.fn().mockResolvedValue(' opaque-key\t');
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } }));
        vi.stubGlobal('CimulateMessaging', { getAuthLinkKey });

        await expect(linkCimulateIdentity({ fetchImpl })).resolves.toEqual({ success: true });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(resourceRoutes.cimulateTokenBridge, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_link_key: ' opaque-key\t' }),
        });
    });

    it('does not call Token Bridge when AuthLink fails', async () => {
        vi.stubGlobal('CimulateMessaging', {
            getAuthLinkKey: vi.fn().mockRejectedValue({ statusCode: 401, responseBody: 'secret' }),
        });
        const fetchImpl = vi.fn();
        await expect(linkCimulateIdentity({ fetchImpl })).resolves.toEqual({
            success: false,
            error: { code: 'AUTH_LINK_AUTHORIZATION', retryable: false },
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('returns the stable bridge error without exposing arbitrary response fields', async () => {
        vi.stubGlobal('CimulateMessaging', { getAuthLinkKey: vi.fn().mockResolvedValue('key') });
        const fetchImpl = vi.fn().mockResolvedValue(
            Response.json({
                success: false,
                error: { code: 'TOKEN_BRIDGE_RATE_LIMITED', retryable: true, retryAfterSeconds: 3 },
                raw: 'secret',
            })
        );
        const result = await linkCimulateIdentity({ fetchImpl });
        expect(result).toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_RATE_LIMITED', retryable: true, retryAfterSeconds: 3 },
        });
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    it('redacts malformed and rejected bridge responses', async () => {
        vi.stubGlobal('CimulateMessaging', { getAuthLinkKey: vi.fn().mockResolvedValue('key') });
        const fetchImpl = vi.fn().mockRejectedValue(new Error('secret network failure'));
        const result = await linkCimulateIdentity({ fetchImpl });
        expect(result).toEqual({
            success: false,
            error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true },
        });
        expect(JSON.stringify(result)).not.toContain('secret network failure');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
