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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { usePasskeyRegistration } from './use-passkey-registration';
import type { PublicSessionData } from '@/lib/api/types';
import type { PasskeyStatusData } from '@/routes/resource.passkey-status';

const mockOpenModal = vi.fn();
vi.mock('@/providers/passkey-registration', () => ({
    usePasskeyRegistrationContext: () => ({
        isOpen: false,
        openModal: mockOpenModal,
        closeModal: vi.fn(),
    }),
}));

let mockAuth: PublicSessionData | undefined;
vi.mock('@/providers/auth', () => ({
    useAuth: () => mockAuth,
}));

const mockToast = vi.fn();
const mockToastDismiss = vi.fn();
vi.mock('@/components/toast', () => ({
    toast: Object.assign((...args: unknown[]) => mockToast(...args), {
        dismiss: (...args: unknown[]) => mockToastDismiss(...args),
    }),
}));

/**
 * The hook reads passkey status with a plain `fetch('/resource/passkey-status')` and fires
 * the toast from that fetch's own `.then()`, so tests stub `global.fetch` and flush the
 * promise microtasks after mount rather than mocking a React Router fetcher.
 */
function stubFetchResolves(data: PasskeyStatusData | null, ok = true) {
    const fetchSpy = vi.fn().mockResolvedValue({
        ok,
        json: () => Promise.resolve(data),
    });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
}

// Lets the fetch `.then()` chain (and the toast fire it queues) run to completion.
async function flushFetch(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

// Current pathname returned by the mocked `useLocation`; drives the hook's checkout guard.
let mockPathname = '/account/overview';
vi.mock('react-router', () => ({
    useLocation: () => ({ pathname: mockPathname }),
}));

describe('usePasskeyRegistration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.sessionStorage.clear();
        mockAuth = undefined;
        mockPathname = '/account/overview';
        // Default: status resolves as "already has a passkey" so an incidental mount never
        // fires the toast; tests that exercise the toast override this explicitly.
        stubFetchResolves({ hasPasskey: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('loading passkey status', () => {
        it('loads passkey status for a registered user with an encUserId', async () => {
            const fetchSpy = stubFetchResolves({ hasPasskey: true });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/resource/passkey-status',
                expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
            );
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('does not load passkey status for a guest user', async () => {
            const fetchSpy = stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'guest' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('does not load passkey status when encUserId is missing', async () => {
            const fetchSpy = stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('does not load passkey status when auth is undefined', async () => {
            const fetchSpy = stubFetchResolves({ hasPasskey: false });
            mockAuth = undefined;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    describe('logout clears the upsell gate', () => {
        it('clears the session-storage gate when the user transitions away from registered', () => {
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            window.sessionStorage.setItem('passkeyUpsellShown', 'true');
            const { rerender } = renderHook(() => usePasskeyRegistration());

            expect(window.sessionStorage.getItem('passkeyUpsellShown')).toBe('true');

            mockAuth = undefined;
            act(() => rerender());

            expect(window.sessionStorage.getItem('passkeyUpsellShown')).toBeNull();
        });

        it('does not clear the session-storage gate while the user remains registered', () => {
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            window.sessionStorage.setItem('passkeyUpsellShown', 'true');
            const { rerender } = renderHook(() => usePasskeyRegistration());

            act(() => rerender());

            expect(window.sessionStorage.getItem('passkeyUpsellShown')).toBe('true');
        });

        it('clears the gate for a guest on mount so a stale flag from a prior session does not linger', () => {
            window.sessionStorage.setItem('passkeyUpsellShown', 'true');
            mockAuth = { userType: 'guest' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());

            expect(window.sessionStorage.getItem('passkeyUpsellShown')).toBeNull();
        });

        it('dismisses the upsell toast by id when the user transitions away from registered', () => {
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            const { rerender } = renderHook(() => usePasskeyRegistration());

            expect(mockToastDismiss).not.toHaveBeenCalled();

            mockAuth = undefined;
            act(() => rerender());

            expect(mockToastDismiss).toHaveBeenCalledWith('passkey-upsell-toast');
        });

        it('does not dismiss the toast while the user remains registered', () => {
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            const { rerender } = renderHook(() => usePasskeyRegistration());

            act(() => rerender());

            expect(mockToastDismiss).not.toHaveBeenCalled();
        });
    });

    describe('upsell toast', () => {
        it('fires the toast when the user has no passkey and the browser supports WebAuthn', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).toHaveBeenCalledTimes(1);
            expect(mockToast).toHaveBeenCalledWith(
                'Set up faster sign-in',
                expect.objectContaining({
                    id: 'passkey-upsell-toast',
                    className: 'passkey-upsell-toast',
                    closeButton: true,
                    duration: 8000,
                    position: 'top-center',
                })
            );
        });

        it('does not fire the toast when the user already has a passkey', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves({ hasPasskey: true });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast when the status check reports an error', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves({ hasPasskey: false, error: true });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast when the status request is not ok', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves(null, false);
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast and does not throw when the status request rejects', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast when the browser does not support WebAuthn', async () => {
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast when the browser lacks parseCreationOptionsFromJSON (e.g. Safari 17, Chrome <129)', async () => {
            vi.stubGlobal('PublicKeyCredential', {});
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('does not fire the toast when the session-storage gate is already set', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            window.sessionStorage.setItem('passkeyUpsellShown', 'true');
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('sets the session-storage gate after firing so a remount does not re-fire it', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;

            const { unmount } = renderHook(() => usePasskeyRegistration());
            await flushFetch();
            expect(mockToast).toHaveBeenCalledTimes(1);
            unmount();

            renderHook(() => usePasskeyRegistration());
            await flushFetch();
            expect(mockToast).toHaveBeenCalledTimes(1);
            expect(window.sessionStorage.getItem('passkeyUpsellShown')).toBe('true');
        });

        it('calls openModal with the current user id when the toast action is clicked', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            stubFetchResolves({ hasPasskey: false });
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            const [, options] = mockToast.mock.calls[0];
            options.action.onClick();

            expect(mockOpenModal).toHaveBeenCalledWith('enc-user-1');
        });

        it('does not fire the toast while still on the checkout page', async () => {
            // The checkout "create account for later use" flow logs the shopper in via a
            // non-navigating OTP fetcher — root revalidates clientAuth to `registered` while
            // they're still looking at /checkout, before the order is placed.
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            mockPathname = '/checkout';
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            stubFetchResolves({ hasPasskey: false });
            renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();
        });

        it('fires the toast once the shopper navigates away from checkout to order confirmation', async () => {
            vi.stubGlobal('PublicKeyCredential', { parseCreationOptionsFromJSON: vi.fn() });
            mockPathname = '/checkout';
            mockAuth = { userType: 'registered', encUserId: 'enc-user-1' } as PublicSessionData;
            stubFetchResolves({ hasPasskey: false });
            const { rerender } = renderHook(() => usePasskeyRegistration());
            await flushFetch();

            expect(mockToast).not.toHaveBeenCalled();

            // The status was already fetched on checkout; leaving for order confirmation must
            // re-attempt the fire from the cached status without a second network call.
            mockPathname = '/order-confirmation/00000001';
            act(() => rerender());

            expect(mockToast).toHaveBeenCalledTimes(1);
        });
    });
});
