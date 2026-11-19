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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVerifiedLoginFromAccessToken } from './verified-session-login.server';
import { validateSlasCallbackToken } from '@/lib/notify/notify.server';

vi.mock('@/lib/notify/notify.server');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const b64u = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** Unsigned shape-only token: the signature check is mocked, only the claims are read for real. */
const tokenWith = (isb: string) => `${b64u({ alg: 'ES256' })}.${b64u({ isb })}.sig`;

describe('getVerifiedLoginFromAccessToken', () => {
    const context = {} as any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(validateSlasCallbackToken).mockResolvedValue({} as any);
    });

    it('returns the login of a token whose signature verifies', async () => {
        const token = tokenWith('uido:ecom::upn:me@example.com::gcid:g::rcid:r::chid:site');

        await expect(getVerifiedLoginFromAccessToken(context, token)).resolves.toBe('me@example.com');
        expect(validateSlasCallbackToken).toHaveBeenCalledWith(context, token);
    });

    it('returns null, without reading claims, when the signature does not verify (forged token)', async () => {
        vi.mocked(validateSlasCallbackToken).mockRejectedValue(new Error('signature verification failed'));
        const forged = tokenWith('uido:ecom::upn:victim@example.com::gcid:g::rcid:r::chid:site');

        await expect(getVerifiedLoginFromAccessToken(context, forged)).resolves.toBeNull();
    });

    it('returns null for a verified guest token, which has no login', async () => {
        const guest = tokenWith('uido:slas::upn:Guest::uidn:Guest User::gcid:g::chid:site');

        await expect(getVerifiedLoginFromAccessToken(context, guest)).resolves.toBeNull();
    });

    it('returns null and skips verification when there is no token', async () => {
        await expect(getVerifiedLoginFromAccessToken(context, undefined)).resolves.toBeNull();
        expect(validateSlasCallbackToken).not.toHaveBeenCalled();
    });

    it('fails closed when the JWKS cannot be reached', async () => {
        vi.mocked(validateSlasCallbackToken).mockRejectedValue(new Error('fetch failed'));

        await expect(
            getVerifiedLoginFromAccessToken(context, tokenWith('uido:ecom::upn:me@example.com::rcid:r'))
        ).resolves.toBeNull();
    });
});
