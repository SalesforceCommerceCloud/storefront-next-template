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

import { useState, useRef, useCallback, useEffect } from 'react';
import { useGoogleMaps } from '@/providers/google-maps-context';
import { convertGoogleMapsSuggestions } from '@/lib/address/address-suggestions';
import type { AddressSuggestion } from '@/components/address-suggestion-dropdown';

export const DEBOUNCE_DELAY = 300;
export const MIN_INPUT_LENGTH = 3;

/**
 * Options for the autocomplete suggestions hook
 */
export interface UseAutocompleteSuggestionsOptions {
    /** The input string to search for */
    inputString?: string;
    /** Country code to filter results (e.g., 'US', 'CA') */
    countryCode?: string;
    /** Minimum input length before triggering search (default: 3) */
    minInputLength?: number;
    /** Debounce delay in milliseconds (default: 300) */
    debounceDelay?: number;
}

/**
 * Return type for the autocomplete suggestions hook
 */
export interface UseAutocompleteSuggestionsResult {
    /** Array of address suggestions */
    suggestions: AddressSuggestion[];
    /** Whether suggestions are currently being fetched */
    isLoading: boolean;
    /** Reset the session token and clear suggestions */
    resetSession: () => void;
    /** Manually trigger fetching suggestions for an input */
    fetchSuggestions: (input: string) => Promise<void>;
}

interface AutocompleteRequest {
    input: string;
    includedPrimaryTypes: string[];
    sessionToken: object;
    includedRegionCodes?: string[];
}

/**
 * Custom hook for Google Maps Places autocomplete suggestions.
 *
 * Reads the Places library from GoogleMapsContext (provided by GoogleCloudApiProvider).
 * The @vis.gl/react-google-maps package is NOT imported here — it is loaded lazily
 * via a dynamic import triggered by address field focus.
 *
 * Returns empty suggestions when the Maps API is not yet loaded or when no API key
 * is configured, so the form remains fully usable without autocomplete.
 *
 * @param options - Hook configuration options
 * @returns Object containing suggestions, loading state, and control functions
 *
 * @example
 * ```tsx
 * const { suggestions, isLoading, resetSession } = useAutocompleteSuggestions({
 *   inputString: addressInput,
 *   countryCode: 'US',
 * });
 * ```
 */
export function useAutocompleteSuggestions({
    inputString = '',
    countryCode = '',
    minInputLength = MIN_INPUT_LENGTH,
    debounceDelay = DEBOUNCE_DELAY,
}: UseAutocompleteSuggestionsOptions = {}): UseAutocompleteSuggestionsResult {
    // Read the places library from GoogleMapsContext — no static @vis.gl import here.
    const { places } = useGoogleMaps();

    const sessionTokenRef = useRef<object | null>(null);
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());

    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Generate a cache key from input and country code
     */
    const getCacheKey = useCallback((input: string, country: string) => {
        return `${input.toLowerCase().trim()}_${country || ''}`;
    }, []);

    /**
     * Fetch address suggestions from Google Maps Places API
     */
    const fetchSuggestions = useCallback(
        async (input: string) => {
            if (!places || !input || input.length < minInputLength) {
                setSuggestions([]);
                return;
            }

            const cacheKey = getCacheKey(input, countryCode);

            // Check cache first
            if (cacheRef.current.has(cacheKey)) {
                const cachedSuggestions = cacheRef.current.get(cacheKey);
                if (cachedSuggestions) {
                    setSuggestions(cachedSuggestions);
                    setIsLoading(false);
                    return;
                }
            }

            setIsLoading(true);

            try {
                const { AutocompleteSessionToken, AutocompleteSuggestion } = places;

                // Create session token if not exists (for billing optimization)
                if (!sessionTokenRef.current) {
                    sessionTokenRef.current = new AutocompleteSessionToken();
                }

                const request: AutocompleteRequest = {
                    input,
                    includedPrimaryTypes: ['street_address'],
                    sessionToken: sessionTokenRef.current,
                };

                if (countryCode) {
                    request.includedRegionCodes = [countryCode];
                }

                const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                const googleSuggestions = convertGoogleMapsSuggestions(response.suggestions);

                // Store in cache for future use
                cacheRef.current.set(cacheKey, googleSuggestions);

                setSuggestions(googleSuggestions);
            } catch {
                // On error, clear suggestions silently
                setSuggestions([]);
            } finally {
                setIsLoading(false);
            }
        },
        [places, countryCode, getCacheKey, minInputLength]
    );

    /**
     * Reset the autocomplete session
     * Should be called after a suggestion is selected to start a new session
     */
    const resetSession = useCallback(() => {
        sessionTokenRef.current = null;
        setSuggestions([]);
        setIsLoading(false);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
    }, []);

    /**
     * Effect to trigger debounced fetch when input changes
     */
    useEffect(() => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        if (!inputString || inputString.length < minInputLength) {
            setSuggestions([]);
            return;
        }

        debounceTimeoutRef.current = setTimeout(() => {
            void fetchSuggestions(inputString);
        }, debounceDelay);

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [inputString, fetchSuggestions, minInputLength, debounceDelay]);

    return {
        suggestions,
        isLoading,
        resetSession,
        fetchSuggestions,
    };
}
