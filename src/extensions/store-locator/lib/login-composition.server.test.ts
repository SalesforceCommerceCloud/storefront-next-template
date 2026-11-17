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
import { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { completeRegisteredLogin } from '@/lib/api/auth/complete-registered-login.server';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { loggerContext } from '@/lib/logger.server';
import type { Logger } from '@/lib/logger';
import { updateAuth } from '@/middlewares/auth.server';
import { buildMockTokenResponse } from '@/test-utils/auth';
import {
    assertStoreSelectionLoginSession,
    prepareStoreSelectionForLogin,
    reconcileStoreAfterAuthentication,
} from './store-selection.server';

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ userType: 'registered', customerId: 'customer-1', usid: 'usid-1' })),
    updateAuth: vi.fn(),
}));
vi.mock('./store-selection.server', () => ({
    prepareStoreSelectionForLogin: vi.fn(),
    assertStoreSelectionLoginSession: vi.fn(),
    reconcileStoreAfterAuthentication: vi.fn(),
}));

function createContext() {
    const context = new RouterContextProvider();
    context.set(loggerContext, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger);
    context.set(siteContext, { site: { id: 'RefArch' }, locale: { id: 'en-US' } } as never);
    return context;
}

describe('login composition: reconcile-then-transfer', () => {
    it('captures guest intent, authenticates, publishes credentials, then reconciles before resolving', async () => {
        const order: string[] = [];
        vi.mocked(prepareStoreSelectionForLogin).mockImplementation(() => {
            order.push('prepare');
            return Promise.resolve(true);
        });
        vi.mocked(assertStoreSelectionLoginSession).mockImplementation(() => {
            order.push('assert');
        });
        vi.mocked(updateAuth).mockImplementation(() => {
            order.push('updateAuth');
        });
        vi.mocked(reconcileStoreAfterAuthentication).mockImplementation(async () => {
            await Promise.resolve();
            order.push('reconcile');
        });
        const response = buildMockTokenResponse();

        const result = await completeRegisteredLogin(createContext(), () => {
            order.push('authenticate');
            return Promise.resolve(response);
        });
        // The caller transfers the basket only after this resolves, so reconcile must already be done.
        order.push('transfer');

        expect(result).toBe(response);
        expect(order).toEqual(['prepare', 'authenticate', 'assert', 'updateAuth', 'reconcile', 'transfer']);
        expect(reconcileStoreAfterAuthentication).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('surfaces a reconciliation failure as a commerce-context error so the basket is never transferred', async () => {
        vi.mocked(prepareStoreSelectionForLogin).mockResolvedValue(false);
        vi.mocked(reconcileStoreAfterAuthentication).mockRejectedValue(new Error('SCAPI down'));

        await expect(
            completeRegisteredLogin(createContext(), () => Promise.resolve(buildMockTokenResponse()))
        ).rejects.toMatchObject({ code: 'STORE_CONTEXT_UNAVAILABLE', status: 502 });
    });

    it('preserves the original commerce-context error code', async () => {
        vi.mocked(prepareStoreSelectionForLogin).mockResolvedValue(false);
        const error = new CommerceContextError('STORE_CONTEXT_UNAVAILABLE', 409);
        vi.mocked(reconcileStoreAfterAuthentication).mockRejectedValue(error);

        await expect(
            completeRegisteredLogin(createContext(), () => Promise.resolve(buildMockTokenResponse()))
        ).rejects.toBe(error);
    });
});
