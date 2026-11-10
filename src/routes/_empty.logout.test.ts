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
import type { Route } from './+types/_empty.logout';

const { mockGetAuth, mockDestroyAuth, mockDestroyBasket, mockLogout } = vi.hoisted(() => ({
    mockGetAuth: vi.fn(),
    mockDestroyAuth: vi.fn(),
    mockDestroyBasket: vi.fn(),
    mockLogout: vi.fn(),
}));

vi.mock('@/middlewares/auth.server', () => ({ getAuth: mockGetAuth, destroyAuth: mockDestroyAuth }));
vi.mock('@/middlewares/basket.server', () => ({ destroyBasket: mockDestroyBasket }));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: () => ({ auth: { logout: mockLogout } }) }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    clearPasswordlessEmailCookie: () => Promise.resolve('cc-pwdless-email=; Max-Age=0'),
    clearPasswordResetEmailCookie: () => Promise.resolve('cc-pwreset-email=; Max-Age=0'),
}));

import { action } from './_empty.logout';

const runLogout = () =>
    action({ context: {}, request: new Request('http://localhost/logout', { method: 'POST' }) } as Route.ActionArgs);

describe('logout action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAuth.mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });
        mockLogout.mockResolvedValue(undefined);
    });

    it('destroys the session and redirects home', async () => {
        const response = await runLogout();

        expect(mockLogout).toHaveBeenCalledWith({ accessToken: 'access', refreshToken: 'refresh' });
        expect(mockDestroyAuth).toHaveBeenCalled();
        expect(mockDestroyBasket).toHaveBeenCalled();
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/');
    });

    it('clears both remembered magic-link emails', async () => {
        const response = await runLogout();

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('cc-pwdless-email=; Max-Age=0');
        expect(setCookie).toContain('cc-pwreset-email=; Max-Age=0');
    });

    it('still clears the remembered emails when SLAS logout fails', async () => {
        mockLogout.mockRejectedValue(new Error('SLAS down'));

        const response = await runLogout();

        expect(mockDestroyAuth).toHaveBeenCalled();
        expect(response.headers.get('Set-Cookie')).toContain('cc-pwdless-email=; Max-Age=0');
    });
});
