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
import { RouterContextProvider } from 'react-router';
import { action } from './_empty.logout';
import { getAuth, destroyAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { destroyBasket } from '@/middlewares/basket.server';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { prepareStoreSelectionForLogout } from '@/extensions/store-locator/lib/store-selection.server';

vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn(), destroyAuth: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/middlewares/basket.server', () => ({ destroyBasket: vi.fn() }));
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({ prepareStoreSelectionForLogout: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ warn: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    clearPasswordlessEmailCookie: () => Promise.resolve('cc-pwdless-email=; Max-Age=0'),
    clearPasswordResetEmailCookie: () => Promise.resolve('cc-pwreset-email=; Max-Age=0'),
}));
const logout = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    logout.mockResolvedValue({});
    vi.mocked(getAuth).mockReturnValue({ accessToken: 'registered-access', refreshToken: 'registered-refresh' });
    vi.mocked(createApiClients).mockReturnValue({ auth: { logout } } as unknown as ReturnType<typeof createApiClients>);
});

describe('logout reconciliation', () => {
    it.each([false, true])('keeps auth and basket destruction when SLAS logout fails=%s', async (fails) => {
        if (fails) logout.mockRejectedValueOnce(new Error('SLAS unavailable'));
        const context = new RouterContextProvider();
        const response = await action({ context } as unknown as Parameters<typeof action>[0]);
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/');
        expect(response.headers.get('Set-Cookie')).toContain('cc-pwdless-email=; Max-Age=0');
        expect(response.headers.get('Set-Cookie')).toContain('cc-pwreset-email=; Max-Age=0');
        expect(logout).toHaveBeenCalledWith({ accessToken: 'registered-access', refreshToken: 'registered-refresh' });
        // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
        expect(prepareStoreSelectionForLogout).toHaveBeenCalledWith(context);
        expect(destroyAuth).toHaveBeenCalledWith(context);
        expect(destroyBasket).toHaveBeenCalledWith(context);
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        expect(vi.mocked(prepareStoreSelectionForLogout).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(destroyAuth).mock.invocationCallOrder[0]
        );
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    });
});
