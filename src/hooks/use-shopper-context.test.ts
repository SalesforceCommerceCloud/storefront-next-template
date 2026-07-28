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
import { renderHook, act } from '@testing-library/react';
import { useShopperContext } from './use-shopper-context';
import { resourceRoutes } from '@/route-paths';
import type { UpdateShopperContextResponse } from '@/routes/action.update-shopper-context';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';

// Mock React Router's useFetcher
const mockSubmit = vi.fn();
const createMockFetcher = () => ({
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: null as UpdateShopperContextResponse | null,
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

describe('useShopperContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher = createMockFetcher();
        mockSubmit.mockResolvedValue(undefined);
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initial state', () => {
        it('should return initial state with idle fetcher', () => {
            const { result } = renderHook(() => useShopperContext());

            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBe(null);
            expect(result.current.success).toBe(false);
            expect(typeof result.current.updateQualifiers).toBe('function');
        });
    });

    describe('updateQualifiers', () => {
        it('should call fetcher.submit with correct FormData and options', async () => {
            const { result } = renderHook(() => useShopperContext());

            const qualifiers = {
                device: 'mobile',
                channel: 'web',
            };

            await act(async () => {
                await result.current.updateQualifiers(qualifiers);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData, options] = mockSubmit.mock.calls[0];

            // Verify FormData contains correct JSON stringified qualifiers
            expect(formData).toBeInstanceOf(FormData);
            expect(formData.get('qualifiers')).toBe(JSON.stringify(qualifiers));
            // Action uses extractQualifiersFromInput to separate qualifiers, so only 'qualifiers' is sent
            expect(formData.get('sourceCodeQualifiers')).toBeNull();

            // Verify options
            expect(options).toEqual({
                method: 'PUT',
                action: resourceRoutes.updateShopperContext,
            });
        });

        it('should handle empty qualifiers object (not added to FormData)', async () => {
            const { result } = renderHook(() => useShopperContext());

            const qualifiers = {};

            await act(async () => {
                await result.current.updateQualifiers(qualifiers);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];
            // Empty objects are not added to FormData
            expect(formData.get('qualifiers')).toBeNull();
            expect(formData.get('sourceCodeQualifiers')).toBeNull();
        });

        it('should handle qualifiers with multiple properties', async () => {
            const { result } = renderHook(() => useShopperContext());

            const qualifiers = {
                device: 'mobile',
                channel: 'web',
                store: '123',
                region: 'US',
            };

            await act(async () => {
                await result.current.updateQualifiers(qualifiers);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];
            expect(formData.get('qualifiers')).toBe(JSON.stringify(qualifiers));
            expect(formData.get('sourceCodeQualifiers')).toBeNull();
        });

        it('should handle sourceCode in qualifiers', async () => {
            const { result } = renderHook(() => useShopperContext());

            const qualifiers = {
                sourceCode: 'promo123',
            };

            await act(async () => {
                await result.current.updateQualifiers(qualifiers);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];
            // sourceCode can be included in qualifiers object
            expect(formData.get('qualifiers')).toBe(JSON.stringify(qualifiers));
            expect(formData.get('sourceCodeQualifiers')).toBeNull();
        });

        it('should handle qualifiers with sourceCode and other qualifiers', async () => {
            const { result } = renderHook(() => useShopperContext());

            const qualifiers = {
                device: 'mobile',
                channel: 'web',
                sourceCode: 'promo123',
            };

            await act(async () => {
                await result.current.updateQualifiers(qualifiers);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];
            // All qualifiers including sourceCode are sent together
            expect(formData.get('qualifiers')).toBe(JSON.stringify(qualifiers));
            expect(formData.get('sourceCodeQualifiers')).toBeNull();
        });

        it('should not include empty qualifiers in FormData', async () => {
            const { result } = renderHook(() => useShopperContext());

            await act(async () => {
                await result.current.updateQualifiers({});
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];
            expect(formData.get('qualifiers')).toBeNull();
            expect(formData.get('sourceCodeQualifiers')).toBeNull();
        });

        it('should always use PUT method', async () => {
            const { result } = renderHook(() => useShopperContext());

            await act(async () => {
                await result.current.updateQualifiers({ device: 'mobile' });
            });

            const [, options] = mockSubmit.mock.calls[0];
            expect(options.method).toBe('PUT');
        });

        it('should use correct action path', async () => {
            const { result } = renderHook(() => useShopperContext());

            await act(async () => {
                await result.current.updateQualifiers({ device: 'mobile' });
            });

            const [, options] = mockSubmit.mock.calls[0];
            expect(options.action).toBe(resourceRoutes.updateShopperContext);
        });
    });

    describe('loading state', () => {
        it('should return isLoading true when fetcher state is submitting', () => {
            mockFetcher.state = 'submitting';

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.isLoading).toBe(true);
        });

        it('should return isLoading true when fetcher state is loading', () => {
            mockFetcher.state = 'loading';

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.isLoading).toBe(true);
        });

        it('should return isLoading false when fetcher state is idle', () => {
            mockFetcher.state = 'idle';

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('success state', () => {
        it('should return success true when fetcher data has success: true', () => {
            mockFetcher.data = {
                success: true,
                message: 'Updated successfully',
            };

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.success).toBe(true);
            expect(result.current.error).toBe(null);
        });

        it('should return success false when fetcher data has success: false', () => {
            mockFetcher.data = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Update failed' },
            };

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.success).toBe(false);
        });

        it('should return success false when fetcher data is null', () => {
            mockFetcher.data = null;

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.success).toBe(false);
        });
    });

    describe('error state', () => {
        it('should return error when fetcher data has success: false with error message', () => {
            mockFetcher.data = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'USID is not available' },
            };

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.error).toBeInstanceOf(Error);
            expect(result.current.error?.message).toBe('USID is not available');
        });

        it('should return error with default message when error is undefined', () => {
            mockFetcher.data = {
                success: false,
            };

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.error).toBeInstanceOf(Error);
            expect(result.current.error?.message).toBe('Unknown error');
        });

        it('should return null error when fetcher data has success: true', () => {
            mockFetcher.data = {
                success: true,
                message: 'Updated successfully',
            };

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.error).toBe(null);
        });

        it('should return null error when fetcher data is null', () => {
            mockFetcher.data = null;

            const { result } = renderHook(() => useShopperContext());

            expect(result.current.error).toBe(null);
        });
    });

    describe('state transitions', () => {
        it('should update loading state when fetcher state changes', () => {
            const { result, rerender } = renderHook(() => useShopperContext());

            expect(result.current.isLoading).toBe(false);

            mockFetcher.state = 'submitting';
            rerender();

            expect(result.current.isLoading).toBe(true);

            mockFetcher.state = 'idle';
            rerender();

            expect(result.current.isLoading).toBe(false);
        });

        it('should update success and error states when fetcher data changes', () => {
            const { result, rerender } = renderHook(() => useShopperContext());

            expect(result.current.success).toBe(false);
            expect(result.current.error).toBe(null);

            mockFetcher.data = {
                success: true,
                message: 'Updated successfully',
            };
            rerender();

            expect(result.current.success).toBe(true);
            expect(result.current.error).toBe(null);

            mockFetcher.data = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Update failed' },
            };
            rerender();

            expect(result.current.success).toBe(false);
            expect(result.current.error).toBeInstanceOf(Error);
            expect(result.current.error?.message).toBe('Update failed');
        });
    });

    describe('updateQualifiers callback stability', () => {
        it('should maintain the same function reference when fetcher does not change', () => {
            const { result, rerender } = renderHook(() => useShopperContext());

            const firstReference = result.current.updateQualifiers;

            rerender();

            const secondReference = result.current.updateQualifiers;

            expect(firstReference).toBe(secondReference);
        });
    });
});
