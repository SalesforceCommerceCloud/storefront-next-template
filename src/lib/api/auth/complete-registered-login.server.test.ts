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
import { completeRegisteredLogin } from './complete-registered-login.server';
import { updateAuth } from '@/middlewares/auth.server';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import {
    assertStoreSelectionLoginSession,
    prepareStoreSelectionForLogin,
    reconcileStoreAfterAuthentication,
} from '@/extensions/store-locator/lib/store-selection.server';
import { StoreSelectionError } from '@/extensions/store-locator/lib/store-selection-error';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
import type { AuthResponse } from '@/scapi';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));
vi.mock('@/middlewares/auth.server', () => ({ updateAuth: vi.fn() }));
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({
    assertStoreSelectionLoginSession: vi.fn(),
    prepareStoreSelectionForLogin: vi.fn(),
    reconcileStoreAfterAuthentication: vi.fn(),
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

beforeEach(() => {
    vi.clearAllMocks();
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    vi.mocked(prepareStoreSelectionForLogin).mockResolvedValue(true);
    vi.mocked(assertStoreSelectionLoginSession).mockReset();
    vi.mocked(reconcileStoreAfterAuthentication).mockResolvedValue();
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
});

describe('shared login completion', () => {
    it('commits and returns the provider response', async () => {
        const ctx = new RouterContextProvider();
        const token = { access_token: 'registered-token' } as AuthResponse;

        expect(await completeRegisteredLogin(ctx, () => Promise.resolve(token))).toBe(token);
        expect(updateAuth).toHaveBeenCalledExactlyOnceWith(ctx, token);
        expect(logger.info).toHaveBeenCalledWith(
            'Authentication completed',
            expect.objectContaining({
                action: 'login',
                outcome: 'success',
            })
        );
    });

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    it('captures source baskets before credentials change and reconciles before the caller can transfer', async () => {
        const events: string[] = [];
        const ctx = new RouterContextProvider();
        const token = { access_token: 'registered-token' } as AuthResponse;
        vi.mocked(prepareStoreSelectionForLogin).mockImplementation(() => {
            events.push('source');
            return Promise.resolve(true);
        });
        vi.mocked(updateAuth).mockImplementation(() => {
            events.push('auth');
        });
        vi.mocked(assertStoreSelectionLoginSession).mockImplementation(() => {
            events.push('session gate');
        });
        vi.mocked(reconcileStoreAfterAuthentication).mockImplementation(() => {
            events.push('reconcile');
            return Promise.resolve();
        });
        await completeRegisteredLogin(ctx, () => {
            events.push('exchange');
            return Promise.resolve(token);
        });
        events.push('transfer');
        expect(events).toEqual(['source', 'exchange', 'session gate', 'auth', 'reconcile', 'transfer']);
        expect(reconcileStoreAfterAuthentication).toHaveBeenCalledWith(ctx, true);
    });

    it('does not publish credentials or transfer when the session migration gate rejects', async () => {
        const guard = new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
        vi.mocked(assertStoreSelectionLoginSession).mockImplementation(() => {
            throw guard;
        });
        const transfer = vi.fn();
        await expect(
            completeRegisteredLogin(new RouterContextProvider(), () => Promise.resolve({} as AuthResponse)).then(
                transfer
            )
        ).rejects.toBe(guard);
        expect(updateAuth).not.toHaveBeenCalled();
        expect(reconcileStoreAfterAuthentication).not.toHaveBeenCalled();
        expect(transfer).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('does not continue to transfer on a preview/consent handoff', async () => {
        const ctx = new RouterContextProvider();
        const guard = new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
        vi.mocked(reconcileStoreAfterAuthentication).mockRejectedValueOnce(guard);
        const transfer = vi.fn();
        await expect(
            completeRegisteredLogin(ctx, () => Promise.resolve({} as AuthResponse)).then(transfer)
        ).rejects.toBe(guard);
        expect(transfer).not.toHaveBeenCalled();
        expect(updateAuth).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledBefore(logger.warn);
    });

    it('does not exchange credentials when the guest-basket guard cannot be persisted', async () => {
        const failure = new Error('native guard unavailable');
        vi.mocked(prepareStoreSelectionForLogin).mockRejectedValueOnce(failure);
        const authenticate = vi.fn();
        await expect(completeRegisteredLogin(new RouterContextProvider(), authenticate)).rejects.toBe(failure);
        expect(authenticate).not.toHaveBeenCalled();
        expect(updateAuth).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    it('does not commit authentication when the exchange fails', async () => {
        await expect(
            completeRegisteredLogin(new RouterContextProvider(), () => Promise.reject(new Error('invalid credential')))
        ).rejects.toThrow('invalid credential');
        expect(updateAuth).not.toHaveBeenCalled();
        // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
        expect(reconcileStoreAfterAuthentication).not.toHaveBeenCalled();
    });
});
