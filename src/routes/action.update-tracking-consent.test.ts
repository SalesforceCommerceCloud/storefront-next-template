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
import { type ActionFunctionArgs, RouterContextProvider } from 'react-router';
import { action } from './action.update-tracking-consent';
import { refreshAccessToken, getAuth, updateAuth } from '@/middlewares/auth.server';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { TrackingConsent } from '@/types/tracking-consent';

// Mock dependencies
vi.mock('@/middlewares/auth.server');
vi.mock('@/middlewares/auth.utils');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockRefreshAccessToken = vi.mocked(refreshAccessToken);
const mockGetAuth = vi.mocked(getAuth);
const mockUpdateAuth = vi.mocked(updateAuth);
const mockIsTrackingConsentEnabled = vi.mocked(isTrackingConsentEnabled);

describe('action.update-tracking-consent', () => {
    let mockContextProvider: RouterContextProvider;
    const mockTokenResponse = {
        access_token: 'test-access-token',
        id_token: 'test-id-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        refresh_token_expires_in: 7200,
        token_type: 'Bearer' as const,
        usid: 'test-usid',
        customer_id: 'test-customer-id',
        enc_user_id: 'test-enc-user-id',
        idp_access_token: 'test-idp-access-token',
        dwsid: 'test-dwsid',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockContextProvider = new RouterContextProvider();
        // Default mocks
        mockIsTrackingConsentEnabled.mockReturnValue(true);
        mockGetAuth.mockReturnValue({ userType: 'guest', refreshToken: 'test-refresh-token' } as never);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const createActionArgs = (trackingConsent: string): ActionFunctionArgs => {
        const formData = new FormData();
        formData.append('trackingConsent', trackingConsent);

        return {
            request: new Request('http://localhost/action/update-tracking-consent', {
                method: 'POST',
                body: formData,
            }),
            url: new URL('http://localhost/action/update-tracking-consent'),
            params: {},
            context: mockContextProvider,
            pattern: '/action/update-tracking-consent',
        };
    };

    describe('successful updates', () => {
        it('keeps assisted DNT declined without refresh or ordinary session writers even when accepting is requested', async () => {
            mockGetAuth.mockReturnValue({
                authMode: 'trusted-agent',
                userType: 'registered',
                trackingConsent: TrackingConsent.Declined,
            });
            const response = await action(createActionArgs(TrackingConsent.Accepted));
            expect(await response.json()).toEqual({ success: true, trackingConsent: TrackingConsent.Declined });
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockUpdateAuth).not.toHaveBeenCalled();
        });
        it('should successfully update tracking consent to Accepted', async () => {
            mockRefreshAccessToken.mockResolvedValue(mockTokenResponse);

            const response = await action(createActionArgs(TrackingConsent.Accepted));

            expect(mockIsTrackingConsentEnabled).toHaveBeenCalledWith(mockContextProvider);
            expect(mockGetAuth).toHaveBeenCalledWith(mockContextProvider);
            expect(mockRefreshAccessToken).toHaveBeenCalledWith(mockContextProvider, 'test-refresh-token', {
                trackingConsent: TrackingConsent.Accepted,
            });
            expect(mockUpdateAuth).toHaveBeenCalledTimes(2);
            expect(mockUpdateAuth).toHaveBeenNthCalledWith(1, mockContextProvider, mockTokenResponse, {
                isRefresh: true,
            });
            // Verify tracking consent is set in the updater
            const updaterFn = mockUpdateAuth.mock.calls[1][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ userType: 'guest', trackingConsent: TrackingConsent.Accepted });
            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(200);
            const json = await response.json();
            expect(json).toEqual({
                success: true,
                trackingConsent: TrackingConsent.Accepted,
            });
        });

        it('should successfully update tracking consent to Declined', async () => {
            mockGetAuth.mockReturnValue({ userType: 'registered', refreshToken: 'test-refresh-token' } as never);
            mockRefreshAccessToken.mockResolvedValue(mockTokenResponse);

            const response = await action(createActionArgs(TrackingConsent.Declined));

            expect(mockRefreshAccessToken).toHaveBeenCalledWith(mockContextProvider, 'test-refresh-token', {
                trackingConsent: TrackingConsent.Declined,
            });
            // Verify tracking consent is set in the updater
            const updaterFn = mockUpdateAuth.mock.calls[1][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ userType: 'registered', trackingConsent: TrackingConsent.Declined });
            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(200);
            const json = await response.json();
            expect(json).toEqual({
                success: true,
                trackingConsent: TrackingConsent.Declined,
            });
        });
    });

    describe('error handling', () => {
        it('should return structured error when tracking consent feature is disabled', async () => {
            mockIsTrackingConsentEnabled.mockReturnValue(false);

            const response = await action(createActionArgs(TrackingConsent.Accepted));

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(400);
            const json = await response.json();
            expect(json.success).toBe(false);
            expect(json.error.message).toBe('Tracking consent feature is not enabled');

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockUpdateAuth).not.toHaveBeenCalled();
        });

        it('should return structured error when trackingConsent value is invalid', async () => {
            const response = await action(createActionArgs('invalid-value'));

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(400);
            const json = await response.json();
            expect(json.success).toBe(false);
            expect(json.error.message).toBe('Invalid tracking consent value. Must be "0" (accepted) or "1" (declined)');

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockUpdateAuth).not.toHaveBeenCalled();
        });

        it('should update tracking consent without refresh when no refresh token', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' } as never); // No refreshToken

            const response = await action(createActionArgs(TrackingConsent.Accepted));

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockUpdateAuth).toHaveBeenCalledTimes(1);

            // Verify the session updater sets trackingConsent
            const updaterFn = mockUpdateAuth.mock.calls[0][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ trackingConsent: TrackingConsent.Accepted });

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(200);
            const json = await response.json();
            expect(json).toEqual({
                success: true,
                trackingConsent: TrackingConsent.Accepted,
            });
        });

        it('should call updateAuth only once when no refresh token', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' } as never); // No refreshToken

            await action(createActionArgs(TrackingConsent.Declined));

            expect(mockUpdateAuth).toHaveBeenCalledTimes(1);
        });

        it('should catch refresh token error and still update session', async () => {
            const mockError = new Error('Token refresh failed');
            mockRefreshAccessToken.mockRejectedValue(mockError);

            const response = await action(createActionArgs(TrackingConsent.Accepted));

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(200);
            const json = await response.json();
            expect(json).toEqual({ success: true, trackingConsent: TrackingConsent.Accepted });
            expect(mockUpdateAuth).toHaveBeenCalledTimes(1);
        });
    });

    describe('userType preservation', () => {
        it('should preserve guest userType after update', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest', refreshToken: 'test-refresh-token' } as never);
            mockRefreshAccessToken.mockResolvedValue(mockTokenResponse);

            await action(createActionArgs(TrackingConsent.Accepted));

            const updaterFn = mockUpdateAuth.mock.calls[1][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ userType: 'guest', trackingConsent: TrackingConsent.Accepted });
        });

        it('should preserve registered userType after update', async () => {
            mockGetAuth.mockReturnValue({ userType: 'registered', refreshToken: 'test-refresh-token' } as never);
            mockRefreshAccessToken.mockResolvedValue(mockTokenResponse);

            await action(createActionArgs(TrackingConsent.Declined));

            const updaterFn = mockUpdateAuth.mock.calls[1][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ userType: 'registered', trackingConsent: TrackingConsent.Declined });
        });

        it('should default to guest userType if not present', async () => {
            mockGetAuth.mockReturnValue({ refreshToken: 'test-refresh-token' } as never); // No userType
            mockRefreshAccessToken.mockResolvedValue(mockTokenResponse);

            await action(createActionArgs(TrackingConsent.Accepted));

            const updaterFn = mockUpdateAuth.mock.calls[1][1] as (session: unknown) => unknown;
            const updatedSession = updaterFn({});
            expect(updatedSession).toEqual({ userType: 'guest', trackingConsent: TrackingConsent.Accepted });
        });
    });
});
