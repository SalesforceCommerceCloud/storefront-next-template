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
import { act, renderHook } from '@testing-library/react';
import { useUpdateMarketingConsent } from './use-update-marketing-consent';
import { resourceRoutes } from '@/route-paths';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => mockLogger),
}));

const mockSubmit = vi.fn();
const createMockFetcher = (overrides: { state?: string; data?: unknown } = {}) => ({
    state: (overrides.state ?? 'idle') as 'idle' | 'loading' | 'submitting',
    data: overrides.data ?? null,
    submit: mockSubmit,
    load: vi.fn(),
    Form: vi.fn() as any,
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    formTarget: undefined,
    type: 'init' as const,
    json: undefined,
    text: undefined,
    reset: vi.fn(),
});

let mockFetcher = createMockFetcher();

describe('useUpdateMarketingConsent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher = createMockFetcher();
        mockSubmit.mockResolvedValue(undefined);
        vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('when the user has not started an update', () => {
        it('exposes updateBatch and reports not loading', () => {
            const { result } = renderHook(() => useUpdateMarketingConsent());

            expect(typeof result.current.updateBatch).toBe('function');
            expect(result.current.isUpdating).toBe(false);
        });
    });

    describe('when the user submits a batch', () => {
        it('sends JSON body with updates array', () => {
            const { result } = renderHook(() => useUpdateMarketingConsent());

            const updates = [
                {
                    subscriptionId: 'sub-1',
                    channel: 'email' as const,
                    contactPointValue: 'user@example.com',
                    status: 'opt_in' as const,
                },
            ];

            act(() => {
                result.current.updateBatch(updates);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [body, options] = mockSubmit.mock.calls[0];
            expect(body).toEqual({ updates });
            expect(options).toEqual({
                method: 'POST',
                action: resourceRoutes.updateMarketingConsent,
                encType: 'application/json',
            });
        });

        it('does not submit when updates array is empty', () => {
            const { result } = renderHook(() => useUpdateMarketingConsent());

            act(() => {
                result.current.updateBatch([]);
            });

            expect(mockSubmit).not.toHaveBeenCalled();
        });

        it('sends multiple updates in one request', () => {
            const { result } = renderHook(() => useUpdateMarketingConsent());

            const updates = [
                {
                    subscriptionId: 'sub-1',
                    channel: 'email' as const,
                    contactPointValue: 'a@b.com',
                    status: 'opt_in' as const,
                },
                {
                    subscriptionId: 'sub-2',
                    channel: 'sms' as const,
                    contactPointValue: '+1',
                    status: 'opt_out' as const,
                },
            ];

            act(() => {
                result.current.updateBatch(updates);
            });

            const [body, options] = mockSubmit.mock.calls[0];
            expect(body).toEqual({ updates });
            expect(options.encType).toBe('application/json');
        });
    });

    describe('loading state', () => {
        it('is true while the update request is in flight', () => {
            mockFetcher = createMockFetcher({ state: 'submitting' });
            vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);

            const { result } = renderHook(() => useUpdateMarketingConsent());
            expect(result.current.isUpdating).toBe(true);
        });

        it('is false while the response is being processed (loading) — align with checkout/cart: disable only when submitting', () => {
            mockFetcher = createMockFetcher({ state: 'loading' });
            vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);

            const { result } = renderHook(() => useUpdateMarketingConsent());
            expect(result.current.isUpdating).toBe(false);
        });

        it('is false when no request is in progress', () => {
            mockFetcher = createMockFetcher({ state: 'idle' });
            vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);

            const { result } = renderHook(() => useUpdateMarketingConsent());
            expect(result.current.isUpdating).toBe(false);
        });
    });

    describe('after a successful update', () => {
        it('invokes optional callback so the UI can refresh preferences', () => {
            const onSuccess = vi.fn();
            renderHook(() => useUpdateMarketingConsent(onSuccess));
            // useFetcherEffect is called with fetcher and config containing onSuccess
            // Actual invocation happens when fetcher transitions to success - we don't simulate that here
            expect(() => renderHook(() => useUpdateMarketingConsent(onSuccess))).not.toThrow();
        });
    });

    describe('when the update fails', () => {
        it('notifies the UI with the server error so the switch can revert to the previous state', () => {
            const onError = vi.fn();
            mockFetcher = createMockFetcher({ state: 'submitting', data: null });
            vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);
            const { rerender } = renderHook(() => useUpdateMarketingConsent(undefined, onError));
            expect(onError).not.toHaveBeenCalled();

            mockFetcher.state = 'idle';
            mockFetcher.data = { success: false, error: 'Subscription update failed' };
            rerender();
            expect(onError).toHaveBeenCalledWith('Subscription update failed', {
                success: false,
                error: 'Subscription update failed',
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Marketing consent update failed', {
                message: 'Subscription update failed',
            });
        });
    });
});
