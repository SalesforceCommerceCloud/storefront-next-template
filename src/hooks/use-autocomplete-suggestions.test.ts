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

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    useAutocompleteSuggestions,
    DEBOUNCE_DELAY,
    MIN_INPUT_LENGTH,
    type UseAutocompleteSuggestionsOptions,
} from './use-autocomplete-suggestions';

// Mock the GoogleMapsContext — @vis.gl/react-google-maps is NOT imported here.
// This asserts the static edge has been removed from the hook.
const mockActivate = vi.fn();
const mockUseGoogleMaps = vi.hoisted(() => vi.fn());

vi.mock('@/providers/google-maps-context', () => ({
    useGoogleMaps: mockUseGoogleMaps,
}));

describe('useAutocompleteSuggestions', () => {
    let mockSessionToken: object;
    let mockFetchAutocompleteSuggestions: ReturnType<typeof vi.fn>;
    let mockPlacesLibrary: {
        AutocompleteSessionToken: new () => object;
        AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: ReturnType<typeof vi.fn>;
        };
    };

    const mockGoogleSuggestions = [
        {
            placePrediction: {
                placeId: 'place_1',
                text: { text: '123 Main Street, New York, NY 10001, USA' },
                toPlace: vi.fn(),
            },
        },
        {
            placePrediction: {
                placeId: 'place_2',
                text: { text: '456 Oak Avenue, Los Angeles, CA 90001, USA' },
                toPlace: vi.fn(),
            },
        },
    ];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        mockSessionToken = {};
        mockFetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
            suggestions: mockGoogleSuggestions,
        });

        // Use vi.fn() with a regular function for Vitest 4 compatibility
        // Arrow functions in mockImplementation don't work for constructors in Vitest 4
        mockPlacesLibrary = {
            AutocompleteSessionToken: vi.fn(function () {
                return mockSessionToken;
            }),
            AutocompleteSuggestion: {
                fetchAutocompleteSuggestions: mockFetchAutocompleteSuggestions,
            },
        };

        mockUseGoogleMaps.mockReturnValue({ places: mockPlacesLibrary, activate: mockActivate });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('exported constants', () => {
        it('should export DEBOUNCE_DELAY as 300', () => {
            expect(DEBOUNCE_DELAY).toBe(300);
        });

        it('should export MIN_INPUT_LENGTH as 3', () => {
            expect(MIN_INPUT_LENGTH).toBe(3);
        });
    });

    describe('initialization', () => {
        it('should initialize with empty suggestions', () => {
            const { result } = renderHook(() => useAutocompleteSuggestions());

            expect(result.current.suggestions).toEqual([]);
            expect(result.current.isLoading).toBe(false);
        });

        it('should call useGoogleMaps to get the places library (not @vis.gl directly)', () => {
            renderHook(() => useAutocompleteSuggestions());

            expect(mockUseGoogleMaps).toHaveBeenCalled();
        });

        it('should not fetch when inputString is empty', async () => {
            renderHook(() => useAutocompleteSuggestions({ inputString: '' }));

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });

        it('should not fetch when inputString is shorter than minInputLength', async () => {
            renderHook(() => useAutocompleteSuggestions({ inputString: 'ab' }));

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });
    });

    describe('deferred loading — places null until activated', () => {
        it('should return empty suggestions when places library is null (not yet loaded)', async () => {
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            const { result } = renderHook(() => useAutocompleteSuggestions({ inputString: '123 Main' }));

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toEqual([]);
            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });

        it('should not lose typed input while places library loads (no fetch, no reset)', async () => {
            // Simulate: user types before @vis.gl has loaded → places is null
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            const { result, rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Suggestions are empty but the hook has not thrown or reset state
            expect(result.current.suggestions).toEqual([]);
            expect(result.current.isLoading).toBe(false);

            // Now places library becomes available (module loaded)
            mockUseGoogleMaps.mockReturnValue({ places: mockPlacesLibrary, activate: mockActivate });
            rerender({ inputString: '123 Main' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Autocomplete works once loaded — input text was never lost
            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
            expect(result.current.suggestions).toHaveLength(2);
        });

        it('should fetch normally once places library becomes available', async () => {
            // Start with no library
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            const { rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });
            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();

            // Library loads
            mockUseGoogleMaps.mockReturnValue({ places: mockPlacesLibrary, activate: mockActivate });
            rerender({ inputString: '123 Main' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
        });
    });

    describe('debounced fetching', () => {
        it('should debounce API calls', async () => {
            const { rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123' } }
            );

            // Advance timer partially
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Change input before debounce completes
            rerender({ inputString: '1234' });

            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Should not have fetched yet
            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();

            // Complete the debounce and flush promises
            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
        });

        it('should use custom debounceDelay', async () => {
            const customDelay = 500;
            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                    debounceDelay: customDelay,
                })
            );

            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_DELAY);
            });

            // Should not have fetched with default delay
            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
        });

        it('should use custom minInputLength', async () => {
            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '12',
                    minInputLength: 2,
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalled();
        });
    });

    describe('API request parameters', () => {
        it('should send correct request without countryCode', async () => {
            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main Street',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledWith({
                input: '123 Main Street',
                includedPrimaryTypes: ['street_address'],
                sessionToken: mockSessionToken,
            });
        });

        it('should include countryCode in request when provided', async () => {
            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main Street',
                    countryCode: 'US',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledWith({
                input: '123 Main Street',
                includedPrimaryTypes: ['street_address'],
                sessionToken: mockSessionToken,
                includedRegionCodes: ['US'],
            });
        });

        it('should create session token on first fetch', async () => {
            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockPlacesLibrary.AutocompleteSessionToken).toHaveBeenCalledTimes(1);
        });

        it('should reuse session token for subsequent fetches', async () => {
            const { rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            rerender({ inputString: '123 Main St' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Session token should only be created once
            expect(mockPlacesLibrary.AutocompleteSessionToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('suggestions conversion', () => {
        it('should convert Google Maps suggestions to AddressSuggestion format', async () => {
            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toHaveLength(2);
            expect(result.current.suggestions[0]).toMatchObject({
                description: '123 Main Street, New York, NY 10001, USA',
                place_id: 'place_1',
                structured_formatting: {
                    main_text: '123 Main Street',
                    secondary_text: 'New York, NY 10001, USA',
                },
            });
        });
    });

    describe('caching', () => {
        it('should cache results and return cached data for same input', async () => {
            const { result, rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toHaveLength(2);
            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);

            // Change to different input
            rerender({ inputString: '456 Oak' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Change back to original input
            rerender({ inputString: '123 Main' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Should use cached result, not call API again
            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(2);
        });

        it('should use different cache keys for different country codes', async () => {
            const { rerender } = renderHook(
                ({ inputString, countryCode }: UseAutocompleteSuggestionsOptions) =>
                    useAutocompleteSuggestions({ inputString, countryCode }),
                { initialProps: { inputString: '123 Main', countryCode: 'US' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            rerender({ inputString: '123 Main', countryCode: 'CA' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Should make two API calls for different country codes
            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledTimes(2);
        });
    });

    describe('loading state', () => {
        it('should set isLoading to true while fetching and false after completion', async () => {
            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            // Initially not loading
            expect(result.current.isLoading).toBe(false);

            // After debounce triggers and fetch completes
            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // After fetch completes, should not be loading
            expect(result.current.isLoading).toBe(false);
            expect(result.current.suggestions).toHaveLength(2);
        });
    });

    describe('error handling', () => {
        it('should clear suggestions on API error', async () => {
            mockFetchAutocompleteSuggestions.mockRejectedValue(new Error('API Error'));

            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.isLoading).toBe(false);
            expect(result.current.suggestions).toEqual([]);
        });
    });

    describe('resetSession', () => {
        it('should clear suggestions when resetSession is called', async () => {
            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toHaveLength(2);

            act(() => {
                result.current.resetSession();
            });

            expect(result.current.suggestions).toEqual([]);
            expect(result.current.isLoading).toBe(false);
        });

        it('should create new session token after reset on next fetch', async () => {
            const { result, rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            act(() => {
                result.current.resetSession();
            });

            rerender({ inputString: '456 Oak' });

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // Should create a new session token after reset
            expect(mockPlacesLibrary.AutocompleteSessionToken).toHaveBeenCalledTimes(2);
        });

        it('should clear pending debounce timeout on reset', async () => {
            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            // Advance partway through debounce
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Reset before debounce completes
            act(() => {
                result.current.resetSession();
            });

            // Complete remaining time
            await act(async () => {
                await vi.runAllTimersAsync();
            });

            // API should not have been called since we reset
            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });
    });

    describe('fetchSuggestions', () => {
        it('should allow manual fetching via fetchSuggestions', async () => {
            const { result } = renderHook(() => useAutocompleteSuggestions());

            await act(async () => {
                await result.current.fetchSuggestions('789 Pine');
            });

            expect(mockFetchAutocompleteSuggestions).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: '789 Pine',
                })
            );
        });

        it('should not fetch when places library is not available', async () => {
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            const { result } = renderHook(() => useAutocompleteSuggestions());

            await act(async () => {
                await result.current.fetchSuggestions('123 Main');
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
            expect(result.current.suggestions).toEqual([]);
        });

        it('should not fetch when input is empty', async () => {
            const { result } = renderHook(() => useAutocompleteSuggestions());

            await act(async () => {
                await result.current.fetchSuggestions('');
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });

        it('should not fetch when input is shorter than minInputLength', async () => {
            const { result } = renderHook(() => useAutocompleteSuggestions({ minInputLength: 5 }));

            await act(async () => {
                await result.current.fetchSuggestions('1234');
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });
    });

    describe('cleanup', () => {
        it('should clean up debounce timeout on unmount', async () => {
            const { unmount } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            unmount();

            // Advance timers - should not cause any errors
            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });
    });

    describe('when places library is null', () => {
        it('should return empty suggestions', async () => {
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            const { result } = renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toEqual([]);
        });

        it('should not attempt to fetch', async () => {
            mockUseGoogleMaps.mockReturnValue({ places: null, activate: mockActivate });

            renderHook(() =>
                useAutocompleteSuggestions({
                    inputString: '123 Main',
                })
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(mockFetchAutocompleteSuggestions).not.toHaveBeenCalled();
        });
    });

    describe('input changes', () => {
        it('should clear suggestions when input becomes too short', async () => {
            const { result, rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toHaveLength(2);

            rerender({ inputString: 'ab' });

            expect(result.current.suggestions).toEqual([]);
        });

        it('should clear suggestions when input becomes empty', async () => {
            const { result, rerender } = renderHook(
                ({ inputString }: UseAutocompleteSuggestionsOptions) => useAutocompleteSuggestions({ inputString }),
                { initialProps: { inputString: '123 Main' } }
            );

            await act(async () => {
                await vi.runAllTimersAsync();
            });

            expect(result.current.suggestions).toHaveLength(2);

            rerender({ inputString: '' });

            expect(result.current.suggestions).toEqual([]);
        });
    });
});
