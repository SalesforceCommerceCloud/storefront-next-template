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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { ApiError, AuthTokenInvalidError } from '@/scapi';
import { getAuth } from '@/middlewares/auth.server';
import { getLoginEmailFromToken } from '@/middlewares/auth.utils';
import { createApiClients } from '@/lib/api-clients.server';
import { loader } from './resource.passkey-status';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({ features: { passkey: { enabled: true } } })),
}));
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));
vi.mock('@/middlewares/auth.utils', () => ({
    getLoginEmailFromToken: vi.fn(),
}));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockGetAuth = vi.mocked(getAuth);
const mockGetConfig = vi.mocked(getConfig);
const mockGetLoginEmailFromToken = vi.mocked(getLoginEmailFromToken);
const mockCreateApiClients = vi.mocked(createApiClients);

describe('resource.passkey-status loader', () => {
    const context = new RouterContextProvider();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: true } } } as never);
        mockGetLoginEmailFromToken.mockReturnValue('shopper@example.com');
    });

    const buildArgs = () => ({ context }) as never;

    it('throws a 404 Response when the passkey feature is disabled', async () => {
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: false } } } as never);

        await expect(loader(buildArgs())).rejects.toMatchObject({ status: 404 });
        expect(mockGetAuth).not.toHaveBeenCalled();
    });

    it('returns hasPasskey: false without calling the API for a guest', async () => {
        mockGetAuth.mockReturnValue({ userType: 'guest', accessToken: 'token' } as never);
        const result = await loader(buildArgs());

        expect(result).toEqual({ hasPasskey: false });
        expect(mockCreateApiClients).not.toHaveBeenCalled();
    });

    it('returns hasPasskey: true when the shopper has registered credentials', async () => {
        mockGetAuth.mockReturnValue({ userType: 'registered', accessToken: 'token' } as never);
        const getPasskeyUser = vi.fn().mockResolvedValue({ data: { credentials: [{ credentialId: 'c1' }] } });
        mockCreateApiClients.mockReturnValue({ auth: { webAuthn: { getPasskeyUser } } } as never);

        const result = await loader(buildArgs());

        expect(result).toEqual({ hasPasskey: true });
    });

    const buildApiError = (status: number) =>
        new ApiError({
            status,
            statusText: '',
            headers: new Headers(),
            body: { type: '', title: '', detail: '' },
            rawBody: '',
            url: 'https://example.com',
            method: 'GET',
        });

    it('returns hasPasskey: false (no error) on a 404 — the normal no-passkey-yet state', async () => {
        mockGetAuth.mockReturnValue({ userType: 'registered', accessToken: 'token' } as never);
        const getPasskeyUser = vi.fn().mockRejectedValue(buildApiError(404));
        mockCreateApiClients.mockReturnValue({ auth: { webAuthn: { getPasskeyUser } } } as never);

        const result = await loader(buildArgs());

        expect(result).toEqual({ hasPasskey: false });
    });

    it('returns { hasPasskey: false, error: true } for a generic non-404 API error', async () => {
        mockGetAuth.mockReturnValue({ userType: 'registered', accessToken: 'token' } as never);
        const getPasskeyUser = vi.fn().mockRejectedValue(buildApiError(500));
        mockCreateApiClients.mockReturnValue({ auth: { webAuthn: { getPasskeyUser } } } as never);

        const result = await loader(buildArgs());

        expect(result).toEqual({ hasPasskey: false, error: true });
    });

    // getPasskeyUser is Bearer-authenticated, so a 401 there already fired onAuthTokenInvalid
    // and flagged the auth middleware's recovery sentinel before throwing. Swallowing it into
    // { error: true } here would let this loader return normally while the sentinel still
    // forces a recovery redirect behind its back — the loader must re-throw so the standard
    // recovery path owns the outcome instead.
    it('re-throws AuthTokenInvalidError instead of swallowing it into { error: true }', async () => {
        mockGetAuth.mockReturnValue({ userType: 'registered', accessToken: 'token' } as never);
        const getPasskeyUser = vi.fn().mockRejectedValue(new AuthTokenInvalidError());
        mockCreateApiClients.mockReturnValue({ auth: { webAuthn: { getPasskeyUser } } } as never);

        await expect(loader(buildArgs())).rejects.toBeInstanceOf(AuthTokenInvalidError);
    });
});
