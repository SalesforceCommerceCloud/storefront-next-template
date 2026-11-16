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
import type { ActionFunctionArgs } from 'react-router';
import { loginRegisteredUser } from './standard-login.server';
import { loginRegisteredUser as authLoginRegisteredUser, updateAuth } from '@/middlewares/auth.server';

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({
    assertStoreSelectionLoginSession: vi.fn(),
    prepareStoreSelectionForLogin: vi.fn(() => Promise.resolve(false)),
    reconcileStoreAfterAuthentication: vi.fn(() => Promise.resolve()),
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

vi.mock('@/middlewares/auth.server', () => ({
    loginRegisteredUser: vi.fn(),
    updateAuth: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({ t: (key: string) => key })),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockAuthLoginRegisteredUser = vi.mocked(authLoginRegisteredUser);
const mockUpdateAuth = vi.mocked(updateAuth);

describe('standard-login.server', () => {
    let mockContext: ActionFunctionArgs['context'];

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = {} as ActionFunctionArgs['context'];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('forwards the SLAS token response to updateAuth exactly once on success', async () => {
        // Acceptance criteria: each login call site issues exactly one session-persistence call
        // after the SLAS swap. userType, customerId, usid, and the refresh-token expiry cap are
        // all derived from the JWT inside updateAuth — no follow-up `userType: 'registered'`
        // call is needed (and adding one was the source of the in-request customerId drift bug).
        const mockTokenResponse = {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 1800,
            refresh_token_expires_in: 7200,
            usid: 'usid-1',
            customer_id: 'cust-1',
            id_token: 'id-token',
            token_type: 'Bearer' as const,
            enc_user_id: 'enc-user-id',
            idp_access_token: 'idp-token',
        };
        mockAuthLoginRegisteredUser.mockResolvedValue(mockTokenResponse as any);

        const result = await loginRegisteredUser(mockContext, { email: 'a@b.c', password: 'pw' });

        expect(result).toEqual({ success: true });
        expect(mockUpdateAuth).toHaveBeenCalledTimes(1);
        expect(mockUpdateAuth).toHaveBeenCalledWith(mockContext, mockTokenResponse);
    });

    it('does not call updateAuth on failure', async () => {
        mockAuthLoginRegisteredUser.mockRejectedValue(new Error('SLAS rejected'));

        const result = await loginRegisteredUser(mockContext, { email: 'a@b.c', password: 'pw' });

        expect(result.success).toBe(false);
        expect(mockUpdateAuth).not.toHaveBeenCalled();
    });
});
