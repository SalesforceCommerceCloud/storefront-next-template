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
import { type PropsWithChildren, useState, useCallback, useRef, type ComponentType } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { GoogleMapsContext, type PlacesLibrary } from './google-maps-context';
import type { MapsLibraryBridge as MapsLibraryBridgeType } from './google-maps-bridge';

type ApiProviderComponent = ComponentType<{ apiKey: string; children?: React.ReactNode }>;
type MapsLibraryBridgeComponent = typeof MapsLibraryBridgeType;

interface VisMod {
    APIProvider: ApiProviderComponent;
    MapsLibraryBridge: MapsLibraryBridgeComponent;
}

type GoogleCloudApiProviderProps = PropsWithChildren<{
    /**
     * OOTB Google Cloud API key sourced from the MRT data store (`gcp` / `api-key` entry),
     * supplied by the consuming route's loader. Only populated for storefronts connecting to
     * production ECOM instances.
     */
    apiKey?: string;
}>;

/**
 * Resolve the Google Cloud API key.
 *
 * Priority:
 * 1. Merchant-provided key from PUBLIC__app__features__googleCloudAPI__apiKey
 *    (surfaced via `useConfig()`).
 * 2. OOTB key sourced from the MRT data store, passed in by the consuming route's loader.
 *
 * @param dataStoreApiKey - OOTB key from the route loader (data store `gcp` entry)
 * @returns The resolved Google Cloud API key, or an empty string when neither source is available.
 */
function useGoogleCloudAPIKey(dataStoreApiKey?: string): string {
    const config = useConfig();
    return config.features.googleCloudAPI.apiKey || dataStoreApiKey || '';
}

/**
 * Provider component that defers Google Maps API loading until autocomplete is needed.
 *
 * Design goals:
 * - @vis.gl/react-google-maps is NOT on the initial checkout static graph.
 *   It is dynamically imported only after `activate()` is called (triggered by
 *   address field focus in AddressFormFields).
 * - Children are never remounted. The @vis.gl APIProvider is rendered as a sibling
 *   subtree (not as a parent), and a MapsLibraryBridge inside that sibling forwards
 *   the loaded `places` library into GoogleMapsContext.
 * - When no API key is configured, activate() is a no-op and places stays null.
 *
 * @example
 * ```tsx
 * <GoogleCloudApiProvider apiKey={loaderData.gcpApiKey}>
 *   <CheckoutFormPage />
 * </GoogleCloudApiProvider>
 * ```
 */
export default function GoogleCloudApiProvider({ apiKey, children }: GoogleCloudApiProviderProps) {
    const googleCloudAPIKey = useGoogleCloudAPIKey(apiKey);
    const [places, setPlaces] = useState<PlacesLibrary | null>(null);
    const [visMod, setVisMod] = useState<VisMod | null>(null);
    const activatedRef = useRef(false);

    const activate = useCallback(() => {
        if (!googleCloudAPIKey || activatedRef.current) return;
        activatedRef.current = true;

        // Dynamic import keeps @vis.gl off the initial checkout bundle.
        // Reset the ref on rejection so a later focus can retry.
        import('./google-maps-bridge')
            .then((mod) => {
                setVisMod({
                    APIProvider: mod.APIProvider,
                    MapsLibraryBridge: mod.MapsLibraryBridge,
                });
            })
            .catch(() => {
                activatedRef.current = false;
            });
    }, [googleCloudAPIKey]);

    return (
        <GoogleMapsContext.Provider value={{ places, activate }}>
            {/*
             * APIProvider lives here as a sibling, NOT as a parent of {children}.
             * This prevents any remount when the module loads: {children} are
             * always at the same position in the React tree.
             */}
            {visMod && (
                <visMod.APIProvider apiKey={googleCloudAPIKey}>
                    <visMod.MapsLibraryBridge onLoad={setPlaces} />
                </visMod.APIProvider>
            )}
            {children}
        </GoogleMapsContext.Provider>
    );
}
