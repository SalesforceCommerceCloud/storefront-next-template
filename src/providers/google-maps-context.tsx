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
import { createContext, useContext } from 'react';
import type { GoogleMapsSuggestion } from '@/lib/address/address-suggestions';

/**
 * Minimal Google Maps Places library interface.
 * Mirrors the subset of the Places New API used by useAutocompleteSuggestions.
 */
export interface PlacesLibrary {
    AutocompleteSessionToken: new () => object;
    AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: (request: {
            input: string;
            includedPrimaryTypes: string[];
            sessionToken: object;
            includedRegionCodes?: string[];
        }) => Promise<{ suggestions: GoogleMapsSuggestion[] }>;
    };
}

interface GoogleMapsContextValue {
    /**
     * Loaded Google Maps Places library, or null while the API is not yet
     * initialized (either no key configured, or activate() not yet called).
     */
    places: PlacesLibrary | null;
    /**
     * Trigger deferred loading of the Google Maps API.
     * No-op when no API key is configured.
     * Safe to call multiple times; loading only happens once.
     */
    activate: () => void;
}

const defaultContextValue: GoogleMapsContextValue = {
    places: null,
    // no-op default: safe to call from components that are not inside a provider
    activate: () => undefined,
};

export const GoogleMapsContext = createContext<GoogleMapsContextValue>(defaultContextValue);

/**
 * Read the deferred Google Maps context value.
 *
 * Returns `{ places: null, activate: noop }` when called outside a
 * GoogleCloudApiProvider (e.g. in Storybook stories or tests that don't need Maps).
 */
export function useGoogleMaps(): GoogleMapsContextValue {
    return useContext(GoogleMapsContext);
}
