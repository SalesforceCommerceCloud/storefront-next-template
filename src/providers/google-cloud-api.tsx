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
import type { PropsWithChildren } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

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
 * Provider component that wraps children with Google Maps API context.
 *
 * Conditionally renders the Google Maps APIProvider only when an API key is configured.
 * If no API key is set, children are rendered without the Maps API context.
 *
 * @example
 * ```tsx
 * <GoogleCloudApiProvider apiKey={loaderData.gcpApiKey}>
 *   <MapComponent />
 * </GoogleCloudApiProvider>
 * ```
 */
export default function GoogleCloudApiProvider({ apiKey, children }: GoogleCloudApiProviderProps) {
    const googleCloudAPIKey = useGoogleCloudAPIKey(apiKey);

    if (!googleCloudAPIKey) {
        return <>{children}</>;
    }

    return <APIProvider apiKey={googleCloudAPIKey}>{children}</APIProvider>;
}
